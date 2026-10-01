import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'features/auth/auth_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/inbox/conversations_screen.dart';

void main() {
  runApp(const ProviderScope(child: TickAiApp()));
}

class TickAiApp extends StatelessWidget {
  const TickAiApp({super.key});

  @override
  Widget build(BuildContext context) {
    const seed = Color(0xFF599ED3); // the panel's primary colour

    return MaterialApp(
      title: 'TickAi Inbox',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const _Root(),
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
