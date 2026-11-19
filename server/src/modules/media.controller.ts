import {
  Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { CurrentUser, Public } from '../common/auth.guard';
import { MediaService } from './media.service';

@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @CurrentUser() auth: { sub: string },
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
    @Body('kind') kind: string,
  ) {
    return this.media.upload(auth.sub, file, kind ?? 'CHAT');
  }

  @Get(':id')
  async serve(
    @CurrentUser() auth: { sub: string } | undefined,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.media.getFile(id, auth?.sub ?? null);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(file.buffer);
  }

  @Public()
  @Get(':id/raw')
  async raw(@Param('id') id: string, @Query('token') token: string, @Res() res: Response) {
    const file = await this.media.getByToken(id, token ?? '');
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(file.buffer);
  }

  @Post(':id/token')
  token(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.media.createToken(id, auth.sub);
  }

  @Delete(':id')
  remove(@CurrentUser() auth: { sub: string }, @Param('id') id: string) {
    return this.media.remove(id, auth.sub);
  }
}
