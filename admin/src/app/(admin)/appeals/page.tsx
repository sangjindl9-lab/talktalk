import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { resolveAppealAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function AppealsPage() {
  await requireAdmin();
  const res = await adminApi<any[]>('/admin/appeals?status=OPEN');
  const rows = res.data ?? [];
  return (
    <div className="card">
      <h2>이의신청 ({rows.length})</h2>
      {rows.length === 0 ? <p className="muted">대기 중인 이의신청이 없습니다.</p> : rows.map((a) => (
        <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '14px 0' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{a.user?.nickname ?? a.userId}</strong>
            <span className="badge amber">{a.status}</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{formatDate(a.createdAt)} · 현재 상태 {a.user?.status}</div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{a.message}</p>
          <form className="inline-form" action={resolveAppealAction.bind(null, a.id)}>
            <input name="response" placeholder="처리 사유/답변" style={{ flex: 1, minWidth: 280 }} />
            <button className="btn primary" name="accept" value="true" type="submit">수용(제재 해제)</button>
            <button className="btn" name="accept" value="false" type="submit">기각</button>
          </form>
        </div>
      ))}
    </div>
  );
}
