import { Body, Controller, Delete, Get, Headers, Ip, Patch, Post, Req } from '@nestjs/common';
import { Public, CurrentUser } from '../common/auth.guard';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { BRAND, env } from '../common/config';
import { apiError } from '../common/util';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('config')
  config() {
    return {
      service: BRAND.service,
      theme: BRAND.theme,
      legal: BRAND.legal,
      minimumAge: Number(BRAND.legal.minimumAge ?? 19),
      signupFields: ['nickname', 'realName', 'birthDate', 'regionCode', 'interests'],
      optionalFields: ['photoMediaId', 'bio', 'gender', 'genderVisible', 'ageBand'],
      identity: {
        provider: env.identityProvider || null,
        production: env.isProduction,
        devAccountsSupported: !env.isProduction,
      },
      push: BRAND.push,
    };
  }

  @Public()
  @Post('phone/request')
  requestCode(@Body() body: { phone: string }, @Ip() ip: string) {
    if (!body?.phone) throw apiError(400, 'PHONE_REQUIRED', '휴대폰 번호를 입력해 주세요.');
    return this.auth.requestCode(body.phone, ip);
  }

  @Public()
  @Post('phone/verify')
  verify(@Body() body: { phone: string; code: string }) {
    if (!body?.phone || !body?.code) throw apiError(400, 'CODE_REQUIRED', '인증번호를 입력해 주세요.');
    return this.auth.verifyCode(body.phone, body.code);
  }

  @Public()
  @Post('signup')
  signup(@Body() body: Parameters<AuthService['signup']>[0], @Ip() ip: string) {
    return this.auth.signup(body, ip);
  }

  @Public()
  @Post('login')
  login(@Body() body: { phone: string; code: string }) {
    if (!body?.phone || !body?.code) throw apiError(400, 'CODE_REQUIRED', '휴대폰 번호와 인증번호를 입력해 주세요.');
    return this.auth.login(body.phone, body.code);
  }

  @Post('logout')
  logout() {
    return { ok: true };
  }

  @Get('session')
  session(@CurrentUser() auth: { sub: string }) {
    return this.auth.me(auth.sub);
  }
}

@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly notifications: NotificationService,
  ) {}

  @Get()
  me(@CurrentUser() auth: { sub: string }) {
    return this.auth.me(auth.sub);
  }

  @Patch()
  update(@CurrentUser() auth: { sub: string }, @Body() body: Record<string, unknown>) {
    return this.auth.updateProfile(auth.sub, body);
  }

  @Patch('settings')
  settings(@CurrentUser() auth: { sub: string }, @Body() body: Record<string, unknown>) {
    return this.auth.updateSettings(auth.sub, body);
  }

  @Delete()
  deleteAccount(
    @CurrentUser() auth: { sub: string },
    @Body() body: { reason?: string; confirm?: string },
  ) {
    return this.auth.deleteAccount(auth.sub, body ?? {});
  }

  @Get('notifications')
  notificationList(@CurrentUser() auth: { sub: string }) {
    return this.notifications.list(auth.sub);
  }

  @Post('notifications/read')
  readNotifications(@CurrentUser() auth: { sub: string }, @Body() body: { ids?: string[] }) {
    return this.notifications.markRead(auth.sub, body?.ids);
  }

  @Post('devices')
  registerDevice(
    @CurrentUser() auth: { sub: string },
    @Body() body: { token: string; platform?: string },
  ) {
    if (!body?.token) throw apiError(400, 'TOKEN_REQUIRED', '푸시 토큰이 필요합니다.');
    return this.auth.registerDevice(auth.sub, body.token, body.platform ?? 'android');
  }

  @Delete('devices')
  removeDevice(@CurrentUser() auth: { sub: string }, @Body() body: { token: string }) {
    return this.auth.removeDevice(auth.sub, body?.token ?? '');
  }

  @Get('public/:id')
  publicProfile(@CurrentUser() auth: { sub: string }, @Req() req: { params: { id: string } }) {
    return this.auth.publicProfileOf(req.params.id);
  }
}
