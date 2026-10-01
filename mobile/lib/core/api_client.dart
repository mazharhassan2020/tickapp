import 'dart:async';

import 'package:dio/dio.dart';

import 'config.dart';
import 'token_store.dart';

/// Raised when the session is gone for good and the user must sign in again.
class SessionExpired implements Exception {
  const SessionExpired();
}

/// HTTP client for the TickAi API.
///
/// Attaches the access token, and refreshes it transparently so screens never
/// have to think about expiry. Two refresh concerns are handled here:
///
///   - a token about to lapse is renewed *before* the request goes out, so a
///     request cannot fail simply because it was unlucky with timing
///   - concurrent 401s share one refresh. Without that, opening the app with
///     several widgets fetching at once would fire a refresh per request, and
///     because the server rotates refresh tokens, the later ones would present
///     an already-spent token - which the server treats as a replay and
///     responds to by signing every device out.
class ApiClient {
  ApiClient({required this.tokens, Dio? dio})
      :
        _dio = dio ??
            Dio(BaseOptions(
              baseUrl: AppConfig.baseUrl,
              connectTimeout: const Duration(seconds: 15),
              receiveTimeout: const Duration(seconds: 30),
              // Let non-2xx through so handlers can read the server's message
              // instead of a bare DioException.
              validateStatus: (code) => code != null && code < 500,
              headers: {'Accept': 'application/json'},
            )) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: _onRequest,
      onError: _onError,
    ));
  }

  final Dio _dio;
  final TokenStore tokens;

  /// Set by the app so an unrecoverable refresh failure can route to login.
  void Function()? onSessionExpired;

  Future<void>? _refreshInFlight;

  Dio get raw => _dio;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (!_isAuthEndpoint(options.path)) {
      if (!tokens.hasValidAccessToken) {
        // Expired, or close enough that it may lapse in flight.
        try {
          await _refresh();
        } on SessionExpired {
          return handler.reject(DioException(
            requestOptions: options,
            error: const SessionExpired(),
            type: DioExceptionType.cancel,
          ));
        }
      }
      final token = tokens.accessToken;
      if (token != null) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final response = err.response;
    final isRetry = err.requestOptions.extra['__retried'] == true;

    // A 401 on a token we believed was valid means it was revoked server-side
    // (permission change, or another device triggered a replay revocation).
    if (response?.statusCode == 401 &&
        !isRetry &&
        !_isAuthEndpoint(err.requestOptions.path)) {
      try {
        await _refresh();
      } on SessionExpired {
        return handler.reject(err);
      }
      final options = err.requestOptions
        ..extra['__retried'] = true
        ..headers['Authorization'] = 'Bearer ${tokens.accessToken}';
      try {
        final retried = await _dio.fetch(options);
        return handler.resolve(retried);
      } on DioException catch (e) {
        return handler.reject(e);
      }
    }
    handler.next(err);
  }

  bool _isAuthEndpoint(String path) =>
      path.contains('/api/auth/token') || path.contains('/api/auth/login');

  /// Refresh, collapsing concurrent callers onto a single request.
  Future<void> _refresh() {
    return _refreshInFlight ??= _doRefresh().whenComplete(() {
      _refreshInFlight = null;
    });
  }

  Future<void> _doRefresh() async {
    final refreshToken = await tokens.readRefreshToken();
    if (refreshToken == null) {
      await _failSession();
      throw const SessionExpired();
    }

    Response<Map<String, dynamic>> res;
    try {
      // Sent through the same client - both interceptors bail out early for
      // /api/auth/token paths, so this cannot recurse, and reusing the client
      // means the refresh honours whatever adapter, proxy or base URL the rest
      // of the app is configured with.
      res = await _dio.post<Map<String, dynamic>>(
        '/api/auth/token/refresh',
        data: {'refreshToken': refreshToken},
      );
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        // The server rejected the token: it is spent, revoked or expired.
        await _failSession();
        throw const SessionExpired();
      }
      // Anything else - no connection, timeout, 5xx - is transient. Signing
      // the user out because their train went into a tunnel would be wrong,
      // so the session is kept and the caller sees the network error.
      rethrow;
    }

    final status = res.statusCode;
    if (status == 401 || status == 403) {
      await _failSession();
      throw const SessionExpired();
    }
    if (status != 200 || res.data == null) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Unexpected refresh response',
      );
    }

    final data = res.data!;
    final access = data['accessToken'];
    final refresh = data['refreshToken'];
    if (access is! String || refresh is! String) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Malformed refresh response',
      );
    }

    await tokens.save(
      accessToken: access,
      refreshToken: refresh,
      expiresInSeconds: _expiryWithSkew(data['expiresIn']),
    );
  }

  Future<void> _failSession() async {
    await tokens.clear();
    onSessionExpired?.call();
  }

  static int _expiryWithSkew(Object? expiresIn) {
    final seconds = expiresIn is int ? expiresIn : 900;
    final skewed = seconds - AppConfig.refreshSkew.inSeconds;
    return skewed > 30 ? skewed : seconds;
  }
}
