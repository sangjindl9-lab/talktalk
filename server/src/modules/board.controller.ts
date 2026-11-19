import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { BoardService } from './board.service';
import { PromotionsService } from './promotions.service';

@Controller('board')
export class BoardController {
  constructor(
    private readonly board: BoardService,
    private readonly promotions: PromotionsService,
  ) {}

  @Get('posts')
  list(
    @CurrentUser() auth: { sub: string },
    @Query() query: { regionCode?: string; category?: string; limit?: string; cursor?: string },
  ) {
    return this.board.list(auth.sub, { ...query, limit: query.limit ? Number(query.limit) : undefined });
  }

  @Post('posts')
  create(@CurrentUser() auth: { sub: string }, @Body() body: Record<string, unknown>) {
    return this.board.create(auth.sub, body);
  }

  @Get('posts/:id')
  detail(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.board.detail(id, auth.sub);
  }

  @Delete('posts/:id')
  remove(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.board.remove(id, auth.sub);
  }

  @Post('posts/:id/comments')
  comment(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { body: string }) {
    return this.board.comment(id, auth.sub, body.body);
  }

  @Post('posts/:id/like')
  like(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.board.toggleLike(id, auth.sub);
  }

  @Post('posts/:id/bookmark')
  bookmark(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.board.toggleBookmark(id, auth.sub);
  }

  @Post('posts/:id/promote')
  promote(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { days?: number }) {
    return this.board.promote(id, auth.sub, Number(body?.days ?? 1));
  }

  @Get('promotions')
  promotionHistory(@CurrentUser() auth: { sub: string }) {
    return this.promotions.history(auth.sub);
  }
}
