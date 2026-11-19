import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

/// 오프라인 상태에서 보낸 메시지를 보관했다가 재연결 시 순서대로 전송한다.
/// clientMessageId 기반이므로 중복 전송되어도 서버에서 1건만 저장된다.
class OfflineQueue {
  static const _key = 'tt_offline_queue_v1';

  Future<List<Map<String, dynamic>>> all() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    return raw.map((e) => jsonDecode(e) as Map<String, dynamic>).toList();
  }

  Future<void> add(Map<String, dynamic> item) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    raw.add(jsonEncode(item));
    await prefs.setStringList(_key, raw);
  }

  Future<void> remove(String clientMessageId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_key) ?? [];
    final kept = raw.where((e) {
      final map = jsonDecode(e) as Map<String, dynamic>;
      return map['clientMessageId'] != clientMessageId;
    }).toList();
    await prefs.setStringList(_key, kept);
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_key);
  }
}
