import Link from 'next/link';
import { requireAdmin, ROLE_LABEL } from '@/lib/session';
import { logoutAction } from '@/lib/actions';

const NAV = [
  { group: '운영 현황', items: [{ href: '/dashboard', label: '대시보드' }] },
  {
    group: '신고·제재',
    items: [
      { href: '/reports', label: '신고 접수' },
      { href: '/appeals', label: '이의신청' },
    ],
  },
  { group: '회원', items: [{ href: '/members', label: '회원 관리' }] },
  {
    group: '커뮤니티',
    items: [
      { href: '/rooms', label: '그룹·지역방' },
      { href: '/posts', label: '게시물' },
    ],
  },
  {
    group: '정산',
    items: [
      { href: '/ledger', label: '포인트 원장' },
      { href: '/payments', label: '결제·환불' },
    ],
  },
  {
    group: '고객지원',
    items: [
      { href: '/notices', label: '공지사항' },
      { href: '/inquiries', label: '문의 응대' },
    ],
  },
  {
    group: '시스템',
    items: [
      { href: '/settings', label: '운영 설정' },
      { href: '/audit', label: '감사로그' },
      { href: '/accounts', label: '관리자 계정' },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-logo">톡</div>
          <div>
            <div className="brand-name">톡톡 Talk Talk</div>
            <div className="brand-sub">관리자 콘솔</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="nav-group">{section.group}</div>
              {section.items.map((item) => (
                <Link key={item.href} href={item.href}>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <form action={logoutAction} style={{ marginTop: 22 }}>
          <button className="btn small" type="submit" style={{ width: '100%', justifyContent: 'center' }}>
            로그아웃
          </button>
        </form>
      </aside>
      <div className="main">
        <header className="topbar">
          <h1>톡톡 Talk Talk 운영 관리자</h1>
          <div className="row">
            <span className="badge blue">{ROLE_LABEL[admin.role] ?? admin.role}</span>
            <span className="who">
              {admin.name} · {admin.email}
            </span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
