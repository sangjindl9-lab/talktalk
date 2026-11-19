import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../state/app_state.dart';
import '../../widgets/common.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  bool _saving = false;

  Future<void> _toggle(String key, bool value) async {
    setState(() => _saving = true);
    try {
      await context.read<AppState>().updateSettings({key: value});
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.me;
    return Scaffold(
      appBar: AppBar(title: const Text('알림·공개 설정')),
      body: me == null
          ? const SizedBox.shrink()
          : ListView(
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 4),
                  child: Text(
                    '주변 노출',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                ),
                SwitchListTile(
                  value: me.setting('showNearby'),
                  onChanged: _saving
                      ? null
                      : (value) => _toggle('showNearby', value),
                  title: const Text('주변에 나 표시'),
                  subtitle: const Text('끄면 다른 회원의 주변 목록에 나타나지 않습니다.'),
                ),
                SwitchListTile(
                  value: me.setting('showLastActive'),
                  onChanged: _saving
                      ? null
                      : (value) => _toggle('showLastActive', value),
                  title: const Text('최근 활동 표시'),
                  subtitle: const Text('끄면 최근 활동 시간이 표시되지 않습니다.'),
                ),
                SwitchListTile(
                  value: me.setting('receiveGreetings'),
                  onChanged: _saving
                      ? null
                      : (value) => _toggle('receiveGreetings', value),
                  title: const Text('새 인사 받기'),
                  subtitle: const Text('끄면 새로운 쪽지(인사)를 받지 않습니다.'),
                ),
                SwitchListTile(
                  value: me.setting('allowMultiNote'),
                  onChanged: _saving
                      ? null
                      : (value) => _toggle('allowMultiNote', value),
                  title: const Text('다중 인사 허용'),
                  subtitle: const Text('여러 명에게 보내는 인사를 받을 수 있습니다.'),
                ),
                const Divider(),
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 12, 20, 4),
                  child: Text(
                    '알림',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                ),
                SwitchListTile(
                  value: me.setting('pushEnabled'),
                  onChanged: _saving
                      ? null
                      : (value) => _toggle('pushEnabled', value),
                  title: const Text('푸시 알림 받기'),
                ),
                SwitchListTile(
                  value: me.setting('pushPreview', fallback: false),
                  onChanged: _saving
                      ? null
                      : (value) => _toggle('pushPreview', value),
                  title: const Text('잠금화면 미리보기'),
                  subtitle: const Text('끄면 알림에 메시지 내용이 표시되지 않습니다. (권장)'),
                ),
                const Padding(
                  padding: EdgeInsets.all(20),
                  child: Text(
                    '알림 설정은 즉시 서버에 저장됩니다. 기기 알림 권한을 거부한 경우 운영체제 설정에서 허용해 주세요.',
                    style: TextStyle(
                      fontSize: 11.5,
                      color: Color(0xFF6B6F76),
                      height: 1.5,
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}
