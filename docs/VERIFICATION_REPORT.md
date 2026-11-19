# 톡톡 Talk Talk — 검수 결과 보고서

- 검수일: 2026-11-19 (Asia/Seoul)
- 대상: `/workspace/tank-talk` (서비스명 **톡톡 Talk Talk**, 운영사 이음소프트)
- 환경: Node.js 24.22.3 · Prisma 6.19.3 · PostgreSQL 18.6 (`127.0.0.1:55432`, DB `tanktalk`) · Redis 미설치(인메모리 fallback) · Flutter/Java/Android SDK/Xcode 미설치

---

## 1. 실행 명령과 결과 요약

```bash
. /workspace/.tools/pg-env.sh && sh /workspace/.tools/pg-start.sh
cd /workspace/tank-talk/server
npx tsc --noEmit -p tsconfig.json     # 통과
npm run build                          # 통과 (dist/main.js)
npx tsx prisma/seed.ts                 # 지역 8 · 관리자 4 · 설정 7 · 지역방 · 테스트계정 6
npm run test:integration               # 9/9 통과
cd ../admin && npx tsc --noEmit && next build   # 통과
```

| 항목 | 결과 |
|---|---|
| 서버 타입체크 (`tsc --noEmit`) | ✅ 오류 0 |
| 서버 빌드 (`nest build`) | ✅ `server/dist/main.js` 생성 |
| Next.js 타입체크 | ✅ 오류 0 |
| Next.js 빌드 | ✅ 18개 라우트 생성 (`/login`, `/dashboard`, `/reports`, `/reports/[id]`, `/members`, `/members/[id]`, `/rooms`, `/posts`, `/ledger`, `/payments`, `/notices`, `/inquiries`, `/appeals`, `/settings`, `/audit`, `/accounts`) |
| DB 마이그레이션 | ✅ 3건 적용 (`20261119115921_init`, `member_read_seq`, `message_reply`) + 부분 유니크 인덱스 2종 |
| 통합 테스트 ①~⑨ | ✅ **9/9 통과** |

테스트는 실제 NestJS 서버를 별도 포트(4100)로 기동하고, **실제 PostgreSQL**과 **Socket.IO 클라이언트 2대**를 사용했습니다. 가짜 회원·모킹 DB는 사용하지 않았습니다(개발 시드 계정 제외).

---

## 2. 검수 기준별 결과

### ① 동시/상호 인사 수락 시 단일 방 생성 — ✅ PASS

- **절차**: 사용자 A·B가 서로에게 인사를 동시에 전송(`Promise.all`) → 양쪽 대기 인사를 동시에 수락 → 1:1 방 개수를 DB·API에서 확인
- **기대**: 수락이 동시에 일어나도 1:1 대화방은 1개만 생성
- **실제**: 발송 2건, 수락 2건 → **DB 방 1개, 목록 1개**, `roomId=cmwniw…`
- **근거**: `ChatRoom.noteKey` 유니크 제약 + 트랜잭션 + `P2002` 충돌 시 기존 방 재사용, 상대측 대기 인사 동시 수락 처리

### ② 비공개 사진 참여자 외 403 차단 + EXIF/GPS 제거 — ✅ PASS

- **절차**: EXIF(설명·GPS 문자열)를 넣은 JPEG 업로드 → 대화방에 사진 메시지 전송 → 작성자/수신자/제3자(비참여자) 각각 `GET /media/:id` 요청 → 저장된 이미지 메타데이터 재확인
- **기대**: 참여자 200, 비참여자 403, EXIF/GPS 미포함
- **실제**: owner=**200**, member=**200**, outsider=**403**(`MEDIA_FORBIDDEN`), 재인코딩 결과 `exif`/`gps` 없음
- **근거**: sharp `rotate() → resize → jpeg` 재인코딩으로 메타데이터 제거, `Media.kind=CHAT` + 방 참여 검증

### ③ 소켓 재연결 후 누락·중복 없는 동기화 — ✅ PASS

- **절차**: A·B 소켓 연결 → A가 3건 전송(B 실시간 수신 확인) → B 연결 해제 → A가 2건 추가 전송 → B 재연결 후 `chat:sync(afterSeq=0)` → 전체 5건의 clientMessageId 집합 검증 → 동일 clientMessageId 2회 HTTP 전송
- **기대**: 재연결 후 누락 0·중복 0, 중복 전송은 1건만 저장
- **실제**: 실시간 3건, 오프라인 2건 → **sync 5건(중복 0, 누락 0)**, 중복 전송 DB **1건**
- **근거**: `Message.seq` 단조 증가 + `(senderId, clientMessageId)` 유니크 + `chat:sync` API

