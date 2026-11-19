import { Injectable } from '@nestjs/common';
import { Message, MessageType, Prisma, RoomType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from '../common/realtime.service';
import { assertClean, filterContent } from '../common/moderation';
import { apiError, containsExternalLink, DELETED_NICKNAME } from '../common/util';
import { NotificationService } from './notification.service';

export interface SendMessageInput {
  type?: MessageType | 'TEXT' | 'IMAGE';
  body?: string;
  mediaId?: string;
  clientMessageId?: string;
}

export interface SerializedMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  type: string;
  body: string | null;
  mediaId: string | null;
  clientMessageId: string | null;
  seq: string;
  createdAt: string;
  masked: boolean;
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationService,
  ) {}

  static serialize(
    message: Message & { sender?: { nickname: string; status?: string } | null },
    masked = false,
  ): SerializedMessage {
    return {
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderNickname: message.sender?.status === 'DELETED' ? DELETED_NICKNAME : message.sender?.nickname ?? '',
      type: message.type,
      body: masked ? null : message.body,
      mediaId: masked ? null : message.mediaId,
      clientMessageId: message.clientMessageId,
      seq: message.seq.toString(),
      createdAt: message.createdAt.toISOString(),
      masked,
    };
  }

  async assertMember(roomId: string, userId: string) {
    const member = await this.prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { room: true },
    });
    if (!member || member.leftAt) {
      throw apiError(403, 'NOT_ROOM_MEMBER', '이 대화방의 참여자가 아닙니다.');
    }
    return member;
  }

  async getRoomOrThrow(roomId: string) {
    const room = await this.prisma.chatRoom.findUnique({ where: { id: roomId } });
    if (!room) throw apiError(404, 'ROOM_NOT_FOUND', '대화방을 찾을 수 없습니다.');
    return room;
  }

  async listRooms(userId: string) {
    const members = await this.prisma.chatRoomMember.findMany({
      where: { userId, leftAt: null },
      include: {
        room: {
          include: {
            members: { include: { user: { select: { id: true, nickname: true, photoUrl: true, status: true } } } },
          },
        },
      },
      orderBy: { room: { lastMessageAt: 'desc' } },
    });

    const rooms = [];
    for (const member of members) {
      const room = member.room;
      const [lastMessage, unreadCount] = await Promise.all([
        this.prisma.message.findFirst({
          where: { roomId: room.id, deletedAt: null },
          orderBy: { seq: 'desc' },
          include: { sender: { select: { nickname: true, status: true } } },
        }),
        this.prisma.message.count({
          where: { roomId: room.id, seq: { gt: member.lastReadSeq }, senderId: { not: userId }, deletedAt: null },
        }),
      ]);
      const others = room.members.filter((m) => m.userId !== userId);
      rooms.push({
        id: room.id,
        type: room.type,
        title:
          room.type === 'DIRECT'
            ? others.map((m) => (m.user.status === 'DELETED' ? DELETED_NICKNAME : m.user.nickname)).join(', ') ||
              '1:1 대화'
            : room.title,
        imageUrl: room.imageMediaId ? `/api/v1/media/${room.imageMediaId}` : null,
        regionCode: room.regionCode,
        memberCount: room.members.filter((m) => !m.leftAt).length,
        capacity: room.capacity,
        lastMessage: lastMessage ? ChatService.serialize(lastMessage) : null,
        unreadCount,
        muted: member.muted,
        lastMessageAt: room.lastMessageAt?.toISOString() ?? null,
      });
    }
    return rooms.sort((a, b) => {
      const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return bt - at;
    });
  }

  async getRoom(roomId: string, userId: string) {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        members: { include: { user: { select: { id: true, nickname: true, photoUrl: true, status: true } } } },
        region: true,
      },
    });
    const member = room.members.find((m) => m.userId === userId);
    return {
      id: room.id,
      type: room.type,
      title: room.type === 'DIRECT'
        ? room.members
            .filter((m) => m.userId !== userId)
            .map((m) => (m.user.status === 'DELETED' ? DELETED_NICKNAME : m.user.nickname))
            .join(', ')
        : room.title,
      description: room.description,
      regionCode: room.regionCode,
      regionName: room.region?.name ?? null,
      hashtags: room.hashtags,
      capacity: room.capacity,
      memberCount: room.members.filter((m) => !m.leftAt).length,
      muted: member?.muted ?? false,
      members: room.members
        .filter((m) => !m.leftAt)
        .map((m) => ({
          id: m.userId,
          nickname: m.user.status === 'DELETED' ? DELETED_NICKNAME : m.user.nickname,
          photoUrl: m.user.photoUrl,
          role: m.role,
          left: Boolean(m.leftAt),
        })),
      notices: [],
    };
  }

  async listMessages(roomId: string, userId: string, opts: { beforeSeq?: string; limit?: number }) {
    await this.assertMember(roomId, userId);
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const where: Prisma.MessageWhereInput = { roomId, deletedAt: null };
    if (opts.beforeSeq) where.seq = { lt: BigInt(opts.beforeSeq) };
    const rows = await this.prisma.message.findMany({
      where,
      orderBy: { seq: 'desc' },
      take: limit,
      include: { sender: { select: { nickname: true, status: true } } },
    });
    const ordered = rows.reverse();
    return this.maskForViewer(ordered, userId);
  }

  /** 재연결 동기화: afterSeq 이후 메시지를 seq 오름차순으로 반환(누락 없음) */
  async syncMessages(roomId: string, userId: string, afterSeq: string, limit = 200) {
    await this.assertMember(roomId, userId);
    const rows = await this.prisma.message.findMany({
      where: { roomId, seq: { gt: BigInt(afterSeq || '0') }, deletedAt: null },
      orderBy: { seq: 'asc' },
      take: Math.min(limit, 500),
      include: { sender: { select: { nickname: true, status: true } } },
    });
    return this.maskForViewer(rows, userId);
  }

  private async blockPairs(roomId: string): Promise<Set<string>> {
    const members = await this.prisma.chatRoomMember.findMany({ where: { roomId }, select: { userId: true } });
    const ids = members.map((m) => m.userId);
    if (ids.length < 2) return new Set();
    const blocks = await this.prisma.block.findMany({
      where: { blockerId: { in: ids }, blockedId: { in: ids } },
      select: { blockerId: true, blockedId: true },
    });
    return new Set(blocks.flatMap((b) => [`${b.blockerId}>${b.blockedId}`, `${b.blockedId}>${b.blockerId}`]));
  }

  private async maskForViewer(rows: (Message & { sender: { nickname: string; status: string } | null })[], viewerId: string) {
    const pairs = await this.blockPairs(rows[0]?.roomId ?? '');
    return rows.map((m) => {
      const masked = m.senderId !== viewerId && pairs.has(`${viewerId}>${m.senderId}`);
      return ChatService.serialize(m, masked);
    });
  }

  async sendMessage(roomId: string, userId: string, input: SendMessageInput) {
    const member = await this.assertMember(roomId, userId);
    const room = member.room;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    if (this.isSuspended(user)) {
      throw apiError(403, 'USER_SUSPENDED', '이용이 제한된 계정입니다.');
    }

    if (room.type === 'DIRECT') {
      const other = await this.prisma.chatRoomMember.findFirst({
        where: { roomId, userId: { not: userId }, leftAt: null },
      });
      if (other) {
        const blocked = await this.prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: other.userId, blockedId: userId },
              { blockerId: userId, blockedId: other.userId },
            ],
          },
        });
        if (blocked) throw apiError(403, 'BLOCKED', '차단된 상대와는 메시지를 주고받을 수 없습니다.');
      }
    }

    const clientMessageId = input.clientMessageId?.trim() || null;
    if (clientMessageId) {
      const existing = await this.prisma.message.findUnique({
        where: { senderId_clientMessageId: { senderId: userId, clientMessageId } },
      });
      if (existing) {
        const withSender = await this.prisma.message.findUniqueOrThrow({
          where: { id: existing.id },
          include: { sender: { select: { nickname: true, status: true } } },
        });
        return { message: ChatService.serialize(withSender), duplicated: true };
      }
    }

    const type = (input.type ?? 'TEXT') as MessageType;
    let body: string | null = input.body?.trim() ?? null;
    let mediaId: string | null = input.mediaId ?? null;

    if (type === 'TEXT') {
      if (!body) throw apiError(400, 'EMPTY_MESSAGE', '메시지 내용을 입력해 주세요.');
      if (body.length > 2000) throw apiError(400, 'MESSAGE_TOO_LONG', '메시지는 2000자까지 보낼 수 있습니다.');
      assertClean(body);
      mediaId = null;
    } else if (type === 'IMAGE') {
      if (!mediaId) throw apiError(400, 'MEDIA_REQUIRED', '사진을 첨부해 주세요.');
      const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
      if (!media || media.ownerId !== userId) throw apiError(400, 'MEDIA_INVALID', '첨부할 수 없는 사진입니다.');
      body = body ? body.slice(0, 500) : null;
    }

    let message;
    try {
      message = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: { roomId, senderId: userId, type, body, mediaId, clientMessageId },
          include: { sender: { select: { nickname: true, status: true } } },
        });
        await tx.chatRoom.update({ where: { id: roomId }, data: { lastMessageAt: new Date() } });
        return created;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && clientMessageId) {
        const existing = await this.prisma.message.findUniqueOrThrow({
          where: { senderId_clientMessageId: { senderId: userId, clientMessageId } },
          include: { sender: { select: { nickname: true, status: true } } },
        });
        return { message: ChatService.serialize(existing), duplicated: true };
      }
      throw e;
    }

    const maskedBody = message.body ? message.body.slice(0, 60) : '사진을 보냈습니다.';
    const recipients = await this.prisma.chatRoomMember.findMany({
      where: { roomId, userId: { not: userId }, leftAt: null },
      include: { user: true },
    });
    const blocks = await this.prisma.block.findMany({
      where: {
        OR: [
          { blockerId: { in: recipients.map((r) => r.userId) }, blockedId: userId },
          { blockerId: userId, blockedId: { in: recipients.map((r) => r.userId) } },
        ],
      },
    });
    const blockedIds = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));

    // 차단 관계에 따라 사용자별로 가린 메시지를 전송한다(그룹방에서도 일관 적용).
    const allMembers = await this.prisma.chatRoomMember.findMany({
      where: { roomId, leftAt: null },
      select: { userId: true },
    });
    for (const member of allMembers) {
      const masked = member.userId !== userId && blockedIds.has(member.userId);
      this.realtime.emitToUser(member.userId, 'message:new', ChatService.serialize(message, masked));
    }

    for (const recipient of recipients) {
      if (blockedIds.has(recipient.userId)) continue;
      if (!recipient.muted) {
        await this.notifications.push(recipient.userId, {
          type: 'MESSAGE',
          title: room.type === 'DIRECT' ? user.nickname : room.title,
          body: recipient.user.pushPreview ? maskedBody : '새 메시지가 도착했습니다.',
          data: { roomId },
        });
      }
    }

    return { message: ChatService.serialize(message), duplicated: false };
  }

  async markRead(roomId: string, userId: string, seq?: string) {
    const member = await this.assertMember(roomId, userId);
    let targetSeq: bigint;
    if (seq) {
      targetSeq = BigInt(seq);
    } else {
      const last = await this.prisma.message.findFirst({ where: { roomId }, orderBy: { seq: 'desc' } });
      targetSeq = last?.seq ?? BigInt(0);
    }
    if (targetSeq < member.lastReadSeq) targetSeq = member.lastReadSeq;
    await this.prisma.chatRoomMember.update({
      where: { id: member.id },
      data: { lastReadAt: new Date(), lastReadSeq: targetSeq },
    });
    return { roomId, lastReadSeq: targetSeq.toString() };
  }

  async unreadCounts(userId: string) {
    const members = await this.prisma.chatRoomMember.findMany({
      where: { userId, leftAt: null },
      select: { roomId: true, lastReadSeq: true },
    });
    const entries = await Promise.all(
      members.map(async (m) => [
        m.roomId,
        await this.prisma.message.count({
          where: { roomId: m.roomId, seq: { gt: m.lastReadSeq }, senderId: { not: userId }, deletedAt: null },
        }),
      ] as const),
    );
    return Object.fromEntries(entries);
  }

  async leave(roomId: string, userId: string) {
    const member = await this.assertMember(roomId, userId);
    const room = member.room;
    if (room.type === 'DIRECT') {
      await this.prisma.chatRoomMember.update({ where: { id: member.id }, data: { leftAt: new Date() } });
      return { left: true, roomClosed: false };
    }
    if (room.ownerId === userId) {
      throw apiError(400, 'OWNER_MUST_DELEGATE', '방장은 방장 위임 또는 방 종료 후 나갈 수 있습니다.');
    }
    await this.prisma.chatRoomMember.update({ where: { id: member.id }, data: { leftAt: new Date() } });
    return { left: true, roomClosed: false };
  }

  async toggleMute(roomId: string, userId: string, muted: boolean) {
    const member = await this.assertMember(roomId, userId);
    await this.prisma.chatRoomMember.update({ where: { id: member.id }, data: { muted } });
    return { roomId, muted };
  }

  async search(roomId: string, userId: string, q: string) {
    await this.assertMember(roomId, userId);
    if (!q || q.trim().length < 2) throw apiError(400, 'QUERY_TOO_SHORT', '검색어를 2자 이상 입력해 주세요.');
    const rows = await this.prisma.message.findMany({
      where: { roomId, body: { contains: q, mode: 'insensitive' }, deletedAt: null },
      orderBy: { seq: 'desc' },
      take: 50,
      include: { sender: { select: { nickname: true, status: true } } },
    });
    return this.maskForViewer(rows, userId);
  }

  async exportTxt(roomId: string, userId: string): Promise<string> {
    await this.assertMember(roomId, userId);
    const room = await this.prisma.chatRoom.findUniqueOrThrow({ where: { id: roomId } });
    const rows = await this.prisma.message.findMany({
      where: { roomId, deletedAt: null },
      orderBy: { seq: 'asc' },
      include: { sender: { select: { nickname: true, status: true } } },
    });
    const pairs = await this.blockPairs(roomId);
    const lines = [
      `톡톡 Talk Talk 대화 내보내기`,
      `대화방: ${room.title}`,
      `내보낸 시각: ${new Date().toISOString()}`,
      `메시지 수: ${rows.length}`,
      '─'.repeat(40),
    ];
    for (const m of rows) {
      const time = m.createdAt.toISOString().replace('T', ' ').slice(0, 19);
      const name = m.sender?.status === 'DELETED' ? DELETED_NICKNAME : m.sender?.nickname ?? '';
      const blocked = pairs.has(`${userId}>${m.senderId}`);
      const text = blocked ? '(차단한 회원의 메시지)' : m.deletedAt ? '(삭제된 메시지)' : m.body ?? (m.mediaId ? '[사진]' : '');
      lines.push(`[${time}] ${name}: ${text}`);
    }
    return lines.join('\n');
  }

  /** 1:1 방 중복 생성 방지: noteKey 유니크 + 충돌 시 기존 방 반환 */
  async getOrCreateDirectRoom(userA: string, userB: string): Promise<string> {
    const noteKey = [userA, userB].sort().join(':');
    const existing = await this.prisma.chatRoom.findUnique({ where: { noteKey } });
    if (existing) return existing.id;
    try {
      const room = await this.prisma.$transaction(async (tx) => {
        const created = await tx.chatRoom.create({
          data: { type: RoomType.DIRECT, noteKey, title: '1:1 대화', lastMessageAt: new Date() },
        });
        await tx.chatRoomMember.createMany({
          data: [
            { roomId: created.id, userId: userA },
            { roomId: created.id, userId: userB },
          ],
        });
        // 상호 수락으로 이미 만들어진 다른 요청도 같은 방으로 연결
        await tx.noteRequest.updateMany({
          where: {
            OR: [
              { fromUserId: userA, toUserId: userB, status: 'ACCEPTED' },
              { fromUserId: userB, toUserId: userA, status: 'ACCEPTED' },
            ],
          },
          data: { roomId: created.id },
        });
        return created;
      });
      return room.id;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const room = await this.prisma.chatRoom.findUniqueOrThrow({ where: { noteKey } });
        await this.prisma.chatRoomMember.createMany({
          data: [
            { roomId: room.id, userId: userA },
            { roomId: room.id, userId: userB },
          ],
          skipDuplicates: true,
        });
        return room.id;
      }
      throw e;
    }
  }

  async getOrCreateMarketRoom(sellerId: string, buyerId: string, item: { id: string; title: string; photoMediaId: string | null }) {
    await this.getOrCreateDirectRoom(sellerId, buyerId);
    const noteKey = [sellerId, buyerId].sort().join(':');
    const base = await this.prisma.chatRoom.findUniqueOrThrow({ where: { noteKey } });
    const title = `[장터] ${item.title}`;
    if (base.title !== title) {
      await this.prisma.chatRoom.update({
        where: { id: base.id },
        data: { title, contextType: 'MARKET', contextId: item.id, imageMediaId: item.photoMediaId ?? undefined },
      });
    }
    return base.id;
  }

  private isSuspended(user: { status: string; suspendedUntil: Date | null }): boolean {
    if (user.status === 'ACTIVE') return false;
    if (user.status === 'DELETED') return true;
    return !user.suspendedUntil || user.suspendedUntil > new Date();
  }
}

export function validateNoteMessage(text: string): void {
  if (!text || text.trim().length === 0) {
    throw apiError(400, 'EMPTY_NOTE', '인사말을 입력해 주세요.');
  }
  if (text.length > 200) {
    throw apiError(400, 'NOTE_TOO_LONG', '첫 인사는 200자까지 보낼 수 있습니다.');
  }
  if (containsExternalLink(text)) {
    throw apiError(400, 'LINK_NOT_ALLOWED', '첫 인사에는 사진·외부 링크를 보낼 수 없습니다.');
  }
  const filtered = filterContent(text);
  if (!filtered.allowed) {
    throw apiError(400, filtered.reason === 'PHONE_NUMBER_EXPOSED' ? 'CONTACT_INFO_BLOCKED' : 'PROHIBITED_CONTENT',
      filtered.reason === 'PHONE_NUMBER_EXPOSED'
        ? '연락처(전화번호)는 첫 인사에 포함할 수 없습니다.'
        : '사용할 수 없는 표현이 포함되어 있습니다.');
  }
}
