import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../nearby/report_sheet.dart';
import 'chat_screen.dart';

class ChatsScreen extends StatefulWidget {
  const ChatsScreen({super.key});

  @override
  State<ChatsScreen> createState() => _ChatsScreenState();
}

class _ChatsScreenState extends State<ChatsScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final state = context.read<AppState>();
      try {
        await state.loadNotes();
        await state.loadChats();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _accept(NoteRequestItem note) async {
    final state = context.read<AppState>();
    try {
      final roomId = await state.acceptNote(note.id);
      if (!mounted) return;
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => ChatScreen(roomId: roomId)));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _decline(NoteRequestItem note) async {
    try {
      await context.read<AppState>().declineNote(note.id);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final pending = state.receivedNotes
        .where((n) => n.status == 'PENDING')
        .toList();
    final others = state.receivedNotes
        .where((n) => n.status != 'PENDING')
        .toList();
    return Scaffold(
      appBar: AppBar(
        title: const Text('대화'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: const Color(Brand.primaryDark),
          indicatorColor: const Color(Brand.primary),
          tabs: [
            Tab(text: '새 요청 ${pending.isEmpty ? '' : '(${pending.length})'}'),
            Tab(
              text:
                  '대화 ${state.unreadMessageCount > 0 ? '(${state.unreadMessageCount})' : ''}',
            ),
            const Tab(text: '지난 인사'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          RefreshIndicator(
            onRefresh: () async {
              await state.loadNotes();
              await state.loadChats();
            },
            child: pending.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 80),
                      EmptyState(
                        icon: Icons.mark_email_unread_outlined,
                        title: '새로 받은 인사가 없어요',
                        subtitle: '주변 이웃에게 먼저 인사를 건네 보세요.',
                      ),
                    ],
                  )
                : ListView.separated(
                    itemCount: pending.length,
                    separatorBuilder: (_, __) =>
                        Divider(height: 1, color: Colors.grey.shade100),
                    itemBuilder: (context, index) {
                      final note = pending[index];
                      final from = note.from ?? {};
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                UserAvatar(
                                  url: from['photoUrl'] as String?,
                                  nickname: '${from['nickname']}',
                                  size: 44,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        '${from['nickname']}',
                                        style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                      Text(
                                        [
                                          from['ageBand'],
                                          from['regionName'],
                                        ].whereType<String>().join(' · '),
                                        style: TextStyle(
                                          fontSize: 11.5,
                                          color: Colors.grey.shade600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                TextButton(
                                  onPressed: () => showReportSheet(
                                    context,
                                    targetType: 'PROFILE',
                                    targetId: '${from['id']}',
                                  ),
                                  child: const Text(
                                    '신고',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(14),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(14),
                                border: Border.all(color: Colors.grey.shade200),
                              ),
                              child: Text(
                                note.message,
                                style: const TextStyle(height: 1.5),
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: OutlinedButton(
                                    onPressed: () => _decline(note),
                                    child: const Text('거절'),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: FilledButton(
                                    onPressed: () => _accept(note),
                                    child: const Text('수락하고 대화'),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    },
                  ),
          ),
          RefreshIndicator(
            onRefresh: state.loadChats,
            child: state.chats.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 80),
                      EmptyState(
                        icon: Icons.forum_outlined,
                        title: '아직 대화가 없어요',
                        subtitle: '서로 인사를 수락하면 1:1 대화방이 만들어집니다.',
                      ),
                    ],
                  )
                : ListView.separated(
                    itemCount: state.chats.length,
                    separatorBuilder: (_, __) =>
                        Divider(height: 1, color: Colors.grey.shade100),
                    itemBuilder: (context, index) {
                      final chat = state.chats[index];
                      return ListTile(
                        leading: UserAvatar(
                          url: chat.imageUrl,
                          nickname: chat.title,
                          size: 48,
                        ),
                        title: Row(
                          children: [
                            Expanded(
                              child: Text(
                                chat.title,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            if (chat.type != 'DIRECT')
                              Padding(
                                padding: const EdgeInsets.only(left: 6),
                                child: Text(
                                  '${chat.memberCount}명',
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.grey.shade500,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        subtitle: Text(
                          chat.lastMessage == null
                              ? '대화를 시작해 보세요'
                              : chat.lastMessage!.masked
                              ? '차단된 회원의 메시지입니다.'
                              : (chat.lastMessage!.body ??
                                    (chat.lastMessage!.isImage
                                        ? '사진을 보냈습니다.'
                                        : '')),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade600,
                          ),
                        ),
                        trailing: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            if (chat.unreadCount > 0)
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: const Color(Brand.primary),
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: Text(
                                  '${chat.unreadCount}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            const SizedBox(height: 4),
                            if (chat.muted)
                              Icon(
                                Icons.notifications_off_outlined,
                                size: 12,
                                color: Colors.grey.shade400,
                              ),
                          ],
                        ),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => ChatScreen(roomId: chat.id),
                          ),
                        ),
                      );
                    },
                  ),
          ),
          RefreshIndicator(
            onRefresh: state.loadNotes,
            child: others.isEmpty
                ? ListView(
                    children: const [
                      SizedBox(height: 80),
                      EmptyState(icon: Icons.history, title: '지난 인사가 없어요'),
                    ],
                  )
                : ListView.separated(
                    itemCount: others.length,
                    separatorBuilder: (_, __) =>
                        Divider(height: 1, color: Colors.grey.shade100),
                    itemBuilder: (context, index) {
                      final note = others[index];
                      final from = note.from ?? {};
                      final label = switch (note.status) {
                        'ACCEPTED' => '수락함',
                        'DECLINED' => '거절함',
                        'CANCELED' => '취소됨',
                        _ => note.status,
                      };
                      return ListTile(
                        leading: UserAvatar(
                          url: from['photoUrl'] as String?,
                          nickname: '${from['nickname']}',
                          size: 44,
                        ),
                        title: Text('${from['nickname']}'),
                        subtitle: Text(
                          note.message,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
                        ),
                        trailing: Text(
                          label,
                          style: TextStyle(
                            fontSize: 11,
                            color: Colors.grey.shade500,
                          ),
                        ),
                        onTap: note.roomId != null
                            ? () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) =>
                                      ChatScreen(roomId: note.roomId!),
                                ),
                              )
                            : null,
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}
