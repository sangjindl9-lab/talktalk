# 톡톡 Talk Talk — 설치·운영 안내

이 문서는 **「톡톡 Talk Talk」**(운영사 이음소프트) 모노레포의 설치, 개발계정 생성, 관리자 접속, Render 배포, iOS 서명·배포까지의 절차를 담고 있습니다.

- 브랜드 설정 원본: `brand.json` (서비스명 `톡톡 Talk Talk`, 영문 `Talk Talk`, 슬러그 `talk-talk`)
- 구성: `server/` (NestJS API·WebSocket), `admin/` (Next.js 관리자), `mobile/` (Flutter Android/iOS)

---

## 1. 사전 요구사항

| 구분 | 버전 | 비고 |
|---|---|---|
| Node.js | 20 이상 (검증: 24.22.3) | `server`, `admin` 공통 |
| PostgreSQL | 15 이상 (검증: 18.6) | 운영은 16 권장 |
| Redis | 7 (선택) | 미설정 시 인메모리 pub/sub·rate-limit fallback으로 동작 |
| Flutter | 3.24 이상 | 앱 빌드 시 |
| Xcode | 15 이상 | iOS 빌드 시 (macOS) |
| Android SDK | compileSdk 35 | AAB/APK 빌드 시 |

> 서버는 Redis가 없어도 완전히 기동·동작합니다. 다만 다중 인스턴스(수평 확장) 운영 시에는 `REDIS_URL`을 반드시 설정해 Socket.IO Redis Adapter를 활성화하세요.

---

## 2. 로컬 설치 (개발)

### 2.1 저장소·의존성

```bash
cd /workspace/tank-talk
cd server && npm install
cd ../admin && npm install
cd ../mobile && flutter pub get
```

### 2.2 PostgreSQL 기동 및 DB 생성

개발 컨테이너에는 PostgreSQL이 `/workspace/.tools`에 준비되어 있습니다. 기존 `market` DB는 건드리지 않고 **`tanktalk` DB만** 사용합니다.

```bash
. /workspace/.tools/pg-env.sh
sh /workspace/.tools/pg-start.sh
createdb -h 127.0.0.1 -p 55432 tanktalk     # 최초 1회
```

> 참고: 이 컨테이너는 셸 호출이 끝나면 백그라운드 프로세스가 정리되므로, 서버·테스트를 실행하는 **같은 셸 호출에서** `pg-start.sh`를 먼저 실행해야 합니다.

### 2.3 환경변수

```bash
cd server
cp .env.example .env
```

개발 기본값(`server/.env`) 예시:

```ini
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/tanktalk?schema=public
JWT_SECRET=dev-jwt-secret-change-me
PUBLIC_BASE_URL=http://localhost:4000
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./var/storage
STORAGE_SECRET=dev-storage-secret
IAP_PROVIDER=mock
IDENTITY_PROVIDER=dev
ADMIN_BOOTSTRAP_EMAIL=admin@talktalk.eumsoft.co.kr
ADMIN_BOOTSTRAP_PASSWORD=Admin!2345
CORS_ORIGINS=http://localhost:3000,http://localhost:4000
```

관리자 웹:

```bash
cd admin
echo 'API_BASE_URL=http://localhost:4000' > .env.local
```

### 2.4 마이그레이션·시드

```bash
cd server
npx prisma migrate deploy
npx tsx prisma/seed.ts
```

시드가 만드는 것:

- 지역(시군구) 8건: 원주시·춘천시·강릉시·횡성군·강남구·마포구·수원시·성남시
- 관리자 계정 4개(권한별)
- 관리자 설정: 가격(`price.*`), 본인확인(`identity.provider`), 콘텐츠 필터 등
- 상설 지역방(지역별 1개)
- 공지 1건
- **개발용 테스트 회원 6명** (운영 환경 `NODE_ENV=production`에서는 생성되지 않음 → 가짜 회원 금지 원칙)

### 2.5 실행

```bash
# API (http://localhost:4000/api/v1, health: /health)
cd server && npm run build && npm start

# 관리자 웹 (http://localhost:3000/login)
cd admin && npm run dev
```

---

## 3. 개발 테스트 계정

### 3.1 테스트 회원

- 휴대폰 번호: `010-1000-0001` ~ `010-1000-0006`
- 인증번호: 개발 환경에서는 **`123456`** 고정 (`NODE_ENV != production`)
- 앱에서 동일 번호로 `인증번호 받기 → 123456 입력`으로 로그인

새 회원 가입 절차(앱):

