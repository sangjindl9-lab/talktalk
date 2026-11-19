import { adminApi, formatDate, won } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ userId?: string; type?: string }> }) {
  await requireAdmin();
  const { userId = '', type = '' } = await searchParams;
  const query = new URLSearchParams();
  if (userId) query.set('userId', userId);
  if (type) query.set('type', type);
  const res = await adminApi<any[]>(`/admin/ledger?${query.toString()}`);
  const rows = res.data ?? [];
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <>
      <div className="card">
        <form className="inline-form" action="/ledger">
          <input name="userId" defaultValue={userId} placeholder="회원 ID" style={{ width: 260 }} />
          <select name="type" defaultValue={type} style={{ width: 150 }}>
            <option value="">전체 유형</option>
            <option value="CHARGE">충전</option>
            <option value="USE">사용</option>
            <option value="REFUND">환불</option>
            <option value="ADMIN_ADJUST">관리자 조정</option>
            <option value="BONUS">보너스</option>
          </select>
          <button className="btn" type="submit">조회</button>
        </form>
      </div>
      <div className="card">
        <h2>포인트 원장 ({rows.length}건 / 합계 {won(total)}P)</h2>
        <table>
          <thead><tr><th>일시</th><th>회원</th><th>유형</th><th>변동</th><th>잔액</th><th>참조</th><th>메모</th></tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.createdAt)}</td>
                <td>{t.nickname}</td>
                <td><span className="badge">{t.type}</span></td>
                <td style={{ color: t.amount >= 0 ? 'var(--ok)' : 'var(--danger)', fontWeight: 700 }}>{t.amount > 0 ? '+' : ''}{won(t.amount)}</td>
                <td>{won(t.balanceAfter)}</td>
                <td className="mono">{t.refType ?? '-'}{t.refId ? `:${t.refId.slice(0, 8)}` : ''}</td>
                <td className="muted">{t.memo ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
