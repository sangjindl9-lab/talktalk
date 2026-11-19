'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { adminApi, API_BASE, TOKEN_COOKIE } from './api';

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const res = await fetch(`${API_BASE}/api/v1/admin/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
    cache: 'no-store',
  });
  if (!res.ok) {
    redirect(`/login?error=${encodeURIComponent('로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.')}`);
  }
  const data = (await res.json()) as { token: string };
  const store = await cookies();
  store.set(TOKEN_COOKIE, data.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  redirect('/dashboard');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  redirect('/login');
}

export async function reportAction(reportId: string, formData: FormData): Promise<void> {
  const actionType = String(formData.get('actionType') ?? 'WARN');
  const note = String(formData.get('note') ?? '');
  await adminApi(`/admin/reports/${reportId}/actions`, { method: 'POST', body: { actionType, note } });
  revalidatePath(`/reports/${reportId}`);
  revalidatePath('/reports');
}

export async function assignReportAction(reportId: string): Promise<void> {
  await adminApi(`/admin/reports/${reportId}/assign`, { method: 'POST', body: {} });
  revalidatePath(`/reports/${reportId}`);
  revalidatePath('/reports');
}

export async function suspendUserAction(userId: string, formData: FormData): Promise<void> {
  const daysRaw = String(formData.get('days') ?? '7');
  const days = daysRaw === 'permanent' ? null : Number(daysRaw);
  const reason = String(formData.get('reason') ?? '');
  await adminApi(`/admin/users/${userId}/suspend`, { method: 'POST', body: { days, reason } });
  revalidatePath(`/members/${userId}`);
}

export async function restoreUserAction(userId: string): Promise<void> {
  await adminApi(`/admin/users/${userId}/restore`, { method: 'POST', body: {} });
  revalidatePath(`/members/${userId}`);
}

export async function adjustPointsAction(userId: string, formData: FormData): Promise<void> {
  const amount = Number(formData.get('amount') ?? 0);
  const memo = String(formData.get('memo') ?? '');
  await adminApi(`/admin/users/${userId}/points`, { method: 'POST', body: { amount, memo } });
  revalidatePath(`/members/${userId}`);
}

export async function postStatusAction(postId: string, formData: FormData): Promise<void> {
  const status = String(formData.get('status') ?? 'HIDDEN');
  await adminApi(`/admin/posts/${postId}/status`, { method: 'PATCH', body: { status } });
  revalidatePath('/posts');
}

export async function refundPaymentAction(paymentId: string, formData: FormData): Promise<void> {
  const reason = String(formData.get('reason') ?? '');
  await adminApi(`/admin/payments/${paymentId}/refund`, { method: 'POST', body: { reason } });
  revalidatePath('/payments');
}

export async function createNoticeAction(formData: FormData): Promise<void> {
  await adminApi('/admin/notices', {
    method: 'POST',
    body: {
      title: String(formData.get('title') ?? ''),
      body: String(formData.get('body') ?? ''),
      pinned: formData.get('pinned') === 'on',
    },
  });
  revalidatePath('/notices');
}

export async function answerInquiryAction(inquiryId: string, formData: FormData): Promise<void> {
  await adminApi(`/admin/inquiries/${inquiryId}/answer`, {
    method: 'POST',
    body: { answer: String(formData.get('answer') ?? '') },
  });
  revalidatePath('/inquiries');
}

export async function saveSettingsAction(formData: FormData): Promise<void> {
  const entries: Record<string, unknown> = {};
  for (const key of ['price.multiNote', 'price.promotePerDay', 'price.regionBrowse', 'price.roomCapacityExpandPer10']) {
    const raw = formData.get(key);
    if (raw !== null && String(raw).trim() !== '') entries[key] = Number(raw);
  }
  const provider = formData.get('identity.provider');
  if (provider !== null) entries['identity.provider'] = { provider: String(provider), adultOnly: true, minAge: 19 };
  await adminApi('/admin/settings', { method: 'PUT', body: entries });
  revalidatePath('/settings');
}

export async function resolveAppealAction(appealId: string, formData: FormData): Promise<void> {
  await adminApi(`/admin/appeals/${appealId}/resolve`, {
    method: 'POST',
    body: { accept: formData.get('accept') === 'true', response: String(formData.get('response') ?? '') },
  });
  revalidatePath('/appeals');
  revalidatePath('/members');
}