1. 소개 화면 → `시작하기`
2. 휴대폰 번호 입력 → 인증번호 `123456`
3. 프로필: 닉네임(2~12자)·실명(비공개)·생년월일(만 19세 이상)·활동 지역·관심사(1개 이상)·자기소개·성별(선택, 공개 여부 선택)
4. 가입 완료 → 첫 대화(주변 이웃에게 인사) 흐름

API로 직접 만들 경우:

```bash
curl -X POST http://localhost:4000/api/v1/auth/phone/request \
  -H 'content-type: application/json' -d '{"phone":"010-2000-0001"}'
# → {"sent":true,"devCode":"123456"}
curl -X POST http://localhost:4000/api/v1/auth/phone/verify \
  -H 'content-type: application/json' -d '{"phone":"010-2000-0001","code":"123456"}'
# → verificationToken
curl -X POST http://localhost:4000/api/v1/auth/signup \
  -H 'content-type: application/json' -d '{
    "verificationToken":"<토큰>","nickname":"원주테스터","realName":"홍길동",
    "birthDate":"1990-01-01","regionCode":"51130","interests":["카페"]}'
```

### 3.2 관리자 계정 (시드)

| 이메일 | 비밀번호 | 권한 |
|---|---|---|
| admin@talktalk.eumsoft.co.kr | `Admin!2345` (환경변수로 변경) | 최고관리자(SUPERADMIN) |
| moderator@talktalk.eumsoft.co.kr | `Moderator!2345` | 신고·제재(MODERATOR) |
| support@talktalk.eumsoft.co.kr | `Support!2345` | 고객지원(SUPPORT) |
| finance@talktalk.eumsoft.co.kr | `Finance!2345` | 정산(FINANCE) |

> 운영 배포 시 반드시 비밀번호를 변경하고, `ADMIN_BOOTSTRAP_PASSWORD`는 배포 환경변수로만 주입하세요. 계정 추가는 최고관리자가 `POST /api/v1/admin/accounts`(또는 관리자 웹 계정 화면)로 수행합니다.

---

## 4. 관리자 웹 접속·사용

- 접속: `http://localhost:3000/login` (운영: `https://admin.<도메인>/login`)
- 메뉴: 대시보드 / 신고 접수 / 이의신청 / 회원 관리 / 그룹·지역방 / 게시물 / 포인트 원장 / 결제·환불 / 공지사항 / 문의 응대 / 운영 설정 / 감사로그 / 관리자 계정

**신고 처리 흐름**

1. `신고 접수`에서 신고 선택 → `담당 지정`(본인에게 배정)
2. `증거 확인` — 신고 시점 스냅샷(메시지 본문·사진·게시글 등)만 열람. **개인 대화 전수 검색 기능은 없습니다.**
3. 조치 선택: 경고 / 콘텐츠 숨김 / 7일·30일 이용 제한 / 영구 이용 제한 / 기각 / 제재 해제
4. 처리 결과가 신고자·대상 회원에게 알림으로 통지되고, 신고 상태가 RESOLVED/DISMISSED로 변경
5. 모든 증거 열람·조치는 `감사로그`에 기록(REPORT_EVIDENCE_VIEWED, REPORT_ACTION_*)

**권한 분리**

| 권한 | 가능한 일 |
|---|---|
| SUPERADMIN | 전체, 설정 변경, 관리자 계정 생성 |
| MODERATOR | 신고 처리·회원 제재·게시물/방 숨김·이의신청 |
| SUPPORT | 문의 응대, 공지 작성, 조회 (신고 증거 열람 불가) |
| FINANCE | 결제/환불, 포인트 원장 조정 |

---

## 5. 운영 환경 필수 설정

`NODE_ENV=production`에서는 아래 설정이 없으면 **신규 가입이 중단**되고 관리자 대시보드에 경고가 표시됩니다.

| 변수 | 설명 |
|---|---|
| `IDENTITY_PROVIDER` | 본인확인·성인인증 기관 (예: NICE, KCB) |
| `IDENTITY_PROVIDER_API_KEY` | 기관 API 키 |
| `SMS_API_URL`, `SMS_API_KEY` | 인증번호 문자 발송 대행 |
| `JWT_SECRET` | 32자 이상 임의 문자열 |
| `STORAGE_SECRET` | 미디어 접근 토큰 서명 키 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `IAP_PROVIDER=live` | 인앱결제 검증 모드 |
| `GOOGLE_PLAY_PACKAGE_NAME`, `GOOGLE_PLAY_ACCESS_TOKEN` | Google Play 영수증 검증 |
| `APPLE_SHARED_SECRET` | App Store 영수증 검증 |
| `PUBLIC_BASE_URL`, `CORS_ORIGINS` | API 공개 주소·관리자 도메인 |

