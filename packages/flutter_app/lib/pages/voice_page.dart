import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText, Divider;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

class VoicePage extends StatefulWidget {
  const VoicePage({super.key});

  @override
  State<VoicePage> createState() => _VoicePageState();
}

class _VoicePageState extends State<VoicePage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final rex = context.read<RexService>();
      await rex.checkCallStatus();
      await rex.checkVoiceStatus();
      await rex.loadCallEvents();
    });
  }

  Future<void> _refresh() async {
    final rex = context.read<RexService>();
    await rex.checkCallStatus();
    await rex.checkVoiceStatus();
    await rex.loadCallEvents();
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('Voice'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Refresh',
            icon: const MacosIcon(CupertinoIcons.refresh),
            onPressed: _refresh,
            showLabel: false,
          ),
        ],
      ),
      children: [
        ContentArea(
          builder: (context, scrollController) {
            return Consumer<RexService>(
              builder: (context, rex, _) {
                return ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  children: [
                    _CallStatusCard(rex: rex),
                    const SizedBox(height: 16),
                    _TranscriptionCard(rex: rex),
                    const SizedBox(height: 16),
                    _CallEventsCard(events: rex.callEvents),
                    const SizedBox(height: 16),
                    _HintCard(
                      icon: CupertinoIcons.info,
                      title: 'Call Detection Source',
                      message:
                          'Call state is detected by Hammerspoon (rex-call-watcher.lua). Use `rex init` after updates to sync watcher scripts.',
                    ),
                  ],
                );
              },
            );
          },
        ),
      ],
    );
  }
}

class _TranscriptionCard extends StatelessWidget {
  final RexService rex;

  const _TranscriptionCard({required this.rex});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MacosTheme.of(context).canvasColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: MacosTheme.brightnessOf(context) == Brightness.dark
              ? const Color(0xFF333333)
              : const Color(0xFFE5E5E5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              MacosIcon(CupertinoIcons.mic, size: 16),
              SizedBox(width: 8),
              Text(
                'Whisper Transcription',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Optimize prompt after transcription',
                  style: TextStyle(
                    fontSize: 12,
                    color: MacosTheme.of(context).typography.subheadline.color,
                  ),
                ),
              ),
              CupertinoSwitch(
                value: rex.voiceOptimizeEnabled,
                onChanged: rex.isLoading
                    ? null
                    : (value) {
                        rex.setVoiceOptimize(value);
                      },
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'Model: ${rex.voiceOptimizeModel}',
            style: const TextStyle(fontFamily: 'Menlo', fontSize: 11),
          ),
          Text(
            'whisper-cli: ${rex.whisperCliAvailable ? 'available' : 'missing'}',
            style: const TextStyle(fontFamily: 'Menlo', fontSize: 11),
          ),
          if (rex.whisperModelPath.isNotEmpty)
            Text(
              'Whisper model: ${rex.whisperModelExists ? 'ok' : 'missing'}',
              style: const TextStyle(fontFamily: 'Menlo', fontSize: 11),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              PushButton(
                controlSize: ControlSize.regular,
                onPressed: rex.isLoading
                    ? null
                    : () => rex.transcribeLatest(
                        optimize: rex.voiceOptimizeEnabled,
                      ),
                child: const Text('Transcribe Latest'),
              ),
              const SizedBox(width: 8),
              PushButton(
                controlSize: ControlSize.regular,
                secondary: true,
                onPressed: rex.isLoading ? null : () => rex.checkVoiceStatus(),
                child: const Text('Refresh Voice'),
              ),
            ],
          ),
          if (rex.lastTranscript.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: MacosTheme.brightnessOf(context) == Brightness.dark
                    ? const Color(0xFF1A1A1A)
                    : const Color(0xFFF8F8F8),
                borderRadius: BorderRadius.circular(6),
              ),
              child: SelectableText(
                rex.lastTranscript,
                style: const TextStyle(fontSize: 12, height: 1.4),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _CallStatusCard extends StatelessWidget {
  final RexService rex;

  const _CallStatusCard({required this.rex});

  @override
  Widget build(BuildContext context) {
    final active = rex.callActive;
    final color = active
        ? CupertinoColors.systemGreen
        : CupertinoColors.systemGrey;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withAlpha(20), color.withAlpha(8)],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withAlpha(60)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 12,
            height: 12,
            margin: const EdgeInsets.only(top: 4),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  active ? 'Call Active' : 'No Active Call',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 6),
                if (active) ...[
                  Text('App: ${rex.callApp.isEmpty ? 'unknown' : rex.callApp}'),
                  if (rex.callReason.isNotEmpty)
                    Text('Reason: ${rex.callReason}'),
                  if (rex.callTitle.isNotEmpty) Text('Title: ${rex.callTitle}'),
                ] else ...[
                  Text(
                    'Open Discord/Meet/Slack/Teams/WhatsApp/FaceTime to trigger call detection.',
                    style: TextStyle(
                      color: MacosTheme.of(
                        context,
                      ).typography.subheadline.color,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CallEventsCard extends StatelessWidget {
  final List<String> events;

  const _CallEventsCard({required this.events});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MacosTheme.of(context).canvasColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: MacosTheme.brightnessOf(context) == Brightness.dark
              ? const Color(0xFF333333)
              : const Color(0xFFE5E5E5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              MacosIcon(CupertinoIcons.time, size: 16),
              SizedBox(width: 8),
              Text(
                'Call Events',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Divider(height: 1),
          const SizedBox(height: 10),
          if (events.isEmpty)
            Text(
              'No call events yet.',
              style: TextStyle(
                color: MacosTheme.of(context).typography.subheadline.color,
              ),
            )
          else
            SizedBox(
              height: 220,
              child: SingleChildScrollView(
                child: SelectableText(
                  events.join('\n'),
                  style: const TextStyle(
                    fontFamily: 'Menlo',
                    fontSize: 11,
                    height: 1.4,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _HintCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _HintCard({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF6366F1).withAlpha(12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF6366F1).withAlpha(40)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: const Color(0xFF6366F1), size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: TextStyle(
                    fontSize: 12,
                    color: MacosTheme.of(context).typography.subheadline.color,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
