import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

class AudioPage extends StatefulWidget {
  const AudioPage({super.key});

  @override
  State<AudioPage> createState() => _AudioPageState();
}

class _AudioPageState extends State<AudioPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await context.read<RexService>().checkAudioLogger();
    });
  }

  Future<void> _toggleAudio(RexService rex) async {
    if (rex.audioCapturing) {
      await rex.stopAudioLogger();
    } else {
      await rex.startAudioLogger();
    }
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Audio',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () => context.read<RexService>().checkAudioLogger(),
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            final capturing = rex.audioCapturing;
            final accent = capturing
                ? CupertinoColors.systemRed
                : CupertinoColors.systemGrey;

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [accent.withAlpha(20), accent.withAlpha(8)],
                    ),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: accent.withAlpha(60)),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: capturing
                              ? CupertinoColors.systemRed.withAlpha(35)
                              : CupertinoColors.systemGrey.withAlpha(35),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          capturing
                              ? CupertinoIcons.stop_fill
                              : CupertinoIcons.recordingtape,
                          color: capturing
                              ? CupertinoColors.systemRed
                              : CupertinoColors.systemGrey,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              capturing
                                  ? 'Audio Logger Recording'
                                  : 'Audio Logger Idle',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                                color: context.rex.text,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              'Captured files: ${rex.audioRecordingsCount}',
                              style: TextStyle(
                                color: context.rex.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      RexButton(
                        label: capturing ? 'Stop' : 'Start',
                        onPressed: rex.isLoading
                            ? null
                            : () => _toggleAudio(rex),
                        variant: capturing
                            ? RexButtonVariant.danger
                            : RexButtonVariant.success,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: context.rex.surfaceSecondary,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: context.rex.separator),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Logger Details',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: context.rex.text,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Container(height: 0.5, color: context.rex.separator),
                      const SizedBox(height: 8),
                      _kv('State', capturing ? 'recording' : 'idle'),
                      _kv(
                        'Recordings dir',
                        rex.audioRecordingsDir.isEmpty
                            ? '-'
                            : rex.audioRecordingsDir,
                      ),
                      _kv(
                        'Current file',
                        rex.audioCurrentFile.isEmpty
                            ? '-'
                            : rex.audioCurrentFile,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: context.rex.codeBg,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: context.rex.separator),
                  ),
                  child: SelectableText(
                    rex.lastOutput.isEmpty
                        ? 'Tip: set REX_AUDIO_INPUT if needed (default is :0 for ffmpeg avfoundation).'
                        : rex.lastOutput,
                    style: TextStyle(
                      fontFamily: 'Menlo',
                      fontSize: 11,
                      color: context.rex.text,
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _kv(String key, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              key,
              style: TextStyle(fontWeight: FontWeight.w500, fontSize: 12, color: context.rex.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(fontFamily: 'Menlo', fontSize: 11, color: context.rex.text),
            ),
          ),
        ],
      ),
    );
  }
}
