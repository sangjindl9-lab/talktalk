import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string }> }) {
  await requireAdmin();
  const { q = '', type = '' } = await searchParams;
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (type) query.set('type', type);
  const res = await adminApi<any[]>(`/admin/rooms?${query.toString()}`);
  const rows = res.data ?? [];
  return (
    <>
      <div className="card">
        <form className="inline-form" action="/rooms">
          <input name="q" defaultValue={q} placeholder="방 이름" style={{ width: 240 }} />
          <select name="type" defaultValue={type} style={{ width: 150 }}>
            <option value="">전체 유형</option>
            <option value="REGION">지역방</option>
            <option value="GROUP">그룹방</option>
            <option value="INTEREST">관심사방</option>
            <option value="DIRECT">1:1</option>
          </select>
          <button className="btn" type="submit">검색</button>
        </form>
      </div>
      <div className="card">
        <h2>방 목록 ({rows.length})</h2>
        <table>
          <thead><tr><th>방 이름</th><th>유형</th><th>지역</th><th>인원</th><th>공개</th><th>방장</th><th>상태</th><th>생성</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.title}</td>
                <td><span className="badge">{r.type}</span></td>
                <td>{r.regionCode ?? '-'}</td>
                <td>{r.memberCount}{r.capacity ? ` / ${r.capacity}` : ''}</td>
                <td>{r.visibility}</td>
                <td>{r.owner?.nickname ?? '-'}</td>
                <td><span className={`badge ${r.status === 'ACTIVE' ? 'green' : 'red'}`}>{r.status}</span></td>
                <td className="muted">{formatDate(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
