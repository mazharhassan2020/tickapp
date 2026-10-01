/// Build-time configuration.
///
/// Override the host without editing source:
///   flutter run --dart-define=TICKAI_BASE_URL=http://192.168.1.20:3000
///
/// A physical device cannot reach `localhost`, so pointing at a dev server
/// means using the machine's LAN address (or 10.0.2.2 on the Android emulator).
class AppConfig {
  static const String baseUrl = String.fromEnvironment(
    'TICKAI_BASE_URL',
    defaultValue: 'https://tickai.app',
  );

  /// Socket.IO shares the API origin.
  static String get socketUrl => baseUrl;

  /// Refresh an access token this long before it actually expires, so a
  /// request is never sent with a token that lapses in flight.
  static const Duration refreshSkew = Duration(minutes: 2);
}