### ④ 차단 직후 인사·메시지·주변·푸시 차단 및 그룹방 가림 — ✅ PASS

- **절차**: D·E가 대화 중 D가 E를 차단 → E의 인사 전송, E의 메시지 전송, D/E 각각 주변 목록, 차단 이후 D의 알림 생성 여부 확인 → D·E·F 그룹방에서 E가 메시지 전송 후 D(차단자)와 F(제3자)의 조회 결과 비교
- **기대**: 인사·메시지 403, 주변 목록 상호 미노출, 알림 0건, 차단자에게는 메시지 가림
- **실제**: 인사 **403/BLOCKED**, 메시지 **403**, 주변 노출 **0**, 차단 후 알림 **0건**, D 화면 `masked=true`(본문 null) / F 화면 정상 노출

### ⑤ 위치권한 거절 후 '원주시' 지역방 참여 — ✅ PASS

- **절차**: 위치 권한 거절 상황을 가정해 `GET /regions`에서 원주시(51130) 선택 → `PUT /me/region` → `POST /rooms/regions/51130/join` → 방 상세·주변 목록 응답 검사
- **기대**: 좌표 없이도 지역방 참여 가능, 주변 응답에 좌표·정밀거리 없음
- **실제**: 지역 선택 `원주시(51130)` → 지역방 참여 성공(roomId `cmwni96k…`), 참여 인원 3명, 거리 라벨 `같은 동네`, 응답에 `lat`/`lng`/`distanceKm` **없음**
- **근거**: `broadDistanceLabel()` — 시군구 동일 시 '같은 동네', 3km 이내 '가까운 지역', 그 외 '조금 먼 지역'

### ⑥ 정원 1자리에 동시 2명 입장 시 1명만 성공 — ✅ PASS

- **절차**: 방장 포함 정원 2명 그룹방 생성 → 두 사용자가 `Promise.all`로 동시 입장
- **기대**: 1명 성공, 1명 `ROOM_FULL`, 최종 인원 2명
- **실제**: 성공 **1건**, `ROOM_FULL` **1건**, 최종 인원 **2/2**
- **근거**: `SELECT … FROM "ChatRoom" WHERE id = $1 FOR UPDATE` 행 잠금 + 트랜잭션 내 인원 재계산

### ⑦ 유료 상단고정 실패 포인트 원복 & 동일 영수증 재처리 잔액 불변 — ✅ PASS

- **절차**: 1,000P 상품을 모의 영수증으로 충전 → 동일 `transactionId` 재검증 → 타인 게시글에 1일 상단고정 시도(실패 유도) → 잔액·원장(USE/REFUND) 확인 → 본인 게시글 상단고정 성공 및 목록 최상단 노출 확인
- **기대**: 충전 1,000P, 중복 검증 시 잔액 불변, 실패 시 `USE -300` + `REFUND +300`으로 원복, 성공 시 최상단 노출
- **실제**: 충전 **1,000P** → 재처리 **DUPLICATE** 잔액 **1,000P 유지** → 실패 후 **1,000P**(원장 USE −300 / REFUND +300) → 정상 상단고정 `ACTIVE`, 목록 1번째
- **근거**: `Payment.transactionId` 유니크 + 포인트 원장 트랜잭션, `PromotionsService` 보상 처리, 만료 60초 주기 + 조회 필터

### ⑧ 신고 → 관리자 증거확인/조치 → 이용자·이력 반영 — ✅ PASS

