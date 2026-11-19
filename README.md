# 톡톡 Talk Talk — 이음소프트

동네 이웃과 가볍게 인사하고 대화하는 지역 기반 소셜 서비스 **「톡톡 Talk Talk」**의 모노레포입니다.

```
tank-talk/
├── brand.json                 서비스명·색상·지원 연락처 (서버/관리자/앱 공통)
├── server/                    NestJS + Prisma + PostgreSQL + Socket.IO + Redis(선택) + sharp + 비공개 스토리지
│   ├── prisma/                schema.prisma, migrations, seed.ts
│   ├── src/                   API·WebSocket·관리자 API
│   └── test/integration.test.ts  검수 기준 ①~⑨ 통합 테스트
├── admin/                     Next.js(App Router) 관리자 웹
├── mobile/                    Flutter 앱 (Android + iOS 전체 소스)
├── docs/                      설치·운영 문서, 검수 결과 보고서
├── docker-compose.yml         PostgreSQL + Redis + API + 관리자
└── render.yaml                Render 배포 정의
```

## 빠른 시작

```bash
# 1) PostgreSQL 기동 (개발 컨테이너 기준)
. /workspace/.tools/pg-env.sh && sh /workspace/.tools/pg-start.sh
createdb -h 127.0.0.1 -p 55432 tanktalk   # 최초 1회

# 2) 서버
cd server
cp .env.example .env        # DATABASE_URL 등 수정
npm install
npx prisma migrate deploy
npx tsx prisma/seed.ts
npm run build && npm start  # http://localhost:4000/api/v1

# 3) 관리자 웹
cd ../admin
cp .env.example .env.local
npm install && npm run build && npm start   # http://localhost:3000/login

# 4) 검수 기준 ①~⑨ 통합 테스트
cd ../server
npm run test:integration
```

## 문서
- 설치·운영·Render 배포·개발계정·iOS 서명: [docs/INSTALL_AND_OPERATIONS.md](docs/INSTALL_AND_OPERATIONS.md)
- 검수 기준 ①~⑨ 실행 절차와 실제 결과: [docs/VERIFICATION_REPORT.md](docs/VERIFICATION_REPORT.md)

## 운영 원칙
- 만 19세 이상 본인확인 회원만 가입 (운영 환경에서 `IDENTITY_PROVIDER` 미설정 시 가입 중단)
- 좌표·정밀거리는 API 응답에 포함하지 않고 '같은 동네/가까운 지역'만 노출
- 개인 대화 전수 검색 기능은 제공하지 않으며, 신고 증거는 배정된 담당자만 열람(감사로그 기록)
- 가짜 회원을 생성하지 않음 (테스트 계정은 개발 환경에서만 시드)
