import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../models/models.dart';
import 'chat_screen.dart';
import 'conversations_controller.dart';

class ConversationsScreen extends ConsumerStatefulWidget {
  const ConversationsScreen({super.key});

  @override
  ConsumerState<ConversationsScreen> createState() =>
      _ConversationsScreenState();
}

class _ConversationsScreenState extends ConsumerState<ConversationsScreen> {
  final _searchController = TextEditingController();
  bool _searching = false;

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _closeSearch() {
    _searchController.clear();
    ref.read(conversationsControllerProvider.notifier).setSearch('');
    setState(() => _searching = false);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(conversationsControllerProvider);
    final controller = ref.read(conversationsControllerProvider.notifier);
    final p = context.inbox;

    return Scaffold(
      backgroundColor: p.surface,
      appBar: AppBar(
        title: _searching
            ? TextField(
                controller: _searchController,
                autofocus: true,
                onChanged: controller.setSearch,
                style: TextStyle(color: p.bubbleText, fontSize: 16),
                decoration: InputDecoration(
                  hintText: 'Search name, phone or message',
                  filled: false,
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  hintStyle: TextStyle(color: p.mutedText, fontSize: 16),
                ),
              )
            : Row(
                children: [
                  const Text('Chats'),
                  if (state.totalUnread > 0) ...[
                    const SizedBox(width: 8),
                    _Badge(count: state.totalUnread, color: p.sendButton),
                  ],
                ],
              ),
        actions: [
          IconButton(
            tooltip: _searching ? 'Close search' : 'Search',
            icon: Icon(_searching ? Icons.close : Icons.search),
            onPressed: () {
              if (_searching) {
                _closeSearch();
              } else {
                setState(() => _searching = true);
              }
            },
          ),
          if (!_searching)
            IconButton(
              tooltip: 'Sign out',
              icon: const Icon(Icons.logout),
              onPressed: () => _confirmSignOut(context),
            ),
        ],
      ),
      body: Column(
        children: [
          _Filters(state: state, onSelect: controller.setFilter),
          Expanded(
            child: RefreshIndicator(
              onRefresh: controller.refresh,
              child: _body(state, controller, p),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body(
    ConversationsState state,
    ConversationsController controller,
    InboxPalette p,
  ) {
    if (state.loading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null && state.items.isEmpty) {
      return _Centered(
        icon: Icons.cloud_off,
        title: state.error!,
        action: FilledButton.tonal(
          onPressed: controller.refresh,
          child: const Text('Try again'),
        ),
      );
    }

    final visible = state.visible;
    if (visible.isEmpty) {
      return _Centered(
        icon: state.items.isEmpty ? Icons.forum_outlined : Icons.filter_alt_off,
        title: state.items.isEmpty
            ? 'No conversations yet'
            : 'Nothing matches this view',
        subtitle: state.items.isEmpty
            ? 'Incoming WhatsApp messages will appear here.'
            : 'Try another filter or clear the search.',
      );
    }

    // Pinned rows are grouped under their own heading, like the panel's
    // sections, with everything else following in recency order.
    final pinned = visible.where((c) => state.isPinned(c.id)).toList();
    final rest = visible.where((c) => !state.isPinned(c.id)).toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (pinned.isNotEmpty) ...[
          _SectionHeader('Pinned', pinned.length),
          for (final c in pinned) _row(c, state, controller),
        ],
        if (rest.isNotEmpty) ...[
          if (pinned.isNotEmpty) _SectionHeader('Other chats', rest.length),
          for (final c in rest) _row(c, state, controller),
        ],
      ],
    );
  }

  Widget _row(
    Conversation conversation,
    ConversationsState state,
    ConversationsController controller,
  ) {
    final pinned = state.isPinned(conversation.id);

    return Dismissible(
      key: ValueKey(conversation.id),
      // Swipe right to pin, left to delete. Delete asks first; pin does not,
      // because it is trivially reversible.
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          final error = await controller.togglePin(conversation.id);
          if (error != null) _toast(error);
          return false; // the row stays, it just moves section
        }
        return _confirmDelete(conversation, controller);
      },
      background: _SwipeBackground(
        alignment: Alignment.centerLeft,
        color: context.inbox.sendButton,
        icon: pinned ? Icons.push_pin_outlined : Icons.push_pin,
        label: pinned ? 'Unpin' : 'Pin',
      ),
      secondaryBackground: const _SwipeBackground(
        alignment: Alignment.centerRight,
        color: Color(0xFFEF4444),
        icon: Icons.delete_outline,
        label: 'Delete',
      ),
      child: _ConversationTile(
        conversation: conversation,
        pinned: pinned,
        awaitingReply: state.awaitingReply(conversation),
      ),
    );
  }

  Future<bool> _confirmDelete(
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
              backgroundColor: const Color(0xFFEF4444),
            ),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return false;
    final error = await controller.deleteConversation(conversation.id);
    if (error != null) {
      _toast(error);
      return false;
    }
    return true;
  }

  void _toast(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _confirmSignOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need your password to sign back in.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authControllerProvider.notifier).signOut();
    }
  }
}

