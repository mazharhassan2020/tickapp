import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'core/theme.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/inbox/conversations_screen.dart';

void main() {
  runApp(const ProviderScope(child: TickAiApp()));
}

class TickAiApp extends StatelessWidget {
  const TickAiApp({super.key});

  /// The panel's primary colour.
  static const _seed = Color(0xFF599ED3);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TickAi Inbox',
      debugShowCheckedModeBanner: false,
      theme: _theme(Brightness.light),
      darkTheme: _theme(Brightness.dark),
      home: const _Root(),
    );
  }

  /// One builder for both brightnesses so the two themes cannot drift apart.
  ///
  /// The inbox palette rides along as a theme extension; widgets read it via
  /// `context.inbox` rather than hardcoding colours, which is what kept the
  /// chat screen light on a dark phone before.
  static ThemeData _theme(Brightness brightness) {
    final dark = brightness == Brightness.dark;
    final palette = dark ? InboxPalette.dark : InboxPalette.light;
    final scheme = ColorScheme.fromSeed(
      seedColor: _seed,
      brightness: brightness,
    ).copyWith(
      surface: palette.surface,
      primary: dark ? palette.sendButton : _seed,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: palette.surface,
      extensions: [palette],
      appBarTheme: AppBarTheme(
        backgroundColor: palette.surface,
        surfaceTintColor: palette.surface,
        foregroundColor: palette.bubbleText,
        elevation: dark ? 0 : 1,
        scrolledUnderElevation: dark ? 0 : 1,
      ),
      dividerColor: palette.divider,
      listTileTheme: ListTileThemeData(
        textColor: palette.bubbleText,
        iconColor: palette.mutedText,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: palette.surface,
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: palette.surface,
        surfaceTintColor: palette.surface,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: palette.composerField,
        hintStyle: TextStyle(color: palette.mutedText),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: palette.divider),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: palette.divider),
        ),
      ),
    );
  }
}

/// Decides between login and the inbox, and restores any stored session once
/// at startup.
class _Root extends ConsumerStatefulWidget {
  const _Root();

  @override
  ConsumerState<_Root> createState() => _RootState();
}

class _RootState extends ConsumerState<_Root> {
  @override
  void initState() {
    super.initState();
    // Deferred to after the first frame: reading the keychain is async, and
    // touching providers during initState would fire before the tree is ready.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(authControllerProvider.notifier).restore();
    });
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(authControllerProvider).status;

    return switch (status) {
      AuthStatus.unknown => const Scaffold(
          body: Center(child: CircularProgressIndicator()),
        ),
      AuthStatus.signedOut => const LoginScreen(),
      AuthStatus.signedIn => const ConversationsScreen(),
    };
  }
}
