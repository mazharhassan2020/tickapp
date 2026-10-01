import 'dart:io' show Platform;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/providers.dart';
import '../../core/token_store.dart';

enum AuthStatus { unknown, signedOut, signedIn }

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.user,
    this.error,
    this.busy = false,
  });

  final AuthStatus status;
  final Map<String, dynamic>? user;
  final String? error;
  final bool busy;

  String get displayName {
    final first = (user?['firstName'] ?? '').toString().trim();
    final last = (user?['lastName'] ?? '').toString().trim();
    final full = [first, last].where((p) => p.isNotEmpty).join(' ');
    if (full.isNotEmpty) return full;
    return (user?['username'] ?? '').toString();
  }

  AuthState copyWith({
    AuthStatus? status,
    Map<String, dynamic>? user,
    String? error,
    bool? busy,
  }) =>
      AuthState(
        status: status ?? this.status,
        user: user ?? this.user,
        error: error,
        busy: busy ?? this.busy,
      );
}

/// Riverpod 3 removed StateNotifier, so controllers extend Notifier and read
/// their dependencies off `ref` rather than taking them in a constructor.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() => const AuthState();

  TokenStore get _tokens => ref.read(tokenStoreProvider);
  ApiClient get _api => ref.read(apiClientProvider);

  /// Decide at launch whether we already have a usable session.
  ///
  /// A stored refresh token is treated as signed-in without waiting on the
  /// network: the first API call will refresh if needed, and if that fails the
  /// client calls back through `onSessionExpired`. This keeps a cold start on
  /// a bad connection from bouncing the user to the login screen.
  Future<void> restore() async {
    await _tokens.load();
    final refresh = await _tokens.readRefreshToken();
    if (refresh == null) {
      state = state.copyWith(status: AuthStatus.signedOut);
      return;
    }
    state = state.copyWith(
      status: AuthStatus.signedIn,
      user: await _tokens.readUser(),
    );
  }

  Future<bool> signIn(String username, String password) async {
    state = state.copyWith(busy: true, error: null);
    try {
      final res = await _api.raw.post<Map<String, dynamic>>(
        '/api/auth/token',
        data: {
          'username': username.trim(),
          'password': password,
          'deviceName': _deviceName(),
          'platform': _platform(),
        },
      );

      final data = res.data;
      if (res.statusCode != 200 || data == null) {
        state = state.copyWith(
          busy: false,
          error: _messageFrom(data) ?? 'Sign in failed',
        );
        return false;
      }

      final user = (data['user'] as Map?)?.cast<String, dynamic>();
      await _tokens.save(
        accessToken: data['accessToken'] as String,
        refreshToken: data['refreshToken'] as String,
        expiresInSeconds: (data['expiresIn'] as num?)?.toInt() ?? 900,
        user: user,
      );

      state = AuthState(status: AuthStatus.signedIn, user: user);
      return true;
    } on DioException catch (e) {
      state = state.copyWith(
        busy: false,
        error: _messageFrom(e.response?.data) ??
            'Could not reach the server. Check your connection.',
      );
      return false;
    }
  }

  Future<void> signOut() async {
    final refresh = await _tokens.readRefreshToken();
    // Tell the server first so the refresh token is revoked rather than left
    // valid for 60 days; a network failure must not trap the user in the app.
    if (refresh != null) {
      try {
        await _api.raw.post('/api/auth/token/revoke',
            data: {'refreshToken': refresh});
      } catch (_) {/* sign out locally regardless */}
    }
    await _tokens.clear();
    state = const AuthState(status: AuthStatus.signedOut);
  }

  /// Called when a refresh fails irrecoverably.
  void onSessionExpired() {
    state = const AuthState(
      status: AuthStatus.signedOut,
      error: 'Your session expired. Please sign in again.',
    );
  }

  static String? _messageFrom(Object? body) {
    if (body is Map) {
      final err = body['error'];
      final details = body['details'];
      if (details is List && details.isNotEmpty) {
        final first = details.first;
        if (first is Map && first['message'] != null) {
          return '${first['field'] ?? 'Field'}: ${first['message']}';
        }
      }
      if (err is String && err.isNotEmpty) return err;
    }
    return null;
  }

  static String _deviceName() {
    if (kIsWeb) return 'Web';
    try {
      return Platform.localHostname;
    } catch (_) {
      return 'Mobile device';
    }
  }

  static String _platform() {
    if (kIsWeb) return 'web';
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    return 'other';
  }
}