class _Filters extends StatelessWidget {
  const _Filters({required this.state, required this.onSelect});

  final ConversationsState state;
  final ValueChanged<InboxFilter> onSelect;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    return Container(
      decoration: BoxDecoration(
        color: p.surface,
        border: Border(bottom: BorderSide(color: p.divider)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            for (final f in InboxFilter.values)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: ChoiceChip(
                  label: Text('${f.label} ${state.countFor(f)}'),
                  selected: state.filter == f,
                  onSelected: (_) => onSelect(f),
                  showCheckmark: false,
                  labelStyle: TextStyle(
                    fontSize: 12.5,
                    color: state.filter == f ? Colors.white : p.mutedText,
                  ),
                  selectedColor: p.sendButton,
                  backgroundColor: p.incomingBubble,
                  side: BorderSide(color: p.divider),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label, this.count);

  final String label;
  final int count;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    return Container(
      width: double.infinity,
      color: p.threadBackground,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Text(
        '${label.toUpperCase()}  ·  $count',
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
          color: p.mutedText,
        ),
      ),
    );
  }
}

class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({
    required this.alignment,
    required this.color,
    required this.icon,
    required this.label,
  });

  final Alignment alignment;
  final Color color;
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: color,
      alignment: alignment,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 20),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.count, required this.color});

  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        count > 99 ? '99+' : '$count',
        style: const TextStyle(
            color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.conversation,
    required this.pinned,
    required this.awaitingReply,
  });

  final Conversation conversation;
  final bool pinned;
  final bool awaitingReply;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    final unread = conversation.unreadCount > 0;
    final windowClosed = !conversation.isFreeFormWindowOpen;

    return Container(
      decoration: BoxDecoration(
        color: p.surface,
        border: Border(bottom: BorderSide(color: p.divider)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: CircleAvatar(
          radius: 24,
          backgroundColor: p.incomingBubble,
          child: Text(
            _initials(conversation.displayName),
            style: TextStyle(color: p.bubbleText, fontWeight: FontWeight.w600),
          ),
        ),
        title: Row(
          children: [
            if (pinned) ...[
              Icon(Icons.push_pin, size: 13, color: p.mutedText),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Text(
                conversation.displayName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: p.bubbleText,
                  fontWeight: unread ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
        subtitle: Row(
          children: [
            if (awaitingReply) ...[
              Icon(Icons.reply, size: 13, color: p.sendButton),
              const SizedBox(width: 4),
            ],
            Expanded(
              child: Text(
                conversation.lastMessageText?.replaceAll('\n', ' ') ??
                    'No messages yet',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: unread ? p.bubbleText : p.mutedText,
                  fontWeight: unread ? FontWeight.w500 : FontWeight.w400,
                ),
              ),
            ),
          ],
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              _timeLabel(conversation.lastMessageAt),
              style: TextStyle(
                fontSize: 11,
                color: unread ? p.sendButton : p.mutedText,
              ),
            ),
            const SizedBox(height: 6),
            if (unread)
              _Badge(count: conversation.unreadCount, color: p.sendButton)
            else if (windowClosed)
              // A closed window is worth seeing from the list: it decides
              // whether a reply is even possible.
              Icon(Icons.lock_clock, size: 14, color: p.mutedText)
            else
              const SizedBox(height: 18),
          ],
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ChatScreen(conversation: conversation),
          ),
        ),
      ),
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    if (parts.isEmpty) return '?';
    if (parts.length == 1) {
      final single = parts.first;
      // A phone number has no initials worth showing; use its last two digits.
      if (RegExp(r'^[\d+]').hasMatch(single)) {
        return single.length >= 2
            ? single.substring(single.length - 2)
            : single;
      }
      return single.substring(0, 1).toUpperCase();
    }
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1))
        .toUpperCase();
  }

  static String _timeLabel(DateTime? at) {
    if (at == null) return '';
    final now = DateTime.now();
    final sameDay =
        at.year == now.year && at.month == now.month && at.day == now.day;
    if (sameDay) return DateFormat.Hm().format(at);
    if (now.difference(at).inDays < 7) return DateFormat.E().format(at);
    return DateFormat('d MMM').format(at);
  }
}

class _Centered extends StatelessWidget {
  const _Centered({
    required this.icon,
    required this.title,
    this.subtitle,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    // Inside a scroll view so RefreshIndicator still works on an empty list.
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(height: MediaQuery.of(context).size.height * 0.2),
        Icon(icon, size: 56, color: p.mutedText),
        const SizedBox(height: 16),
        Text(title,
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 16, color: p.bubbleText)),
        if (subtitle != null) ...[
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 48),
            child: Text(
              subtitle!,
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 13, color: p.mutedText),
            ),
          ),
        ],
        if (action != null) ...[
          const SizedBox(height: 24),
          Center(child: action!),
        ],
      ],
    );
  }
}
