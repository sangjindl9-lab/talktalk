// brand.json(루트)을 읽어 lib/config/brand.dart를 생성한다.
// 실행: dart run tool/gen_brand.dart
import 'dart:convert';
import 'dart:io';

String colorToDart(String hex) {
  final value = hex.replaceAll('#', '');
  return '0xFF${value.toUpperCase()}';
}

void main() {
  final file = File('../brand.json');
  if (!file.existsSync()) {
    stderr.writeln('brand.json 을 찾을 수 없습니다: ${file.absolute.path}');
    exit(1);
  }
  final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
  final service = json['service'] as Map<String, dynamic>;
  final theme = json['theme'] as Map<String, dynamic>;
  final legal = json['legal'] as Map<String, dynamic>;

  final buffer = StringBuffer()
    ..writeln('/// brand.json(루트)에서 생성되는 브랜드 설정.')
    ..writeln('/// 실행: `dart run tool/gen_brand.dart` (brand.json 변경 시)')
    ..writeln('class Brand {')
    ..writeln("  static const String nameKo = '${service['nameKo']}';")
    ..writeln("  static const String nameEn = '${service['nameEn']}';")
    ..writeln("  static const String slug = '${service['slug']}';")
    ..writeln("  static const String tagline = '${service['tagline']}';")
    ..writeln("  static const String operator = '${service['operator']}';")
    ..writeln("  static const String supportEmail = '${service['supportEmail']}';")
    ..writeln("  static const String supportPhone = '${service['supportPhone']}';")
    ..writeln("  static const String website = '${service['website']}';")
    ..writeln("  static const String termsUrl = '${legal['termsUrl']}';")
    ..writeln("  static const String privacyUrl = '${legal['privacyUrl']}';")
    ..writeln('  static const int minimumAge = ${legal['minimumAge']};')
    ..writeln("  static const String termsVersion = '${legal['termsVersion']}';")
    ..writeln("  static const String privacyVersion = '${legal['privacyVersion']}';")
    ..writeln()
    ..writeln('  static const int primary = ${colorToDart('${theme['primary']}')};')
    ..writeln('  static const int primaryDark = ${colorToDart('${theme['primaryDark']}')};')
    ..writeln('  static const int secondary = ${colorToDart('${theme['secondary']}')};')
    ..writeln('  static const int accent = ${colorToDart('${theme['accent']}')};')
    ..writeln('  static const int background = ${colorToDart('${theme['background']}')};')
    ..writeln('  static const int surface = ${colorToDart('${theme['surface']}')};')
    ..writeln('  static const int text = ${colorToDart('${theme['text']}')};')
    ..writeln('  static const int muted = ${colorToDart('${theme['muted']}')};')
    ..writeln('}');

  File('lib/config/brand.dart').writeAsStringSync(buffer.toString());
  stdout.writeln('lib/config/brand.dart 생성 완료 (${service['nameKo']})');
}
