import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:talk_talk/core/offline_queue.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('오프라인 메시지를 저장하고 clientMessageId로 제거한다', () async {
    final queue = OfflineQueue();
    await queue.add({
      'roomId': 'room-1',
      'clientMessageId': 'c-1',
      'type': 'TEXT',
      'body': '안녕하세요',
      'createdAt': DateTime.now().toIso8601String(),
    });
    await queue.add({
      'roomId': 'room-1',
      'clientMessageId': 'c-2',
      'type': 'TEXT',
      'body': '두번째',
      'createdAt': DateTime.now().toIso8601String(),
    });

    var items = await queue.all();
    expect(items.length, 2);
    expect(items.first['clientMessageId'], 'c-1');

    await queue.remove('c-1');
    items = await queue.all();
    expect(items.length, 1);
    expect(items.first['clientMessageId'], 'c-2');

    await queue.clear();
    expect((await queue.all()).isEmpty, isTrue);
  });
}
