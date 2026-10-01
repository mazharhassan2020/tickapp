import 'dart:async';

import 'package:dio/dio.dart';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/socket_service.dart';
import '../../models/models.dart';
import 'conversations_controller.dart';

class ChatState {
  const ChatState({
    this.messages = const [],
    this.loading = true,
    this.sending = false,
    this.error,
  });

  final List<Message> messages;
  final bool loading;
  final bool sending;
  final String? error;

  ChatState copyWith({
    List<Message>? messages,
    bool? loading,
    bool? sending,
    String? error,
  }) =>
      ChatState(
        messages: messages ?? this.messages,
        loading: loading ?? this.loading,
        sending: sending ?? this.sending,
        error: error,
      );
}

/// Drives one open chat.
///
/// Deliberately not a provider family: Riverpod 3 only exposes a family
/// argument to generated notifiers, and a phone shows a single thread at a
/// time, so the screen opens and closes this one controller instead.
class ChatController extends Notifier<ChatState> {
  String? _conversationId;
  StreamSubscription<RealtimeEvent>? _sub;

  /// Counter for optimistic bubble ids, so each is distinct before the server
  /// assigns a real one.
  int _localSeq = 0;

  String get conversationId => _conversationId ?? '';

  @override
  ChatState build() {
    _sub = ref.read(socketServiceProvider).events.listen(_onEvent);
    ref.onDispose(() => _sub?.cancel());
    return const ChatState();
  }

  /// Point the controller at a thread and load it.
  Future<void> open(String conversationId) async {
    final socket = ref.read(socketServiceProvider);
    if (_conversationId != null && _conversationId != conversationId) {
      socket.leaveConversation(_conversationId!);
    }
    _conversationId = conversationId;
    socket.joinConversation(conversationId);
    state = const ChatState();
    await load();
  }

  void close() {
    final id = _conversationId;
    if (id != null) {
      ref.read(socketServiceProvider).leaveConversation(id);
      _conversationId = null;
    }
  }

  void _onEvent(RealtimeEvent event) {
    final convId =
        (event.payload['conversationId'] ?? event.payload['conversation_id'])
            ?.toString();

    switch (event.kind) {
      case RealtimeKind.newMessage:
        // Events for other threads arrive on the same socket; ignore them.
        if (convId != null && convId != conversationId) return;
        final row = event.payload['message'] is Map
            ? (event.payload['message'] as Map).cast<String, dynamic>()
            : event.payload;
        if (row['id'] == null) return;
        _upsert(Message.fromJson(row));
        break;

      case RealtimeKind.statusUpdate:
        final id = (event.payload['messageId'] ??
                event.payload['message_id'] ??
                event.payload['id'])
            ?.toString();
        final status = event.payload['status'];
        if (id == null || status == null) return;
        _applyStatus(id, status);
        break;

      case RealtimeKind.conversationUpdated:
      case RealtimeKind.messagesRead:
        break;
    }
  }

  /// Insert, or replace if we already hold that message.
  ///
  /// A reply we just sent optimistically also comes back over the socket, so
  /// the matching local bubble is replaced rather than duplicated.
  void _upsert(Message incoming) {
    final messages = [...state.messages];

    final byId = messages.indexWhere((m) => m.id == incoming.id);
    if (byId != -1) {
      messages[byId] = incoming;
      state = state.copyWith(messages: messages);
      return;
    }

    if (incoming.isOutbound) {
      final pending = messages.indexWhere((m) =>
          m.pendingLocally &&
          m.isOutbound &&
          m.content.trim() == incoming.content.trim());
      if (pending != -1) {
        messages[pending] = incoming;
        state = state.copyWith(messages: messages);
        return;
      }
    }

    messages.add(incoming);
    messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    state = state.copyWith(messages: messages);
  }

  void _applyStatus(String messageId, Object status) {
    final messages = state.messages.map((m) {
      if (m.id != messageId) return m;
      final next = Message.fromJson({
        'id': m.id,
        'content': m.content,
        'direction': m.isOutbound ? 'outbound' : 'inbound',
        'status': status,
        'createdAt': m.createdAt.toIso8601String(),
        'type': m.type,
      });
      // Never walk a tick backwards: 'sent' arriving after 'read' is just an
      // out-of-order webhook, not the message becoming less delivered.
      return next.status.index >= m.status.index ? next : m;
    }).toList();
    state = state.copyWith(messages: messages);
  }

  Future<void> load() async {
    final id = _conversationId;
    if (id == null) return;
    state = state.copyWith(loading: true, error: null);
    try {
      final messages =
          await ref.read(inboxRepositoryProvider).fetchMessages(id);
      state = ChatState(messages: messages, loading: false);
      await ref.read(conversationsControllerProvider.notifier).markRead(id);
    } catch (_) {
      state = state.copyWith(loading: false, error: 'Could not load messages');
    }
  }

