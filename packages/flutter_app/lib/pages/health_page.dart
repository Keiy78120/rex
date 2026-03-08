import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart'
    show CircularProgressIndicator, AlwaysStoppedAnimation;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class HealthPage extends StatefulWidget {
  const HealthPage({super.key});

  @override
  State<HealthPage> createState() => _HealthPageState();
}

class _HealthPageState extends State<HealthPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadBackgroundProcesses();
    });
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Health',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () {
            context.read<RexService>().runDoctor();
            context.read<RexService>().loadBackgroundProcesses();
          },
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            if (rex.isLoading && rex.healthGroups.isEmpty) {
              return const Center(child: CupertinoActivityIndicator());
            }

            if (!rex.isLoading && rex.healthGroups.isEmpty) {
              return RexEmptyState(
                icon: CupertinoIcons.heart_slash,
                title: 'No health data',
                subtitle: 'Run a health check to see system status.',
                actionLabel: 'Run Doctor',
                onAction: () => rex.runDoctor(),
              );
            }

            final allResults = rex.healthGroups.expand((g) => g.results).toList();
            final passed = allResults.where((r) => r.status == 'pass').length;
            final warned = allResults.where((r) => r.status == 'warn').length;
            final failed = allResults.where((r) => r.status == 'fail').length;
            final total = allResults.length;

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Status banner
                _StatusBanner(
                  status: rex.healthStatus,
                  passed: passed,
                  total: total,
                ),
                const SizedBox(height: 16),
                // Quick stats row
                Row(
                  children: [
                    Expanded(
                      child: _StatMini(
                        icon: CupertinoIcons.checkmark_circle_fill,
                        label: 'Passed',
                        value: '$passed',
                        color: context.rex.success,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _StatMini(
                        icon: CupertinoIcons.exclamationmark_triangle_fill,
                        label: 'Warnings',
                        value: '$warned',
                        color: context.rex.warning,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _StatMini(
                        icon: CupertinoIcons.xmark_circle_fill,
                        label: 'Failed',
                        value: '$failed',
                        color: context.rex.error,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: _StatMini(
                        icon: CupertinoIcons.gear_alt,
                        label: 'Processes',
                        value: '${rex.backgroundProcesses.where((p) => p.running).length}/${rex.backgroundProcesses.length}',
                        color: context.rex.accent,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Background processes
                if (rex.backgroundProcesses.isNotEmpty) ...[
                  RexSection(title: 'Background Processes', icon: CupertinoIcons.gear_alt),
                  RexCard(
                    child: Column(
                      children: rex.backgroundProcesses.map((proc) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            children: [
                              RexStatusChip(
                                label: proc.running ? 'Running' : 'Stopped',
                                status: proc.running ? RexChipStatus.ok : RexChipStatus.error,
                                small: true,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      proc.label,
                                      style: TextStyle(fontSize: 13, color: context.rex.text),
                                    ),
                                    if (proc.pid != null)
                                      Text(
                                        'PID ${proc.pid}',
                                        style: TextStyle(
                                          fontSize: 10,
                                          fontFamily: 'Menlo',
                                          color: context.rex.textTertiary,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              if (!proc.running)
                                RexButton(
                                  label: 'Start',
                                  icon: CupertinoIcons.play_fill,
                                  variant: RexButtonVariant.success,
                                  small: true,
                                  onPressed: () => context.read<RexService>().restartProcess(proc.name),
                                ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                // Check groups
                RexSection(title: 'Health Checks', icon: CupertinoIcons.checkmark_shield),
                ...rex.healthGroups.map(
                  (group) => _CheckGroupCard(group: group),
                ),
                const SizedBox(height: 8),
                // Quick actions
                RexSection(title: 'Quick Actions', icon: CupertinoIcons.bolt),
                Row(
                  children: [
                    RexButton(
                      label: 'Re-init',
                      icon: CupertinoIcons.arrow_2_circlepath,
                      variant: RexButtonVariant.secondary,
                      small: true,
                      onPressed: () => rex.runInit(),
                    ),
                    const SizedBox(width: 8),
                    RexButton(
                      label: 'Ingest',
                      icon: CupertinoIcons.tray_arrow_down,
                      variant: RexButtonVariant.secondary,
                      small: true,
                      onPressed: () => rex.runIngest(),
                    ),
                    const SizedBox(width: 8),
                    RexButton(
                      label: 'Prune',
                      icon: CupertinoIcons.trash,
                      variant: RexButtonVariant.secondary,
                      small: true,
                      onPressed: () => rex.runPrune(),
                    ),
                  ],
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _StatusBanner extends StatelessWidget {
  final String status;
  final int passed;
  final int total;

  const _StatusBanner({required this.status, required this.passed, required this.total});

  @override
  Widget build(BuildContext context) {
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
                style: TextStyle(
                  fontSize: 13,
                  color: context.rex.textSecondary,
                ),
              ),
            ],
          ),
          const Spacer(),
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
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 13,
                    color: context.rex.text,
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

class _StatMini extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color color;

  const _StatMini({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
      decoration: BoxDecoration(
        color: context.rex.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(height: 6),
          Text(
            value,
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: context.rex.text,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: context.rex.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}

class _CheckGroupCard extends StatefulWidget {
  final CheckGroup group;

  const _CheckGroupCard({required this.group});

  @override
  State<_CheckGroupCard> createState() => _CheckGroupCardState();
}

class _CheckGroupCardState extends State<_CheckGroupCard> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    final allPassed = group.passed == group.total;
    return RexCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            behavior: HitTestBehavior.opaque,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: Row(
                children: [
                  Text(group.icon, style: TextStyle(fontSize: 16, color: context.rex.text)),
                  const SizedBox(width: 8),
                  Text(
                    group.name,
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                      color: context.rex.text,
                    ),
                  ),
                  const Spacer(),
                  RexStatusChip(
                    label: '${group.passed}/${group.total}',
                    status: allPassed ? RexChipStatus.ok : RexChipStatus.warning,
                    small: true,
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    _expanded ? CupertinoIcons.chevron_up : CupertinoIcons.chevron_down,
                    size: 12,
                    color: context.rex.textTertiary,
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            Container(height: 0.5, color: context.rex.separator),
            ...group.results.map((result) => _CheckResultRow(result: result)),
            const SizedBox(height: 4),
          ],
        ],
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
          Text(result.name, style: TextStyle(fontSize: 13, color: context.rex.text)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              result.message,
              style: TextStyle(
                fontSize: 12,
                color: context.rex.textSecondary,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
