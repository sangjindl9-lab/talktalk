import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(
    @CurrentUser() auth: { sub: string },
    @Body() body: { targetType: string; targetId: string; reason: string; detail?: string },
  ) {
    return this.reports.create(auth.sub, body);
  }

  @Get('mine')
  mine(@CurrentUser() auth: { sub: string }) {
    return this.reports.mine(auth.sub);
  }

  @Get('reasons')
  reasons() {
    return [
      { code: 'SPAM', label: '스팸·홍보' },
      { code: 'ABUSE', label: '욕설·비방' },
      { code: 'SEXUAL', label: '음란·성적 콘텐츠' },
      { code: 'FRAUD', label: '사기·거래 문제' },
      { code: 'ILLEGAL', label: '불법 정보' },
      { code: 'ETC', label: '기타' },
    ];
  }
}

@Controller('appeals')
export class AppealsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  create(@CurrentUser() auth: { sub: string }, @Body() body: { reportId?: string; message: string }) {
    return this.reports.appeal(auth.sub, body);
  }

  @Get('mine')
  mine(@CurrentUser() auth: { sub: string }) {
    return this.reports.myAppeals(auth.sub);
  }
}
