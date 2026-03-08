import 'package:flutter/cupertino.dart';
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

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

  final _searchController = TextEditingController();

  String _urlType = 'sse';
  String _statusMessage = '';
  bool _showAddForms = false;

  @override
  void initState() {
    super.initState();
    context.read<RexService>().loadMcpServers();
  }

  Future<void> _addStdio() async {
    final name = _stdioNameController.text.trim();
    final command = _stdioCommandController.text.trim();
    if (name.isEmpty || command.isEmpty) {
      setState(() => _statusMessage = 'Name and command are required.');
      return;
    }

    final out = await context.read<RexService>().addMcpStdio(
      name,
      command,
      argsCsv: _stdioArgsController.text,
      cwd: _stdioCwdController.text,
      tagsCsv: _stdioTagsController.text,
    );
    setState(() => _statusMessage = out);
  }

  Future<void> _addUrl() async {
    final name = _urlNameController.text.trim();
    final url = _urlController.text.trim();
    if (name.isEmpty || url.isEmpty) {
      setState(() => _statusMessage = 'Name and URL are required.');
      return;
    }

    final out = await context.read<RexService>().addMcpUrl(
      name,
      url,
      type: _urlType,
      tagsCsv: _urlTagsController.text,
    );
    setState(() => _statusMessage = out);
  }

  Future<void> _check(String id) async {
    final out = await context.read<RexService>().checkMcp(id);
    setState(() => _statusMessage = out);
  }

  Future<void> _toggle(McpServerInfo server) async {
    final out = await context.read<RexService>().setMcpEnabled(
      server.id,
      !server.enabled,
    );
    setState(() => _statusMessage = out);
  }

  Future<void> _remove(String id) async {
    final out = await context.read<RexService>().removeMcp(id);
    setState(() => _statusMessage = out);
  }

  Future<void> _syncClaude() async {
    final out = await context.read<RexService>().syncMcpClaude();
    setState(() => _statusMessage = out);
  }

  Future<void> _export() async {
    final out = await context.read<RexService>().exportMcp();
    setState(() => _statusMessage = out);
  }

  Future<void> _search() async {
    final q = _searchController.text.trim();
    if (q.isEmpty) return;
    await context.read<RexService>().searchMarketplace(q);
  }

  Future<void> _install(String name) async {
    final out = await context.read<RexService>().installMarketplace(name);
    setState(() => _statusMessage = out);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'MCP Servers',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () => context.read<RexService>().loadMcpServers(),
        ),
        RexHeaderButton(
          icon: CupertinoIcons.arrow_2_circlepath,
          label: 'Sync Claude',
          onPressed: _syncClaude,
          showLabel: true,
        ),
        RexHeaderButton(
          icon: CupertinoIcons.cloud_download,
          label: 'Update Catalog',
          onPressed: () async {
            await context.read<RexService>().refreshMarketplace();
            setState(() => _statusMessage = 'Marketplace catalog updated');
          },
          showLabel: true,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Marketplace search
                RexCard(
                  title: 'Marketplace',
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: MacosTextField(
                              controller: _searchController,
                              placeholder: 'Search MCP servers...',
                              onSubmitted: (_) => _search(),
                            ),
                          ),
                          const SizedBox(width: 8),
                          RexButton(
                            label: 'Search',
                            onPressed: rex.isLoading ? null : _search,
                            loading: rex.isLoading,
                          ),
                        ],
                      ),
                      if (rex.marketplaceResults.isNotEmpty) ...[
                        const SizedBox(height: 12),
                        ...rex.marketplaceResults.map(
                          (entry) => _MarketplaceRow(
                            entry: entry,
                            busy: rex.isLoading,
                            onInstall: () => _install(entry['name'] as String? ?? ''),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),

                // Add custom server (collapsible)
                GestureDetector(
                  onTap: () => setState(() => _showAddForms = !_showAddForms),
                  child: Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        RexSection(
                          title: 'Add Custom Server',
                          padding: EdgeInsets.zero,
                        ),
                        const SizedBox(width: 6),
                        Icon(
                          _showAddForms
                              ? CupertinoIcons.chevron_up
                              : CupertinoIcons.chevron_down,
                          size: 14,
                          color: c.textSecondary,
                        ),
                        const Spacer(),
                      ],
                    ),
                  ),
                ),
                if (_showAddForms)
                  RexCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        RexSection(
                          title: 'stdio',
                          padding: const EdgeInsets.only(bottom: 8),
                        ),
                        Row(
                          children: [
                            Expanded(child: MacosTextField(controller: _stdioNameController, placeholder: 'Name')),
                            const SizedBox(width: 8),
                            Expanded(child: MacosTextField(controller: _stdioCommandController, placeholder: 'Command')),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(child: MacosTextField(controller: _stdioArgsController, placeholder: 'Args CSV')),
                            const SizedBox(width: 8),
                            Expanded(child: MacosTextField(controller: _stdioCwdController, placeholder: 'CWD')),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(child: MacosTextField(controller: _stdioTagsController, placeholder: 'Tags CSV')),
                            const SizedBox(width: 8),
                            RexButton(label: 'Add stdio', onPressed: rex.isLoading ? null : _addStdio, loading: rex.isLoading),
                          ],
                        ),
                        const SizedBox(height: 16),
                        RexSection(
                          title: 'URL',
                          padding: const EdgeInsets.only(bottom: 8),
                        ),
                        Row(
                          children: [
                            Expanded(child: MacosTextField(controller: _urlNameController, placeholder: 'Name')),
                            const SizedBox(width: 8),
                            Expanded(child: MacosTextField(controller: _urlController, placeholder: 'URL')),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Expanded(child: MacosTextField(controller: _urlTagsController, placeholder: 'Tags CSV')),
                            const SizedBox(width: 8),
                            RexButton(label: 'SSE', variant: _urlType == 'sse' ? RexButtonVariant.primary : RexButtonVariant.secondary, small: true, onPressed: () => setState(() => _urlType = 'sse')),
                            const SizedBox(width: 6),
                            RexButton(label: 'HTTP', variant: _urlType == 'http' ? RexButtonVariant.primary : RexButtonVariant.secondary, small: true, onPressed: () => setState(() => _urlType = 'http')),
                            const SizedBox(width: 8),
                            RexButton(label: 'Add URL', onPressed: rex.isLoading ? null : _addUrl),
                          ],
                        ),
                      ],
                    ),
                  ),

                // Server registry
                RexSection(
                  title: 'Registry (${rex.mcpServers.length})',
                  action: RexButton(
                    label: 'Export',
                    small: true,
                    variant: RexButtonVariant.secondary,
                    onPressed: _export,
                  ),
                ),

                if (rex.mcpServers.isEmpty)
                  RexEmptyState(
                    icon: CupertinoIcons.square_stack_3d_up,
                    title: 'No MCP servers configured',
                    subtitle: 'Search the marketplace or add a custom server above',
                  )
                else
                  ...rex.mcpServers.map(
                    (server) => _McpServerCard(
                      server: server,
                      busy: rex.isLoading,
                      onCheck: () => _check(server.id),
                      onToggle: () => _toggle(server),
                      onRemove: () => _remove(server.id),
                    ),
                  ),

                if (_statusMessage.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: c.codeBg,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      _statusMessage,
                      style: TextStyle(
                        fontSize: 12,
                        fontFamily: 'Menlo',
                        color: c.textSecondary,
                      ),
                    ),
                  ),
                ],
              ],
            );
          },
        );
      },
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
    _searchController.dispose();
    super.dispose();
  }
}

