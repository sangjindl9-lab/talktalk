import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser, Public } from '../common/auth.guard';
import { PrismaService } from '../common/prisma.service';
import { env, BRAND, identityConfigIssues } from '../common/config';
import { apiError } from '../common/util';

@Controller()
export class MiscController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('notices')
  async notices() {
    return this.prisma.notice.findMany({
      where: { published: true },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
      take: 30,
      select: { id: true, title: true, body: true, pinned: true, createdAt: true },
    });
  }

  @Public()
  @Get('notices/:id')
  async notice(@Param('id') id: string) {
    const notice = await this.prisma.notice.findFirst({ where: { id, published: true } });
    if (!notice) throw apiError(404, 'NOTICE_NOT_FOUND', '공지를 찾을 수 없습니다.');
    return notice;
  }

  @Post('inquiries')
  async inquiry(
    @CurrentUser() auth: { sub: string },
    @Body() body: { title: string; body: string; email?: string },
  ) {
    if (!body?.title || !body?.body) throw apiError(400, 'INQUIRY_REQUIRED', '문의 제목과 내용을 입력해 주세요.');
    const user = await this.prisma.user.findUnique({ where: { id: auth.sub } });
    const inquiry = await this.prisma.inquiry.create({
      data: {
        userId: auth.sub,
        name: user?.nickname ?? '회원',
        email: body.email ?? BRAND.service.supportEmail,
        title: body.title.slice(0, 120),
        body: body.body.slice(0, 3000),
      },
    });
    return { id: inquiry.id, status: inquiry.status, createdAt: inquiry.createdAt.toISOString() };
  }

  @Get('inquiries/mine')
  async myInquiries(@CurrentUser() auth: { sub: string }) {
    return this.prisma.inquiry.findMany({ where: { userId: auth.sub }, orderBy: { createdAt: 'desc' } });
  }

  @Public()
  @Get('app/info')
  info() {
    return {
      service: BRAND.service,
      theme: BRAND.theme,
      legal: BRAND.legal,
      operatorContact: {
        email: BRAND.service.supportEmail,
        phone: BRAND.service.supportPhone,
        hours: '평일 10:00~18:00 (점심 12:00~13:00)',
      },
      environment: env.nodeEnv,
      missingConfig: identityConfigIssues(),
      features: {
        multiNote: true,
        promotion: true,
        regionBrowse: true,
        roomCapacityExpand: true,
      },
    };
  }
}

@Controller()
export class HealthController {
  @Public()
  @Get('/health')
  health() {
    return { ok: true, service: BRAND.service.nameKo, time: new Date().toISOString() };
  }
}
