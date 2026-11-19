import { Injectable } from '@nestjs/common';
import { MemberRole, Prisma, RoomStatus, RoomType, RoomVisibility } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../common/points.service';
import { RealtimeService } from '../common/realtime.service';
import { apiError } from '../common/util';
import { assertClean } from '../common/moderation';
import { NotificationService } from './notification.service';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(userId: string, filters: { type?: string; regionCode?: string; q?: string; mine?: string; interest?: string }) {
    const where: Prisma.ChatRoomWhereInput = {
      status: 'ACTIVE',
      type: filters.type ? (filters.type.toUpperCase() as RoomType) : { in: ['REGION', 'INTEREST', 'GROUP'] },
    };
    if (filters.regionCode) where.regionCode = filters.regionCode;
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
        { hashtags: { has: filters.q } },
      ];
    }
    if (filters.mine === 'true') {
      where.members = { some: { userId, leftAt: null } };
    } else {
      // 검색 노출이 꺼진 방은 내가 참여한 방만 노출
      where.AND = [{ OR: [{ searchable: true }, { members: { some: { userId, leftAt: null } } }] }];
    }

    const rooms = await this.prisma.chatRoom.findMany({
      where,
      include: {
        members: { where: { leftAt: null }, select: { userId: true, role: true } },
        region: true,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      take: 60,
    });

    return rooms.map((room) => ({
      id: room.id,
      type: room.type,
      title: room.title,
      description: room.description,
      imageUrl: room.imageMediaId ? `/api/v1/media/${room.imageMediaId}` : null,
      hashtags: room.hashtags,
      regionCode: room.regionCode,
      regionName: room.region?.name ?? null,
      memberCount: room.members.length,
      capacity: room.capacity,
      visibility: room.visibility,
      joinApproval: room.joinApproval,
      lastMessageAt: room.lastMessageAt?.toISOString() ?? null,
      joined: room.members.some((m) => m.userId === userId),
      myRole: room.members.find((m) => m.userId === userId)?.role ?? null,
      ownerId: room.ownerId,
    }));
  }

  async detail(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        members: {
          where: { leftAt: null },
          include: { user: { select: { id: true, nickname: true, photoUrl: true, ageBand: true, regionName: true, status: true } } },
        },
        region: true,
        bans: { where: { userId } },
      },
    });
    if (!room) throw apiError(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
    const me = room.members.find((m) => m.userId === userId);
    return {
      id: room.id,
      type: room.type,
      title: room.title,
      description: room.description,
      imageUrl: room.imageMediaId ? `/api/v1/media/${room.imageMediaId}` : null,
      hashtags: room.hashtags,
      regionCode: room.regionCode,
      regionName: room.region?.name ?? null,
      capacity: room.capacity,
      memberCount: room.members.length,
      visibility: room.visibility,
      joinApproval: room.joinApproval,
      status: room.status,
      ownerId: room.ownerId,
      pinnedMessageId: room.pinnedMessageId,
      joined: Boolean(me),
      myRole: me?.role ?? null,
      banned: room.bans.length > 0,
      members: room.members
        .filter((m) => m.user.status !== 'DELETED')
        .map((m) => ({
          id: m.userId,
          nickname: m.user.nickname,
          photoUrl: m.user.photoUrl,
          ageBand: m.user.ageBand,
          regionName: m.user.regionName,
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        })),
      createdAt: room.createdAt.toISOString(),
    };
  }

  async create(userId: string, body: Record<string, unknown>) {
    const title = String(body.title ?? '').trim();
    if (title.length < 2 || title.length > 40) throw apiError(400, 'INVALID_TITLE', '방 이름은 2~40자로 입력해 주세요.');
    assertClean(title);
    const interests = Array.isArray(body.hashtags) ? body.hashtags.filter((h): h is string => typeof h === 'string').slice(0, 5) : [];
    const regionCode = typeof body.regionCode === 'string' ? body.regionCode : undefined;
    if (regionCode) {
      const region = await this.prisma.region.findUnique({ where: { code: regionCode } });
      if (!region) throw apiError(400, 'INVALID_REGION', '활동 지역을 다시 선택해 주세요.');
    }
    const capacity = Math.min(Math.max(Number(body.capacity ?? 100), 2), 1000);
    const room = await this.prisma.chatRoom.create({
      data: {
        type: body.type === 'INTEREST' ? 'INTEREST' : 'GROUP',
        title,
        description: typeof body.description === 'string' ? body.description.slice(0, 500) : null,
        imageMediaId: typeof body.imageMediaId === 'string' ? body.imageMediaId : null,
        hashtags: interests,
        regionCode,
        capacity,
        joinApproval: Boolean(body.joinApproval),
        visibility: body.visibility === 'PRIVATE' ? RoomVisibility.PRIVATE : RoomVisibility.PUBLIC,
        searchable: body.searchable !== false,
        ownerId: userId,
        lastMessageAt: new Date(),
        members: { create: { userId, role: MemberRole.OWNER } },
      },
    });
    return this.detail(room.id, userId);
  }

  async ensureRegionRoom(regionCode: string, actorId: string) {
    const region = await this.prisma.region.findUnique({ where: { code: regionCode } });
    if (!region) throw apiError(404, 'REGION_NOT_FOUND', '지역을 찾을 수 없습니다.');
    const existing = await this.prisma.chatRoom.findFirst({ where: { type: 'REGION', regionCode, status: 'ACTIVE' } });
    if (existing) return existing;
    return this.prisma.chatRoom.create({
      data: {
        type: 'REGION',
        title: `${region.name} 지역방`,
        description: `${region.name} 이웃들이 모이는 상설 지역방입니다.`,
        regionCode,
        capacity: null,
        ownerId: actorId,
        searchable: true,
        lastMessageAt: new Date(),
      },
    });
  }

  /**
   * 정원 동시성 제어: 방 행을 FOR UPDATE로 잠가 마지막 1자리에 동시에 2명이 입장해도 1명만 성공한다.
   */
  async join(userId: string, roomId: string, message?: string) {
    const room0 = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room0) throw apiError(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
    if (room0.status !== 'ACTIVE') throw apiError(409, 'ROOM_CLOSED', '종료된 방입니다.');

    const ban = await this.prisma.roomBan.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (ban) throw apiError(403, 'ROOM_BANNED', '재입장이 제한된 방입니다.');

    const existing = await this.prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (existing && !existing.leftAt) {
      return { joined: true, pending: false, roomId, alreadyMember: true };
    }

    if (room0.joinApproval && room0.ownerId !== userId) {
      const request = await this.prisma.roomJoinRequest.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: { roomId, userId, message: message ?? null, status: 'PENDING' },
        update: { status: 'PENDING', message: message ?? null },
      });
      if (room0.ownerId) {
        await this.notifications.push(room0.ownerId, {
          type: 'SYSTEM',
          title: '가입 승인 요청',
          body: `${room0.title} 방에 가입 요청이 도착했습니다.`,
          data: { roomId, joinRequestId: request.id },
        });
      }
      return { joined: false, pending: true, roomId, joinRequestId: request.id };
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; capacity: number | null; status: string }[]>`
          SELECT id, capacity, status FROM "ChatRoom" WHERE id = ${roomId} FOR UPDATE
        `;
        if (locked.length === 0) throw apiError(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
        if (locked[0].status !== 'ACTIVE') throw apiError(409, 'ROOM_CLOSED', '종료된 방입니다.');
        const memberCount = await tx.chatRoomMember.count({ where: { roomId, leftAt: null } });
        const capacity = locked[0].capacity;
        if (capacity !== null && memberCount >= capacity) {
          throw apiError(409, 'ROOM_FULL', '정원이 가득 찼습니다.', { capacity, memberCount });
        }
        if (existing) {
          await tx.chatRoomMember.update({ where: { id: existing.id }, data: { leftAt: null, joinedAt: new Date() } });
        } else {
          await tx.chatRoomMember.create({ data: { roomId, userId, role: 'MEMBER' } });
        }
      }, { timeout: 15000, maxWait: 10000 });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { joined: true, pending: false, roomId, alreadyMember: true };
      }
      throw e;
    }

    this.realtime.emit(`room:${roomId}`, 'room:memberJoined', { roomId, userId });
    return { joined: true, pending: false, roomId };
  }

  async joinRegion(userId: string, regionCode: string) {
    const room = await this.ensureRegionRoom(regionCode, userId);
    const result = await this.join(userId, room.id);
    return { ...result, regionCode, regionName: (await this.prisma.region.findUnique({ where: { code: regionCode } }))?.name };
  }

  private async assertManager(roomId: string, userId: string, action: 'notice' | 'manage' = 'manage') {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw apiError(404, 'ROOM_NOT_FOUND', '방을 찾을 수 없습니다.');
    if (room.ownerId === userId) return { room, role: MemberRole.OWNER };
    const member = await this.prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!member || member.leftAt) throw apiError(403, 'NOT_ROOM_MEMBER', '방 참여자가 아닙니다.');
    if (member.role === MemberRole.MANAGER) {
      if (action === 'manage') return { room, role: MemberRole.MANAGER };
      return { room, role: MemberRole.MANAGER };
    }
    throw apiError(403, 'NO_PERMISSION', '방장·운영진만 할 수 있습니다.');
  }

  async update(roomId: string, userId: string, body: Record<string, unknown>) {
    const { room, role } = await this.assertManager(roomId, userId);
    const data: Prisma.ChatRoomUpdateInput = {};
    if (typeof body.title === 'string') {
      const title = body.title.trim();
      if (title.length < 2 || title.length > 40) throw apiError(400, 'INVALID_TITLE', '방 이름은 2~40자로 입력해 주세요.');
      assertClean(title);
      data.title = title;
    }
    if (typeof body.description === 'string') data.description = body.description.slice(0, 500);
    if (typeof body.imageMediaId === 'string') {
      const media = await this.prisma.media.findUnique({ where: { id: body.imageMediaId } });
      if (!media || media.ownerId !== userId) throw apiError(400, 'MEDIA_INVALID', '대표 이미지를 다시 업로드해 주세요.');
      data.imageMedia = { connect: { id: media.id } };
    }
    if (Array.isArray(body.hashtags)) data.hashtags = body.hashtags.filter((h): h is string => typeof h === 'string').slice(0, 5);
    if (typeof body.searchable === 'boolean') data.searchable = body.searchable;
    if (typeof body.joinApproval === 'boolean') data.joinApproval = body.joinApproval;
    if (body.visibility === 'PUBLIC' || body.visibility === 'PRIVATE') data.visibility = body.visibility;
    if (body.capacity !== undefined) {
      if (role !== MemberRole.OWNER) throw apiError(403, 'OWNER_ONLY', '정원 변경은 방장만 가능합니다.');
      const capacity = Math.max(Number(body.capacity), 2);
      data.capacity = capacity;
    }
    if (typeof body.pinnedMessageId === 'string') data.pinnedMessageId = body.pinnedMessageId;
    await this.prisma.chatRoom.update({ where: { id: roomId }, data });
    return this.detail(roomId, userId);
  }

  async approveJoin(roomId: string, userId: string, targetUserId: string) {
    await this.assertManager(roomId, userId);
    const request = await this.prisma.roomJoinRequest.findUnique({
      where: { roomId_userId: { roomId, userId: targetUserId } },
    });
    if (!request || request.status !== 'PENDING') throw apiError(404, 'JOIN_REQUEST_NOT_FOUND', '대기 중인 가입 요청이 없습니다.');
    const joinResult = await this.joinApproved(roomId, targetUserId);
    await this.prisma.roomJoinRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', resolvedAt: new Date() },
    });
    await this.notifications.push(targetUserId, {
      type: 'SYSTEM',
      title: '가입이 승인되었습니다',
      body: '이제 방에서 대화할 수 있습니다.',
      data: { roomId },
    });
    return joinResult;
  }

  private async joinApproved(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
    const memberCount = await this.prisma.chatRoomMember.count({ where: { roomId, leftAt: null } });
    if (room.capacity !== null && memberCount >= room.capacity) throw apiError(409, 'ROOM_FULL', '정원이 가득 찼습니다.');
    await this.prisma.chatRoomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: { roomId, userId, role: 'MEMBER' },
      update: { leftAt: null, joinedAt: new Date() },
    });
    return { joined: true, roomId };
  }

  async rejectJoin(roomId: string, userId: string, targetUserId: string) {
    await this.assertManager(roomId, userId);
    await this.prisma.roomJoinRequest.updateMany({
      where: { roomId, userId: targetUserId, status: 'PENDING' },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });
    return { rejected: true };
  }

  async joinRequests(roomId: string, userId: string) {
    await this.assertManager(roomId, userId);
    return this.prisma.roomJoinRequest.findMany({
      where: { roomId, status: 'PENDING' },
      include: { user: { select: { id: true, nickname: true, photoUrl: true, ageBand: true } } },
    });
  }

  async kick(roomId: string, userId: string, targetUserId: string, restrictRejoin = false) {
    const { room } = await this.assertManager(roomId, userId);
    if (targetUserId === room.ownerId) throw apiError(403, 'CANNOT_KICK_OWNER', '방장은 강퇴할 수 없습니다.');
    const target = await this.prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: targetUserId } } });
    if (!target || target.leftAt) throw apiError(404, 'NOT_MEMBER', '해당 회원은 방 참여자가 아닙니다.');
    if (target.role === MemberRole.MANAGER && room.ownerId !== userId) {
      throw apiError(403, 'CANNOT_KICK_MANAGER', '운영진은 방장만 강퇴할 수 있습니다.');
    }
    await this.prisma.$transaction([
      this.prisma.chatRoomMember.update({ where: { id: target.id }, data: { leftAt: new Date() } }),
      this.prisma.roomBan.upsert({
        where: { roomId_userId: { roomId, userId: targetUserId } },
        create: { roomId, userId: targetUserId, rejoinable: !restrictRejoin },
        update: { rejoinable: !restrictRejoin },
      }),
    ]);
    await this.notifications.push(targetUserId, {
      type: 'SYSTEM',
      title: '방에서 내보내졌습니다',
      body: `${room.title} 방에서 나가게 되었습니다.`,
      data: { roomId },
    });
    return { kicked: true, restrictRejoin };
  }

  async setRole(roomId: string, userId: string, targetUserId: string, role: 'MANAGER' | 'MEMBER') {
    const { room } = await this.assertManager(roomId, userId);
    if (room.ownerId !== userId) throw apiError(403, 'OWNER_ONLY', '운영진 지정은 방장만 가능합니다.');
    await this.prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId: targetUserId } },
      data: { role },
    });
    return { updated: true, role };
  }

  async transferOwner(roomId: string, userId: string, targetUserId: string) {
    const room = await this.prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
    if (room.ownerId !== userId) throw apiError(403, 'OWNER_ONLY', '방장만 위임할 수 있습니다.');
    const target = await this.prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: targetUserId } } });
    if (!target || target.leftAt) throw apiError(404, 'NOT_MEMBER', '위임 대상이 방 참여자가 아닙니다.');
    await this.prisma.$transaction([
      this.prisma.chatRoom.update({ where: { id: roomId }, data: { ownerId: targetUserId } }),
      this.prisma.chatRoomMember.update({ where: { roomId_userId: { roomId, userId: targetUserId } }, data: { role: 'OWNER' } }),
      this.prisma.chatRoomMember.update({ where: { roomId_userId: { roomId, userId } }, data: { role: 'MANAGER' } }),
    ]);
    await this.notifications.push(targetUserId, {
      type: 'SYSTEM',
      title: '방장이 위임되었습니다',
      body: `${room.title} 방의 새 방장이 되었습니다.`,
      data: { roomId },
    });
    return { transferred: true, newOwnerId: targetUserId };
  }

  async leave(roomId: string, userId: string, body: { transferToUserId?: string; close?: boolean }) {
    const room = await this.prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
    const member = await this.prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId } } });
    if (!member || member.leftAt) throw apiError(400, 'NOT_MEMBER', '참여 중인 방이 아닙니다.');

    if (room.ownerId === userId) {
      const others = await this.prisma.chatRoomMember.count({ where: { roomId, leftAt: null, userId: { not: userId } } });
      if (body.transferToUserId) {
        await this.transferOwner(roomId, userId, body.transferToUserId);
      } else if (others === 0 || body.close) {
        await this.prisma.$transaction([
          this.prisma.chatRoom.update({ where: { id: roomId }, data: { status: 'CLOSED' } }),
          this.prisma.chatRoomMember.update({ where: { id: member.id }, data: { leftAt: new Date() } }),
        ]);
        return { left: true, roomClosed: true };
      } else {
        throw apiError(400, 'OWNER_MUST_DELEGATE', '방장은 방장 위임 또는 방 종료 후 나갈 수 있습니다.');
      }
    }

    await this.prisma.chatRoomMember.update({ where: { id: member.id }, data: { leftAt: new Date() } });
    return { left: true, roomClosed: false };
  }

  /** 그룹방 정원 확장(유료) */
  async expandCapacity(roomId: string, userId: string, add = 10) {
    const room = await this.prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
    if (room.ownerId !== userId) throw apiError(403, 'OWNER_ONLY', '정원 확장은 방장만 가능합니다.');
    if (room.type === 'REGION') throw apiError(400, 'NOT_APPLICABLE', '지역방은 정원 제한이 없습니다.');
    const prices = await this.points.settingPrices();
    const cost = (prices['price.roomCapacityExpandPer10'] ?? 500) * Math.ceil(add / 10);
    const balance = await this.points.spend(userId, cost, { type: 'room_capacity', id: roomId, memo: `정원 ${add}명 확장` });
    const updated = await this.prisma.chatRoom.update({
      where: { id: roomId },
      data: { capacity: (room.capacity ?? 100) + add },
    });
    return { capacity: updated.capacity, charged: cost, balance };
  }

  async updateStatus(roomId: string, status: 'ACTIVE' | 'CLOSED' | 'BLOCKED') {
    await this.prisma.chatRoom.update({ where: { id: roomId }, data: { status: status as RoomStatus } });
    return { roomId, status };
  }
}
