import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart'
    show CircularProgressIndicator, AlwaysStoppedAnimation, Divider;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

class HealthPage extends StatelessWidget {
  const HealthPage({super.key});

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('Health'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Refresh',
            icon: const MacosIcon(CupertinoIcons.refresh),
            onPressed: () => context.read<RexService>().runDoctor(),
            showLabel: false,
          ),
        ],
      ),
      children: [
        ContentArea(
          builder: (context, scrollController) {
            return Consumer<RexService>(
              builder: (context, rex, _) {
                if (rex.isLoading && rex.healthGroups.isEmpty) {
                  return const Center(child: ProgressCircle());
                }

                return ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  children: [
                    // Status banner
                    _StatusBanner(
                      status: rex.healthStatus,
                      groups: rex.healthGroups,
                    ),
                    const SizedBox(height: 20),
                    // Check groups
                    ...rex.healthGroups.map(
                      (group) => _CheckGroupCard(group: group),
                    ),
                    const SizedBox(height: 20),
                    // Quick actions
                    _QuickActions(),
                  ],
                );
              },
            );
          },
        ),
      ],
    );
  }
}

class _StatusBanner extends StatelessWidget {
  final String status;
  final List<CheckGroup> groups;

  const _StatusBanner({required this.status, required this.groups});

  @override
  Widget build(BuildContext context) {
    final allResults = groups.expand((g) => g.results).toList();
    final passed = allResults.where((r) => r.status == 'pass').length;
    final total = allResults.length;

    Color statusColor;
    IconData icon;
    switch (status) {
      case 'healthy':
        statusColor = CupertinoColors.systemGreen;
        icon = CupertinoIcons.checkmark_shield_fill;
        break;
      case 'degraded':
        statusColor = CupertinoColors.systemYellow;
        icon = CupertinoIcons.exclamationmark_shield_fill;
        break;
      default:
        statusColor = CupertinoColors.systemRed;
        icon = CupertinoIcons.xmark_shield_fill;
    }

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [statusColor.withAlpha(30), statusColor.withAlpha(10)],
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: statusColor.withAlpha(60)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 48, color: statusColor),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                status.toUpperCase(),
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color: statusColor,
                ),
              ),
              Text(
                '$passed/$total checks passed',
                style: MacosTheme.of(context).typography.subheadline,
              ),
            ],
          ),
          const Spacer(),
          // Progress ring
          SizedBox(
            width: 60,
            height: 60,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: total > 0 ? passed / total : 0,
                  backgroundColor: statusColor.withAlpha(30),
                  valueColor: AlwaysStoppedAnimation(statusColor),
                  strokeWidth: 6,
                ),
                Text(
                  total > 0 ? '${(passed / total * 100).round()}%' : '-',
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CheckGroupCard extends StatelessWidget {
  final CheckGroup group;

  const _CheckGroupCard({required this.group});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
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
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: Row(
                children: [
                  Text(group.icon, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  Text(
                    group.name,
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  const Spacer(),
                  Text(
                    '${group.passed}/${group.total}',
                    style: TextStyle(
                      fontSize: 12,
                      color: group.passed == group.total
                          ? CupertinoColors.systemGreen
                          : CupertinoColors.systemOrange,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            ...group.results.map((result) => _CheckResultRow(result: result)),
          ],
        ),
      ),
    );
  }
}

class _CheckResultRow extends StatelessWidget {
  final CheckResult result;

  const _CheckResultRow({required this.result});

  @override
  Widget build(BuildContext context) {
    IconData icon;
    Color color;
    switch (result.status) {
      case 'pass':
        icon = CupertinoIcons.checkmark_circle_fill;
        color = CupertinoColors.systemGreen;
        break;
      case 'warn':
        icon = CupertinoIcons.exclamationmark_triangle_fill;
        color = CupertinoColors.systemYellow;
        break;
      default:
        icon = CupertinoIcons.xmark_circle_fill;
        color = CupertinoColors.systemRed;
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Row(
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 8),
          Text(result.name, style: const TextStyle(fontSize: 13)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              result.message,
              style: TextStyle(
                fontSize: 12,
                color: MacosTheme.of(context).typography.subheadline.color,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final rex = context.read<RexService>();
    return Row(
      children: [
        Expanded(
          child: _ActionCard(
            icon: CupertinoIcons.arrow_2_circlepath,
            label: 'Re-init',
            onTap: () => rex.runInit(),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _ActionCard(
            icon: CupertinoIcons.tray_arrow_down,
            label: 'Ingest',
            onTap: () => rex.runIngest(),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _ActionCard(
            icon: CupertinoIcons.trash,
            label: 'Prune',
            onTap: () => rex.runPrune(),
          ),
        ),
      ],
    );
  }
}

class _ActionCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  const _ActionCard({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
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
        child: Column(
          children: [
            Icon(icon, size: 24, color: const Color(0xFF6366F1)),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }
}
