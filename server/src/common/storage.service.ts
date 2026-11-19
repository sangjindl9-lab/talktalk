import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { env } from './config';

export interface StoredObject {
  key: string;
  size: number;
  sha256: string;
}

/**
 * 비공개 스토리지 추상화.
 * - local: 서버 디스크(비공개 디렉터리) + 토큰 기반 제한시간 접근
 * - s3: S3 호환(MinIO/AWS) 프라이빗 버킷 + SigV4 서명 URL
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  readonly driver = env.storageDriver === 's3' ? 's3' : 'local';
  private readonly root: string;

  constructor() {
    this.root = path.resolve(process.cwd(), env.storageLocalDir);
  }

  async ensureReady(): Promise<void> {
    if (this.driver === 'local') await fs.mkdir(this.root, { recursive: true });
  }

  buildKey(kind: string, ext: string): string {
    const now = new Date();
    const rand = createHash('sha256')
      .update(`${now.getTime()}-${Math.random()}-${process.pid}`)
      .digest('hex')
      .slice(0, 24);
    return `${kind.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${rand}.${ext}`;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    if (this.driver === 's3') {
      await this.s3Put(key, data, contentType);
    } else {
      const target = path.join(this.root, key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data);
      await fs.chmod(target, 0o600);
    }
    return { key, size: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  }

  async get(key: string): Promise<Buffer> {
    if (this.driver === 's3') return this.s3Get(key);
    return fs.readFile(path.join(this.root, key));
  }

  async delete(key: string): Promise<void> {
    try {
      if (this.driver === 's3') {
        await this.s3Delete(key);
        return;
      }
      await fs.unlink(path.join(this.root, key));
    } catch {
      /* 이미 없으면 무시 */
    }
  }

  /** 외부 공유가 필요한 경우의 제한시간 서명 URL (S3 호환) */
  presignS3(key: string, ttlSec = 600): string | null {
    if (!env.s3.bucket || !env.s3.accessKey || !env.s3.secretKey) return null;
    const host = env.s3.endpoint
      ? env.s3.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : `${env.s3.bucket}.s3.${env.s3.region}.amazonaws.com`;
    const basePath = env.s3.forcePathStyle && env.s3.endpoint ? `/${env.s3.bucket}` : '';
    const canonicalUri = `${basePath}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${env.s3.region}/s3/aws4_request`;
    const params = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${env.s3.accessKey}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(ttlSec),
      'X-Amz-SignedHeaders': 'host',
    });
    const canonicalQuery = [...params.entries()]
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .sort()
      .join('&');
    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      'host',
      'UNSIGNED-PAYLOAD',
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const kDate = createHmac('sha256', `AWS4${env.s3.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(env.s3.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const scheme = env.s3.endpoint?.startsWith('http://') ? 'http' : 'https';
    return `${scheme}://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  private async s3Put(key: string, data: Buffer, contentType: string): Promise<void> {
    const url = this.presignS3(key, 300);
    if (!url) throw new Error('S3 설정(S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY)이 없습니다.');
    const res = await fetch(url.replace('X-Amz-SignedHeaders=host', 'X-Amz-SignedHeaders=host'), {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`S3 업로드 실패: ${res.status}`);
  }

  private async s3Get(key: string): Promise<Buffer> {
    const url = this.presignS3(key, 300);
    if (!url) throw new Error('S3 설정이 없습니다.');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`S3 조회 실패: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async s3Delete(key: string): Promise<void> {
    const url = this.presignS3(key, 300);
    if (!url) return;
    await fetch(url, { method: 'DELETE' });
  }
}
