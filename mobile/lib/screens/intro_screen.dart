import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/brand.dart';
import '../state/app_state.dart';
import 'auth/phone_auth_screen.dart';

class IntroScreen extends StatelessWidget {
  const IntroScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Spacer(),
              Center(
                child: Container(
                  width: 84,
                  height: 84,
                  decoration: BoxDecoration(
                    color: const Color(Brand.primary),
                    borderRadius: BorderRadius.circular(26),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(Brand.primary)
                            .withValues(alpha: 0.3),
                        blurRadius: 24,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    '톡',
                    style: TextStyle(
                      fontSize: 40,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              Center(
                child: Text(
                  Brand.nameKo,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    letterSpacing: -0.8,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  Brand.tagline,
                  style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
                ),
              ),
              const SizedBox(height: 36),
              const _Feature(
                icon: Icons.waving_hand_outlined,
                title: '가볍게 인사',
                body: '동네 이웃에게 짧은 인사 한 줄을 보내 보세요.',
              ),
              const _Feature(
                icon: Icons.place_outlined,
                title: '가까운 이웃',
                body: '같은 동네·가까운 지역 이웃만 만나요. 정확한 위치는 보여주지 않아요.',
              ),
              const _Feature(
                icon: Icons.forum_outlined,
                title: '안전한 대화',
                body: '서로 수락하면 1:1 대화가 열려요. 신고·차단은 언제든 가능합니다.',
              ),
              const Spacer(),
              FilledButton(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const PhoneAuthScreen()),
                  );
                },
                child: const Text('시작하기'),
              ),
              const SizedBox(height: 10),
              Center(
                child: TextButton(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const PhoneAuthScreen(isLogin: true),
                      ),
                    );
                  },
                  child: const Text('이미 계정이 있어요'),
                ),
              ),
              const SizedBox(height: 8),
              Center(
                child: Text(
                  '만 ${Brand.minimumAge}세 이상 본인확인 회원만 이용할 수 있어요.\n가입 시 약관 및 개인정보 처리방침에 동의하게 됩니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 11,
                    color: Colors.grey.shade600,
                    height: 1.5,
                  ),
                ),
              ),
              if (state.lastError != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    state.lastError!,
                    style: const TextStyle(color: Colors.red, fontSize: 12),
                  ),
                ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }
}

class _Feature extends StatelessWidget {
  const _Feature({required this.icon, required this.title, required this.body});
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Icon(icon, size: 20, color: const Color(Brand.primaryDark)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 12.5,
                    color: Colors.grey.shade700,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
