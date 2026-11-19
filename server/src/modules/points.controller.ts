import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../common/auth.guard';
import { PointsService } from '../common/points.service';
import { BillingService } from './billing.service';
import { PrismaService } from '../common/prisma.service';

@Controller('points')
export class PointsController {
  constructor(
    private readonly points: PointsService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('balance')
  async balance(@CurrentUser() auth: { sub: string }) {
    return { balance: await this.points.balance(auth.sub) };
  }

  @Get('transactions')
  async transactions(@CurrentUser() auth: { sub: string }) {
    return this.points.history(auth.sub);
  }

  @Get('products')
  async products() {
    return { products: await this.billing.products(), prices: await this.points.settingPrices() };
  }

  @Post('quote')
  async quote(@CurrentUser() auth: { sub: string }, @Body() body: { multiNoteCount?: number; promoteDays?: number }) {
    const prices = await this.points.settingPrices();
    const balance = await this.points.balance(auth.sub);
    const multiNote = (body?.multiNoteCount ?? 0) * (prices['price.multiNote'] ?? 50);
    const promote = (body?.promoteDays ?? 0) * (prices['price.promotePerDay'] ?? 300);
    return { balance, multiNote, promote, total: multiNote + promote, prices };
  }
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('verify')
  verify(
    @CurrentUser() auth: { sub: string },
    @Body() body: { platform: string; productId: string; transactionId: string; purchaseToken?: string; receipt?: string },
  ) {
    return this.billing.verify(auth.sub, body);
  }

  @Post('restore')
  restore(@CurrentUser() auth: { sub: string }) {
    return this.billing.restore(auth.sub);
  }

  @Get('subscription')
  subscription(@CurrentUser() auth: { sub: string }) {
    return this.billing.subscription(auth.sub);
  }

  @Get('payments')
  payments(@CurrentUser() auth: { sub: string }) {
    return this.billing.payments(auth.sub);
  }
}
