import { Injectable } from '@nestjs/common';
import { MarketStatus, MarketType, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { assertClean } from '../common/moderation';
import { apiError, publicProfile } from '../common/util';
import { ChatService } from './chat.service';
import { PromotionsService } from './promotions.service';

const TYPES: Record<string, MarketType> = { SELL: 'SELL', BUY: 'BUY', FREE: 'FREE', 판매: 'SELL', 구매: 'BUY', 무료나눔: 'FREE' };

@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly promotions: PromotionsService,
  ) {}

  async list(filters: { regionCode?: string; type?: string; status?: string; limit?: number }) {
    const where: Prisma.MarketItemWhereInput = {};
    if (filters.regionCode) where.regionCode = filters.regionCode;
    if (filters.type) {
      const type = TYPES[filters.type.toUpperCase()] ?? TYPES[filters.type];
      if (!type) throw apiError(400, 'INVALID_TYPE', '거래 유형을 확인해 주세요.');
      where.type = type;
    }
    where.status = filters.status ? (filters.status.toUpperCase() as MarketStatus) : { not: 'SOLD' };
    const rows = await this.prisma.marketItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(filters.limit ?? 20) * 2, 60),
      include: { seller: true, region: true },
    });
    const promoted = await this.promotions.activeTargetIds('MARKET');
    const items = rows.map((item) => this.serialize(item, promoted.get(item.id) ?? null));
    items.sort((a, b) => {
      if (a.promoted !== b.promoted) return a.promoted ? -1 : 1;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return items.slice(0, Number(filters.limit ?? 20));
  }

  private serialize(
    item: Prisma.MarketItemGetPayload<{ include: { seller: true; region: true } }>,
    promotedUntil: Date | null,
  ) {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      price: item.price,
      photoUrl: item.photoMediaId ? `/api/v1/media/${item.photoMediaId}` : null,
      regionCode: item.regionCode,
      regionName: item.region.name,
      status: item.status,
      seller: publicProfile(item.seller),
      promoted: Boolean(promotedUntil),
      promotedUntil: promotedUntil?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  async create(userId: string, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2 || title.length > 60) throw apiError(400, 'INVALID_TITLE', '제목은 2~60자로 입력해 주세요.');
    const type = TYPES[String(body.type ?? 'SELL').toUpperCase()];
    if (!type) throw apiError(400, 'INVALID_TYPE', '거래 유형을 선택해 주세요.');
    const price = body.price === undefined ? 0 : Number(body.price);
    if (type === 'FREE' ? price !== 0 : !Number.isFinite(price) || price < 0) {
      throw apiError(400, 'INVALID_PRICE', '가격을 확인해 주세요.');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const regionCode = typeof body.regionCode === 'string' ? body.regionCode : user.regionCode;
    if (!regionCode) throw apiError(400, 'REGION_REQUIRED', '희망 지역을 선택해 주세요.');
    const description = String(body.description ?? '').trim();
    assertClean(`${title} ${description}`);
    const item = await this.prisma.marketItem.create({
      data: {
        regionCode,
        type,
        title,
        description: description.slice(0, 2000),
        price: type === 'FREE' ? 0 : Math.trunc(price),
        photoMediaId: typeof body.photoMediaId === 'string' ? body.photoMediaId : null,
        sellerId: userId,
      },
      include: { seller: true, region: true },
    });
    return this.serialize(item, null);
  }

  async detail(itemId: string) {
    const item = await this.prisma.marketItem.findUnique({
      where: { id: itemId },
      include: { seller: true, region: true },
    });
    if (!item) throw apiError(404, 'ITEM_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    const promoted = await this.promotions.activeTargetIds('MARKET');
    return this.serialize(item, promoted.get(item.id) ?? null);
  }

  async updateStatus(itemId: string, userId: string, status: string) {
    const item = await this.prisma.marketItem.findUnique({ where: { id: itemId } });
    if (!item) throw apiError(404, 'ITEM_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    if (item.sellerId !== userId) throw apiError(403, 'NOT_SELLER', '본인 게시물만 상태를 바꿀 수 있습니다.');
    const next = status.toUpperCase() as MarketStatus;
    if (!['ON_SALE', 'RESERVED', 'SOLD'].includes(next)) throw apiError(400, 'INVALID_STATUS', '상태 값을 확인해 주세요.');
    await this.prisma.marketItem.update({ where: { id: itemId }, data: { status: next } });
    return { id: itemId, status: next };
  }

  /** 거래 문의: 상품명·사진이 포함된 1:1 대화방을 연다. */
  async inquiry(itemId: string, buyerId: string) {
    const item = await this.prisma.marketItem.findUnique({ where: { id: itemId } });
    if (!item) throw apiError(404, 'ITEM_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    if (item.sellerId === buyerId) throw apiError(400, 'SELF_INQUIRY', '본인 게시물에는 문의할 수 없습니다.');
    if (item.status === 'SOLD') throw apiError(409, 'ITEM_SOLD', '이미 거래가 완료된 게시물입니다.');
    const roomId = await this.chat.getOrCreateMarketRoom(item.sellerId, buyerId, {
      id: item.id,
      title: item.title,
      photoMediaId: item.photoMediaId,
    });
    await this.chat.sendMessage(roomId, buyerId, {
      type: 'TEXT',
      body: `[거래 문의] ${item.title}\n${item.price > 0 ? `${item.price.toLocaleString('ko-KR')}원` : '무료 나눔'} 문의드립니다.`,
      clientMessageId: `inquiry-${item.id}-${Date.now()}`,
    });
    return { roomId, itemId: item.id, title: `[장터] ${item.title}` };
  }

  async promote(itemId: string, userId: string, days: number) {
    const item = await this.prisma.marketItem.findUnique({ where: { id: itemId } });
    if (!item) throw apiError(404, 'ITEM_NOT_FOUND', '게시물을 찾을 수 없습니다.');
    return this.promotions.promote(userId, 'MARKET', itemId, days, {
      authorId: item.sellerId,
      status: item.status,
      regionCode: item.regionCode,
    });
  }

  async mine(userId: string) {
    const rows = await this.prisma.marketItem.findMany({
      where: { sellerId: userId },
      orderBy: { createdAt: 'desc' },
      include: { seller: true, region: true },
    });
    return rows.map((r) => this.serialize(r, null));
  }
}
