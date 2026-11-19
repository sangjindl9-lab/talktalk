import { Injectable } from '@nestjs/common';
import { Prisma, PointTxType } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { apiError } from './util';

type Tx = Prisma.TransactionClient;

@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAccount(userId: string, tx?: Tx) {
    const client = tx ?? this.prisma;
    const existing = await client.pointAccount.findUnique({ where: { userId } });
    if (existing) return existing;
    return client.pointAccount.upsert({
      where: { userId },
      create: { userId, balance: 0 },
      update: {},
    });
  }

  async balance(userId: string): Promise<number> {
    const account = await this.ensureAccount(userId);
    return account.balance;
  }

  /** 적립(충전/환불/보너스/관리자 조정) */
  async credit(
    userId: string,
    amount: number,
    type: PointTxType,
    ref?: { type?: string; id?: string; memo?: string },
    tx?: Tx,
  ): Promise<number> {
    if (amount <= 0) throw apiError(400, 'INVALID_AMOUNT', '적립 금액이 올바르지 않습니다.');
    const run = async (client: Tx) => {
      await this.ensureAccount(userId, client);
      const updated = await client.pointAccount.update({
        where: { userId },
        data: { balance: { increment: amount } },
      });
      await client.pointTransaction.create({
        data: {
          userId,
          type,
          amount,
          balanceAfter: updated.balance,
          refType: ref?.type,
          refId: ref?.id,
          memo: ref?.memo,
        },
      });
      return updated.balance;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /**
   * 차감. 잔액 부족 시 402. 동시 요청에도 음수 잔액이 되지 않도록 조건부 갱신 사용.
   */
  async spend(
    userId: string,
    amount: number,
    ref?: { type?: string; id?: string; memo?: string },
    tx?: Tx,
  ): Promise<number> {
    if (amount <= 0) throw apiError(400, 'INVALID_AMOUNT', '차감 금액이 올바르지 않습니다.');
    const run = async (client: Tx) => {
      await this.ensureAccount(userId, client);
      const result = await client.pointAccount.updateMany({
        where: { userId, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (result.count === 0) {
        const account = await client.pointAccount.findUnique({ where: { userId } });
        throw apiError(402, 'INSUFFICIENT_POINTS', '포인트가 부족합니다.', {
          required: amount,
          balance: account?.balance ?? 0,
        });
      }
      const account = await client.pointAccount.findUniqueOrThrow({ where: { userId } });
      await client.pointTransaction.create({
        data: {
          userId,
          type: 'USE',
          amount: -amount,
          balanceAfter: account.balance,
          refType: ref?.type,
          refId: ref?.id,
          memo: ref?.memo,
        },
      });
      return account.balance;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async history(userId: string, limit = 50) {
    return this.prisma.pointTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async settingPrices(): Promise<Record<string, number>> {
    const rows = await this.prisma.adminSetting.findMany({ where: { key: { startsWith: 'price.' } } });
    const map: Record<string, number> = {
      'price.multiNote': 50,
      'price.promotePerDay': 300,
      'price.regionBrowse': 100,
      'price.roomCapacityExpandPer10': 500,
    };
    for (const row of rows) {
      if (typeof row.value === 'number' || typeof row.value === 'string') {
        map[row.key] = Number(row.value);
      } else if (row.value && typeof row.value === 'object' && 'value' in (row.value as object)) {
        map[row.key] = Number((row.value as { value: unknown }).value);
      }
    }
    return map;
  }
}
