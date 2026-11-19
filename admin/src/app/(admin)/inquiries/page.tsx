import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { answerInquiryAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function InquiriesPage() {
  await requireAdmin();
  const res = await adminApi<any[]>('/admin/inquiries');
  const rows = res.data ?? [];
  return (
    <div className="card">
      <h2>1:1 문의 ({rows.length})</h2>
      {rows.length === 0 ? <p className="muted">접수된 문의가 없습니다.</p> : rows.map((q) => (
        <div key={q.id} style={{ borderBottom: '1px solid var(--line)', padding: '14px 0' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{q.title}</strong>
            <span className={`badge ${q.status === 'ANSWERED' ? 'green' : 'amber'}`}>{q.status}</span>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>{q.user?.nickname ?? q.name} · {q.email} · {formatDate(q.createdAt)}</div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{q.body}</p>
          {q.answer ? (
            <div style={{ background: '#f7f5f2', padding: 12, borderRadius: 8 }}>
              <strong style={{ fontSize: 12 }}>답변</strong>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{q.answer}</p>
            </div>
          ) : (
            <form className="inline-form" action={answerInquiryAction.bind(null, q.id)}>
              <input name="answer" placeholder="답변 내용을 입력하세요" style={{ flex: 1, minWidth: 320 }} />
              <button className="btn primary" type="submit">답변 등록</button>
            </form>
          )}
        </div>
      ))}
    </div>
  );
}