- **절차**: M이 N에게 메시지 전송 → N이 메시지 신고(ABUSE) → 최고관리자 로그인 → 증거 조회(감사로그) → 담당자 배정 → 고객지원 계정으로 증거 열람 시도 → `SUSPEND_7D` 조치 → 회원 상태·로그인 차단·신고자 알림·감사로그·신고 상태 확인 → 이의신청 후 수락 → 제재 해제 확인
- **기대**: 담당자/최고관리자만 증거 열람, 지원 권한 403, 회원 SUSPENDED, 신고 RESOLVED, 신고자 알림, 감사로그 2종, 이의수락 시 ACTIVE 복귀
- **실제**: 신고 `cmwniwcx…` → 배정/열람로그 1건, 상태 **RESOLVED**, 회원 **SUSPENDED**(로그인 403) → 이의 수락 후 **ACTIVE**, 신고자 알림 확인, 고객지원 증거열람 **403**(`EVIDENCE_FORBIDDEN`)
- **근거**: `AdminService.reportDetail()` 권한 검사 + `REPORT_EVIDENCE_VIEWED` 감사로그, 조치 트랜잭션, `ModerationAction`·`AuditLog` 이력

### ⑨ 탈퇴 후 주변·검색 미노출 — ✅ PASS

- **절차**: P가 Q와 대화 후 `DELETE /me`(confirm=DELETE) → Q의 프로필 조회·주변 목록·닉네임 검색·대화 메시지 표시 확인 → DB에서 푸시 토큰·searchable·사진 확인
- **기대**: 프로필 404, 주변/검색 0건, 대화에 '탈퇴한 회원', 푸시 토큰 0, 검색노출 false
- **실제**: 삭제 **200**, 프로필 **404**, 주변/검색 **0건**, 표시 `탈퇴한 회원`, 푸시 토큰 **0건**, `searchable=false`, `photoUrl=null`

---

## 3. 기능 구현 범위 (지시서 1~10 대응)

| 영역 | 구현 내용 | 검증 구분 |
|---|---|---|
| 가입·인증 | 소개 화면, 휴대폰 인증 분리, 만 19세 제한, 개발 계정, 운영 시 본인확인 설정 누락 차단(503)·관리자 경고 | 서버 통합 ✅ / 앱 UI 미실행 |
| 프로필 | 닉네임·사진·연령대·지역(시군구)·관심사·소개·성별(선택·공개여부), 실명/생년월일/휴대폰 비노출 | 서버 통합 ✅ |
| 주변 친구 | 5탭, 가까운순/최근활동순, 지역·연령·관심사 필터, 거리 라벨만 반환, 3종 토글, 가짜 회원 없음 | 서버 통합 ✅ (⑤) |
| 쪽지·1:1 | 1건 텍스트·링크/사진 차단, 대기 중복 방지, 동시 수락 단일 방, 다중 인사(예상 비용·실제 발송분 차감) | 서버 통합 ✅ (①) |
| 대화 | 텍스트·사진, 참여자 외 403, 답장(인용 미리보기), 읽음·안읽음 수, 검색·복사·TXT 내보내기, 알림 끄기, 방 나가기 | 서버 통합 ✅ (②③④) |
| 실시간 | Socket.IO, `clientMessageId` 중복 방지, 재연결 `chat:sync`, 오프라인 큐, 푸시 미리보기 OFF | 서버 통합 ✅ (③) |
| 지역방·그룹방 | 상설 지역방, 관심사 그룹방, 제목·이미지·소개·해시태그·정원·검색노출·공개/비밀·가입승인, 방장/운영진/강퇴/위임/종료 | 서버 통합 ✅ (⑤⑥) |
| 동네·장터 | 게시판 4종·사진·댓글·공감·북마크·신고, 장터 3종·가격·상태 변경·거래문의(상품명+사진 대화) | 서버 통합 ✅ (⑦) |
| 포인트·결제 | 무료/유료 기능 분리, 가격 관리자 설정, Play/StoreKit 검증 API, 영수증 멱등성, 구독 복원·만료, 포인트 원장 | 서버 통합 ✅ (⑦) |
| 신고·차단·관리자 | 6종 사유·스냅샷, 유해 콘텐츠 필터, 전수 검색 금지·담당자 증거 열람·감사로그, 경고/숨김/정지/통지/이의, 회원·방·게시물·원장·환불·공지·문의·권한 분리 | 서버 통합 ✅ (④⑧) |
| 계정 삭제 | 프로필·사진·푸시 토큰 제거, 검색·주변 미노출, '탈퇴한 회원' 표시 | 서버 통합 ✅ (⑨) |

---

## 4. 검증 구분표 (중요)

