import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../common/auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  rooms(@CurrentUser() auth: { sub: string }) {
    return this.chat.listRooms(auth.sub);
  }

  @Get('unread')
  unread(@CurrentUser() auth: { sub: string }) {
    return this.chat.unreadCounts(auth.sub);
  }

  @Get('rooms/:id')
  room(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.chat.getRoom(id, auth.sub);
  }

  @Get('rooms/:id/messages')
  messages(
    @CurrentUser() auth: { sub: string },
    @Param('id') id: string,
    @Query() query: { beforeSeq?: string; limit?: string },
  ) {
    return this.chat.listMessages(id, auth.sub, {
      beforeSeq: query.beforeSeq,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Get('rooms/:id/messages/sync')
  sync(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Query('afterSeq') afterSeq: string) {
    return this.chat.syncMessages(id, auth.sub, afterSeq ?? '0');
  }

  @Post('rooms/:id/messages')
  send(
    @CurrentUser() auth: { sub: string },
    @Param('id') id: string,
    @Body() body: { type?: 'TEXT' | 'IMAGE'; body?: string; mediaId?: string; clientMessageId?: string },
  ) {
    return this.chat.sendMessage(id, auth.sub, body);
  }

  @Post('rooms/:id/read')
  read(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { seq?: string }) {
    return this.chat.markRead(id, auth.sub, body?.seq);
  }

  @Post('rooms/:id/leave')
  leave(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.chat.leave(id, auth.sub);
  }

  @Patch('rooms/:id/mute')
  mute(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { muted: boolean }) {
    return this.chat.toggleMute(id, auth.sub, Boolean(body?.muted));
  }

  @Get('rooms/:id/search')
  search(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Query('q') q: string) {
    return this.chat.search(id, auth.sub, q);
  }

  @Get('rooms/:id/export')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async export(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Res() res: Response) {
    const text = await this.chat.exportTxt(id, auth.sub);
    res.setHeader('Content-Disposition', `attachment; filename="talk-talk-${id}.txt"`);
    res.send(text);
  }
}
