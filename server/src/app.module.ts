import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from './common/prisma.service';
import { RedisService } from './common/redis.service';
import { StorageService } from './common/storage.service';
import { PointsService } from './common/points.service';
import { RealtimeService } from './common/realtime.service';
import { JwtAuthGuard } from './common/auth.guard';
import { AuthService } from './modules/auth.service';
import { AuthController, MeController } from './modules/auth.controller';
import { UsersService } from './modules/users.service';
import { UsersController } from './modules/users.controller';
import { NotificationService } from './modules/notification.service';
import { ChatService } from './modules/chat.service';
import { ChatController } from './modules/chat.controller';
import { ChatGateway } from './modules/realtime.gateway';
import { NotesService } from './modules/notes.service';
import { NotesController } from './modules/notes.controller';
import { RoomsService } from './modules/rooms.service';
import { RoomsController } from './modules/rooms.controller';
import { PromotionsService } from './modules/promotions.service';
import { BoardService } from './modules/board.service';
import { BoardController } from './modules/board.controller';
import { MarketService } from './modules/market.service';
import { MarketController } from './modules/market.controller';
import { MediaService } from './modules/media.service';
import { MediaController } from './modules/media.controller';
import { ReportsService } from './modules/reports.service';
import { ReportsController, AppealsController } from './modules/reports.controller';
import { BillingService } from './modules/billing.service';
import { PointsController, BillingController } from './modules/points.controller';
import { AdminService } from './modules/admin.service';
import { AdminController, AdminAuthController } from './modules/admin.controller';
import { MiscController, HealthController } from './modules/misc.controller';

@Module({
  controllers: [
    HealthController,
    AuthController,
    MeController,
    UsersController,
    NotesController,
    ChatController,
    RoomsController,
    BoardController,
    MarketController,
    PointsController,
    BillingController,
    MediaController,
    ReportsController,
    AppealsController,
    MiscController,
    AdminAuthController,
    AdminController,
  ],
  providers: [
    PrismaService,
    RedisService,
    StorageService,
    PointsService,
    RealtimeService,
    NotificationService,
    AuthService,
    UsersService,
    ChatService,
    NotesService,
    RoomsService,
    PromotionsService,
    BoardService,
    MarketService,
    MediaService,
    ReportsService,
    BillingService,
    AdminService,
    ChatGateway,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
