/// Wire models for the inbox.
///
/// Fields are read defensively: the API is shared with the web panel and
/// returns a wider, looser shape than the app needs (nulls where the schema
/// allows them, numbers that arrive as strings from some aggregate queries).
int _asInt(Object? v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

DateTime? _asDate(Object? v) {
  if (v is String && v.isNotEmpty) return DateTime.tryParse(v)?.toLocal();
  return null;
}

String _asString(Object? v) => v == null ? '' : v.toString();

class Conversation {
  Conversation({
    required this.id,
    required this.contactName,
    required this.contactPhone,
    required this.unreadCount,
    required this.status,
    this.lastMessageText,
    this.lastMessageAt,
    this.channelId,
    this.contactId,
    this.assignedTo,
  });

  final String id;
  final String contactName;
  final String contactPhone;
  final int unreadCount;
  final String status;
  final String? lastMessageText;
  final DateTime? lastMessageAt;
  final String? channelId;
  final String? contactId;
  final String? assignedTo;

  /// Falls back to the phone number: a contact imported from CSV often has no
  /// name, and an empty row in the list is worse than a number.
  String get displayName {
    final name = contactName.trim();
    return name.isEmpty ? contactPhone : name;
  }

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        id: _asString(json['id']),
        contactName: _asString(json['contactName'] ?? json['contact_name']),
        contactPhone: _asString(json['contactPhone'] ?? json['contact_phone']),
        unreadCount: _asInt(json['unreadCount'] ?? json['unread_count']),
        status: _asString(json['status']).isEmpty
            ? 'open'
            : _asString(json['status']),
        lastMessageText:
            json['lastMessageText'] as String? ?? json['last_message_text'] as String?,
        lastMessageAt: _asDate(json['lastMessageAt'] ?? json['last_message_at']),
        channelId: json['channelId'] as String? ?? json['channel_id'] as String?,
        contactId: json['contactId'] as String? ?? json['contact_id'] as String?,
        assignedTo: json['assignedTo'] as String? ?? json['assigned_to'] as String?,
      );

  Conversation copyWith({
    int? unreadCount,
    String? lastMessageText,
    DateTime? lastMessageAt,
    String? status,
  }) =>
      Conversation(
        id: id,
        contactName: contactName,
        contactPhone: contactPhone,
        unreadCount: unreadCount ?? this.unreadCount,
        status: status ?? this.status,
        lastMessageText: lastMessageText ?? this.lastMessageText,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
        channelId: channelId,
        contactId: contactId,
        assignedTo: assignedTo,
      );
}

/// Delivery state of an outbound message, in the order WhatsApp reports it.
enum MessageStatus { pending, sent, delivered, read, failed }

MessageStatus _statusFrom(Object? v) {
  switch (_asString(v).toLowerCase()) {
    case 'read':
      return MessageStatus.read;
    case 'delivered':
      return MessageStatus.delivered;
    case 'sent':
      return MessageStatus.sent;
    case 'failed':
      return MessageStatus.failed;
    case 'received':
      // Inbound messages have no delivery state of their own.
      return MessageStatus.delivered;
    default:
      return MessageStatus.pending;
  }
}

class Message {
  Message({
    required this.id,
    required this.content,
    required this.isOutbound,
    required this.status,
    required this.createdAt,
    this.type = 'text',
    this.mediaUrl,
    this.errorMessage,
    this.pendingLocally = false,
  });

  final String id;
  final String content;
  final bool isOutbound;
  final MessageStatus status;
  final DateTime createdAt;
  final String type;
  final String? mediaUrl;
  final String? errorMessage;

  /// True for a message shown optimistically, before the server confirms it.
  final bool pendingLocally;

  factory Message.fromJson(Map<String, dynamic> json) {
    // The API describes direction three different ways depending on the code
    // path that wrote the row, so check all of them.
    final direction = _asString(json['direction']).toLowerCase();
    final fromUser = json['fromUser'] == true || json['from_user'] == true;
    final isOutbound = direction.isNotEmpty
        ? direction == 'outbound'
        : fromUser;

    return Message(
      id: _asString(json['id']),
      content: _asString(json['content']),
      isOutbound: isOutbound,
      status: _statusFrom(json['status']),
      createdAt: _asDate(json['createdAt'] ?? json['created_at'] ?? json['timestamp']) ??
          DateTime.now(),
      type: _asString(json['type']).isEmpty ? 'text' : _asString(json['type']),
      mediaUrl: json['mediaUrl'] as String? ?? json['media_url'] as String?,
      errorMessage:
          json['errorMessage'] as String? ?? json['error_message'] as String?,
    );
  }

  Message copyWith({MessageStatus? status, String? id, bool? pendingLocally}) =>
      Message(
        id: id ?? this.id,
        content: content,
        isOutbound: isOutbound,
        status: status ?? this.status,
        createdAt: createdAt,
        type: type,
        mediaUrl: mediaUrl,
        errorMessage: errorMessage,
        pendingLocally: pendingLocally ?? this.pendingLocally,
      );
}
