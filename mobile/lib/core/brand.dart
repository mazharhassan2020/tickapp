import 'package:flutter/material.dart';

/// The TickAi lockup.
///
/// Two bundled variants rather than one: the published logo's wordmark is
/// near-black navy, which disappears on a dark surface, so the dark asset has
/// that text recoloured to the palette's text colour. The blue tick is
/// identical in both.
///
/// Bundled rather than fetched from /api/brand-settings so the login screen
/// renders instantly and offline. The trade-off is that a white-label rebrand
/// in the panel will not follow through to the app automatically.
class TickAiLogo extends StatelessWidget {
  const TickAiLogo({super.key, this.height = 56});

  final double height;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Image.asset(
      dark ? 'assets/tickai-logo-dark.png' : 'assets/tickai-logo.png',
      height: height,
      fit: BoxFit.contain,
      // A missing asset should not take the login screen down with it.
      errorBuilder: (context, _, _) => Icon(
        Icons.chat_bubble_rounded,
        size: height,
        color: Theme.of(context).colorScheme.primary,
      ),
    );
  }
}
