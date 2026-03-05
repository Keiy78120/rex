import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

class McpPage extends StatefulWidget {
  const McpPage({super.key});

  @override
  State<McpPage> createState() => _McpPageState();
}

class _McpPageState extends State<McpPage> {
  final _stdioNameController = TextEditingController();
  final _stdioCommandController = TextEditingController();
  final _stdioArgsController = TextEditingController();
  final _stdioCwdController = TextEditingController();
  final _stdioTagsController = TextEditingController();

  final _urlNameController = TextEditingController();
  final _urlController = TextEditingController();
  final _urlTagsController = TextEditingController();

  String _urlType = 'sse';
  String _lastOutput = '';

  @override
  void initState() {
    super.initState();
    context.read<RexService>().loadMcpServers();
  }

  Future<void> _addStdio() async {
    final name = _stdioNameController.text.trim();
    final command = _stdioCommandController.text.trim();
    if (name.isEmpty || command.isEmpty) {
      setState(() => _lastOutput = 'Name and command are required.');
      return;
    }

    final out = await context.read<RexService>().addMcpStdio(
      name,
      command,
      argsCsv: _stdioArgsController.text,
      cwd: _stdioCwdController.text,
      tagsCsv: _stdioTagsController.text,
    );
    setState(() => _lastOutput = out);
  }

  Future<void> _addUrl() async {
    final name = _urlNameController.text.trim();
    final url = _urlController.text.trim();
    if (name.isEmpty || url.isEmpty) {
      setState(() => _lastOutput = 'Name and URL are required.');
      return;
    }

    final out = await context.read<RexService>().addMcpUrl(
      name,
      url,
      type: _urlType,
      tagsCsv: _urlTagsController.text,
    );
    setState(() => _lastOutput = out);
  }

  Future<void> _check(String id) async {
    final out = await context.read<RexService>().checkMcp(id);
    setState(() => _lastOutput = out);
  }

  Future<void> _toggle(McpServerInfo server) async {
    final out = await context.read<RexService>().setMcpEnabled(
      server.id,
      !server.enabled,
    );
    setState(() => _lastOutput = out);
  }

  Future<void> _remove(String id) async {
    final out = await context.read<RexService>().removeMcp(id);
    setState(() => _lastOutput = out);
  }

  Future<void> _syncClaude() async {
    final out = await context.read<RexService>().syncMcpClaude();
    setState(() => _lastOutput = out);
  }

