import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

import 'config.dart';
import 'token_store.dart';

/// A realtime event the inbox cares about, normalised from the server's
/// several naming conventions for the same thing.
class RealtimeEvent {
  const RealtimeEvent(this.kind, this.payload);

  final RealtimeKind kind;
  final Map<String, dynamic> payload;
}

enum RealtimeKind { newMessage, statusUpdate, conversationUpdated, messagesRead }

/// Socket.IO connection to the panel.
///
/// The server emits the same logical event under more than one name
/// (`new_message` and `new-message`, for instance) depending on which code
/// path produced it, so every spelling is subscribed and folded into one
/// stream rather than leaving that mess to the UI.
class SocketService {
  SocketService({required this.tokens});

  final TokenStore tokens;
  io.Socket? _socket;

  final _events = StreamController<RealtimeEvent>.broadcast();
  Stream<RealtimeEvent> get events => _events.stream;

  final _connected = StreamController<bool>.broadcast();
  Stream<bool> get connectionState => _connected.stream;

  bool get isConnected => _socket?.connected ?? false;

  static const _eventMap = <String, RealtimeKind>{
    'new_message': RealtimeKind.newMessage,
    'new-message': RealtimeKind.newMessage,
    'message_sent': RealtimeKind.newMessage,
    'message_status_update': RealtimeKind.statusUpdate,
    'conversation_updated': RealtimeKind.conversationUpdated,
    'conversation_created': RealtimeKind.conversationUpdated,
    'messages_read': RealtimeKind.messagesRead,
  };

  Future<void> connect() async {
    if (_socket != null) return;

    final token = tokens.accessToken;

    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          // The handshake is authenticated by the access token; the server
          // verifies it and ignores any userId the client might claim.
          .setAuth({'token': token})
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionDelayMax(10000)
          .disableAutoConnect()
          .build(),
    );

    _socket!
      ..onConnect((_) => _connected.add(true))
      ..onDisconnect((_) => _connected.add(false))
      ..onConnectError((_) => _connected.add(false));

    for (final entry in _eventMap.entries) {
      _socket!.on(entry.key, (data) {
        if (data is Map) {
          _events.add(RealtimeEvent(entry.value, data.cast<String, dynamic>()));
        }
      });
    }

    _socket!.connect();
  }

  /// Re-handshake with a fresh token.
  ///
  /// The access token lives 15 minutes but a socket stays open for hours, so
  /// after a refresh the connection is rebuilt - otherwise a reconnect would
  /// replay the old, now-rejected token and the socket would stay down.
  Future<void> reauthenticate() async {
    if (_socket == null) return;
    await disconnect();
    await connect();
  }

  void joinConversation(String conversationId) {
    _socket?.emit('join-room', {'room': 'conversation:$conversationId'});
  }

  void leaveConversation(String conversationId) {
    _socket?.emit('leave-room', {'room': 'conversation:$conversationId'});
  }

  Future<void> disconnect() async {
    _socket?.dispose();
    _socket = null;
    _connected.add(false);
  }

  void dispose() {
    _socket?.dispose();
    _socket = null;
    _events.close();
    _connected.close();
  }
}
