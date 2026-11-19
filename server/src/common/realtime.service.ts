import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

export interface RealtimeEvent {
  room: string;
  event: string;
  payload: unknown;
}

@Injectable()
export class RealtimeService {
  private server: Server | null = null;
  private readonly pending: RealtimeEvent[] = [];

  attach(server: Server): void {
    this.server = server;
    while (this.pending.length > 0) {
      const next = this.pending.shift();
      if (next) this.emit(next.room, next.event, next.payload);
    }
  }

  emit(room: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.pending.push({ room, event, payload });
      return;
    }
    this.server.to(room).emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.emit(`user:${userId}`, event, payload);
  }
}
