import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';

class AccountDeleteScreen extends StatefulWidget {
  const AccountDeleteScreen({super.key});

  @override
  State<AccountDeleteScreen> createState() => _AccountDeleteScreenState();
}

class _AccountDeleteScreenState extends State<AccountDeleteScreen> {
  final _reason = TextEditingController();
  final _confirm = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _reason.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_confirm.text.trim() != 'DELETE') {
      showInfo(context, "'DELETE'를 정확히 입력해 주세요.");
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('정말 탈퇴할까요?'),
        content: const Text(
          '프로필·사진·푸시 토큰이 삭제되고 다른 회원의 주변·검색에 노출되지 않습니다. 이 작업은 되돌릴 수 없습니다.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('취소'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('탈퇴'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _loading = true);
    try {
      await context.read<AppState>().deleteAccount(_reason.text.trim());
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('계정 삭제')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            '탈퇴 전 확인해 주세요',
            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
          ),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: const Text(
              '· 프로필 사진과 소개가 삭제됩니다.\n'
              '· 푸시 알림 토큰이 삭제되어 알림이 오지 않습니다.\n'
              '· 다른 회원의 주변·검색 목록에 노출되지 않습니다.\n'
              '· 대화 상대의 대화 기록에는 \'탈퇴한 회원\'으로 표시됩니다.\n'
              '· 포인트와 진행 중인 상단 고정은 소멸됩니다.',
              style: TextStyle(fontSize: 12.5, height: 1.7),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _reason,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: '탈퇴 사유 (선택)',
              alignLabelWithHint: true,
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _confirm,
            decoration: const InputDecoration(labelText: "확인을 위해 'DELETE' 입력"),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _loading ? null : _delete,
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade600),
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('계정 삭제'),
          ),
          const SizedBox(height: 10),
          Text(
            '문의: ${Brand.supportEmail}',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }
}
