# Flutter UX Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the 26-item flat sidebar with a top pill tab bar + contextual collapsible sidebar inspired by Claude app.

**Architecture:** `RexTopBar` (pill tabs) drives the active section. `RexContextualSidebar` renders per-section nav items + quick actions, and collapses to 48px icon-only mode. `main.dart` manages 2 state variables: `_section` (top tab) and `_page` (sidebar sub-item). Cockpit becomes a unified dashboard (no sidebar). All existing page widgets stay untouched.

**Tech Stack:** Flutter macOS, macos_ui, provider, CupertinoIcons, existing RexColors theme system.

---

## Navigation Structure

```
Sections (top bar):
  0 = Cockpit   → no sidebar, dashboard page
  1 = Memory    → Search · Tokens · Observer · Curious · Optimize
  2 = Agents    → Agents · MCP · Providers · Hub · Clients
  3 = Dev       → Workflow · Projects · Review · Guards · Sandbox · Files · Training · Terminal
  4 = Comms     → Gateway · Voice · Audio
  5 = Settings  → Settings · Logs · Training · Terminal
```

---

## Task 1: Data model — sections + sidebar items

**Files:**
- Create: `packages/flutter_app/lib/widgets/rex_nav.dart`

**Step 1: Create the file with section + item models**

```dart
// lib/widgets/rex_nav.dart
import 'package:flutter/cupertino.dart';

// ── Models ─────────────────────────────────────────────────

class RexNavItem {
  final String label;
  final IconData icon;
  final int pageIndex; // maps to main.dart _buildPage()

  const RexNavItem({
    required this.label,
    required this.icon,
    required this.pageIndex,
  });
}

class RexQuickAction {
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  const RexQuickAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });
}

class RexSection {
  final String label;
  final IconData icon;
  final List<RexNavItem> items;      // empty = no sidebar (Cockpit)
  final List<RexQuickAction> Function(BuildContext)? quickActions;

  const RexSection({
    required this.label,
    required this.icon,
    this.items = const [],
    this.quickActions,
  });

  bool get hasSidebar => items.isNotEmpty;
}

// ── Section definitions ────────────────────────────────────

final kRexSections = [
  // 0 — Cockpit (no sidebar)
  RexSection(
    label: 'Cockpit',
    icon: CupertinoIcons.heart_fill,
    items: [],
  ),
  // 1 — REX Memory
  RexSection(
    label: 'REX Memory',
    icon: CupertinoIcons.search,
    items: const [
      RexNavItem(label: 'Search',   icon: CupertinoIcons.search,            pageIndex: 6),
      RexNavItem(label: 'Tokens',   icon: CupertinoIcons.chart_bar_alt_fill, pageIndex: 7),
      RexNavItem(label: 'Observer', icon: CupertinoIcons.eye_fill,           pageIndex: 8),
      RexNavItem(label: 'Curious',  icon: CupertinoIcons.scope,              pageIndex: 9),
      RexNavItem(label: 'Optimize', icon: CupertinoIcons.bolt_fill,          pageIndex: 5),
    ],
  ),
  // 2 — Agents
  RexSection(
    label: 'Agents',
    icon: CupertinoIcons.sparkles,
    items: const [
      RexNavItem(label: 'Agents',    icon: CupertinoIcons.sparkles,           pageIndex: 3),
      RexNavItem(label: 'MCP',       icon: CupertinoIcons.link,               pageIndex: 4),
      RexNavItem(label: 'Providers', icon: CupertinoIcons.layers_fill,        pageIndex: 15),
      RexNavItem(label: 'Hub',       icon: CupertinoIcons.square_grid_2x2_fill, pageIndex: 16),
      RexNavItem(label: 'Clients',   icon: CupertinoIcons.person_2_fill,      pageIndex: 17),
    ],
  ),
  // 3 — Dev
  RexSection(
    label: 'Dev',
    icon: CupertinoIcons.arrow_branch,
    items: const [
      RexNavItem(label: 'Workflow',  icon: CupertinoIcons.arrow_branch,          pageIndex: 10),
      RexNavItem(label: 'Projects',  icon: CupertinoIcons.folder_fill,           pageIndex: 11),
      RexNavItem(label: 'Review',    icon: CupertinoIcons.checkmark_shield_fill, pageIndex: 12),
      RexNavItem(label: 'Guards',    icon: CupertinoIcons.lock_shield_fill,      pageIndex: 13),
      RexNavItem(label: 'Sandbox',   icon: CupertinoIcons.square_stack_3d_up,    pageIndex: 14),
      RexNavItem(label: 'Files',     icon: CupertinoIcons.doc_text_fill,         pageIndex: 23),
      RexNavItem(label: 'Training',  icon: CupertinoIcons.waveform_path_ecg,     pageIndex: 24),
      RexNavItem(label: 'Terminal',  icon: CupertinoIcons.chevron_right_square,  pageIndex: 25),
    ],
  ),
  // 4 — Comms
  RexSection(
    label: 'Comms',
    icon: CupertinoIcons.paperplane_fill,
    items: const [
      RexNavItem(label: 'Gateway', icon: CupertinoIcons.paperplane_fill, pageIndex: 18),
      RexNavItem(label: 'Voice',   icon: CupertinoIcons.mic_fill,        pageIndex: 19),
      RexNavItem(label: 'Audio',   icon: CupertinoIcons.waveform,        pageIndex: 20),
    ],
  ),
  // 5 — Settings
  RexSection(
    label: 'Settings',
    icon: CupertinoIcons.gear,
    items: const [
      RexNavItem(label: 'Settings', icon: CupertinoIcons.gear,      pageIndex: 22),
      RexNavItem(label: 'Logs',     icon: CupertinoIcons.doc_text,  pageIndex: 21),
    ],
  ),
];

// Cockpit section has a dedicated pageIndex outside normal routing
const kCockpitPageIndex = 0; // HealthPage used as cockpit (will be updated later)
```

