import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../config/brand.dart';
import '../../models/models.dart';
import '../../state/app_state.dart';
import '../../widgets/common.dart';
import 'region_picker_screen.dart';

class SignupProfileScreen extends StatefulWidget {
  const SignupProfileScreen({super.key, required this.verificationToken, required this.phone});
  final String verificationToken;
  final String phone;

  @override
  State<SignupProfileScreen> createState() => _SignupProfileScreenState();
}

class _SignupProfileScreenState extends State<SignupProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nickname = TextEditingController();
  final _realName = TextEditingController();
  final _bio = TextEditingController();
  DateTime? _birthDate;
  Region? _region;
  final Set<String> _interests = {};
  String _gender = 'NONE';
  bool _genderVisible = false;
  bool _agreed = false;
  bool _loading = false;
  File? _photo;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        await context.read<AppState>().loadInterests();
        await context.read<AppState>().loadRegions();
      } catch (_) {}
    });
  }

  @override
  void dispose() {
    _nickname.dispose();
    _realName.dispose();
    _bio.dispose();
    super.dispose();
  }

  Future<void> _pickBirthDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 25, now.month, now.day),
      firstDate: DateTime(now.year - 80),
      lastDate: now,
      helpText: '생년월일 (만 19세 이상)',
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _pickPhoto() async {
    final picker = ImagePicker();
    final file = await picker.pickImage(source: ImageSource.gallery, maxWidth: 1200, imageQuality: 88);
    if (file != null) setState(() => _photo = File(file.path));
  }

  int? get _age {
    final birth = _birthDate;
    if (birth == null) return null;
    final now = DateTime.now();
    var age = now.year - birth.year;
    if (now.month < birth.month || (now.month == birth.month && now.day < birth.day)) age--;
    return age;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_birthDate == null) {
      showInfo(context, '생년월일을 선택해 주세요.');
      return;
    }
    if ((_age ?? 0) < Brand.minimumAge) {
      showInfo(context, '만 ${Brand.minimumAge}세 이상만 가입할 수 있습니다.');
      return;
    }
    if (_region == null) {
      showInfo(context, '활동 지역을 선택해 주세요.');
      return;
    }
    if (_interests.isEmpty) {
      showInfo(context, '관심사를 1개 이상 선택해 주세요.');
      return;
    }
    if (!_agreed) {
      showInfo(context, '이용약관과 개인정보 처리방침에 동의해 주세요.');
      return;
    }
    setState(() => _loading = true);
    final state = context.read<AppState>();
    try {
      String? photoMediaId;
      if (_photo != null) {
        final uploaded = await state.api.uploadImage(_photo!, kind: 'PROFILE');
        photoMediaId = '${uploaded['id']}';
      }
      await state.signup(
        verificationToken: widget.verificationToken,
        nickname: _nickname.text.trim(),
        realName: _realName.text.trim(),
        birthDate: _birthDate!,
        regionCode: _region!.code,
        interests: _interests.toList(),
        bio: _bio.text.trim().isEmpty ? null : _bio.text.trim(),
        gender: _gender,
        genderVisible: _genderVisible,
        photoMediaId: photoMediaId,
      );
      if (mounted) Navigator.of(context).popUntil((route) => route.isFirst);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final interests = context.watch<AppState>().interests;
    return Scaffold(
      appBar: AppBar(title: const Text('프로필 만들기')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 120),
          children: [
            Center(
              child: GestureDetector(
                onTap: _pickPhoto,
                child: Stack(
                  children: [
                    _photo == null
                        ? const UserAvatar(size: 88, nickname: '톡')
                        : ClipRRect(
                            borderRadius: BorderRadius.circular(28),
                            child: Image.file(_photo!, width: 88, height: 88, fit: BoxFit.cover),
                          ),
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(color: Color(Brand.primary), shape: BoxShape.circle),
                        child: const Icon(Icons.camera_alt, size: 14, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Center(child: Text('프로필 사진 (선택)', style: TextStyle(fontSize: 11, color: Colors.grey.shade600))),
            const SizedBox(height: 18),
            TextFormField(
              controller: _nickname,
              maxLength: 12,
              decoration: const InputDecoration(labelText: '닉네임', hintText: '한글·영문·숫자 2~12자', counterText: ''),
              validator: (value) {
                final text = value?.trim() ?? '';
                if (text.length < 2 || text.length > 12) return '닉네임은 2~12자로 입력해 주세요.';
                if (!RegExp(r'^[가-힣a-zA-Z0-9_]+$').hasMatch(text)) return '한글·영문·숫자·밑줄만 사용할 수 있어요.';
                return null;
              },
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _realName,
              decoration: const InputDecoration(labelText: '실명 (본인확인용, 비공개)', hintText: '다른 회원에게 공개되지 않습니다'),
              validator: (value) => (value?.trim().isEmpty ?? true) ? '실명을 입력해 주세요.' : null,
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: _pickBirthDate,
              child: InputDecorator(
                decoration: const InputDecoration(labelText: '생년월일 (만 19세 이상, 비공개)'),
                child: Text(
                  _birthDate == null ? '생년월일 선택' : '${_birthDate!.year}-${_birthDate!.month.toString().padLeft(2, '0')}-${_birthDate!.day.toString().padLeft(2, '0')}',
                  style: TextStyle(color: _birthDate == null ? Colors.grey.shade600 : null),
                ),
              ),
            ),
            const SizedBox(height: 12),
            InkWell(
              onTap: () async {
                final region = await Navigator.of(context).push<Region>(
                  MaterialPageRoute(builder: (_) => RegionPickerScreen(selectedCode: _region?.code)),
                );
                if (region != null) setState(() => _region = region);
              },
              child: InputDecorator(
                decoration: const InputDecoration(labelText: '활동 지역 (시군구)'),
                child: Text(
                  _region == null ? '지역 선택' : '${_region!.city} ${_region!.name}',
                  style: TextStyle(color: _region == null ? Colors.grey.shade600 : null),
                ),
              ),
            ),
            const SizedBox(height: 18),
            const Text('관심사 (1개 이상)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: interests.map((tag) {
                final selected = _interests.contains(tag);
                return FilterChip(
                  label: Text(tag),
                  selected: selected,
                  onSelected: (value) {
                    setState(() {
                      if (value) {
                        _interests.add(tag);
                      } else {
                        _interests.remove(tag);
                      }
                    });
                  },
                );
              }).toList(),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _bio,
              maxLines: 3,
              maxLength: 200,
              decoration: const InputDecoration(labelText: '자기소개 (선택)', alignLabelWithHint: true, counterText: ''),
            ),
            const SizedBox(height: 8),
            const Text('성별 (선택)', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            const SizedBox(height: 8),
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
              subtitle: const Text('끄면 다른 회원에게 성별이 보이지 않습니다.', style: TextStyle(fontSize: 11.5)),
            ),
            const SizedBox(height: 8),
            CheckboxListTile(
              contentPadding: EdgeInsets.zero,
              value: _agreed,
              onChanged: (value) => setState(() => _agreed = value ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              title: const Text('[필수] 이용약관·개인정보 처리방침·연령 확인 동의', style: TextStyle(fontSize: 12.5)),
              subtitle: const Text('만 19세 이상이며, 위치기반서비스 이용에 동의합니다.', style: TextStyle(fontSize: 11)),
            ),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
          child: FilledButton(
            onPressed: _loading ? null : _submit,
            child: _loading
                ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('가입하고 시작하기'),
          ),
        ),
      ),
    );
  }
}
