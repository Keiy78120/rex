// lib/widgets/rex_contextual_sidebar.dart
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show Tooltip;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import 'rex_nav.dart';

const double kSidebarExpanded  = 160.0;
const double kSidebarCollapsed =  48.0;

class RexContextualSidebar extends StatefulWidget {
  const RexContextualSidebar({
    super.key,
    required this.section,
    required this.selectedPageIndex,
    required this.onPageChanged,
  });

  final RexSection section;
  final int selectedPageIndex;
  final ValueChanged<int> onPageChanged;

  @override
  State<RexContextualSidebar> createState() => _RexContextualSidebarState();
}

class _RexContextualSidebarState extends State<RexContextualSidebar>
    with SingleTickerProviderStateMixin {
  bool _collapsed = false;
  late final AnimationController _ctrl;
  late final Animation<double> _widthAnim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 200),
    );
    _widthAnim = Tween<double>(
      begin: kSidebarExpanded,
      end: kSidebarCollapsed,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _toggle() {
    setState(() => _collapsed = !_collapsed);
    _collapsed ? _ctrl.forward() : _ctrl.reverse();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _widthAnim,
      builder: (context, _) {
        return Container(
          width: _widthAnim.value,
          decoration: BoxDecoration(
            color: context.rex.surface,
            border: Border(
              right: BorderSide(color: context.rex.separator, width: 0.5),
            ),
          ),
          child: Column(
            children: [
              _CollapseButton(collapsed: _collapsed, onTap: _toggle),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  children: widget.section.items.map((item) {
                    return _SidebarItem(
                      item: item,
                      selected: item.pageIndex == widget.selectedPageIndex,
                      collapsed: _collapsed,
                      onTap: () => widget.onPageChanged(item.pageIndex),
                    );
                  }).toList(),
                ),
              ),
              _QuickActionsFooter(
                section: widget.section,
                collapsed: _collapsed,
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Toggle button ─────────────────────────────────────────

class _CollapseButton extends StatelessWidget {
  const _CollapseButton({required this.collapsed, required this.onTap});
  final bool collapsed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: collapsed ? Alignment.center : Alignment.centerRight,
      child: GestureDetector(
        onTap: onTap,
        child: MouseRegion(
          cursor: SystemMouseCursors.click,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 4),
            child: Icon(
              collapsed
                  ? CupertinoIcons.chevron_right
                  : CupertinoIcons.chevron_left,
              size: 13,
              color: context.rex.textTertiary,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Nav item ──────────────────────────────────────────────

class _SidebarItem extends StatefulWidget {
  const _SidebarItem({
    required this.item,
    required this.selected,
    required this.collapsed,
    required this.onTap,
  });
  final RexNavItem item;
  final bool selected;
  final bool collapsed;
  final VoidCallback onTap;

  @override
  State<_SidebarItem> createState() => _SidebarItemState();
}

class _SidebarItemState extends State<_SidebarItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final accent = context.rex.accent;
    final Color bg = widget.selected
        ? accent.withValues(alpha: 0.10)
        : _hovered
            ? context.rex.text.withValues(alpha: 0.04)
            : const Color(0x00000000);
    final Color fg = widget.selected ? accent : context.rex.textSecondary;

    final content = widget.collapsed
        ? Icon(widget.item.icon, size: 16, color: fg)
        : Row(children: [
            Icon(widget.item.icon, size: 15, color: fg),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                widget.item.label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w400,
                  color: fg,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ]);

    final tile = MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 1),
          padding: EdgeInsets.symmetric(
            horizontal: widget.collapsed ? 0 : 10,
            vertical: 7,
          ),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(7),
          ),
          child: widget.collapsed ? Center(child: content) : content,
        ),
      ),
    );

    if (widget.collapsed) {
      return Tooltip(message: widget.item.label, child: tile);
    }
    return tile;
  }
}

// ── Quick actions footer ──────────────────────────────────

class _QuickActionsFooter extends StatelessWidget {
  const _QuickActionsFooter({
    required this.section,
    required this.collapsed,
  });
  final RexSection section;
  final bool collapsed;

  @override
  Widget build(BuildContext context) {
    final actions = section.quickActions?.call(context) ?? [];
    if (actions.isEmpty) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(height: 0.5, color: context.rex.separator),
        Padding(
          padding: const EdgeInsets.fromLTRB(6, 6, 6, 10),
          child: Column(
            children: actions
                .map((a) => _QuickActionButton(action: a, collapsed: collapsed))
                .toList(),
          ),
        ),
        if (!collapsed) const _StatusFooter(),
      ],
    );
  }
}

