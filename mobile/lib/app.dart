import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/brand.dart';
import 'screens/home_shell.dart';
import 'screens/intro_screen.dart';
import 'state/app_state.dart';

class TalkTalkApp extends StatelessWidget {
  const TalkTalkApp({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return MaterialApp(
      title: Brand.nameKo,
      debugShowCheckedModeBanner: false,
      theme: _theme(),
      home: !state.initialized
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : state.me == null
          ? const IntroScreen()
          : const HomeShell(),
    );
  }

  ThemeData _theme() {
    final scheme = ColorScheme.fromSeed(
      seedColor: const Color(Brand.primary),
      primary: const Color(Brand.primary),
      secondary: const Color(Brand.secondary),
      surface: const Color(Brand.surface),
      brightness: Brightness.light,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: const Color(Brand.background),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(Brand.surface),
        foregroundColor: Color(Brand.text),
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w800,
          color: Color(Brand.text),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: const Color(Brand.primary),
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(50),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(Brand.primary), width: 1.6),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: Colors.white,
        selectedColor: const Color(Brand.primary).withValues(alpha: 0.15),
        side: BorderSide(color: Colors.grey.shade300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
      ),
    );
  }
}
