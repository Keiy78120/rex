import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart'
    show CircularProgressIndicator, AlwaysStoppedAnimation, LinearProgressIndicator;
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
      final rex = context.read<RexService>();
      rex.loadBackgroundProcesses();
      rex.loadBurnRate();
      rex.checkSessionGuard();
      rex.loadDevMonitor();
      rex.loadSystemMetrics();
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
            final rex = context.read<RexService>();
            rex.runDoctor();
            rex.loadBackgroundProcesses();
            rex.loadBurnRate();
            rex.checkSessionGuard();
            rex.loadDevMonitor();
            rex.loadSystemMetrics();
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
                // Token budget
                if (rex.burnRate.isNotEmpty || rex.sessionGuard.isNotEmpty) ...[
                  _TokenBudgetSection(
                    burnRate: rex.burnRate,
                    sessionGuard: rex.sessionGuard,
                    onClearSignal: () => rex.clearCompactSignal(),
                  ),
                  const SizedBox(height: 20),
                ],
                // System Metrics
                if (rex.systemMetrics.isNotEmpty) ...[
                  _SystemMetricsSection(metrics: rex.systemMetrics),
                  const SizedBox(height: 20),
                ],
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
                // Dev Activity
                if (rex.devMonitor.isNotEmpty || rex.isLoadingDevMonitor) ...[
                  _DevActivitySection(monitor: rex.devMonitor, loading: rex.isLoadingDevMonitor),
                  const SizedBox(height: 8),
                ],
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
                    const SizedBox(width: 8),
                    RexButton(
                      label: 'Quick Setup',
                      icon: CupertinoIcons.sparkles,
                      variant: RexButtonVariant.secondary,
                      small: true,
                      onPressed: () => rex.runQuickSetup(),
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

class _TokenBudgetSection extends StatelessWidget {
  final Map<String, dynamic> burnRate;
  final Map<String, dynamic> sessionGuard;
  final VoidCallback onClearSignal;

  const _TokenBudgetSection({
    required this.burnRate,
    required this.sessionGuard,
    required this.onClearSignal,
  });

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final shouldCompact = sessionGuard['compactNeeded'] == true;
    final contextPct = (burnRate['contextPercent'] as num?)?.toDouble() ?? 0;
    final guardMsg = sessionGuard['signal'] as String? ?? '';

    final dailyPct = (burnRate['dailyPercent'] as num?)?.toDouble() ?? 0;
    final dailyTokens = (burnRate['dailyTotal'] as num?)?.toInt() ?? 0;
    final dailyLimit = (burnRate['dailyLimit'] as num?)?.toInt() ?? 0;
    final tokensPerHour = (burnRate['burnRatePerHour'] as num?)?.toInt() ?? 0;

    Color barColor(double pct) {
      if (pct >= 90) return c.error;
      if (pct >= 70) return c.warning;
      return c.success;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RexSection(title: 'Token Budget', icon: CupertinoIcons.bolt_circle),
        // Compact alert banner
        if (shouldCompact)
          Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: c.error.withAlpha(25),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: c.error.withAlpha(80)),
            ),
            child: Row(
              children: [
                Icon(CupertinoIcons.exclamationmark_triangle_fill, size: 16, color: c.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    guardMsg.isNotEmpty ? guardMsg : 'Context near limit — compact recommended',
                    style: TextStyle(fontSize: 12, color: c.text),
                  ),
                ),
                const SizedBox(width: 8),
                RexButton(
                  label: 'Dismiss',
                  variant: RexButtonVariant.secondary,
                  small: true,
                  onPressed: onClearSignal,
                ),
              ],
            ),
          ),
        RexCard(
          child: Column(
            children: [
              // Context window
              if (contextPct > 0) ...[
                Row(
                  children: [
                    Text('Context', style: TextStyle(fontSize: 12, color: c.textSecondary)),
                    const Spacer(),
                    Text(
                      '${contextPct.round()}%',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: barColor(contextPct),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                RexProgressBar(
                  value: (contextPct / 100).clamp(0.0, 1.0),
                  color: barColor(contextPct),
                  height: 6,
                ),
                const SizedBox(height: 14),
              ],
              // Daily usage
              if (dailyLimit > 0) ...[
                Row(
                  children: [
                    Text('Daily tokens', style: TextStyle(fontSize: 12, color: c.textSecondary)),
                    const Spacer(),
                    Text(
                      '${_fmt(dailyTokens)} / ${_fmt(dailyLimit)}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: barColor(dailyPct),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                RexProgressBar(
                  value: (dailyPct / 100).clamp(0.0, 1.0),
                  color: barColor(dailyPct),
                  height: 6,
                ),
                if (tokensPerHour > 0) ...[
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Icon(CupertinoIcons.flame, size: 12, color: c.textTertiary),
                      const SizedBox(width: 4),
                      Text(
                        '${_fmt(tokensPerHour)} tok/h',
                        style: TextStyle(fontSize: 11, color: c.textTertiary),
                      ),
                    ],
                  ),
                ],
              ],
              // Fallback: no data yet
              if (contextPct == 0 && dailyLimit == 0)
                Text(
                  'No token data — run a session to see usage',
                  style: TextStyle(fontSize: 12, color: c.textSecondary),
                ),
            ],
          ),
        ),
      ],
    );
  }

  String _fmt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(0)}k';
    return '$n';
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

