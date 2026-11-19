import Link from 'next/link';
import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { assignReportAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const STATUS = [
  { value: '', label: '전체' },
  { value: 'RECEIVED', label: '접수' },
  { value: 'REVIEWING', label: '검토중' },
  { value: 'RESOLVED', label: '처리완료' },
  { value: 'DISMISSED', label: '기각' },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status = '' } = await searchParams;
  const res = await adminApi<any[]>(`/admin/reports${status ? `?status=${status}` : ''}`);
  const rows = res.data ?? [];
  return (
    <>
      {!res.ok ? <div className="error">신고 목록을 불러오지 못했습니다: {res.error?.message}</div> : null}
      <div className="tabs">
        {STATUS.map((s) => (
          <Link key={s.value} href={`/reports${s.value ? `?status=${s.value}` : ''}`} className={status === s.value ? 'active' : ''}>
            {s.label}
          </Link>
        ))}
      </div>
      <div className="card">
        <h2>신고 접수 ({rows.length})</h2>
        {rows.length === 0 ? <p className="muted">신고가 없습니다.</p> : (
          <table>
            <thead>
              <tr><th>접수</th><th>유형</th><th>사유</th><th>신고자</th><th>대상 회원</th><th>상태</th><th>담당</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
                  <td>{r.targetType}</td>
                  <td>{r.reason}</td>
                  <td>{r.reporter?.nickname}</td>
                  <td>{r.targetUser?.nickname ?? '-'}</td>
                  <td><span className={`badge ${r.status === 'RESOLVED' ? 'green' : r.status === 'DISMISSED' ? '' : 'amber'}`}>{r.status}</span></td>
                  <td className="muted">{r.assignee?.name ?? '미배정'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <form action={assignReportAction.bind(null, r.id)} style={{ display: 'inline' }}>
                      <button className="btn small" type="submit">담당 지정</button>
                    </form>{' '}
                    <Link className="btn small" href={`/reports/${r.id}`}>증거 확인</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        ※ 개인 대화 전수 검색은 제공되지 않습니다. 증거는 담당자로 배정된 관리자만 열람할 수 있고, 열람 기록이 감사로그에 남습니다.
      </p>
    </>
  );
}
