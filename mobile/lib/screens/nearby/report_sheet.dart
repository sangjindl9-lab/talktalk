import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';

const _reasons = [
  ('SPAM', '스팸·홍보'),
  ('ABUSE', '욕설·비방'),
  ('SEXUAL', '음란·성적 콘텐츠'),
  ('FRAUD', '사기·거래 문제'),
  ('ILLEGAL', '불법 정보'),
  ('ETC', '기타'),
];

Future<void> showReportSheet(BuildContext context, {required String targetType, required String targetId}) async {
  String reason = 'SPAM';
  final detail = TextEditingController();
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (sheetContext) => StatefulBuilder(
      builder: (context, setState) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('신고하기', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                '신고된 내용은 신고 시점 그대로 관리자에게 전달됩니다. 허위 신고는 제재될 수 있습니다.',
                style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _reasons.map((entry) {
                  return ChoiceChip(
                    label: Text(entry.$2),
                    selected: reason == entry.$1,
                    onSelected: (_) => setState(() => reason = entry.$1),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: detail,
                maxLines: 3,
                maxLength: 500,
                decoration: const InputDecoration(hintText: '상세 내용 (선택)', alignLabelWithHint: true),
              ),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () async {
                  try {
                    await context.read<AppState>().report(
                          targetType: targetType,
                          targetId: targetId,
                          reason: reason,
                          detail: detail.text.trim().isEmpty ? null : detail.text.trim(),
                        );
                    if (context.mounted) {
                      Navigator.of(context).pop();
                      showInfo(context, '신고가 접수되었습니다. 검토 후 결과를 알려드릴게요.');
                    }
                  } catch (e) {
                    if (context.mounted) showError(context, e);
                  }
                },
                child: const Text('신고 접수'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}