| 구분 | 내용 | 상태 |
|---|---|---|
| 서버 ↔ 실제 DB 통합 | ①~⑨ 전체, 마이그레이션·시드 | ✅ 실행·통과 |
| 관리자 웹 실서버 연동 | `/login` 200 렌더, `/dashboard` 미인증 시 307→`/login`, 관리자 로그인 API 200 | ✅ 확인 |
| 관리자 웹 브라우저 UI 조작 | 로그인 후 화면별 클릭·입력 | ⚠ 미실행 (서버 렌더·빌드까지만 확인) |
| Flutter 앱 빌드/실행 | Flutter SDK·Android SDK·Xcode 미설치 | ⚠ **미검증** (전체 소스 작성 완료, Dart SDK 3.14.1 `dart format` 파싱 검사 42개 파일 통과) |
| Android 테스트 APK / Play AAB | CI 워크플로우만 작성 | ⚠ **미생성** |
| iOS 실빌드 / TestFlight | macOS·Xcode 없음 | ⚠ **미검증** |
| 인앱결제 실결제 | Play/App Store 상품 미등록, 검증은 `IAP_PROVIDER=mock` | ⚠ 모의 검증만 |
| 실제 푸시(FCM/APNs) | 키 미설정, 서버는 알림 저장+소켓 전송까지 | ⚠ 미연동 |
| 본인확인기관 연동 | 개발 모드(`IDENTITY_PROVIDER=dev`) | ⚠ 미연동 (운영 차단 로직 구현) |
| S3 호환 스토리지 | SigV4 서명 URL 코드 구현, 버킷 없음 | ⚠ 미실행 (로컬 스토리지로 검증) |
| Socket.IO Redis Adapter | 코드 포함, Redis 서버 없음 | ⚠ 인메모리 어댑터로 검증 |
| Render 실제 배포 | `render.yaml` 작성 | ⚠ 미배포 |

---

## 5. 알려진 제약·후속 작업

1. **Flutter 앱**: `lib/` 전체 화면·상태·오프라인 큐·소켓·인앱결제 코드 작성, Android(`compileSdk 35`, Kotlin DSL) 및 iOS(`Runner.xcodeproj`, Info.plist 권한 문구) 구성 완료. SDK가 없어 `flutter analyze`/`build`는 실행하지 못했으며, Dart SDK 3.14.1로 42개 파일의 파싱(`dart format`)만 검증했습니다. 첫 빌드 시 `flutter pub get` 후 `pod install`이 필요하며, 플러그인 버전 해석 오류가 나면 `pubspec.yaml`의 플러그인 버전을 최신 안정판으로 조정하세요.
2. **푸시**: `POST /api/v1/me/devices`로 토큰 등록까지 구현. FCM v1 발송은 서비스 계정 키 주입 후 `NotificationService`에 연결 필요.
3. **본인확인**: `IDENTITY_PROVIDER`/`SMS_API_URL` 설정 시 실제 발송·검증 호출 경로가 동작하도록 코드가 분기되어 있으나, 계약된 기관 API 스펙에 맞춘 최종 매핑 필요.
4. **상단고정 만료**: 60초 주기 + 조회 시 `endsAt > now` 필터로 즉시 미노출. 대규모 트래픽에서는 배치/큐 전환 권장.
5. **관리자 웹**: 서버 API 연동·빌드 검증 완료. 실제 브라우저에서 로그인 후 각 화면 조작 검수는 미실시.

---

## 6. 재현 방법

```bash
. /workspace/.tools/pg-env.sh && sh /workspace/.tools/pg-start.sh
cd /workspace/tank-talk/server && npm run test:integration
```

출력 예시(마지막 실행):

```
PASS  ①  동시/상호 인사 수락 시 단일 방 생성
PASS  ②  비공개 사진 참여자 외 403 차단 + EXIF/GPS 제거
PASS  ③  소켓 재연결 후 누락·중복 없는 동기화
PASS  ④  차단 직후 인사·메시지·주변·푸시 차단 및 그룹방 가림
PASS  ⑤  위치권한 거절 후 '원주시' 지역방 참여
PASS  ⑥  정원 1자리에 동시 2명 입장 시 1명만 성공
PASS  ⑦  유료 상단고정 실패 포인트 원복 & 동일 영수증 재처리 잔액 불변
PASS  ⑧  신고 → 관리자 증거확인/조치 → 이용자·이력 반영
PASS  ⑨  계정 삭제 후 주변·검색 미노출
총 9개 중 9개 통과
```
