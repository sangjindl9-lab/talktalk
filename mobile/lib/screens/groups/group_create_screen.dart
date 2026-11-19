import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../auth/region_picker_screen.dart';

class GroupCreateScreen extends StatefulWidget {
  const GroupCreateScreen({super.key});

  @override
  State<GroupCreateScreen> createState() => _GroupCreateScreenState();
}

class _GroupCreateScreenState extends State<GroupCreateScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _hashtags = TextEditingController();
  double _capacity = 100;
  bool _joinApproval = false;
  Region? _region;
  File? _image;
  bool _loading = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _hashtags.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().length < 2) {
      showInfo(context, '방 이름은 2자 이상 입력해 주세요.');
      return;
    }
    setState(() => _loading = true);
    try {
      final room = await context.read<AppState>().createRoom(
            title: _title.text.trim(),
            description: _description.text.trim().isEmpty ? null : _description.text.trim(),
            hashtags: _hashtags.text.split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).take(5).toList(),
            capacity: _capacity.round(),
            joinApproval: _joinApproval,
            regionCode: _region?.code,
            image: _image,
          );
      if (mounted) Navigator.of(context).pop(room);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('새 방 만들기')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
        children: [
          Center(
            child: GestureDetector(
              onTap: () async {
                final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1400);
                if (file != null) setState(() => _image = File(file.path));
              },
              child: Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.grey.shade300),
                ),
                child: _image == null
                    ? const Icon(Icons.add_a_photo_outlined, color: Color(Brand.muted))
                    : ClipRRect(borderRadius: BorderRadius.circular(20), child: Image.file(_image!, fit: BoxFit.cover)),
              ),
            ),
          ),
          const SizedBox(height: 6),
          Center(child: Text('대표 이미지 (선택)', style: TextStyle(fontSize: 11, color: Colors.grey.shade600))),
          const SizedBox(height: 16),
          TextField(controller: _title, maxLength: 40, decoration: const InputDecoration(labelText: '방 이름', counterText: '')),
          const SizedBox(height: 12),
          TextField(controller: _description, maxLines: 3, maxLength: 300, decoration: const InputDecoration(labelText: '소개', alignLabelWithHint: true, counterText: '')),
          const SizedBox(height: 12),
          TextField(controller: _hashtags, decoration: const InputDecoration(labelText: '해시태그 (쉼표로 구분)', hintText: '카페, 산책, 독서')),
          const SizedBox(height: 12),
          InkWell(
            onTap: () async {
              final region = await Navigator.of(context).push<Region>(MaterialPageRoute(builder: (_) => const RegionPickerScreen()));
              if (region != null) setState(() => _region = region);
            },
            child: InputDecorator(
              decoration: const InputDecoration(labelText: '활동 지역 (선택)'),
              child: Text(_region == null ? '지역 선택 안 함' : '${_region!.city} ${_region!.name}'),
            ),
          ),
          const SizedBox(height: 16),
          Text('정원 ${_capacity.round()}명', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          Slider(
            value: _capacity,
            min: 10,
            max: 300,
            divisions: 29,
            label: '${_capacity.round()}명',
            onChanged: (value) => setState(() => _capacity = value),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _joinApproval,
            onChanged: (value) => setState(() => _joinApproval = value),
            title: const Text('가입 승인 필요', style: TextStyle(fontSize: 14)),
            subtitle: const Text('방장·운영진이 승인해야 참여할 수 있습니다.', style: TextStyle(fontSize: 11.5)),
          ),
          const SizedBox(height: 6),
          Text(
            '방을 만들면 방장이 됩니다. 방장은 공지 고정, 가입 승인, 강퇴, 방장 위임을 할 수 있으며\n나갈 때는 방장 위임 또는 방 종료가 필요합니다.',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600, height: 1.5),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('방 만들기'),
          ),
        ),
      ),
    );
  }
}
