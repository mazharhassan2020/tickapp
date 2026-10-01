import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme.dart';
import '../../models/models.dart';

/// What the user picked, once any placeholders are filled in.
class TemplateSelection {
  TemplateSelection(this.template, this.parameters);

  final MessageTemplate template;
  final List<String> parameters;
}

/// Bottom sheet for choosing an approved template.
///
/// Returns null if dismissed. A template with placeholders cannot be sent
/// until every one has a value - WhatsApp rejects a template whose parameter
/// count does not match the body.
Future<TemplateSelection?> showTemplatePicker(
  BuildContext context, {
  required String channelId,
}) {
  return showModalBottomSheet<TemplateSelection>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => _TemplateSheet(channelId: channelId),
  );
}

final _templatesProvider =
    FutureProvider.family<List<MessageTemplate>, String>((ref, channelId) {
  return ref.read(inboxRepositoryProvider).fetchApprovedTemplates(channelId);
});

class _TemplateSheet extends ConsumerStatefulWidget {
  const _TemplateSheet({required this.channelId});

  final String channelId;

  @override
  ConsumerState<_TemplateSheet> createState() => _TemplateSheetState();
}

class _TemplateSheetState extends ConsumerState<_TemplateSheet> {
  String _search = '';
  MessageTemplate? _selected;
  final _values = <TextEditingController>[];

  @override
  void dispose() {
    for (final c in _values) {
      c.dispose();
    }
    super.dispose();
  }

  void _choose(MessageTemplate template) {
    for (final c in _values) {
      c.dispose();
    }
    _values
      ..clear()
      ..addAll(List.generate(
        template.variableCount,
        (_) => TextEditingController(),
      ));
    setState(() => _selected = template);
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_templatesProvider(widget.channelId));

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Column(
          children: [
            _handle(context),
            Expanded(
              child: _selected != null
                  ? _fillForm(scrollController)
                  : async.when(
                      loading: () =>
                          const Center(child: CircularProgressIndicator()),
                      error: (_, _) => _error(),
                      data: (templates) => _list(templates, scrollController),
                    ),
            ),
          ],
        );
      },
    );
  }

  Widget _handle(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
      child: Row(
        children: [
          if (_selected != null)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              onPressed: () => setState(() => _selected = null),
            ),
          Expanded(
            child: Text(
              _selected?.name ?? 'Choose a template',
              style: Theme.of(context).textTheme.titleMedium,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.pop(context),
          ),
        ],
      ),
    );
  }

  Widget _error() {
    final p = context.inbox;
    return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off, size: 40, color: p.mutedText),
              const SizedBox(height: 12),
              const Text('Could not load templates'),
              const SizedBox(height: 16),
              FilledButton.tonal(
                onPressed: () =>
                    ref.invalidate(_templatesProvider(widget.channelId)),
                child: const Text('Try again'),
              ),
            ],
          ),
        ),
      );
  }

  Widget _list(List<MessageTemplate> templates, ScrollController controller) {
    final p = context.inbox;
    final query = _search.trim().toLowerCase();
    final filtered = query.isEmpty
        ? templates
        : templates
            .where((t) =>
                t.name.toLowerCase().contains(query) ||
                t.body.toLowerCase().contains(query))
            .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: TextField(
            onChanged: (v) => setState(() => _search = v),
            decoration: const InputDecoration(
              hintText: 'Search templates',
              prefixIcon: Icon(Icons.search),
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
        ),
        const SizedBox(height: 8),
        if (filtered.isEmpty)
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  templates.isEmpty
                      ? 'No approved templates on this channel.\nTemplates must be approved by Meta before they can be sent.'
                      : 'No templates match that search.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.mutedText),
                ),
              ),
            ),
          )
        else
          Expanded(
            child: ListView.separated(
              controller: controller,
              itemCount: filtered.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, i) {
                final t = filtered[i];
                return ListTile(
                  title: Text(t.name, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(
                    t.body,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: p.mutedText),
                  ),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      if (t.language.isNotEmpty)
                        Text(t.language,
                            style: TextStyle(
                                fontSize: 11, color: p.mutedText)),
                      if (t.variableCount > 0)
                        Text('${t.variableCount} field'
                            '${t.variableCount == 1 ? '' : 's'}',
                            style: TextStyle(
                                fontSize: 11, color: p.mutedText)),
                    ],
                  ),
                  onTap: () {
                    if (t.needsMediaHeader) {
                      // A media-header template needs an uploaded media id,
                      // which the app cannot produce yet. Better to say so
                      // than to send something Meta will reject.
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            '"${t.name}" needs a ${t.mediaType} header. '
                            'Send it from the web panel for now.',
                          ),
                        ),
                      );
                      return;
                    }
                    if (t.variableCount == 0) {
                      Navigator.pop(context, TemplateSelection(t, const []));
                    } else {
                      _choose(t);
                    }
                  },
                );
              },
            ),
          ),
      ],
    );
  }

  Widget _fillForm(ScrollController controller) {
    final p = context.inbox;
    final template = _selected!;
    final values = _values.map((c) => c.text).toList();

    return ListView(
      controller: controller,
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: p.incomingBubble,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (template.header != null && template.header!.isNotEmpty) ...[
                Text(template.header!,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 6),
              ],
              Text(template.resolvedBody(values)),
              if (template.footer != null && template.footer!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(template.footer!,
                    style: TextStyle(
                        fontSize: 12, color: p.mutedText)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Text('Fill in the placeholders',
            style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        for (var i = 0; i < _values.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: TextField(
              controller: _values[i],
              // Rebuild so the preview above updates as they type.
              onChanged: (_) => setState(() {}),
              decoration: InputDecoration(
                labelText: '{{${i + 1}}}',
                border: const OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ),
        const SizedBox(height: 8),
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: p.sendButton,
            padding: const EdgeInsets.symmetric(vertical: 14),
          ),
          onPressed: values.any((v) => v.trim().isEmpty)
              ? null
              : () => Navigator.pop(
                    context,
                    TemplateSelection(template, values),
                  ),
          child: const Text('Send template'),
        ),
        if (values.any((v) => v.trim().isEmpty))
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Every placeholder needs a value — WhatsApp rejects a template '
              'with missing parameters.',
              style: TextStyle(fontSize: 12, color: p.mutedText),
            ),
          ),
      ],
    );
  }
}
