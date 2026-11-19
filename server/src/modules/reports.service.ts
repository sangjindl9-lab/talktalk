import { Injectable } from '@nestjs/common';
import { Prisma, ReportReason, ReportTargetType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { apiError, publicProfile } from '../common/util';
import { ChatService } from './chat.service';

const REASONS: Record<string, ReportReason> = {
  SPAM: 'SPAM', ABUSE: 'ABUSE', SEXUAL: 'SEXUAL', FRAUD: 'FRAUD', ILLEGAL: 'ILLEGAL', ETC: 'ETC',
  스팸: 'SPAM', 욕설: 'ABUSE', 음란: 'SEXUAL', 사기: 'FRAUD', 불법: 'ILLEGAL', 기타: 'ETC',
};
const TARGETS: Record<string, ReportTargetType> = {
  PROFILE: 'PROFILE', MESSAGE: 'MESSAGE', PHOTO: 'PHOTO', POST: 'POST', COMMENT: 'COMMENT', ROOM: 'ROOM',
  프로필: 'PROFILE', 메시지: 'MESSAGE', 사진: 'PHOTO', 게시글: 'POST', 댓글: 'COMMENT', 그룹방: 'ROOM',
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  private async buildSnapshot(targetType: ReportTargetType, targetId: string, reporterId: string) {
    switch (targetType) {
      case 'PROFILE': {
        const user = await this.prisma.user.findUnique({ where: { id: targetId } });
        if (!user) throw apiError(404, 'TARGET_NOT_FOUND', '신고 대상을 찾을 수 없습니다.');
        return {
          targetUserId: user.id,
          snapshot: { type: 'PROFILE', profile: publicProfile(user), bio: user.bio, reportedAt: new Date().toISOString() },
        };
      }
      case 'MESSAGE': {
        const message = await this.prisma.message.findUnique({
          where: { id: targetId },
          include: { sender: { select: { id: true, nickname: true, status: true } }, room: { select: { id: true, type: true, title: true } } },
        });
        if (!message) throw apiError(404, 'TARGET_NOT_FOUND', '신고할 메시지를 찾을 수 없습니다.');
        if (message.senderId === reporterId) throw apiError(400, 'CANNOT_REPORT_OWN', '본인 메시지는 신고할 수 없습니다.');
        await this.chat.assertMember(message.roomId, reporterId);
        return {
          targetUserId: message.senderId,
          snapshot: {
            type: 'MESSAGE',
            messageId: message.id,
            roomType: message.room.type,
            roomTitle: message.room.title,
            senderId: message.senderId,
            body: message.body,
            mediaId: message.mediaId,
            createdAt: message.createdAt.toISOString(),
            capturedAt: new Date().toISOString(),
          },
        };
      }
      case 'PHOTO': {
        const media = await this.prisma.media.findUnique({ where: { id: targetId } });
        if (!media) throw apiError(404, 'TARGET_NOT_FOUND', '신고할 사진을 찾을 수 없습니다.');
        return {
          targetUserId: media.ownerId,
          snapshot: {
            type: 'PHOTO',
            mediaId: media.id,
            kind: media.kind,
            storageKey: media.storageKey,
            uploadedAt: media.createdAt.toISOString(),
            capturedAt: new Date().toISOString(),
          },
        };
      }
      case 'POST': {
        const post = await this.prisma.boardPost.findUnique({ where: { id: targetId }, include: { author: true } });
        if (!post) throw apiError(404, 'TARGET_NOT_FOUND', '신고할 게시글을 찾을 수 없습니다.');
        return {
          targetUserId: post.authorId,
          snapshot: {
            type: 'POST',
            postId: post.id,
            title: post.title,
            body: post.body,
            photoMediaId: post.photoMediaId,
            author: publicProfile(post.author),
            createdAt: post.createdAt.toISOString(),
            capturedAt: new Date().toISOString(),
          },
        };
      }
      case 'COMMENT': {
        const comment = await this.prisma.postComment.findUnique({ where: { id: targetId }, include: { author: true, post: { select: { id: true, title: true } } } });
        if (!comment) throw apiError(404, 'TARGET_NOT_FOUND', '신고할 댓글을 찾을 수 없습니다.');
        return {
          targetUserId: comment.authorId,
          snapshot: {
            type: 'COMMENT',
            commentId: comment.id,
            postId: comment.post.id,
            postTitle: comment.post.title,
            body: comment.body,
            author: publicProfile(comment.author),
            createdAt: comment.createdAt.toISOString(),
            capturedAt: new Date().toISOString(),
          },
        };
      }
      case 'ROOM':
      default: {
        const room = await this.prisma.chatRoom.findUnique({ where: { id: targetId } });
        if (!room) throw apiError(404, 'TARGET_NOT_FOUND', '신고할 방을 찾을 수 없습니다.');
        return {
          targetUserId: room.ownerId,
          snapshot: {
            type: 'ROOM',
            roomId: room.id,
            title: room.title,
            description: room.description,
            ownerId: room.ownerId,
            createdAt: room.createdAt.toISOString(),
            capturedAt: new Date().toISOString(),
          },
        };
      }
    }
  }

  async create(
    reporterId: string,
    body: { targetType: string; targetId: string; reason: string; detail?: string },
  ) {
    const targetType = TARGETS[String(body.targetType ?? '').toUpperCase()] ?? TARGETS[String(body.targetType ?? '')];
    const reason = REASONS[String(body.reason ?? '').toUpperCase()] ?? REASONS[String(body.reason ?? '')];
    if (!targetType) throw apiError(400, 'INVALID_TARGET_TYPE', '신고 대상 유형을 확인해 주세요.');
    if (!reason) throw apiError(400, 'INVALID_REASON', '신고 사유를 선택해 주세요.');
    if (!body.targetId) throw apiError(400, 'TARGET_REQUIRED', '신고 대상이 필요합니다.');

    const recent = await this.prisma.report.findFirst({
      where: {
        reporterId,
        targetType,
        targetId: body.targetId,
        createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) },
      },
    });
    if (recent) throw apiError(409, 'ALREADY_REPORTED', '이미 신고한 대상입니다. 검토 결과를 기다려 주세요.');

    const { snapshot, targetUserId } = await this.buildSnapshot(targetType, body.targetId, reporterId);
    if (targetUserId === reporterId && targetType !== 'ROOM') {
      throw apiError(400, 'CANNOT_REPORT_SELF', '본인은 신고할 수 없습니다.');
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType,
        targetId: body.targetId,
        targetUserId: targetUserId ?? null,
        reason,
        detail: body.detail?.slice(0, 1000) ?? null,
        snapshot: snapshot as Prisma.InputJsonValue,
        status: 'RECEIVED',
      },
    });
    return {
      id: report.id,
      status: report.status,
      targetType: report.targetType,
      reason: report.reason,
      createdAt: report.createdAt.toISOString(),
    };
  }

  async mine(userId: string) {
    const rows = await this.prisma.report.findMany({
      where: { reporterId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, targetType: true, reason: true, status: true, resolution: true, createdAt: true, resolvedAt: true },
    });
    return rows;
  }

  async appeal(userId: string, body: { reportId?: string; message: string }) {
    if (!body.message || body.message.trim().length < 5) {
      throw apiError(400, 'APPEAL_MESSAGE_REQUIRED', '이의신청 내용을 입력해 주세요.');
    }
    const appeal = await this.prisma.appeal.create({
      data: { userId, reportId: body.reportId ?? null, message: body.message.slice(0, 2000) },
    });
    return { id: appeal.id, status: appeal.status, createdAt: appeal.createdAt.toISOString() };
  }

  async myAppeals(userId: string) {
    return this.prisma.appeal.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }
}