  Future<void> _export() async {
    final out = await context.read<RexService>().exportMcp();
    setState(() => _lastOutput = out);
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('MCP Servers'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Refresh',
            icon: const MacosIcon(CupertinoIcons.refresh),
            onPressed: () => context.read<RexService>().loadMcpServers(),
            showLabel: false,
          ),
          ToolBarIconButton(
            label: 'Sync Claude',
            icon: const MacosIcon(CupertinoIcons.arrow_2_circlepath),
            onPressed: _syncClaude,
            showLabel: true,
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
                    _SectionTitle(title: 'Add stdio MCP server'),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: _cardDecoration(context),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _stdioNameController,
                                  placeholder: 'Name',
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: MacosTextField(
                                  controller: _stdioCommandController,
                                  placeholder: 'Command',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _stdioArgsController,
                                  placeholder: 'Args CSV (optional)',
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: MacosTextField(
                                  controller: _stdioCwdController,
                                  placeholder: 'CWD (optional)',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _stdioTagsController,
                                  placeholder: 'Tags CSV (optional)',
                                ),
                              ),
                              const SizedBox(width: 8),
                              PushButton(
                                controlSize: ControlSize.large,
                                onPressed: rex.isLoading ? null : _addStdio,
                                child: rex.isLoading
                                    ? const SizedBox(
                                        width: 14,
                                        height: 14,
                                        child: ProgressCircle(radius: 7),
                                      )
                                    : const Text('Add stdio'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    _SectionTitle(title: 'Add URL MCP server'),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: _cardDecoration(context),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _urlNameController,
                                  placeholder: 'Name',
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: MacosTextField(
                                  controller: _urlController,
                                  placeholder: 'URL',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _urlTagsController,
                                  placeholder: 'Tags CSV (optional)',
                                ),
                              ),
                              const SizedBox(width: 8),
                              PushButton(
                                controlSize: ControlSize.small,
                                secondary: _urlType != 'sse',
                                onPressed: () =>
                                    setState(() => _urlType = 'sse'),
                                child: const Text('SSE'),
                              ),
                              const SizedBox(width: 6),
                              PushButton(
                                controlSize: ControlSize.small,
                                secondary: _urlType != 'http',
                                onPressed: () =>
                                    setState(() => _urlType = 'http'),
                                child: const Text('HTTP'),
                              ),
                              const SizedBox(width: 8),
                              PushButton(
                                controlSize: ControlSize.large,
                                onPressed: rex.isLoading ? null : _addUrl,
                                child: const Text('Add URL'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        _SectionTitle(
                          title: 'Registry (${rex.mcpServers.length})',
                        ),
                        const Spacer(),
                        PushButton(
                          controlSize: ControlSize.small,
                          onPressed: _export,
                          child: const Text('Export'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (rex.mcpServers.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: _cardDecoration(context),
                        child: const Text('No MCP servers configured.'),
                      )
                    else
                      ...rex.mcpServers.map(
                        (server) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _McpCard(
                            server: server,
                            busy: rex.isLoading,
                            onCheck: () => _check(server.id),
                            onToggle: () => _toggle(server),
                            onRemove: () => _remove(server.id),
                          ),
                        ),
                      ),
                    const SizedBox(height: 20),
                    _SectionTitle(title: 'Last Output'),
                    const SizedBox(height: 8),
                    _OutputCard(
                      text: _lastOutput.isEmpty ? rex.lastOutput : _lastOutput,
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

  @override
  void dispose() {
    _stdioNameController.dispose();
    _stdioCommandController.dispose();
    _stdioArgsController.dispose();
    _stdioCwdController.dispose();
    _stdioTagsController.dispose();
    _urlNameController.dispose();
    _urlController.dispose();
    _urlTagsController.dispose();
    super.dispose();
  }
}

class _McpCard extends StatelessWidget {
  final McpServerInfo server;
  final bool busy;
  final VoidCallback onCheck;
  final VoidCallback onToggle;
  final VoidCallback onRemove;

  const _McpCard({
    required this.server,
    required this.busy,
    required this.onCheck,
    required this.onToggle,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final target = server.type == 'stdio'
        ? '${server.command} ${server.args.join(' ')}'.trim()
        : server.url;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: server.enabled
                      ? CupertinoColors.systemGreen
                      : CupertinoColors.systemGrey,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${server.name} (${server.type})',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                server.id,
                style: TextStyle(
                  fontFamily: 'Menlo',
                  fontSize: 11,
                  color: MacosTheme.of(context).typography.subheadline.color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            target.isEmpty ? 'No target' : target,
            style: TextStyle(
              fontSize: 12,
              color: MacosTheme.of(context).typography.subheadline.color,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onCheck,
                child: const Text('Check'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onToggle,
                child: Text(server.enabled ? 'Disable' : 'Enable'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onRemove,
                child: const Text('Remove'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    );
  }
}

class _OutputCard extends StatelessWidget {
  final String text;
  const _OutputCard({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration(context),
      child: SelectableText(
        text.isEmpty ? 'No output yet.' : text,
        style: const TextStyle(fontFamily: 'Menlo', fontSize: 12, height: 1.5),
      ),
    );
  }
}

BoxDecoration _cardDecoration(BuildContext context) {
  return BoxDecoration(
    color: MacosTheme.brightnessOf(context) == Brightness.dark
        ? const Color(0xFF1A1A1A)
        : const Color(0xFFF5F5F5),
    borderRadius: BorderRadius.circular(8),
    border: Border.all(
      color: MacosTheme.brightnessOf(context) == Brightness.dark
          ? const Color(0xFF333333)
          : const Color(0xFFE5E5E5),
    ),
  );
}
