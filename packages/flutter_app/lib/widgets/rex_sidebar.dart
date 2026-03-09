import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';

// ── Navigation item data ─────────────────────────────────────────────────────

typedef _NavItem = ({int index, IconData icon, String label});


// Items in logical order — index matches IndexedStack in main.dart.
const List<_NavItem> _items = [
  // COCKPIT (0-2)
  (index: 0, icon: CupertinoIcons.heart_fill, label: 'Health'),
  (index: 1, icon: CupertinoIcons.antenna_radiowaves_left_right, label: 'Commander'),
  (index: 2, icon: CupertinoIcons.globe, label: 'Fleet'),
  // AGENTS (3-5)
  (index: 3, icon: CupertinoIcons.sparkles, label: 'Agents'),
  (index: 4, icon: CupertinoIcons.link, label: 'MCP'),
  (index: 5, icon: CupertinoIcons.bolt_fill, label: 'Optimize'),
  // KNOWLEDGE (6-9)
  (index: 6, icon: CupertinoIcons.search, label: 'Memory'),
  (index: 7, icon: CupertinoIcons.chart_bar_alt_fill, label: 'Tokens'),
  (index: 8, icon: CupertinoIcons.eye_fill, label: 'Observer'),
  (index: 9, icon: CupertinoIcons.scope, label: 'Curious'),
  // WORKFLOW (10-14)
  (index: 10, icon: CupertinoIcons.arrow_branch, label: 'Workflow'),
  (index: 11, icon: CupertinoIcons.folder_fill, label: 'Projects'),
  (index: 12, icon: CupertinoIcons.checkmark_shield_fill, label: 'Review'),
  (index: 13, icon: CupertinoIcons.lock_shield_fill, label: 'Guards'),
  (index: 14, icon: CupertinoIcons.square_stack_3d_up, label: 'Sandbox'),
  // RESOURCES (15-17)
  (index: 15, icon: CupertinoIcons.layers_fill, label: 'Providers'),
  (index: 16, icon: CupertinoIcons.square_grid_2x2_fill, label: 'Hub'),
  (index: 17, icon: CupertinoIcons.person_2_fill, label: 'Clients'),
  // COMMS (18-20)
  (index: 18, icon: CupertinoIcons.paperplane_fill, label: 'Gateway'),
  (index: 19, icon: CupertinoIcons.mic_fill, label: 'Voice'),
  (index: 20, icon: CupertinoIcons.waveform, label: 'Audio'),
  // ADMIN (21-25)
  (index: 21, icon: CupertinoIcons.doc_text, label: 'Logs'),
  (index: 22, icon: CupertinoIcons.gear, label: 'Settings'),
  (index: 23, icon: CupertinoIcons.doc_text_fill, label: 'Files'),
  (index: 24, icon: CupertinoIcons.waveform_path_ecg, label: 'Training'),
  (index: 25, icon: CupertinoIcons.chevron_right_square, label: 'Terminal'),
];

const Map<int, String?> _groupHeaders = {
  0: null,        // COCKPIT — no label, starts at top
  3: 'AGENTS',
  6: 'KNOWLEDGE',
  10: 'WORKFLOW',
  15: 'RESOURCES',
  18: 'COMMS',
  21: 'ADMIN',
};

// ── Widget ───────────────────────────────────────────────────────────────────

class RexSidebar extends StatelessWidget {
  const RexSidebar({
    super.key,
    required this.currentIndex,
    required this.onChanged,
  });

  final int currentIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(
          right: BorderSide(color: context.rex.separator, width: 1),
        ),
      ),
      child: Column(
        children: [
          const _SidebarHeader(),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
              children: _buildNavItems(context),
            ),
          ),
          const _SidebarFooter(),
        ],
      ),
    );
  }

  List<Widget> _buildNavItems(BuildContext context) {
    final result = <Widget>[];
    for (final item in _items) {
      if (_groupHeaders.containsKey(item.index)) {
        final label = _groupHeaders[item.index];
        if (label != null) {
          // Add a small separator + group label before each named group
          result.add(const SizedBox(height: 4));
          result.add(_GroupHeader(label: label));
        }
      }
      result.add(
        _SidebarNavItem(
          icon: item.icon,
          label: item.label,
          selected: item.index == currentIndex,
          onTap: () => onChanged(item.index),
        ),
      );
    }
    return result;
  }
}

