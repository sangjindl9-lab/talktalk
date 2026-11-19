import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';

class BlockedScreen extends StatefulWidget {
  const BlockedScreen({super.key});

  @override
  State<BlockedScreen> createState() => _BlockedScreenState();
}

class _BlockedScreenState extends State<BlockedScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await context.read<AppState>().loadBlocked();
      } catch (e) {
        if (mounted) showError(context, e);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: const Text('차단 목록')),
      body: state.blockedUsers.isEmpty
          ? const EmptyState(icon: Icons.block_outlined, title: '차단한 회원이 없어요')
          : ListView.separated(
              itemCount: state.blockedUsers.length,
              separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey.shade100),
              itemBuilder: (context, index) {
                final user = state.blockedUsers[index];
                return ListTile(
                  leading: UserAvatar(url: user['photoUrl'] as String?, nickname: '${user['nickname']}', size: 42),
                  title: Text('${user['nickname']}'),
                  trailing: TextButton(
                    onPressed: () async {
                      try {
                        await state.unblockUser('${user['userId']}');
                        if (mounted) showInfo(context, '차단을 해제했어요.');
                      } catch (e) {
                        if (mounted) showError(context, e);
                      }
                    },
                    child: const Text('차단 해제'),
                  ),
                );
              },
            ),
    );
  }
}
