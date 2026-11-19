import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { postStatusAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = '' } = await searchParams;
  const res = await adminApi<any[]>(`/admin/posts?${q ? `q=${encodeURIComponent(q)}` : ''}`);
  const rows = res.data ?? [];
  return (
    <>
      <div className="card">
        <form className="inline-form" action="/posts">
          <input name="q" defaultValue={q} placeholder="게시글 제목" style={{ width: 260 }} />
          <button className="btn" type="submit">검색</button>
        </form>
      </div>
      <div className="card">
        <h2>게시물 ({rows.length})</h2>
        <table>
          <thead><tr><th>제목</th><th>카테고리</th><th>지역</th><th>작성자</th><th>상태</th><th>작성일</th><th>조치</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>{p.category}</td>
                <td>{p.regionCode}</td>
                <td>{p.author?.nickname}</td>
                <td><span className={`badge ${p.status === 'ACTIVE' ? 'green' : 'red'}`}>{p.status}</span></td>
                <td className="muted">{formatDate(p.createdAt)}</td>
                <td>
                  <form className="inline-form" action={postStatusAction.bind(null, p.id)}>
                    <select name="status" defaultValue={p.status} style={{ width: 120, padding: '5px 8px' }}>
                      <option value="ACTIVE">노출</option>
                      <option value="HIDDEN">숨김</option>
                      <option value="DELETED">삭제</option>
                    </select>
                    <button className="btn small" type="submit">변경</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
