import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart'
    show SelectableText, Divider, FlutterLogo;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/rex_service.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  String _ollamaModels = '';
  String _systemInfo = '';
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    setState(() => _loading = true);

    // System info
    final ram = (Platform.numberOfProcessors).toString();
    _systemInfo =
        'Platform: ${Platform.operatingSystem} ${Platform.operatingSystemVersion}\n'
        'Processors: $ram\n'
        'Dart: ${Platform.version.split(' ').first}';

    // Ollama models
    try {
      final result = await Process.run('ollama', ['list']);
      _ollamaModels = result.exitCode == 0
          ? result.stdout as String
          : 'Ollama not running';
    } catch (_) {
      _ollamaModels = 'Ollama not installed';
    }

    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(title: const Text('Settings'), titleWidth: 150),
      children: [
        ContentArea(
          builder: (context, scrollController) {
            return Consumer<RexService>(
              builder: (context, rex, _) {
                return ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  children: [
                    // Status row
                    Row(
                      children: [
                        Expanded(
                          child: _StatusCard(
                            title: 'Ollama',
                            running: rex.ollamaRunning,
                            icon: CupertinoIcons.cube_box,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _StatusCard(
                            title: 'Gateway',
                            running: rex.gatewayRunning,
                            icon: CupertinoIcons.paperplane,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Quick Setup
                    _SettingsSection(
                      title: 'Quick Setup',
                      children: [
                        _SettingsRow(
                          icon: CupertinoIcons.hammer,
                          title: 'Run rex init',
                          subtitle:
                              'Install guards, hooks, MCP, skills, LaunchAgents',
                          trailing: PushButton(
                            controlSize: ControlSize.regular,
                            onPressed: rex.isLoading
                                ? null
                                : () async {
                                    final output = await rex.runInit();
                                    if (!context.mounted) return;
                                    _showOutput(context, 'Init', output);
                                  },
                            child: const Text('Init'),
                          ),
                        ),
                        _SettingsRow(
                          icon: CupertinoIcons.gear_alt,
                          title: 'Run rex setup',
                          subtitle: 'Install Ollama + models + Telegram',
                          trailing: PushButton(
                            controlSize: ControlSize.regular,
                            onPressed: rex.isLoading
                                ? null
                                : () async {
                                    final output = await rex.runSetup();
                                    if (!context.mounted) return;
                                    _showOutput(context, 'Setup', output);
                                  },
                            child: const Text('Setup'),
                          ),
                        ),
                        _SettingsRow(
                          icon: CupertinoIcons.arrow_clockwise_circle,
                          title: 'Update app',
                          subtitle:
                              'Build + install latest Flutter app from this repo',
                          trailing: PushButton(
                            controlSize: ControlSize.regular,
                            onPressed: rex.isLoading
                                ? null
                                : () async {
                                    final output = await rex.runAppUpdate();
                                    if (!context.mounted) return;
                                    _showOutput(context, 'App Update', output);
                                  },
                            child: const Text('Update'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Ollama Models
                    _SettingsSection(
                      title: 'Ollama Models',
                      children: [
                        if (_loading)
                          const Center(
                            child: Padding(
                              padding: EdgeInsets.all(20),
                              child: ProgressCircle(),
                            ),
                          )
                        else
                          Container(
                            width: double.infinity,
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color:
                                  MacosTheme.brightnessOf(context) ==
                                      Brightness.dark
                                  ? const Color(0xFF1A1A1A)
                                  : const Color(0xFFF8F8F8),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: SelectableText(
                              _ollamaModels.isEmpty
                                  ? 'No models found'
                                  : _ollamaModels,
                              style: const TextStyle(
                                fontFamily: 'Menlo',
                                fontSize: 11,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // System Info
                    _SettingsSection(
                      title: 'System',
                      children: [
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color:
                                MacosTheme.brightnessOf(context) ==
                                    Brightness.dark
                                ? const Color(0xFF1A1A1A)
                                : const Color(0xFFF8F8F8),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            _systemInfo,
                            style: const TextStyle(
                              fontFamily: 'Menlo',
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),

                    // Links
                    _SettingsSection(
                      title: 'Links',
                      children: [
                        _SettingsRow(
                          icon: CupertinoIcons.link,
                          title: 'GitHub Repository',
                          subtitle: 'github.com/Keiy78120/rex',
                          trailing: PushButton(
                            controlSize: ControlSize.regular,
                            secondary: true,
                            onPressed: () => launchUrl(
                              Uri.parse('https://github.com/Keiy78120/rex'),
                            ),
                            child: const Text('Open'),
                          ),
                        ),
                        _SettingsRow(
                          icon: CupertinoIcons.doc_text,
                          title: 'Ollama',
                          subtitle: 'ollama.com',
                          trailing: PushButton(
                            controlSize: ControlSize.regular,
                            secondary: true,
                            onPressed: () =>
                                launchUrl(Uri.parse('https://ollama.com')),
                            child: const Text('Open'),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 40),
                  ],
                );
              },
            );
          },
        ),
      ],
    );
  }

  void _showOutput(BuildContext context, String title, String output) {
    showMacosAlertDialog(
      context: context,
      builder: (context) => MacosAlertDialog(
        appIcon: const FlutterLogo(size: 48),
        title: Text(title),
        message: SizedBox(
          height: 300,
          child: SingleChildScrollView(
            child: SelectableText(
              output,
              style: const TextStyle(fontFamily: 'Menlo', fontSize: 11),
            ),
          ),
        ),
        primaryButton: PushButton(
          controlSize: ControlSize.large,
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('OK'),
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  final String title;
  final bool running;
  final IconData icon;

  const _StatusCard({
    required this.title,
    required this.running,
    required this.icon,
  });

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
      child: Row(
        children: [
          Icon(icon, size: 24, color: const Color(0xFF6366F1)),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: running
                          ? CupertinoColors.systemGreen
                          : CupertinoColors.systemRed,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    running ? 'Running' : 'Stopped',
                    style: TextStyle(
                      fontSize: 12,
                      color: running
                          ? CupertinoColors.systemGreen
                          : CupertinoColors.systemRed,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SettingsSection extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _SettingsSection({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Container(
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
            children: [
              for (int i = 0; i < children.length; i++) ...[
                children[i],
                if (i < children.length - 1) const Divider(height: 1),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Widget? trailing;

  const _SettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Icon(icon, size: 20, color: const Color(0xFF6366F1)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                    fontSize: 13,
                  ),
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
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}
