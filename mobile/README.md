# 톡톡 Talk Talk 모바일 앱 (Flutter)

Android + iOS 전체 소스입니다. 서버 API(`server/`)와 Socket.IO(`/ws`)에 연결합니다.

```bash
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:4000   # Android 에뮬레이터
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:4000  # iOS 시뮬레이터
flutter test
flutter build appbundle --release --dart-define=API_BASE_URL=https://api.<도메인>
flutter build ios --release --no-codesign
```

## 구조
```
lib/
├── main.dart / app.dart          앱 진입점, 테마(brand.json 색상)
├── config/                       brand.dart(생성), env.dart(API 주소)
├── core/                         api_client, ws_client(Socket.IO), offline_queue, auth_store, notifications
├── models/                       사용자·대화·쪽지·방·게시글·장터·상품
├── state/app_state.dart          인증·주변·쪽지·대화·커뮤니티·포인트 전역 상태
└── screens/
    ├── intro_screen.dart         첫 소개 화면
    ├── auth/                     휴대폰 인증, 프로필 가입, 지역 선택
    ├── home_shell.dart           하단 5탭(주변·모임·동네·대화·내정보)
    ├── nearby/                   주변 이웃, 프로필, 신고
    ├── groups/                   지역방·그룹방 목록/상세/개설
    ├── neighborhood/             게시판·장터 목록/상세/작성
    ├── chats/                    새 요청·대화·지난 인사, 채팅방(사진·검색·내보내기)
    └── my/                       프로필 수정, 알림 설정, 포인트/스토어, 차단, 공지, 문의, 계정 삭제
```

## 주요 동작
- 첫 실행 시 위치 권한 요청 → 거절하면 시군구 직접 선택
- 인사는 수락 전 사진·링크·연락처 차단, 서로 수락 시 1개의 대화방
- 메시지는 `clientMessageId`로 전송하며 오프라인 시 큐에 보관 후 재연결 시 자동 전송·동기화
- 거리 정보는 '같은 동네/가까운 지역/조금 먼 지역'으로만 표시(좌표 미노출)
- 스토어 인앱결제 영수증은 서버에서 검증하며 중복 지급되지 않음
- 계정 삭제 시 프로필·사진·푸시 토큰 제거, 주변·검색 미노출

## 브랜드 변경
```bash
dart run tool/gen_brand.dart   # ../brand.json → lib/config/brand.dart
node tool/gen_icons.mjs        # 아이콘 재생성
```
