import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';

class InquiryScreen extends StatefulWidget {
  const InquiryScreen({super.key});

  @override
  State<InquiryScreen> createState() => _InquiryScreenState();
}

class _InquiryScreenState extends State<InquiryScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty || _body.text.trim().isEmpty) {
      showInfo(context, '제목과 내용을 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().sendInquiry(title: _title.text.trim(), body: _body.text.trim());
      if (mounted) {
        _title.clear();
        _body.clear();
        showInfo(context, '문의가 접수되었습니다. 답변은 알림으로 안내됩니다.');
      }
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('운영자 문의')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('문의 내용', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          Text('영업일 기준 1~2일 내 답변드립니다. 신고는 해당 콘텐츠의 신고 기능을 이용해 주세요.', style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
          const SizedBox(height: 14),
          TextField(controller: _title, decoration: const InputDecoration(labelText: '제목'), maxLength: 120),
          const SizedBox(height: 10),
          TextField(controller: _body, maxLines: 8, maxLength: 2000, decoration: const InputDecoration(labelText: '내용', alignLabelWithHint: true)),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('문의 보내기'),
          ),
          const SizedBox(height: 20),
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
            child: const Text(
              '이음소프트 고객센터\n이메일 support@talktalk.eumsoft.co.kr\n전화 033-742-0000 (평일 10:00~18:00)',
              style: TextStyle(fontSize: 12, height: 1.6),
            ),
          ),
        ],
      ),
    );
  }
}
