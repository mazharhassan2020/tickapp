import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/socket_service.dart';
import '../../models/models.dart';

class ConversationsState {
  const ConversationsState({
    this.items = const [],
    this.loading = true,
    this.error,
  });

  final List<Conversation> items;
  final bool loading;
  final String? error;

  int get totalUnread =>
      items.fold(0, (sum, c) => sum + c.unreadCount);

  ConversationsState copyWith({
    List<Conversation>? items,
    bool? loading,
    String? error,
  }) =>
      ConversationsState(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        error: error,
      );
}

class ConversationsController extends Notifier<ConversationsState> {
  StreamSubscription<RealtimeEvent>? _sub;

  @override
  ConversationsState build() {
    final socket = ref.read(socketServiceProvider);
    _sub = socket.events.listen(_onEvent);
    socket.connect();
    // Notifier has no dispose() to override; teardown is registered here.
    ref.onDispose(() => _sub?.cancel());

    // build() must return synchronously, so the first load is kicked off
    // without awaiting it.
    Future.microtask(refresh);
    return const ConversationsState();
  }

  /// Fold a realtime event into the list without refetching.
  ///
  /// A full refresh per incoming message would be wasteful on mobile data and
  /// would make the list jump; only the affected row is touched, and it is
  /// moved to the top so ordering stays consistent with the server's.
  void _onEvent(RealtimeEvent event) {
    switch (event.kind) {
      case RealtimeKind.newMessage:
        final convId = (event.payload['conversationId'] ??
                event.payload['conversation_id'])
            ?.toString();
        if (convId == null) {
          // Some emitters send only the message; a refresh is the safe fallback.
          refresh(silent: true);
          return;
        }
        final text = (event.payload['content'] ?? '').toString();
        final outbound =
            (event.payload['direction'] ?? '').toString() == 'outbound';
        _bump(convId, text: text, incrementUnread: !outbound);
        break;

      case RealtimeKind.messagesRead:
        final convId = (event.payload['conversationId'] ??
                event.payload['conversation_id'])
            ?.toString();
        if (convId != null) _clearUnread(convId);
        break;

      case RealtimeKind.conversationUpdated:
      case RealtimeKind.statusUpdate:
        refresh(silent: true);
        break;
    }
  }

  void _bump(String id, {required String text, required bool incrementUnread}) {
    final items = [...state.items];
    final i = items.indexWhere((c) => c.id == id);
    if (i == -1) {
      // A conversation we have not seen yet - pull it in.
      refresh(silent: true);
      return;
    }
    final existing = items.removeAt(i);
    items.insert(
      0,
      existing.copyWith(
        lastMessageText: text.isEmpty ? null : text,
        lastMessageAt: DateTime.now(),
        // Only inbound messages are unread; our own replies are not.
        unreadCount:
            incrementUnread ? existing.unreadCount + 1 : existing.unreadCount,
      ),
    );
    state = state.copyWith(items: items);
  }

  void _clearUnread(String id) {
    final items = state.items
        .map((c) => c.id == id ? c.copyWith(unreadCount: 0) : c)
        .toList();
    state = state.copyWith(items: items);
  }

  /// `silent` keeps the current list on screen while refetching, so a realtime
  /// nudge never flashes a spinner over content the user is reading.
  Future<void> refresh({bool silent = false}) async {
    if (!silent) state = state.copyWith(loading: true, error: null);
    try {
      final items = await ref.read(inboxRepositoryProvider).fetchConversations();
      state = ConversationsState(items: items, loading: false);
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: state.items.isEmpty ? 'Could not load conversations' : null,
      );
    }
  }

  Future<void> markRead(String id) async {
    _clearUnread(id);
    await ref.read(inboxRepositoryProvider).markRead(id);
  }

}

final conversationsControllerProvider =
    NotifierProvider<ConversationsController, ConversationsState>(
  ConversationsController.new,
);
