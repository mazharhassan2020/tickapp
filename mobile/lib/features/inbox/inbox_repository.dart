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

  /// Approved templates for the conversation's channel.
  ///
  /// The endpoint returns everything, including drafts and rejected ones, so
  /// the filtering happens here - sending an unapproved template just fails at
  /// Meta.
  Future<List<MessageTemplate>> fetchApprovedTemplates(String channelId) async {
    final res = await _api.raw.get(
      '/api/templates',
      queryParameters: {'channelId': channelId},
    );
    if (res.statusCode != 200) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Could not load templates',
      );
    }
    final rows = _listOf(res.data, 'data');
    return rows
        .map(MessageTemplate.fromJson)
        .where((t) => t.isApproved)
        .toList();
  }

  /// Send an approved template.
  ///
  /// This is the only kind of message WhatsApp accepts once the 24-hour window
  /// has closed, so it goes through /api/messages/send (the template path)
  /// rather than the conversation messages endpoint.
  Future<void> sendTemplate({
    required String conversationId,
    required String phoneNumber,
    required String channelId,
    required String templateName,
    List<String> parameters = const [],
  }) async {
    final res = await _api.raw.post(
      '/api/messages/send',
      data: {
        'to': phoneNumber,
        'templateName': templateName,
        'channelId': channelId,
        // The panel sends each parameter as {type, value}; a plain string from
        // the app is always a literal value.
        'parameters': [
          for (final p in parameters) {'type': 'custom', 'value': p},
        ],
      },
    );
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _errorOf(res.data) ?? 'Template not sent',
      );
    }
  }

  /// Send a file with an optional caption.
  ///
  /// Multipart to the same endpoint the web panel posts to, with the same field
  /// names - the server distinguishes a media message by the `media` part.
  Future<Message?> sendMedia({
    required String conversationId,
    required String filePath,
    required String fileName,
    String caption = '',
  }) async {
    final form = FormData.fromMap({
      'media': await MultipartFile.fromFile(filePath, filename: fileName),
      'fromUser': 'true',
      'conversationId': conversationId,
      'caption': caption,
    });

    final res = await _api.raw.post(
      '/api/conversations/$conversationId/messages',
      data: form,
    );
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _errorOf(res.data) ?? 'File not sent',
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

  /// Ids of pinned conversations.
  Future<Set<String>> fetchPinnedIds() async {
    final res = await _api.raw.get('/api/conversations/pins');
    if (res.statusCode != 200) return const {};
    final data = res.data;
    // Returned either as a bare array of ids, as objects, or wrapped.
    Iterable raw = const [];
    if (data is List) {
      raw = data;
    } else if (data is Map) {
      final inner = data['pins'] ?? data['data'] ?? data['conversationIds'];
      if (inner is List) raw = inner;
    }
    return raw
        .map((e) => e is Map
            ? (e['conversationId'] ?? e['id'] ?? '').toString()
            : e.toString())
        .where((e) => e.isNotEmpty)
        .toSet();
  }

  Future<void> setPinned(String conversationId, bool pinned) async {
    final path = '/api/conversations/$conversationId/pin';
    final res = pinned
        ? await _api.raw.post(path)
        : await _api.raw.delete(path);
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _errorOf(res.data) ?? 'Could not change the pin',
      );
    }
  }

  /// Change the conversation status.
  ///
  /// The server only accepts open, resolved and closed - "archived", which the
  /// web panel tries to set, is rejected, so it is not offered here.
  Future<void> setStatus(String conversationId, String status) async {
    final res = await _api.raw.patch(
      '/api/conversations/$conversationId/status',
      data: {'status': status},
    );
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _errorOf(res.data) ?? 'Could not change the status',
      );
    }
  }

  Future<void> deleteConversation(String conversationId) async {
    final res = await _api.raw.delete('/api/conversations/$conversationId');
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _errorOf(res.data) ?? 'Could not delete the conversation',
      );
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
