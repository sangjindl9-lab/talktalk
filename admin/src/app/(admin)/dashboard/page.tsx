import Link from 'next/link';
import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  await requireAdmin();
  const res = await adminApi<any>('/admin/dashboard');
  if (!res.ok) return <div className="error">대시보드를 불러오지 못했습니다: {res.error?.message}</div>;
  const d = res.data;
  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="label">전체 회원</div><div className="value">{d.users.toLocaleString()}</div><div className="muted" style={{ fontSize: 12 }}>최근 24시간 신규 {d.todayUsers}명</div></div>
        <div className="kpi"><div className="label">7일 활성</div><div className="value">{d.activeUsers.toLocaleString()}</div><div className="muted" style={{ fontSize: 12 }}>이용 제한 {d.suspended}명</div></div>
        <div className="kpi"><div className="label">운영 중 방</div><div className="value">{d.rooms.toLocaleString()}</div><div className="muted" style={{ fontSize: 12 }}>게시글 {d.posts.toLocaleString()}건</div></div>
        <div className="kpi"><div className="label">처리 대기 신고</div><div className="value" style={{ color: d.reportsOpen > 0 ? 'var(--danger)' : undefined }}>{d.reportsOpen}</div><div className="muted" style={{ fontSize: 12 }}>이의신청 {d.appeals}건</div></div>
      </div>

      {d.identityConfig?.warning ? <div className="warn-banner">⚠ {d.identityConfig.warning}</div> : null}

      <div className="split">
        <div className="card">
          <h2>최근 신고</h2>
          {(d.recentReports ?? []).length === 0 ? (
            <p className="muted">접수된 신고가 없습니다.</p>
          ) : (
            <table>
              <thead>
                <tr><th>유형</th><th>사유</th><th>상태</th><th>접수</th><th></th></tr>
              </thead>
              <tbody>
                {d.recentReports.map((r: any) => (
                  <tr key={r.id}>
                    <td>{r.targetType}</td>
                    <td>{r.reason}</td>
                    <td><span className="badge amber">{r.status}</span></td>
                    <td className="muted">{formatDate(r.createdAt)}</td>
                    <td><Link className="btn small" href={`/reports/${r.id}`}>열기</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h2>유형별 대기 신고</h2>
          {(d.openReportsByType ?? []).length === 0 ? <p className="muted">대기 중인 신고가 없습니다.</p> : (
            <table>
              <tbody>
                {d.openReportsByType.map((row: any) => (
                  <tr key={row.targetType}><td>{row.targetType}</td><td style={{ textAlign: 'right', fontWeight: 700 }}>{row.count}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ marginTop: 18 }}>운영 원칙</h2>
          <ul className="muted" style={{ paddingLeft: 18, fontSize: 12 }}>
            <li>개인 대화 전수 검색은 제공하지 않습니다. 신고된 증거만 담당자가 열람합니다.</li>
            <li>증거 열람·조치·환불 등 모든 행위는 감사로그에 기록됩니다.</li>
            <li>권한: 최고관리자 / 신고·제재 / 고객지원 / 정산으로 분리되어 있습니다.</li>
          </ul>
        </div>
      </div>
    </>
  );
}