// ── Dev Activity ──────────────────────────────────────────────────────────────

class _DevActivitySection extends StatelessWidget {
  final Map<String, dynamic> monitor;
  final bool loading;

  const _DevActivitySection({required this.monitor, required this.loading});

  @override
  Widget build(BuildContext context) {
    if (loading && monitor.isEmpty) {
      return Column(
        children: [
          RexSection(title: 'Dev Activity (24h)', icon: CupertinoIcons.chart_bar_alt_fill),
          const RexCard(child: Center(child: Padding(
            padding: EdgeInsets.all(12),
            child: CupertinoActivityIndicator(),
          ))),
        ],
      );
    }

    final commits = monitor['totalCommits'] as int? ?? 0;
    final sessions = monitor['sessionCount'] as int? ?? 0;
    final pending = monitor['pendingMemories'] as int? ?? 0;
    // topProjects available via monitor['topProjects'] if needed
    final commitsList = (monitor['commits'] as List<dynamic>?)
        ?.whereType<Map<String, dynamic>>()
        .take(5)
        .toList() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RexSection(title: 'Dev Activity (24h)', icon: CupertinoIcons.chart_bar_alt_fill),
        RexCard(
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(child: _ActivityStat(label: 'Sessions', value: '$sessions', icon: CupertinoIcons.bolt_fill)),
                  const SizedBox(width: 10),
                  Expanded(child: _ActivityStat(label: 'Commits', value: '$commits', icon: CupertinoIcons.arrow_branch)),
                  const SizedBox(width: 10),
                  Expanded(child: _ActivityStat(label: 'Pending', value: '$pending', icon: CupertinoIcons.tray_arrow_down)),
                ],
              ),
              if (commitsList.isNotEmpty) ...[
                const SizedBox(height: 12),
                Container(height: 0.5, color: context.rex.separator),
                const SizedBox(height: 8),
                ...commitsList.map((c) {
                  final count = c['count'] as int? ?? 0;
                  final repo = c['repo'] as String? ?? '?';
                  final msg = (c['lastMessage'] as String? ?? '').replaceAll('\n', ' ');
                  final barWidth = (count.clamp(0, 10) / 10.0);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 60,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(2),
                            child: LinearProgressIndicator(
                              value: barWidth,
                              backgroundColor: context.rex.separator,
                              valueColor: AlwaysStoppedAnimation(context.rex.accent),
                              minHeight: 5,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                repo,
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.rex.text),
                              ),
                              Text(
                                msg.length > 55 ? '${msg.substring(0, 55)}…' : msg,
                                style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '$count',
                          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: context.rex.accent),
                        ),
                      ],
                    ),
                  );
                }),
              ] else if (!loading) ...[
                const SizedBox(height: 8),
                Text(
                  'No commits in the last 24h.',
                  style: TextStyle(fontSize: 12, color: context.rex.textTertiary),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _ActivityStat extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;

  const _ActivityStat({required this.label, required this.value, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 16, color: context.rex.accent),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: context.rex.text),
        ),
        Text(
          label,
          style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
        ),
      ],
    );
  }
}

