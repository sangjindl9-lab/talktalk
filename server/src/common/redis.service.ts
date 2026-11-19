import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from './config';

interface MemoryEntry {
  value: number;
  expiresAt: number;
}

/**
 * Redis 연동 + 인메모리 fallback.
 * REDIS_URL 미설정/미연결이어도 서버·테스트가 완전히 동작하도록 한다.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: import('ioredis').Redis | null = null;
  private readonly memory = new Map<string, MemoryEntry>();
  connected = false;

  async onModuleInit(): Promise<void> {
    if (!env.redisUrl) {
      this.logger.warn('REDIS_URL 미설정 → 인메모리 pub/sub·rate-limit fallback 사용');
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Redis = require('ioredis');
      const client = new Redis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500 });
      client.on('error', (e: Error) => this.logger.warn(`Redis error: ${e.message}`));
      await client.connect();
      this.client = client;
      this.connected = true;
      this.logger.log('Redis 연결 완료');
    } catch (e) {
      this.logger.warn(`Redis 연결 실패(${(e as Error).message}) → 인메모리 fallback 사용`);
      this.client = null;
      this.connected = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* noop */
      }
    }
  }

  get raw(): import('ioredis').Redis | null {
    return this.client;
  }

  /** 고정 윈도우 rate limit. 초과 시 false */
  async take(key: string, limit: number, windowSec: number): Promise<boolean> {
    if (this.client) {
      const count = await this.client.incr(key);
      if (count === 1) await this.client.expire(key, windowSec);
      return count <= limit;
    }
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.expiresAt < now) {
      this.memory.set(key, { value: 1, expiresAt: now + windowSec * 1000 });
      return true;
    }
    entry.value += 1;
    return entry.value <= limit;
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (this.client) {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSec);
      return;
    }
    this.memory.set(key, { value: Date.now() + ttlSec * 1000, expiresAt: Date.now() + ttlSec * 1000 });
    this.memoryJson.set(key, JSON.stringify(value));
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (this.client) {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    const exp = this.memory.get(key);
    if (!exp || exp.expiresAt < Date.now()) return null;
    const raw = this.memoryJson.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  private readonly memoryJson = new Map<string, string>();
}