**Step 2: Commit**
```bash
git add packages/flutter_app/lib/widgets/rex_nav.dart
git commit -m "feat(flutter): nav data model — sections + items + quick actions"
```

---

## Task 2: RexTopBar widget (pill tabs)

**Files:**
- Create: `packages/flutter_app/lib/widgets/rex_topbar.dart`

**Step 1: Create the widget**

```dart
// lib/widgets/rex_topbar.dart
import 'package:flutter/cupertino.dart';
import '../theme.dart';
import 'rex_nav.dart';

class RexTopBar extends StatelessWidget {
  const RexTopBar({
    super.key,
    required this.sections,
    required this.selectedIndex,
    required this.onChanged,
  });

  final List<RexSection> sections;
  final int selectedIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(
          bottom: BorderSide(color: context.rex.separator, width: 0.5),
        ),
      ),
      // 52px from top covers the macOS traffic-light area (28px) + padding
      padding: const EdgeInsets.only(top: 28, left: 12, right: 12),
      child: Row(
        children: [
          const SizedBox(width: 72), // space for traffic lights
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: sections.asMap().entries.map((e) {
                  return _TopBarPill(
                    label: e.value.label,
                    selected: e.key == selectedIndex,
                    onTap: () => onChanged(e.key),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBarPill extends StatefulWidget {
  const _TopBarPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_TopBarPill> createState() => _TopBarPillState();
}

class _TopBarPillState extends State<_TopBarPill> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final accent = context.rex.accent;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.only(right: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(
            color: widget.selected
                ? accent.withValues(alpha: 0.12)
                : _hovered
                    ? context.rex.text.withValues(alpha: 0.05)
                    : const Color(0x00000000),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 13,
              fontWeight:
                  widget.selected ? FontWeight.w600 : FontWeight.w400,
              color: widget.selected ? accent : context.rex.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
```

**Step 2: Commit**
```bash
git add packages/flutter_app/lib/widgets/rex_topbar.dart
git commit -m "feat(flutter): RexTopBar pill tab widget"
```

---

## Task 3: RexContextualSidebar widget (collapsible)

**Files:**
- Create: `packages/flutter_app/lib/widgets/rex_contextual_sidebar.dart`

**Step 1: Create the widget**

