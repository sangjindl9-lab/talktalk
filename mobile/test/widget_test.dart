import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:talk_talk/screens/intro_screen.dart';
import 'package:talk_talk/state/app_state.dart';

void main() {
  testWidgets('소개 화면에 서비스명과 시작 버튼이 표시된다', (tester) async {
    await tester.pumpWidget(
      ChangeNotifierProvider<AppState>.value(
        value: AppState(),
        child: const MaterialApp(home: IntroScreen()),
      ),
    );

    expect(find.text('톡톡 Talk Talk'), findsOneWidget);
    expect(find.text('시작하기'), findsOneWidget);
    expect(find.text('이미 계정이 있어요'), findsOneWidget);
  });
}
