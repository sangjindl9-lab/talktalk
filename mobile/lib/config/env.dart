/// 서버 주소 설정. `--dart-define=API_BASE_URL=...`로 덮어쓸 수 있다.
class Env {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:4000',
  );

  static const String wsNamespace = '/ws';

  static String get wsUrl => '$apiBaseUrl$wsNamespace';
  static String get apiV1 => '$apiBaseUrl/api/v1';
}
