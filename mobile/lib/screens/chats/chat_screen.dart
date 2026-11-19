import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../nearby/report_sheet.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key, required this.roomId});
  final String roomId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  Map<String, dynamic>? _room;
  bool _sending = false;
  bool _muted = false;
  AppState? _state;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _state = context.read<AppState>();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _open());
  }

  Future<void> _open() async {
    final state = context.read<AppState>();
    try {
      await state.openRoom(widget.roomId);
      final info = await state.roomInfo(widget.roomId);
      if (mounted) {
        setState(() {
          _room = info;
          _muted = info['muted'] == true;
        });
      }
      _jumpToBottom();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  void dispose() {
    _state?.closeRoom();
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _jumpToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    _controller.clear();
    try {
      await context.read<AppState>().sendText(widget.roomId, text);
      _jumpToBottom();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _attachImage() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (file == null) return;
    setState(() => _sending = true);
    try {
      await context.read<AppState>().sendImage(widget.roomId, File(file.path));
      _jumpToBottom();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _export() async {
    try {
      final text = await context.read<AppState>().exportRoom(widget.roomId);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('대화 내보내기 (TXT)'),
          content: SizedBox(
            width: double.maxFinite,
            height: 320,
            child: SingleChildScrollView(
              child: SelectableText(
                text,
                style: const TextStyle(fontSize: 12, height: 1.5),
              ),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () {
                Clipboard.setData(ClipboardData(text: text));
                Navigator.pop(context);
                showInfo(context, '대화 내용을 클립보드에 복사했어요.');
              },
              child: const Text('복사'),
            ),
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _search() async {
    final controller = TextEditingController();
    final results = await showModalBottomSheet<List<ChatMessage>>(
      context: context,
      isScrollControlled: true,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: controller,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: '대화 내용 검색 (2자 이상)',
                  suffixIcon: IconButton(
                    icon: const Icon(Icons.search),
                    onPressed: () async {
                      try {
                        final found = await context.read<AppState>().searchRoom(
                          widget.roomId,
                          controller.text.trim(),
                        );
                        if (context.mounted) Navigator.pop(context, found);
                      } catch (e) {
                        if (context.mounted) showError(context, e);
                      }
                    },
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
    if (results != null && mounted) {
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('검색 결과 ${results.length}건'),
          content: SizedBox(
            width: double.maxFinite,
            height: 300,
            child: ListView(
              children: results
                  .map(
                    (m) => ListTile(
                      dense: true,
                      title: Text(
                        m.senderNickname,
                        style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      subtitle: Text(
                        m.masked ? '차단된 회원의 메시지입니다.' : (m.body ?? ''),
                      ),
                    ),
                  )
                  .toList(),
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('닫기'),
            ),
          ],
        ),
      );
    }
  }

  Future<void> _toggleMute() async {
    try {
      await context.read<AppState>().setMuted(widget.roomId, !_muted);
      setState(() => _muted = !_muted);
      if (mounted)
        showInfo(context, _muted ? '이 대화의 알림을 껐어요.' : '이 대화의 알림을 켰어요.');
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _leave() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('대화방을 나갈까요?'),
        content: const Text('나가면 이 대화 목록에서 사라집니다.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('나가기'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await context.read<AppState>().leaveRoom(widget.roomId);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final messages =
        state.messagesByRoom[widget.roomId] ?? const <ChatMessage>[];
    final myId = state.me?.id;
    final title = '${_room?['title'] ?? '대화'}';
    final members = _room?['members'] as List?;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
            ),
            if (members != null && members.length > 2)
              Text(
                '${members.length}명 참여',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
              ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            onSelected: (value) {
              switch (value) {
                case 'search':
                  _search();
                  break;
                case 'export':
                  _export();
                  break;
                case 'mute':
                  _toggleMute();
                  break;
                case 'leave':
                  _leave();
                  break;
                case 'report':
                  showReportSheet(
                    context,
                    targetType: 'ROOM',
                    targetId: widget.roomId,
                  );
                  break;
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'search', child: Text('대화 검색')),
              const PopupMenuItem(value: 'export', child: Text('TXT로 내보내기')),
              PopupMenuItem(
                value: 'mute',
                child: Text(_muted ? '알림 켜기' : '알림 끄기'),
              ),
              const PopupMenuItem(value: 'report', child: Text('방 신고')),
              const PopupMenuItem(value: 'leave', child: Text('방 나가기')),
            ],
          ),
        ],
      ),
      body: Column(
        children: [
          if (!state.ws.connected)
            Container(
              width: double.infinity,
              color: const Color(0xFFFFF3E0),
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
              child: const Text(
                '오프라인 상태예요. 보낸 메시지는 연결되면 자동으로 전송됩니다.',
                style: TextStyle(fontSize: 11.5, color: Color(0xFF8A5A10)),
              ),
            ),
          Expanded(
            child: messages.isEmpty
                ? const EmptyState(
                    icon: Icons.chat_outlined,
                    title: '첫 메시지를 보내 보세요',
                    subtitle: '서로 수락한 대화입니다. 예의를 지켜 대화해 주세요.',
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final message = messages[index];
                      final mine = message.senderId == myId;
                      return _MessageBubble(
                        message: message,
                        mine: mine,
                        showSender:
                            !mine && members != null && members.length > 2,
                        onLongPress: () {
                          showModalBottomSheet<void>(
                            context: context,
                            builder: (context) => SafeArea(
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  ListTile(
                                    leading: const Icon(Icons.copy),
                                    title: const Text('메시지 복사'),
                                    onTap: () {
                                      Clipboard.setData(
                                        ClipboardData(text: message.body ?? ''),
                                      );
                                      Navigator.pop(context);
                                      showInfo(context, '복사했어요.');
                                    },
                                  ),
                                  if (!mine)
                                    ListTile(
                                      leading: const Icon(
                                        Icons.report_outlined,
                                      ),
                                      title: const Text('메시지 신고'),
                                      onTap: () {
                                        Navigator.pop(context);
                                        showReportSheet(
                                          context,
                                          targetType: 'MESSAGE',
                                          targetId: message.id,
                                        );
                                      },
                                    ),
                                ],
                              ),
                            ),
                          );
                        },
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              decoration: BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: Colors.grey.shade200)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton(
                    onPressed: _sending ? null : _attachImage,
                    icon: const Icon(Icons.add_photo_alternate_outlined),
                    color: const Color(Brand.muted),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _controller,
                      minLines: 1,
                      maxLines: 4,
                      textInputAction: TextInputAction.newline,
                      decoration: const InputDecoration(
                        hintText: '메시지를 입력하세요',
                        isDense: true,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    onPressed: _sending ? null : _send,
                    style: IconButton.styleFrom(
                      backgroundColor: const Color(Brand.primary),
                    ),
                    icon: _sending
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.send, size: 20),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.mine,
    required this.showSender,
    required this.onLongPress,
  });
  final ChatMessage message;
  final bool mine;
  final bool showSender;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final body = message.masked
        ? '차단된 회원의 메시지입니다.'
        : message.isImage && message.mediaId != null
        ? null
        : (message.body ?? '');
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine)
            Padding(
              padding: const EdgeInsets.only(right: 6),
              child: UserAvatar(
                url: null,
                nickname: message.senderNickname,
                size: 28,
              ),
            ),
          Flexible(
            child: Column(
              crossAxisAlignment: mine
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,
              children: [
                if (showSender)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 2, left: 4),
                    child: Text(
                      message.senderNickname,
                      style: TextStyle(
                        fontSize: 10.5,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ),
                GestureDetector(
                  onLongPress: onLongPress,
                  child: Container(
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.of(context).size.width * 0.72,
                    ),
                    padding: message.isImage && !message.masked
                        ? EdgeInsets.zero
                        : const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 10,
                          ),
                    decoration: BoxDecoration(
                      color: mine ? const Color(Brand.primary) : Colors.white,
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(16),
                        topRight: const Radius.circular(16),
                        bottomLeft: Radius.circular(mine ? 16 : 4),
                        bottomRight: Radius.circular(mine ? 4 : 16),
                      ),
                      border: mine
                          ? null
                          : Border.all(color: Colors.grey.shade200),
                    ),
                    child:
                        message.isImage &&
                            message.mediaId != null &&
                            !message.masked
                        ? ClipRRect(
                            borderRadius: BorderRadius.circular(14),
                            child: Image.network(
                              state.api.absoluteMediaUrl(
                                '/api/v1/media/${message.mediaId}',
                              ),
                              headers: {
                                'authorization': 'Bearer ${state.token ?? ''}',
                              },
                              width: 200,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => const Padding(
                                padding: EdgeInsets.all(12),
                                child: Text('사진을 불러올 수 없어요'),
                              ),
                            ),
                          )
                        : Text(
                            body,
                            style: TextStyle(
                              fontSize: 14,
                              height: 1.45,
                              color: mine
                                  ? Colors.white
                                  : const Color(Brand.text),
                              fontStyle: message.masked
                                  ? FontStyle.italic
                                  : null,
                            ),
                          ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        '${message.createdAt.hour.toString().padLeft(2, '0')}:${message.createdAt.minute.toString().padLeft(2, '0')}',
                        style: TextStyle(
                          fontSize: 10,
                          color: Colors.grey.shade500,
                        ),
                      ),
                      if (mine) ...[
                        const SizedBox(width: 4),
                        Icon(
                          message.state == 'pending'
                              ? Icons.access_time
                              : message.state == 'failed'
                              ? Icons.error_outline
                              : Icons.done_all,
                          size: 12,
                          color: message.state == 'failed'
                              ? Colors.red.shade400
                              : Colors.grey.shade400,
                        ),
                      ],
                    ],
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