class _QuickActionButton extends StatefulWidget {
  const _QuickActionButton({required this.action, required this.collapsed});
  final RexQuickAction action;
  final bool collapsed;

  @override
  State<_QuickActionButton> createState() => _QuickActionButtonState();
}

class _QuickActionButtonState extends State<_QuickActionButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final btn = MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: () => widget.action.onTap(context),
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 1),
          padding: EdgeInsets.symmetric(
            horizontal: widget.collapsed ? 0 : 10,
            vertical: 6,
          ),
          decoration: BoxDecoration(
            color: _hovered
                ? context.rex.text.withValues(alpha: 0.05)
                : const Color(0x00000000),
            borderRadius: BorderRadius.circular(6),
          ),
          child: widget.collapsed
              ? Center(
                  child: Icon(widget.action.icon,
                      size: 14, color: context.rex.textTertiary),
                )
              : Row(children: [
                  Icon(widget.action.icon,
                      size: 13, color: context.rex.textTertiary),
                  const SizedBox(width: 7),
                  Text(
                    widget.action.label,
                    style: TextStyle(
                        fontSize: 12, color: context.rex.textTertiary),
                  ),
                ]),
        ),
      ),
    );

    if (widget.collapsed) {
      return Tooltip(message: widget.action.label, child: btn);
    }
    return btn;
  }
}

// ── Status footer ─────────────────────────────────────────

class _StatusFooter extends StatelessWidget {
  const _StatusFooter();

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final daemonOk = rex.backgroundProcesses
            .any((p) => p.name.contains('daemon') && p.running);
        final ctxPct =
            (rex.burnRate['contextPercent'] as num?)?.toDouble() ?? 0;
        final dailyPct =
            (rex.burnRate['dailyPercent'] as num?)?.toDouble() ?? 0;

        Color pct(double v) {
          if (v >= 90) return context.rex.error;
          if (v >= 70) return context.rex.warning;
          return context.rex.success;
        }

        return Padding(
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 0.5, color: context.rex.separator),
              const SizedBox(height: 6),
              Row(children: [
                Container(
                  width: 5,
                  height: 5,
                  decoration: BoxDecoration(
                    color: daemonOk
                        ? context.rex.success
                        : context.rex.textTertiary,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  daemonOk ? 'Daemon on' : 'Daemon off',
                  style: TextStyle(
                      fontSize: 10, color: context.rex.textTertiary),
                ),
              ]),
              if (ctxPct > 0) ...[
                const SizedBox(height: 3),
                Row(children: [
                  Container(
                    width: 5,
                    height: 5,
                    decoration: BoxDecoration(
                        color: pct(ctxPct), shape: BoxShape.circle),
                  ),
                  const SizedBox(width: 5),
                  Text(
                    'Ctx ${ctxPct.round()}%',
                    style: TextStyle(
                        fontSize: 10, color: context.rex.textTertiary),
                  ),
                  if (dailyPct > 0) ...[
                    const SizedBox(width: 8),
                    Container(
                      width: 5,
                      height: 5,
                      decoration: BoxDecoration(
                          color: pct(dailyPct), shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      'Daily ${dailyPct.round()}%',
                      style: TextStyle(
                          fontSize: 10, color: context.rex.textTertiary),
                    ),
                  ],
                ]),
              ],
              const SizedBox(height: 3),
              Text(
                'v7.0.0',
                style: TextStyle(
                    fontSize: 10, color: context.rex.textTertiary),
              ),
            ],
          ),
        );
      },
    );
  }
}