**비공개 스토리지**

- 기본: `STORAGE_DRIVER=local` (서 버 디스크, 소유자·참여자만 접근 토큰 발급)
- S3 호환: `STORAGE_DRIVER=s3` + `S3_BUCKET`/`S3_REGION`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` (+ MinIO는 `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE=true`)
- 모든 이미지는 업로드 시 **재인코딩되어 EXIF/GPS가 제거**되고, 채팅 사진은 대화 참여자 외 접근 시 403이 반환됩니다.

---

## 6. Render 배포

`render.yaml`에 API·관리자·Redis·PostgreSQL이 정의되어 있습니다.

1. Render 대시보드 → **New → Blueprint** → 저장소 연결 (`render.yaml` 자동 인식)
2. `talktalk-db` 생성 완료 후 `DATABASE_URL`이 자동 주입됨
3. 아래 값은 `sync: false`이므로 대시보드에서 직접 입력:
   - `IDENTITY_PROVIDER`, `IDENTITY_PROVIDER_API_KEY`
   - `GOOGLE_PLAY_ACCESS_TOKEN`, `APPLE_SHARED_SECRET`
   - `ADMIN_BOOTSTRAP_PASSWORD`
   - `PUBLIC_BASE_URL` = `https://talktalk-api.onrender.com`
   - `CORS_ORIGINS` = `https://talktalk-admin.onrender.com`
   - (관리자) `API_BASE_URL` = `https://talktalk-api.onrender.com`
4. `preDeployCommand`가 `npx prisma migrate deploy`를 자동 실행합니다.
5. 최초 1회 시드 실행(Shell):
   ```bash
   node -e "require('child_process').execSync('npx tsx prisma/seed.ts', {stdio:'inherit'})"
   ```
   또는 Render Job으로 `npx tsx prisma/seed.ts` 1회 실행.
6. 미디어 보존: `talktalk-media` 디스크가 `/var/data`에 마운트되고 `STORAGE_LOCAL_DIR=/var/data/storage`로 설정됩니다.
7. WebSocket: Render Web Service는 WebSocket을 지원합니다. 다중 인스턴스로 확장할 경우 `talktalk-redis`가 `REDIS_URL`로 자동 연결되어 Redis Adapter가 켜집니다.
8. 커스텀 도메인 연결 후 `PUBLIC_BASE_URL`, `CORS_ORIGINS`, 관리자 `API_BASE_URL`을 실제 도메인으로 갱신.

### Docker Compose로 배포(단일 서버)

```bash
docker compose up -d --build
# API: http://<host>:4000, 관리자: http://<host>:3000
```

`api` 컨테이너가 기동 시 `prisma migrate deploy → seed → node dist/main.js`를 순서대로 실행합니다.

---

## 7. Android 서명·AAB

1. 업로드 키 생성:
   ```bash
   keytool -genkeypair -v -keystore talktalk-upload.jks -alias talktalk \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
2. `mobile/android/key.properties` (git 제외):
   ```ini
   storePassword=...
   keyPassword=...
   keyAlias=talktalk
   storeFile=talktalk-upload.jks
   ```
3. 빌드:
   ```bash
   cd mobile
   flutter build appbundle --release --dart-define=API_BASE_URL=https://api.<도메인>
   flutter build apk --debug --dart-define=API_BASE_URL=https://api.<도메인>   # 테스트 APK
   ```
4. Play Console → 앱 만들기(패키지 `co.kr.eumsoft.talktalk`) → 내부 테스트 → AAB 업로드
5. 등록할 인앱 상품 ID: `talktalk_points_1000`, `talktalk_points_3000`, `talktalk_points_5000`, `talktalk_points_10000`, `talktalk_plus_monthly`

CI(`.github/workflows/mobile-build.yml`)에 테스트 APK·AAB·iOS 빌드가 정의되어 있으며, 서명은 아래 시크릿을 사용합니다.

- `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- `DEV_API_BASE_URL`, `PROD_API_BASE_URL`

---

## 8. iOS 서명·배포

1. Apple Developer → Identifier 등록: `co.kr.eumsoft.talktalk`
2. Xcode에서 `mobile/ios/Runner.xcodeproj` 열기 → Runner 타겟 → Signing & Capabilities
   - Team 선택, Bundle Identifier `co.kr.eumsoft.talktalk`
   - Capability: **Push Notifications**, **Background Modes(Remote notifications)**
