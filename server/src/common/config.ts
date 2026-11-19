import * as fs from 'fs';
import * as path from 'path';

/** .env 로더 (dotenv 의존성 없이 동작) */
export function loadEnv(): void {
  if (process.env.__TALKTALK_ENV_LOADED) return;
  process.env.__TALKTALK_ENV_LOADED = '1';
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[m[1]] = value;
    }
    break;
  }
}

function findUp(name: string, start: string): string {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(start, name);
}

export interface BrandConfig {
  service: {
    nameKo: string;
    nameEn: string;
    slug: string;
    tagline: string;
    operator: string;
    operatorEn: string;
    supportEmail: string;
    supportPhone: string;
    website: string;
  };
  theme: Record<string, string>;
  icon: Record<string, string>;
  legal: Record<string, string | number>;
  push: { defaultPreview: boolean };
}

function readBrand(): BrandConfig {
  try {
    const file = findUp('brand.json', __dirname);
    return JSON.parse(fs.readFileSync(file, 'utf8')) as BrandConfig;
  } catch {
    return {
      service: {
        nameKo: '톡톡 Talk Talk',
        nameEn: 'Talk Talk',
        slug: 'talk-talk',
        tagline: '동네에서 시작되는 가벼운 대화',
        operator: '이음소프트',
        operatorEn: 'Eumsoft',
        supportEmail: 'support@talktalk.eumsoft.co.kr',
        supportPhone: '033-742-0000',
        website: 'https://talktalk.eumsoft.co.kr',
      },
      theme: { primary: '#FF6B4A' },
      icon: {},
      legal: { minimumAge: 19, termsVersion: '2026-11-01', privacyVersion: '2026-11-01' },
      push: { defaultPreview: false },
    };
  }
}

export const BRAND: BrandConfig = readBrand();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: (process.env.NODE_ENV ?? 'development') === 'production',
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-insecure-secret',
  jwtExpiresInSec: Number(process.env.JWT_EXPIRES_IN_SEC ?? 60 * 60 * 24 * 7),
  adminJwtExpiresInSec: Number(process.env.ADMIN_JWT_EXPIRES_IN_SEC ?? 60 * 60 * 8),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? './var/storage',
  storageSecret: process.env.STORAGE_SECRET ?? 'dev-storage-secret',
  s3: {
    bucket: process.env.S3_BUCKET ?? '',
    region: process.env.S3_REGION ?? 'ap-northeast-2',
    endpoint: process.env.S3_ENDPOINT ?? '',
    accessKey: process.env.S3_ACCESS_KEY_ID ?? '',
    secretKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') === 'true',
  },
  redisUrl: process.env.REDIS_URL,
  iapProvider: process.env.IAP_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'live' : 'mock'),
  identityProvider: process.env.IDENTITY_PROVIDER ?? (process.env.NODE_ENV === 'production' ? '' : 'dev'),
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@talktalk.eumsoft.co.kr',
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'Admin!2345',
  devAllowed: (process.env.NODE_ENV ?? 'development') !== 'production',
};

/** 운영 환경에서 성인/본인확인 설정이 빠졌는지 여부 */
export function identityConfigIssues(): string[] {
  const issues: string[] = [];
  if (!env.identityProvider) issues.push('IDENTITY_PROVIDER');
  if (env.identityProvider && !process.env.IDENTITY_PROVIDER_API_KEY && env.isProduction) {
    issues.push('IDENTITY_PROVIDER_API_KEY');
  }
  if (!env.isProduction) return [];
  if (!process.env.IAP_PROVIDER) issues.push('IAP_PROVIDER');
  return issues;
}
