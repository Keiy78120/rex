import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

class GatewayPage extends StatefulWidget {
  const GatewayPage({super.key});

  @override
  State<GatewayPage> createState() => _GatewayPageState();
}

class _GatewayPageState extends State<GatewayPage> {
  String _logContent = '';
  bool _refreshingLogs = false;

  @override
  void initState() {
    super.initState();
    _loadLogs();
    context.read<RexService>().checkGateway();
  }

  Future<void> _loadLogs() async {
    setState(() => _refreshingLogs = true);
    try {
      final logFile = File('${Platform.environment['HOME']}/.claude/rex-gateway.log');
      if (await logFile.exists()) {
        final content = await logFile.readAsString();
        final lines = content.split('\n');
        final last50 = lines.length > 50 ? lines.sublist(lines.length - 50) : lines;
        setState(() => _logContent = last50.join('\n'));
      } else {
        setState(() => _logContent = 'No gateway log file found.');
      }
    } catch (e) {
      setState(() => _logContent = 'Error reading logs: $e');
    }
    setState(() => _refreshingLogs = false);
  }

  Future<void> _startGateway() async {
    try {
      await Process.run('launchctl', [
        'load',
        '${Platform.environment['HOME']}/Library/LaunchAgents/com.dstudio.rex-gateway.plist',
      ]);
      await Future.delayed(const Duration(seconds: 2));
      context.read<RexService>().checkGateway();
    } catch (_) {}
  }

  Future<void> _stopGateway() async {
    try {
      await Process.run('launchctl', [
        'unload',
        '${Platform.environment['HOME']}/Library/LaunchAgents/com.dstudio.rex-gateway.plist',
      ]);
      await Future.delayed(const Duration(seconds: 1));
      context.read<RexService>().checkGateway();
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('Gateway'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Refresh',
            icon: const MacosIcon(CupertinoIcons.refresh),
            onPressed: () {
              _loadLogs();
              context.read<RexService>().checkGateway();
            },
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
                    // Gateway status card
                    _GatewayStatusCard(
                      running: rex.gatewayRunning,
                      onStart: _startGateway,
                      onStop: _stopGateway,
                    ),
                    const SizedBox(height: 16),

                    // Features grid
                    Row(
                      children: [
                        Expanded(child: _FeatureCard(
                          icon: CupertinoIcons.chat_bubble_2,
                          title: 'Interactive Menu',
                          subtitle: 'Inline keyboards, button actions',
                          enabled: true,
                        )),
                        const SizedBox(width: 12),
                        Expanded(child: _FeatureCard(
                          icon: CupertinoIcons.bolt,
                          title: 'Wake-on-LAN',
                          subtitle: 'Wake Mac remotely via Tailscale',
                          enabled: true,
                        )),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _FeatureCard(
                          icon: CupertinoIcons.desktopcomputer,
                          title: 'Claude Remote',
                          subtitle: 'Continue sessions via Telegram',
                          enabled: true,
                        )),
                        const SizedBox(width: 12),
                        Expanded(child: _FeatureCard(
                          icon: CupertinoIcons.lock_shield,
                          title: 'Auth Protected',
                          subtitle: 'Restricted to your chat_id',
                          enabled: true,
                        )),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _FeatureCard(
                          icon: CupertinoIcons.text_bubble,
                          title: 'Dual LLM',
                          subtitle: 'Toggle Qwen (local) / Claude',
                          enabled: rex.ollamaRunning,
                        )),
                        const SizedBox(width: 12),
                        Expanded(child: _FeatureCard(
                          icon: CupertinoIcons.doc_on_clipboard,
                          title: 'Command Logging',
                          subtitle: 'All actions logged for traceability',
                          enabled: true,
                        )),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Logs
                    Row(
                      children: [
                        const Text(
                          'Gateway Logs',
                          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                        ),
                        const Spacer(),
                        if (_refreshingLogs) const ProgressCircle(radius: 8),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Container(
                      height: 300,
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: MacosTheme.brightnessOf(context) == Brightness.dark
                            ? const Color(0xFF1A1A1A)
                            : const Color(0xFFF5F5F5),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: MacosTheme.brightnessOf(context) == Brightness.dark
                              ? const Color(0xFF333333)
                              : const Color(0xFFE5E5E5),
                        ),
                      ),
                      child: SingleChildScrollView(
                        reverse: true,
                        child: SelectableText(
                          _logContent.isEmpty ? 'No logs available' : _logContent,
                          style: const TextStyle(
                            fontFamily: 'Menlo',
                            fontSize: 11,
                            height: 1.4,
                          ),
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
}

class _GatewayStatusCard extends StatelessWidget {
  final bool running;
  final VoidCallback onStart;
  final VoidCallback onStop;

  const _GatewayStatusCard({
    required this.running,
    required this.onStart,
    required this.onStop,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: running
              ? [const Color(0xFF10B981).withAlpha(20), const Color(0xFF10B981).withAlpha(8)]
              : [const Color(0xFFEF4444).withAlpha(20), const Color(0xFFEF4444).withAlpha(8)],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: running
              ? const Color(0xFF10B981).withAlpha(60)
              : const Color(0xFFEF4444).withAlpha(60),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: running ? CupertinoColors.systemGreen : CupertinoColors.systemRed,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: (running ? CupertinoColors.systemGreen : CupertinoColors.systemRed)
                      .withAlpha(100),
                  blurRadius: 8,
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                running ? 'Gateway Running' : 'Gateway Stopped',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              Text(
                running ? 'Telegram bot is active and listening' : 'Start the gateway to enable remote control',
                style: TextStyle(
                  fontSize: 12,
                  color: MacosTheme.of(context).typography.subheadline.color,
                ),
              ),
            ],
          ),
          const Spacer(),
          PushButton(
            controlSize: ControlSize.regular,
            color: running ? CupertinoColors.systemRed : CupertinoColors.systemGreen,
            onPressed: running ? onStop : onStart,
            child: Text(running ? 'Stop' : 'Start'),
          ),
        ],
      ),
    );
  }
}

class _FeatureCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final bool enabled;

  const _FeatureCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: MacosTheme.of(context).canvasColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: MacosTheme.brightnessOf(context) == Brightness.dark
              ? const Color(0xFF333333)
              : const Color(0xFFE5E5E5),
        ),
      ),
      child: Row(
        children: [
          Icon(
            icon,
            size: 20,
            color: enabled ? const Color(0xFF6366F1) : CupertinoColors.systemGrey,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                ),
                Text(
                  subtitle,
                  style: TextStyle(
                    fontSize: 11,
                    color: MacosTheme.of(context).typography.subheadline.color,
                  ),
                ),
              ],
            ),
          ),
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: enabled ? CupertinoColors.systemGreen : CupertinoColors.systemGrey,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
