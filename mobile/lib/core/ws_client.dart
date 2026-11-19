import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as IO;

import '../config/env.dart';

/// Socket.IO 실시간 클라이언트.
/// 재연결 시 `onReconnected` 콜백으로 chat:sync를 호출해 누락 메시지를 채운다.
class WsClient {
  IO.Socket? _socket;
  final _messageController = StreamController<Map<String, dynamic>>.broadcast();
  final _noteController = StreamController<Map<String, dynamic>>.broadcast();
  final _connectionController = StreamController<bool>.broadcast();
  String? _token;
  bool _manualClose = false;

  Stream<Map<String, dynamic>> get messages => _messageController.stream;
  Stream<Map<String, dynamic>> get notes => _noteController.stream;
  Stream<bool> get connection => _connectionController.stream;
  bool get connected => _socket?.connected ?? false;

  void Function()? onReconnected;

  Future<void> connect(String token) async {
    _token = token;
    _manualClose = false;
    _socket?.dispose();
    final socket = IO.io(
      Env.wsUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(1500)
          .build(),
    );
    _socket = socket;
    socket.onConnect((_) => _connectionController.add(true));
    socket.onDisconnect((_) => _connectionController.add(false));
    socket.on('auth:error', (_) => _connectionController.add(false));
    socket.on('message:new', (data) {
      if (data is Map) _messageController.add(Map<String, dynamic>.from(data));
    });
    socket.on('note:request', (data) {
      if (data is Map) _noteController.add(Map<String, dynamic>.from(data));
    });
    socket.on('note:accepted', (data) {
      if (data is Map) _noteController.add(Map<String, dynamic>.from(data));
    });
    socket.io.on('reconnect', (_) {
      _connectionController.add(true);
      onReconnected?.call();
    });
    socket.connect();
  }

  Future<void> join(String roomId) async {
    if (_socket == null || !_socket!.connected) return;
    _socket!.emitWithAck('room:join', {'roomId': roomId}, ack: (_) {});
  }

  Future<Map<String, dynamic>> sendMessage({
    required String roomId,
    required String clientMessageId,
    String type = 'TEXT',
    String? body,
    String? mediaId,
  }) async {
    final socket = _socket;
    if (socket == null || !socket.connected) {
      return {'ok': false, 'error': {'code': 'OFFLINE', 'message': '오프라인 상태입니다.'}};
    }
    final completer = Completer<Map<String, dynamic>>();
    socket.emitWithAck('message:send', {
      'roomId': roomId,
      'clientMessageId': clientMessageId,
      'type': type,
      'body': body,
      'mediaId': mediaId,
    }, ack: (data) {
      if (data is Map) {
        completer.complete(Map<String, dynamic>.from(data));
      } else {
        completer.complete({'ok': false, 'error': {'code': 'BAD_ACK', 'message': '응답을 확인할 수 없습니다.'}});
      }
    });
    return completer.future.timeout(const Duration(seconds: 8), onTimeout: () {
      return {'ok': false, 'error': {'code': 'TIMEOUT', 'message': '전송 확인이 지연되고 있습니다.'}};
    });
  }

  Future<List<Map<String, dynamic>>> sync({required String roomId, required int afterSeq}) async {
    final socket = _socket;
    if (socket == null || !socket.connected) return const [];
    final completer = Completer<List<Map<String, dynamic>>>();
    socket.emitWithAck('chat:sync', {'roomId': roomId, 'afterSeq': '$afterSeq'}, ack: (data) {
      if (data is Map && data['ok'] == true) {
        final list = (data['messages'] as List?) ?? const [];
        completer.complete(list.map((e) => Map<String, dynamic>.from(e as Map)).toList());
      } else {
        completer.complete(const []);
      }
    });
    return completer.future.timeout(const Duration(seconds: 8), onTimeout: () => const []);
  }

  Future<void> markRead(String roomId, int seq) async {
    final socket = _socket;
    if (socket == null) return;
    socket.emit('message:read', {'roomId': roomId, 'seq': '$seq'});
  }

  void disconnect() {
    _manualClose = true;
    _socket?.dispose();
    _socket = null;
  }

  void dispose() {
    _manualClose = true;
    _socket?.dispose();
    _messageController.close();
    _noteController.close();
    _connectionController.close();
  }
}
