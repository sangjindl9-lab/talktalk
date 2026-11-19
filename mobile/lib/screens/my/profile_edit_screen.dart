import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import '../auth/region_picker_screen.dart';

class ProfileEditScreen extends StatefulWidget {
  const ProfileEditScreen({super.key});

  @override
  State<ProfileEditScreen> createState() => _ProfileEditScreenState();
}

class _ProfileEditScreenState extends State<ProfileEditScreen> {
  final _nickname = TextEditingController();
  final _bio = TextEditingController();
  final Set<String> _interests = {};
  String _ageBand = '20s';
  String _gender = 'NONE';
  bool _genderVisible = false;
  Region? _region;
  File? _photo;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    final me = context.read<AppState>().me;
    if (me != null) {
      _nickname.text = me.nickname;
      _bio.text = me.bio ?? '';
      _interests.addAll(me.interests);
      _ageBand = me.ageBand ?? '20s';
      _gender = me.gender ?? 'NONE';
      _genderVisible = me.setting('genderVisible', fallback: false);
      if (me.regionCode != null) {
        _region = Region(code: me.regionCode!, name: me.regionName ?? '', city: '');
      }
    }
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await context.read<AppState>().loadInterests();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _nickname.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _loading = true);
    try {
      final state = context.read<AppState>();
      String? photoMediaId;
      if (_photo != null) {
        final uploaded = await state.api.uploadImage(_photo!, kind: 'PROFILE');
        photoMediaId = '${uploaded['id']}';
      }
      await state.updateProfile({
        'nickname': _nickname.text.trim(),
        'bio': _bio.text.trim(),
        'ageBand': _ageBand,
        'interests': _interests.toList(),
        'gender': _gender,
        'genderVisible': _genderVisible,
        if (_region != null) 'regionCode': _region!.code,
        if (photoMediaId != null) 'photoMediaId': photoMediaId,
      });
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: const Text('프로필 수정')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: GestureDetector(
              onTap: () async {
                final file = await ImagePicker().pickImage(source: ImageSource.gallery, maxWidth: 1200);
                if (file != null) setState(() => _photo = File(file.path));
              },
              child: _photo != null
                  ? ClipRRect(borderRadius: BorderRadius.circular(28), child: Image.file(_photo!, width: 88, height: 88, fit: BoxFit.cover))
                  : UserAvatar(url: state.me?.photoUrl, nickname: state.me?.nickname, size: 88),
            ),
          ),
          const SizedBox(height: 6),
          Center(child: Text('사진 변경', style: TextStyle(fontSize: 11, color: Colors.grey.shade600))),
          const SizedBox(height: 16),
          TextField(controller: _nickname, maxLength: 12, decoration: const InputDecoration(labelText: '닉네임', counterText: '')),
          const SizedBox(height: 12),
          TextField(controller: _bio, maxLines: 3, maxLength: 200, decoration: const InputDecoration(labelText: '자기소개', alignLabelWithHint: true, counterText: '')),
          const SizedBox(height: 16),
          const Text('연령대', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final band in ['20s', '30s', '40s', '50s', '60s+'])
                ChoiceChip(
                  label: Text(band == '60s+' ? '60대+' : '${band.substring(0, 2)}대'),
                  selected: _ageBand == band,
                  onSelected: (_) => setState(() => _ageBand = band),
                ),
            ],
          ),
          const SizedBox(height: 16),
          const Text('관심사', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: state.interests.map((tag) {
              final selected = _interests.contains(tag);
              return FilterChip(
                label: Text(tag),
                selected: selected,
                onSelected: (value) => setState(() {
                  if (value) {
                    _interests.add(tag);
                  } else {
                    _interests.remove(tag);
                  }
                }),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
          const Text('성별 (선택)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            children: [
              for (final option in const [('NONE', '선택 안 함'), ('FEMALE', '여성'), ('MALE', '남성')])
                ChoiceChip(
                  label: Text(option.$2),
                  selected: _gender == option.$1,
                  onSelected: (_) => setState(() => _gender = option.$1),
                ),
            ],
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            value: _genderVisible,
            onChanged: (value) => setState(() => _genderVisible = value),
            title: const Text('성별 공개', style: TextStyle(fontSize: 13.5)),
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: () async {
              final region = await Navigator.of(context).push<Region>(MaterialPageRoute(builder: (_) => RegionPickerScreen(selectedCode: _region?.code)));
              if (region != null) setState(() => _region = region);
            },
            child: InputDecorator(
              decoration: const InputDecoration(labelText: '활동 지역'),
              child: Text(_region == null ? '지역 선택' : '${_region!.city} ${_region!.name}'),
            ),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _loading ? null : _save,
            child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Text('저장'),
          ),
        ],
      ),
    );
  }
}
