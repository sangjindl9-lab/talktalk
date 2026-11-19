import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';

class PostWriteScreen extends StatefulWidget {
  const PostWriteScreen({super.key});

  @override
  State<PostWriteScreen> createState() => _PostWriteScreenState();
}

class _PostWriteScreenState extends State<PostWriteScreen> {
  final _title = TextEditingController();
  final _body = TextEditingController();
  String _category = 'DAILY';
  File? _photo;
  bool _loading = false;

  @override
  void dispose() {
    _title.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().length < 2 || _body.text.trim().length < 2) {
      showInfo(context, '제목과 내용을 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().createPost(
        title: _title.text.trim(),
        body: _body.text.trim(),
        category: _category,
        photo: _photo,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('동네 글쓰기')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Wrap(
            spacing: 8,
            children: [
              for (final entry in const [
                ('DAILY', '일상'),
                ('QUESTION', '질문'),
                ('HOBBY', '취미'),
                ('GATHER', '모임모집'),
              ])
                ChoiceChip(
                  label: Text(entry.$2),
                  selected: _category == entry.$1,
                  onSelected: (_) => setState(() => _category = entry.$1),
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            maxLength: 60,
            decoration: const InputDecoration(labelText: '제목', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _body,
            maxLines: 8,
            maxLength: 2000,
            decoration: const InputDecoration(
              labelText: '내용',
              alignLabelWithHint: true,
              counterText: '',
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () async {
              final file = await ImagePicker().pickImage(
                source: ImageSource.gallery,
                maxWidth: 1600,
              );
              if (file != null) setState(() => _photo = File(file.path));
            },
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: Text(_photo == null ? '사진 첨부 (선택)' : '사진 변경'),
          ),
          if (_photo != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(_photo!, height: 160, fit: BoxFit.cover),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('등록'),
          ),
        ],
      ),
    );
  }
}

class MarketWriteScreen extends StatefulWidget {
  const MarketWriteScreen({super.key});

  @override
  State<MarketWriteScreen> createState() => _MarketWriteScreenState();
}

class _MarketWriteScreenState extends State<MarketWriteScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  String _type = 'SELL';
  File? _photo;
  bool _loading = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().length < 2) {
      showInfo(context, '제목을 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().createMarketItem(
        title: _title.text.trim(),
        description: _description.text.trim(),
        price: _type == 'FREE'
            ? 0
            : (int.tryParse(_price.text.replaceAll(RegExp(r'[^0-9]'), '')) ??
                  0),
        type: _type,
        photo: _photo,
      );
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('장터 글쓰기')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Wrap(
            spacing: 8,
            children: [
              for (final entry in const [
                ('SELL', '판매'),
                ('BUY', '구매'),
                ('FREE', '무료나눔'),
              ])
                ChoiceChip(
                  label: Text(entry.$2),
                  selected: _type == entry.$1,
                  onSelected: (_) => setState(() => _type = entry.$1),
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            maxLength: 60,
            decoration: const InputDecoration(labelText: '제목', counterText: ''),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _description,
            maxLines: 5,
            maxLength: 1000,
            decoration: const InputDecoration(
              labelText: '설명',
              alignLabelWithHint: true,
              counterText: '',
            ),
          ),
          if (_type != 'FREE') ...[
            const SizedBox(height: 10),
            TextField(
              controller: _price,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: '가격 (원)',
                hintText: '0',
              ),
            ),
          ],
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () async {
              final file = await ImagePicker().pickImage(
                source: ImageSource.gallery,
                maxWidth: 1600,
              );
              if (file != null) setState(() => _photo = File(file.path));
            },
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: Text(_photo == null ? '사진 첨부' : '사진 변경'),
          ),
          if (_photo != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.file(_photo!, height: 160, fit: BoxFit.cover),
              ),
            ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text('등록'),
          ),
          const SizedBox(height: 8),
          Text(
            '지역별 상단 고정(유료)은 등록 후 게시글에서 신청할 수 있습니다. 기간이 끝나면 자동 해제됩니다.',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
          ),
        ],
      ),
    );
  }
}
