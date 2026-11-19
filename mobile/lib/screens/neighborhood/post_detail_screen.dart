import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../core/api_client.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../nearby/report_sheet.dart';

class PostDetailScreen extends StatefulWidget {
  const PostDetailScreen({super.key, required this.postId});
  final String postId;

  @override
  State<PostDetailScreen> createState() => _PostDetailScreenState();
}

class _PostDetailScreenState extends State<PostDetailScreen> {
  Map<String, dynamic>? _post;
  final _comment = TextEditingController();
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await context.read<AppState>().api.get(
        '/board/posts/${widget.postId}',
      );
      if (mounted)
        setState(() => _post = Map<String, dynamic>.from(res as Map));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _promote() async {
    final days = await showModalBottomSheet<int>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                '상단 고정 (1일 300P)',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
              ),
            ),
            for (final option in const [
              (1, '1일 · 300P'),
              (3, '3일 · 900P'),
              (7, '7일 · 2,100P'),
            ])
              ListTile(
                title: Text(option.$2),
                onTap: () => Navigator.pop(context, option.$1),
              ),
          ],
        ),
      ),
    );
    if (days == null) return;
    try {
      final result = await context.read<AppState>().promotePost(
        widget.postId,
        days,
      );
      if (mounted) {
        showInfo(context, '상단 고정이 적용되었습니다. (${result['endsAt']}까지)');
        await _load();
      }
    } on ApiException catch (e) {
      if (mounted) showInfo(context, e.message);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _commentSubmit() async {
    if (_comment.text.trim().isEmpty) return;
    try {
      await context.read<AppState>().api.post(
        '/board/posts/${widget.postId}/comments',
        body: {'body': _comment.text.trim()},
      );
      _comment.clear();
      await _load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final post = _post;
    final author = post?['author'] as Map<String, dynamic>?;
    final comments = (post?['comments'] as List?) ?? const [];
    return Scaffold(
      appBar: AppBar(
        title: const Text('게시글'),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'promote') _promote();
              if (value == 'report')
                showReportSheet(
                  context,
                  targetType: 'POST',
                  targetId: widget.postId,
                );
            },
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'promote', child: Text('상단 고정 (유료)')),
              PopupMenuItem(value: 'report', child: Text('게시글 신고')),
            ],
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : post == null
          ? const EmptyState(icon: Icons.error_outline, title: '게시글을 불러오지 못했어요')
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
              children: [
                if (post['promoted'] == true)
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(Brand.accent).withValues(alpha: 0.35),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      '상단 고정 중',
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                Text(
                  '${post['title']}',
                  style: const TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${author?['nickname'] ?? ''} · ${post['regionName'] ?? ''} · ${post['category']}',
                  style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
                ),
                const SizedBox(height: 14),
                if (post['photoUrl'] != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      state.api.absoluteMediaUrl('${post['photoUrl']}'),
                      headers: {'authorization': 'Bearer ${state.token ?? ''}'},
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                const SizedBox(height: 12),
                Text(
                  '${post['body']}',
                  style: const TextStyle(fontSize: 14.5, height: 1.7),
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: () async {
                        await state.toggleLike(widget.postId);
                        await _load();
                      },
                      icon: Icon(
                        post['liked'] == true
                            ? Icons.favorite
                            : Icons.favorite_border,
                        size: 18,
                        color: post['liked'] == true ? Colors.red : null,
                      ),
                      label: Text('공감 ${post['likeCount']}'),
                    ),
                    const SizedBox(width: 8),
                    OutlinedButton.icon(
                      onPressed: () async {
                        await state.toggleBookmark(widget.postId);
                        await _load();
                      },
                      icon: Icon(
                        post['bookmarked'] == true
                            ? Icons.bookmark
                            : Icons.bookmark_border,
                        size: 18,
                      ),
                      label: const Text('저장'),
                    ),
                  ],
                ),
                const SectionTitle('댓글'),
                if (comments.isEmpty)
                  Text(
                    '첫 댓글을 남겨 보세요.',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: Colors.grey.shade600,
                    ),
                  )
                else
                  ...comments.map((c) {
                    final comment = c as Map<String, dynamic>;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          UserAvatar(
                            url:
                                (comment['author'] as Map?)?['photoUrl']
                                    as String?,
                            nickname:
                                '${(comment['author'] as Map?)?['nickname']}',
                            size: 32,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '${(comment['author'] as Map?)?['nickname']}',
                                  style: const TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  '${comment['body']}',
                                  style: const TextStyle(
                                    fontSize: 13,
                                    height: 1.4,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
              ],
            ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 12, 10),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _comment,
                  decoration: const InputDecoration(
                    hintText: '댓글을 입력하세요',
                    isDense: true,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              IconButton.filled(
                onPressed: _commentSubmit,
                style: IconButton.styleFrom(
                  backgroundColor: const Color(Brand.primary),
                ),
                icon: const Icon(Icons.send, size: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
