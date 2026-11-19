import { BadRequestException, HttpException } from '@nestjs/common';

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>): HttpException {
  return new HttpException({ code, message, ...(extra ?? {}) }, status);
}

/** 만 나이 계산 */
export function ageFromBirthDate(birth: Date, now = new Date()): number {
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export function ageBandOf(age: number): string {
  if (age < 20) return '10s';
  if (age < 30) return '20s';
  if (age < 40) return '30s';
  if (age < 50) return '40s';
  if (age < 60) return '50s';
  return '60s+';
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 좌표·정밀거리를 절대 노출하지 않고 넓은 표현만 반환한다.
 * 같은 시군구는 '같은 동네', 3km 이내는 '가까운 지역', 그 외 '조금 먼 지역'.
 */
export function broadDistanceLabel(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
  sameRegion: boolean,
): '같은 동네' | '가까운 지역' | '조금 먼 지역' {
  if (sameRegion) return '같은 동네';
  if (!a || !b) return '조금 먼 지역';
  const km = haversineKm(a, b);
  if (km <= 3) return '같은 동네';
  if (km <= 15) return '가까운 지역';
  return '조금 먼 지역';
}

export function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3');
}

export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  if (name.length <= 1) return name;
  return `${name[0]}${'*'.repeat(name.length - 1)}`;
}

export const URL_PATTERN = /((https?:\/\/|www\.)[^\s]+|([a-z0-9-]+\.)+(com|net|kr|io|me|ly|co|gg|xyz|link|app)(\/[^\s]*)?)/i;

export function containsExternalLink(text: string): boolean {
  return URL_PATTERN.test(text);
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  throw new BadRequestException({ code: 'INVALID_PHONE', message: '휴대폰 번호 형식이 올바르지 않습니다.' });
}

export function parsePagination(query: Record<string, unknown>, defaultLimit = 20, maxLimit = 100) {
  const limit = Math.min(Math.max(Number(query.limit ?? defaultLimit) || defaultLimit, 1), maxLimit);
  const cursor = typeof query.cursor === 'string' && query.cursor.length > 0 ? query.cursor : undefined;
  return { limit, cursor };
}

export function toInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** 공개 프로필(연락처·실명·생년월일 등 타인 비노출 항목 제외) */
export function publicProfile(user: {
  id: string;
  nickname: string;
  photoUrl?: string | null;
  ageBand?: string | null;
  gender?: string | null;
  genderVisible?: boolean;
  regionName?: string | null;
  interests?: string[];
  bio?: string | null;
  lastActiveAt?: Date | null;
  showLastActive?: boolean;
  status?: string;
}) {
  return {
    id: user.id,
    nickname: user.nickname,
    photoUrl: user.photoUrl ?? null,
    ageBand: user.ageBand ?? null,
    gender: user.genderVisible ? (user.gender === 'NONE' ? null : user.gender) : null,
    regionName: user.regionName ?? null,
    interests: user.interests ?? [],
    bio: user.bio ?? null,
    lastActiveLabel: user.showLastActive ? recentActivityLabel(user.lastActiveAt ?? null) : null,
    deleted: user.status === 'DELETED',
  };
}

export function recentActivityLabel(date: Date | null): string | null {
  if (!date) return null;
  const diff = Date.now() - date.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 5) return '방금 활동';
  if (min < 60) return `${min}분 전 활동`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전 활동`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일 전 활동`;
  return '일주일 이상 전 활동';
}

/** 탈퇴 회원 표시용 이름 */
export const DELETED_NICKNAME = '탈퇴한 회원';