3. `flutter pub get && cd ios && pod install`
4. 실기기/시뮬레이터 실행:
   ```bash
   flutter run --dart-define=API_BASE_URL=https://api.<도메인>
   ```
5. 배포용 아카이브:
   ```bash
   flutter build ipa --release --export-method app-store --dart-define=API_BASE_URL=https://api.<도메인>
   ```
6. App Store Connect → 앱 생성 → TestFlight 업로드 → 심사 제출

CI의 `ios-archive` 잡은 `IOS_CERT_P12_BASE64`, `IOS_CERT_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64` 시크릿으로 서명합니다.

**Info.plist에 포함된 권한 문구**: 위치(사용 중), 사진 보관함, 카메라, 알림. 위치는 "같은 동네·가까운 지역 이웃 추천" 목적으로만 사용되며 좌표는 타 회원에게 노출되지 않습니다.

---

## 9. 푸시 알림 (FCM / APNs)

서버는 알림 저장 + Socket.IO 실시간 전송 + 알림 본문 마스킹(잠금화면 미리보기 OFF)까지 기본 제공합니다. 실제 푸시 발송은 아래를 추가로 설정하세요.

1. Firebase 프로젝트 생성 → Android 앱(`co.kr.eumsoft.talktalk`) 등록 → `google-services.json`을 `mobile/android/app/`에 배치
2. iOS 앱 등록 → `GoogleService-Info.plist`를 `mobile/ios/Runner/`에 추가, APNs 인증 키 업로드
3. 앱에서 획득한 FCM/APNs 토큰을 `POST /api/v1/me/devices`로 등록
4. 서버: FCM HTTP v1 서비스 계정 키를 환경변수로 주입하고 `NotificationService.push()`에 발송 코드 연결 (현재는 실시간 이벤트·알림 저장까지 구현)

> 잠금화면 미리보기 끄기(`pushPreview=false`)가 기본값이며, 서버가 본문을 "새 메시지가 도착했습니다."로 치환해 저장·전송합니다.

---

## 10. 운영 점검 체크리스트

- [ ] `NODE_ENV=production` + `IDENTITY_PROVIDER` 설정 확인 (미설정 시 가입 차단·대시보드 경고)
- [ ] 관리자 초기 비밀번호 변경, 계정별 권한 분리 확인
- [ ] `JWT_SECRET`, `STORAGE_SECRET` 임의값(32자 이상) 설정
- [ ] DB 백업(일 1회 이상) 및 복구 훈련
- [ ] 미디어 디스크 사용량·S3 수명주기 정책
- [ ] 상단 고정 만료 자동 해제(서버 60초 주기 + 조회 시 필터) 동작 확인
- [ ] 신고 SLA(24시간 내 1차 검토), 이의신청 처리
- [ ] 감사로그 보존 기간(최소 1년 권장) 및 접근 통제
- [ ] 앱 스토어 인앱 상품·영수증 검증 키 갱신

### 장애 대응 요약

| 증상 | 확인 |
|---|---|
| 로그인 불가 | `IDENTITY_PROVIDER`/SMS 설정, `users.status`(SUSPENDED/DELETED), JWT_SECRET 변경 여부 |
| 실시간 메시지 지연 | WebSocket 프록시 설정, `REDIS_URL`(다중 인스턴스), `/health` |
| 사진 403 | 대화 참여 여부, 미디어 토큰 만료(10분), `isPrivate` |
| 포인트 불일치 | `PointTransaction` 원장과 `PointAccount.balance` 대조, 결제 `transactionId` 중복 여부 |
| 가입 차단(503) | 운영 환경 본인확인 설정 누락 — 관리자 `운영 설정` 배너 확인 |

---

## 11. 테스트 실행

```bash
. /workspace/.tools/pg-env.sh && sh /workspace/.tools/pg-start.sh
cd server
npm run build
npm run test:integration    # 검수 기준 ①~⑨, 실제 PostgreSQL + 서버 + Socket.IO 2대
```

- 테스트는 임시 포트(4100)로 서버를 직접 기동하고 종료합니다.
- 결과 상세는 [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md) 참고.

## 12. 브랜드/아이콘 변경

```bash
cd mobile
dart run tool/gen_brand.dart     # brand.json → lib/config/brand.dart
node tool/gen_icons.mjs          # Android mipmap / iOS AppIcon / 관리자 favicon 재생성
```
