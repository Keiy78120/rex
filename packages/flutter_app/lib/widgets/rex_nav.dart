// lib/widgets/rex_nav.dart
import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

// ── Models ─────────────────────────────────────────────────

class RexNavItem {
  final String label;
  final IconData icon;
  final int pageIndex;

  const RexNavItem({
    required this.label,
    required this.icon,
    required this.pageIndex,
  });
}

class RexQuickAction {
  final String label;
  final IconData icon;
  final void Function(BuildContext) onTap;

  const RexQuickAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });
}

class RexSection {
  final String label;
  final IconData icon;
  final List<RexNavItem> items;
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

const kCockpitPageIndex = 0;

final kRexSections = [
  // 0 — Cockpit (no sidebar)
  RexSection(
    label: 'Cockpit',
    icon: CupertinoIcons.heart_fill,
  ),

  // 1 — REX Memory
  RexSection(
    label: 'REX Memory',
    icon: CupertinoIcons.memories,
    items: const [
      RexNavItem(label: 'Search',   icon: CupertinoIcons.search,             pageIndex: 6),
      RexNavItem(label: 'Tokens',   icon: CupertinoIcons.chart_bar_alt_fill,  pageIndex: 7),
      RexNavItem(label: 'Observer', icon: CupertinoIcons.eye_fill,            pageIndex: 8),
      RexNavItem(label: 'Curious',  icon: CupertinoIcons.scope,               pageIndex: 9),
      RexNavItem(label: 'Optimize', icon: CupertinoIcons.bolt_fill,           pageIndex: 5),
    ],
    quickActions: (ctx) => [
      RexQuickAction(
        label: 'Ingest',
        icon: CupertinoIcons.arrow_down_circle,
        onTap: (ctx) => ctx.read<RexService>().runIngest(),
      ),
      RexQuickAction(
        label: 'Categorize',
        icon: CupertinoIcons.tag,
        onTap: (ctx) => ctx.read<RexService>().runCategorize(),
      ),
    ],
  ),

  // 2 — Agents
  RexSection(
    label: 'Agents',
    icon: CupertinoIcons.sparkles,
    items: const [
      RexNavItem(label: 'Agents',    icon: CupertinoIcons.sparkles,             pageIndex: 3),
      RexNavItem(label: 'MCP',       icon: CupertinoIcons.link,                 pageIndex: 4),
      RexNavItem(label: 'Providers', icon: CupertinoIcons.layers_fill,          pageIndex: 15),
      RexNavItem(label: 'Hub',       icon: CupertinoIcons.square_grid_2x2_fill, pageIndex: 16),
      RexNavItem(label: 'Clients',   icon: CupertinoIcons.person_2_fill,        pageIndex: 17),
    ],
    quickActions: (ctx) => [
      RexQuickAction(
        label: 'Refresh',
        icon: CupertinoIcons.refresh,
        onTap: (ctx) => ctx.read<RexService>().loadAgents(),
      ),
    ],
  ),

  // 3 — Dev
  RexSection(
    label: 'Dev',
    icon: CupertinoIcons.arrow_branch,
    items: const [
      RexNavItem(label: 'Workflow',  icon: CupertinoIcons.arrow_branch,           pageIndex: 10),
      RexNavItem(label: 'Projects',  icon: CupertinoIcons.folder_fill,            pageIndex: 11),
      RexNavItem(label: 'Review',    icon: CupertinoIcons.checkmark_shield_fill,  pageIndex: 12),
      RexNavItem(label: 'Guards',    icon: CupertinoIcons.lock_shield_fill,       pageIndex: 13),
      RexNavItem(label: 'Sandbox',   icon: CupertinoIcons.square_stack_3d_up,     pageIndex: 14),
      RexNavItem(label: 'Files',     icon: CupertinoIcons.doc_text_fill,          pageIndex: 23),
      RexNavItem(label: 'Training',  icon: CupertinoIcons.waveform_path_ecg,      pageIndex: 24),
      RexNavItem(label: 'Terminal',  icon: CupertinoIcons.chevron_right_square,   pageIndex: 25),
    ],
    quickActions: (ctx) => [
      RexQuickAction(
        label: 'New branch',
        icon: CupertinoIcons.arrow_branch,
        onTap: (ctx) => ctx.read<RexService>().runWorkflow('feature'),
      ),
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
    quickActions: (ctx) => [
      RexQuickAction(
        label: 'Status',
        icon: CupertinoIcons.antenna_radiowaves_left_right,
        onTap: (ctx) => ctx.read<RexService>().refreshAll(),
      ),
    ],
  ),

  // 5 — Settings
  RexSection(
    label: 'Settings',
    icon: CupertinoIcons.gear,
    items: const [
      RexNavItem(label: 'Settings', icon: CupertinoIcons.gear,     pageIndex: 22),
      RexNavItem(label: 'Logs',     icon: CupertinoIcons.doc_text,  pageIndex: 21),
    ],
  ),
];
