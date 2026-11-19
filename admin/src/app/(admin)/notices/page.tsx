import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { createNoticeAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function NoticesPage() {
  await requireAdmin();
  const res = await adminApi<any[]>('/admin/notices');
  const rows = res.data ?? [];
  return (
    <div className="split">
      <div className="card">
        <h2>공지사항 ({rows.length})</h2>
        <table>
          <thead><tr><th>제목</th><th>고정</th><th>게시</th><th>작성</th></tr></thead>
          <tbody>
            {rows.map((n) => (
              <tr key={n.id}>
                <td>{n.title}<div className="muted" style={{ fontSize: 11 }}>{n.body.slice(0, 60)}…</div></td>
                <td>{n.pinned ? <span className="badge amber">고정</span> : '-'}</td>
                <td><span className={`badge ${n.published ? 'green' : ''}`}>{n.published ? '게시' : '비공개'}</span></td>
                <td className="muted">{formatDate(n.createdAt)}</td>
              </tr>
            ))}
            {rows.length === 0 ? <tr><td colSpan={4} className="muted">등록된 공지가 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>새 공지 작성</h2>
        <form action={createNoticeAction}>
          <div className="field"><label htmlFor="title">제목</label><input id="title" name="title" required /></div>
          <div className="field"><label htmlFor="body">내용</label><textarea id="body" name="body" required style={{ minHeight: 160 }} /></div>
          <label className="row" style={{ marginBottom: 12 }}><input type="checkbox" name="pinned" style={{ width: 'auto' }} /> 상단 고정</label>
          <button className="btn primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>공지 등록</button>
        </form>
      </div>
    </div>
  );
}
