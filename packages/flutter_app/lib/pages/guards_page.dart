import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class GuardsPage extends StatefulWidget {
  const GuardsPage({super.key});

  @override
  State<GuardsPage> createState() => _GuardsPageState();
}

class _GuardsPageState extends State<GuardsPage> {
  int _tab = 0; // 0=Guards, 1=Logs, 2=Registry
  List<String> _logs = [];
  List<String> _registry = [];
  bool _loadingLogs = false;
  bool _loadingRegistry = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadGuards();
    });
  }

  Future<void> _loadLogs() async {
    if (_loadingLogs) return;
    setState(() => _loadingLogs = true);
    final logs = await context.read<RexService>().loadGuardLogs();
    setState(() {
      _logs = logs;
      _loadingLogs = false;
    });
  }

  Future<void> _loadRegistry() async {
    if (_loadingRegistry) return;
    setState(() => _loadingRegistry = true);
    final reg = await context.read<RexService>().loadGuardRegistry();
    setState(() {
      _registry = reg;
      _loadingRegistry = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        return RexPageLayout(
          title: 'Guards',
          actions: [
            RexHeaderButton(
              icon: CupertinoIcons.refresh,
              label: 'Refresh',
              onPressed: rex.isLoadingGuards ? null : rex.loadGuards,
            ),
          ],
          builder: (context, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Tab bar
                _TabBar(
                  selected: _tab,
                  onChanged: (t) {
                    setState(() => _tab = t);
                    if (t == 1 && _logs.isEmpty) _loadLogs();
                    if (t == 2 && _registry.isEmpty) _loadRegistry();
                  },
                ),
                const SizedBox(height: 16),

                if (_tab == 0) ..._buildGuardsList(context, rex),
                if (_tab == 1) ..._buildLogs(context),
                if (_tab == 2) ..._buildRegistry(context, rex),
              ],
            );
          },
        );
      },
    );
  }

  List<Widget> _buildGuardsList(BuildContext context, RexService rex) {
    if (rex.isLoadingGuards && rex.guards.isEmpty) {
      return [const Center(child: CupertinoActivityIndicator())];
    }

    if (rex.guards.isEmpty) {
      return [
        RexEmptyState(
          icon: CupertinoIcons.checkmark_shield,
          title: 'No guards found',
          subtitle: 'Install guards from the Registry tab or run rex init.',
          actionLabel: 'Go to Registry',
          onAction: () => setState(() {
            _tab = 2;
            if (_registry.isEmpty) _loadRegistry();
          }),
        ),
      ];
    }

    // Group by hook type
    final byHook = <String, List<Map<String, dynamic>>>{};
    for (final g in rex.guards) {
      final hook = g['hook'] as String? ?? 'Other';
      byHook.putIfAbsent(hook, () => []).add(g);
    }

    final widgets = <Widget>[];
    // Stats bar
    final total = rex.guards.length;
    final enabled = rex.guards.where((g) => g['enabled'] == true).length;
    widgets.add(RexCard(
      child: RexStatRow(label: 'Active guards', value: '$enabled / $total'),
    ));
    widgets.add(const SizedBox(height: 16));

    for (final entry in byHook.entries) {
      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          entry.key.toUpperCase(),
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.6,
            color: context.rex.textTertiary,
          ),
        ),
      ));
      widgets.add(RexCard(
        child: Column(
          children: entry.value.asMap().entries.map((e) {
            return Column(children: [
              _GuardRow(guard: e.value),
              if (e.key < entry.value.length - 1)
                Container(height: 1, color: context.rex.separator),
            ]);
          }).toList(),
        ),
      ));
      widgets.add(const SizedBox(height: 12));
    }

    return widgets;
  }

  List<Widget> _buildLogs(BuildContext context) {
    if (_loadingLogs) {
      return [const Center(child: CupertinoActivityIndicator())];
    }

    if (_logs.isEmpty) {
      return [
        RexEmptyState(
          icon: CupertinoIcons.doc_text,
          title: 'No guard logs yet',
          subtitle: 'Guard triggers will appear here.',
          actionLabel: 'Refresh',
          onAction: _loadLogs,
        ),
      ];
    }

    return [
      RexCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: _logs.reversed.take(50).map((line) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
              child: Text(
                line,
                style: TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: context.rex.textSecondary,
                ),
              ),
            );
          }).toList(),
        ),
      ),
    ];
  }

  List<Widget> _buildRegistry(BuildContext context, RexService rex) {
    if (_loadingRegistry) {
      return [const Center(child: CupertinoActivityIndicator())];
    }

    if (_registry.isEmpty) {
      return [
        RexEmptyState(
          icon: CupertinoIcons.square_grid_2x2,
          title: 'Registry not available',
          subtitle: 'Could not load built-in guard registry.',
          actionLabel: 'Retry',
          onAction: _loadRegistry,
        ),
      ];
    }

    final installedNames = rex.guards.map((g) => g['name'] as String? ?? '').toSet();

    return [
      RexSection(title: 'Built-in Guards'),
      RexCard(
        child: Column(
          children: _registry.asMap().entries.map((e) {
            final name = e.value;
            final isInstalled = installedNames.contains(name);
            return Column(children: [
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        name,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: context.rex.text,
                        ),
                      ),
                    ),
                    if (isInstalled)
                      const RexStatusChip(label: 'Installed', status: RexChipStatus.ok)
                    else
                      GestureDetector(
                        onTap: () async {
                          await rex.addGuardFromRegistry(name);
                          if (mounted) {
                            setState(() {});
                          }
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: context.rex.accent.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(6),
                            border: Border.all(color: context.rex.accent.withValues(alpha: 0.35)),
                          ),
                          child: Text(
                            'Install',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: context.rex.accent,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              if (e.key < _registry.length - 1)
                Container(height: 1, color: context.rex.separator),
            ]);
          }).toList(),
        ),
      ),
    ];
  }
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

