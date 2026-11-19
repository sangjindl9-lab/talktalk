import { adminApi, formatDate, won } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { refundPaymentAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin();
  const { status = '' } = await searchParams;
  const res = await adminApi<any[]>(`/admin/payments${status ? `?status=${status}` : ''}`);
  const rows = res.data ?? [];
  return (
    <>
      <div className="tabs">
        <a href="/payments" className={status === '' ? 'active' : ''}>전체</a>
        <a href="/payments?status=VERIFIED" className={status === 'VERIFIED' ? 'active' : ''}>검증완료</a>
        <a href="/payments?status=REFUNDED" className={status === 'REFUNDED' ? 'active' : ''}>환불</a>
        <a href="/payments?status=FAILED" className={status === 'FAILED' ? 'active' : ''}>실패</a>
      </div>
      <div className="card">
        <h2>결제 ({rows.length})</h2>
        <table>
          <thead><tr><th>일시</th><th>회원</th><th>플랫폼</th><th>상품</th><th>포인트</th><th>금액</th><th>상태</th><th>영수증</th><th>환불</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(p.createdAt)}</td>
                <td>{p.nickname}</td>
                <td>{p.platform}</td>
                <td className="mono">{p.productId}</td>
                <td>{won(p.points)}P</td>
                <td>{won(p.amount)}원</td>
                <td><span className={`badge ${p.status === 'VERIFIED' ? 'green' : p.status === 'REFUNDED' ? 'amber' : 'red'}`}>{p.status}</span></td>
                <td className="mono">{p.transactionId.slice(0, 16)}…</td>
                <td>
                  {p.status === 'VERIFIED' ? (
                    <form className="inline-form" action={refundPaymentAction.bind(null, p.id)}>
                      <input name="reason" placeholder="사유" style={{ width: 110, padding: '5px 8px' }} />
                      <button className="btn small danger" type="submit">환불</button>
                    </form>
                  ) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 11 }}>환불 시 지급 포인트를 회수하며(잔액 한도 내), 원장에 REFUND 기록이 남습니다. 정산 권한만 실행할 수 있습니다.</p>
      </div>
    </>
  );
}
