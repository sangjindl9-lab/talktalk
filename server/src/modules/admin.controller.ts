import { Body, Controller, Delete, Get, Headers, Ip, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AdminGuard, AdminOnly, CurrentAdmin, Public } from '../common/auth.guard';
import { AdminService } from './admin.service';
import { signToken } from '../common/jwt';
import { env } from '../common/config';

interface AdminCtx { sub: string; role: string }

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly admin: AdminService) {}

  @Public()
  @Post('login')
  async login(@Body() body: { email: string; password: string }, @Ip() ip: string) {
    const admin = await this.admin.login(body?.email, body?.password, ip);
    const token = signToken({ sub: admin.id, kind: 'admin', role: admin.role }, env.adminJwtExpiresInSec);
    return { token, admin };
  }

  @AdminOnly()
  @UseGuards(AdminGuard)
  @Get('me')
  me(@CurrentAdmin() admin: AdminCtx) {
    return this.admin.me(admin.sub);
  }
}

@AdminOnly()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.admin.dashboard();
  }

  @Get('reports')
  reports(@Query() query: { status?: string; targetType?: string; q?: string; limit?: string }) {
    return this.admin.listReports(query);
  }

  @Get('reports/:id')
  reportDetail(@CurrentAdmin() admin: AdminCtx, @Param('id') id: string, @Ip() ip: string) {
    return this.admin.reportDetail(admin, id, ip);
  }

  @Post('reports/:id/assign')
  assign(@CurrentAdmin() admin: AdminCtx, @Param('id') id: string, @Body() body: { adminId?: string }) {
    return this.admin.assign(admin, id, body?.adminId);
  }

  @Post('reports/:id/actions')
  act(
    @CurrentAdmin() admin: AdminCtx,
    @Param('id') id: string,
    @Body() body: { actionType: string; note?: string; suspendDays?: number },
    @Ip() ip: string,
  ) {
    return this.admin.act(admin, id, body, ip);
  }

  @Get('users')
  users(@Query() query: { q?: string; status?: string; limit?: string }) {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  userDetail(@Param('id') id: string) {
    return this.admin.userDetail(id);
  }

  @Post('users/:id/suspend')
  suspend(
    @CurrentAdmin() admin: AdminCtx,
    @Param('id') id: string,
    @Body() body: { days?: number | null; reason?: string },
    @Ip() ip: string,
  ) {
    return this.admin.suspendUser(admin, id, body?.days ?? 7, body?.reason ?? '', ip);
  }

  @Post('users/:id/restore')
  restore(@CurrentAdmin() admin: AdminCtx, @Param('id') id: string, @Ip() ip: string) {
    return this.admin.restoreUser(admin, id, ip);
  }

  @Post('users/:id/points')
  adjustPoints(
    @CurrentAdmin() admin: AdminCtx,
    @Param('id') id: string,
    @Body() body: { amount: number; memo?: string },
    @Ip() ip: string,
  ) {
    return this.admin.adjustPoints(admin, id, Number(body?.amount), body?.memo ?? '', ip);
  }

  @Get('rooms')
  rooms(@Query() query: { q?: string; status?: string; type?: string }) {
    return this.admin.listRooms(query);
  }

  @Get('posts')
  posts(@Query() query: { q?: string; status?: string }) {
    return this.admin.listPosts(query);
  }

  @Patch('posts/:id/status')
  postStatus(
    @CurrentAdmin() admin: AdminCtx,
    @Param('id') id: string,
    @Body() body: { status: string },
    @Ip() ip: string,
  ) {
    return this.admin.setPostStatus(admin, id, body.status, ip);
  }

  @Get('ledger')
  ledger(@Query() query: { userId?: string; type?: string; limit?: string }) {
    return this.admin.ledger(query);
  }

  @Get('payments')
  payments(@Query() query: { status?: string; limit?: string }) {
    return this.admin.payments(query);
  }

  @Post('payments/:id/refund')
  refund(
    @CurrentAdmin() admin: AdminCtx,
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @Ip() ip: string,
  ) {
    return this.admin.refundPayment(admin, id, body?.reason ?? '', ip);
  }

  @Get('appeals')
  appeals(@Query() query: { status?: string }) {
    return this.admin.appeals(query);
  }

  @Post('appeals/:id/resolve')
  resolveAppeal(
    @CurrentAdmin() admin: AdminCtx,
    @Param('id') id: string,
    @Body() body: { accept: boolean; response?: string },
    @Ip() ip: string,
  ) {
    return this.admin.resolveAppeal(admin, id, Boolean(body?.accept), body?.response ?? '', ip);
  }

  @Get('notices')
  notices() {
    return this.admin.notices();
  }

  @Post('notices')
  createNotice(@CurrentAdmin() admin: AdminCtx, @Body() body: { title: string; body: string; pinned?: boolean }) {
    return this.admin.createNotice(admin, body);
  }

  @Patch('notices/:id')
  updateNotice(@CurrentAdmin() admin: AdminCtx, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateNotice(admin, id, body);
  }

  @Delete('notices/:id')
  deleteNotice(@CurrentAdmin() admin: AdminCtx, @Param('id') id: string) {
    return this.admin.deleteNotice(admin, id);
  }

  @Get('inquiries')
  inquiries(@Query() query: { status?: string }) {
    return this.admin.inquiries(query);
  }

  @Post('inquiries/:id/answer')
  answer(@CurrentAdmin() admin: AdminCtx, @Param('id') id: string, @Body() body: { answer: string }) {
    return this.admin.answerInquiry(admin, id, body?.answer);
  }

  @Get('settings')
  settings() {
    return this.admin.settings();
  }

  @Put('settings')
  updateSettings(@CurrentAdmin() admin: AdminCtx, @Body() body: Record<string, unknown>, @Ip() ip: string) {
    return this.admin.updateSettings(admin, body, ip);
  }

  @Get('audit-logs')
  auditLogs(@Query() query: { action?: string; adminId?: string; limit?: string }) {
    return this.admin.auditLogs(query);
  }

  @Get('accounts')
  accounts() {
    return this.admin.admins();
  }

  @Post('accounts')
  createAccount(
    @CurrentAdmin() admin: AdminCtx,
    @Body() body: { email: string; password: string; name: string; role: string },
    @Ip() ip: string,
  ) {
    return this.admin.createAdmin(admin, body, ip);
  }
}
