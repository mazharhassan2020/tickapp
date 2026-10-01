import 'package:flutter/material.dart';

/// The inbox palette, as a theme extension.
///
/// The light values are lifted from the web panel's inbox so the two feel like
/// one product. The dark values are the equivalents for a dark surface - the
/// panel has no dark mode to copy, so these follow the WhatsApp dark palette
/// the chat UI is modelled on, keeping the brand green for the send button.
///
/// Widgets read this instead of hardcoding colours, which is what previously
/// left the chat screen stuck in light mode on a dark phone.
@immutable
class InboxPalette extends ThemeExtension<InboxPalette> {
  const InboxPalette({
    required this.outgoingBubble,
    required this.outgoingBubbleBorder,
    required this.incomingBubble,
    required this.threadBackground,
    required this.composerBackground,
    required this.composerField,
    required this.surface,
    required this.sendButton,
    required this.warningBackground,
    required this.warningBorder,
    required this.warningTitle,
    required this.warningBody,
    required this.tickGrey,
    required this.tickRead,
    required this.tickFailed,
    required this.bubbleText,
    required this.mutedText,
    required this.divider,
    required this.failedBubble,
  });

  final Color outgoingBubble;
  final Color outgoingBubbleBorder;
  final Color incomingBubble;
  final Color threadBackground;
  final Color composerBackground;
  final Color composerField;
  final Color surface;
  final Color sendButton;
  final Color warningBackground;
  final Color warningBorder;
  final Color warningTitle;
  final Color warningBody;
  final Color tickGrey;
  final Color tickRead;
  final Color tickFailed;
  final Color bubbleText;
  final Color mutedText;
  final Color divider;
  final Color failedBubble;

  /// Matches the web panel: MessageItem.tsx and MessageThread.tsx.
  static const light = InboxPalette(
    outgoingBubble: Color(0xFFC5E8B0),
    outgoingBubbleBorder: Color(0xFFA8D98A),
    incomingBubble: Color(0xFFF3F4F6),
    threadBackground: Color(0xFFF0F2F5),
    composerBackground: Colors.white,
    composerField: Colors.white,
    surface: Colors.white,
    sendButton: Color(0xFF10B981),
    warningBackground: Color(0xFFFEFCE8),
    warningBorder: Color(0xFFFEF08A),
    warningTitle: Color(0xFF854D0E),
    warningBody: Color(0xFFA16207),
    tickGrey: Color(0xFF9CA3AF),
    tickRead: Color(0xFF3B82F6),
    tickFailed: Color(0xFFEF4444),
    bubbleText: Color(0xFF111827),
    mutedText: Color(0xFF6B7280),
    divider: Color(0xFFE5E7EB),
    failedBubble: Color(0xFFFEE2E2),
  );

  static const dark = InboxPalette(
    outgoingBubble: Color(0xFF005C4B),
    outgoingBubbleBorder: Color(0xFF025142),
    incomingBubble: Color(0xFF202C33),
    threadBackground: Color(0xFF0B141A),
    composerBackground: Color(0xFF1F2C34),
    composerField: Color(0xFF2A3942),
    surface: Color(0xFF111B21),
    sendButton: Color(0xFF00A884),
    // A dark-surface amber that still reads as a warning without glaring.
    warningBackground: Color(0xFF2E2A1A),
    warningBorder: Color(0xFF5C4F11),
    warningTitle: Color(0xFFFDE68A),
    warningBody: Color(0xFFD9BC6A),
    tickGrey: Color(0xFF8696A0),
    tickRead: Color(0xFF53BDEB),
    tickFailed: Color(0xFFF87171),
    bubbleText: Color(0xFFE9EDEF),
    mutedText: Color(0xFF8696A0),
    divider: Color(0xFF2A3942),
    failedBubble: Color(0xFF4A2020),
  );

  @override
  InboxPalette copyWith() => this;

  @override
  InboxPalette lerp(ThemeExtension<InboxPalette>? other, double t) {
    if (other is! InboxPalette) return this;
    // Snap rather than blend: these are two distinct designs, and a
    // half-interpolated chat surface looks broken mid-animation.
    return t < 0.5 ? this : other;
  }
}

/// `context.inbox` instead of a long `Theme.of(...).extension<...>()!` chain.
extension InboxPaletteX on BuildContext {
  InboxPalette get inbox =>
      Theme.of(this).extension<InboxPalette>() ??
      (Theme.of(this).brightness == Brightness.dark
          ? InboxPalette.dark
          : InboxPalette.light);
}
