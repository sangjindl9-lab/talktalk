import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../core/api_client.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'chat_screen.dart';

Future<void> showNoteCompose(BuildContext context, AppUser user) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => NoteComposeSheet(user: user),
  );
}

class NoteComposeSheet extends StatefulWidget {
  const NoteComposeSheet({super.key, required this.user});
  final AppUser user;

  @override
  State<NoteComposeSheet> createState() => _NoteComposeSheetState();
}

class _NoteComposeSheetState extends State<NoteComposeSheet> {
  final _controller = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      showInfo(context, '인사말을 입력해 주세요.');
      return;
    }
    if (text.length > 200) {
      showInfo(context, '첫 인사는 200자까지 보낼 수 있어요.');
      return;
    }
    setState(() => _loading = true);
    final state = context.read<AppState>();
    try {
      await state.sendNote(widget.user.id, text);
      if (mounted) {
        Navigator.of(context).pop();
        showInfo(context, '인사를 보냈어요. 상대가 수락하면 대화가 열립니다.');
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'ALREADY_CHATTING' && e.extra?['roomId'] != null) {
        Navigator.of(context).pop();
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(roomId: '${e.extra!['roomId']}')));
      } else if (e.code == 'MUTUAL_PENDING' && e.extra?['noteId'] != null) {
        final roomId = await state.acceptNote('${e.extra!['noteId']}');
        if (!mounted) return;
        Navigator.of(context).pop();
        Navigator.of(context).push(MaterialPageRoute(builder: (_) => ChatScreen(roomId: roomId)));
        showInfo(context, '상대의 인사를 수락하고 대화를 열었어요.');
      } else {
        showError(context, e);
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                UserAvatar(url: widget.user.photoUrl, nickname: widget.user.nickname, size: 44),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${widget.user.nickname}님에게 인사', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      Text(
                        [widget.user.distanceLabel, widget.user.regionName].whereType<String>().join(' · '),
                        style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _controller,
              maxLength: 200,
              maxLines: 3,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: '예: 안녕하세요! 같은 동네라 반가워요. 주말에 산책 같이 하실래요?',
                alignLabelWithHint: true,
              ),
            ),
            Row(
              children: [
                Icon(Icons.lock_outline, size: 14, color: Colors.grey.shade500),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '수락 전에는 사진·외부 링크·연락처를 보낼 수 없어요.',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: _loading ? null : _send,
              child: _loading
                  ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('인사 보내기'),
            ),
          ],
        ),
      ),
    );
  }
}

/// 다중 인사: 발송 전 예상 비용·실제 발송 인원을 보여주고, 실제 발송분만 차감한다.
class MultiNoteScreen extends StatefulWidget {
  const MultiNoteScreen({super.key, required this.recipientIds});
  final List<String> recipientIds;

  @override
  State<MultiNoteScreen> createState() => _MultiNoteScreenState();
}

class _MultiNoteScreenState extends State<MultiNoteScreen> {
  final _controller = TextEditingController();
  Map<String, dynamic>? _preview;
  bool _loading = false;
  int? _sentCount;

  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _loadPreview() async {
    try {
      final preview = await context.read<AppState>().multiNotePreview(widget.recipientIds);
      if (mounted) setState(() => _preview = preview);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) {
      showInfo(context, '인사말을 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      final result = await context.read<AppState>().sendMultiNote(widget.recipientIds, text);
      if (mounted) {
        setState(() => _sentCount = (result['sentCount'] as num?)?.toInt() ?? 0);
        showInfo(context, '${result['sentCount']}명에게 인사를 보냈어요. ${result['charged']}P가 차감되었습니다.');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final eligible = (_preview?['eligibleCount'] as num?)?.toInt() ?? 0;
    final cost = (_preview?['totalCost'] as num?)?.toInt() ?? 0;
    final balance = (_preview?['balance'] as num?)?.toInt() ?? 0;
    return Scaffold(
      appBar: AppBar(title: Text('여러 명에게 인사 (${widget.recipientIds.length}명 선택)')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('실제 발송 가능 $eligible명', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 4),
                Text(
                  '수신 거부·차단·이미 인사/대화 중인 회원은 제외됩니다.\n예상 차감 ${cost}P · 보유 ${balance}P',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700, height: 1.5),
                ),
                if ((_preview?['skipped'] as List?)?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  Text(
                    '제외: ${(_preview!['skipped'] as List).map((e) => '${e['reason']}').join(', ')}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _controller,
            maxLength: 200,
            maxLines: 3,
            decoration: const InputDecoration(hintText: '같은 관심사를 가진 이웃에게 보낼 인사말을 입력하세요.', alignLabelWithHint: true),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: _loading || eligible == 0 || cost > balance ? null : _send,
            child: _loading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : Text(cost > balance ? '포인트가 부족합니다 (${cost}P 필요)' : '$eligible명에게 인사하고 ${cost}P 사용'),
          ),
          if (_sentCount != null) ...[
            const SizedBox(height: 14),
            OutlinedButton(
              onPressed: () => Navigator.of(context).pop(_sentCount),
              child: const Text('완료'),
            ),
          ],
          const SizedBox(height: 12),
          TextButton(
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const _PointsHint())),
            child: const Text('포인트 충전 안내'),
          ),
        ],
      ),
    );
  }
}

class _PointsHint extends StatelessWidget {
  const _PointsHint();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('포인트 안내')),
      body: const Padding(
        padding: EdgeInsets.all(20),
        child: Text(
          '기본 1:1 인사·신고·차단은 무료입니다.\n'
          '유료 기능: 다중 인사, 게시글 상단 고정, 그룹방 정원 확장, 다른 지역 둘러보기.\n\n'
          '충전은 내정보 > 포인트에서 Google Play / App Store 인앱결제로 진행할 수 있습니다.',
          style: TextStyle(height: 1.7, color: Color(Brand.muted)),
        ),
      ),
    );
  }
}
