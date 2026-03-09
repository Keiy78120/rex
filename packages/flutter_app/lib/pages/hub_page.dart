import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class HubPage extends StatefulWidget {
  const HubPage({super.key});
  @override
  State<HubPage> createState() => _HubPageState();
}

class _HubPageState extends State<HubPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final rex = context.read<RexService>();
      rex.loadFleetNodes();
      rex.loadHqSnapshot();
    });
  }

  void _refresh() {
    final rex = context.read<RexService>();
    rex.loadFleetNodes();
    rex.loadHqSnapshot();
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Commander',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _refresh,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            final hq = rex.hqSnapshot;
            final fleet = hq['fleet'] as Map<String, dynamic>? ?? {};
            final budget = hq['budget'] as Map<String, dynamic>? ?? {};
            final memory = hq['memory'] as Map<String, dynamic>? ?? {};
            final agents = hq['agents'] as Map<String, dynamic>? ?? {};
            final alerts = (hq['alerts'] as List?)
                ?.whereType<Map<String, dynamic>>()
                .toList() ?? [];
            final nodes = rex.fleetNodes;
            final summary = rex.fleetSummary;

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                // Fleet Summary
                RexSection(
                  title: 'Fleet',
                  icon: CupertinoIcons.antenna_radiowaves_left_right,
                ),
                RexCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      RexKpiRow(items: [
                        RexKpiItem(
                          value: '${summary['total'] ?? nodes.length}',
                          label: 'TOTAL',
                        ),
                        RexKpiItem(
                          value: '${summary['healthy'] ?? fleet['healthy'] ?? 0}',
                          label: 'HEALTHY',
                          valueColor: context.rex.success,
                        ),
                        RexKpiItem(
                          value: '${summary['stale'] ?? fleet['stale'] ?? 0}',
                          label: 'STALE',
                          valueColor: context.rex.warning,
                        ),
                        RexKpiItem(
                          value: '${summary['offline'] ?? fleet['offline'] ?? 0}',
                          label: 'OFFLINE',
                          valueColor: (summary['offline'] ?? fleet['offline'] ?? 0) > 0
                              ? context.rex.error
                              : context.rex.textTertiary,
                        ),
                      ]),
                      if (nodes.isNotEmpty) ...[
                        Container(
                          height: 0.5,
                          color: context.rex.separator,
                          margin: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        ...nodes.map((node) => _NodeRow(node: node)),
                      ],
                      if (nodes.isEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            'No nodes registered. Start the daemon to join the mesh.',
                            style: TextStyle(
                              fontSize: 12,
                              color: context.rex.textSecondary,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),

                // HQ Overview
                if (hq.isNotEmpty) ...[
                  RexSection(title: 'HQ Overview', icon: CupertinoIcons.gauge),
                  RexCard(
                    child: RexKpiRow(items: [
                      RexKpiItem(
                        value: '${memory['totalMemories'] ?? 0}',
                        label: 'MEMORIES',
                      ),
                      RexKpiItem(
                        value: '${memory['pendingChunks'] ?? 0}',
                        label: 'PENDING',
                        valueColor: (memory['pendingChunks'] as int? ?? 0) > 100
                            ? context.rex.warning
                            : null,
                      ),
                      RexKpiItem(
                        value: '${agents['activeSessions'] ?? 0}',
                        label: 'SESSIONS',
                      ),
                      RexKpiItem(
                        value: '${((budget['burnRatePerHour'] as num? ?? 0) / 1000).toStringAsFixed(1)}k/h',
                        label: 'BURN RATE',
                      ),
                    ]),
                  ),
                  const SizedBox(height: 8),
                ],

                // Active Agents
                if ((agents['profiles'] as List?)?.isNotEmpty == true) ...[
                  RexSection(title: 'Active Agents', icon: CupertinoIcons.sparkles),
                  RexCard(
                    child: Column(
                      children: (agents['profiles'] as List)
                          .whereType<Map<String, dynamic>>()
                          .map((p) => Padding(
                                padding: const EdgeInsets.only(bottom: 4),
                                child: Row(children: [
                                  RexStatusChip(
                                    label: p['name'] as String? ?? 'agent',
                                    status: (p['running'] as bool? ?? false)
                                        ? RexChipStatus.ok
                                        : RexChipStatus.inactive,
                                    small: true,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${p['profile'] as String? ?? ''} · ${p['model'] as String? ?? ''}',
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: context.rex.textSecondary,
                                    ),
                                  ),
                                ]),
                              ))
                          .toList(),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],

                // Alerts
                if (alerts.isNotEmpty) ...[
                  RexSection(title: 'Alerts', icon: CupertinoIcons.exclamationmark_triangle_fill),
                  RexCard(
                    child: Column(
                      children: alerts.map((alert) {
                        final level = alert['level'] as String? ?? 'warn';
                        final source = alert['source'] as String? ?? '';
                        final message = alert['message'] as String? ?? '';
                        final isCritical = level == 'critical';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(children: [
                            RexStatusChip(
                              label: source,
                              status: isCritical
                                  ? RexChipStatus.error
                                  : RexChipStatus.warning,
                              small: true,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                message,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isCritical
                                      ? context.rex.error
                                      : context.rex.warning,
                                ),
                              ),
                            ),
                          ]),
                        );
                      }).toList(),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],

                if (hq.isEmpty && nodes.isEmpty)
                  const RexEmptyState(
                    icon: CupertinoIcons.antenna_radiowaves_left_right,
                    title: 'Commander Offline',
                    subtitle: 'Start the REX daemon to activate the Commander.',
                  ),
              ],
            );
          },
        );
      },
    );
  }
}

class _NodeRow extends StatelessWidget {
  final Map<String, dynamic> node;
  const _NodeRow({required this.node});

  @override
  Widget build(BuildContext context) {
    final status = node['status'] as String? ?? 'healthy';
    final hostname = node['hostname'] as String? ?? 'unknown';
    final ip = node['ip'] as String? ?? '';
    final caps = (node['capabilities'] as List?)
        ?.whereType<String>()
        .toList() ?? [];
    final capacity = node['capacity'] as Map<String, dynamic>?;
    final cpuCores = capacity?['cpuCores'] as int?;
    final ramGb = capacity?['ramGb'] as int?;
    final models = (capacity?['ollamaModels'] as List?)?.length ?? 0;

    final dotColor = status == 'healthy'
        ? CupertinoColors.systemGreen
        : status == 'stale'
            ? CupertinoColors.systemYellow
            : CupertinoColors.systemRed;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            width: 7,
            height: 7,
            margin: const EdgeInsets.only(top: 1),
            decoration: BoxDecoration(color: dotColor, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Text(
                    hostname,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.rex.text,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    ip,
                    style: TextStyle(
                      fontSize: 11,
                      color: context.rex.textTertiary,
                    ),
                  ),
                  if (cpuCores != null) ...[
                    const SizedBox(width: 8),
                    Text(
                      '${cpuCores}c ${ramGb ?? '?'}GB${models > 0 ? ' $models models' : ''}',
                      style: TextStyle(
                        fontSize: 11,
                        color: context.rex.textTertiary,
                      ),
                    ),
                  ],
                ]),
                if (caps.isNotEmpty)
                  Wrap(
                    spacing: 4,
                    runSpacing: 2,
                    children: caps
                        .map((c) => Container(
                              margin: const EdgeInsets.only(top: 4),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: context.rex.accent.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                c,
                                style: TextStyle(
                                  fontSize: 10,
                                  color: context.rex.accent,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ))
                        .toList(),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
