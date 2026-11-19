import { Injectable, Logger } from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { apiError } from '../common/util';
import { signStorageToken, verifyStorageToken } from '../common/jwt';
import { env } from '../common/config';
import { ChatService } from './chat.service';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp', 'gif']);

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly chat: ChatService,
  ) {}

  /**
   * 이미지 업로드: 형식·크기 검사 후 재인코딩하여 EXIF/GPS 등 위치정보를 제거한다.
   */
  async upload(
    userId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname?: string } | undefined,
    kindRaw: string,
  ) {
    if (!file?.buffer?.length) throw apiError(400, 'FILE_REQUIRED', '사진 파일을 첨부해 주세요.');
    if (file.size > MAX_BYTES) throw apiError(413, 'FILE_TOO_LARGE', '사진은 10MB까지 업로드할 수 있습니다.');

    const meta = await sharp(file.buffer).metadata().catch(() => null);
    if (!meta?.format || !ALLOWED.has(meta.format)) {
      throw apiError(415, 'UNSUPPORTED_IMAGE', 'JPG·PNG·WEBP 이미지만 업로드할 수 있습니다.');
    }

    const kind = (Object.values(MediaKind) as string[]).includes(kindRaw?.toUpperCase()) ? (kindRaw.toUpperCase() as MediaKind) : MediaKind.CHAT;

    // rotate(): EXIF 방향만 적용, 이후 메타데이터는 기록하지 않아 EXIF/GPS가 제거된다.
    const pipeline = sharp(file.buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true });

    let output: Buffer;
    let mime: string;
    let ext: string;
    if (meta.format === 'png') {
      output = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      mime = 'image/png';
      ext = 'png';
    } else if (meta.format === 'webp') {
      output = await pipeline.webp({ quality: 82 }).toBuffer();
      mime = 'image/webp';
      ext = 'webp';
    } else if (meta.format === 'gif') {
      output = await pipeline.gif().toBuffer();
      mime = 'image/gif';
      ext = 'gif';
    } else {
      output = await pipeline.jpeg({ quality: 82 }).toBuffer();
      mime = 'image/jpeg';
      ext = 'jpg';
    }

    const outMeta = await sharp(output).metadata();
    const key = this.storage.buildKey(kind, ext);
    const stored = await this.storage.put(key, output, mime);

    const media = await this.prisma.media.create({
      data: {
        ownerId: userId,
        kind,
        storageKey: stored.key,
        mime,
        size: stored.size,
        width: outMeta.width ?? null,
        height: outMeta.height ?? null,
        sha256: stored.sha256,
        exifRemoved: true,
        isPrivate: kind === 'CHAT' || kind === 'PROFILE' || kind === 'INQUIRY',
        originalName: file.originalname?.slice(0, 120) ?? null,
      },
    });

    return {
      id: media.id,
      url: `/api/v1/media/${media.id}`,
      mime,
      width: media.width,
      height: media.height,
      size: media.size,
      exifRemoved: true,
      kind,
    };
  }

  private async canAccess(mediaId: string, userId: string | null): Promise<{ allowed: boolean; reason?: string }> {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return { allowed: false, reason: 'NOT_FOUND' };
    if (!media.isPrivate) return { allowed: true };
    if (!userId) return { allowed: false, reason: 'UNAUTHORIZED' };
    if (media.ownerId === userId) return { allowed: true };

    if (media.kind === 'CHAT') {
      const message = await this.prisma.message.findFirst({ where: { mediaId, deletedAt: null } });
      if (!message) return { allowed: false, reason: 'NOT_FOUND' };
      try {
        await this.chat.assertMember(message.roomId, userId);
        return { allowed: true };
      } catch {
        return { allowed: false, reason: 'FORBIDDEN' };
      }
    }
    return { allowed: false, reason: 'FORBIDDEN' };
  }

  async getFile(mediaId: string, userId: string | null) {
    const access = await this.canAccess(mediaId, userId);
    if (!access.allowed) {
      if (access.reason === 'NOT_FOUND') throw apiError(404, 'MEDIA_NOT_FOUND', '사진을 찾을 수 없습니다.');
      if (access.reason === 'UNAUTHORIZED') throw apiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
      throw apiError(403, 'MEDIA_FORBIDDEN', '이 사진에 접근할 수 없습니다.');
    }
    const media = await this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
    const buffer = await this.storage.get(media.storageKey);
    return { buffer, mime: media.mime, size: media.size, media };
  }

  async createToken(mediaId: string, userId: string) {
    const access = await this.canAccess(mediaId, userId);
    if (!access.allowed) throw apiError(403, 'MEDIA_FORBIDDEN', '이 사진에 접근할 수 없습니다.');
    const token = signStorageToken(mediaId, 600);
    return {
      url: `${env.publicBaseUrl}/api/v1/media/${mediaId}/raw?token=${encodeURIComponent(token)}`,
      s3Url: this.storage.presignS3((await this.prisma.media.findUniqueOrThrow({ where: { id: mediaId } })).storageKey, 600),
      expiresInSec: 600,
    };
  }

  async getByToken(mediaId: string, token: string) {
    if (!verifyStorageToken(mediaId, token)) throw apiError(403, 'INVALID_TOKEN', '접근 링크가 만료되었습니다.');
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw apiError(404, 'MEDIA_NOT_FOUND', '사진을 찾을 수 없습니다.');
    const buffer = await this.storage.get(media.storageKey);
    return { buffer, mime: media.mime, size: media.size };
  }

  async remove(mediaId: string, userId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw apiError(404, 'MEDIA_NOT_FOUND', '사진을 찾을 수 없습니다.');
    if (media.ownerId !== userId) throw apiError(403, 'NOT_OWNER', '본인 사진만 삭제할 수 있습니다.');
    await this.storage.delete(media.storageKey);
    await this.prisma.media.update({ where: { id: mediaId }, data: { ownerId: null, isPrivate: true } });
    return { deleted: true };
  }
}
