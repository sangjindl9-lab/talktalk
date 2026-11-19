import Link from 'next/link';
import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdmin();
  const { q = '', status = '' } = await searchParams;
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (status) query.set('status', status);
  const res = await adminApi<any[]>(`/admin/users?${query.toString()}`);
  const rows = res.data ?? [];
  return (
    <>
      <div className="card">
        <form className="inline-form" action="/members">
          <input name="q" defaultValue={q} placeholder="닉네임 또는 휴대폰 번호" style={{ width: 260 }} />
          <select name="status" defaultValue={status} style={{ width: 140 }}>
            <option value="">전체 상태</option>
            <option value="ACTIVE">정상</option>
            <option value="SUSPENDED">이용 제한</option>
            <option value="DELETED">탈퇴</option>
          </select>
          <button className="btn" type="submit">검색</button>
        </form>
      </div>
      <div className="card">
        <h2>회원 ({rows.length})</h2>
        {!res.ok ? <div className="error">{res.error?.message}</div> : null}
        <table>
          <thead>
            <tr><th>닉네임</th><th>휴대폰</th><th>지역</th><th>연령대</th><th>포인트</th><th>상태</th><th>가입</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.nickname}</td>
                <td className="mono">{u.phone}</td>
                <td>{u.regionName ?? '-'}</td>
                <td>{u.ageBand ?? '-'}</td>
                <td>{u.points.toLocaleString()}P</td>
                <td><span className={`badge ${u.status === 'ACTIVE' ? 'green' : u.status === 'SUSPENDED' ? 'red' : ''}`}>{u.status}</span></td>
                <td className="muted">{formatDate(u.createdAt)}</td>
                <td><Link className="btn small" href={`/members/${u.id}`}>상세</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
