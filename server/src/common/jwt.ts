import { createHmac, timingSafeEqual } from 'crypto';
import { env } from './config';

export interface TokenPayload {
  sub: string;
  kind: 'user' | 'admin';
  role: string;
  iat: number;
  exp: number;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresInSec?: number): string {
  const now = Math.floor(Date.now() / 1000);
  const full: TokenPayload = {
    ...payload,
    iat: now,
    exp: now + (expiresInSec ?? env.jwtExpiresInSec),
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(full));
  const sig = createHmac('sha256', env.jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = createHmac('sha256', env.jwtSecret).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signStorageToken(mediaId: string, ttlSec = 600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac('sha256', env.storageSecret).update(`${mediaId}.${exp}`).digest('base64url');
  return `${exp}.${sig}`;
}

export function verifyStorageToken(mediaId: string, token: string): boolean {
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!exp || Number.isNaN(exp) || exp * 1000 < Date.now()) return false;
  const expected = createHmac('sha256', env.storageSecret).update(`${mediaId}.${exp}`).digest('base64url');
  return sig === expected;
}