class _GroupHeader extends StatelessWidget {
  final String label;
  const _GroupHeader({required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(10, 8, 10, 3),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.9,
          color: context.rex.textTertiary,
        ),
      ),
    );
  }
}

// ── Header ───────────────────────────────────────────────────────────────────

class _SidebarHeader extends StatelessWidget {
  const _SidebarHeader();

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final statusColor = context.rex.statusColor(rex.healthStatus);
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 52, 16, 4),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFE5484D), Color(0xFFC53030)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: Text(
                    'R',
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'REX',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      letterSpacing: 0.5,
                      color: context.rex.text,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        rex.healthStatus.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.8,
                          color: context.rex.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Nav item ─────────────────────────────────────────────────────────────────

class _SidebarNavItem extends StatefulWidget {
  const _SidebarNavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_SidebarNavItem> createState() => _SidebarNavItemState();
}

class _SidebarNavItemState extends State<_SidebarNavItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final accent = context.rex.accent;
    final Color bgColor;
    if (widget.selected) {
      bgColor = accent.withValues(alpha: 0.10);
    } else if (_hovered) {
      bgColor = context.rex.text.withValues(alpha: 0.04);
    } else {
      bgColor = const Color(0x00000000);
    }

    final Color fgColor = widget.selected ? accent : context.rex.textSecondary;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 1),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Row(
            children: [
              Icon(widget.icon, size: 16, color: fgColor),
              const SizedBox(width: 9),
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w400,
                  color: fgColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Footer ───────────────────────────────────────────────────────────────────

class _SidebarFooter extends StatelessWidget {
  const _SidebarFooter();

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final daemonRunning = rex.backgroundProcesses.any(
          (p) => p.name.contains('daemon') && p.running,
        );
        final contextPct = (rex.burnRate['contextPercent'] as num?)?.toDouble() ?? 0;
        final dailyPct = (rex.burnRate['dailyPercent'] as num?)?.toDouble() ?? 0;
        final burnRatePerHour = (rex.burnRate['burnRatePerHour'] as num?)?.toDouble() ?? 0;
        final burnRateStr = burnRatePerHour >= 1000
            ? '${(burnRatePerHour / 1000).toStringAsFixed(1)}k/h'
            : '${burnRatePerHour.round()}/h';

        Color pctColor(double pct) {
          if (pct >= 90) return context.rex.error;
          if (pct >= 70) return context.rex.warning;
          return context.rex.success;
        }

        return Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 0.5, color: context.rex.separator),
              const SizedBox(height: 8),
              // Daemon
              Row(
                children: [
                  Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                      color: daemonRunning ? context.rex.success : context.rex.textTertiary,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    daemonRunning ? 'Daemon running' : 'Daemon stopped',
                    style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                  ),
                ],
              ),
              // Token stats
              if (contextPct > 0 || dailyPct > 0) ...[
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (contextPct > 0) ...[
                      Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                          color: pctColor(contextPct),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'Ctx ${contextPct.round()}%',
                        style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                      ),
                      if (dailyPct > 0) const SizedBox(width: 10),
                    ],
                    if (dailyPct > 0) ...[
                      Container(
                        width: 5,
                        height: 5,
                        decoration: BoxDecoration(
                          color: pctColor(dailyPct),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        'Daily ${dailyPct.round()}%',
                        style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                      ),
                    ],
                  ],
                ),
                if (burnRatePerHour > 0) ...[
                  const SizedBox(height: 3),
                  Text(
                    '⚡ $burnRateStr',
                    style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                  ),
                ],
              ],
              const SizedBox(height: 4),
              Text(
                'v7.0.0',
                style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
              ),
            ],
          ),
        );
      },
    );
  }
}