```dart
// lib/widgets/rex_contextual_sidebar.dart
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import 'rex_nav.dart';

// Width constants
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
              // Toggle button
              _CollapseButton(
                collapsed: _collapsed,
                onTap: _toggle,
              ),
              // Nav items
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 4),
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
              // Quick actions
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

// ── Toggle button ────────────────────────────────────────────

class _CollapseButton extends StatelessWidget {
  const _CollapseButton({required this.collapsed, required this.onTap});
  final bool collapsed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment:
          collapsed ? Alignment.center : Alignment.centerRight,
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

// ── Nav item ─────────────────────────────────────────────────

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
    final Color fg =
        widget.selected ? accent : context.rex.textSecondary;

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
                  fontWeight: widget.selected
                      ? FontWeight.w600
                      : FontWeight.w400,
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
          child: widget.collapsed
              ? Center(child: content)
              : content,
        ),
      ),
    );

    // Tooltip when collapsed
    if (widget.collapsed) {
      return Tooltip(message: widget.item.label, child: tile);
    }
    return tile;
  }
}

// ── Quick actions footer ──────────────────────────────────────

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
            children: actions.map((a) {
              final btn = _QuickActionButton(
                action: a,
                collapsed: collapsed,
              );
              return btn;
            }).toList(),
          ),
        ),
        // Status footer (daemon + token) — only when expanded
        if (!collapsed) const _StatusFooter(),
      ],
    );
  }
}

class _QuickActionButton extends StatefulWidget {
  const _QuickActionButton({
    required this.action,
    required this.collapsed,
  });
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
        onTap: widget.action.onTap,
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
                  child: Icon(
                    widget.action.icon,
                    size: 14,
                    color: context.rex.textTertiary,
                  ),
                )
              : Row(children: [
                  Icon(
                    widget.action.icon,
                    size: 13,
                    color: context.rex.textTertiary,
                  ),
                  const SizedBox(width: 7),
                  Text(
                    widget.action.label,
                    style: TextStyle(
                      fontSize: 12,
                      color: context.rex.textTertiary,
                    ),
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

// ── Status footer (daemon + tokens) ─────────────────────────

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
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(height: 0.5, color: context.rex.separator),
              const SizedBox(height: 6),
              Row(children: [
                Container(
                  width: 5, height: 5,
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
                      fontSize: 10,
                      color: context.rex.textTertiary),
                ),
              ]),
              if (ctxPct > 0) ...[
                const SizedBox(height: 3),
                Row(children: [
                  Container(
                    width: 5, height: 5,
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
                      width: 5, height: 5,
                      decoration: BoxDecoration(
                          color: pct(dailyPct), shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 5),
                    Text(
                      'Daily ${dailyPct.round()}%',
                      style: TextStyle(
                          fontSize: 10,
                          color: context.rex.textTertiary),
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
```

**Step 2: Commit**
```bash
git add packages/flutter_app/lib/widgets/rex_contextual_sidebar.dart
git commit -m "feat(flutter): RexContextualSidebar collapsible with quick actions"
```

---

## Task 4: Wire quick actions per section

**Files:**
- Modify: `packages/flutter_app/lib/widgets/rex_nav.dart`

Quick actions use `BuildContext` to call `RexService`. Update the section definitions to add `quickActions`:

```dart
// In kRexSections, update each section with quickActions:

// Memory section
RexSection(
  label: 'REX Memory',
  icon: CupertinoIcons.search,
  items: const [...],
  quickActions: (ctx) => [
    RexQuickAction(
      label: '+ Ingest',
      icon: CupertinoIcons.arrow_down_circle,
      onTap: () => ctx.read<RexService>().runCommand('rex ingest'),
    ),
    RexQuickAction(
      label: '↻ Sync',
      icon: CupertinoIcons.refresh,
      onTap: () => ctx.read<RexService>().runCommand('rex categorize'),
    ),
  ],
),

// Agents section
RexSection(
  label: 'Agents',
  ...
  quickActions: (ctx) => [
    RexQuickAction(
      label: '↻ Refresh',
      icon: CupertinoIcons.refresh,
      onTap: () => ctx.read<RexService>().refreshAgents(),
    ),
  ],
),

// Dev section
RexSection(
  label: 'Dev',
  ...
  quickActions: (ctx) => [
    RexQuickAction(
      label: '↺ New branch',
      icon: CupertinoIcons.arrow_branch,
      onTap: () => ctx.read<RexService>().runCommand('rex workflow feature'),
    ),
    RexQuickAction(
      label: '▶ Run CI',
      icon: CupertinoIcons.play_fill,
      onTap: () => ctx.read<RexService>().runCommand('rex ci --dry-run'),
    ),
  ],
),

// Comms section
RexSection(
  label: 'Comms',
  ...
  quickActions: (ctx) => [
    RexQuickAction(
      label: '📡 Status',
      icon: CupertinoIcons.antenna_radiowaves_left_right,
      onTap: () => ctx.read<RexService>().refreshGateway(),
    ),
  ],
),
```

**Note:** Use `runCommand(String cmd)` if it exists in RexService, otherwise use the existing equivalent method. Check `rex_service.dart` first.

**Step 2: Commit**
```bash
git add packages/flutter_app/lib/widgets/rex_nav.dart
git commit -m "feat(flutter): wire quick actions per section"
```

---

