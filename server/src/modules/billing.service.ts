import { Injectable, Logger } from '@nestjs/common';
import { PaymentPlatform, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../common/points.service';
import { env } from '../common/config';
import { apiError } from '../common/util';
import { NotificationService } from './notification.service';

export interface Product {
  productId: string;
  title: string;
  points: number;
  amount: number;
  type: 'POINTS' | 'SUBSCRIPTION';
  periodDays?: number;
}

const DEFAULT_PRODUCTS: Product[] = [
  { productId: 'talktalk_points_1000', title: '포인트 1,000P', points: 1000, amount: 11000, type: 'POINTS' },
  { productId: 'talktalk_points_3000', title: '포인트 3,000P', points: 3000, amount: 33000, type: 'POINTS' },
  { productId: 'talktalk_points_5000', title: '포인트 5,000P', points: 5000, amount: 55000, type: 'POINTS' },
  { productId: 'talktalk_points_10000', title: '포인트 10,000P', points: 10000, amount: 110000, type: 'POINTS' },
  { productId: 'talktalk_plus_monthly', title: '톡톡 플러스 월 구독', points: 2000, amount: 9900, type: 'SUBSCRIPTION', periodDays: 30 },
];

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly notifications: NotificationService,
  ) {}

  async products(): Promise<Product[]> {
    const setting = await this.prisma.adminSetting.findUnique({ where: { key: 'billing.products' } });
    if (setting && Array.isArray(setting.value)) return setting.value as unknown as Product[];
    return DEFAULT_PRODUCTS;
  }

  /**
   * 영수증 검증 + 멱등 지급.
   * 동일 transactionId는 최초 1회만 지급되고 이후 요청은 DUPLICATE로 잔액이 변하지 않는다.
   */
  async verify(
    userId: string,
    input: { platform: string; productId: string; transactionId: string; purchaseToken?: string; receipt?: string },
  ) {
    const platform: PaymentPlatform = input.platform?.toUpperCase() === 'APPLE' ? 'APPLE' : 'GOOGLE';
    if (!input.transactionId) throw apiError(400, 'TRANSACTION_ID_REQUIRED', '영수증 식별자가 필요합니다.');
    if (!input.productId) throw apiError(400, 'PRODUCT_REQUIRED', '상품 정보가 필요합니다.');

    const existing = await this.prisma.payment.findUnique({ where: { transactionId: input.transactionId } });
    if (existing) {
      return {
        status: 'DUPLICATE',
        duplicate: true,
        paymentId: existing.id,
        points: existing.points,
        balance: await this.points.balance(userId),
        message: '이미 처리된 영수증입니다. 포인트는 중복 지급되지 않았습니다.',
      };
    }

    const products = await this.products();
    const product = products.find((p) => p.productId === input.productId);
    if (!product) throw apiError(400, 'UNKNOWN_PRODUCT', '알 수 없는 상품입니다.');

    let payment;
    try {
      payment = await this.prisma.payment.create({
        data: {
          userId,
          platform,
          productId: product.productId,
          transactionId: input.transactionId,
          purchaseToken: input.purchaseToken ?? null,
          points: product.points,
          amount: product.amount,
          status: 'PENDING',
          raw: { receipt: input.receipt ? 'provided' : null } as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return {
          status: 'DUPLICATE',
          duplicate: true,
          points: product.points,
          balance: await this.points.balance(userId),
          message: '이미 처리된 영수증입니다.',
        };
      }
      throw e;
    }

    try {
      await this.verifyWithProvider(platform, product, input);
    } catch (e) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw e;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const balance = await this.points.credit(userId, product.points, 'CHARGE', {
        type: 'payment',
        id: payment.id,
        memo: `${product.title} 구매`,
      }, tx);
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'VERIFIED', verifiedAt: new Date() } });

      if (product.type === 'SUBSCRIPTION') {
        const expiresAt = new Date(Date.now() + (product.periodDays ?? 30) * 24 * 3600 * 1000);
        await tx.subscription.upsert({
          where: { platform_originalTransactionId: { platform, originalTransactionId: input.transactionId } },
          create: {
            userId,
            platform,
            productId: product.productId,
            originalTransactionId: input.transactionId,
            status: 'ACTIVE',
            expiresAt,
          },
          update: { status: 'ACTIVE', expiresAt, restoredAt: new Date() },
        });
      }
      return balance;
    });

    await this.notifications.push(userId, {
      type: 'POINT',
      title: '포인트가 충전되었습니다',
      body: `${product.title} · ${product.points.toLocaleString('ko-KR')}P 지급`,
      data: { paymentId: payment.id },
    });

    return {
      status: 'VERIFIED',
      duplicate: false,
      paymentId: payment.id,
      points: product.points,
      balance: result,
      subscription: product.type === 'SUBSCRIPTION',
    };
  }

  private async verifyWithProvider(
    platform: PaymentPlatform,
    product: Product,
    input: { purchaseToken?: string; receipt?: string; transactionId: string },
  ): Promise<void> {
    if (env.iapProvider === 'mock') {
      const token = `${input.purchaseToken ?? ''}${input.receipt ?? ''}`;
      if (token.includes('mock-fail')) throw apiError(402, 'RECEIPT_INVALID', '영수증 검증에 실패했습니다.');
      return;
    }
    if (platform === 'GOOGLE') {
      await this.verifyGoogle(product, input);
      return;
    }
    await this.verifyApple(input);
  }

  /** Google Play Developer API 검증 (서비스 계정 액세스 토큰 필요) */
  private async verifyGoogle(product: Product, input: { purchaseToken?: string; transactionId: string }): Promise<void> {
    const token = process.env.GOOGLE_PLAY_ACCESS_TOKEN;
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    if (!token || !packageName) {
      throw apiError(503, 'IAP_NOT_CONFIGURED', 'Google Play 결제 검증 설정(GOOGLE_PLAY_ACCESS_TOKEN/PACKAGE_NAME)이 필요합니다.');
    }
    if (!input.purchaseToken) throw apiError(400, 'PURCHASE_TOKEN_REQUIRED', 'purchaseToken이 필요합니다.');
    const url = product.type === 'SUBSCRIPTION'
      ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${product.productId}/tokens/${encodeURIComponent(input.purchaseToken)}`
      : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${product.productId}/tokens/${encodeURIComponent(input.purchaseToken)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      this.logger.warn(`Google Play 검증 실패: ${res.status}`);
      throw apiError(402, 'RECEIPT_INVALID', 'Google Play 영수증 검증에 실패했습니다.');
    }
    const body = (await res.json()) as { purchaseState?: number };
    if (product.type === 'POINTS' && body.purchaseState !== 0) {
      throw apiError(402, 'RECEIPT_INVALID', '결제가 완료된 영수증이 아닙니다.');
    }
  }

  /** Apple App Store 영수증 검증 (운영 → 실패 시 샌드박스) */
  private async verifyApple(input: { receipt?: string }): Promise<void> {
    if (!input.receipt) throw apiError(400, 'RECEIPT_REQUIRED', '영수증 데이터가 필요합니다.');
    const payload = {
      'receipt-data': input.receipt,
      password: process.env.APPLE_SHARED_SECRET ?? '',
      'exclude-old-transactions': false,
    };
    const endpoints = ['https://buy.itunes.apple.com/verifyReceipt', 'https://sandbox.itunes.apple.com/verifyReceipt'];
    for (const endpoint of endpoints) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { status?: number };
      if (body.status === 21007) continue; // 샌드박스 재시도
      if (body.status !== 0) throw apiError(402, 'RECEIPT_INVALID', 'App Store 영수증 검증에 실패했습니다.');
      return;
    }
    throw apiError(503, 'IAP_NOT_CONFIGURED', 'App Store 영수증 검증을 완료하지 못했습니다.');
  }

  async restore(userId: string) {
    const now = new Date();
    const subscriptions = await this.prisma.subscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const active = subscriptions.filter((s) => s.status === 'ACTIVE' && s.expiresAt > now);
    if (subscriptions.length > 0) {
      await this.prisma.subscription.updateMany({
        where: { userId, status: 'ACTIVE', expiresAt: { lt: now } },
        data: { status: 'EXPIRED' },
      });
    }
    return {
      restored: active.length,
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        productId: s.productId,
        platform: s.platform,
        status: s.expiresAt > now ? s.status : ('EXPIRED' as SubscriptionStatus),
        expiresAt: s.expiresAt.toISOString(),
      })),
    };
  }

  async subscription(userId: string) {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return { active: false, subscription: null };
    return {
      active: sub.status === 'ACTIVE' && sub.expiresAt > now,
      subscription: {
        productId: sub.productId,
        platform: sub.platform,
        status: sub.expiresAt > now ? sub.status : 'EXPIRED',
        expiresAt: sub.expiresAt.toISOString(),
      },
    };
  }

  async payments(userId: string) {
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }
}
