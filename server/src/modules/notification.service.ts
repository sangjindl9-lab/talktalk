import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RealtimeService } from '../common/realtime.service';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /**
   * 알림 저장 + 푸시 발송. 푸시 미리보기(pushPreview)가 꺼져 있으면 본문을 일반 문구로 치환하고,
   * 알림 수신이 꺼진 사용자에게는 저장만 하고 발송하지 않는다.
   */
  async push(
    userId: string,
    payload: { type: NotificationType; title: string; body: string; data?: Record<string, unknown> },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status === 'DELETED') return null;

    const title = user.pushPreview ? payload.title : '톡톡 Talk Talk';
    const body = user.pushPreview ? payload.body : '새로운 알림이 도착했습니다.';

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type: payload.type,
        title,
        body,
        data: (payload.data ?? {}) as object,
        pushSent: user.pushEnabled,
      },
    });
    if (user.pushEnabled) {
      this.realtime.emitToUser(userId, 'notification:new', {
        id: notification.id,
        type: notification.type,
        title,
        body,
        createdAt: notification.createdAt.toISOString(),
      });
    }
    return notification;
  }

  async list(userId: string, limit = 50) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async markRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && ids.length > 0 ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
