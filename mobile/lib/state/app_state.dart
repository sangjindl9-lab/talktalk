import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../config/env.dart';
import '../core/api_client.dart';
import '../core/auth_store.dart';
import '../core/notifications.dart';
import '../core/offline_queue.dart';
import '../core/ws_client.dart';
import '../models/models.dart';

class NearbyFilter {
  String sort;
  String? regionCode;
  String? ageBand;
  String? interest;
  NearbyFilter({this.sort = 'distance', this.regionCode, this.ageBand, this.interest});
}

/// 앱 전역 상태: 인증, 주변 친구, 쪽지, 대화, 커뮤니티, 포인트.
class AppState extends ChangeNotifier {
  AppState() {
    _bindSocket();
  }

  final ApiClient api = ApiClient();
  final AuthStore _store = AuthStore();
  final WsClient ws = WsClient();
  final OfflineQueue offlineQueue = OfflineQueue();
  final NotificationService notifications = NotificationService();

  AppUser? me;
  String? token;
  bool initialized = false;
  bool busy = false;
  String? lastError;

  List<AppUser> nearby = [];
  NearbyFilter filter = NearbyFilter();
  Map<String, dynamic>? browsingRegion;

  List<NoteRequestItem> receivedNotes = [];
  List<NoteRequestItem> sentNotes = [];

  List<ChatSummary> chats = [];
  Map<String, int> unreadByRoom = {};
  Map<String, List<ChatMessage>> messagesByRoom = {};
  Map<String, int> lastSeqByRoom = {};
  String? activeRoomId;

  List<CommunityRoom> rooms = [];
  List<BoardPost> posts = [];
  List<MarketItem> marketItems = [];
  List<Region> regions = [];
  List<String> interests = [];

  int points = 0;
  List<PointProduct> products = [];
  List<Map<String, dynamic>> promotions = [];
  List<Map<String, dynamic>> blockedUsers = [];

  int get newRequestCount => receivedNotes.where((n) => n.status == 'PENDING').length;
  int get unreadMessageCount => unreadByRoom.values.fold(0, (sum, value) => sum + value);

  // ───────────────────────────── 초기화 / 인증 ─────────────────────────────