## Task 5: Rewire main.dart

**Files:**
- Modify: `packages/flutter_app/lib/main.dart`

**Step 1: Replace `_RexMainWindowState`**

Replace the entire `_RexMainWindowState` class with:

```dart
class _RexMainWindowState extends State<RexMainWindow> {
  int _sectionIndex = 0;
  int _pageIndex = 0;

  // Same _buildPage as before — untouched
  Widget _buildPage(int index) {
    switch (index) {
      case 0:  return const HealthPage();
      case 1:  return const HubPage();
      // ... all existing cases unchanged ...
      default: return const HealthPage();
    }
  }

  void _onSectionChanged(int section) {
    setState(() {
      _sectionIndex = section;
      // Auto-select first page of new section
      final items = kRexSections[section].items;
      if (items.isNotEmpty) {
        _pageIndex = items.first.pageIndex;
      } else {
        _pageIndex = kCockpitPageIndex; // Cockpit
      }
    });
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().refreshAll();
      WindowManipulator.overrideMacOSBrightness(dark: false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final section = kRexSections[_sectionIndex];

    return MediaQuery(
      data: MediaQuery.of(context).copyWith(
        platformBrightness: Brightness.light,
      ),
      child: MacosTheme(
        data: RexApp._lightTheme,
        child: Column(
          children: [
            // Top bar
            RexTopBar(
              sections: kRexSections,
              selectedIndex: _sectionIndex,
              onChanged: _onSectionChanged,
            ),
            // Body
            Expanded(
              child: Row(
                children: [
                  // Contextual sidebar (hidden on Cockpit)
                  if (section.hasSidebar)
                    RexContextualSidebar(
                      section: section,
                      selectedPageIndex: _pageIndex,
                      onPageChanged: (i) => setState(() => _pageIndex = i),
                    ),
                  // Content
                  Expanded(child: _buildPage(_pageIndex)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

**Step 2: Add imports at top of main.dart**
```dart
import 'widgets/rex_nav.dart';
import 'widgets/rex_topbar.dart';
import 'widgets/rex_contextual_sidebar.dart';
// Remove: import 'widgets/rex_sidebar.dart';
```

**Step 3: Commit**
```bash
git add packages/flutter_app/lib/main.dart
git commit -m "feat(flutter): rewire main.dart — top bar + contextual sidebar"
```

---

## Task 6: Build & verify

**Step 1: Build**
```bash
cd packages/flutter_app
flutter build macos --debug 2>&1 | grep -E "error:|warning:|Built"
```

Expected: `Built build/macos/Build/Products/Debug/rex_app.app`

**Step 2: Launch and verify**
```bash
open build/macos/Build/Products/Debug/rex_app.app
```

Checklist:
- [ ] Top bar shows 6 pills (Cockpit, REX Memory, Agents, Dev, Comms, Settings)
- [ ] Clicking Cockpit → no sidebar, Health page
- [ ] Clicking REX Memory → sidebar shows 5 items + 2 quick actions
- [ ] Sidebar collapse button works → icons only + tooltips
- [ ] Expand button brings back labels
- [ ] Status footer (daemon + tokens) visible when expanded
- [ ] All pages still render (no regressions)

**Step 3: Commit**
```bash
git add -A
git commit -m "feat(flutter): UX redesign — pill top bar + contextual collapsible sidebar"
```

---

## Task 7: Finalize open-source repo (email)

**Files:**
- Modify: `packages/cli/package.json` line ~35
- Modify: `.github/SECURITY.md` line ~11
- Modify: `.github/CODE_OF_CONDUCT.md` line ~25

Replace `kevin@dstudio.company` with `rex@dstudio.company` in all 3 files.

```bash
git add packages/cli/package.json .github/SECURITY.md .github/CODE_OF_CONDUCT.md
git commit -m "chore: use role-based email for open-source contacts"
```

---

## Summary

| Task | Files | Effort |
|------|-------|--------|
| 1. Nav data model | `rex_nav.dart` (new) | ~50 lignes |
| 2. RexTopBar | `rex_topbar.dart` (new) | ~80 lignes |
| 3. RexContextualSidebar | `rex_contextual_sidebar.dart` (new) | ~200 lignes |
| 4. Quick actions | `rex_nav.dart` (update) | ~40 lignes |
| 5. Rewire main.dart | `main.dart` (update) | ~30 lignes |
| 6. Build + verify | — | 5 min |
| 7. OSS cleanup | 3 files | 3 lignes |

**`rex_sidebar.dart` peut être supprimé après validation.**
