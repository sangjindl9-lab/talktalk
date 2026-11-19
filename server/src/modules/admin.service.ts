import { Injectable, Logger } from '@nestjs/common';
import { AdminRole, ModerationActionType, Prisma } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { PointsService } from '../common/points.service';
import { apiError, maskName, maskPhone } from '../common/util';
import { env } from '../common/config';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function checkPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

const MODERATION_ROLES: AdminRole[] = ['SUPERADMIN', 'MODERATOR'];
const FINANCE_ROLES: AdminRole[] = ['SUPERADMIN', 'FINANCE'];
const SUPPORT_ROLES: AdminRole[] = ['SUPERADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'];

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly points: PointsService,
  ) {}

  async login(email: string, password: string, ip: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email: (email ?? '').toLowerCase().trim() } });
    if (!admin || !admin.active || !checkPassword(password ?? '', admin.passwordHash)) {
      throw apiError(401, 'ADMIN_LOGIN_FAILED', '이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { adminId: admin.id, action: 'ADMIN_LOGIN', targetType: 'ADMIN', targetId: admin.id, ip },
    });
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
  }

  async me(adminId: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) throw apiError(404, 'ADMIN_NOT_FOUND', '관리자를 찾을 수 없습니다.');
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role, lastLoginAt: admin.lastLoginAt };
  }

  private assertRole(admin: { role: AdminRole }, roles: AdminRole[]) {
    if (!roles.includes(admin.role)) {
      throw apiError(403, 'ADMIN_FORBIDDEN', '이 작업을 수행할 권한이 없습니다.');
    }
  }

  async audit(
    adminId: string | null,
    action: string,
    targetType?: string,
    targetId?: string,
    detail?: Record<string, unknown>,
    ip?: string,
    reportId?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        reportId,
        detail: (detail ?? {}) as Prisma.InputJsonValue,
        ip,
      },
    });
  }

  async dashboard() {
    const [users, activeUsers, suspended, rooms, reportsOpen, posts, payments, appeals, todayUsers] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE', lastActiveAt: { gt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.chatRoom.count({ where: { status: 'ACTIVE' } }),
      this.prisma.report.count({ where: { status: { in: ['RECEIVED', 'REVIEWING'] } } }),
      this.prisma.boardPost.count({ where: { status: 'ACTIVE' } }),
      this.prisma.payment.count({ where: { status: 'VERIFIED' } }),
      this.prisma.appeal.count({ where: { status: 'OPEN' } }),
      this.prisma.user.count({ where: { createdAt: { gt: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ]);
    const recentReports = await this.prisma.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, targetType: true, reason: true, status: true, createdAt: true },
    });
    const openReportsByType = await this.prisma.report.groupBy({
      by: ['targetType'],
      where: { status: { in: ['RECEIVED', 'REVIEWING'] } },
      _count: { _all: true },
    });
    return {
      users,
      activeUsers,
      suspended,
      todayUsers,
      rooms,
      reportsOpen,
      posts,
      payments,
      appeals,
      recentReports,
      openReportsByType: openReportsByType.map((r) => ({ targetType: r.targetType, count: r._count._all })),
      identityConfig: await this.identityStatus(),
    };
  }

  async identityStatus() {
    const setting = await this.prisma.adminSetting.findUnique({ where: { key: 'identity.provider' } });
    const configured =
      Boolean(env.identityProvider) &&
      (setting && typeof setting.value === 'object' && setting.value !== null
        ? Boolean((setting.value as Record<string, unknown>)['provider'])
        : true);
    return {
      provider: env.identityProvider || null,
      configured: Boolean(configured),
      production: env.isProduction,
      warning: env.isProduction && !configured ? '본인확인/성인인증 설정이 없어 신규 가입이 중단됩니다.' : null,
    };
  }

  async listReports(query: { status?: string; targetType?: string; q?: string; limit?: string }) {
    const where: Prisma.ReportWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    if (query.targetType) where.targetType = query.targetType.toUpperCase() as never;
    if (query.q) where.OR = [{ detail: { contains: query.q, mode: 'insensitive' } }, { resolution: { contains: query.q, mode: 'insensitive' } }];
    const rows = await this.prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit ?? 50), 200),
      include: {
        reporter: { select: { id: true, nickname: true } },
        targetUser: { select: { id: true, nickname: true, status: true } },
        assignee: { select: { id: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      targetType: r.targetType,
      targetId: r.targetId,
      reason: r.reason,
      status: r.status,
      detail: r.detail,
      reporter: r.reporter,
      targetUser: r.targetUser,
      assignee: r.assignee,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }

  /** 신고 증거 열람: 담당자(배정된 관리자) 또는 최고관리자만 가능, 열람 자체를 감사로그로 기록 */
  async reportDetail(admin: { sub: string; role: string }, reportId: string, ip: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: {
        reporter: { select: { id: true, nickname: true, status: true } },
        targetUser: { select: { id: true, nickname: true, status: true, suspendedUntil: true } },
        assignee: { select: { id: true, name: true, role: true } },
        actions: { include: { admin: { select: { id: true, name: true, role: true } } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!report) throw apiError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');

    const role = admin.role as AdminRole;
    const assigned = report.assignedTo === admin.sub;
    if (role !== 'SUPERADMIN' && !(role === 'MODERATOR' && assigned)) {
      throw apiError(403, 'EVIDENCE_FORBIDDEN',
        '본인에게 배정된 신고의 증거만 열람할 수 있습니다. 먼저 담당자로 배정해 주세요.');
    }

    await this.audit(admin.sub, 'REPORT_EVIDENCE_VIEWED', 'REPORT', reportId, { reportId, targetType: report.targetType }, ip, reportId);

    return {
      id: report.id,
      status: report.status,
      targetType: report.targetType,
      targetId: report.targetId,
      reason: report.reason,
      detail: report.detail,
      snapshot: report.snapshot,
      resolution: report.resolution,
      reporter: report.reporter,
      targetUser: report.targetUser
        ? { ...report.targetUser, suspendedUntil: report.targetUser.suspendedUntil?.toISOString() ?? null }
        : null,
      assignee: report.assignee,
      actions: report.actions.map((a) => ({
        id: a.id,
        actionType: a.actionType,
        note: a.note,
        admin: a.admin,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      evidenceViewedLogged: true,
    };
  }

  async assign(admin: { sub: string; role: string }, reportId: string, targetAdminId?: string) {
    this.assertRole({ role: admin.role as AdminRole }, MODERATION_ROLES);
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw apiError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
    const assigneeId = targetAdminId ?? admin.sub;
    const assignee = await this.prisma.adminUser.findUnique({ where: { id: assigneeId } });
    if (!assignee) throw apiError(404, 'ADMIN_NOT_FOUND', '담당자를 찾을 수 없습니다.');
    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: { assignedTo: assigneeId, status: report.status === 'RECEIVED' ? 'REVIEWING' : report.status },
    });
    await this.audit(admin.sub, 'REPORT_ASSIGNED', 'REPORT', reportId, { assigneeId });
    return { id: updated.id, assignedTo: assigneeId, status: updated.status };
  }

  async act(
    admin: { sub: string; role: string },
    reportId: string,
    body: { actionType: string; note?: string; suspendDays?: number },
    ip: string,
  ) {
    this.assertRole({ role: admin.role as AdminRole }, MODERATION_ROLES);
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw apiError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');
    if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
      throw apiError(409, 'REPORT_ALREADY_CLOSED', '이미 처리가 완료된 신고입니다.');
    }
    const actionType = String(body.actionType ?? '').toUpperCase() as ModerationActionType;
    const allowed: ModerationActionType[] = ['WARN', 'HIDE_CONTENT', 'SUSPEND_7D', 'SUSPEND_30D', 'PERMANENT_BAN', 'DISMISS', 'RESTORE'];
    if (!allowed.includes(actionType)) throw apiError(400, 'INVALID_ACTION', '처리 유형을 확인해 주세요.');

    const note = body.note?.slice(0, 1000) ?? null;
    const targetUserId = report.targetUserId;

    const result = await this.prisma.$transaction(async (tx) => {
      let applied: Record<string, unknown> = {};

      if (actionType === 'HIDE_CONTENT') {
        if (report.targetType === 'MESSAGE') {
          await tx.message.update({ where: { id: report.targetId }, data: { hiddenByAdmin: true } });
          applied = { hidden: 'MESSAGE' };
        } else if (report.targetType === 'POST') {
          await tx.boardPost.update({ where: { id: report.targetId }, data: { status: 'HIDDEN' } });
          applied = { hidden: 'POST' };
        } else if (report.targetType === 'COMMENT') {
          await tx.postComment.update({ where: { id: report.targetId }, data: { status: 'HIDDEN' } });
          applied = { hidden: 'COMMENT' };
        } else if (report.targetType === 'PHOTO') {
          await tx.media.update({ where: { id: report.targetId }, data: { isPrivate: true } });
          applied = { hidden: 'PHOTO' };
        } else if (report.targetType === 'ROOM') {
          await tx.chatRoom.update({ where: { id: report.targetId }, data: { status: 'BLOCKED' } });
          applied = { hidden: 'ROOM' };
        }
      }

      if (targetUserId && (actionType === 'SUSPEND_7D' || actionType === 'SUSPEND_30D' || actionType === 'PERMANENT_BAN')) {
        const days = actionType === 'SUSPEND_7D' ? 7 : actionType === 'SUSPEND_30D' ? 30 : null;
        const suspendedUntil = days ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
        await tx.user.update({
          where: { id: targetUserId },
          data: {
            status: 'SUSPENDED',
            suspendedUntil,
            suspensionReason: `${report.reason}${note ? ` - ${note}` : ''}`.slice(0, 300),
          },
        });
        applied = { suspendedUntil: suspendedUntil?.toISOString() ?? 'PERMANENT' };
      }

      if (actionType === 'RESTORE' && targetUserId) {
        await tx.user.update({
          where: { id: targetUserId },
          data: { status: 'ACTIVE', suspendedUntil: null, suspensionReason: null },
        });
        applied = { restored: true };
      }

      const moderationAction = await tx.moderationAction.create({
        data: {
          reportId: report.id,
          adminId: admin.sub,
          actionType,
          targetType: report.targetType,
          targetId: report.targetId,
          note,
        },
      });

      const resolved = actionType !== 'WARN';
      const updatedReport = await tx.report.update({
        where: { id: report.id },
        data: {
          status: actionType === 'DISMISS' ? 'DISMISSED' : resolved ? 'RESOLVED' : 'REVIEWING',
          resolution: note ?? actionType,
          resolvedAt: resolved ? new Date() : null,
          assignedTo: report.assignedTo ?? admin.sub,
        },
      });

      await tx.auditLog.create({
        data: {
          adminId: admin.sub,
          action: `REPORT_ACTION_${actionType}`,
          targetType: report.targetType,
          targetId: report.targetId,
          reportId: report.id,
          detail: { applied, note } as Prisma.InputJsonValue,
          ip,
        },
      });

      return { moderationAction, updatedReport, applied };
    });

    const resolutionLabel: Record<string, string> = {
      WARN: '경고 조치', HIDE_CONTENT: '콘텐츠 숨김', SUSPEND_7D: '7일 이용 제한',
      SUSPEND_30D: '30일 이용 제한', PERMANENT_BAN: '영구 이용 제한', DISMISS: '신고 기각', RESTORE: '이용 제한 해제',
    };

    await this.prisma.notification.create({
      data: {
        userId: report.reporterId,
        type: 'REPORT_RESULT',
        title: '신고 처리 결과 안내',
        body: `접수하신 신고가 검토되어 ${resolutionLabel[actionType] ?? actionType} 처리되었습니다.`,
        data: { reportId: report.id } as object,
        pushSent: true,
      },
    });
    if (targetUserId) {
      await this.prisma.notification.create({
        data: {
          userId: targetUserId,
          type: 'REPORT_RESULT',
          title: '이용 제한 안내',
          body: `${resolutionLabel[actionType] ?? actionType}이 적용되었습니다.${note ? ` 사유: ${note}` : ''}`,
          data: { reportId: report.id } as object,
          pushSent: true,
        },
      });
    }

    return {
      reportId: report.id,
      status: result.updatedReport.status,
      actionType,
      applied: result.applied,
      actionId: result.moderationAction.id,
      resolvedAt: result.updatedReport.resolvedAt?.toISOString() ?? null,
    };
  }

  async listUsers(query: { q?: string; status?: string; limit?: string; cursor?: string }) {
    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    if (query.q) {
      where.OR = [
        { nickname: { contains: query.q, mode: 'insensitive' } },
        { phone: { contains: query.q } },
      ];
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit ?? 30), 100),
      include: { pointAccount: true, region: true },
    });
    return rows.map((u) => ({
      id: u.id,
      nickname: u.nickname,
      phone: maskPhone(u.phone),
      realName: maskName(u.realName),
      status: u.status,
      regionName: u.regionName,
      ageBand: u.ageBand,
      points: u.pointAccount?.balance ?? 0,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastActiveAt.toISOString(),
    }));
  }

  async userDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { pointAccount: true, region: true },
    });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '회원을 찾을 수 없습니다.');
    const [reportsAgainst, reportsFiled, payments, notes, rooms] = await Promise.all([
      this.prisma.report.count({ where: { targetUserId: userId } }),
      this.prisma.report.count({ where: { reporterId: userId } }),
      this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.noteRequest.count({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } }),
      this.prisma.chatRoomMember.count({ where: { userId, leftAt: null } }),
    ]);
    return {
      id: user.id,
      nickname: user.nickname,
      phone: maskPhone(user.phone),
      realName: maskName(user.realName),
      birthDate: user.birthDate ? `${user.birthDate.toISOString().slice(0, 10)}` : null,
      isAdult: user.isAdult,
      status: user.status,
      suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
      suspensionReason: user.suspensionReason,
      regionName: user.regionName,
      ageBand: user.ageBand,
      interests: user.interests,
      bio: user.bio,
      points: user.pointAccount?.balance ?? 0,
      settings: {
        showNearby: user.showNearby,
        pushEnabled: user.pushEnabled,
        pushPreview: user.pushPreview,
      },
      counts: { reportsAgainst, reportsFiled, payments: payments.length, notes, rooms },
      payments,
      createdAt: user.createdAt.toISOString(),
      lastActiveAt: user.lastActiveAt.toISOString(),
      deletedAt: user.deletedAt?.toISOString() ?? null,
    };
  }

  async suspendUser(admin: { sub: string; role: string }, userId: string, days: number | null, reason: string, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, MODERATION_ROLES);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '회원을 찾을 수 없습니다.');
    const suspendedUntil = days ? new Date(Date.now() + days * 24 * 3600 * 1000) : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'SUSPENDED', suspendedUntil, suspensionReason: reason?.slice(0, 300) ?? null },
    });
    await this.audit(admin.sub, 'USER_SUSPENDED', 'USER', userId, { days, reason }, ip);
    await this.prisma.notification.create({
      data: {
        userId,
        type: 'REPORT_RESULT',
        title: '이용 제한 안내',
        body: reason ? `이용이 제한되었습니다. 사유: ${reason}` : '이용이 제한되었습니다.',
        pushSent: true,
        data: {} as object,
      },
    });
    return { userId, status: 'SUSPENDED', suspendedUntil: suspendedUntil?.toISOString() ?? null };
  }

  async restoreUser(admin: { sub: string; role: string }, userId: string, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, MODERATION_ROLES);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', suspendedUntil: null, suspensionReason: null },
    });
    await this.audit(admin.sub, 'USER_RESTORED', 'USER', userId, {}, ip);
    return { userId, status: 'ACTIVE' };
  }

  async adjustPoints(admin: { sub: string; role: string }, userId: string, amount: number, memo: string, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, FINANCE_ROLES);
    if (!Number.isFinite(amount) || amount === 0) throw apiError(400, 'INVALID_AMOUNT', '조정 금액을 확인해 주세요.');
    const balance = amount > 0
      ? await this.points.credit(userId, amount, 'ADMIN_ADJUST', { type: 'admin', memo })
      : await this.points.spend(userId, -amount, { type: 'admin', memo });
    await this.audit(admin.sub, 'POINTS_ADJUSTED', 'USER', userId, { amount, memo }, ip);
    return { userId, amount, balance };
  }

  async listRooms(query: { q?: string; status?: string; type?: string }) {
    const where: Prisma.ChatRoomWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    if (query.type) where.type = query.type.toUpperCase() as never;
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    const rows = await this.prisma.chatRoom.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { members: { where: { leftAt: null } }, owner: { select: { id: true, nickname: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      regionCode: r.regionCode,
      status: r.status,
      memberCount: r.members.length,
      capacity: r.capacity,
      owner: r.owner,
      visibility: r.visibility,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listPosts(query: { q?: string; status?: string }) {
    const where: Prisma.BoardPostWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    if (query.q) where.title = { contains: query.q, mode: 'insensitive' };
    const rows = await this.prisma.boardPost.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { author: { select: { id: true, nickname: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      regionCode: p.regionCode,
      status: p.status,
      author: p.author,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async setPostStatus(admin: { sub: string; role: string }, postId: string, status: string, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, MODERATION_ROLES);
    const next = status.toUpperCase();
    if (!['ACTIVE', 'HIDDEN', 'DELETED'].includes(next)) throw apiError(400, 'INVALID_STATUS', '상태를 확인해 주세요.');
    await this.prisma.boardPost.update({ where: { id: postId }, data: { status: next as never } });
    await this.audit(admin.sub, 'POST_STATUS_CHANGED', 'POST', postId, { status: next }, ip);
    return { postId, status: next };
  }

  async ledger(query: { userId?: string; type?: string; limit?: string }) {
    const where: Prisma.PointTransactionWhereInput = {};
    if (query.userId) where.userId = query.userId;
    if (query.type) where.type = query.type.toUpperCase() as never;
    const rows = await this.prisma.pointTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit ?? 100), 300),
      include: { user: { select: { id: true, nickname: true } } },
    });
    return rows.map((t) => ({
      id: t.id,
      userId: t.userId,
      nickname: t.user.nickname,
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      refType: t.refType,
      refId: t.refId,
      memo: t.memo,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async payments(query: { status?: string; limit?: string }) {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit ?? 100), 300),
      include: { user: { select: { id: true, nickname: true } } },
    });
    return rows.map((p) => ({
      id: p.id,
      userId: p.userId,
      nickname: p.user.nickname,
      platform: p.platform,
      productId: p.productId,
      transactionId: p.transactionId,
      points: p.points,
      amount: p.amount,
      status: p.status,
      verifiedAt: p.verifiedAt?.toISOString() ?? null,
      refundedAt: p.refundedAt?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
    }));
  }

  async refundPayment(admin: { sub: string; role: string }, paymentId: string, reason: string, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, FINANCE_ROLES);
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw apiError(404, 'PAYMENT_NOT_FOUND', '결제를 찾을 수 없습니다.');
    if (payment.status === 'REFUNDED') throw apiError(409, 'ALREADY_REFUNDED', '이미 환불된 결제입니다.');
    if (payment.status !== 'VERIFIED') throw apiError(409, 'NOT_REFUNDABLE', '검증 완료된 결제만 환불할 수 있습니다.');

    const account = await this.points.ensureAccount(payment.userId);
    const deduction = Math.min(payment.points, account.balance);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.pointAccount.update({
        where: { userId: payment.userId },
        data: { balance: { decrement: deduction } },
      });
      const updated = await tx.pointAccount.findUniqueOrThrow({ where: { userId: payment.userId } });
      await tx.pointTransaction.create({
        data: {
          userId: payment.userId,
          type: 'REFUND',
          amount: -deduction,
          balanceAfter: updated.balance,
          refType: 'payment',
          refId: payment.id,
          memo: `환불${reason ? ` - ${reason}` : ''}`,
        },
      });
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED', refundedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          adminId: admin.sub,
          action: 'PAYMENT_REFUNDED',
          targetType: 'PAYMENT',
          targetId: payment.id,
          detail: { points: deduction, reason } as Prisma.InputJsonValue,
          ip,
        },
      });
      return updated.balance;
    });

    return { paymentId, status: 'REFUNDED', deductedPoints: deduction, balance: result };
  }

  async notices() {
    return this.prisma.notice.findMany({ orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] });
  }

  async createNotice(admin: { sub: string }, body: { title: string; body: string; pinned?: boolean; published?: boolean }) {
    if (!body.title || !body.body) throw apiError(400, 'NOTICE_REQUIRED', '공지 제목과 내용을 입력해 주세요.');
    const notice = await this.prisma.notice.create({
      data: {
        title: body.title.slice(0, 120),
        body: body.body.slice(0, 5000),
        pinned: Boolean(body.pinned),
        published: body.published !== false,
        authorId: admin.sub,
      },
    });
    await this.audit(admin.sub, 'NOTICE_CREATED', 'NOTICE', notice.id, { title: notice.title });
    return notice;
  }

  async updateNotice(admin: { sub: string }, id: string, body: Record<string, unknown>) {
    const notice = await this.prisma.notice.update({
      where: { id },
      data: {
        ...(typeof body.title === 'string' ? { title: body.title.slice(0, 120) } : {}),
        ...(typeof body.body === 'string' ? { body: body.body.slice(0, 5000) } : {}),
        ...(typeof body.pinned === 'boolean' ? { pinned: body.pinned } : {}),
        ...(typeof body.published === 'boolean' ? { published: body.published } : {}),
      },
    });
    await this.audit(admin.sub, 'NOTICE_UPDATED', 'NOTICE', id, {});
    return notice;
  }

  async deleteNotice(admin: { sub: string }, id: string) {
    await this.prisma.notice.delete({ where: { id } });
    await this.audit(admin.sub, 'NOTICE_DELETED', 'NOTICE', id, {});
    return { deleted: true };
  }

  async inquiries(query: { status?: string }) {
    const where: Prisma.InquiryWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    const rows = await this.prisma.inquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, nickname: true } } },
    });
    return rows;
  }

  async answerInquiry(admin: { sub: string }, id: string, answer: string) {
    if (!answer || answer.trim().length < 2) throw apiError(400, 'ANSWER_REQUIRED', '답변 내용을 입력해 주세요.');
    const inquiry = await this.prisma.inquiry.update({
      where: { id },
      data: { answer: answer.slice(0, 3000), answeredAt: new Date(), status: 'ANSWERED' },
    });
    if (inquiry.userId) {
      await this.prisma.notification.create({
        data: {
          userId: inquiry.userId,
          type: 'SYSTEM',
          title: '문의 답변이 등록되었습니다',
          body: inquiry.title,
          data: { inquiryId: inquiry.id } as object,
          pushSent: true,
        },
      });
    }
    await this.audit(admin.sub, 'INQUIRY_ANSWERED', 'INQUIRY', id, {});
    return inquiry;
  }

  async appeals(query: { status?: string }) {
    const where: Prisma.AppealWhereInput = {};
    if (query.status) where.status = query.status.toUpperCase() as never;
    return this.prisma.appeal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, nickname: true, status: true, suspendedUntil: true } } },
    });
  }

  async resolveAppeal(admin: { sub: string; role: string }, id: string, accept: boolean, response: string, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, MODERATION_ROLES);
    const appeal = await this.prisma.appeal.findUnique({ where: { id } });
    if (!appeal) throw apiError(404, 'APPEAL_NOT_FOUND', '이의신청을 찾을 수 없습니다.');
    if (appeal.status !== 'OPEN') throw apiError(409, 'APPEAL_CLOSED', '이미 처리된 이의신청입니다.');
    await this.prisma.appeal.update({
      where: { id },
      data: { status: accept ? 'ACCEPTED' : 'REJECTED', response: response?.slice(0, 2000) ?? null, resolvedAt: new Date() },
    });
    if (accept) {
      await this.prisma.user.update({
        where: { id: appeal.userId },
        data: { status: 'ACTIVE', suspendedUntil: null, suspensionReason: null },
      });
    }
    await this.audit(admin.sub, accept ? 'APPEAL_ACCEPTED' : 'APPEAL_REJECTED', 'APPEAL', id, { accept }, ip);
    return { id, status: accept ? 'ACCEPTED' : 'REJECTED', response };
  }

  async settings() {
    const rows = await this.prisma.adminSetting.findMany({ orderBy: { key: 'asc' } });
    return {
      settings: Object.fromEntries(rows.map((r) => [r.key, r.value])),
      identity: await this.identityStatus(),
      roleMatrix: {
        SUPERADMIN: ['전체'],
        MODERATOR: ['신고 처리', '회원 제재', '게시물/방 숨김', '이의신청'],
        SUPPORT: ['문의 응대', '공지 작성', '조회'],
        FINANCE: ['결제/환불', '포인트 원장 조정'],
      },
    };
  }

  async updateSettings(admin: { sub: string; role: string }, body: Record<string, unknown>, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, ['SUPERADMIN']);
    const entries = Object.entries(body ?? {});
    if (entries.length === 0) throw apiError(400, 'NO_SETTINGS', '변경할 설정이 없습니다.');
    for (const [key, value] of entries) {
      if (!['price.', 'billing.', 'identity.', 'content.', 'app.'].some((prefix) => key.startsWith(prefix))) {
        throw apiError(400, 'INVALID_SETTING_KEY', `허용되지 않은 설정 키입니다: ${key}`);
      }
      await this.prisma.adminSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedBy: admin.sub },
        update: { value: value as Prisma.InputJsonValue, updatedBy: admin.sub },
      });
    }
    await this.audit(admin.sub, 'SETTINGS_UPDATED', 'SETTING', undefined, { keys: entries.map(([k]) => k) }, ip);
    return this.settings();
  }

  async auditLogs(query: { action?: string; adminId?: string; limit?: string }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
    if (query.adminId) where.adminId = query.adminId;
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(query.limit ?? 100), 300),
      include: { admin: { select: { id: true, name: true, role: true } } },
    });
    return rows;
  }

  async admins() {
    const rows = await this.prisma.adminUser.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((a) => ({ id: a.id, email: a.email, name: a.name, role: a.role, active: a.active, lastLoginAt: a.lastLoginAt }));
  }

  async createAdmin(admin: { sub: string; role: string }, body: { email: string; password: string; name: string; role: string }, ip: string) {
    this.assertRole({ role: admin.role as AdminRole }, ['SUPERADMIN']);
    const roles: AdminRole[] = ['SUPERADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE'];
    const role = body.role?.toUpperCase() as AdminRole;
    if (!roles.includes(role)) throw apiError(400, 'INVALID_ROLE', '권한 값을 확인해 주세요.');
    if (!body.email || !body.password || body.password.length < 8) {
      throw apiError(400, 'INVALID_ADMIN', '이메일과 8자 이상의 비밀번호가 필요합니다.');
    }
    const created = await this.prisma.adminUser.create({
      data: { email: body.email.toLowerCase().trim(), passwordHash: hashPassword(body.password), name: body.name ?? body.email, role },
    });
    await this.audit(admin.sub, 'ADMIN_CREATED', 'ADMIN', created.id, { role }, ip);
    return { id: created.id, email: created.email, role: created.role };
  }
}
