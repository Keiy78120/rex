import 'dart:async';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

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
    // Try launchctl first (if plist exists), otherwise start directly
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
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.symmetric(
                horizontal: 24,
                vertical: 20,
              ),
              children: [
                // Status row
                Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: rex.gatewayRunning ? c.success : c.error,
                        shape: BoxShape.circle,
                        boxShadow: [
                          BoxShadow(
                            color:
                                (rex.gatewayRunning ? c.success : c.error)
                                    .withAlpha(80),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            rex.gatewayRunning
                                ? 'Gateway Running'
                                : 'Gateway Stopped',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              color: c.text,
                            ),
                          ),
                          Text(
                            rex.gatewayRunning
                                ? 'Telegram bot is active and listening'
                                : 'Start to enable remote control',
                            style: TextStyle(
                              fontSize: 12,
                              color: c.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                    RexButton(
                      label: rex.gatewayRunning ? 'Stop' : 'Start',
                      variant: rex.gatewayRunning
                          ? RexButtonVariant.danger
                          : RexButtonVariant.success,
                      onPressed: rex.gatewayRunning
                          ? _stopGateway
                          : _startGateway,
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // Telegram Send
                _SectionLabel('ENVOYER VIA TELEGRAM'),
                const SizedBox(height: 8),
                if (!telegramConfigured) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: c.warning.withAlpha(20),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color: c.warning.withAlpha(60),
                        width: 0.5,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          CupertinoIcons.exclamationmark_triangle_fill,
                          size: 14,
                          color: c.warning,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Telegram non configure. Ajoute le token et chat ID dans Settings > Advanced.',
                            style: TextStyle(fontSize: 12, color: c.text),
                          ),
                        ),
                      ],
                    ),
                  ),
                ] else ...[
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
                        color: _notifyResult.contains('OK') || _notifyResult.contains('ok')
                            ? c.success.withAlpha(20)
                            : c.error.withAlpha(20),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                          color: _notifyResult.contains('OK') || _notifyResult.contains('ok')
                              ? c.success.withAlpha(60)
                              : c.error.withAlpha(60),
                          width: 0.5,
                        ),
                      ),
                      child: Text(
                        _notifyResult,
                        style: TextStyle(
                          fontSize: 12,
                          color: _notifyResult.contains('OK') || _notifyResult.contains('ok')
                              ? c.success
                              : c.error,
                        ),
                      ),
                    ),
                  ],
                ],

                const SizedBox(height: 24),

                // Features list
                _SectionLabel('FEATURES'),
                const SizedBox(height: 6),
                Container(
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.separator, width: 0.5),
                  ),
                  child: Column(
                    children: [
                      _FeatureRow(
                        icon: CupertinoIcons.chat_bubble_2,
                        title: 'Interactive Menu',
                        enabled: true,
                      ),
                      _Divider(),
                      _FeatureRow(
                        icon: CupertinoIcons.bolt,
                        title: 'Wake-on-LAN',
                        enabled: true,
                      ),
                      _Divider(),
                      _FeatureRow(
                        icon: CupertinoIcons.desktopcomputer,
                        title: 'Claude Remote Sessions',
                        enabled: true,
                      ),
                      _Divider(),
                      _FeatureRow(
                        icon: CupertinoIcons.lock_shield,
                        title: 'Auth Protected',
                        enabled: true,
                      ),
                      _Divider(),
                      _FeatureRow(
                        icon: CupertinoIcons.text_bubble,
                        title: 'Dual LLM (Qwen / Claude)',
                        enabled: rex.ollamaRunning,
                      ),
                      _Divider(),
                      _FeatureRow(
                        icon: CupertinoIcons.paperplane_fill,
                        title: 'Telegram Notify',
                        enabled: telegramConfigured,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 16),

                // Link to Logs page
                _ViewLogsLink(
                  label: 'View gateway logs',
                  onTap: () {
                    // Navigate to Logs page, Gateway tab (index 9)
                    // Parent handles navigation via callback
                  },
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Text(
      text,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: c.textSecondary,
        letterSpacing: 0.5,
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 44),
      child: Container(height: 0.5, color: context.rex.separator),
    );
  }
}

class _ViewLogsLink extends StatefulWidget {
  final String label;
  final VoidCallback onTap;
  const _ViewLogsLink({required this.label, required this.onTap});

  @override
  State<_ViewLogsLink> createState() => _ViewLogsLinkState();
}

class _ViewLogsLinkState extends State<_ViewLogsLink> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              CupertinoIcons.doc_text,
              size: 13,
              color: _hovered ? c.accent : c.textSecondary,
            ),
            const SizedBox(width: 4),
            Text(
              widget.label,
              style: TextStyle(
                fontSize: 12,
                color: _hovered ? c.accent : c.textSecondary,
                decoration: _hovered ? TextDecoration.underline : null,
              ),
            ),
          ],
        ),
      ),
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
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
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
