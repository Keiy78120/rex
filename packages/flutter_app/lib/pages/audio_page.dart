import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText, Divider;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

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
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('Audio'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Refresh',
            icon: const MacosIcon(CupertinoIcons.refresh),
            onPressed: () => context.read<RexService>().checkAudioLogger(),
            showLabel: false,
          ),
        ],
      ),
      children: [
        ContentArea(
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
                                  style: const TextStyle(
                                    fontWeight: FontWeight.bold,
                                    fontSize: 16,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  'Captured files: ${rex.audioRecordingsCount}',
                                  style: TextStyle(
                                    color: MacosTheme.of(
                                      context,
                                    ).typography.subheadline.color,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          PushButton(
                            controlSize: ControlSize.large,
                            color: capturing
                                ? CupertinoColors.systemRed
                                : CupertinoColors.systemGreen,
                            onPressed: rex.isLoading
                                ? null
                                : () => _toggleAudio(rex),
                            child: Text(capturing ? 'Stop' : 'Start'),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: MacosTheme.of(context).canvasColor,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color:
                              MacosTheme.brightnessOf(context) ==
                                  Brightness.dark
                              ? const Color(0xFF333333)
                              : const Color(0xFFE5E5E5),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Logger Details',
                            style: TextStyle(
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 8),
                          const Divider(height: 1),
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
                        color:
                            MacosTheme.brightnessOf(context) == Brightness.dark
                            ? const Color(0xFF1A1A1A)
                            : const Color(0xFFF8F8F8),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color:
                              MacosTheme.brightnessOf(context) ==
                                  Brightness.dark
                              ? const Color(0xFF333333)
                              : const Color(0xFFE5E5E5),
                        ),
                      ),
                      child: SelectableText(
                        rex.lastOutput.isEmpty
                            ? 'Tip: set REX_AUDIO_INPUT if needed (default is :0 for ffmpeg avfoundation).'
                            : rex.lastOutput,
                        style: const TextStyle(
                          fontFamily: 'Menlo',
                          fontSize: 11,
                        ),
                      ),
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
              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(fontFamily: 'Menlo', fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}
