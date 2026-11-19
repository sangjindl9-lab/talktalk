import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { verifyToken } from '../common/jwt';
import { env } from '../common/config';
import { PrismaService } from '../common/prisma.service';
import { RedisService } from '../common/redis.service';
import { RealtimeService } from '../common/realtime.service';
import { ChatService } from '../modules/chat.service';

interface AuthedSocket extends Socket {
  data: { userId?: string };
}

@WebSocketGateway({
  namespace: '/ws',
  cors: { origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','), credentials: true },
  transports: ['websocket', 'polling'],
})
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly chat: ChatService,
  ) {}

  async afterInit(server: Server): Promise<void> {
    this.realtime.attach(server);
    const redis = this.redis.raw;
    if (redis) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createAdapter } = require('@socket.io/redis-adapter');
        const pub = redis.duplicate();
        const sub = redis.duplicate();
        await Promise.all([pub.connect(), sub.connect()]);
        server.adapter(createAdapter(pub, sub));
        this.logger.log('Socket.IO Redis Adapter 활성화');
      } catch (e) {
        this.logger.warn(`Socket.IO Redis Adapter 비활성: ${(e as Error).message}`);
      }
    } else {
      this.logger.log('Socket.IO 인메모리 어댑터 사용(단일 인스턴스)');
    }
  }

  async handleConnection(socket: AuthedSocket): Promise<void> {
    const token = (socket.handshake.auth?.token as string | undefined) ?? (socket.handshake.query?.token as string | undefined);
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.kind !== 'user') {
      socket.emit('auth:error', { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' });
      socket.disconnect(true);
      return;
    }
    socket.data.userId = payload.sub;
    await socket.join(`user:${payload.sub}`);
    await this.prisma.user.update({ where: { id: payload.sub }, data: { lastActiveAt: new Date() } }).catch(() => undefined);
    socket.emit('auth:ok', { userId: payload.sub });
  }

  async handleDisconnect(socket: AuthedSocket): Promise<void> {
    if (socket.data.userId) {
      await this.prisma.user
        .update({ where: { id: socket.data.userId }, data: { lastActiveAt: new Date() } })
        .catch(() => undefined);
    }
  }

  @SubscribeMessage('room:join')
  async joinRoom(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId: string }) {
    try {
      await this.chat.assertMember(body.roomId, socket.data.userId as string);
      await socket.join(`room:${body.roomId}`);
      return { ok: true, roomId: body.roomId };
    } catch (e) {
      return this.err(e);
    }
  }

  @SubscribeMessage('room:leave')
  async leaveRoom(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId: string }) {
    await socket.leave(`room:${body.roomId}`);
    return { ok: true };
  }

  @SubscribeMessage('message:send')
  async sendMessage(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody()
    body: { roomId: string; type?: 'TEXT' | 'IMAGE'; body?: string; mediaId?: string; clientMessageId?: string },
  ) {
    try {
      const allowed = await this.redis.take(`ws:msg:${socket.data.userId}`, 30, 10);
      if (!allowed) return { ok: false, error: { code: 'RATE_LIMITED', message: '메시지를 너무 빠르게 보내고 있습니다.' } };
      const result = await this.chat.sendMessage(body.roomId, socket.data.userId as string, {
        type: body.type,
        body: body.body,
        mediaId: body.mediaId,
        clientMessageId: body.clientMessageId,
      });
      return { ok: true, message: result.message, duplicated: result.duplicated };
    } catch (e) {
      return this.err(e);
    }
  }

  @SubscribeMessage('chat:sync')
  async sync(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { roomId: string; afterSeq: string; limit?: number },
  ) {
    try {
      const messages = await this.chat.syncMessages(body.roomId, socket.data.userId as string, body.afterSeq, body.limit ?? 200);
      return { ok: true, messages };
    } catch (e) {
      return this.err(e);
    }
  }

  @SubscribeMessage('message:read')
  async read(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId: string; seq?: string }) {
    try {
      return { ok: true, ...(await this.chat.markRead(body.roomId, socket.data.userId as string, body.seq)) };
    } catch (e) {
      return this.err(e);
    }
  }

  @SubscribeMessage('typing')
  async typing(@ConnectedSocket() socket: AuthedSocket, @MessageBody() body: { roomId: string; typing: boolean }) {
    await socket.to(`room:${body.roomId}`).emit('typing', { roomId: body.roomId, userId: socket.data.userId, typing: body.typing });
    return { ok: true };
  }

  private err(e: unknown) {
    const error = e as { status?: number; response?: { code?: string; message?: string }; message?: string };
    return {
      ok: false,
      error: {
        code: error.response?.code ?? 'ERROR',
        message: error.response?.message ?? error.message ?? '요청을 처리할 수 없습니다.',
        status: error.status ?? 500,
      },
    };
  }
}
