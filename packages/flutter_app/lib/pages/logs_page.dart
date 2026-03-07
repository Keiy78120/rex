import 'dart:async';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

enum LogTab { daemon, gateway, agents, mcp, cli }

class LogsPage extends StatefulWidget {
  const LogsPage({super.key, this.initialTab});

  final LogTab? initialTab;

  @override
  State<LogsPage> createState() => LogsPageState();
}

class LogsPageState extends State<LogsPage> {
  late LogTab _currentTab;
  String _logContent = '';
  bool _loading = false;
  Timer? _refreshTimer;
  String _filterLevel = 'all'; // all, info, warn, error

  @override
  void initState() {
    super.initState();
    _currentTab = widget.initialTab ?? LogTab.daemon;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadLogs();
      _startAutoRefresh();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  void switchToTab(LogTab tab) {
    setState(() => _currentTab = tab);
    _loadLogs();
  }

  void _startAutoRefresh() {
    _refreshTimer?.cancel();
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (mounted) _loadLogs();
    });
  }

  Future<void> _loadLogs() async {
    setState(() => _loading = true);
    try {
      final home = Platform.environment['HOME'] ?? '';
      final rexDir = '$home/.claude/rex';
      final List<String> chunks = [];

      switch (_currentTab) {
        case LogTab.daemon:
          chunks.add(await _readLogFile('$rexDir/daemon.log', tail: 80));
        case LogTab.gateway:
          chunks.add(await _readLogFile('$home/.claude/rex-gateway.log', tail: 60));
          final cmdLog = await _readLogFile('$home/.claude/rex-gateway-commands.log', tail: 30);
          if (cmdLog.isNotEmpty) chunks.add('--- COMMANDS ---\n$cmdLog');
        case LogTab.agents:
          final agentsDir = Directory('$rexDir/agents');
          if (await agentsDir.exists()) {
            await for (final entity in agentsDir.list()) {
              if (entity is Directory) {
                final logFile = File('${entity.path}/agent.log');
                if (await logFile.exists()) {
                  final name = entity.path.split('/').last;
                  final content = await _readLogFile(logFile.path, tail: 30);
                  if (content.isNotEmpty) chunks.add('--- $name ---\n$content');
                }
              }
            }
          }
          if (chunks.isEmpty) chunks.add('No agent logs found.');
        case LogTab.mcp:
          chunks.add(await _readLogFile('$rexDir/mcp.log', tail: 60));
        case LogTab.cli:
          chunks.add(await _readLogFile('$rexDir/cli.log', tail: 80));
      }

      if (mounted) {
        var content = chunks.where((c) => c.isNotEmpty).join('\n\n');
        if (content.isEmpty) content = 'No logs available.';
        if (_filterLevel != 'all') {
          final lines = content.split('\n');
          final filtered = lines.where((line) {
            final lower = line.toLowerCase();
            if (_filterLevel == 'error') return lower.contains('error') || lower.contains('err]');
            if (_filterLevel == 'warn') return lower.contains('warn') || lower.contains('error') || lower.contains('err]');
            return true; // info = show all
          }).toList();
          content = filtered.isEmpty ? 'No matching logs.' : filtered.join('\n');
        }
        setState(() => _logContent = content);
      }
    } catch (e) {
      if (mounted) setState(() => _logContent = 'Error reading logs: $e');
    }
    if (mounted) setState(() => _loading = false);
  }

  Future<String> _readLogFile(String path, {int tail = 60}) async {
    final file = File(path);
    if (!await file.exists()) return '';
    final content = await file.readAsString();
    final lines = content.split('\n');
    final lastLines = lines.length > tail ? lines.sublist(lines.length - tail) : lines;
    return lastLines.join('\n').trim();
  }

  Future<void> _clearLogs() async {
    final home = Platform.environment['HOME'] ?? '';
    final rexDir = '$home/.claude/rex';
    try {
      switch (_currentTab) {
        case LogTab.daemon:
          await File('$rexDir/daemon.log').writeAsString('');
        case LogTab.gateway:
          await File('$home/.claude/rex-gateway.log').writeAsString('');
          await File('$home/.claude/rex-gateway-commands.log').writeAsString('');
        case LogTab.agents:
          final agentsDir = Directory('$rexDir/agents');
          if (await agentsDir.exists()) {
            await for (final entity in agentsDir.list()) {
              if (entity is Directory) {
                final logFile = File('${entity.path}/agent.log');
                if (await logFile.exists()) await logFile.writeAsString('');
              }
            }
          }
        case LogTab.mcp:
          await File('$rexDir/mcp.log').writeAsString('');
        case LogTab.cli:
          await File('$rexDir/cli.log').writeAsString('');
      }
    } catch (_) {}
    _loadLogs();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'Logs',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _loadLogs,
        ),
        RexHeaderButton(
          icon: CupertinoIcons.trash,
          label: 'Clear',
          onPressed: _clearLogs,
          showLabel: true,
        ),
      ],
      builder: (context, scrollController) {
        return Column(
          children: [
            // Tab bar
            Container(
              height: 36,
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: c.separator, width: 0.5),
                ),
              ),
              child: Row(
                children: [
                  for (final tab in LogTab.values) ...[
                    _TabButton(
                      label: tab.name[0].toUpperCase() + tab.name.substring(1),
                      selected: _currentTab == tab,
                      onTap: () => switchToTab(tab),
                    ),
                    if (tab != LogTab.values.last) const SizedBox(width: 4),
                  ],
                  const Spacer(),
                  if (_loading)
                    const Padding(
                      padding: EdgeInsets.only(right: 8),
                      child: CupertinoActivityIndicator(radius: 6),
                    ),
                  // Filter chips
                  for (final level in ['all', 'info', 'warn', 'error']) ...[
                    _FilterChip(
                      label: level,
                      selected: _filterLevel == level,
                      onTap: () {
                        setState(() => _filterLevel = level);
                        _loadLogs();
                      },
                    ),
                    if (level != 'error') const SizedBox(width: 2),
                  ],
                ],
              ),
            ),
            // Log content
            Expanded(
              child: Container(
                width: double.infinity,
                color: c.codeBg,
                child: SingleChildScrollView(
                  controller: scrollController,
                  reverse: true,
                  padding: const EdgeInsets.all(16),
                  child: SelectableText(
                    _logContent,
                    style: TextStyle(
                      fontFamily: 'Menlo',
                      fontSize: 11,
                      height: 1.5,
                      color: c.text,
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _TabButton extends StatefulWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TabButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_TabButton> createState() => _TabButtonState();
}

class _TabButtonState extends State<_TabButton> {
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
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: widget.selected
                ? c.accent.withValues(alpha: 0.10)
                : _hovered
                    ? c.text.withValues(alpha: 0.04)
                    : null,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w400,
              color: widget.selected ? c.accent : c.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatefulWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  State<_FilterChip> createState() => _FilterChipState();
}

class _FilterChipState extends State<_FilterChip> {
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
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
          decoration: BoxDecoration(
            color: widget.selected
                ? c.accent.withValues(alpha: 0.10)
                : _hovered
                    ? c.text.withValues(alpha: 0.04)
                    : null,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 10,
              fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w400,
              color: widget.selected ? c.accent : c.textTertiary,
            ),
          ),
        ),
      ),
    );
  }
}
