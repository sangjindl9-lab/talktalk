/**
 * 톡톡 Talk Talk 검수 기준 ①~⑨ 통합 테스트
 *
 * 실제 PostgreSQL + 실제 NestJS 서버 + 실제 Socket.IO 클라이언트 2대를 사용한다.
 * 실행: npm run test:integration  (사전에 PostgreSQL 기동 및 dist 빌드 필요)
 */
import { spawn, ChildProcess } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { io, Socket } from 'socket.io-client';
import sharp from 'sharp';

const PORT = Number(process.env.TEST_PORT ?? 4100);
const BASE = `http://127.0.0.1:${PORT}`;
const prisma = new PrismaClient();
const results: { id: string; title: string; ok: boolean; detail: string }[] = [];
let server: ChildProcess | null = null;

function record(id: string, title: string, ok: boolean, detail: string) {
  results.push({ id, title, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id} ${title}\n   ${detail}`);
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function api(
  method: string,
  path: string,
  token?: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

async function uploadImage(token: string, buffer: Buffer, kind = 'CHAT', filename = 'photo.jpg') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buffer)], { type: 'image/jpeg' }), filename);
  form.append('kind', kind);
  const res = await fetch(`${BASE}/api/v1/media`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: res.status, json: (await res.json()) as any };
}

let seq = 0;
function uniqueDigits(): string {
  seq += 1;
  const stamp = String(Date.now()).slice(-6);
  const n = String(seq).padStart(2, '0');
  return `${stamp}${n}`.slice(-8);
}

async function makeUser(prefix: string, regionCode = '51130', regionName = '원주시') {
  const phone = `010-${9000 + ((Date.now() + seq) % 900)}-${1000 + Math.floor(Math.random() * 9000)}`;
  const req = await api('POST', '/auth/phone/request', null, { phone });
  assert(req.status === 201 || req.status === 200, `인증 요청 실패: ${req.status} ${JSON.stringify(req.json)}`);
  const devCode = req.json.devCode;
  assert(devCode, '개발 환경 인증번호가 없습니다.');
  const verified = await api('POST', '/auth/phone/verify', null, { phone, code: devCode });
  assert(verified.status === 200 || verified.status === 201, `인증 확인 실패: ${JSON.stringify(verified.json)}`);
  const nickname = `${prefix}${Date.now().toString().slice(-5)}${seq}`.slice(0, 12);
  const signup = await api('POST', '/auth/signup', null, {
    verificationToken: verified.json.verificationToken,
    nickname,
    realName: '검수테스트',
    birthDate: '1992-04-11',
    regionCode,
    regionName,
    interests: ['카페', '산책'],
    bio: '통합 테스트 계정',
    gender: 'NONE',
    genderVisible: false,
  });
  if (signup.status !== 201 && signup.status !== 200) {
    throw new Error(`가입 실패: ${signup.status} ${JSON.stringify(signup.json)}`);
  }
  return { token: signup.json.token as string, user: signup.json.user, phone, nickname, id: signup.json.user.id as string };
}

function connectSocket(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`${BASE}/ws`, { auth: { token }, transports: ['websocket'], reconnection: true });
    const timer = setTimeout(() => reject(new Error('소켓 연결 시간 초과')), 8000);
    socket.on('auth:ok', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('auth:error', (err) => {
      clearTimeout(timer);
      reject(new Error(`소켓 인증 실패: ${JSON.stringify(err)}`));
    });
  });
}

function emitAck<T = any>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return socket.timeout(6000).emitWithAck(event, payload) as Promise<T>;
}

async function startServer(): Promise<void> {
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development',
    IDENTITY_PROVIDER: 'dev',
    IAP_PROVIDER: 'mock',
    PUBLIC_BASE_URL: BASE,
    CORS_ORIGINS: BASE,
    STORAGE_LOCAL_DIR: './var/test-storage',
  };
  server = spawn('node', ['dist/main.js'], { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', (d) => {
    if (process.env.TEST_VERBOSE) process.stdout.write(`[server] ${d}`);
  });
  server.stderr?.on('data', (d) => process.stderr.write(`[server:err] ${d}`));
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* 대기 */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('서버 기동 실패');
}

async function stopServer(): Promise<void> {
  if (server && !server.killed) {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 800));
    if (!server.killed) server.kill('SIGKILL');
  }
}

async function main(): Promise<void> {
  console.log('=== 톡톡 Talk Talk 검수 기준 ①~⑨ 통합 테스트 ===');
  console.log(`대상 서버: ${BASE}`);
  await startServer();

  const health = await fetch(`${BASE}/health`).then((r) => r.json() as Promise<any>);
  console.log(`서버 상태: ${JSON.stringify(health)}`);

  // ─────────────────────────── ① 동시/상호 인사 수락 → 단일 방 ───────────────────────────
  try {
    const A = await makeUser('검수A');
    const B = await makeUser('검수B');
    const [s1, s2] = await Promise.allSettled([
      api('POST', '/notes/requests', A.token, { toUserId: B.id, message: '안녕하세요! 같은 동네라 반가워요.' }),
      api('POST', '/notes/requests', B.token, { toUserId: A.id, message: '반가워요, 저도 인사드려요.' }),
    ]);
    const sent = [s1, s2].filter((r) => r.status === 'fulfilled' && (r.value as any).status < 300).length;
    assert(sent >= 1, `동시 인사 발송 실패: ${JSON.stringify([s1, s2])}`);

    const receivedByA = await api('GET', '/notes/requests?box=received', A.token);
    const receivedByB = await api('GET', '/notes/requests?box=received', B.token);
    const pendingA = (receivedByA.json as any[]).filter((n) => n.from.id === B.id && n.status === 'PENDING');
    const pendingB = (receivedByB.json as any[]).filter((n) => n.from.id === A.id && n.status === 'PENDING');

    const accepts: Promise<any>[] = [];
    for (const note of pendingA) accepts.push(api('POST', `/notes/requests/${note.id}/accept`, A.token));
    for (const note of pendingB) accepts.push(api('POST', `/notes/requests/${note.id}/accept`, B.token));
    const accepted = await Promise.all(accepts);
    accepted.forEach((r) => assert(r.status < 300, `수락 실패: ${JSON.stringify(r.json)}`));

    const roomsA = await api('GET', '/chat/rooms', A.token);
    const directA = (roomsA.json as any[]).filter((r) => r.type === 'DIRECT');
    const dbRooms = await prisma.chatRoom.findMany({
      where: { type: 'DIRECT', noteKey: [A.id, B.id].sort().join(':') },
    });
    assert(dbRooms.length === 1, `1:1 방이 ${dbRooms.length}개 생성되었습니다(중복).`);
    assert(directA.length === 1, `A의 1:1 방 목록이 ${directA.length}개입니다.`);
    record('①', '동시/상호 인사 수락 시 단일 방 생성', true,
      `발송 ${sent}건, 수락 ${accepted.length}건 → DB 방 ${dbRooms.length}개, 목록 ${directA.length}개, roomId=${dbRooms[0].id}`);
  } catch (e) {
    record('①', '동시/상호 인사 수락 시 단일 방 생성', false, (e as Error).message);
  }

  // ─────────────────────────── ② 비공개 사진 참여자 외 403 ───────────────────────────
  try {
    const A = await makeUser('사진A');
    const B = await makeUser('사진B');
    const C = await makeUser('사진C');
    const note = await api('POST', '/notes/requests', A.token, { toUserId: B.id, message: '사진 테스트 인사입니다.' });
    const room = await api('POST', `/notes/requests/${note.json.id}/accept`, B.token);
    const roomId = room.json.roomId as string;

    // EXIF/GPS가 포함된 JPEG 생성
    const withExif = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 240, g: 120, b: 80 } },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'talk-talk', ImageDescription: 'GPS 37.34,127.92' } } })
      .toBuffer();

    const uploaded = await uploadImage(A.token, withExif, 'CHAT');
    assert(uploaded.status < 300, `업로드 실패: ${uploaded.status} ${JSON.stringify(uploaded.json)}`);
    const mediaId = uploaded.json.id as string;
    assert(uploaded.json.exifRemoved === true, 'EXIF 제거 플래그가 없습니다.');

    const sent = await api('POST', `/chat/rooms/${roomId}/messages`, A.token, {
      type: 'IMAGE', mediaId, clientMessageId: `photo-${Date.now()}`,
    });
    assert(sent.status < 300, `사진 메시지 실패: ${JSON.stringify(sent.json)}`);

    const asOwner = await fetch(`${BASE}/api/v1/media/${mediaId}`, { headers: { authorization: `Bearer ${A.token}` } });
    const asMember = await fetch(`${BASE}/api/v1/media/${mediaId}`, { headers: { authorization: `Bearer ${B.token}` } });
    const asOutsider = await fetch(`${BASE}/api/v1/media/${mediaId}`, { headers: { authorization: `Bearer ${C.token}` } });
    const outsiderBody = await asOutsider.json() as any;

    const rawBuffer = Buffer.from(await asOwner.arrayBuffer());
    const meta = await sharp(rawBuffer).metadata();
    assert(!meta.exif && !(meta as unknown as Record<string, unknown>)['gps'], '업로드된 사진에 EXIF/GPS가 남아 있습니다.');

    assert(asOwner.status === 200, `참여자 조회 실패: ${asOwner.status}`);
    assert(asMember.status === 200, `참여자(수신자) 조회 실패: ${asMember.status}`);
    assert(asOutsider.status === 403, `참여자 외 접근이 ${asOutsider.status}였습니다(403 기대).`);
    record('②', '비공개 사진 참여자 외 403 차단 + EXIF/GPS 제거', true,
      `owner=${asOwner.status}, member=${asMember.status}, outsider=${asOutsider.status}(${outsiderBody?.code}), EXIF 제거 확인`);
  } catch (e) {
    record('②', '비공개 사진 참여자 외 403 차단 + EXIF/GPS 제거', false, (e as Error).message);
  }

  // ─────────────────────────── ③ 소켓 재연결 누락·중복 없음 ───────────────────────────
  try {
    const A = await makeUser('소켓A');
    const B = await makeUser('소켓B');
    const note = await api('POST', '/notes/requests', A.token, { toUserId: B.id, message: '소켓 테스트 인사입니다.' });
    const room = await api('POST', `/notes/requests/${note.json.id}/accept`, B.token);
    const roomId = room.json.roomId as string;

    const sockA = await connectSocket(A.token);
    let sockB = await connectSocket(B.token);
    await emitAck(sockA, 'room:join', { roomId });
    await emitAck(sockB, 'room:join', { roomId });

    const receivedByB: string[] = [];
    sockB.on('message:new', (m: any) => receivedByB.push(m.clientMessageId));

    const sentIds: string[] = [];
    for (let i = 1; i <= 3; i += 1) {
      const cid = `sync-${Date.now()}-${i}`;
      sentIds.push(cid);
      const ack = await emitAck(sockA, 'message:send', { roomId, type: 'TEXT', body: `온라인 메시지 ${i}`, clientMessageId: cid });
      assert(ack.ok, `소켓 전송 실패: ${JSON.stringify(ack)}`);
    }
    await new Promise((r) => setTimeout(r, 300));
    assert(receivedByB.length === 3, `B가 받은 실시간 메시지가 ${receivedByB.length}건입니다.`);

    sockB.disconnect();
    const offlineIds: string[] = [];
    for (let i = 4; i <= 5; i += 1) {
      const cid = `sync-${Date.now()}-${i}`;
      offlineIds.push(cid);
      sentIds.push(cid);
      const ack = await emitAck(sockA, 'message:send', { roomId, type: 'TEXT', body: `오프라인 메시지 ${i}`, clientMessageId: cid });
      assert(ack.ok, `오프라인 구간 전송 실패: ${JSON.stringify(ack)}`);
    }

    sockB = await connectSocket(B.token);
    await emitAck(sockB, 'room:join', { roomId });
    const sync = await emitAck(sockB, 'chat:sync', { roomId, afterSeq: '0', limit: 100 });
    assert(sync.ok, `동기화 실패: ${JSON.stringify(sync)}`);
    const syncedIds = (sync.messages as any[]).map((m) => m.clientMessageId);
    const uniqueSynced = new Set(syncedIds);
    assert(uniqueSynced.size === syncedIds.length, '동기화 결과에 중복 메시지가 있습니다.');
    for (const id of sentIds) assert(uniqueSynced.has(id), `동기화에서 ${id} 메시지가 누락되었습니다.`);

    // clientMessageId 기반 재전송 중복 방지
    const dup1 = await api('POST', `/chat/rooms/${roomId}/messages`, A.token, {
      type: 'TEXT', body: '중복 전송 테스트', clientMessageId: 'dup-fixed-id',
    });
    const dup2 = await api('POST', `/chat/rooms/${roomId}/messages`, A.token, {
      type: 'TEXT', body: '중복 전송 테스트', clientMessageId: 'dup-fixed-id',
    });
    assert(dup2.json.duplicated === true, '동일 clientMessageId 재전송이 중복으로 처리되지 않았습니다.');
    const dupCount = await prisma.message.count({ where: { roomId, clientMessageId: 'dup-fixed-id' } });
    assert(dupCount === 1, `중복 메시지가 ${dupCount}건 저장되었습니다.`);

    sockA.disconnect();
    sockB.disconnect();
    record('③', '소켓 재연결 후 누락·중복 없는 동기화', true,
      `실시간 ${receivedByB.length}건, 오프라인 ${offlineIds.length}건 → sync ${syncedIds.length}건(중복 0, 누락 0), 중복 전송 DB ${dupCount}건`);
  } catch (e) {
    record('③', '소켓 재연결 후 누락·중복 없는 동기화', false, (e as Error).message);
  }

  // ─────────────────────────── ④ 차단 직후 인사·푸시·노출 차단 ───────────────────────────
  try {
    const D = await makeUser('차단D');
    const E = await makeUser('차단E');
    const F = await makeUser('차단F');
    const note = await api('POST', '/notes/requests', E.token, { toUserId: D.id, message: '차단 테스트 인사입니다.' });
    const room = await api('POST', `/notes/requests/${note.json.id}/accept`, D.token);
    const roomId = room.json.roomId as string;

    const beforeNotes = await prisma.notification.count({ where: { userId: D.id } });
    const blockAt = new Date();
    const block = await api('POST', '/blocks', D.token, { userId: E.id });
    assert(block.status < 300, `차단 실패: ${JSON.stringify(block.json)}`);

    const greeting = await api('POST', '/notes/requests', E.token, { toUserId: D.id, message: '차단 후 인사 시도' });
    assert(greeting.status === 403 && greeting.json.code === 'BLOCKED', `차단 후 인사가 ${greeting.status} ${greeting.json.code}로 처리되었습니다.`);

    const msg = await api('POST', `/chat/rooms/${roomId}/messages`, E.token, { type: 'TEXT', body: '차단 후 메시지' });
    assert(msg.status === 403, `차단 후 메시지가 ${msg.status}로 처리되었습니다.`);

    const nearbyD = await api('GET', '/nearby', D.token);
    const nearbyE = await api('GET', '/nearby', E.token);
    assert(!(nearbyD.json as any[]).some((u) => u.id === E.id), '차단한 회원이 주변 목록에 노출됩니다.');
    assert(!(nearbyE.json as any[]).some((u) => u.id === D.id), '나를 차단한 회원이 주변 목록에 노출됩니다.');

    const newNotes = await prisma.notification.findMany({ where: { userId: D.id, createdAt: { gte: blockAt } } });
    assert(newNotes.length === 0, `차단 후 알림이 ${newNotes.length}건 발송되었습니다.`);
    const afterNotes = await prisma.notification.count({ where: { userId: D.id } });
    assert(afterNotes <= beforeNotes, '차단 후 알림이 증가했습니다.');

    // 그룹방에서 차단 회원 메시지 가림
    const group = await api('POST', '/rooms', D.token, { title: `차단가림방${Date.now().toString().slice(-4)}`, capacity: 10, type: 'GROUP' });
    const groupId = group.json.id as string;
    await api('POST', `/rooms/${groupId}/join`, E.token, {});
    await api('POST', `/rooms/${groupId}/join`, F.token, {});
    await api('POST', `/chat/rooms/${groupId}/messages`, E.token, { type: 'TEXT', body: '그룹방 차단 메시지' });
    const dView = await api('GET', `/chat/rooms/${groupId}/messages`, D.token);
    const fView = await api('GET', `/chat/rooms/${groupId}/messages`, F.token);
    const dMsg = (dView.json as any[]).find((m) => m.senderId === E.id);
    const fMsg = (fView.json as any[]).find((m) => m.senderId === E.id);
    assert(dMsg?.masked === true && dMsg?.body === null, '차단한 회원의 그룹방 메시지가 가려지지 않았습니다.');
    assert(fMsg?.masked === false && fMsg?.body === '그룹방 차단 메시지', '제3자에게 메시지가 정상 노출되지 않았습니다.');

    record('④', '차단 직후 인사·메시지·주변·푸시 차단 및 그룹방 가림', true,
      `인사=${greeting.status}/${greeting.json.code}, 메시지=${msg.status}, 주변 노출 0, 알림 증가 0, 그룹방 가림 확인`);
  } catch (e) {
    record('④', '차단 직후 인사·메시지·주변·푸시 차단 및 그룹방 가림', false, (e as Error).message);
  }

  // ─────────────────────────── ⑤ 위치권한 거절 → '원주시' 지역방 참여 ───────────────────────────
  try {
    const G = await makeUser('위치G');
    const regions = await api('GET', '/regions', G.token);
    const wonju = (regions.json as any[]).find((r) => r.name === '원주시');
    assert(wonju, '지역 목록에 원주시가 없습니다.');

    // 위치 권한 거절 후 직접 선택한 지역으로 프로필 지역 갱신
    const updated = await api('PUT', '/me/region', G.token, { regionCode: wonju.code });
    assert(updated.status < 300, `지역 설정 실패: ${JSON.stringify(updated.json)}`);

    const join = await api('POST', `/rooms/regions/${wonju.code}/join`, G.token);
    assert(join.status < 300 && join.json.joined === true, `지역방 참여 실패: ${JSON.stringify(join.json)}`);

    const detail = await api('GET', `/chat/rooms/${join.json.roomId}`, G.token);
    assert(detail.json.members.some((m: any) => m.id === G.id), '지역방 참여자 목록에 없습니다.');
    assert(detail.json.regionName === '원주시', `지역방 이름이 ${detail.json.regionName}입니다.`);

    const nearby = await api('GET', '/nearby', G.token);
    const raw = JSON.stringify(nearby.json);
    assert(!/"lat"|"lng"|"distanceKm"|"distanceMeters"/.test(raw), '주변 목록 응답에 좌표/정밀거리가 포함되어 있습니다.');
    const labels = new Set((nearby.json as any[]).map((u) => u.distanceLabel));
    assert([...labels].every((l) => ['같은 동네', '가까운 지역', '조금 먼 지역'].includes(l as string)), `거리 라벨이 부적절합니다: ${[...labels]}`);

    record('⑤', "위치권한 거절 후 '원주시' 지역방 참여", true,
      `지역 선택=${wonju.name}(${wonju.code}), 지역방 참여 roomId=${join.json.roomId}, 인원=${detail.json.memberCount}, 거리 라벨=${[...labels].join('/')}, 좌표 미노출`);
  } catch (e) {
    record('⑤', "위치권한 거절 후 '원주시' 지역방 참여", false, (e as Error).message);
  }

  // ─────────────────────────── ⑥ 정원 1자리 동시 2명 입장 ───────────────────────────
  try {
    const owner = await makeUser('정원주');
    const u1 = await makeUser('정원1');
    const u2 = await makeUser('정원2');
    const room = await api('POST', '/rooms', owner.token, {
      title: `정원테스트${Date.now().toString().slice(-5)}`, capacity: 2, type: 'GROUP',
    });
    const roomId = room.json.id as string;

    const [j1, j2] = await Promise.all([
      api('POST', `/rooms/${roomId}/join`, u1.token, {}),
      api('POST', `/rooms/${roomId}/join`, u2.token, {}),
    ]);
    const successes = [j1, j2].filter((r) => r.status < 300 && r.json.joined === true).length;
    const full = [j1, j2].filter((r) => r.status === 409 && r.json.code === 'ROOM_FULL').length;
    const memberCount = await prisma.chatRoomMember.count({ where: { roomId, leftAt: null } });
    assert(successes === 1, `동시 입장 성공이 ${successes}건입니다(1건 기대).`);
    assert(full === 1, `정원 초과 응답이 ${full}건입니다(1건 기대).`);
    assert(memberCount === 2, `최종 인원이 ${memberCount}명입니다(2명 기대).`);

    record('⑥', '정원 1자리에 동시 2명 입장 시 1명만 성공', true,
      `성공 ${successes}건, ROOM_FULL ${full}건, 최종 인원 ${memberCount}/2`);
  } catch (e) {
    record('⑥', '정원 1자리에 동시 2명 입장 시 1명만 성공', false, (e as Error).message);
  }

  // ─────────────────────────── ⑦ 상단고정 실패 원복 + 영수증 멱등성 ───────────────────────────
  try {
    const K = await makeUser('결제K');
    const L = await makeUser('결제L');
    const txId = `google-tx-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const first = await api('POST', '/billing/verify', K.token, {
      platform: 'GOOGLE', productId: 'talktalk_points_1000', transactionId: txId, purchaseToken: 'mock-ok-token',
    });
    assert(first.status < 300 && first.json.status === 'VERIFIED', `영수증 검증 실패: ${JSON.stringify(first.json)}`);
    const balanceAfterCharge = first.json.balance as number;
    assert(balanceAfterCharge === 1000, `충전 잔액이 ${balanceAfterCharge}입니다.`);

    const second = await api('POST', '/billing/verify', K.token, {
      platform: 'GOOGLE', productId: 'talktalk_points_1000', transactionId: txId, purchaseToken: 'mock-ok-token',
    });
    assert(second.json.status === 'DUPLICATE', `동일 영수증 재처리 상태가 ${second.json.status}입니다.`);
    const balanceAfterDup = second.json.balance as number;
    assert(balanceAfterDup === balanceAfterCharge, `동일 영수증 재처리로 잔액이 ${balanceAfterCharge} → ${balanceAfterDup} 변했습니다.`);

    const otherPost = await api('POST', '/board/posts', L.token, {
      title: '다른 사람 게시글', body: '상단고정 실패 검증용', category: 'DAILY',
    });
    const failPromote = await api('POST', `/board/posts/${otherPost.json.id}/promote`, K.token, { days: 1 });
    assert(failPromote.status === 400 && failPromote.json.code === 'PROMOTION_TARGET_INVALID',
      `타인 게시글 상단고정이 ${failPromote.status} ${failPromote.json.code}로 처리되었습니다.`);
    const afterFail = await api('GET', '/points/balance', K.token);
    assert(afterFail.json.balance === balanceAfterDup, `실패 후 잔액이 ${afterFail.json.balance}입니다(원복 실패).`);

    const ledger = await prisma.pointTransaction.findMany({
      where: { userId: K.id, refType: 'promotion' },
      orderBy: { createdAt: 'asc' },
    });
    const used = ledger.find((t) => t.type === 'USE');
    const refunded = ledger.find((t) => t.type === 'REFUND');
    assert(used && refunded, '상단고정 실패에 대한 USE/REFUND 원장 기록이 없습니다.');
    assert(used!.amount === -300 && refunded!.amount === 300, '원장 금액이 올바르지 않습니다.');

    const ownPost = await api('POST', '/board/posts', K.token, {
      title: '내 게시글', body: '상단고정 성공 검증용', category: 'DAILY',
    });
    const okPromote = await api('POST', `/board/posts/${ownPost.json.id}/promote`, K.token, { days: 1 });
    assert(okPromote.status < 300 && okPromote.json.status === 'ACTIVE', `정상 상단고정 실패: ${JSON.stringify(okPromote.json)}`);
    const list = await api('GET', `/board/posts?regionCode=51130`, K.token);
    const promotedPost = (list.json as any[]).find((p) => p.id === ownPost.json.id);
    assert(promotedPost?.promoted === true && (list.json as any[])[0].id === ownPost.json.id, '상단고정 게시글이 목록 최상단에 노출되지 않습니다.');

    record('⑦', '유료 상단고정 실패 포인트 원복 & 동일 영수증 재처리 잔액 불변', true,
      `충전 ${balanceAfterCharge}P → 중복 ${second.json.status} 잔액 ${balanceAfterDup}P 유지, 실패 후 ${afterFail.json.balance}P(USE -300/REFUND +300), 정상 상단고정 ${okPromote.json.status}`);
  } catch (e) {
    record('⑦', '유료 상단고정 실패 포인트 원복 & 동일 영수증 재처리 잔액 불변', false, (e as Error).message);
  }

  // ─────────────────────────── ⑧ 신고 → 관리자 조치 → 이용자·이력 반영 ───────────────────────────
  try {
    const M = await makeUser('신고대상');
    const N = await makeUser('신고자');
    const note = await api('POST', '/notes/requests', M.token, { toUserId: N.id, message: '신고 테스트 인사입니다.' });
    const room = await api('POST', `/notes/requests/${note.json.id}/accept`, N.token);
    const roomId = room.json.roomId as string;
    const bad = await api('POST', `/chat/rooms/${roomId}/messages`, M.token, { type: 'TEXT', body: '신고 대상이 되는 메시지입니다.' });

    const report = await api('POST', '/reports', N.token, {
      targetType: 'MESSAGE', targetId: bad.json.message.id, reason: 'ABUSE', detail: '욕설이 포함되어 있습니다.',
    });
    assert(report.status < 300, `신고 접수 실패: ${JSON.stringify(report.json)}`);
    const reportId = report.json.id as string;

    const adminLogin = await api('POST', '/admin/auth/login', null, {
      email: 'admin@talktalk.eumsoft.co.kr', password: 'Admin!2345',
    });
    assert(adminLogin.status < 300, `관리자 로그인 실패: ${JSON.stringify(adminLogin.json)}`);
    const adminToken = adminLogin.json.token as string;

    const unassignedView = await api('GET', `/admin/reports/${reportId}`, adminToken);
    assert(unassignedView.status === 200 && unassignedView.json.snapshot, '증거 스냅샷이 없습니다.');

    const assign = await api('POST', `/admin/reports/${reportId}/assign`, adminToken, {});
    assert(assign.status < 300, `담당자 배정 실패: ${JSON.stringify(assign.json)}`);

    // 다른 권한(고객지원)은 증거 열람 불가
    const supportLogin = await api('POST', '/admin/auth/login', null, {
      email: 'support@talktalk.eumsoft.co.kr', password: 'Support!2345',
    });
    const supportView = await api('GET', `/admin/reports/${reportId}`, supportLogin.json.token);
    assert(supportView.status === 403 && supportView.json.code === 'EVIDENCE_FORBIDDEN',
      `고객지원 계정의 증거 열람이 ${supportView.status}로 허용되었습니다.`);

    const action = await api('POST', `/admin/reports/${reportId}/actions`, adminToken, {
      actionType: 'SUSPEND_7D', note: '욕설 게시로 7일 이용 제한',
    });
    assert(action.status < 300 && action.json.status === 'RESOLVED', `조치 실패: ${JSON.stringify(action.json)}`);

    const suspended = await prisma.user.findUnique({ where: { id: M.id } });
    assert(suspended?.status === 'SUSPENDED', `회원 상태가 ${suspended?.status}입니다.`);

    const loginBlocked = await api('POST', '/auth/phone/request', null, { phone: M.phone });
    const loginAttempt = await api('POST', '/auth/login', null, { phone: M.phone, code: loginCode(loginBlocked) });
    assert(loginAttempt.status === 403, `제재 회원 로그인이 ${loginAttempt.status}로 허용되었습니다.`);

    const reporterNoti = await prisma.notification.findFirst({
      where: { userId: N.id, type: 'REPORT_RESULT' }, orderBy: { createdAt: 'desc' },
    });
    assert(reporterNoti, '신고자에게 처리 결과 알림이 없습니다.');

    const auditRows = await prisma.auditLog.findMany({ where: { reportId } });
    const actions = auditRows.map((a) => a.action);
    assert(actions.includes('REPORT_EVIDENCE_VIEWED'), '증거 열람 감사로그가 없습니다.');
    assert(actions.includes('REPORT_ACTION_SUSPEND_7D'), '조치 감사로그가 없습니다.');

    const reportRow = await prisma.report.findUnique({ where: { id: reportId } });
    assert(reportRow?.status === 'RESOLVED' && reportRow.resolution, '신고 상태/처리 내용이 반영되지 않았습니다.');

    // 이의신청 → 수락 시 제재 해제
    const appeal = await api('POST', '/appeals', M.token, { reportId, message: '억울합니다. 재검토 부탁드립니다.' });
    assert(appeal.status < 300, `이의신청 실패: ${JSON.stringify(appeal.json)}`);
    const resolve = await api('POST', `/admin/appeals/${appeal.json.id}/resolve`, adminToken, { accept: true, response: '이의신청을 수용합니다.' });
    assert(resolve.status < 300, `appeal resolve failed: ${JSON.stringify(resolve.json)}`);
    const restored = await prisma.user.findUnique({ where: { id: M.id } });
    assert(restored?.status === 'ACTIVE', '이의신청 수락 후 제재가 해제되지 않았습니다.');

    record('⑧', '신고 → 관리자 증거확인/조치 → 이용자·이력 반영', true,
      `신고 ${reportId} → 배정/열람로그 ${actions.filter((a) => a === 'REPORT_EVIDENCE_VIEWED').length}건, 상태 RESOLVED, 회원 SUSPENDED→(이의수락) ACTIVE, 신고자 알림 확인, 고객지원 증거열람 403`);
  } catch (e) {
    record('⑧', '신고 → 관리자 증거확인/조치 → 이용자·이력 반영', false, (e as Error).message);
  }

  // ─────────────────────────── ⑨ 계정 삭제 후 주변·검색 미노출 ───────────────────────────
  try {
    const P = await makeUser('탈퇴P');
    const Q = await makeUser('탈퇴Q');
    const note = await api('POST', '/notes/requests', P.token, { toUserId: Q.id, message: '탈퇴 테스트 인사입니다.' });
    const room = await api('POST', `/notes/requests/${note.json.id}/accept`, Q.token);
    const roomId = room.json.roomId as string;
    await api('POST', `/chat/rooms/${roomId}/messages`, P.token, { type: 'TEXT', body: '탈퇴 전 메시지' });

    const del = await api('DELETE', '/me', P.token, { confirm: 'DELETE', reason: '검수 테스트' });
    assert(del.status < 300, `계정 삭제 실패: ${JSON.stringify(del.json)}`);

    const profile = await api('GET', `/users/${P.id}`, Q.token);
    assert(profile.status === 404, `탈퇴 회원 프로필이 ${profile.status}로 조회됩니다.`);

    const nearby = await api('GET', '/nearby', Q.token);
    assert(!(nearby.json as any[]).some((u) => u.id === P.id), '탈퇴 회원이 주변 목록에 노출됩니다.');

    const search = await api('GET', `/users/search?q=${encodeURIComponent(P.nickname)}`, Q.token);
    assert((search.json as any[]).length === 0, `탈퇴 회원이 검색에 ${(search.json as any[]).length}건 노출됩니다.`);

    const messages = await api('GET', `/chat/rooms/${roomId}/messages`, Q.token);
    const last = (messages.json as any[]).find((m) => m.senderId === P.id);
    assert(last?.senderNickname === '탈퇴한 회원', `탈퇴 회원 표시가 '${last?.senderNickname}'입니다.`);

    const tokens = await prisma.deviceToken.count({ where: { userId: P.id } });
    const row = await prisma.user.findUnique({ where: { id: P.id } });
    assert(tokens === 0, `푸시 토큰이 ${tokens}건 남아 있습니다.`);
    assert(row?.status === 'DELETED' && row?.searchable === false && row?.photoUrl === null, '탈퇴 상태/검색노출/프로필 사진이 정리되지 않았습니다.');

    record('⑨', '계정 삭제 후 주변·검색 미노출', true,
      `삭제=${del.status}, 프로필 ${profile.status}, 주변/검색 0건, 대화 표시 '탈퇴한 회원', 푸시토큰 ${tokens}건, searchable=${row?.searchable}`);
  } catch (e) {
    record('⑨', '계정 삭제 후 주변·검색 미노출', false, (e as Error).message);
  }

  const passed = results.filter((r) => r.ok).length;
  console.log('\n=== 결과 요약 ===');
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.id}  ${r.title}`);
  console.log(`총 ${results.length}개 중 ${passed}개 통과`);
  process.exitCode = passed === results.length && results.length === 9 ? 0 : 1;
}

function loginCode(res: { json: any }): string {
  return res.json?.devCode ?? '123456';
}

main()
  .catch((e) => {
    console.error('테스트 실행 오류:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    await prisma.$disconnect();
  });
