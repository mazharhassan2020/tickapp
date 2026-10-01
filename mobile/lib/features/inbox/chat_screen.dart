import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/theme.dart';
import '../../models/models.dart';
import 'chat_controller.dart';
import 'composer.dart';
import 'conversations_controller.dart';
import 'template_picker.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key, required this.conversation});

  final Conversation conversation;

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    // After the first frame: open() mutates provider state, which must not
    // happen while the widget tree is still building.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(chatControllerProvider.notifier).open(widget.conversation.id);
    });
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Jump to the newest message. Called after the frame so the list has been
  /// laid out and `maxScrollExtent` is the real value.
  void _scrollToBottom({bool animate = true}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      final target = _scroll.position.maxScrollExtent;
      if (animate) {
        _scroll.animateTo(target,
            duration: const Duration(milliseconds: 200), curve: Curves.easeOut);
      } else {
        _scroll.jumpTo(target);
      }
    });
  }

  /// The live conversation row, so the 24-hour window reflects a message that
  /// arrived while this screen was open rather than the row we navigated with.
  Conversation get _conversation {
    final list = ref.read(conversationsControllerProvider).items;
    return list.firstWhere(
      (c) => c.id == widget.conversation.id,
      orElse: () => widget.conversation,
    );
  }

  Future<void> _send() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    if (!_conversation.isFreeFormWindowOpen) return;
    _input.clear();
    await ref.read(chatControllerProvider.notifier).send(text);
    _scrollToBottom();
  }

  Future<void> _sendAttachment(PickedAttachment picked) async {
    final caption = await _askCaption(picked.name);
    if (caption == null) return; // cancelled
    await ref.read(chatControllerProvider.notifier).sendMedia(
          filePath: picked.path,
          fileName: picked.name,
          caption: caption,
        );
    _scrollToBottom();
  }

  /// Offer a caption before sending, the way the web panel's media preview does.
  Future<String?> _askCaption(String fileName) async {
    final controller = TextEditingController();
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Send file'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(fileName,
                style: TextStyle(fontSize: 13, color: context.inbox.mutedText)),
            const SizedBox(height: 12),
            TextField(
              controller: controller,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Caption (optional)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: context.inbox.sendButton),
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Send'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _openTemplates() async {
    final conversation = _conversation;
    final channelId = conversation.channelId;
    if (channelId == null || channelId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This conversation has no channel, so templates '
              'cannot be listed.'),
        ),
      );
      return;
    }

    final selection = await showTemplatePicker(context, channelId: channelId);
    if (selection == null) return;

    await ref.read(chatControllerProvider.notifier).sendTemplate(
          conversation: conversation,
          template: selection.template,
          parameters: selection.parameters,
        );
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chatControllerProvider);
    final theme = Theme.of(context);
    final p = context.inbox;

    // Keep the view pinned to the newest message as messages arrive.
    ref.listen(chatControllerProvider, (prev, next) {
      if ((prev?.messages.length ?? 0) != next.messages.length) {
        _scrollToBottom(animate: prev?.messages.isNotEmpty ?? false);
      }
    });

    final conversation = _conversation;

    return Scaffold(
      backgroundColor: p.threadBackground,
      appBar: AppBar(
        actions: [_actionsMenu(conversation)],
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(conversation.displayName,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w600)),
            Text(
              _subtitle(conversation),
              style: TextStyle(fontSize: 12, color: p.mutedText),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(child: _messages(state, theme)),
          if (state.error != null)
            Container(
              width: double.infinity,
              color: theme.colorScheme.errorContainer,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(
                state.error!,
                style: TextStyle(
                    color: theme.colorScheme.onErrorContainer, fontSize: 12),
              ),
            ),
          Composer(
            conversation: conversation,
            controller: _input,
            sending: state.sending,
            onSend: _send,
            onAttach: _sendAttachment,
            onTemplates: _openTemplates,
          ),
        ],
      ),
    );
  }

  /// Status, pin and delete, matching the actions the panel offers on a
  /// conversation. Archive and block are deliberately absent: the server has
  /// no route for either, and the panel's buttons for them silently no-op.
  Widget _actionsMenu(Conversation conversation) {
    final controller = ref.read(conversationsControllerProvider.notifier);
    final pinned = ref.watch(conversationsControllerProvider).isPinned(conversation.id);

    return PopupMenuButton<String>(
      icon: const Icon(Icons.more_vert),
      onSelected: (value) async {
        switch (value) {
          case 'pin':
            final error = await controller.togglePin(conversation.id);
            if (error != null) _toast(error);
          case 'open':
          case 'resolved':
          case 'closed':
            final error = await controller.setStatus(conversation.id, value);
            _toast(error ?? 'Marked ${value == 'open' ? 'open' : value}');
          case 'delete':
            await _confirmDelete(conversation, controller);
        }
      },
      itemBuilder: (context) => [
        PopupMenuItem(
          value: 'pin',
          child: Row(children: [
            Icon(pinned ? Icons.push_pin_outlined : Icons.push_pin, size: 18),
            const SizedBox(width: 10),
            Text(pinned ? 'Unpin' : 'Pin'),
          ]),
        ),
        const PopupMenuDivider(),
        for (final s in const [
          ('open', 'Mark open', Icons.markunread_outlined),
          ('resolved', 'Mark resolved', Icons.check_circle_outline),
          ('closed', 'Mark closed', Icons.do_not_disturb_on_outlined),
        ])
          PopupMenuItem(
            value: s.$1,
            child: Row(children: [
              Icon(s.$3, size: 18),
              const SizedBox(width: 10),
              Text(s.$2),
            ]),
          ),
        const PopupMenuDivider(),
        const PopupMenuItem(
          value: 'delete',
          child: Row(children: [
            Icon(Icons.delete_outline, size: 18, color: Color(0xFFEF4444)),
            SizedBox(width: 10),
            Text('Delete', style: TextStyle(color: Color(0xFFEF4444))),
          ]),
        ),
      ],
    );
  }

  Future<void> _confirmDelete(
    Conversation conversation,
    ConversationsController controller,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete conversation?'),
        content: Text(
          'This removes the conversation with ${conversation.displayName} and '
          'its messages. It cannot be undone.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444)),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    final error = await controller.deleteConversation(conversation.id);
    if (error != null) {
      _toast(error);
      return;
    }
    if (mounted) Navigator.of(context).pop(); // leave the deleted thread
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  /// Phone number, plus how much of the reply window is left - the thing an
  /// agent most needs to know before typing.
  String _subtitle(Conversation conversation) {
    final remaining = conversation.windowRemaining;
    if (remaining == null) {
      return conversation.type == 'whatsapp' &&
              !conversation.isFreeFormWindowOpen
          ? '${conversation.contactPhone}  ·  window closed'
          : conversation.contactPhone;
    }
    final hours = remaining.inHours;
    final label = hours >= 1 ? '${hours}h left' : '${remaining.inMinutes}m left';
    return '${conversation.contactPhone}  ·  $label';
  }

  Widget _messages(ChatState state, ThemeData theme) {
    final p = context.inbox;
    if (state.loading && state.messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.messages.isEmpty) {
      return Center(
        child: Text('No messages yet',
            style: theme.textTheme.bodyMedium?.copyWith(color: p.mutedText)),
      );
    }

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 16),
      itemCount: state.messages.length,
      itemBuilder: (context, i) {
        final message = state.messages[i];
        final previous = i == 0 ? null : state.messages[i - 1];
        final showDate = previous == null ||
            !_sameDay(previous.createdAt, message.createdAt);
        return Column(
          children: [
            if (showDate) _DateChip(message.createdAt),
            _Bubble(message),
          ],
        );
      },
    );
  }

  static bool _sameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _DateChip extends StatelessWidget {
  const _DateChip(this.date);

  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    final now = DateTime.now();
    final days = DateTime(now.year, now.month, now.day)
        .difference(DateTime(date.year, date.month, date.day))
        .inDays;
    final label = switch (days) {
      0 => 'Today',
      1 => 'Yesterday',
      _ => DateFormat('d MMMM y').format(date),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: p.incomingBubble,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: p.divider),
        ),
        child: Text(label,
            style: TextStyle(fontSize: 11, color: p.mutedText)),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.message);

  final Message message;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    final outbound = message.isOutbound;
    final failed = message.status == MessageStatus.failed;

    return Align(
      alignment: outbound ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
        decoration: BoxDecoration(
          color: failed
              ? p.failedBubble
              : outbound
                  ? p.outgoingBubble
                  : p.incomingBubble,
          border: outbound && !failed
              ? Border.all(color: p.outgoingBubbleBorder)
              : null,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(14),
            topRight: const Radius.circular(14),
            bottomLeft: Radius.circular(outbound ? 14 : 4),
            bottomRight: Radius.circular(outbound ? 4 : 14),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (message.type != 'text' && message.type.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_typeIcon(message.type), size: 14, color: p.mutedText),
                    const SizedBox(width: 4),
                    Text(
                      message.type == 'template' ? 'Template' : message.type,
                      style: TextStyle(fontSize: 11, color: p.mutedText),
                    ),
                  ],
                ),
              ),
            Text(
              message.content.isEmpty ? '[${message.type}]' : message.content,
              style: TextStyle(
                  fontSize: 14, color: p.bubbleText, height: 1.3),
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  DateFormat.Hm().format(message.createdAt),
                  style: TextStyle(fontSize: 10, color: p.mutedText),
                ),
                if (outbound) ...[
                  const SizedBox(width: 4),
                  _Ticks(message.status),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// WhatsApp-style delivery indicator.
IconData _typeIcon(String type) => switch (type) {
      'image' => Icons.image_outlined,
      'video' => Icons.videocam_outlined,
      'audio' => Icons.mic_none,
      'document' => Icons.insert_drive_file_outlined,
      'template' => Icons.description_outlined,
      _ => Icons.attach_file,
    };

class _Ticks extends StatelessWidget {
  const _Ticks(this.status);

  final MessageStatus status;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    return switch (status) {
      MessageStatus.pending =>
        Icon(Icons.schedule, size: 12, color: p.tickGrey),
      MessageStatus.sent =>
        Icon(Icons.check, size: 13, color: p.tickGrey),
      MessageStatus.delivered =>
        Icon(Icons.done_all, size: 13, color: p.tickGrey),
      MessageStatus.read =>
        Icon(Icons.done_all, size: 13, color: p.tickRead),
      MessageStatus.failed => Icon(Icons.error_outline,
          size: 13, color: p.tickFailed),
    };
  }
}
