import { Injectable, Logger } from '@nestjs/common';
import { Gender, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { signToken, verifyToken } from '../common/jwt';
import { env, BRAND, identityConfigIssues } from '../common/config';
import { ageBandOf, ageFromBirthDate, apiError, normalizePhone, maskPhone, publicProfile } from '../common/util';
import { NotificationService } from './notification.service';

const DEV_CODE = '123456';
const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,12}$/;

export interface SignupInput {
  verificationToken: string;
  nickname: string;
  realName: string;
  birthDate: string;
  regionCode: string;
  interests?: string[];
  bio?: string;
  gender?: 'MALE' | 'FEMALE' | 'NONE';
  genderVisible?: boolean;
  ageBand?: string;
  photoMediaId?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
  ) {}

  async requestCode(rawPhone: string, ip: string) {
    const phone = normalizePhone(rawPhone);
    const allowedIp = await this.redis.take(`sms:ip:${ip}`, 60, 600);
    const allowedPhone = await this.redis.take(`sms:phone:${phone}`, 5, 600);
    if (!allowedIp || !allowedPhone) {
      throw apiError(429, 'TOO_MANY_REQUESTS', '인증 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    const code = env.isProduction ? String(Math.floor(100000 + Math.random() * 900000)) : DEV_CODE;
    await this.redis.setJson(`phonecode:${phone}`, { code, attempts: 0 }, 300);

    if (env.isProduction) {
      await this.sendSms(phone, `[${BRAND.service.nameKo}] 인증번호 ${code} (5분 내 입력)`);
    }
    return {
      sent: true,
      phone: maskPhone(phone),
      expiresInSec: 300,
      // 개발 환경에서만 노출
      devCode: env.isProduction ? undefined : DEV_CODE,
    };
  }

  async verifyCode(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const record = await this.redis.getJson<{ code: string; attempts: number }>(`phonecode:${phone}`);
    if (!record) throw apiError(400, 'CODE_EXPIRED', '인증번호가 만료되었습니다. 다시 요청해 주세요.');
    record.attempts += 1;
    if (record.attempts > 5) {
      throw apiError(429, 'CODE_ATTEMPTS_EXCEEDED', '인증 시도 횟수를 초과했습니다. 다시 요청해 주세요.');
    }
    const matched = record.code === code || (!env.isProduction && code === DEV_CODE);
    if (!matched) {
      await this.redis.setJson(`phonecode:${phone}`, record, 300);
      throw apiError(400, 'CODE_MISMATCH', '인증번호가 일치하지 않습니다.');
    }
    const verificationToken = signToken({ sub: phone, kind: 'user', role: 'phone' }, 900);
    return { verified: true, verificationToken, phone: maskPhone(phone) };
  }

  /** 운영 환경 필수 설정 누락 검사(본인확인/성인인증) */
  async assertIdentityConfigured() {
    const issues = identityConfigIssues();
    if (env.isProduction && issues.includes('IDENTITY_PROVIDER')) {
      const setting = await this.prisma.adminSetting.findUnique({ where: { key: 'identity.provider' } });
      const configured = setting && typeof setting.value === 'object' && setting.value !== null
        ? Boolean((setting.value as Record<string, unknown>)['provider'])
        : false;
      if (!configured) {
        throw apiError(503, 'SIGNUP_BLOCKED_IDENTITY_CONFIG',
          '본인확인·성인인증 설정이 완료되지 않아 가입을 진행할 수 없습니다. 운영자에게 문의해 주세요.',
          { missingConfig: issues });
      }
    }
    return true;
  }

  async signup(input: SignupInput, ip: string) {
    const payload = verifyToken(input.verificationToken);
    if (!payload || payload.role !== 'phone') {
      throw apiError(400, 'INVALID_VERIFICATION', '휴대폰 인증을 다시 진행해 주세요.');
    }
    await this.assertIdentityConfigured();
    const phone = payload.sub;

    const nickname = (input.nickname ?? '').trim();
    if (!NICKNAME_PATTERN.test(nickname)) {
      throw apiError(400, 'INVALID_NICKNAME', '닉네임은 한글·영문·숫자·밑줄 2~12자로 입력해 주세요.');
    }
    const birth = new Date(input.birthDate);
    if (Number.isNaN(birth.getTime())) throw apiError(400, 'INVALID_BIRTHDATE', '생년월일이 올바르지 않습니다.');
    const age = ageFromBirthDate(birth);
    const minAge = Number(BRAND.legal.minimumAge ?? 19);
    if (age < minAge) {
      throw apiError(403, 'UNDERAGE', `만 ${minAge}세 이상만 가입할 수 있습니다.`);
    }
    const region = input.regionCode ? await this.prisma.region.findUnique({ where: { code: input.regionCode } }) : null;
    if (!region) throw apiError(400, 'INVALID_REGION', '활동 지역(시군구)을 선택해 주세요.');
    const interests = (input.interests ?? []).filter((i) => typeof i === 'string' && i.trim().length > 0).slice(0, 10);
    if (interests.length === 0) throw apiError(400, 'INTERESTS_REQUIRED', '관심사를 1개 이상 선택해 주세요.');

    const existingPhone = await this.prisma.user.findUnique({ where: { phone } });
    if (existingPhone) throw apiError(409, 'PHONE_ALREADY_REGISTERED', '이미 가입된 휴대폰 번호입니다.');

    const existingNickname = await this.prisma.user.findUnique({ where: { nickname } });
    if (existingNickname) throw apiError(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.');

    if (input.photoMediaId) {
      const media = await this.prisma.media.findUnique({ where: { id: input.photoMediaId } });
      if (!media) throw apiError(400, 'MEDIA_INVALID', '프로필 사진을 다시 업로드해 주세요.');
    }

    const gender: Gender = input.gender === 'MALE' || input.gender === 'FEMALE' ? (input.gender as Gender) : Gender.NONE;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone,
          phoneVerifiedAt: new Date(),
          realName: input.realName?.trim() || null,
          birthDate: birth,
          isAdult: true,
          identityVerified: true,
          identityProvider: env.identityProvider || 'dev',
          nickname,
          photoMediaId: input.photoMediaId ?? null,
          photoUrl: input.photoMediaId ? `/api/v1/media/${input.photoMediaId}` : null,
          ageBand: input.ageBand && ['10s', '20s', '30s', '40s', '50s', '60s+'].includes(input.ageBand)
            ? input.ageBand
            : ageBandOf(age),
          regionCode: region.code,
          regionName: region.name,
          interests,
          bio: input.bio?.slice(0, 500) ?? null,
          gender,
          genderVisible: Boolean(input.genderVisible),
          pushPreview: false,
        },
      });
      await tx.pointAccount.create({ data: { userId: created.id, balance: 0 } });
      await tx.identityVerification.create({
        data: {
          userId: created.id,
          provider: env.identityProvider || 'dev',
          method: 'PHONE',
          verifiedAt: new Date(),
        },
      });
      return created;
    });

    await this.notifications.push(user.id, {
      type: 'SYSTEM',
      title: `${BRAND.service.nameKo}에 오신 것을 환영합니다`,
      body: '주변 이웃에게 가볍게 인사를 건네 보세요.',
      data: {},
    });

    return { token: this.issueToken(user.id), user: await this.me(user.id) };
  }

  async login(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    await this.verifyCode(phone, code);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '가입된 회원이 아닙니다. 먼저 가입해 주세요.');
    if (user.status === 'DELETED') throw apiError(403, 'ACCOUNT_DELETED', '탈퇴한 계정입니다.');
    if (user.status === 'SUSPENDED' && (!user.suspendedUntil || user.suspendedUntil > new Date())) {
      throw apiError(403, 'ACCOUNT_SUSPENDED', '이용이 제한된 계정입니다.', {
        suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
        reason: user.suspensionReason,
      });
    }
    if (user.status === 'SUSPENDED') {
      await this.prisma.user.update({ where: { id: user.id }, data: { status: 'ACTIVE', suspendedUntil: null, suspensionReason: null } });
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
    return { token: this.issueToken(user.id), user: await this.me(user.id) };
  }

  /** SMS 발송: 운영 환경에서는 문자 발송 대행사 API 사용 */
  private async sendSms(phone: string, text: string): Promise<void> {
    const endpoint = process.env.SMS_API_URL;
    const apiKey = process.env.SMS_API_KEY;
    if (!endpoint || !apiKey) {
      this.logger.warn(`SMS API 미설정 → 발송 생략 (${maskPhone(phone)})`);
      return;
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ to: phone, text }),
    });
    if (!res.ok) this.logger.error(`SMS 발송 실패: ${res.status}`);
  }

  issueToken(userId: string): string {
    return signToken({ sub: userId, kind: 'user', role: 'user' });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { pointAccount: true, region: true },
    });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '회원 정보를 찾을 수 없습니다.');
    const unreadNotifications = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return {
      id: user.id,
      phone: maskPhone(user.phone),
      nickname: user.nickname,
      photoUrl: user.photoUrl,
      ageBand: user.ageBand,
      gender: user.gender,
      genderVisible: user.genderVisible,
      regionCode: user.regionCode,
      regionName: user.regionName,
      interests: user.interests,
      bio: user.bio,
      isAdult: user.isAdult,
      identityVerified: user.identityVerified,
      status: user.status,
      points: user.pointAccount?.balance ?? 0,
      settings: {
        showNearby: user.showNearby,
        showLastActive: user.showLastActive,
        receiveGreetings: user.receiveGreetings,
        allowMultiNote: user.allowMultiNote,
        pushEnabled: user.pushEnabled,
        pushPreview: user.pushPreview,
      },
      unreadNotifications,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async updateProfile(userId: string, body: Record<string, unknown>) {
    const data: Prisma.UserUpdateInput = {};
    if (typeof body.nickname === 'string') {
      const nickname = body.nickname.trim();
      if (!NICKNAME_PATTERN.test(nickname)) throw apiError(400, 'INVALID_NICKNAME', '닉네임 형식이 올바르지 않습니다.');
      const taken = await this.prisma.user.findFirst({ where: { nickname, NOT: { id: userId } } });
      if (taken) throw apiError(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임입니다.');
      data.nickname = nickname;
    }
    if (typeof body.bio === 'string') data.bio = body.bio.slice(0, 500);
    if (typeof body.ageBand === 'string' && ['10s', '20s', '30s', '40s', '50s', '60s+'].includes(body.ageBand)) {
      data.ageBand = body.ageBand;
    }
    if (typeof body.photoMediaId === 'string') {
      const media = await this.prisma.media.findUnique({ where: { id: body.photoMediaId } });
      if (!media || media.ownerId !== userId) throw apiError(400, 'MEDIA_INVALID', '사진을 다시 업로드해 주세요.');
      data.photoMediaId = media.id;
      data.photoUrl = `/api/v1/media/${media.id}`;
    }
    if (body.photoMediaId === null) {
      data.photoMediaId = null;
      data.photoUrl = null;
    }
    if (typeof body.regionCode === 'string') {
      const region = await this.prisma.region.findUnique({ where: { code: body.regionCode } });
      if (!region) throw apiError(400, 'INVALID_REGION', '지역을 다시 선택해 주세요.');
      data.region = { connect: { code: region.code } };
      data.regionName = region.name;
    }
    if (Array.isArray(body.interests)) {
      data.interests = body.interests.filter((i): i is string => typeof i === 'string').slice(0, 10);
    }
    if (body.gender === 'MALE' || body.gender === 'FEMALE' || body.gender === 'NONE') data.gender = body.gender as Gender;
    if (typeof body.genderVisible === 'boolean') data.genderVisible = body.genderVisible;
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.me(userId);
  }

  async updateSettings(userId: string, body: Record<string, unknown>) {
    const allowed = ['showNearby', 'showLastActive', 'receiveGreetings', 'allowMultiNote', 'pushEnabled', 'pushPreview'] as const;
    const data: Record<string, boolean> = {};
    for (const key of allowed) {
      if (typeof body[key] === 'boolean') data[key] = body[key] as boolean;
    }
    if (Object.keys(data).length === 0) throw apiError(400, 'NO_SETTINGS', '변경할 설정이 없습니다.');
    await this.prisma.user.update({ where: { id: userId }, data });
    return this.me(userId);
  }

  /** 계정 삭제: 프로필·사진·푸시토큰·검색 노출 제거 후 탈퇴 처리 */
  async deleteAccount(userId: string, body: { reason?: string; confirm?: string }) {
    if (body.confirm !== 'DELETE') {
      throw apiError(400, 'CONFIRM_REQUIRED', "계정 삭제를 진행하려면 confirm 값에 'DELETE'를 입력해 주세요.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '회원 정보를 찾을 수 없습니다.');

    const media = await this.prisma.media.findMany({ where: { ownerId: userId } });
    const tokens = await this.prisma.deviceToken.count({ where: { userId } });
    const suffix = userId.slice(-6).toLowerCase();

    await this.prisma.$transaction(async (tx) => {
      await tx.deviceToken.deleteMany({ where: { userId } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.noteRequest.updateMany({
        where: {
          status: 'PENDING',
          OR: [{ fromUserId: userId }, { toUserId: userId }],
        },
        data: { status: 'CANCELED' },
      });
      await tx.chatRoomMember.updateMany({ where: { userId }, data: { leftAt: new Date(), muted: true } });
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DELETED',
          nickname: `탈퇴한 회원 ${suffix}`,
          realName: null,
          birthDate: null,
          phone: `deleted-${suffix}-${user.phone}`,
          photoMediaId: null,
          photoUrl: null,
          bio: null,
          interests: [],
          gender: 'NONE',
          genderVisible: false,
          showNearby: false,
          showLastActive: false,
          receiveGreetings: false,
          allowMultiNote: false,
          searchable: false,
          pushEnabled: false,
          pushPreview: false,
          deletedAt: new Date(),
          region: { disconnect: true },
          regionName: null,
        },
      });
      await tx.media.updateMany({ where: { ownerId: userId }, data: { ownerId: null, isPrivate: true } });
      await tx.accountDeletionLog.create({
        data: {
          userId,
          reason: body.reason?.slice(0, 300) ?? null,
          removed: {
            profilePhoto: Boolean(user.photoMediaId),
            mediaCount: media.length,
            pushTokens: tokens,
            nickname: user.nickname,
          } as object,
        },
      });
    });

    for (const m of media) {
      // 스토리지 파일은 남겨두되 접근 권한을 제거(대화 상대의 대화 기록 유지).
      void m;
    }
    return { deleted: true, removed: { profile: true, photos: media.length, pushTokens: tokens, searchable: false } };
  }

  async registerDevice(userId: string, token: string, platform: string) {
    const device = await this.prisma.deviceToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform },
    });
    return { id: device.id, platform: device.platform };
  }

  async removeDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
    return { removed: true };
  }

  async publicProfileOf(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw apiError(404, 'USER_NOT_FOUND', '회원을 찾을 수 없습니다.');
    return publicProfile(user);
  }
}
