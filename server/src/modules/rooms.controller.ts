import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  list(
    @CurrentUser() auth: { sub: string },
    @Query() query: { type?: string; regionCode?: string; q?: string; mine?: string },
  ) {
    return this.rooms.list(auth.sub, query);
  }

  @Post()
  create(@CurrentUser() auth: { sub: string }, @Body() body: Record<string, unknown>) {
    return this.rooms.create(auth.sub, body);
  }

  @Get('regions/:regionCode')
  regionRoom(@CurrentUser() auth: { sub: string }, @Param('regionCode') regionCode: string) {
    return this.rooms.ensureRegionRoom(regionCode, auth.sub);
  }

  @Post('regions/:regionCode/join')
  joinRegion(@CurrentUser() auth: { sub: string }, @Param('regionCode') regionCode: string) {
    return this.rooms.joinRegion(auth.sub, regionCode);
  }

  @Get(':id')
  detail(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.rooms.detail(id, auth.sub);
  }

  @Post(':id/join')
  join(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { message?: string }) {
    return this.rooms.join(auth.sub, id, body?.message);
  }

  @Post(':id/leave')
  leave(
    @CurrentUser() auth: { sub: string },
    @Param('id') id: string,
    @Body() body: { transferToUserId?: string; close?: boolean },
  ) {
    return this.rooms.leave(id, auth.sub, body ?? {});
  }

  @Patch(':id')
  update(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.rooms.update(id, auth.sub, body);
  }

  @Get(':id/join-requests')
  joinRequests(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.rooms.joinRequests(id, auth.sub);
  }

  @Post(':id/join-requests/:userId/approve')
  approve(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Param('userId') userId: string) {
    return this.rooms.approveJoin(id, auth.sub, userId);
  }

  @Post(':id/join-requests/:userId/reject')
  reject(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Param('userId') userId: string) {
    return this.rooms.rejectJoin(id, auth.sub, userId);
  }

  @Post(':id/kick')
  kick(
    @CurrentUser() auth: { sub: string },
    @Param('id') id: string,
    @Body() body: { userId: string; restrictRejoin?: boolean },
  ) {
    return this.rooms.kick(id, auth.sub, body.userId, Boolean(body.restrictRejoin));
  }

  @Post(':id/roles')
  setRole(
    @CurrentUser() auth: { sub: string },
    @Param('id') id: string,
    @Body() body: { userId: string; role: 'MANAGER' | 'MEMBER' },
  ) {
    return this.rooms.setRole(id, auth.sub, body.userId, body.role);
  }

  @Post(':id/transfer-owner')
  transfer(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.rooms.transferOwner(id, auth.sub, body.userId);
  }

  @Post(':id/capacity/expand')
  expand(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { add?: number }) {
    return this.rooms.expandCapacity(id, auth.sub, body?.add ?? 10);
  }
}
