import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../models/models.dart';
import 'chat_controller.dart';

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

  Future<void> _send() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    await ref.read(chatControllerProvider.notifier).send(text);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(chatControllerProvider);
    final theme = Theme.of(context);

    // Keep the view pinned to the newest message as messages arrive.
    ref.listen(chatControllerProvider, (prev, next) {
      if ((prev?.messages.length ?? 0) != next.messages.length) {
        _scrollToBottom(animate: prev?.messages.isNotEmpty ?? false);
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.conversation.displayName,
                style: const TextStyle(fontSize: 16)),
            Text(
              widget.conversation.contactPhone,
              style: TextStyle(fontSize: 12, color: theme.hintColor),
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
          _composer(theme, state),
        ],
      ),
    );
  }

  Widget _messages(ChatState state, ThemeData theme) {
    if (state.loading && state.messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.messages.isEmpty) {
      return Center(
        child: Text('No messages yet',
            style: theme.textTheme.bodyMedium?.copyWith(color: theme.hintColor)),
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

  Widget _composer(ThemeData theme, ChatState state) {
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          border: Border(top: BorderSide(color: theme.dividerColor)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _input,
                minLines: 1,
                maxLines: 5,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  hintText: 'Message',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.all(Radius.circular(24)),
                  ),
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  isDense: true,
                ),
                onSubmitted: (_) => _send(),
              ),
            ),
            const SizedBox(width: 4),
            IconButton.filled(
              onPressed: state.sending ? null : _send,
              icon: state.sending
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.send_rounded, size: 20),
            ),
          ],
        ),
      ),
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
    final theme = Theme.of(context);
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
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(label,
            style: theme.textTheme.labelSmall?.copyWith(color: theme.hintColor)),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble(this.message);

  final Message message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
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
              ? theme.colorScheme.errorContainer
              : outbound
                  ? theme.colorScheme.primaryContainer
                  : theme.colorScheme.surfaceContainerHighest,
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
            Text(
              message.content.isEmpty
                  ? '[${message.type}]'
                  : message.content,
              style: theme.textTheme.bodyMedium,
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  DateFormat.Hm().format(message.createdAt),
                  style: theme.textTheme.labelSmall
                      ?.copyWith(color: theme.hintColor, fontSize: 10),
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
class _Ticks extends StatelessWidget {
  const _Ticks(this.status);

  final MessageStatus status;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return switch (status) {
      MessageStatus.pending => Icon(Icons.schedule,
          size: 12, color: theme.hintColor),
      MessageStatus.sent => Icon(Icons.check, size: 13, color: theme.hintColor),
      MessageStatus.delivered =>
        Icon(Icons.done_all, size: 13, color: theme.hintColor),
      MessageStatus.read =>
        Icon(Icons.done_all, size: 13, color: theme.colorScheme.primary),
      MessageStatus.failed => Icon(Icons.error_outline,
          size: 13, color: theme.colorScheme.error),
    };
  }
}
