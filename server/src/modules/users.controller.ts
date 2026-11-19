import { Body, Controller, Delete, Get, Param, Post, Query, Put } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('nearby')
  nearby(
    @CurrentUser() auth: { sub: string },
    @Query() query: { sort?: string; regionCode?: string; ageBand?: string; interest?: string; limit?: string },
  ) {
    return this.users.nearby(auth.sub, {
      sort: query.sort,
      regionCode: query.regionCode,
      ageBand: query.ageBand,
      interest: query.interest,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }

  @Get('users/search')
  search(@CurrentUser() auth: { sub: string }, @Query('q') q: string) {
    return this.users.search(auth.sub, q);
  }

  @Get('users/:id')
  profile(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.users.profile(auth.sub, id);
  }

  @Get('blocks')
  blocks(@CurrentUser() auth: { sub: string }) {
    return this.users.blocks(auth.sub);
  }

  @Post('blocks')
  block(@CurrentUser() auth: { sub: string }, @Body() body: { userId?: string; targetId?: string }) {
    return this.users.block(auth.sub, (body.userId ?? body.targetId) as string);
  }

  @Delete('blocks/:userId')
  unblock(@CurrentUser() auth: { sub: string }, @Param('userId') userId: string) {
    return this.users.unblock(auth.sub, userId);
  }

  @Get('regions')
  regions() {
    return this.users.regions();
  }

  @Get('interests')
  interests() {
    return this.users.interests();
  }

  @Post('me/location')
  setLocation(@CurrentUser() auth: { sub: string }, @Body() body: { lat: number; lng: number }) {
    return this.users.setRegionByCoords(auth.sub, Number(body?.lat), Number(body?.lng));
  }

  @Put('me/region')
  updateRegion(@CurrentUser() auth: { sub: string }, @Body() body: { regionCode: string }) {
    return this.users.updateLocationRegion(auth.sub, body.regionCode);
  }

  @Post('regions/browse')
  browse(@CurrentUser() auth: { sub: string }, @Body() body: { regionCode: string }) {
    return this.users.browseRegion(auth.sub, body.regionCode);
  }

  @Get('regions/browse/current')
  currentBrowse(@CurrentUser() auth: { sub: string }) {
    return this.users.currentBrowse(auth.sub);
  }
}