  Future<void> init() async {
    await notifications.init();
    token = await _store.readToken();
    if (token != null && token!.isNotEmpty) {
      api.token = token;
      me = await _store.readUser();
      try {
        await refreshMe();
        await ws.connect(token!);
        await Future.wait([loadChats(), loadNotes()]);
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) {
          await logout();
        }
      }
    }
    initialized = true;
    notifyListeners();
  }

  Future<void> requestPhoneCode(String phone) async {
    await api.post('/auth/phone/request', body: {'phone': phone});
  }

  Future<String> verifyPhoneCode(String phone, String code) async {
    final res = await api.post('/auth/phone/verify', body: {'phone': phone, 'code': code});
    return '${res['verificationToken']}';
  }

  Future<void> signup({
    required String verificationToken,
    required String nickname,
    required String realName,
    required DateTime birthDate,
    required String regionCode,
    required List<String> interests,
    String? bio,
    String? gender,
    bool genderVisible = false,
    String? photoMediaId,
  }) async {
    final res = await api.post('/auth/signup', body: {
      'verificationToken': verificationToken,
      'nickname': nickname,
      'realName': realName,
      'birthDate': birthDate.toIso8601String().substring(0, 10),
      'regionCode': regionCode,
      'interests': interests,
      'bio': bio,
      'gender': gender ?? 'NONE',
      'genderVisible': genderVisible,
      'photoMediaId': photoMediaId,
    });
    await _applySession(res as Map<String, dynamic>);
  }

  Future<void> login(String phone, String code) async {
    final res = await api.post('/auth/login', body: {'phone': phone, 'code': code});
    await _applySession(res as Map<String, dynamic>);
  }

  Future<void> _applySession(Map<String, dynamic> res) async {
    token = '${res['token']}';
    api.token = token;
    me = AppUser.fromJson(res['user'] as Map<String, dynamic>);
    points = me?.points ?? 0;
    await _store.save(token!, me!);
    await ws.connect(token!);
    await Future.wait([loadChats(), loadNotes(), loadNearby()]);
    notifyListeners();
  }

  Future<void> logout() async {
    ws.disconnect();
    await _store.clear();
    await offlineQueue.clear();
    token = null;
    api.token = null;
    me = null;
    chats = [];
    receivedNotes = [];
    unreadByRoom = {};
    messagesByRoom = {};
    notifyListeners();
  }

  Future<void> refreshMe() async {
    final res = await api.get('/me');
    me = AppUser.fromJson(res as Map<String, dynamic>);
    points = me?.points ?? 0;
    if (token != null) await _store.saveUser(me!);
    notifyListeners();
  }

  Future<void> updateProfile(Map<String, dynamic> body) async {
    final res = await api.patch('/me', body: body);
    me = AppUser.fromJson(res as Map<String, dynamic>);
    if (token != null) await _store.saveUser(me!);
    notifyListeners();
  }

  Future<void> updateSettings(Map<String, bool> settings) async {
    final res = await api.patch('/me/settings', body: settings);
    me = AppUser.fromJson(res as Map<String, dynamic>);
    if (token != null) await _store.saveUser(me!);
    notifyListeners();
  }

  Future<void> deleteAccount(String reason) async {
    await api.delete('/me', body: {'confirm': 'DELETE', 'reason': reason});
    await logout();
  }

  // ───────────────────────────── 위치 / 지역 ─────────────────────────────

  Future<void> loadRegions() async {
    if (regions.isNotEmpty) return;
    final res = await api.get('/regions') as List;
    regions = res.map((e) => Region.fromJson(e as Map<String, dynamic>)).toList();
    notifyListeners();
  }

  Future<List<String>> loadInterests() async {
    if (interests.isNotEmpty) return interests;
    final res = await api.get('/interests') as List;
    interests = res.map((e) => '$e').toList();
    notifyListeners();
    return interests;
  }

  /// 위치 권한 요청 → 허용 시 서버가 최근접 시군구로 설정, 거절 시 직접 선택 필요.
  Future<Region?> requestLocationRegion() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return null;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied || permission == LocationPermission.deniedForever) {
      return null;
    }
    final position = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.low,
      timeLimit: const Duration(seconds: 12),
    ).catchError((_) => Geolocator.getLastKnownPosition().then((p) => p!));
    final res = await api.post('/me/location', body: {'lat': position.latitude, 'lng': position.longitude});
    final region = Region.fromJson(res as Map<String, dynamic>);
    await refreshMe();
    return region;
  }

  Future<void> setRegion(String regionCode) async {
    await api.put('/me/region', body: {'regionCode': regionCode});
    await refreshMe();
  }

  Future<void> browseRegion(String regionCode) async {
    final res = await api.post('/regions/browse', body: {'regionCode': regionCode});
    browsingRegion = res as Map<String, dynamic>;
    points = (res['balance'] as num?)?.toInt() ?? points;
    await loadNearby(regionCode: regionCode);
    notifyListeners();
  }

  // ───────────────────────────── 주변 친구 ─────────────────────────────

  Future<void> loadNearby({String? sort, String? regionCode, String? ageBand, String? interest}) async {
    if (sort != null) filter.sort = sort;
    if (regionCode != null) filter.regionCode = regionCode;
    if (ageBand != null) filter.ageBand = ageBand;
    if (interest != null) filter.interest = interest;
    final res = await api.get('/nearby', query: {
      'sort': filter.sort,
      'regionCode': filter.regionCode,
      'ageBand': filter.ageBand,
      'interest': filter.interest,
    }) as List;
    nearby = res.map((e) => AppUser.fromJson(e as Map<String, dynamic>)).toList();
    notifyListeners();
  }

  Future<List<AppUser>> searchUsers(String q) async {
    final res = await api.get('/users/search', query: {'q': q}) as List;
    return res.map((e) => AppUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<AppUser> userProfile(String userId) async {
    final res = await api.get('/users/$userId');
    return AppUser.fromJson(res as Map<String, dynamic>);
  }

  Future<void> blockUser(String userId) async {
    await api.post('/blocks', body: {'userId': userId});
    nearby.removeWhere((u) => u.id == userId);
    await loadBlocked();
    notifyListeners();
  }

  Future<void> unblockUser(String userId) async {
    await api.delete('/blocks/$userId');
    await loadBlocked();
    notifyListeners();
  }

  Future<void> loadBlocked() async {
    final res = await api.get('/blocks') as List;
    blockedUsers = res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    notifyListeners();
  }

  // ───────────────────────────── 쪽지(인사) ─────────────────────────────

  Future<NoteRequestItem> sendNote(String toUserId, String message) async {
    final res = await api.post('/notes/requests', body: {'toUserId': toUserId, 'message': message});
    final note = NoteRequestItem.fromJson(res as Map<String, dynamic>);
    sentNotes.insert(0, note);
    notifyListeners();
    return note;
  }

  Future<void> loadNotes() async {
    final received = await api.get('/notes/requests', query: {'box': 'received'}) as List;
    final sent = await api.get('/notes/requests', query: {'box': 'sent'}) as List;
    receivedNotes = received.map((e) => NoteRequestItem.fromJson(e as Map<String, dynamic>)).toList();
    sentNotes = sent.map((e) => NoteRequestItem.fromJson(e as Map<String, dynamic>)).toList();
    notifyListeners();
  }

  Future<String> acceptNote(String noteId) async {
    final res = await api.post('/notes/requests/$noteId/accept');
    final roomId = '${res['roomId']}';
    await loadNotes();
    await loadChats();
    return roomId;
  }

  Future<void> declineNote(String noteId) async {
    await api.post('/notes/requests/$noteId/decline');
    await loadNotes();
  }

  Future<void> cancelNote(String noteId) async {
    await api.post('/notes/requests/$noteId/cancel');
    await loadNotes();
  }

  Future<Map<String, dynamic>> multiNotePreview(List<String> toUserIds) async {
    final res = await api.post('/notes/multi/preview', body: {'toUserIds': toUserIds});
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> sendMultiNote(List<String> toUserIds, String message) async {
    final res = await api.post('/notes/multi', body: {'toUserIds': toUserIds, 'message': message});
    points = ((res as Map)['balance'] as num?)?.toInt() ?? points;
    await loadNotes();
    notifyListeners();
    return Map<String, dynamic>.from(res);
  }

  // ───────────────────────────── 대화 ─────────────────────────────

  Future<void> loadChats() async {
    final res = await api.get('/chat/rooms') as List;
    chats = res.map((e) => ChatSummary.fromJson(e as Map<String, dynamic>)).toList();
    unreadByRoom = {
      for (final chat in chats)
        if (chat.unreadCount > 0) chat.id: chat.unreadCount,
    };
    notifyListeners();
  }

  Future<Map<String, dynamic>> roomInfo(String roomId) async {
    final res = await api.get('/chat/rooms/$roomId');
    return Map<String, dynamic>.from(res as Map);
  }

  Future<void> openRoom(String roomId) async {
    activeRoomId = roomId;
    final res = await api.get('/chat/rooms/$roomId/messages', query: {'limit': 50}) as List;
    final loaded = res.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();
    // 오프라인 큐에 남은 메시지를 함께 표시
    final queued = (await offlineQueue.all()).where((e) => e['roomId'] == roomId);
    for (final entry in queued) {
      loaded.add(ChatMessage(
        id: 'local-${entry['clientMessageId']}',
        roomId: roomId,
        senderId: me?.id ?? '',
        senderNickname: me?.nickname ?? '나',
        type: '${entry['type'] ?? 'TEXT'}',
        body: entry['body'] as String?,
        clientMessageId: '${entry['clientMessageId']}',
        createdAt: DateTime.tryParse('${entry['createdAt']}') ?? DateTime.now(),
        state: 'pending',
      ));
    }
    loaded.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    messagesByRoom[roomId] = loaded;
    lastSeqByRoom[roomId] = loaded.fold(0, (max, m) => m.seq > max ? m.seq : max);
    await ws.join(roomId);
    await markRead(roomId);
    notifyListeners();
  }

  void closeRoom() {
    activeRoomId = null;
  }

  Future<void> markRead(String roomId) async {
    final list = messagesByRoom[roomId];
    if (list == null || list.isEmpty) return;
    final seq = list.fold(0, (max, m) => m.seq > max ? m.seq : max);
    if (seq > 0) {
      await ws.markRead(roomId, seq);
      unreadByRoom[roomId] = 0;
      final index = chats.indexWhere((c) => c.id == roomId);
      if (index >= 0) {
        final chat = chats[index];
        chats[index] = ChatSummary(
          id: chat.id,
          type: chat.type,
          title: chat.title,
          imageUrl: chat.imageUrl,
          memberCount: chat.memberCount,
          lastMessage: chat.lastMessage,
          unreadCount: 0,
          muted: chat.muted,
          lastMessageAt: chat.lastMessageAt,
        );
      }
      notifyListeners();
    }
  }

  /// 메시지 전송: 낙관적 표시 → 실패 시 오프라인 큐에 보관.
  Future<void> sendText(String roomId, String text) async {
    final clientMessageId = 'c-${DateTime.now().microsecondsSinceEpoch}-${Random().nextInt(9999)}';
    final local = ChatMessage(
      id: 'local-$clientMessageId',
      roomId: roomId,
      senderId: me?.id ?? '',
      senderNickname: me?.nickname ?? '나',
      type: 'TEXT',
      body: text,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
      state: 'pending',
    );
    messagesByRoom.putIfAbsent(roomId, () => []).add(local);
    notifyListeners();

    final ack = await ws.sendMessage(roomId: roomId, clientMessageId: clientMessageId, body: text);
    if (ack['ok'] == true) {
      final message = ChatMessage.fromJson(Map<String, dynamic>.from(ack['message'] as Map));
      _replaceLocal(roomId, clientMessageId, message);
    } else {
      final code = '${(ack['error'] as Map?)?['code']}';
      if (code == 'OFFLINE' || code == 'TIMEOUT' || code == 'NETWORK_ERROR') {
        await offlineQueue.add({
          'roomId': roomId,
          'clientMessageId': clientMessageId,
          'type': 'TEXT',
          'body': text,
          'createdAt': local.createdAt.toIso8601String(),
        });
        _setState(roomId, clientMessageId, 'failed');
      } else {
        _setState(roomId, clientMessageId, 'failed');
        throw ApiException(0, code, '${(ack['error'] as Map?)?['message'] ?? '메시지를 보내지 못했습니다.'}');
      }
    }
    await loadChats();
  }

  Future<void> sendImage(String roomId, File file) async {
    final uploaded = await api.uploadImage(file, kind: 'CHAT');
    final mediaId = '${uploaded['id']}';
    final clientMessageId = 'i-${DateTime.now().microsecondsSinceEpoch}';
    final ack = await ws.sendMessage(roomId: roomId, clientMessageId: clientMessageId, type: 'IMAGE', mediaId: mediaId);
    if (ack['ok'] == true) {
      final message = ChatMessage.fromJson(Map<String, dynamic>.from(ack['message'] as Map));
      messagesByRoom.putIfAbsent(roomId, () => []).add(message);
      notifyListeners();
    }
    await loadChats();
  }

  void _replaceLocal(String roomId, String clientMessageId, ChatMessage message) {
    final list = messagesByRoom[roomId];
    if (list == null) return;
    final index = list.indexWhere((m) => m.clientMessageId == clientMessageId);
    if (index >= 0) {
      list[index] = message;
    } else if (!list.any((m) => m.id == message.id)) {
      list.add(message);
    }
    lastSeqByRoom[roomId] = max(lastSeqByRoom[roomId] ?? 0, message.seq);
    notifyListeners();
  }

  void _setState(String roomId, String clientMessageId, String state) {
    final list = messagesByRoom[roomId];
    if (list == null) return;
    final index = list.indexWhere((m) => m.clientMessageId == clientMessageId);
    if (index >= 0) list[index] = list[index].copyWith(state: state);
    notifyListeners();
  }

  /// 재연결 시 누락 메시지 동기화 + 오프라인 큐 전송
  Future<void> resync() async {
    for (final entry in messagesByRoom.keys.toList()) {
      final after = lastSeqByRoom[entry] ?? 0;
      final missing = await ws.sync(roomId: entry, afterSeq: after);
      for (final raw in missing) {
        final message = ChatMessage.fromJson(raw);
        final list = messagesByRoom[entry] ?? [];
        if (!list.any((m) => m.id == message.id)) {
          list.add(message);
          messagesByRoom[entry] = list;
        }
        lastSeqByRoom[entry] = max(lastSeqByRoom[entry] ?? 0, message.seq);
      }
      messagesByRoom[entry]?.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    }
    await flushOfflineQueue();
    await loadChats();
    notifyListeners();
  }

  Future<void> flushOfflineQueue() async {
    final pending = await offlineQueue.all();
    for (final entry in pending) {
      final ack = await ws.sendMessage(
        roomId: '${entry['roomId']}',
        clientMessageId: '${entry['clientMessageId']}',
        type: '${entry['type'] ?? 'TEXT'}',
        body: entry['body'] as String?,
      );
      if (ack['ok'] == true) {
        final message = ChatMessage.fromJson(Map<String, dynamic>.from(ack['message'] as Map));
        _replaceLocal('${entry['roomId']}', '${entry['clientMessageId']}', message);
        await offlineQueue.remove('${entry['clientMessageId']}');
      }
    }
  }

  Future<void> setMuted(String roomId, bool muted) async {
    await api.patch('/chat/rooms/$roomId/mute', body: {'muted': muted});
    await loadChats();
  }

  Future<void> leaveRoom(String roomId) async {
    await api.post('/chat/rooms/$roomId/leave');
    messagesByRoom.remove(roomId);
    await loadChats();
  }

  Future<String> exportRoom(String roomId) async {
    final res = await api.get('/chat/rooms/$roomId/export');
    return res is String ? res : '${res['raw'] ?? ''}';
  }

  Future<List<ChatMessage>> searchRoom(String roomId, String query) async {
    final res = await api.get('/chat/rooms/$roomId/search', query: {'q': query}) as List;
    return res.map((e) => ChatMessage.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ───────────────────────────── 커뮤니티 방 ─────────────────────────────

  Future<void> loadRooms({String? q, String? type, bool mine = false}) async {
    final res = await api.get('/rooms', query: {'q': q, 'type': type, 'mine': mine ? 'true' : null}) as List;
    rooms = res.map((e) => CommunityRoom.fromJson(e as Map<String, dynamic>)).toList();
    notifyListeners();
  }

  Future<Map<String, dynamic>> roomDetail(String roomId) async {
    final res = await api.get('/rooms/$roomId');
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> joinCommunityRoom(String roomId, {String? message}) async {
    final res = await api.post('/rooms/$roomId/join', body: {'message': message});
    await loadRooms();
    return Map<String, dynamic>.from(res as Map);
  }

  Future<Map<String, dynamic>> joinRegionRoom(String regionCode) async {
    final res = await api.post('/rooms/regions/$regionCode/join');
    await loadRooms();
    return Map<String, dynamic>.from(res as Map);
  }

  Future<CommunityRoom> createRoom({
    required String title,
    String? description,
    List<String> hashtags = const [],
    int capacity = 100,
    bool joinApproval = false,
    String? regionCode,
    File? image,
  }) async {
    String? imageMediaId;
    if (image != null) {
      final uploaded = await api.uploadImage(image, kind: 'ROOM');
      imageMediaId = '${uploaded['id']}';
    }
    final res = await api.post('/rooms', body: {
      'title': title,
      'description': description,
      'hashtags': hashtags,
      'capacity': capacity,
      'joinApproval': joinApproval,
      'regionCode': regionCode,
      'imageMediaId': imageMediaId,
    });
    await loadRooms();
    return CommunityRoom.fromJson(res as Map<String, dynamic>);
  }

  Future<void> leaveCommunityRoom(String roomId, {String? transferToUserId}) async {
    await api.post('/rooms/$roomId/leave', body: {'transferToUserId': transferToUserId});
    await loadRooms();
  }

  Future<void> kickMember(String roomId, String userId, {bool restrictRejoin = false}) async {
    await api.post('/rooms/$roomId/kick', body: {'userId': userId, 'restrictRejoin': restrictRejoin});
  }

  // ───────────────────────────── 동네 게시판 / 장터 ─────────────────────────────

  Future<void> loadPosts({String? regionCode, String? category}) async {
    final res = await api.get('/board/posts', query: {'regionCode': regionCode, 'category': category}) as List;
    posts = res.map((e) => BoardPost.fromJson(e as Map<String, dynamic>)).toList();
    notifyListeners();
  }

  Future<BoardPost> createPost({
    required String title,
    required String body,
    String category = 'DAILY',
    File? photo,
  }) async {
    String? photoMediaId;
    if (photo != null) {
      final uploaded = await api.uploadImage(photo, kind: 'BOARD');
      photoMediaId = '${uploaded['id']}';
    }
    final res = await api.post('/board/posts', body: {
      'title': title,
      'body': body,
      'category': category,
      'photoMediaId': photoMediaId,
    });
    await loadPosts(regionCode: me?.regionCode);
    return BoardPost.fromJson(res as Map<String, dynamic>);
  }

  Future<void> toggleLike(String postId) async {
    await api.post('/board/posts/$postId/like');
    await loadPosts(regionCode: me?.regionCode);
  }

  Future<void> toggleBookmark(String postId) async {
    await api.post('/board/posts/$postId/bookmark');
    await loadPosts(regionCode: me?.regionCode);
  }

  Future<Map<String, dynamic>> promotePost(String postId, int days) async {
    final res = await api.post('/board/posts/$postId/promote', body: {'days': days});
    await refreshMe();
    return Map<String, dynamic>.from(res as Map);
  }

  Future<void> loadMarket({String? regionCode, String? type}) async {
    final res = await api.get('/market/items', query: {'regionCode': regionCode, 'type': type}) as List;
    marketItems = res.map((e) => MarketItem.fromJson(e as Map<String, dynamic>)).toList();
    notifyListeners();
  }

  Future<MarketItem> createMarketItem({
    required String title,
    required String description,
    required int price,
    String type = 'SELL',
    File? photo,
  }) async {
    String? photoMediaId;
    if (photo != null) {
      final uploaded = await api.uploadImage(photo, kind: 'MARKET');
      photoMediaId = '${uploaded['id']}';
    }
    final res = await api.post('/market/items', body: {
      'title': title,
      'description': description,
      'price': price,
      'type': type,
      'photoMediaId': photoMediaId,
    });
    await loadMarket(regionCode: me?.regionCode);
    return MarketItem.fromJson(res as Map<String, dynamic>);
  }

  Future<void> setMarketStatus(String itemId, String status) async {
    await api.patch('/market/items/$itemId/status', body: {'status': status});
    await loadMarket(regionCode: me?.regionCode);
  }

  Future<String> inquireItem(String itemId) async {
    final res = await api.post('/market/items/$itemId/inquiry');
    await loadChats();
    return '${res['roomId']}';
  }

  // ───────────────────────────── 포인트 / 결제 ─────────────────────────────

  Future<void> loadPoints() async {
    final balance = await api.get('/points/balance');
    points = ((balance as Map)['balance'] as num?)?.toInt() ?? 0;
    final productsRes = await api.get('/points/products') as Map;
    products = (productsRes['products'] as List).map((e) => PointProduct.fromJson(e as Map<String, dynamic>)).toList();
    final promos = await api.get('/board/promotions') as List;
    promotions = promos.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    notifyListeners();
  }

  /// 스토어 결제 영수증 검증(Google Play / App Store). 동일 영수증은 서버에서 중복 지급되지 않는다.
  Future<Map<String, dynamic>> verifyPurchase({
    required String platform,
    required String productId,
    required String transactionId,
    String? purchaseToken,
    String? receipt,
  }) async {
    final res = await api.post('/billing/verify', body: {
      'platform': platform,
      'productId': productId,
      'transactionId': transactionId,
      'purchaseToken': purchaseToken,
      'receipt': receipt,
    });
    await refreshMe();
    return Map<String, dynamic>.from(res as Map);
  }

  // ───────────────────────────── 신고 / 문의 / 공지 ─────────────────────────────

  Future<void> report({required String targetType, required String targetId, required String reason, String? detail}) async {
    await api.post('/reports', body: {
      'targetType': targetType,
      'targetId': targetId,
      'reason': reason,
      'detail': detail,
    });
  }

  Future<void> appeal(String message, {String? reportId}) async {
    await api.post('/appeals', body: {'message': message, 'reportId': reportId});
  }

  Future<void> sendInquiry({required String title, required String body}) async {
    await api.post('/inquiries', body: {'title': title, 'body': body});
  }

  Future<List<dynamic>> loadNotices() async {
    final res = await api.get('/notices') as List;
    return res;
  }

  Future<List<dynamic>> loadMyReports() async {
    final res = await api.get('/reports/mine') as List;
    return res;
  }

  // ───────────────────────────── 소켓 이벤트 ─────────────────────────────

  void _bindSocket() {
    ws.messages.listen((raw) {
      final message = ChatMessage.fromJson(raw);
      if (!messagesByRoom.containsKey(message.roomId)) {
        loadChats();
        return;
      }
      final list = messagesByRoom[message.roomId]!;
      if (list.any((m) => m.id == message.id)) return;
      list.add(message);
      lastSeqByRoom[message.roomId] = max(lastSeqByRoom[message.roomId] ?? 0, message.seq);
      if (activeRoomId == message.roomId) {
        markRead(message.roomId);
      } else if (message.senderId != me?.id) {
        unreadByRoom[message.roomId] = (unreadByRoom[message.roomId] ?? 0) + 1;
        final preview = me?.setting('pushPreview') == true ? (message.body ?? '사진을 보냈습니다.') : '새 메시지가 도착했습니다.';
        notifications.show(message.senderNickname, preview);
      }
      list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      notifyListeners();
    });
    ws.notes.listen((raw) {
      loadNotes();
      loadChats();
    });
    ws.onReconnected = () {
      resync();
    };
  }
}
