import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';

class NoticesScreen extends StatefulWidget {
  const NoticesScreen({super.key});

  @override
  State<NoticesScreen> createState() => _NoticesScreenState();
}

class _NoticesScreenState extends State<NoticesScreen> {
  List<dynamic> _notices = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final notices = await context.read<AppState>().loadNotices();
      if (mounted) setState(() => _notices = notices);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('공지사항')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _notices.isEmpty
              ? const EmptyState(icon: Icons.campaign_outlined, title: '등록된 공지가 없어요')
              : ListView.separated(
                  itemCount: _notices.length,
                  separatorBuilder: (_, __) => Divider(height: 1, color: Colors.grey.shade100),
                  itemBuilder: (context, index) {
                    final notice = _notices[index] as Map<String, dynamic>;
                    return ListTile(
                      title: Row(
                        children: [
                          if (notice['pinned'] == true)
                            Container(
                              margin: const EdgeInsets.only(right: 6),
                              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                              decoration: BoxDecoration(color: Colors.orange.shade100, borderRadius: BorderRadius.circular(4)),
                              child: const Text('공지', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700)),
                            ),
                          Expanded(child: Text('${notice['title']}', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
                        ],
                      ),
                      subtitle: Text('${notice['body']}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 12)),
                      onTap: () => showDialog<void>(
                        context: context,
                        builder: (context) => AlertDialog(
                          title: Text('${notice['title']}'),
                          content: SingleChildScrollView(child: Text('${notice['body']}', style: const TextStyle(height: 1.6))),
                          actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('닫기'))],
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
