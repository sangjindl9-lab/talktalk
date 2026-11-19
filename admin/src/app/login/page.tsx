import { loginAction } from '@/lib/actions';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ borderBottom: 'none', padding: '0 0 6px' }}>
          <div className="brand-logo">톡</div>
          <div>
            <div className="brand-name">톡톡 Talk Talk</div>
            <div className="brand-sub">이음소프트 운영 관리자</div>
          </div>
        </div>
        <h1>관리자 로그인</h1>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          권한이 부여된 운영자만 접속할 수 있습니다. 모든 관리자 행위는 감사로그에 기록됩니다.
        </p>
        {params.error ? <div className="error">{params.error}</div> : null}
        <form action={loginAction}>
          <div className="field">
            <label htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" autoComplete="username" required placeholder="admin@talktalk.eumsoft.co.kr" />
          </div>
          <div className="field">
            <label htmlFor="password">비밀번호</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn primary" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
            로그인
          </button>
        </form>
        <p className="muted" style={{ fontSize: 11, marginBottom: 0, marginTop: 14 }}>
          초기 최고관리자 계정은 docs/INSTALL_AND_OPERATIONS.md의 개발계정 생성 절차를 참고하세요.
        </p>
      </div>
    </div>
  );
}