class _TabBar extends StatelessWidget {
  const _TabBar({required this.selected, required this.onChanged});

  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final tabs = ['Guards', 'Logs', 'Registry'];
    return Row(
      children: tabs.asMap().entries.map((e) {
        final isSelected = e.key == selected;
        return GestureDetector(
          onTap: () => onChanged(e.key),
          child: Container(
            margin: const EdgeInsets.only(right: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
            decoration: BoxDecoration(
              color: isSelected
                  ? context.rex.accent.withValues(alpha: 0.10)
                  : context.rex.card,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(
                color: isSelected
                    ? context.rex.accent.withValues(alpha: 0.35)
                    : context.rex.separator,
              ),
            ),
            child: Text(
              e.value,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? context.rex.accent : context.rex.textSecondary,
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Guard row ─────────────────────────────────────────────────────────────────

class _GuardRow extends StatefulWidget {
  const _GuardRow({required this.guard});
  final Map<String, dynamic> guard;

  @override
  State<_GuardRow> createState() => _GuardRowState();
}

class _GuardRowState extends State<_GuardRow> {
  bool _toggling = false;

  String _severityFromHook(String hook) {
    if (hook.toLowerCase().contains('pretool')) return 'block';
    if (hook.toLowerCase().contains('posttool')) return 'warn';
    return 'info';
  }

  @override
  Widget build(BuildContext context) {
    final name = widget.guard['name'] as String? ?? '';
    final description = widget.guard['description'] as String? ?? '';
    final hook = widget.guard['hook'] as String? ?? '';
    final enabled = widget.guard['enabled'] as bool? ?? false;
    final severity = _severityFromHook(hook);

    final severityColor = severity == 'block'
        ? CupertinoColors.systemRed
        : severity == 'warn'
            ? CupertinoColors.systemYellow
            : CupertinoColors.systemBlue;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Row(
        children: [
          // Severity dot
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: enabled ? severityColor : context.rex.textTertiary,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: enabled ? context.rex.text : context.rex.textTertiary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          // Toggle
          if (_toggling)
            const CupertinoActivityIndicator(radius: 8)
          else
            CupertinoSwitch(
              value: enabled,
              activeTrackColor: context.rex.accent,
              onChanged: (val) async {
                setState(() => _toggling = true);
                await context.read<RexService>().toggleGuard(name, enable: val);
                if (mounted) setState(() => _toggling = false);
              },
            ),
        ],
      ),
    );
  }
}
