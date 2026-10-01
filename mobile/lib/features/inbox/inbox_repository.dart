import 'package:dio/dio.dart';

import '../../core/api_client.dart';
import '../../models/models.dart';

/// Reads and writes the inbox over the panel's existing endpoints.
class InboxRepository {
  InboxRepository(this._api);

  final ApiClient _api;

  /// The list endpoint has returned a bare array in some versions and
  /// `{conversations: [...]}` in others, so accept both rather than depending
  /// on which build the server happens to be running.
  List<Map<String, dynamic>> _listOf(Object? data, String key) {
    if (data is List) return data.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
    if (data is Map) {
      final inner = data[key];
      if (inner is List) {
        return inner.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
      }
    }
    return const [];
  }

  Future<List<Conversation>> fetchConversations() async {
    final res = await _api.raw.get('/api/conversations');
    if (res.statusCode != 200) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Could not load conversations',
      );
    }
    final rows = _listOf(res.data, 'conversations');
    final list = rows.map(Conversation.fromJson).toList();
    // Newest activity first; conversations with no messages sink to the bottom.
    list.sort((a, b) {
      final at = a.lastMessageAt;
      final bt = b.lastMessageAt;
      if (at == null && bt == null) return 0;
      if (at == null) return 1;
      if (bt == null) return -1;
      return bt.compareTo(at);
    });
    return list;
  }

  Future<List<Message>> fetchMessages(String conversationId) async {
    final res = await _api.raw.get('/api/conversations/$conversationId/messages');
    if (res.statusCode != 200) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Could not load messages',
      );
    }
    final rows = _listOf(res.data, 'messages');
    final list = rows.map(Message.fromJson).toList();
    list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  /// Send a free-text reply. Returns the server's message row when it gives
  /// one back, so the optimistic bubble can adopt the real id and status.
  Future<Message?> sendMessage({
    required String conversationId,
    required String content,
  }) async {
    final res = await _api.raw.post(
      '/api/conversations/$conversationId/messages',
      data: {'content': content, 'type': 'text'},
    );
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _errorOf(res.data) ?? 'Message not sent',
      );
    }
    final data = res.data;
    if (data is Map) {
      final row = (data['message'] ?? data['data'] ?? data);
      if (row is Map && row['id'] != null) {
        return Message.fromJson(row.cast<String, dynamic>());
      }
    }
    return null;
  }

  Future<void> markRead(String conversationId) async {
    try {
      await _api.raw.put('/api/conversations/$conversationId/read');
    } catch (_) {
      // Not worth surfacing: the badge will correct itself on next refresh.
    }
  }

  static String? _errorOf(Object? body) {
    if (body is Map) {
      final e = body['error'] ?? body['message'];
      if (e is String && e.isNotEmpty) return e;
    }
    return null;
  }
}
