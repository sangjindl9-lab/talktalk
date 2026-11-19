import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../chats/chat_screen.dart';
import '../nearby/report_sheet.dart';

class GroupDetailScreen extends StatefulWidget {
  const GroupDetailScreen({super.key, required this.roomId});
  final String roomId;

  @override
  State<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends State<GroupDetailScreen> {
  Map<String, dynamic>? _room;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final room = await context.read<AppState>().roomDetail(widget.roomId);
      if (mounted) setState(() => _room = room);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _join() async {
    try {
      final result = await context.read<AppState>().joinCommunityRoom(widget.roomId);
      if (!mounted) return;
      if (result['pending'] == true) {
        showInfo(context, '가입 승인 요청을 보냈습니다.');
      } else {
        await _load();
        showInfo(context, '방에 참여했어요.');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _openChat() async {
    try {
      await context.read<AppState>().joinCommunityRoom(widget.roomId);
    } catch (_) {}
    if (!mounted) return;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(roomId: widget.roomId)));
  }

  Future<void> _kick(String userId, String nickname) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('$nickname님을 내보낼까요?'),
        content: const Text('내보낸 회원은 이 방에 다시 들어올 수 없습니다.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('내보내기')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await context.read<AppState>().kickMember(widget.roomId, userId, restrictRejoin: true);
      await _load();
      if (mounted) showInfo(context, '내보냈어요.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final room = _room;
    final members = (room?['members'] as List?) ?? const [];
    final myRole = room?['myRole'];
    final canManage = myRole == 'OWNER' || myRole == 'MANAGER';
    return Scaffold(
      appBar: AppBar(
        title: Text('${room?['title'] ?? '방 정보'}'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'report') showReportSheet(context, targetType: 'ROOM', targetId: widget.roomId);
            },
            itemBuilder: (_) => const [PopupMenuItem(value: 'report', child: Text('방 신고'))],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : room == null
              ? const EmptyState(icon: Icons.error_outline, title: '방 정보를 불러오지 못했어요')
              : ListView(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
                  children: [
                    Center(child: UserAvatar(url: room['imageUrl'] as String?, nickname: '${room['title']}', size: 88)),
                    const SizedBox(height: 12),
                    Center(child: Text('${room['title']}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900))),
                    Center(
                      child: Text(
                        [room['regionName'], '${room['memberCount']}명', room['visibility'] == 'PRIVATE' ? '비밀방' : '공개방']
                            .whereType<String>()
                            .join(' · '),
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ),
                    if (room['hashtags'] != null && (room['hashtags'] as List).isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        alignment: WrapAlignment.center,
                        spacing: 6,
                        children: (room['hashtags'] as List).map((tag) => Chip(label: Text('#$tag', style: const TextStyle(fontSize: 11)))).toList(),
                      ),
                    ],
                    if (room['description'] != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(14), border: Border.all(color: Colors.grey.shade200)),
                        child: Text('${room['description']}', style: const TextStyle(height: 1.6)),
                      ),
                    ],
                    const SectionTitle('참여자'),
                    ...members.map((m) {
                      final map = m as Map<String, dynamic>;
                      return ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: UserAvatar(url: map['photoUrl'] as String?, nickname: '${map['nickname']}', size: 40),
                        title: Text('${map['nickname']}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                        subtitle: Text(
                          '${map['role'] == 'OWNER' ? '방장' : map['role'] == 'MANAGER' ? '운영진' : '멤버'}'
                          '${map['ageBand'] == null ? '' : ' · ${map['ageBand']}'}',
                          style: const TextStyle(fontSize: 11),
                        ),
                        trailing: canManage && map['id'] != room['ownerId']
                            ? IconButton(
                                icon: const Icon(Icons.person_remove_outlined, size: 20),
                                onPressed: () => _kick('${map['id']}', '${map['nickname']}'),
                              )
                            : null,
                      );
                    }),
                  ],
                ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: room == null
              ? const SizedBox.shrink()
              : room['joined'] == true
                  ? FilledButton.icon(
                      onPressed: _openChat,
                      icon: const Icon(Icons.chat_bubble_outline),
                      label: const Text('대화 참여하기'),
                    )
                  : room['banned'] == true
                      ? const Text('재입장이 제한된 방입니다.', textAlign: TextAlign.center, style: TextStyle(color: Brand.muted))
                      : FilledButton(
                          onPressed: _join,
                          child: Text(room['joinApproval'] == true ? '가입 승인 요청' : '방 참여하기'),
                        ),
        ),
      ),
    );
  }
}
