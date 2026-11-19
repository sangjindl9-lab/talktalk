import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../common/points.service';
import { apiError } from '../common/util';

/**
 * 유료 상단 고정: 포인트 차감 → 게시 승인 → 실패 시 포인트 원복.
 * 기간 만료는 조회 시점과 주기 작업에서 자동 해제한다.
 */
@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
  ) {
    const timer = setInterval(() => {
      this.expireDue().catch((e) => this.logger.warn(`상단고정 만료 처리 실패: ${(e as Error).message}`));
    }, 60_000);
    timer.unref?.();
  }

  async promote(
    userId: string,
    targetType: 'POST' | 'MARKET',
    targetId: string,
    days: number,
    target: { authorId: string | null; status: string; regionCode: string | null },
  ) {
    if (!Number.isFinite(days) || days < 1 || days > 30) {
      throw apiError(400, 'INVALID_DAYS', '상단 고정 기간은 1~30일입니다.');
    }
    const prices = await this.points.settingPrices();
    const pricePerDay = prices['price.promotePerDay'] ?? 300;
    const cost = pricePerDay * days;

    const existing = await this.prisma.promotion.findFirst({
      where: { targetType, targetId, status: { in: ['PENDING', 'ACTIVE'] } },
    });
    if (existing) {
      throw apiError(409, 'PROMOTION_ALREADY_OPEN', '이미 상단 고정이 진행 중입니다.', {
        endsAt: existing.endsAt?.toISOString() ?? null,
      });
    }

    // 1) 결제(포인트 차감) + 대기 상태 생성
    const promotion = await this.prisma.$transaction(async (tx) => {
      await this.points.spend(userId, cost, { type: 'promotion', id: targetId, memo: `상단 고정 ${days}일` }, tx);
      return tx.promotion.create({
        data: { userId, targetType, targetId, regionCode: target.regionCode ?? '', pointCost: cost, days, status: 'PENDING' },
      });
    });

    try {
      // 2) 게시 검증 및 활성화 (실패 시 원복)
      if (!target.authorId || target.authorId !== userId) {
        throw apiError(400, 'PROMOTION_TARGET_INVALID', '본인의 게시물만 상단 고정할 수 있습니다.');
      }
      if (target.status !== 'ACTIVE' && target.status !== 'ON_SALE') {
        throw apiError(400, 'PROMOTION_TARGET_INVALID', '현재 상태에서는 상단 고정할 수 없습니다.');
      }
      const startsAt = new Date();
      const endsAt = new Date(Date.now() + days * 24 * 3600 * 1000);
      const active = await this.prisma.promotion.update({
        where: { id: promotion.id },
        data: { status: 'ACTIVE', startsAt, endsAt },
      });
      return {
        id: active.id,
        status: active.status,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        cost,
        balance: await this.points.balance(userId),
        refunded: false,
      };
    } catch (e) {
      const balance = await this.points.credit(userId, cost, 'REFUND', {
        type: 'promotion',
        id: promotion.id,
        memo: '상단 고정 실패 포인트 원복',
      });
      await this.prisma.promotion.update({
        where: { id: promotion.id },
        data: { status: 'FAILED', failureCode: (e as { response?: { code?: string } }).response?.code ?? 'FAILED' },
      });
      this.logger.warn(`상단 고정 실패 → ${cost}P 원복 (userId=${userId}, promotion=${promotion.id})`);
      const err = e as { response?: unknown; status?: number };
      throw Object.assign(e as object, { refund: { refunded: true, amount: cost, balance } });
    }
  }

  async activeTargetIds(targetType: 'POST' | 'MARKET'): Promise<Map<string, Date>> {
    const now = new Date();
    const rows = await this.prisma.promotion.findMany({
      where: { targetType, status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
      select: { targetId: true, endsAt: true },
    });
    return new Map(rows.map((r) => [r.targetId, r.endsAt as Date]));
  }

  async expireDue(): Promise<number> {
    const result = await this.prisma.promotion.updateMany({
      where: { status: 'ACTIVE', endsAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    return result.count;
  }

  async history(userId: string) {
    const rows = await this.prisma.promotion.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
      days: r.days,
      pointCost: r.pointCost,
      endsAt: r.endsAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }
}
