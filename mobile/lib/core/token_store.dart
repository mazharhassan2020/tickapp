import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the session lives between launches.
///
/// Both tokens go in the platform keychain/keystore rather than
/// SharedPreferences: the refresh token is a 60-day credential, and on a rooted
/// or jailbroken device plain preferences are readable by other apps.
class TokenStore {
  TokenStore({FlutterSecureStorage? storage})
      : _storage = storage ??
            const FlutterSecureStorage(
              // Android storage is AES-GCM encrypted by default in v11, so the
              // defaults are what we want. On iOS, first_unlock lets a
              // background refresh read the token after a reboot without the
              // device having been unlocked again.
              iOptions: IOSOptions(
                accessibility: KeychainAccessibility.first_unlock,
              ),
            );

  final FlutterSecureStorage _storage;

  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kExpiry = 'access_expires_at';
  static const _kUser = 'user_json';

  String? _accessToken;
  DateTime? _accessExpiry;

  /// Cached in memory so the hot path does not touch the keychain on every
  /// request; the keychain is only read once at startup.
  String? get accessToken => _accessToken;

  bool get hasValidAccessToken {
    final token = _accessToken;
    final expiry = _accessExpiry;
    if (token == null || expiry == null) return false;
    return DateTime.now().isBefore(expiry);
  }

  Future<void> load() async {
    _accessToken = await _storage.read(key: _kAccess);
    final raw = await _storage.read(key: _kExpiry);
    _accessExpiry = raw == null ? null : DateTime.tryParse(raw);
  }

  Future<String?> readRefreshToken() => _storage.read(key: _kRefresh);

  Future<Map<String, dynamic>?> readUser() async {
    final raw = await _storage.read(key: _kUser);
    if (raw == null) return null;
    try {
      return jsonDecode(raw) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> save({
    required String accessToken,
    required String refreshToken,
    required int expiresInSeconds,
    Map<String, dynamic>? user,
  }) async {
    _accessToken = accessToken;
    _accessExpiry = DateTime.now().add(Duration(seconds: expiresInSeconds));
    await _storage.write(key: _kAccess, value: accessToken);
    await _storage.write(key: _kRefresh, value: refreshToken);
    await _storage.write(key: _kExpiry, value: _accessExpiry!.toIso8601String());
    if (user != null) {
      await _storage.write(key: _kUser, value: jsonEncode(user));
    }
  }

  Future<void> clear() async {
    _accessToken = null;
    _accessExpiry = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kExpiry);
    await _storage.delete(key: _kUser);
  }
}
