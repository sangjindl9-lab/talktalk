import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { MarketService } from './market.service';

@Controller('market')
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get('items')
  list(@Query() query: { regionCode?: string; type?: string; status?: string; limit?: string }) {
    return this.market.list({ ...query, limit: query.limit ? Number(query.limit) : undefined });
  }

  @Post('items')
  create(@CurrentUser() auth: { sub: string }, @Body() body: Record<string, unknown>) {
    return this.market.create(auth.sub, body);
  }

  @Get('items/mine')
  mine(@CurrentUser() auth: { sub: string }) {
    return this.market.mine(auth.sub);
  }

  @Get('items/:id')
  detail(@Param('id') id: string) {
    return this.market.detail(id);
  }

  @Patch('items/:id/status')
  status(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { status: string }) {
    return this.market.updateStatus(id, auth.sub, body.status);
  }

  @Post('items/:id/inquiry')
  inquiry(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.market.inquiry(id, auth.sub);
  }

  @Post('items/:id/promote')
  promote(@CurrentUser() auth: { sub: string }, @Param('id') id: string, @Body() body: { days?: number }) {
    return this.market.promote(id, auth.sub, Number(body?.days ?? 1));
  }
}
