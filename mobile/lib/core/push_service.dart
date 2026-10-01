import 'dart:async';
import 'dart:io' show Platform;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_client.dart';

/// Handles a push that arrives while the app is terminated or backgrounded.
///
/// Must be a top-level function with the vm:entry-point pragma: the OS spins up
/// a fresh isolate to run it, so anything captured from the app's state is
/// unavailable here. The system already draws the notification for a message
/// carrying a `notification` block, so there is nothing to do but acknowledge
/// it - this exists so Firebase does not warn about a missing handler.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {}

/// Push notifications for the native app.
///
/// Deliberately fail-soft throughout. Three separate things can be absent:
///
///   - the Firebase config file (GoogleService-Info.plist / google-services
///     .json). Without it `Firebase.initializeApp` throws.
///   - the APNs entitlement. A free Apple team cannot have one, so iOS never
///     issues an APNs token and FCM has nothing to register.
///   - the server's Firebase service account, without which nothing can be
///     sent even if a token is stored.
///
/// None of those should stop the app working, so every failure here is logged
/// and swallowed. `status` reports what actually happened so the UI can tell
/// the user something honest instead of silently doing nothing.
enum PushStatus {
  /// Not attempted yet.
  idle,

  /// Firebase itself is unavailable - usually the config file is missing.
  unavailable,

  /// The user said no to notifications.
  denied,

  /// Permission granted but the platform never issued a token. On iOS this
  /// is what a missing push entitlement looks like.
  noToken,

  /// Token obtained and registered with the server.
  registered,

  /// Registered, but the server has no Firebase credentials to send with.
  serverNotConfigured,
}

class PushService {
  PushService(this._api);

  final ApiClient _api;

  String? _token;
  PushStatus _status = PushStatus.idle;
  StreamSubscription<String>? _refreshSub;
  StreamSubscription<RemoteMessage>? _openedSub;

  PushStatus get status => _status;
  String? get token => _token;

  /// Called when the user taps a notification, with the conversation id.
  void Function(String conversationId)? onOpenConversation;

  /// Set up Firebase and register this device.
  ///
  /// Safe to call more than once; subsequent calls just refresh the
  /// registration.
  Future<PushStatus> start() async {
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp();
      }
    } catch (e) {
      // Overwhelmingly this is a missing GoogleService-Info.plist.
      debugPrint('[push] Firebase unavailable: $e');
      return _status = PushStatus.unavailable;
    }

    try {
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);

      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        return _status = PushStatus.denied;
      }

      // Show the alert even with the app in the foreground, which is what a
      // chat app should do; otherwise iOS suppresses it entirely.
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );

      // On iOS the APNs token must exist before FCM can mint one. Without the
      // push entitlement it never arrives, so this is the check that
      // distinguishes "not entitled" from a genuine failure.
      if (Platform.isIOS) {
        final apns = await messaging.getAPNSToken();
        if (apns == null) {
          debugPrint('[push] no APNs token - the build is probably not '
              'entitled for push notifications');
          return _status = PushStatus.noToken;
        }
      }

      final token = await messaging.getToken();
      if (token == null || token.isEmpty) {
        return _status = PushStatus.noToken;
      }
      _token = token;

      final configured = await _register(token);

      // FCM rotates tokens; a stale one silently stops receiving.
      _refreshSub?.cancel();
      _refreshSub = messaging.onTokenRefresh.listen((t) {
        _token = t;
        _register(t);
      });

      _openedSub?.cancel();
      _openedSub = FirebaseMessaging.onMessageOpenedApp.listen(_handleOpen);
      // A tap that launched the app from terminated comes through separately.
      final initial = await messaging.getInitialMessage();
      if (initial != null) _handleOpen(initial);

      return _status = configured
          ? PushStatus.registered
          : PushStatus.serverNotConfigured;
    } catch (e) {
      debugPrint('[push] setup failed: $e');
      return _status = PushStatus.unavailable;
    }
  }

  void _handleOpen(RemoteMessage message) {
    final id = message.data['conversationId'];
    if (id is String && id.isNotEmpty) onOpenConversation?.call(id);
  }

  /// Returns whether the server says it can actually send.
  Future<bool> _register(String token) async {
    try {
      final res = await _api.raw.post('/api/device-tokens', data: {
        'token': token,
        'platform': Platform.isIOS ? 'ios' : 'android',
        'deviceName': await _deviceName(),
      });
      final data = res.data;
      if (data is Map && data['pushConfigured'] == false) {
        debugPrint('[push] registered, but the server has no Firebase '
            'credentials to send with');
        return false;
      }
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('[push] could not register the device: $e');
      return false;
    }
  }

  /// Drop this device's registration, so a signed-out phone stops receiving
  /// someone else's messages.
  Future<void> stop() async {
    final token = _token;
    _refreshSub?.cancel();
    _openedSub?.cancel();
    _refreshSub = null;
    _openedSub = null;
    _status = PushStatus.idle;
    if (token == null) return;
    try {
      await _api.raw.delete('/api/device-tokens', data: {'token': token});
    } catch (e) {
      debugPrint('[push] could not unregister the device: $e');
    }
    _token = null;
  }

  static Future<String> _deviceName() async {
    try {
      return Platform.localHostname;
    } catch (_) {
      return Platform.isIOS ? 'iPhone' : 'Android device';
    }
  }
}
