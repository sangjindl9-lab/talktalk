import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import '../config/env.dart';

class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  final Map<String, dynamic>? extra;

  ApiException(this.status, this.code, this.message, [this.extra]);

  bool get isNetwork => status == 0;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({this.token});

  String? token;

  Map<String, String> get _headers => {
    'content-type': 'application/json; charset=utf-8',
    'accept': 'application/json',
    if (token != null) 'authorization': 'Bearer $token',
  };

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final base = Uri.parse('${Env.apiV1}$path');
    if (query == null || query.isEmpty) return base;
    final qp = <String, String>{};
    query.forEach((key, value) {
      if (value != null) qp[key] = '$value';
    });
    return base.replace(queryParameters: {...base.queryParameters, ...qp});
  }

  Future<dynamic> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, dynamic>? query,
  }) async {
    try {
      final uri = _uri(path, query);
      late http.Response res;
      switch (method) {
        case 'GET':
          res = await http
              .get(uri, headers: _headers)
              .timeout(const Duration(seconds: 20));
          break;
        case 'POST':
          res = await http
              .post(uri, headers: _headers, body: jsonEncode(body ?? {}))
              .timeout(const Duration(seconds: 20));
          break;
        case 'PATCH':
          res = await http
              .patch(uri, headers: _headers, body: jsonEncode(body ?? {}))
              .timeout(const Duration(seconds: 20));
          break;
        case 'PUT':
          res = await http
              .put(uri, headers: _headers, body: jsonEncode(body ?? {}))
              .timeout(const Duration(seconds: 20));
          break;
        case 'DELETE':
          res = await http
              .delete(uri, headers: _headers, body: jsonEncode(body ?? {}))
              .timeout(const Duration(seconds: 20));
          break;
        default:
          throw ApiException(0, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.');
      }
      final text = utf8.decode(res.bodyBytes);
      dynamic decoded;
      if (text.isNotEmpty) {
        try {
          decoded = jsonDecode(text);
        } catch (_) {
          decoded = {'raw': text};
        }
      }
      if (res.statusCode >= 200 && res.statusCode < 300) return decoded;
      final map = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};
      throw ApiException(
        res.statusCode,
        '${map['code'] ?? 'ERROR'}',
        '${map['message'] ?? '요청을 처리할 수 없습니다. (${res.statusCode})'}',
        map,
      );
    } on ApiException {
      rethrow;
    } on SocketException {
      throw ApiException(
        0,
        'NETWORK_ERROR',
        '네트워크에 연결할 수 없습니다. 연결 상태를 확인해 주세요.',
      );
    } catch (e) {
      throw ApiException(0, 'NETWORK_ERROR', '서버와 통신하지 못했습니다. ($e)');
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _send('GET', path, query: query);
  Future<dynamic> post(String path, {Map<String, dynamic>? body}) =>
      _send('POST', path, body: body);
  Future<dynamic> patch(String path, {Map<String, dynamic>? body}) =>
      _send('PATCH', path, body: body);
  Future<dynamic> put(String path, {Map<String, dynamic>? body}) =>
      _send('PUT', path, body: body);
  Future<dynamic> delete(String path, {Map<String, dynamic>? body}) =>
      _send('DELETE', path, body: body);

  /// 이미지 업로드 (서버에서 형식·크기 검사 후 EXIF/GPS 제거)
  Future<Map<String, dynamic>> uploadImage(
    File file, {
    String kind = 'CHAT',
  }) async {
    try {
      final uri = _uri('/media');
      final req = http.MultipartRequest('POST', uri);
      req.headers['authorization'] = 'Bearer $token';
      req.headers['accept'] = 'application/json';
      req.files.add(
        await http.MultipartFile.fromPath('file', file.path, contentType: null),
      );
      req.fields['kind'] = kind;
      final streamed = await req.send().timeout(const Duration(seconds: 60));
      final res = await http.Response.fromStream(streamed);
      final decoded = jsonDecode(utf8.decode(res.bodyBytes));
      if (res.statusCode >= 200 && res.statusCode < 300)
        return decoded as Map<String, dynamic>;
      final map = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{};
      throw ApiException(res.statusCode, '${map['code']}', '${map['message']}');
    } on ApiException {
      rethrow;
    } catch (e) {
      throw ApiException(0, 'UPLOAD_FAILED', '사진 업로드에 실패했습니다. ($e)');
    }
  }

  String absoluteMediaUrl(String? pathOrUrl) {
    if (pathOrUrl == null || pathOrUrl.isEmpty) return '';
    if (pathOrUrl.startsWith('http')) return pathOrUrl;
    return '${Env.apiBaseUrl}$pathOrUrl';
  }
}
