import 'dart:io';

// Prefixed: another transitive package also exports a `FilePicker`,
// so the bare name resolves to the wrong class.
import 'package:file_picker/file_picker.dart' as fp;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/theme.dart';
import '../../models/models.dart';

/// The message composer, including the 24-hour window gate.
///
/// Mirrors the web panel's MessageComposer: once WhatsApp's customer-service
/// window closes, free text is refused by Meta, so the field is disabled and a
/// notice points the user at templates. Attachments are also gated - a media
/// message is a free-form message as far as the window is concerned, which the
/// web panel does not currently enforce.
class Composer extends StatelessWidget {
  const Composer({
    super.key,
    required this.conversation,
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.onAttach,
    required this.onTemplates,
  });

  final Conversation conversation;
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  final void Function(PickedAttachment) onAttach;
  final VoidCallback onTemplates;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    final windowOpen = conversation.isFreeFormWindowOpen;
    final isWhatsApp = conversation.type == 'whatsapp';

    return SafeArea(
      top: false,
      child: Container(
        color: p.composerBackground,
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Column(
          children: [
            if (!windowOpen && isWhatsApp)
                _WindowClosedNotice(onTemplates: onTemplates),
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (isWhatsApp) ...[
                  IconButton(
                    tooltip: windowOpen
                        ? 'Attach a file'
                        : 'The 24-hour window has closed',
                    icon: const Icon(Icons.attach_file, size: 22),
                    color: p.mutedText,
                    onPressed: windowOpen && !sending
                        ? () => _pickAttachment(context)
                        : null,
                  ),
                  IconButton(
                    tooltip: 'Send a template',
                    icon: const Icon(Icons.description_outlined, size: 22),
                    color: windowOpen
                        ? p.mutedText
                        : p.sendButton,
                    onPressed: sending ? null : onTemplates,
                  ),
                ],
                Expanded(
                  child: TextField(
                    controller: controller,
                    enabled: windowOpen,
                    minLines: 1,
                    maxLines: 5,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: InputDecoration(
                      hintText: windowOpen ? 'Type a message...' : 'Templates only',
                      filled: true,
                      fillColor: p.composerField,
                      border: OutlineInputBorder(
                        borderRadius: const BorderRadius.all(Radius.circular(20)),
                        borderSide: BorderSide(color: p.divider),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: const BorderRadius.all(Radius.circular(20)),
                        borderSide: BorderSide(color: p.divider),
                      ),
                      disabledBorder: OutlineInputBorder(
                        borderRadius: const BorderRadius.all(Radius.circular(20)),
                        borderSide: BorderSide(color: p.divider),
                      ),
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                      isDense: true,
                    ),
                    onSubmitted: (_) => windowOpen ? onSend() : null,
                  ),
                ),
                const SizedBox(width: 4),
                _SendButton(
                  enabled: windowOpen && !sending,
                  sending: sending,
                  onPressed: onSend,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickAttachment(BuildContext context) async {
    final choice = await showModalBottomSheet<_AttachKind>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Take a photo'),
              onTap: () => Navigator.pop(ctx, _AttachKind.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Photo or video'),
              onTap: () => Navigator.pop(ctx, _AttachKind.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.insert_drive_file_outlined),
              title: const Text('Document'),
              onTap: () => Navigator.pop(ctx, _AttachKind.file),
            ),
          ],
        ),
      ),
    );
    if (choice == null) return;

    PickedAttachment? picked;
    switch (choice) {
      case _AttachKind.camera:
        final shot = await ImagePicker().pickImage(source: ImageSource.camera);
        if (shot != null) {
          picked = PickedAttachment(path: shot.path, name: shot.name);
        }
        break;
      case _AttachKind.gallery:
        final media = await ImagePicker().pickMedia();
        if (media != null) {
          picked = PickedAttachment(path: media.path, name: media.name);
        }
        break;
      case _AttachKind.file:
        // file_picker 13 made pickFiles static and returns the list directly.
        final files = await fp.FilePicker.pickFiles(
          // The panel accepts these; anything else WhatsApp will refuse.
          type: fp.FileType.custom,
          allowedExtensions: const [
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt',
            'jpg', 'jpeg', 'png', 'mp4', 'mp3', 'ogg',
          ],
        );
        final file = files.isEmpty ? null : files.first;
        if (file?.path != null) {
          picked = PickedAttachment(path: file!.path!, name: file.name);
        }
        break;
    }

    if (picked == null) return;

    // WhatsApp caps media at 16MB for most types; catching it here gives a
    // clear message instead of a failed send.
    final bytes = await File(picked.path).length();
    if (bytes > 16 * 1024 * 1024) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('That file is over 16MB, which WhatsApp will reject.'),
          ),
        );
      }
      return;
    }

    onAttach(picked);
  }
}

enum _AttachKind { camera, gallery, file }

class PickedAttachment {
  const PickedAttachment({required this.path, required this.name});

  final String path;
  final String name;
}

class _WindowClosedNotice extends StatelessWidget {
  const _WindowClosedNotice({required this.onTemplates});

  final VoidCallback onTemplates;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: p.warningBackground,
        border: Border.all(color: p.warningBorder),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 18, color: p.warningBody),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '24-hour window expired',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    color: p.warningTitle,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'You can only send template messages now',
                  style: TextStyle(color: p.warningBody, fontSize: 12),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: onTemplates,
            style: TextButton.styleFrom(
              foregroundColor: p.warningTitle,
              visualDensity: VisualDensity.compact,
            ),
            child: const Text('Templates'),
          ),
        ],
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({
    required this.enabled,
    required this.sending,
    required this.onPressed,
  });

  final bool enabled;
  final bool sending;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final p = context.inbox;
    return SizedBox(
      height: 40,
      width: 40,
      child: Material(
        color: enabled ? p.sendButton : p.divider,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: enabled ? onPressed : null,
          child: Center(
            child: sending
                ? const SizedBox(
                    height: 16,
                    width: 16,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : Icon(
                    Icons.send_rounded,
                    size: 18,
                    color: enabled ? Colors.white : p.mutedText,
                  ),
          ),
        ),
      ),
    );
  }
}
