import { redirect } from 'next/navigation';
import { getAdminToken } from '@/lib/session';

export default async function Home() {
  const token = await getAdminToken();
  redirect(token ? '/dashboard' : '/login');
}
