import 'dart:async';

import 'package:dio/dio.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/socket_service.dart';
import '../../models/models.dart';

/// The filter chips above the list, mirroring the web panel's.
enum InboxFilter { all, unread, awaiting, assigned, open, resolved }

extension InboxFilterLabel on InboxFilter {
  String get label => switch (this) {
        InboxFilter.all => 'All',
        InboxFilter.unread => 'Unread',
        InboxFilter.awaiting => 'Awaiting reply',
        InboxFilter.assigned => 'Assigned',
        InboxFilter.open => 'Open',
        InboxFilter.resolved => 'Resolved',
      };
}

class ConversationsState {
  const ConversationsState({
    this.items = const [],
    this.pinnedIds = const {},
    this.filter = InboxFilter.all,
    this.search = '',
    this.loading = true,
    this.error,
  });

  final List<Conversation> items;
  final Set<String> pinnedIds;
  final InboxFilter filter;
  final String search;
  final bool loading;
  final String? error;

  int get totalUnread => items.fold(0, (sum, c) => sum + c.unreadCount);

  bool isPinned(String id) => pinnedIds.contains(id);

  /// Whether the contact wrote last - the web panel's "awaiting reply" bucket,
  /// which is the queue an agent actually works from.
  bool awaitingReply(Conversation c) {
    final inbound = c.lastIncomingMessageAt;
    if (inbound == null) return false;
    final last = c.lastMessageAt;
    // lastMessageAt moves on every message, so if it is no newer than the
    // inbound one then the contact had the last word.
    return last == null || !last.isAfter(inbound);
  }

  /// The list as rendered: filtered, searched, pinned first, newest first.
  List<Conversation> get visible {
    final q = search.trim().toLowerCase();
    var list = items.where((c) {
      switch (filter) {
        case InboxFilter.all:
          break;
        case InboxFilter.unread:
          if (c.unreadCount == 0) return false;
        case InboxFilter.awaiting:
          if (!awaitingReply(c)) return false;
        case InboxFilter.assigned:
          if ((c.assignedTo ?? '').isEmpty) return false;
        case InboxFilter.open:
          if (c.status != 'open') return false;
        case InboxFilter.resolved:
          if (c.status != 'resolved' && c.status != 'closed') return false;
      }
      if (q.isEmpty) return true;
      return c.contactName.toLowerCase().contains(q) ||
          c.contactPhone.toLowerCase().contains(q) ||
          (c.lastMessageText ?? '').toLowerCase().contains(q);
    }).toList();

    list.sort((a, b) {
      final ap = isPinned(a.id), bp = isPinned(b.id);
      if (ap != bp) return ap ? -1 : 1;
      final at = a.lastMessageAt, bt = b.lastMessageAt;
      if (at == null && bt == null) return 0;
      if (at == null) return 1;
      if (bt == null) return -1;
      return bt.compareTo(at);
    });
    return list;
  }

  /// Per-filter counts for the chips.
  int countFor(InboxFilter f) => switch (f) {
        InboxFilter.all => items.length,
        InboxFilter.unread => items.where((c) => c.unreadCount > 0).length,
        InboxFilter.awaiting => items.where(awaitingReply).length,
        InboxFilter.assigned =>
          items.where((c) => (c.assignedTo ?? '').isNotEmpty).length,
        InboxFilter.open => items.where((c) => c.status == 'open').length,
        InboxFilter.resolved => items
            .where((c) => c.status == 'resolved' || c.status == 'closed')
            .length,
      };

  ConversationsState copyWith({
    List<Conversation>? items,
    Set<String>? pinnedIds,
    InboxFilter? filter,
    String? search,
    bool? loading,
    String? error,
  }) =>
      ConversationsState(
        items: items ?? this.items,
        pinnedIds: pinnedIds ?? this.pinnedIds,
        filter: filter ?? this.filter,
        search: search ?? this.search,
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
    final now = DateTime.now();
    items.insert(
      0,
      existing.copyWith(
        lastMessageText: text.isEmpty ? null : text,
        lastMessageAt: now,
        // Only inbound messages are unread; our own replies are not.
        unreadCount:
            incrementUnread ? existing.unreadCount + 1 : existing.unreadCount,
        // An inbound message reopens WhatsApp's 24-hour window, so this has to
        // move too - otherwise an agent watching the thread would still see a
        // disabled composer after the customer just wrote back.
        lastIncomingMessageAt:
            incrementUnread ? now : existing.lastIncomingMessageAt,
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
      final repo = ref.read(inboxRepositoryProvider);
      final items = await repo.fetchConversations();
      // Pins live in their own endpoint; failing to read them should not stop
      // the list from rendering.
      Set<String> pins = state.pinnedIds;
      try {
        pins = await repo.fetchPinnedIds();
      } catch (_) {/* keep whatever we had */}
      state = state.copyWith(
        items: items,
        pinnedIds: pins,
        loading: false,
      );
    } catch (e) {
      state = state.copyWith(
        loading: false,
        error: state.items.isEmpty ? 'Could not load conversations' : null,
      );
    }
  }

  void setFilter(InboxFilter filter) =>
      state = state.copyWith(filter: filter);

  void setSearch(String search) => state = state.copyWith(search: search);

  /// Toggle a pin, optimistically - the row jumps immediately and reverts if
  /// the server refuses (there is a cap on how many can be pinned).
  Future<String?> togglePin(String id) async {
    final wasPinned = state.isPinned(id);
    final next = {...state.pinnedIds};
    wasPinned ? next.remove(id) : next.add(id);
    state = state.copyWith(pinnedIds: next);

    try {
      await ref.read(inboxRepositoryProvider).setPinned(id, !wasPinned);
      return null;
    } catch (e) {
      final reverted = {...state.pinnedIds};
      wasPinned ? reverted.add(id) : reverted.remove(id);
      state = state.copyWith(pinnedIds: reverted);
      return _messageOf(e) ?? 'Could not change the pin';
    }
  }

  Future<String?> setStatus(String id, String status) async {
    final items = state.items
        .map((c) => c.id == id ? c.copyWith(status: status) : c)
        .toList();
    final previous = state.items;
    state = state.copyWith(items: items);
    try {
      await ref.read(inboxRepositoryProvider).setStatus(id, status);
      return null;
    } catch (e) {
      state = state.copyWith(items: previous);
      return _messageOf(e) ?? 'Could not change the status';
    }
  }

  Future<String?> deleteConversation(String id) async {
    final previous = state.items;
    state = state.copyWith(
      items: state.items.where((c) => c.id != id).toList(),
    );
    try {
      await ref.read(inboxRepositoryProvider).deleteConversation(id);
      return null;
    } catch (e) {
      state = state.copyWith(items: previous);
      return _messageOf(e) ?? 'Could not delete the conversation';
    }
  }

  static String? _messageOf(Object error) {
    if (error is DioException) {
      final body = error.response?.data;
      if (body is Map) {
        final m = body['error'] ?? body['message'];
        if (m is String && m.isNotEmpty) return m;
      }
      if ((error.message ?? '').isNotEmpty) return error.message;
    }
    return null;
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
