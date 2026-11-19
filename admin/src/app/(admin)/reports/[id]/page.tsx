import Link from 'next/link';
import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { assignReportAction, reportAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

const ACTIONS = [
  { value: 'WARN', label: '경고' },
  { value: 'HIDE_CONTENT', label: '콘텐츠 숨김' },
  { value: 'SUSPEND_7D', label: '7일 이용 제한' },
  { value: 'SUSPEND_30D', label: '30일 이용 제한' },
  { value: 'PERMANENT_BAN', label: '영구 이용 제한' },
  { value: 'DISMISS', label: '신고 기각' },
  { value: 'RESTORE', label: '이용 제한 해제' },
];

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const res = await adminApi<any>(`/admin/reports/${id}`);
  if (!res.ok) {
    return (
      <div className="card">
        <h2>증거 열람 제한</h2>
        <p>{res.error?.message ?? '신고를 불러오지 못했습니다.'}</p>
        <p className="muted">본인에게 배정된 신고만 증거를 열람할 수 있습니다. 아래 버튼으로 담당자를 지정하세요.</p>
        <form action={assignReportAction.bind(null, id)}>
          <button className="btn primary" type="submit">나에게 배정</button>
        </form>
        <p style={{ marginTop: 12 }}><Link href="/reports">← 신고 목록</Link></p>
      </div>
    );
  }
  const r = res.data;
  const snapshot = r.snapshot ?? {};
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link href="/reports" className="btn small">← 목록</Link>
        <span className={`badge ${r.status === 'RESOLVED' ? 'green' : 'amber'}`}>{r.status}</span>
        <span className="muted">{r.targetType} 신고</span>
      </div>
      <div className="split">
        <div className="card">
          <h2>신고 내용</h2>
          <table>
            <tbody>
              <tr><th style={{ width: 110 }}>신고자</th><td>{r.reporter?.nickname} ({r.reporter?.id})</td></tr>
              <tr><th>대상 회원</th><td>{r.targetUser ? `${r.targetUser.nickname} (${r.targetUser.id})` : '-'}</td></tr>
              <tr><th>사유</th><td>{r.reason}</td></tr>
              <tr><th>상세</th><td>{r.detail ?? '-'}</td></tr>
              <tr><th>접수</th><td>{formatDate(r.createdAt)}</td></tr>
              <tr><th>담당</th><td>{r.assignee?.name ?? '미배정'}</td></tr>
              <tr><th>처리 결과</th><td>{r.resolution ?? '-'}</td></tr>
            </tbody>
          </table>
          <h2 style={{ marginTop: 18 }}>증거 스냅샷 (신고 시점)</h2>
          {snapshot.type === 'MESSAGE' ? (
            <table>
              <tbody>
                <tr><th style={{ width: 110 }}>메시지</th><td>{snapshot.body}</td></tr>
                <tr><th>방</th><td>{snapshot.roomType} · {snapshot.roomTitle}</td></tr>
                <tr><th>작성</th><td>{formatDate(snapshot.createdAt)}</td></tr>
                <tr><th>사진</th><td>{snapshot.mediaId ? <Link href={`/media/${snapshot.mediaId}`} target="_blank">첨부 사진 열기</Link> : '없음'}</td></tr>
              </tbody>
            </table>
          ) : null}
          {snapshot.type === 'POST' ? (
            <table>
              <tbody>
                <tr><th style={{ width: 110 }}>제목</th><td>{snapshot.title}</td></tr>
                <tr><th>본문</th><td style={{ whiteSpace: 'pre-wrap' }}>{snapshot.body}</td></tr>
              </tbody>
            </table>
          ) : null}
          <pre className="snapshot">{JSON.stringify(snapshot, null, 2)}</pre>
        </div>
        <div className="card">
          <h2>조치</h2>
          {r.status === 'RESOLVED' || r.status === 'DISMISSED' ? (
            <p className="muted">이미 처리가 완료된 신고입니다. 필요 시 이의신청 메뉴에서 검토하세요.</p>
          ) : (
            <form action={reportAction.bind(null, id)}>
              <div className="field">
                <label htmlFor="actionType">처리 유형</label>
                <select id="actionType" name="actionType" defaultValue="WARN">
                  {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="note">처리 사유/메모 (이용자에게 통지)</label>
                <textarea id="note" name="note" placeholder="예: 욕설이 포함된 메시지로 7일 이용 제한" />
              </div>
              <button className="btn primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>조치 적용</button>
            </form>
          )}
          <h2 style={{ marginTop: 18 }}>조치 이력</h2>
          {(r.actions ?? []).length === 0 ? <p className="muted">이력 없음</p> : (
            <table>
              <tbody>
                {r.actions.map((a: any) => (
                  <tr key={a.id}>
                    <td>{a.actionType}<div className="muted" style={{ fontSize: 11 }}>{a.admin?.name} · {formatDate(a.createdAt)}</div></td>
                    <td className="muted">{a.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>이 화면 열람도 감사로그에 기록되었습니다.</p>
        </div>
      </div>
    </>
  );
}
