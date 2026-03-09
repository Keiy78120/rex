import 'dart:async';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class GatewayPage extends StatefulWidget {
  const GatewayPage({super.key});

  @override
  State<GatewayPage> createState() => _GatewayPageState();
}

class _GatewayPageState extends State<GatewayPage> {
  final _notifyController = TextEditingController();
  String _notifyResult = '';
  bool _notifySending = false;
  Timer? _statusTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().checkGateway();
      _startStatusPolling();
    });
  }

  @override
  void dispose() {
    _statusTimer?.cancel();
    _notifyController.dispose();
    super.dispose();
  }

  void _startStatusPolling() {
    _statusTimer?.cancel();
    _statusTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      context.read<RexService>().checkGateway();
    });
  }

  Future<void> _startGateway() async {
    final plist = File(
      '${Platform.environment['HOME']}/Library/LaunchAgents/com.dstudio.rex-gateway.plist',
    );
    if (plist.existsSync()) {
      try {
        await Process.run('launchctl', ['load', plist.path]);
        await Future.delayed(const Duration(seconds: 2));
      } catch (_) {}
    }
    if (mounted) await context.read<RexService>().startGateway();
  }

  Future<void> _stopGateway() async {
    final plist = File(
      '${Platform.environment['HOME']}/Library/LaunchAgents/com.dstudio.rex-gateway.plist',
    );
    if (plist.existsSync()) {
      try {
        await Process.run('launchctl', ['unload', plist.path]);
      } catch (_) {}
    }
    if (mounted) await context.read<RexService>().stopGateway();
  }

  Future<void> _sendNotify() async {
    final msg = _notifyController.text.trim();
    if (msg.isEmpty) return;
    setState(() {
      _notifySending = true;
      _notifyResult = '';
    });
    final result = await context.read<RexService>().runNotify(msg);
    if (mounted) {
      setState(() {
        _notifySending = false;
        _notifyResult = result;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'Gateway',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () {
            context.read<RexService>().checkGateway();
          },
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            final telegramConfigured =
                rex.telegramBotToken.isNotEmpty &&
                rex.telegramChatId.isNotEmpty;

            if (!telegramConfigured) {
              return RexEmptyState(
                icon: CupertinoIcons.paperplane,
                title: 'Configure Telegram Gateway',
                subtitle:
                    'Add your bot token and chat ID in Settings > Advanced to enable remote control via Telegram.',
              );
            }

            final degraded = rex.gatewayRunning && !rex.ollamaRunning;
            final activeBackend = rex.ollamaRunning ? 'Qwen + Claude' : 'Claude API only';

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 20,
              ),
              children: [
                // Degraded mode banner
                if (degraded) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: c.warning.withAlpha(18),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: c.warning.withAlpha(60)),
                    ),
                    child: Row(children: [
                      Icon(CupertinoIcons.exclamationmark_triangle, size: 15, color: c.warning),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'DEGRADED — Ollama offline. Inference via Claude API only.',
                          style: TextStyle(fontSize: 12, color: c.warning),
                        ),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 12),
                ],
                // Comms card (Fleet: Telegram gateway = Comms)
                RexSection(title: 'Comms', icon: CupertinoIcons.paperplane),
                RexCard(
                  trailing: RexStatusChip(
                    label: rex.gatewayRunning ? 'Active' : 'Offline',
                    status: rex.gatewayRunning
                        ? (degraded ? RexChipStatus.pending : RexChipStatus.ok)
                        : RexChipStatus.inactive,
                  ),
                  child: Column(
                    children: [
                      RexStatRow(
                        label: 'Adapter',
                        value: 'Telegram',
                        icon: CupertinoIcons.paperplane_fill,
                      ),
                      RexStatRow(
                        label: 'Bot',
                        value: '@claude_keiy_bot',
                        icon: CupertinoIcons.chat_bubble_2,
                      ),
                      RexStatRow(
                        label: 'Chat ID',
                        value: rex.telegramChatId.isNotEmpty
                            ? rex.telegramChatId
                            : 'Not set',
                        icon: CupertinoIcons.person,
                      ),
                      RexStatRow(
                        label: 'Backend',
                        value: activeBackend,
                        valueColor: degraded ? c.warning : c.success,
                        icon: CupertinoIcons.square_stack_3d_up,
                      ),
                      Builder(builder: (ctx) {
                        final qs = ctx.watch<RexService>().queueStats;
                        final spooled = ((qs?['byType'] as Map<String, dynamic>?)?['gateway.message'] as int?) ?? 0;
                        if (spooled == 0) return const SizedBox.shrink();
                        return RexStatRow(
                          label: 'Spooled',
                          value: '$spooled msg pending replay',
                          valueColor: c.warning,
                          icon: CupertinoIcons.clock_fill,
                        );
                      }),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          RexButton(
                            label: rex.gatewayRunning ? 'Stop Comms' : 'Start Comms',
                            variant: rex.gatewayRunning
                                ? RexButtonVariant.danger
                                : RexButtonVariant.success,
                            onPressed: rex.gatewayRunning
                                ? _stopGateway
                                : _startGateway,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // Send message card
                RexSection(title: 'Send Message', icon: CupertinoIcons.chat_bubble),
                RexCard(
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: MacosTextField(
                              controller: _notifyController,
                              placeholder: 'Message a envoyer...',
                              onSubmitted: (_) => _sendNotify(),
                            ),
                          ),
                          const SizedBox(width: 8),
                          RexButton(
                            label: 'Envoyer',
                            icon: CupertinoIcons.paperplane_fill,
                            loading: _notifySending,
                            onPressed: _notifySending ? null : _sendNotify,
                          ),
                        ],
                      ),
                      if (_notifyResult.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 8,
                          ),
                          decoration: BoxDecoration(
                            color:
                                _notifyResult.contains('OK') ||
                                        _notifyResult.contains('ok')
                                    ? c.success.withAlpha(20)
                                    : c.error.withAlpha(20),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(
                              color:
                                  _notifyResult.contains('OK') ||
                                          _notifyResult.contains('ok')
                                      ? c.success.withAlpha(60)
                                      : c.error.withAlpha(60),
                              width: 0.5,
                            ),
                          ),
                          child: Text(
                            _notifyResult,
                            style: TextStyle(
                              fontSize: 12,
                              color:
                                  _notifyResult.contains('OK') ||
                                          _notifyResult.contains('ok')
                                      ? c.success
                                      : c.error,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                const SizedBox(height: 8),
                // Features card
                RexSection(title: 'Capabilities', icon: CupertinoIcons.bolt),
                RexCard(
                  padding: EdgeInsets.zero,
                  child: Column(
                    children: [
                      _FeatureRow(
                        icon: CupertinoIcons.chat_bubble_2,
                        title: 'Interactive Menu',
                        enabled: true,
                      ),
                      _FeatureDivider(),
                      _FeatureRow(
                        icon: CupertinoIcons.bolt,
                        title: 'Wake-on-LAN',
                        enabled: true,
                      ),
                      _FeatureDivider(),
                      _FeatureRow(
                        icon: CupertinoIcons.desktopcomputer,
                        title: 'Claude Remote Sessions',
                        enabled: true,
                      ),
                      _FeatureDivider(),
                      _FeatureRow(
                        icon: CupertinoIcons.lock_shield,
                        title: 'Auth Protected',
                        enabled: true,
                      ),
                      _FeatureDivider(),
                      _FeatureRow(
                        icon: CupertinoIcons.text_bubble,
                        title: 'Dual LLM (Qwen / Claude)',
                        enabled: rex.ollamaRunning,
                      ),
                      _FeatureDivider(),
                      _FeatureRow(
                        icon: CupertinoIcons.paperplane_fill,
                        title: 'Telegram Notify',
                        enabled: telegramConfigured,
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _FeatureDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 44),
      child: Container(height: 0.5, color: context.rex.separator),
    );
  }
}

class _FeatureRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final bool enabled;

  const _FeatureRow({
    required this.icon,
    required this.title,
    required this.enabled,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
      child: Row(
        children: [
          Icon(icon, size: 18, color: enabled ? c.accent : c.textTertiary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 13,
                color: enabled ? c.text : c.textTertiary,
              ),
            ),
          ),
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: enabled ? c.success : c.textTertiary,
              shape: BoxShape.circle,
            ),
          ),
        ],
      ),
    );
  }
}
