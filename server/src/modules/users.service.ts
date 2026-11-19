import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../common/points.service';
import { RedisService } from '../common/redis.service';
import { apiError, broadDistanceLabel, publicProfile, recentActivityLabel } from '../common/util';

export const INTERESTS = [
  '카페', '맛집', '운동', '산책', '영화', '음악', '독서', '게임', '반려동물',
  '여행', '요리', '사진', '등산', '자전거', '스터디', '봉사', '전시', '드라이브',
];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly redis: RedisService,
  ) {}

  private async blockedIds(userId: string): Promise<string[]> {
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [...new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]).filter((id) => id !== userId))];
  }

  /**
   * 주변 친구 목록. 좌표·정밀거리는 응답에 포함하지 않고 '같은 동네/가까운 지역' 라벨만 반환한다.
   */
  async nearby(
    userId: string,
    filters: { sort?: string; regionCode?: string; ageBand?: string; interest?: string; limit?: number },
  ) {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { region: true } });
    if (me.status !== 'ACTIVE') throw apiError(403, 'ACCOUNT_INACTIVE', '이용이 제한된 계정입니다.');
    const blocked = await this.blockedIds(userId);
    const limit = Math.min(Math.max(Number(filters.limit ?? 30), 1), 100);

    const where: Prisma.UserWhereInput = {
      id: { not: userId, notIn: blocked.length > 0 ? blocked : undefined },
      status: 'ACTIVE',
      showNearby: true,
      searchable: true,
      ...(filters.regionCode ? { regionCode: filters.regionCode } : {}),
      ...(filters.ageBand ? { ageBand: filters.ageBand } : {}),
      ...(filters.interest ? { interests: { has: filters.interest } } : {}),
    };

    const candidates = await this.prisma.user.findMany({
      where,
      include: { region: true },
      orderBy: { lastActiveAt: 'desc' },
      take: 300,
    });

    const browsing = await this.redis.getJson<{ regionCode: string }>(`browse:${userId}`);

    const items = candidates.map((candidate) => {
      const sameRegion = Boolean(me.regionCode && candidate.regionCode === me.regionCode);
      const label = broadDistanceLabel(
        me.region ? { lat: me.region.lat, lng: me.region.lng } : null,
        candidate.region ? { lat: candidate.region.lat, lng: candidate.region.lng } : null,
        sameRegion,
      );
      const distanceKm = me.region && candidate.region
        ? Math.abs(me.region.lat - candidate.region.lat) + Math.abs(me.region.lng - candidate.region.lng)
        : Number.MAX_SAFE_INTEGER;
      return {
        ...publicProfile(candidate),
        distanceLabel: label,
        interestMatch: (candidate.interests ?? []).filter((i) => (me.interests ?? []).includes(i)),
        browsingBadge:
          browsing && me.regionCode && candidate.regionCode && browsing.regionCode === candidate.regionCode && !sameRegion
            ? '이 지역 둘러보는 중'
            : null,
        _distance: distanceKm,
        _lastActive: candidate.lastActiveAt.getTime(),
      };
    });

    let sorted = items;
    if (filters.sort === 'recent') {
      sorted = [...items].sort((a, b) => b._lastActive - a._lastActive);
    } else {
      sorted = [...items].sort((a, b) => {
        if (a.distanceLabel === b.distanceLabel) return b._lastActive - a._lastActive;
        const order = { '같은 동네': 0, '가까운 지역': 1, '조금 먼 지역': 2 } as Record<string, number>;
        return order[a.distanceLabel] - order[b.distanceLabel];
      });
    }

    return sorted.slice(0, limit).map(({ _distance, _lastActive, ...rest }) => rest);
  }

  async search(userId: string, q: string) {
    if (!q || q.trim().length < 1) throw apiError(400, 'QUERY_REQUIRED', '검색어를 입력해 주세요.');
    const blocked = await this.blockedIds(userId);
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: userId, notIn: blocked.length > 0 ? blocked : undefined },
        status: 'ACTIVE',
        searchable: true,
        nickname: { contains: q.trim(), mode: 'insensitive' },
      },
      take: 30,
      orderBy: { lastActiveAt: 'desc' },
    });
    return users.map((u) => ({
      ...publicProfile(u),
      activityLabel: recentActivityLabel(u.lastActiveAt),
    }));
  }

  async profile(viewerId: string, targetId: string) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw apiError(404, 'USER_NOT_FOUND', '회원을 찾을 수 없습니다.');
    if (target.status === 'DELETED') throw apiError(404, 'USER_DELETED', '탈퇴한 회원입니다.');
    if (viewerId !== targetId) {
      const blocked = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: targetId },
            { blockerId: targetId, blockedId: viewerId },
          ],
        },
      });
      if (blocked) throw apiError(403, 'BLOCKED', '차단된 회원의 프로필은 볼 수 없습니다.');
    }
    const posts = await this.prisma.boardPost.count({ where: { authorId: targetId, status: 'ACTIVE' } });
    return { ...publicProfile(target), postCount: posts, activityLabel: recentActivityLabel(target.lastActiveAt) };
  }

  async block(userId: string, targetId: string) {
    if (userId === targetId) throw apiError(400, 'CANNOT_BLOCK_SELF', '본인을 차단할 수 없습니다.');
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw apiError(404, 'USER_NOT_FOUND', '회원을 찾을 수 없습니다.');

    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
        create: { blockerId: userId, blockedId: targetId },
        update: {},
      }),
      this.prisma.noteRequest.updateMany({
        where: { fromUserId: targetId, toUserId: userId, status: { in: ['PENDING', 'ACCEPTED'] } },
        data: { status: 'DECLINED' },
      }),
      this.prisma.notification.deleteMany({ where: { userId, data: { path: ['fromUserId'], equals: targetId } } }),
    ]);
    return { blocked: true, targetId };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    return { blocked: false, targetId };
  }

  async blocks(userId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      userId: r.blockedId,
      nickname: r.blocked.nickname,
      photoUrl: r.blocked.photoUrl,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** 다른 지역 둘러보기(유료) */
  async browseRegion(userId: string, regionCode: string) {
    const region = await this.prisma.region.findUnique({ where: { code: regionCode } });
    if (!region) throw apiError(404, 'REGION_NOT_FOUND', '지역을 찾을 수 없습니다.');
    const prices = await this.points.settingPrices();
    const cost = prices['price.regionBrowse'] ?? 100;
    const balance = await this.points.spend(userId, cost, { type: 'region_browse', id: regionCode, memo: `${region.name} 둘러보기` });
    await this.redis.setJson(`browse:${userId}`, { regionCode, expiresAt: Date.now() + 3600_000 }, 3600);
    return {
      regionCode,
      regionName: region.name,
      badge: '이 지역 둘러보는 중',
      expiresInSec: 3600,
      charged: cost,
      balance,
    };
  }

  async currentBrowse(userId: string) {
    const browsing = await this.redis.getJson<{ regionCode: string; expiresAt: number }>(`browse:${userId}`);
    if (!browsing) return { browsing: null };
    const region = await this.prisma.region.findUnique({ where: { code: browsing.regionCode } });
    return {
      browsing: { regionCode: browsing.regionCode, regionName: region?.name ?? null, badge: '이 지역 둘러보는 중' },
    };
  }

  /** 위치 권한 허용 시 좌표로 최근접 시군구를 설정한다(좌표는 저장하지 않음). */
  async setRegionByCoords(userId: string, lat: number, lng: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw apiError(400, 'INVALID_COORDINATES', '위치 정보가 올바르지 않습니다.');
    }
    const regions = await this.prisma.region.findMany({ where: { isActive: true } });
    if (regions.length === 0) throw apiError(404, 'REGION_NOT_FOUND', '지역 정보가 없습니다.');
    let nearest = regions[0];
    let best = Number.MAX_SAFE_INTEGER;
    for (const region of regions) {
      const dLat = (region.lat - lat) * 111;
      const dLng = (region.lng - lng) * 88;
      const distance = dLat * dLat + dLng * dLng;
      if (distance < best) {
        best = distance;
        nearest = region;
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { regionCode: nearest.code, regionName: nearest.name },
    });
    return { code: nearest.code, name: nearest.name, city: nearest.city };
  }

  async regions() {
    const regions = await this.prisma.region.findMany({ where: { isActive: true }, orderBy: [{ city: 'asc' }, { name: 'asc' }] });
    return regions.map((r) => ({ code: r.code, name: r.name, city: r.city, district: r.district }));
  }

  async interests() {
    return INTERESTS;
  }

  async updateLocationRegion(userId: string, regionCode: string) {
    const region = await this.prisma.region.findUnique({ where: { code: regionCode } });
    if (!region) throw apiError(404, 'REGION_NOT_FOUND', '지역을 찾을 수 없습니다.');
    await this.prisma.user.update({ where: { id: userId }, data: { regionCode: region.code, regionName: region.name } });
    return { regionCode: region.code, regionName: region.name };
  }
}
