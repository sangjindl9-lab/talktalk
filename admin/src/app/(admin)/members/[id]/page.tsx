import Link from 'next/link';
import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { adjustPointsAction, restoreUserAction, suspendUserAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const res = await adminApi<any>(`/admin/users/${id}`);
  if (!res.ok) return <div className="error">회원 정보를 불러오지 못했습니다: {res.error?.message}</div>;
  const u = res.data;
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link href="/members" className="btn small">← 회원 목록</Link>
        <span className={`badge ${u.status === 'ACTIVE' ? 'green' : 'red'}`}>{u.status}</span>
        {u.suspendedUntil ? <span className="muted">해제 예정 {formatDate(u.suspendedUntil)}</span> : null}
      </div>
      <div className="split">
        <div className="card">
          <h2>{u.nickname}</h2>
          <table>
            <tbody>
              <tr><th style={{ width: 110 }}>회원 ID</th><td className="mono">{u.id}</td></tr>
              <tr><th>휴대폰</th><td className="mono">{u.phone}</td></tr>
              <tr><th>실명</th><td>{u.realName ?? '-'} (본인확인 {u.isAdult ? '성인' : '미완료'})</td></tr>
              <tr><th>지역/연령</th><td>{u.regionName ?? '-'} · {u.ageBand ?? '-'}</td></tr>
              <tr><th>관심사</th><td>{u.interests?.join(', ') || '-'}</td></tr>
              <tr><th>소개</th><td>{u.bio ?? '-'}</td></tr>
              <tr><th>포인트</th><td><strong>{u.points.toLocaleString()}P</strong></td></tr>
              <tr><th>신고</th><td>피신고 {u.counts.reportsAgainst}건 · 신고 {u.counts.reportsFiled}건</td></tr>
              <tr><th>활동</th><td>참여 방 {u.counts.rooms} · 인사 {u.counts.notes} · 결제 {u.counts.payments}</td></tr>
              <tr><th>가입/접속</th><td>{formatDate(u.createdAt)} / {formatDate(u.lastActiveAt)}</td></tr>
              {u.suspensionReason ? <tr><th>제재 사유</th><td>{u.suspensionReason}</td></tr> : null}
            </tbody>
          </table>
          <h2 style={{ marginTop: 18 }}>최근 결제</h2>
          <table>
            <thead><tr><th>상품</th><th>포인트</th><th>금액</th><th>상태</th><th>일시</th></tr></thead>
            <tbody>
              {(u.payments ?? []).map((p: any) => (
                <tr key={p.id}><td className="mono">{p.productId}</td><td>{p.points}</td><td>{p.amount.toLocaleString()}원</td><td>{p.status}</td><td className="muted">{formatDate(p.createdAt)}</td></tr>
              ))}
              {(u.payments ?? []).length === 0 ? <tr><td colSpan={5} className="muted">결제 없음</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div>
          <div className="card">
            <h2>이용 제한</h2>
            <form action={suspendUserAction.bind(null, u.id)}>
              <div className="field">
                <label htmlFor="days">기간</label>
                <select id="days" name="days" defaultValue="7">
                  <option value="1">1일</option>
                  <option value="7">7일</option>
                  <option value="30">30일</option>
                  <option value="permanent">영구</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="reason">사유 (이용자에게 통지)</label>
                <input id="reason" name="reason" placeholder="운영정책 위반" />
              </div>
              <button className="btn danger" type="submit">이용 제한 적용</button>
            </form>
            <form action={restoreUserAction.bind(null, u.id)} style={{ marginTop: 8 }}>
              <button className="btn" type="submit">이용 제한 해제</button>
            </form>
          </div>
          <div className="card">
            <h2>포인트 조정</h2>
            <form action={adjustPointsAction.bind(null, u.id)}>
              <div className="field">
                <label htmlFor="amount">금액 (음수는 차감)</label>
                <input id="amount" name="amount" type="number" placeholder="예: 1000 또는 -500" />
              </div>
              <div className="field">
                <label htmlFor="memo">사유</label>
                <input id="memo" name="memo" placeholder="고객 보상" />
              </div>
              <button className="btn" type="submit">원장에 반영</button>
            </form>
            <p className="muted" style={{ fontSize: 11 }}>포인트 조정은 정산 권한(최고관리자·정산담당)만 가능합니다.</p>
          </div>
        </div>
      </div>
    </>
  );
}
