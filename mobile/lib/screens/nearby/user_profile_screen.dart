import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../chats/note_compose_sheet.dart';
import 'report_sheet.dart';

class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({super.key, required this.userId, this.fallback});
  final String userId;
  final AppUser? fallback;

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  AppUser? _user;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _user = widget.fallback;
    _load();
  }

  Future<void> _load() async {
    try {
      final user = await context.read<AppState>().userProfile(widget.userId);
      if (mounted) setState(() => _user = user);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _block() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('차단할까요?'),
        content: const Text('차단하면 상대는 나에게 인사·메시지를 보낼 수 없고, 서로 주변 목록에 표시되지 않습니다.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('차단')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await context.read<AppState>().blockUser(widget.userId);
      if (mounted) {
        Navigator.of(context).pop();
        showInfo(context, '차단했어요.');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = _user;
    return Scaffold(
      appBar: AppBar(
        title: const Text('프로필'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'block') _block();
              if (value == 'report') {
                showReportSheet(context, targetType: 'PROFILE', targetId: widget.userId);
              }
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'report', child: Text('신고하기')),
              PopupMenuItem(value: 'block', child: Text('차단하기')),
            ],
          ),
        ],
      ),
      body: _loading && user == null
          ? const Center(child: CircularProgressIndicator())
          : user == null
              ? const EmptyState(icon: Icons.person_off_outlined, title: '프로필을 볼 수 없어요')
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: [
                    Center(child: UserAvatar(url: user.photoUrl, nickname: user.nickname, size: 92)),
                    const SizedBox(height: 12),
                    Center(child: Text(user.nickname, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900))),
                    const SizedBox(height: 6),
                    Center(
                      child: Wrap(
                        spacing: 6,
                        children: [
                          if (user.ageBand != null) Chip(label: Text(user.ageBand!, style: const TextStyle(fontSize: 11))),
                          if (user.gender != null) Chip(label: Text(user.gender == 'FEMALE' ? '여성' : user.gender == 'MALE' ? '남성' : '성별 비공개', style: const TextStyle(fontSize: 11))),
                          if (user.regionName != null) Chip(label: Text(user.regionName!, style: const TextStyle(fontSize: 11))),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Center(child: DistanceChip(label: user.distanceLabel)),
                    if (user.bio != null && user.bio!.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.grey.shade200)),
                        child: Text(user.bio!, style: const TextStyle(height: 1.6)),
                      ),
                    ],
                    if (user.interests.isNotEmpty) ...[
                      const SectionTitle('관심사'),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: user.interests.map((e) => Chip(label: Text('#$e'))).toList(),
                      ),
                    ],
                    const SizedBox(height: 24),
                    FilledButton.icon(
                      onPressed: () => showNoteCompose(context, user),
                      icon: const Icon(Icons.waving_hand),
                      label: const Text('인사 보내기'),
                    ),
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      onPressed: _block,
                      icon: const Icon(Icons.block, size: 18),
                      label: const Text('차단하기'),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      '휴대폰 번호·실명·생년월일은 공개되지 않습니다.\n거리 정보는 \'같은 동네/가까운 지역\'으로만 표시됩니다.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.5),
                    ),
                    const SizedBox(height: 8),
                    Center(
                      child: TextButton(
                        onPressed: () => showReportSheet(context, targetType: 'PROFILE', targetId: widget.userId),
                        child: const Text('이 프로필 신고', style: TextStyle(fontSize: 12, color: Color(Brand.muted))),
                      ),
                    ),
                  ],
                ),
    );
  }
}
