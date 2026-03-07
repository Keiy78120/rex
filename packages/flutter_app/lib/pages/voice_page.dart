import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

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
    return RexPageLayout(
      title: 'Voice',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _refresh,
        ),
      ],
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
        color: context.rex.surfaceSecondary,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(CupertinoIcons.mic, size: 16, color: context.rex.text),
              const SizedBox(width: 8),
              Text(
                'Whisper Transcription',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: context.rex.text),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(height: 0.5, color: context.rex.separator),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  'Optimize prompt after transcription',
                  style: TextStyle(
                    fontSize: 12,
                    color: context.rex.textSecondary,
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
            style: TextStyle(fontFamily: 'Menlo', fontSize: 11, color: context.rex.textSecondary),
          ),
          Text(
            'whisper-cli: ${rex.whisperCliAvailable ? 'available' : 'missing'}',
            style: TextStyle(fontFamily: 'Menlo', fontSize: 11, color: context.rex.textSecondary),
          ),
          if (rex.whisperModelPath.isNotEmpty)
            Text(
              'Whisper model: ${rex.whisperModelExists ? 'ok' : 'missing'}',
              style: TextStyle(fontFamily: 'Menlo', fontSize: 11, color: context.rex.textSecondary),
            ),
          const SizedBox(height: 10),
          Row(
            children: [
              RexButton(
                label: 'Transcribe Latest',
                onPressed: rex.isLoading
                    ? null
                    : () => rex.transcribeLatest(
                        optimize: rex.voiceOptimizeEnabled,
                      ),
                small: true,
              ),
              const SizedBox(width: 8),
              RexButton(
                label: 'Refresh Voice',
                variant: RexButtonVariant.secondary,
                onPressed: rex.isLoading ? null : () => rex.checkVoiceStatus(),
                small: true,
              ),
            ],
          ),
          if (rex.lastTranscript.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: context.rex.codeBg,
                borderRadius: BorderRadius.circular(6),
              ),
              child: SelectableText(
                rex.lastTranscript,
                style: TextStyle(fontSize: 12, height: 1.4, color: context.rex.text),
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
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                    color: context.rex.text,
                  ),
                ),
                const SizedBox(height: 6),
                if (active) ...[
                  Text('App: ${rex.callApp.isEmpty ? 'unknown' : rex.callApp}', style: TextStyle(color: context.rex.text)),
                  if (rex.callReason.isNotEmpty)
                    Text('Reason: ${rex.callReason}', style: TextStyle(color: context.rex.text)),
                  if (rex.callTitle.isNotEmpty) Text('Title: ${rex.callTitle}', style: TextStyle(color: context.rex.text)),
                ] else ...[
                  Text(
                    'Open Discord/Meet/Slack/Teams/WhatsApp/FaceTime to trigger call detection.',
                    style: TextStyle(
                      color: context.rex.textSecondary,
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
        color: context.rex.surfaceSecondary,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(CupertinoIcons.time, size: 16, color: context.rex.text),
              const SizedBox(width: 8),
              Text(
                'Call Events',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: context.rex.text),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Container(height: 0.5, color: context.rex.separator),
          const SizedBox(height: 10),
          if (events.isEmpty)
            Text(
              'No call events yet.',
              style: TextStyle(
                color: context.rex.textSecondary,
              ),
            )
          else
            SizedBox(
              height: 220,
              child: SingleChildScrollView(
                child: SelectableText(
                  events.join('\n'),
                  style: TextStyle(
                    fontFamily: 'Menlo',
                    fontSize: 11,
                    height: 1.4,
                    color: context.rex.text,
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
        color: context.rex.accent.withAlpha(12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.rex.accent.withAlpha(40)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: context.rex.accent, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(fontWeight: FontWeight.w600, color: context.rex.text),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: TextStyle(
                    fontSize: 12,
                    color: context.rex.textSecondary,
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
