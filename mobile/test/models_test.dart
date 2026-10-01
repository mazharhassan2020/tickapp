import 'package:flutter_test/flutter_test.dart';
import 'package:tickai_mobile/models/models.dart';

void main() {
  group('Message.fromJson', () {
    test('reads direction from the `direction` field', () {
      final m = Message.fromJson({
        'id': '1',
        'content': 'hi',
        'direction': 'outbound',
        'status': 'sent',
      });
      expect(m.isOutbound, isTrue);
      expect(m.status, MessageStatus.sent);
    });

    test('falls back to fromUser when direction is absent', () {
      expect(
        Message.fromJson({'id': '1', 'content': 'x', 'fromUser': true}).isOutbound,
        isTrue,
      );
      expect(
        Message.fromJson({'id': '1', 'content': 'x', 'from_user': true}).isOutbound,
        isTrue,
      );
      expect(
        Message.fromJson({'id': '1', 'content': 'x'}).isOutbound,
        isFalse,
      );
    });

    test('maps an inbound "received" status to delivered', () {
      // Inbound messages have no delivery state of their own; treating
      // "received" as pending would render a permanent clock icon.
      final m = Message.fromJson({
        'id': '1',
        'content': 'x',
        'direction': 'inbound',
        'status': 'received',
      });
      expect(m.status, MessageStatus.delivered);
    });

    test('unknown status degrades to pending rather than throwing', () {
      expect(
        Message.fromJson({'id': '1', 'content': 'x', 'status': 'weird'}).status,
        MessageStatus.pending,
      );
    });

    test('status order allows monotonic comparison', () {
      // The chat refuses to walk a tick backwards by comparing these indexes,
      // so the declaration order is load-bearing.
      expect(MessageStatus.sent.index < MessageStatus.delivered.index, isTrue);
      expect(MessageStatus.delivered.index < MessageStatus.read.index, isTrue);
      expect(MessageStatus.pending.index < MessageStatus.sent.index, isTrue);
    });

    test('tolerates a missing timestamp', () {
      final m = Message.fromJson({'id': '1', 'content': 'x'});
      expect(m.createdAt, isNotNull);
    });
  });

  group('Conversation', () {
    test('displayName falls back to the phone when the name is blank', () {
      final c = Conversation.fromJson({
        'id': 'c1',
        'contactName': '   ',
        'contactPhone': '971500000000',
      });
      expect(c.displayName, '971500000000');
    });

    test('reads snake_case keys too', () {
      final c = Conversation.fromJson({
        'id': 'c1',
        'contact_name': 'Dana',
        'contact_phone': '971500000000',
        'unread_count': 3,
      });
      expect(c.displayName, 'Dana');
      expect(c.unreadCount, 3);
    });

    test('unreadCount accepts a numeric string', () {
      // Some aggregate queries return counts as strings.
      final c = Conversation.fromJson({
        'id': 'c1',
        'contactPhone': '1',
        'unreadCount': '7',
      });
      expect(c.unreadCount, 7);
    });

    test('status defaults to open when missing', () {
      expect(
        Conversation.fromJson({'id': 'c1', 'contactPhone': '1'}).status,
        'open',
      );
    });
  });
}
