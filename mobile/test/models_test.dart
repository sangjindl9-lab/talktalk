import 'package:flutter_test/flutter_test.dart';
import 'package:talk_talk/models/models.dart';

void main() {
  group('AppUser', () {
    test('서버 응답을 파싱하고 설정을 읽는다', () {
      final user = AppUser.fromJson({
        'id': 'u1',
        'nickname': '원주러버',
        'photoUrl': null,
        'ageBand': '30s',
        'regionName': '원주시',
        'interests': ['카페', '산책'],
        'distanceLabel': '같은 동네',
        'settings': {'showNearby': false, 'pushPreview': true},
        'points': 1200,
      });
      expect(user.nickname, '원주러버');
      expect(user.interests.length, 2);
      expect(user.setting('showNearby'), isFalse);
      expect(user.setting('pushPreview'), isTrue);
      expect(user.points, 1200);
    });
  });

  group('ChatMessage', () {
    test('seq 문자열을 정수로 변환하고 차단 메시지를 구분한다', () {
      final message = ChatMessage.fromJson({
        'id': 'm1',
        'roomId': 'r1',
        'senderId': 'u2',
        'senderNickname': '이웃',
        'type': 'TEXT',
        'body': null,
        'seq': '42',
        'createdAt': '2026-11-19T12:00:00.000Z',
        'masked': true,
      });
      expect(message.seq, 42);
      expect(message.masked, isTrue);
      expect(message.isImage, isFalse);
    });
  });

  group('MarketItem', () {
    test('가격/상태 라벨을 계산한다', () {
      final free = MarketItem.fromJson({'id': 'i1', 'type': 'FREE', 'title': '나눔', 'description': '', 'price': 0, 'status': 'ON_SALE'});
      expect(free.priceLabel, '무료 나눔');
      final sold = MarketItem.fromJson({'id': 'i2', 'type': 'SELL', 'title': '의자', 'description': '', 'price': 10000, 'status': 'SOLD'});
      expect(sold.priceLabel, '10000원');
      expect(sold.statusLabel, '거래완료');
    });
  });

  group('CommunityRoom', () {
    test('정원 초과 여부를 계산한다', () {
      final room = CommunityRoom.fromJson({'id': 'r1', 'type': 'GROUP', 'title': '산책모임', 'memberCount': 10, 'capacity': 10});
      expect(room.isFull, isTrue);
      expect(room.joined, isFalse);
    });
  });
}
