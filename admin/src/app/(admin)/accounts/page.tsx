import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin, ROLE_LABEL } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AccountsPage() {
  const { admin } = await requireAdmin();
  const res = await adminApi<any[]>('/admin/accounts');
  const rows = res.data ?? [];
  return (
    <>
      <div className="card">
        <h2>관리자 계정 ({rows.length})</h2>
        <table>
          <thead><tr><th>이름</th><th>이메일</th><th>권한</th><th>상태</th><th>최근 로그인</th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="mono">{a.email}</td>
                <td><span className="badge blue">{ROLE_LABEL[a.role] ?? a.role}</span></td>
                <td>{a.active ? '활성' : '비활성'}</td>
                <td className="muted">{formatDate(a.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h2>계정 추가</h2>
        <p className="muted" style={{ fontSize: 12 }}>
          현재 로그인: {admin.name} ({ROLE_LABEL[admin.role]}). 계정 생성은 최고관리자만 가능하며 API에서 권한을 검사합니다.
        </p>
        <p className="muted" style={{ fontSize: 12 }}>
          새 계정은 서버 API <code>POST /api/v1/admin/accounts</code>로 생성할 수 있습니다(최고관리자 토큰 필요). 초기 계정·비밀번호는 설치 문서를 참고하세요.
        </p>
      </div>
    </>
  );
}
