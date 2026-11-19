import { adminApi, formatDate } from '@/lib/api';
import { requireAdmin } from '@/lib/session';
import { saveSettingsAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  await requireAdmin();
  const res = await adminApi<any>('/admin/settings');
  const s = res.data;
  const settings = s?.settings ?? {};
  const val = (key: string, fallback = '') => {
    const raw = settings[key];
    if (raw && typeof raw === 'object' && 'value' in raw) return String((raw as any).value);
    return raw === undefined || raw === null ? fallback : String(raw);
  };
  const identityProvider = settings['identity.provider']?.provider ?? '';
  return (
    <>
      {s?.identity?.warning ? <div className="warn-banner">⚠ {s.identity.warning}</div> : null}
      <div className="split">
        <div className="card">
          <h2>가격·무료 제공량</h2>
          <form action={saveSettingsAction}>
            <div className="field"><label>다중 인사 (1인당 P)</label><input name="price.multiNote" defaultValue={val('price.multiNote', '50')} type="number" /></div>
            <div className="field"><label>상단 고정 (1일 P)</label><input name="price.promotePerDay" defaultValue={val('price.promotePerDay', '300')} type="number" /></div>
            <div className="field"><label>다른 지역 둘러보기 (P)</label><input name="price.regionBrowse" defaultValue={val('price.regionBrowse', '100')} type="number" /></div>
            <div className="field"><label>그룹방 정원 10명 확장 (P)</label><input name="price.roomCapacityExpandPer10" defaultValue={val('price.roomCapacityExpandPer10', '500')} type="number" /></div>
            <div className="field"><label>본인확인 제공기관(IDENTITY_PROVIDER)</label><input name="identity.provider" defaultValue={identityProvider} placeholder="예: NICE, KCB" /></div>
            <button className="btn primary" type="submit">설정 저장</button>
          </form>
          <p className="muted" style={{ fontSize: 11 }}>설정 변경은 최고관리자만 가능하며 감사로그에 기록됩니다.</p>
        </div>
        <div>
          <div className="card">
            <h2>본인확인·성인인증 상태</h2>
            <table>
              <tbody>
                <tr><th>환경</th><td>{s?.identity?.production ? '운영(production)' : '개발(development)'}</td></tr>
                <tr><th>제공기관</th><td>{s?.identity?.provider ?? '미설정'}</td></tr>
                <tr><th>설정 완료</th><td>{s?.identity?.configured ? '✅ 완료' : '❌ 미완료'}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12 }}>운영 환경에서 설정이 없으면 신규 가입이 중단되고 이 화면에 경고가 표시됩니다.</p>
          </div>
          <div className="card">
            <h2>권한 분리</h2>
            <table>
              <tbody>
                {Object.entries(s?.roleMatrix ?? {}).map(([role, caps]) => (
                  <tr key={role}><th style={{ width: 110 }}>{role}</th><td>{(caps as string[]).join(', ')}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
