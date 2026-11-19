import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../chats/chat_screen.dart';
import '../nearby/report_sheet.dart';

class MarketDetailScreen extends StatefulWidget {
  const MarketDetailScreen({super.key, required this.itemId});
  final String itemId;

  @override
  State<MarketDetailScreen> createState() => _MarketDetailScreenState();
}

class _MarketDetailScreenState extends State<MarketDetailScreen> {
  Map<String, dynamic>? _item;
  bool _loading = true;
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await context.read<AppState>().api.get(
        '/market/items/${widget.itemId}',
      );
      if (mounted)
        setState(() => _item = Map<String, dynamic>.from(res as Map));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _inquiry() async {
    if (_working) return;
    setState(() => _working = true);
    try {
      final roomId = await context.read<AppState>().inquireItem(widget.itemId);
      if (!mounted) return;
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => ChatScreen(roomId: roomId)));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _changeStatus(String status) async {
    try {
      await context.read<AppState>().setMarketStatus(widget.itemId, status);
      await _load();
      if (mounted) showInfo(context, '상태를 변경했어요.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final item = _item;
    final seller = item?['seller'] as Map<String, dynamic>?;
    final isMine = seller?['id'] == state.me?.id;
    return Scaffold(
      appBar: AppBar(
        title: const Text('장터'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'report')
                showReportSheet(
                  context,
                  targetType: 'POST',
                  targetId: widget.itemId,
                );
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'report', child: Text('게시글 신고')),
            ],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : item == null
          ? const EmptyState(icon: Icons.error_outline, title: '게시글을 불러오지 못했어요')
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
              children: [
                if (item['photoUrl'] != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(14),
                    child: Image.network(
                      state.api.absoluteMediaUrl('${item['photoUrl']}'),
                      headers: {'authorization': 'Bearer ${state.token ?? ''}'},
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) =>
                          Container(height: 200, color: Colors.grey.shade100),
                    ),
                  )
                else
                  Container(
                    height: 160,
                    decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: const Icon(Icons.image_outlined, color: Colors.grey),
                  ),
                const SizedBox(height: 14),
                Text(
                  '${item['title']}',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${item['type'] == 'FREE'
                      ? '무료 나눔'
                      : item['type'] == 'BUY'
                      ? '구매 희망'
                      : '판매'} · ${item['regionName'] ?? ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 8),
                Text(
                  item['type'] == 'FREE'
                      ? '무료'
                      : '${(item['price'] as num?)?.toInt().toString() ?? 0}원',
                  style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                    color: Color(Brand.primaryDark),
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  '${item['description'] ?? ''}',
                  style: const TextStyle(fontSize: 14, height: 1.7),
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade200),
                  ),
                  child: Row(
                    children: [
                      UserAvatar(
                        url: seller?['photoUrl'] as String?,
                        nickname: '${seller?['nickname']}',
                        size: 42,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${seller?['nickname'] ?? '판매자'}',
                              style: const TextStyle(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            Text(
                              '${seller?['regionName'] ?? ''}',
                              style: TextStyle(
                                fontSize: 11.5,
                                color: Colors.grey.shade600,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.grey.shade100,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(switch (item['status']) {
                          'RESERVED' => '예약중',
                          'SOLD' => '거래완료',
                          _ => '판매중',
                        }, style: const TextStyle(fontSize: 11)),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  '거래 문의를 보내면 상품명과 사진이 포함된 1:1 대화가 열립니다.',
                  style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
                ),
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: isMine
              ? Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _changeStatus('RESERVED'),
                        child: const Text('예약중'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _changeStatus('SOLD'),
                        child: const Text('거래완료'),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _changeStatus('ON_SALE'),
                        child: const Text('판매중'),
                      ),
                    ),
                  ],
                )
              : FilledButton.icon(
                  onPressed: _working ? null : _inquiry,
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: Text(_working ? '대화 여는 중...' : '거래 문의하기'),
                ),
        ),
      ),
    );
  }
}
