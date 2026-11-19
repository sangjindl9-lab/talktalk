import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { API_BASE, TOKEN_COOKIE } from './api';

export async function getAdminToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(TOKEN_COOKIE)?.value ?? null;
}

export async function requireAdmin(): Promise<{ token: string; admin: AdminInfo }> {
  const token = await getAdminToken();
  if (!token) redirect('/login');
  const res = await fetch(`${API_BASE}/api/v1/admin/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) redirect('/login');
  const admin = (await res.json()) as AdminInfo;
  return { token, admin };
}

export interface AdminInfo {
  id: string;
  email: string;
  name: string;
  role: 'SUPERADMIN' | 'MODERATOR' | 'SUPPORT' | 'FINANCE';
}

export const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: '최고관리자',
  MODERATOR: '신고/제재 담당',
  SUPPORT: '고객지원',
  FINANCE: '정산 담당',
};
