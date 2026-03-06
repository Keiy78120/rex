import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart'
    show CircularProgressIndicator, AlwaysStoppedAnimation;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

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
                // Background processes
                if (rex.backgroundProcesses.isNotEmpty) ...[
                  _ProcessesSection(processes: rex.backgroundProcesses),
                  const SizedBox(height: 20),
                ],
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
                style: TextStyle(
                  fontSize: 13,
                  color: context.rex.textSecondary,
                ),
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

class _CheckGroupCard extends StatelessWidget {
  final CheckGroup group;

  const _CheckGroupCard({required this.group});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        decoration: BoxDecoration(
          color: context.rex.surfaceSecondary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: context.rex.separator),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
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
            Container(height: 0.5, color: context.rex.separator),
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

class _ProcessesSection extends StatelessWidget {
  final List<BackgroundProcess> processes;
  const _ProcessesSection({required this.processes});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Container(
      decoration: BoxDecoration(
        color: c.surfaceSecondary,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: Row(
              children: [
                Icon(CupertinoIcons.gear_alt, size: 14, color: c.text),
                const SizedBox(width: 8),
                Text(
                  'Background Processes',
                  style: TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: c.text,
                  ),
                ),
                const Spacer(),
                Text(
                  '${processes.where((p) => p.running).length}/${processes.length} active',
                  style: TextStyle(
                    fontSize: 12,
                    color: processes.every((p) => p.running)
                        ? CupertinoColors.systemGreen
                        : CupertinoColors.systemOrange,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Container(height: 0.5, color: c.separator),
          ...processes.map((proc) => _ProcessRow(proc: proc)),
        ],
      ),
    );
  }
}

class _ProcessRow extends StatelessWidget {
  final BackgroundProcess proc;
  const _ProcessRow({required this.proc});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: proc.running
                  ? CupertinoColors.systemGreen
                  : CupertinoColors.systemRed,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: (proc.running
                          ? CupertinoColors.systemGreen
                          : CupertinoColors.systemRed)
                      .withAlpha(60),
                  blurRadius: 4,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  proc.label,
                  style: TextStyle(fontSize: 13, color: c.text),
                ),
                if (proc.pid != null)
                  Text(
                    'PID ${proc.pid}',
                    style: TextStyle(
                      fontSize: 10,
                      fontFamily: 'Menlo',
                      color: c.textTertiary,
                    ),
                  ),
              ],
            ),
          ),
          if (!proc.running)
            GestureDetector(
              onTap: () => context.read<RexService>().restartProcess(proc.name),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: c.accent.withAlpha(15),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: c.accent.withAlpha(40)),
                ),
                child: Text(
                  'Start',
                  style: TextStyle(
                    fontSize: 11,
                    color: c.accent,
                    fontWeight: FontWeight.w500,
                  ),
                ),
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
          color: context.rex.surfaceSecondary,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: context.rex.separator),
        ),
        child: Column(
          children: [
            Icon(icon, size: 24, color: context.rex.accent),
            const SizedBox(height: 6),
            Text(
              label,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500, color: context.rex.text),
            ),
          ],
        ),
      ),
    );
  }
}