class _MarketplaceRow extends StatelessWidget {
  final Map<String, dynamic> entry;
  final bool busy;
  final VoidCallback onInstall;

  const _MarketplaceRow({
    required this.entry,
    required this.busy,
    required this.onInstall,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final name = entry['name'] as String? ?? '';
    final desc = entry['description'] as String? ?? '';
    final tags = (entry['tags'] as List?)?.cast<String>() ?? [];

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: c.surfaceSecondary,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: c.separator),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: c.text),
                  ),
                  if (desc.isNotEmpty)
                    Text(
                      desc,
                      style: TextStyle(fontSize: 11, color: c.textSecondary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  if (tags.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Wrap(
                        spacing: 4,
                        children: tags.take(3).map((t) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: c.accent.withAlpha(15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(t, style: TextStyle(fontSize: 10, color: c.accent)),
                        )).toList(),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            RexButton(
              label: 'Install',
              small: true,
              onPressed: busy ? null : onInstall,
            ),
          ],
        ),
      ),
    );
  }
}

class _McpServerCard extends StatelessWidget {
  final McpServerInfo server;
  final bool busy;
  final VoidCallback onCheck;
  final VoidCallback onToggle;
  final VoidCallback onRemove;

  const _McpServerCard({
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

    return RexCard(
      title: server.name,
      trailing: RexStatusChip(
        label: server.enabled ? 'Enabled' : 'Disabled',
        status: server.enabled ? RexChipStatus.ok : RexChipStatus.inactive,
        small: true,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          RexStatRow(
            label: 'Type',
            value: server.type,
            icon: CupertinoIcons.cube,
          ),
          RexStatRow(
            label: 'Target',
            value: target.isEmpty ? 'No target' : target,
            icon: CupertinoIcons.link,
          ),
          RexStatRow(
            label: 'ID',
            value: server.id,
            icon: CupertinoIcons.tag,
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              RexButton(
                label: 'Test',
                small: true,
                variant: RexButtonVariant.secondary,
                onPressed: busy ? null : onCheck,
              ),
              RexButton(
                label: server.enabled ? 'Disable' : 'Enable',
                small: true,
                variant: RexButtonVariant.secondary,
                onPressed: busy ? null : onToggle,
              ),
              RexButton(
                label: 'Remove',
                small: true,
                variant: RexButtonVariant.ghost,
                onPressed: busy ? null : onRemove,
              ),
            ],
          ),
        ],
      ),
    );
  }
}
