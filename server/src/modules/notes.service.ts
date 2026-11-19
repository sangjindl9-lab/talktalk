import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../common/points.service';
import { RealtimeService } from '../common/realtime.service';
import { apiError } from '../common/util';
import { ChatService, validateNoteMessage } from './chat.service';
import { NotificationService } from './notification.service';

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly points: PointsService,
    private readonly notifications: NotificationService,
    private readonly realtime: RealtimeService,
  ) {}

  private async assertReachable(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) throw apiError(400, 'SELF_NOTE', '본인에게는 인사를 보낼 수 없습니다.');
    const target = await this.prisma.user.findUnique({ where: { id: toUserId } });
    if (!target || target.status === 'DELETED') throw apiError(404, 'USER_NOT_FOUND', '회원을 찾을 수 없습니다.');
    if (target.status === 'SUSPENDED') throw apiError(403, 'TARGET_SUSPENDED', '이용이 제한된 회원입니다.');
    if (!target.receiveGreetings) throw apiError(403, 'GREETING_REFUSED', '인사 받기를 거부한 회원입니다.');
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: fromUserId, blockedId: toUserId },
          { blockerId: toUserId, blockedId: fromUserId },
        ],
      },
    });
    if (blocked) throw apiError(403, 'BLOCKED', '차단 관계에서는 인사를 보낼 수 없습니다.');
    return target;
  }

  async send(userId: string, toUserId: string, message: string) {
    validateNoteMessage(message);
    const target = await this.assertReachable(userId, toUserId);

    const noteKey = [userId, toUserId].sort().join(':');
    const existingRoom = await this.prisma.chatRoom.findUnique({ where: { noteKey } });
    if (existingRoom) throw apiError(409, 'ALREADY_CHATTING', '이미 대화 중인 상대입니다.', { roomId: existingRoom.id });

    const pendingFromMe = await this.prisma.noteRequest.findFirst({
      where: { fromUserId: userId, toUserId, status: 'PENDING' },
    });
    if (pendingFromMe) {
      throw apiError(409, 'NOTE_PENDING_EXISTS', '이미 인사를 보냈습니다. 상대의 수락을 기다려 주세요.', { noteId: pendingFromMe.id });
    }
    const pendingFromTarget = await this.prisma.noteRequest.findFirst({
      where: { fromUserId: toUserId, toUserId: userId, status: 'PENDING' },
    });
    if (pendingFromTarget) {
      throw apiError(409, 'MUTUAL_PENDING', '상대가 먼저 인사를 보냈습니다. 수락하면 바로 대화할 수 있어요.', {
        noteId: pendingFromTarget.id,
      });
    }

    let note;
    try {
      note = await this.prisma.noteRequest.create({
        data: { fromUserId: userId, toUserId, message: message.trim(), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
        include: { fromUser: { select: { nickname: true, photoUrl: true } } },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw apiError(409, 'NOTE_PENDING_EXISTS', '이미 인사를 보냈습니다. 상대의 수락을 기다려 주세요.');
      }
      throw e;
    }

    const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.notifications.push(toUserId, {
      type: 'NOTE_REQUEST',
      title: `${sender.nickname}님이 인사를 보냈습니다`,
      body: note.message.slice(0, 60),
      data: { noteId: note.id, fromUserId: userId },
    });
    this.realtime.emitToUser(toUserId, 'note:request', {
      id: note.id,
      fromUserId: userId,
      nickname: sender.nickname,
      photoUrl: sender.photoUrl,
      message: note.message,
      createdAt: note.createdAt.toISOString(),
    });

    return {
      id: note.id,
      toUserId: target.id,
      status: note.status,
      message: note.message,
      createdAt: note.createdAt.toISOString(),
    };
  }

  async list(userId: string, box: 'received' | 'sent' = 'received') {
    const rows = await this.prisma.noteRequest.findMany({
      where: box === 'received' ? { toUserId: userId } : { fromUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        fromUser: { select: { id: true, nickname: true, photoUrl: true, ageBand: true, regionName: true, status: true } },
        toUser: { select: { id: true, nickname: true, photoUrl: true, ageBand: true, regionName: true, status: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message,
      roomId: r.roomId,
      createdAt: r.createdAt.toISOString(),
      from: r.fromUser,
      to: r.toUser,
    }));
  }

  /**
   * 인사 수락: 동시/상호 수락에도 1개의 방만 생성된다.
   * - noteKey 유니크 제약 + 트랜잭션 + P2002 충돌 시 기존 방 재사용
   * - 상대가 보낸 대기 중 인사도 함께 수락 처리해 중복 방/중복 요청을 막는다.
   */
  async accept(noteId: string, userId: string) {
    const note = await this.prisma.noteRequest.findUnique({ where: { id: noteId } });
    if (!note) throw apiError(404, 'NOTE_NOT_FOUND', '인사를 찾을 수 없습니다.');
    if (note.toUserId !== userId) throw apiError(403, 'NOT_RECIPIENT', '받은 인사만 수락할 수 있습니다.');
    if (note.status === 'ACCEPTED' && note.roomId) {
      return { roomId: note.roomId, alreadyAccepted: true };
    }
    if (note.status !== 'PENDING') throw apiError(409, 'NOTE_NOT_PENDING', '이미 처리된 인사입니다.');

    const target = await this.prisma.user.findUnique({ where: { id: note.fromUserId } });
    if (!target || target.status !== 'ACTIVE') {
      await this.prisma.noteRequest.update({ where: { id: note.id }, data: { status: 'CANCELED' } });
      throw apiError(409, 'SENDER_UNAVAILABLE', '상대 회원이 더 이상 활동 중이 아닙니다.');
    }
    const blocked = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: note.fromUserId },
          { blockerId: note.fromUserId, blockedId: userId },
        ],
      },
    });
    if (blocked) {
      await this.prisma.noteRequest.update({ where: { id: note.id }, data: { status: 'DECLINED' } });
      throw apiError(403, 'BLOCKED', '차단 관계에서는 수락할 수 없습니다.');
    }

    // 1) 상태 전이(동시 요청 중 하나만 성공)
    const updated = await this.prisma.noteRequest.updateMany({
      where: { id: note.id, status: 'PENDING' },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    if (updated.count === 0) {
      const current = await this.prisma.noteRequest.findUnique({ where: { id: note.id } });
      if (current?.status === 'ACCEPTED' && current.roomId) return { roomId: current.roomId, alreadyAccepted: true };
      throw apiError(409, 'NOTE_NOT_PENDING', '이미 처리된 인사입니다.');
    }

    // 2) 방 생성(중복 방지) 후 연결
    const roomId = await this.chat.getOrCreateDirectRoom(note.fromUserId, note.toUserId);

    await this.prisma.$transaction([
      this.prisma.noteRequest.update({ where: { id: note.id }, data: { roomId } }),
      this.prisma.noteRequest.updateMany({
        where: {
          fromUserId: userId,
          toUserId: note.fromUserId,
          status: 'PENDING',
        },
        data: { status: 'ACCEPTED', roomId, respondedAt: new Date() },
      }),
      this.prisma.chatRoomMember.updateMany({
        where: { roomId, userId: { in: [note.fromUserId, note.toUserId] }, leftAt: { not: null } },
        data: { leftAt: null },
      }),
    ]);

    await this.notifications.push(note.fromUserId, {
      type: 'NOTE_ACCEPTED',
      title: '인사를 수락했습니다',
      body: '지금 바로 대화를 시작해 보세요.',
      data: { roomId, noteId: note.id },
    });
    this.realtime.emitToUser(note.fromUserId, 'note:accepted', { noteId: note.id, roomId });

    return { roomId, alreadyAccepted: false };
  }

  async decline(noteId: string, userId: string) {
    const note = await this.prisma.noteRequest.findUnique({ where: { id: noteId } });
    if (!note) throw apiError(404, 'NOTE_NOT_FOUND', '인사를 찾을 수 없습니다.');
    if (note.toUserId !== userId) throw apiError(403, 'NOT_RECIPIENT', '받은 인사만 거절할 수 있습니다.');
    if (note.status !== 'PENDING') throw apiError(409, 'NOTE_NOT_PENDING', '이미 처리된 인사입니다.');
    await this.prisma.noteRequest.update({
      where: { id: note.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });
    return { declined: true };
  }

  async cancel(noteId: string, userId: string) {
    const note = await this.prisma.noteRequest.findUnique({ where: { id: noteId } });
    if (!note) throw apiError(404, 'NOTE_NOT_FOUND', '인사를 찾을 수 없습니다.');
    if (note.fromUserId !== userId) throw apiError(403, 'NOT_SENDER', '보낸 인사만 취소할 수 있습니다.');
    if (note.status !== 'PENDING') throw apiError(409, 'NOTE_NOT_PENDING', '이미 처리된 인사입니다.');
    await this.prisma.noteRequest.update({ where: { id: note.id }, data: { status: 'CANCELED' } });
    return { canceled: true };
  }

  async multiPreview(userId: string, toUserIds: string[]) {
    const ids = [...new Set(toUserIds || [])].filter((id) => typeof id === 'string');
    const prices = await this.points.settingPrices();
    const pricePerRecipient = prices['price.multiNote'] ?? 50;
    const eligible: string[] = [];
    const skipped: { userId: string; reason: string }[] = [];
    for (const id of ids) {
      if (id === userId) {
        skipped.push({ userId: id, reason: 'SELF' });
        continue;
      }
      try {
        await this.assertReachable(userId, id);
        const noteKey = [userId, id].sort().join(':');
        if (await this.prisma.chatRoom.findUnique({ where: { noteKey } })) {
          skipped.push({ userId: id, reason: 'ALREADY_CHATTING' });
          continue;
        }
        const pending = await this.prisma.noteRequest.findFirst({
          where: {
            OR: [
              { fromUserId: userId, toUserId: id, status: 'PENDING' },
              { fromUserId: id, toUserId: userId, status: 'PENDING' },
            ],
          },
        });
        if (pending) {
          skipped.push({ userId: id, reason: 'PENDING_EXISTS' });
          continue;
        }
        eligible.push(id);
      } catch (e) {
        const err = e as { response?: { code?: string } };
        skipped.push({ userId: id, reason: err.response?.code ?? 'INELIGIBLE' });
      }
    }
    const balance = await this.points.balance(userId);
    return {
      requestedCount: ids.length,
      eligibleCount: eligible.length,
      pricePerRecipient,
      totalCost: eligible.length * pricePerRecipient,
      balance,
      canSend: balance >= eligible.length * pricePerRecipient,
      eligibleUserIds: eligible,
      skipped,
    };
  }

  async sendMulti(userId: string, toUserIds: string[], message: string) {
    validateNoteMessage(message);
    const preview = await this.multiPreview(userId, toUserIds);
    if (preview.eligibleCount === 0) {
      throw apiError(400, 'NO_ELIGIBLE_RECIPIENTS', '발송 가능한 수신자가 없습니다.', { skipped: preview.skipped });
    }
    if (preview.balance < preview.totalCost) {
      throw apiError(402, 'INSUFFICIENT_POINTS', '포인트가 부족합니다.', {
        required: preview.totalCost,
        balance: preview.balance,
        eligibleCount: preview.eligibleCount,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      if (preview.totalCost > 0) {
        await this.points.spend(userId, preview.totalCost, { type: 'multi_note', memo: `다중 인사 ${preview.eligibleCount}명` }, tx);
      }
      const rows: string[] = [];
      for (const toUserId of preview.eligibleUserIds) {
        try {
          const note = await tx.noteRequest.create({
            data: { fromUserId: userId, toUserId, message: message.trim(), expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) },
          });
          rows.push(note.id);
        } catch (e) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
          throw e;
        }
      }
      return rows;
    });

    const sender = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    for (let i = 0; i < preview.eligibleUserIds.length; i += 1) {
      const toUserId = preview.eligibleUserIds[i];
      const noteId = created[i];
      if (!noteId) continue;
      await this.notifications.push(toUserId, {
        type: 'NOTE_REQUEST',
        title: `${sender.nickname}님이 인사를 보냈습니다`,
        body: message.slice(0, 60),
        data: { noteId, fromUserId: userId },
      });
      this.realtime.emitToUser(toUserId, 'note:request', { id: noteId, fromUserId: userId, nickname: sender.nickname, message });
    }

    return {
      sentCount: created.length,
      charged: created.length * preview.pricePerRecipient,
      balance: await this.points.balance(userId),
      skipped: preview.skipped,
      noteIds: created,
    };
  }
}
