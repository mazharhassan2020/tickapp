import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:tickai_mobile/core/api_client.dart';
import 'package:tickai_mobile/core/token_store.dart';

/// In-memory stand-in for the keychain.
class FakeTokenStore extends TokenStore {
  // Every method that would touch the keychain is overridden below, so the
  // real storage instance is never actually used.
  FakeTokenStore({this.refresh = 'refresh-1', this.validAccess = false})
      : super(storage: const FlutterSecureStorage());

  String? refresh;
  bool validAccess;
  String? _access = 'access-1';
  int saves = 0;

  @override
  String? get accessToken => _access;

  @override
  bool get hasValidAccessToken => validAccess;

  @override
  Future<void> load() async {}

  @override
  Future<String?> readRefreshToken() async => refresh;

  @override
  Future<void> save({
    required String accessToken,
    required String refreshToken,
    required int expiresInSeconds,
    Map<String, dynamic>? user,
  }) async {
    saves++;
    _access = accessToken;
    refresh = refreshToken;
    validAccess = true;
  }

  @override
  Future<void> clear() async {
    _access = null;
    refresh = null;
    validAccess = false;
  }
}

/// Counts refresh calls and serves scripted responses.
class ScriptedAdapter implements HttpClientAdapter {
  ScriptedAdapter({required this.onRequest});

  final Future<ResponseBody> Function(RequestOptions options) onRequest;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? body,
          Future<void>? cancelFuture) =>
      onRequest(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, int status) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  test('a token that is already valid is used without refreshing', () async {
    final tokens = FakeTokenStore(validAccess: true);
    var refreshes = 0;
    String? sentAuth;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(onRequest: (o) async {
      if (o.path.contains('/token/refresh')) refreshes++;
      sentAuth = o.headers['Authorization'] as String?;
      return _json({'ok': true}, 200);
    });

    final api = ApiClient(tokens: tokens, dio: dio);
    await api.raw.get('/api/conversations');

    expect(refreshes, 0);
    expect(sentAuth, 'Bearer access-1');
  });

  test('an expired token is refreshed before the request goes out', () async {
    final tokens = FakeTokenStore(validAccess: false);
    var refreshes = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(onRequest: (o) async {
      if (o.path.contains('/token/refresh')) {
        refreshes++;
        return _json({
          'accessToken': 'access-2',
          'refreshToken': 'refresh-2',
          'expiresIn': 900,
        }, 200);
      }
      return _json({'ok': true}, 200);
    });

    final api = ApiClient(tokens: tokens, dio: dio);
    await api.raw.get('/api/conversations');

    expect(refreshes, 1);
    expect(tokens.accessToken, 'access-2');
  });

  test('concurrent requests share a single refresh', () async {
    // This is the important one. The server rotates refresh tokens and treats a
    // replayed one as a compromise by signing out every device, so firing one
    // refresh per in-flight request would log the user out of everything.
    final tokens = FakeTokenStore(validAccess: false);
    var refreshes = 0;
    final refreshGate = Completer<void>();

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(onRequest: (o) async {
      if (o.path.contains('/token/refresh')) {
        refreshes++;
        // Hold the refresh open so all five requests pile up behind it.
        await refreshGate.future;
        return _json({
          'accessToken': 'access-2',
          'refreshToken': 'refresh-2',
          'expiresIn': 900,
        }, 200);
      }
      return _json({'ok': true}, 200);
    });

    final api = ApiClient(tokens: tokens, dio: dio);
    final inFlight = List.generate(5, (_) => api.raw.get('/api/conversations'));
    await Future.delayed(Duration.zero);
    refreshGate.complete();
    await Future.wait(inFlight);

    expect(refreshes, 1, reason: 'five requests must trigger one refresh');
    expect(tokens.saves, 1);
  });

  test('a failed refresh clears the session and reports it once', () async {
    final tokens = FakeTokenStore(validAccess: false);
    var expiredCalls = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(onRequest: (o) async {
      if (o.path.contains('/token/refresh')) {
        return _json({'error': 'Invalid refresh token'}, 401);
      }
      return _json({'ok': true}, 200);
    });

    final api = ApiClient(tokens: tokens, dio: dio)
      ..onSessionExpired = () => expiredCalls++;

    await expectLater(
      api.raw.get('/api/conversations'),
      throwsA(isA<DioException>()),
    );
    expect(expiredCalls, 1);
    expect(tokens.accessToken, isNull, reason: 'tokens must be wiped');
  });

  test('a network failure during refresh does NOT sign the user out', () async {
    // A phone loses signal constantly. Treating an unreachable server the same
    // as a rejected token would sign people out every time they go through a
    // tunnel, and they would have to retype their password to get back in.
    final tokens = FakeTokenStore(validAccess: false);
    var expiredCalls = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(onRequest: (o) async {
      throw DioException.connectionError(
        requestOptions: o,
        reason: 'no route to host',
      );
    });

    final api = ApiClient(tokens: tokens, dio: dio)
      ..onSessionExpired = () => expiredCalls++;

    await expectLater(
      api.raw.get('/api/conversations'),
      throwsA(isA<DioException>()),
    );
    expect(expiredCalls, 0, reason: 'a dead network is not an expired session');
    expect(tokens.refresh, isNotNull, reason: 'the refresh token must survive');
  });

  test('a 5xx during refresh keeps the session too', () async {
    final tokens = FakeTokenStore(validAccess: false);
    var expiredCalls = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(
      onRequest: (o) async => _json({'error': 'boom'}, 503),
    );

    final api = ApiClient(tokens: tokens, dio: dio)
      ..onSessionExpired = () => expiredCalls++;

    await expectLater(
      api.raw.get('/api/conversations'),
      throwsA(isA<DioException>()),
    );
    expect(expiredCalls, 0, reason: 'a server outage is not an expired session');
    expect(tokens.refresh, isNotNull);
  });

  test('no stored refresh token fails fast without a network call', () async {
    final tokens = FakeTokenStore(refresh: null, validAccess: false);
    var requests = 0;

    final dio = Dio(BaseOptions(baseUrl: 'https://example.test'));
    dio.httpClientAdapter = ScriptedAdapter(onRequest: (o) async {
      requests++;
      return _json({'ok': true}, 200);
    });

    final api = ApiClient(tokens: tokens, dio: dio);
    await expectLater(
      api.raw.get('/api/conversations'),
      throwsA(isA<DioException>()),
    );
    expect(requests, 0);
  });
}
