import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'account_delete_screen.dart';
import 'blocked_screen.dart';
import 'inquiry_screen.dart';
import 'notices_screen.dart';
import 'points_screen.dart';
import 'profile_edit_screen.dart';
import 'settings_screen.dart';

class MyScreen extends StatelessWidget {
  const MyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.me;
    if (me == null) return const SizedBox.shrink();
    return Scaffold(
      appBar: AppBar(title: const Text('내정보')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 30),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    UserAvatar(url: me.photoUrl, nickname: me.nickname, size: 62),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(me.nickname, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
                          const SizedBox(height: 2),
                          Text(
                            [me.ageBand, me.regionName].whereType<String>().join(' · '),
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                          ),
                          if (me.bio != null && me.bio!.isNotEmpty)
                            Text(me.bio!, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                        ],
                      ),
                    ),
                    OutlinedButton(
                      onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ProfileEditScreen())),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 12)),
                      child: const Text('수정', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                InkWell(
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PointsScreen())),
                  child: Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: const Color(Brand.primary).withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.savings_outlined, color: Color(Brand.primaryDark)),
                        const SizedBox(width: 8),
                        const Text('보유 포인트', style: TextStyle(fontWeight: FontWeight.w700)),
                        const Spacer(),
                        Text('${state.points}P', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 17, color: Color(Brand.primaryDark))),
                        const Icon(Icons.chevron_right, size: 18),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SectionTitle('대화·활동'),
          _MenuTile(icon: Icons.notifications_outlined, title: '알림 설정', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()))),
          _MenuTile(icon: Icons.block_outlined, title: '차단 목록', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BlockedScreen()))),
          _MenuTile(icon: Icons.savings_outlined, title: '포인트 · 상단고정 내역', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const PointsScreen()))),
          const SectionTitle('안내'),
          _MenuTile(icon: Icons.campaign_outlined, title: '공지사항', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const NoticesScreen()))),
          _MenuTile(icon: Icons.help_outline, title: '운영자 문의', onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const InquiryScreen()))),
          _MenuTile(
            icon: Icons.description_outlined,
            title: '이용약관 · 개인정보 처리방침',
            onTap: () => showAboutDialog(
              context: context,
              applicationName: Brand.nameKo,
              applicationVersion: '1.0.0',
              children: const [
                Text('이용약관: talktalk.eumsoft.co.kr/legal/terms'),
                Text('개인정보 처리방침: talktalk.eumsoft.co.kr/legal/privacy'),
                Text('위치기반서비스 이용약관이 함께 적용됩니다.'),
                Text('만 19세 이상 본인확인 회원만 이용할 수 있습니다.'),
              ],
            ),
          ),
          _MenuTile(icon: Icons.mail_outline, title: '운영자 연락처', onTap: () => showDialog<void>(
                context: context,
                builder: (context) => AlertDialog(
                  title: const Text('운영자 연락처'),
                  content: const Text('이음소프트\n이메일: support@talktalk.eumsoft.co.kr\n전화: 033-742-0000\n평일 10:00~18:00'),
                  actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('닫기'))],
                ),
              )),
          const SectionTitle('계정'),
          _MenuTile(icon: Icons.logout, title: '로그아웃', onTap: () => state.logout()),
          _MenuTile(
            icon: Icons.delete_forever_outlined,
            title: '계정 삭제',
            color: Colors.red,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AccountDeleteScreen())),
          ),
          const SizedBox(height: 20),
          Center(
            child: Text(
              '${Brand.nameKo} v1.0.0 · ${Brand.operator}',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuTile extends StatelessWidget {
  const _MenuTile({required this.icon, required this.title, required this.onTap, this.color});
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: ListTile(
        leading: Icon(icon, size: 20, color: color ?? const Color(Brand.muted)),
        title: Text(title, style: TextStyle(fontSize: 14, color: color)),
        trailing: const Icon(Icons.chevron_right, size: 18),
        onTap: onTap,
      ),
    );
  }
}
