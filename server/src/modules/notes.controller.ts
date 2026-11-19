import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { NotesService } from './notes.service';

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Post('requests')
  send(@CurrentUser() auth: { sub: string }, @Body() body: { toUserId: string; message: string }) {
    return this.notes.send(auth.sub, body.toUserId, body.message);
  }

  @Get('requests')
  list(@CurrentUser() auth: { sub: string }, @Query('box') box?: 'received' | 'sent') {
    return this.notes.list(auth.sub, box === 'sent' ? 'sent' : 'received');
  }

  @Post('requests/:id/accept')
  accept(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.notes.accept(id, auth.sub);
  }

  @Post('requests/:id/decline')
  decline(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.notes.decline(id, auth.sub);
  }

  @Post('requests/:id/cancel')
  cancel(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.notes.cancel(id, auth.sub);
  }

  @Post('multi/preview')
  preview(@CurrentUser() auth: { sub: string }, @Body() body: { toUserIds: string[] }) {
    return this.notes.multiPreview(auth.sub, body.toUserIds ?? []);
  }

  @Post('multi')
  sendMulti(
    @CurrentUser() auth: { sub: string },
    @Body() body: { toUserIds: string[]; message: string },
  ) {
    return this.notes.sendMulti(auth.sub, body.toUserIds ?? [], body.message);
  }
}
