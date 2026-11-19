import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  await requireAdmin();
  const { action = '' } = await searchParams;
  const res = await adminApi<any[]>(`/admin/audit-logs${action ? `?action=${encodeURIComponent(action)}` : ''}`);
  const rows = res.data ?? [];
  return (
    <>
      <div className="card">
        <form className="inline-form" action="/audit">
          <input name="action" defaultValue={action} placeholder="감사 액션 (예: REPORT_)" style={{ width: 260 }} />
          <button className="btn" type="submit">검색</button>
        </form>
      </div>
      <div className="card">
        <h2>감사로그 ({rows.length})</h2>
        <table>
          <thead><tr><th>일시</th><th>관리자</th><th>액션</th><th>대상</th><th>상세</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((log) => (
              <tr key={log.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(log.createdAt)}</td>
                <td>{log.admin?.name ?? '시스템'}<div className="muted" style={{ fontSize: 11 }}>{log.admin?.role}</div></td>
                <td className="mono">{log.action}</td>
                <td className="mono">{log.targetType ?? '-'}{log.targetId ? `:${String(log.targetId).slice(0, 10)}` : ''}</td>
                <td className="muted" style={{ maxWidth: 320, wordBreak: 'break-all' }}>{log.detail ? JSON.stringify(log.detail) : '-'}</td>
                <td className="mono">{log.ip ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
