import { cookies } from 'next/headers';

// Render 내부망 주소(host:port)만 들어오면 http:// 를 붙여 사용
const RAW_API_BASE = process.env.API_BASE_URL ?? 'http://localhost:4000';
export const API_BASE = /^https?:\/\//.test(RAW_API_BASE) ? RAW_API_BASE : `http://${RAW_API_BASE}`;
export const TOKEN_COOKIE = 'tt_admin_token';

export interface ApiResult<T = any> {
  ok: boolean;
  status: number;
  data: T;
  error?: { code?: string; message?: string };
}

export async function adminApi<T = any>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const store = await cookies();
  const token = store.get(TOKEN_COOKIE)?.value;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const text = await res.text();
    const data = (text ? JSON.parse(text) : null) as T;
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : (data as any) };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: null as unknown as T,
      error: { code: 'NETWORK_ERROR', message: `API 서버에 연결할 수 없습니다 (${API_BASE}). ${(e as Error).message}` },
    };
  }
}

export async function publicApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  try {
    const res = await fetch(`${API_BASE}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: 'no-store',
    });
    const text = await res.text();
    const data = (text ? JSON.parse(text) : null) as T;
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : (data as any) };
  } catch (e) {
    return { ok: false, status: 0, data: null as unknown as T, error: { code: 'NETWORK_ERROR', message: (e as Error).message } };
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return value;
  }
}

export function won(value?: number | null): string {
  return `${(value ?? 0).toLocaleString('ko-KR')}`;
}