  Future<void> send(String text) async {
    final id = _conversationId;
    final content = text.trim();
    if (id == null || content.isEmpty || state.sending) return;

    // Show the bubble immediately; WhatsApp sends take a moment and a chat
    // that does nothing on tap feels broken.
    final localId = 'local-${_localSeq++}';
    final optimistic = Message(
      id: localId,
      content: content,
      isOutbound: true,
      status: MessageStatus.pending,
      createdAt: DateTime.now(),
      pendingLocally: true,
    );
    state = state.copyWith(
      messages: [...state.messages, optimistic],
      sending: true,
      error: null,
    );

    try {
      final saved = await ref.read(inboxRepositoryProvider).sendMessage(
            conversationId: id,
            content: content,
          );
      final messages = [...state.messages];
      final i = messages.indexWhere((m) => m.id == localId);
      if (i != -1) {
        messages[i] = saved ??
            optimistic.copyWith(
              status: MessageStatus.sent,
              pendingLocally: false,
            );
      }
      state = state.copyWith(messages: messages, sending: false);
    } catch (e) {
      // Leave the bubble in place marked failed, so the text is not lost.
      final messages = [...state.messages];
      final i = messages.indexWhere((m) => m.id == localId);
      if (i != -1) {
        messages[i] = optimistic.copyWith(
          status: MessageStatus.failed,
          pendingLocally: false,
        );
      }
      state = state.copyWith(
        messages: messages,
        sending: false,
        error: 'Message not sent. Tap to retry.',
      );
    }
  }

  /// Send a file. Shown optimistically like a text message, with the file name
  /// standing in for the body until the server returns the real row.
  Future<void> sendMedia({
    required String filePath,
    required String fileName,
    String caption = '',
  }) async {
    final id = _conversationId;
    if (id == null || state.sending) return;

    final localId = 'local-${_localSeq++}';
    final optimistic = Message(
      id: localId,
      content: caption.isEmpty ? fileName : caption,
      isOutbound: true,
      status: MessageStatus.pending,
      createdAt: DateTime.now(),
      type: 'document',
      pendingLocally: true,
    );
    state = state.copyWith(
      messages: [...state.messages, optimistic],
      sending: true,
      error: null,
    );

    try {
      final saved = await ref.read(inboxRepositoryProvider).sendMedia(
            conversationId: id,
            filePath: filePath,
            fileName: fileName,
            caption: caption,
          );
      final messages = [...state.messages];
      final i = messages.indexWhere((m) => m.id == localId);
      if (i != -1) {
        messages[i] = saved ??
            optimistic.copyWith(
              status: MessageStatus.sent,
              pendingLocally: false,
            );
      }
      state = state.copyWith(messages: messages, sending: false);
    } catch (e) {
      final messages = [...state.messages];
      final i = messages.indexWhere((m) => m.id == localId);
      if (i != -1) {
        messages[i] = optimistic.copyWith(
          status: MessageStatus.failed,
          pendingLocally: false,
        );
      }
      state = state.copyWith(
        messages: messages,
        sending: false,
        error: _messageOf(e) ?? 'File not sent.',
      );
    }
  }

  /// Send an approved template — the only thing WhatsApp accepts once the
  /// 24-hour window has closed.
  Future<bool> sendTemplate({
    required Conversation conversation,
    required MessageTemplate template,
    required List<String> parameters,
  }) async {
    final id = _conversationId;
    final channelId = conversation.channelId;
    if (id == null || state.sending) return false;
    if (channelId == null || channelId.isEmpty) {
      state = state.copyWith(
        error: 'This conversation has no channel, so no template can be sent.',
      );
      return false;
    }

    final localId = 'local-${_localSeq++}';
    final optimistic = Message(
      id: localId,
      content: template.resolvedBody(parameters),
      isOutbound: true,
      status: MessageStatus.pending,
      createdAt: DateTime.now(),
      type: 'template',
      pendingLocally: true,
    );
    state = state.copyWith(
      messages: [...state.messages, optimistic],
      sending: true,
      error: null,
    );

    try {
      await ref.read(inboxRepositoryProvider).sendTemplate(
            conversationId: id,
            phoneNumber: conversation.contactPhone,
            channelId: channelId,
            templateName: template.name,
            parameters: parameters,
          );
      final messages = [...state.messages];
      final i = messages.indexWhere((m) => m.id == localId);
      if (i != -1) {
        messages[i] = optimistic.copyWith(
          status: MessageStatus.sent,
          pendingLocally: false,
        );
      }
      state = state.copyWith(messages: messages, sending: false);
      return true;
    } catch (e) {
      final messages = [...state.messages];
      final i = messages.indexWhere((m) => m.id == localId);
      if (i != -1) {
        messages[i] = optimistic.copyWith(
          status: MessageStatus.failed,
          pendingLocally: false,
        );
      }
      state = state.copyWith(
        messages: messages,
        sending: false,
        error: _messageOf(e) ?? 'Template not sent.',
      );
      return false;
    }
  }

  /// Surface the server's own wording where there is one - "template not
  /// approved" or a Meta error code is far more useful than a generic failure.
  static String? _messageOf(Object error) {
    if (error is DioException) {
      final body = error.response?.data;
      if (body is Map) {
        final e = body['error'] ?? body['message'];
        if (e is String && e.isNotEmpty) return e;
      }
      if (error.message != null && error.message!.isNotEmpty) {
        return error.message;
      }
    }
    return null;
  }

}

final chatControllerProvider =
    NotifierProvider<ChatController, ChatState>(ChatController.new);