// ── System Metrics ─────────────────────────────────────────────────────────────

class _SystemMetricsSection extends StatelessWidget {
  final Map<String, dynamic> metrics;
  const _SystemMetricsSection({required this.metrics});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final sys = (metrics['system'] as Map<String, dynamic>?) ?? {};
    final ingest = (metrics['ingest'] as Map<String, dynamic>?) ?? {};
    final hub = (metrics['hub'] as Map<String, dynamic>?) ?? {};
    final daemon = (metrics['daemon'] as Map<String, dynamic>?) ?? {};

    final ramPct = (sys['ramUsedPct'] as num?)?.toDouble() ?? 0;
    final cpuCount = (sys['cpuCount'] as num?)?.toInt() ?? 0;
    final uptimeSec = (sys['uptimeSec'] as num?)?.toInt() ?? 0;
    final uptimeMin = uptimeSec ~/ 60;
    final pendingChunks = (ingest['pendingCount'] as num?)?.toInt() ?? 0;
    final hubReachable = hub['reachable'] == true;
    final hubNodes = (hub['nodeCount'] as num?)?.toInt() ?? 0;
    final hubHealthy = (hub['healthyNodes'] as num?)?.toInt() ?? 0;
    final daemonUp = daemon['pidFileExists'] == true;

    Color ramColor() {
      if (ramPct >= 90) return c.error;
      if (ramPct >= 75) return c.warning;
      return c.success;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RexSection(title: 'System Metrics', icon: CupertinoIcons.speedometer),
        RexCard(
          child: Column(
            children: [
              // RAM usage bar
              Row(
                children: [
                  Text('RAM', style: TextStyle(fontSize: 12, color: c.textSecondary)),
                  const Spacer(),
                  Text(
                    '${ramPct.round()}%',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ramColor()),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              RexProgressBar(
                value: (ramPct / 100).clamp(0.0, 1.0),
                color: ramColor(),
                height: 5,
              ),
              const SizedBox(height: 12),
              // Stat row
              Row(
                children: [
                  Expanded(child: _MiniStat(label: 'CPUs', value: '$cpuCount', icon: CupertinoIcons.memories)),
                  Expanded(child: _MiniStat(label: 'Uptime', value: '${uptimeMin}m', icon: CupertinoIcons.clock)),
                  Expanded(child: _MiniStat(
                    label: 'Ingest',
                    value: '$pendingChunks',
                    icon: CupertinoIcons.tray_arrow_down,
                    valueColor: pendingChunks > 100 ? c.warning : null,
                  )),
                  Expanded(child: _MiniStat(
                    label: 'Daemon',
                    value: daemonUp ? 'on' : 'off',
                    icon: CupertinoIcons.gear_alt,
                    valueColor: daemonUp ? c.success : c.error,
                  )),
                ],
              ),
              if (hubReachable || hubNodes > 0) ...[
                const SizedBox(height: 12),
                Container(height: 0.5, color: c.separator),
                const SizedBox(height: 10),
                Row(
                  children: [
                    RexStatusChip(
                      label: hubReachable ? 'Hub Online' : 'Hub Offline',
                      status: hubReachable ? RexChipStatus.ok : RexChipStatus.error,
                      small: true,
                    ),
                    const SizedBox(width: 10),
                    if (hubReachable && hubNodes > 0)
                      Text(
                        '$hubHealthy/$hubNodes specialists',
                        style: TextStyle(fontSize: 12, color: c.textSecondary),
                      ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color? valueColor;

  const _MiniStat({
    required this.label,
    required this.value,
    required this.icon,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, size: 13, color: context.rex.textTertiary),
        const SizedBox(height: 4),
        Text(
          value,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: valueColor ?? context.rex.text,
          ),
        ),
        Text(label, style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
      ],
    );
  }
}
