import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class TokenPage extends StatefulWidget {
  const TokenPage({super.key});
  @override
  State<TokenPage> createState() => _TokenPageState();
}

class _TokenPageState extends State<TokenPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final rex = context.read<RexService>();
      rex.loadBurnRate();
      rex.checkSessionGuard();
    });
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Token Analytics',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () {
            context.read<RexService>().loadBurnRate();
            context.read<RexService>().checkSessionGuard();
          },
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            final br = rex.burnRate;
            final sg = rex.sessionGuard;
            final signal = sg['signal'] as Map<String, dynamic>?;
            final alerted = (sg['alerted'] as List?)?.cast<String>() ?? [];

            if (br.isEmpty && sg.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const CupertinoActivityIndicator(),
                    const SizedBox(height: 12),
                    Text('Loading token data...',
                        style: TextStyle(fontSize: 13, color: context.rex.textSecondary)),
                  ],
                ),
              );
            }

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Compact signal warning banner
                if (signal != null) _CompactSignalBanner(signal: signal),
                if (signal != null) const SizedBox(height: 12),

                // Context + Daily progress
                _UsageBanner(br: br, sg: sg),
                const SizedBox(height: 16),

                // Session metrics
                RexSection(title: 'Session', icon: CupertinoIcons.clock),
                _SessionCard(br: br),
                const SizedBox(height: 8),

                // Burn rate
                RexSection(title: 'Burn Rate', icon: CupertinoIcons.flame),
                _BurnRateCard(br: br),
                const SizedBox(height: 8),

                // Daily totals
                RexSection(title: 'Daily Budget', icon: CupertinoIcons.calendar),
                _DailyCard(br: br),
                const SizedBox(height: 8),

                // Session guard alerts
                RexSection(title: 'Session Guard', icon: CupertinoIcons.shield_lefthalf_fill),
                _SessionGuardCard(sg: sg, alerted: alerted, onClear: () => rex.clearCompactSignal()),
                const SizedBox(height: 20),
              ],
            );
          },
        );
      },
    );
  }
}

// ── Compact Signal Banner ─────────────────────────────────────────────────────

class _CompactSignalBanner extends StatelessWidget {
  final Map<String, dynamic> signal;
  const _CompactSignalBanner({required this.signal});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final reason = (signal['reason'] as String?) ?? '';
    final ctxPct = (signal['contextPercent'] as num?)?.toDouble() ?? 0.0;
    final hint = (signal['hint'] as String?) ?? '';
    final ts = (signal['ts'] as String?) ?? '';

    final isCritical = reason.contains('95');
    final isHigh = reason.contains('85');

    final color = isCritical ? c.error : isHigh ? c.warning : c.warning;
    final icon = isCritical ? CupertinoIcons.exclamationmark_triangle_fill : CupertinoIcons.exclamationmark_circle_fill;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withAlpha(20),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withAlpha(80)),
      ),
      child: Row(children: [
        Icon(icon, size: 20, color: color),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(
            isCritical ? 'Context was critical (${ctxPct.toStringAsFixed(0)}%)' : 'Context was high (${ctxPct.toStringAsFixed(0)}%)',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color),
          ),
          const SizedBox(height: 2),
          Text(hint, style: TextStyle(fontSize: 12, color: c.textSecondary)),
          if (ts.isNotEmpty)
            Text(_formatTs(ts), style: TextStyle(fontSize: 11, color: c.textTertiary)),
        ])),
        CupertinoButton(
          padding: EdgeInsets.zero,
          minSize: 30,
          onPressed: () => context.read<RexService>().clearCompactSignal(),
          child: Icon(CupertinoIcons.xmark_circle, size: 18, color: c.textTertiary),
        ),
      ]),
    );
  }

  String _formatTs(String ts) {
    try {
      final dt = DateTime.parse(ts).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return 'Detected at $h:$m';
    } catch (_) {
      return ts;
    }
  }
}

// ── Usage Banner ──────────────────────────────────────────────────────────────

class _UsageBanner extends StatelessWidget {
  final Map<String, dynamic> br;
  final Map<String, dynamic> sg;
  const _UsageBanner({required this.br, required this.sg});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final ctxPct = (br['contextPercent'] as num?)?.toDouble() ?? (sg['contextPercent'] as num?)?.toDouble() ?? 0.0;
    final dayPct = (br['dailyPercent'] as num?)?.toDouble() ?? (sg['dailyPercent'] as num?)?.toDouble() ?? 0.0;
    final ctxColor = ctxPct >= 95 ? c.error : ctxPct >= 70 ? c.warning : c.success;
    final dayColor = dayPct >= 100 ? c.error : dayPct >= 80 ? c.warning : c.success;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: c.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: c.separator),
      ),
      child: Column(children: [
        _BarRow(label: 'Context', percent: ctxPct, color: ctxColor),
        const SizedBox(height: 16),
        _BarRow(label: 'Daily', percent: dayPct, color: dayColor),
      ]),
    );
  }
}

class _BarRow extends StatelessWidget {
  final String label;
  final double percent;
  final Color color;
  const _BarRow({required this.label, required this.percent, required this.color});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: c.text)),
        const Spacer(),
        Text('${percent.toStringAsFixed(1)}%',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: color)),
      ]),
      const SizedBox(height: 6),
      RexProgressBar(
        value: (percent / 100).clamp(0.0, 1.0),
        color: color,
        height: 8,
      ),
    ]);
  }
}

// ── Session Card ──────────────────────────────────────────────────────────────

class _SessionCard extends StatelessWidget {
  final Map<String, dynamic> br;
  const _SessionCard({required this.br});
  @override
  Widget build(BuildContext context) {
    final sessionTotal = (br['sessionTotal'] as int?) ?? 0;
    final sessionIn = (br['sessionTokensIn'] as int?) ?? 0;
    final sessionOut = (br['sessionTokensOut'] as int?) ?? 0;
    final durationMs = (br['sessionDurationMs'] as int?) ?? 0;
    final contextUsed = (br['contextUsed'] as int?) ?? 0;
    final contextTotal = (br['contextTotal'] as int?) ?? 200000;

    return RexCard(
      child: Column(children: [
        RexStatRow(
          label: 'Session tokens',
          value: _fmt(sessionTotal),
          icon: CupertinoIcons.square_stack,
        ),
        RexStatRow(
          label: 'Tokens in',
          value: _fmt(sessionIn),
          icon: CupertinoIcons.arrow_down,
        ),
        RexStatRow(
          label: 'Tokens out',
          value: _fmt(sessionOut),
          icon: CupertinoIcons.arrow_up,
        ),
        RexStatRow(
          label: 'Duration',
          value: _fmtDuration(durationMs),
          icon: CupertinoIcons.timer,
        ),
        RexStatRow(
          label: 'Context used',
          value: '${_fmt(contextUsed)} / ${_fmt(contextTotal)}',
          icon: CupertinoIcons.chart_bar,
        ),
      ]),
    );
  }

  String _fmt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return n.toString();
  }

  String _fmtDuration(int ms) {
    if (ms <= 0) return '—';
    if (ms < 60000) return '${(ms / 1000).round()}s';
    if (ms < 3600000) return '${(ms / 60000).round()}m';
    return '${(ms / 3600000).toStringAsFixed(1)}h';
  }
}

// ── Burn Rate Card ────────────────────────────────────────────────────────────

class _BurnRateCard extends StatelessWidget {
  final Map<String, dynamic> br;
  const _BurnRateCard({required this.br});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final perMin = (br['burnRatePerMin'] as int?) ?? 0;
    final perHour = (br['burnRatePerHour'] as int?) ?? 0;
    final estMins = (br['estimatedMinutesLeft'] as num?)?.toDouble();
    final depletionAt = (br['estimatedDepletionAt'] as String?);

    return RexCard(
      child: Column(children: [
        RexStatRow(
          label: 'Burn rate / min',
          value: '${_fmt(perMin)} tok',
          icon: CupertinoIcons.speedometer,
        ),
        RexStatRow(
          label: 'Burn rate / hr',
          value: '${_fmt(perHour)} tok',
          icon: CupertinoIcons.chart_bar_alt_fill,
        ),
        if (estMins != null)
          RexStatRow(
            label: 'Est. remaining',
            value: _fmtMins(estMins),
            icon: CupertinoIcons.hourglass,
            valueColor: estMins < 30 ? c.error : estMins < 60 ? c.warning : null,
          ),
        if (depletionAt != null && depletionAt.isNotEmpty)
          RexStatRow(
            label: 'Est. depletion',
            value: _fmtTime(depletionAt),
            icon: CupertinoIcons.alarm,
          ),
      ]),
    );
  }

  String _fmt(int n) {
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return n.toString();
  }

  String _fmtMins(double mins) {
    if (mins < 60) return '${mins.round()}min';
    return '${(mins / 60).toStringAsFixed(1)}h';
  }

  String _fmtTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour.toString().padLeft(2, '0');
      final m = dt.minute.toString().padLeft(2, '0');
      return '$h:$m';
    } catch (_) {
      return iso;
    }
  }
}

// ── Daily Card ────────────────────────────────────────────────────────────────

class _DailyCard extends StatelessWidget {
  final Map<String, dynamic> br;
  const _DailyCard({required this.br});
  @override
  Widget build(BuildContext context) {
    final dailyIn = (br['dailyTokensIn'] as int?) ?? 0;
    final dailyOut = (br['dailyTokensOut'] as int?) ?? 0;
    final dailyTotal = (br['dailyTotal'] as int?) ?? 0;
    final dailyLimit = (br['dailyLimit'] as int?) ?? 5000000;
    final dailyPct = (br['dailyPercent'] as num?)?.toDouble() ?? 0.0;
    final c = context.rex;

    return RexCard(
      child: Column(children: [
        RexStatRow(
          label: 'Daily total',
          value: _fmt(dailyTotal),
          icon: CupertinoIcons.sum,
        ),
        RexStatRow(
          label: 'Input tokens',
          value: _fmt(dailyIn),
          icon: CupertinoIcons.arrow_down,
        ),
        RexStatRow(
          label: 'Output tokens',
          value: _fmt(dailyOut),
          icon: CupertinoIcons.arrow_up,
        ),
        RexStatRow(
          label: 'Daily limit',
          value: _fmt(dailyLimit),
          icon: CupertinoIcons.gauge,
        ),
        const SizedBox(height: 10),
        RexProgressBar(
          value: (dailyPct / 100).clamp(0.0, 1.0),
          color: dailyPct >= 100 ? c.error : dailyPct >= 80 ? c.warning : c.success,
          height: 6,
        ),
        const SizedBox(height: 6),
        Text('${dailyPct.toStringAsFixed(1)}% of daily limit used',
            style: TextStyle(fontSize: 11, color: c.textTertiary)),
      ]),
    );
  }

  String _fmt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return n.toString();
  }
}

// ── Session Guard Card ────────────────────────────────────────────────────────

class _SessionGuardCard extends StatelessWidget {
  final Map<String, dynamic> sg;
  final List<String> alerted;
  final VoidCallback onClear;
  const _SessionGuardCard({required this.sg, required this.alerted, required this.onClear});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final compactNeeded = sg['compactNeeded'] == true;
    final signal = sg['signal'] as Map<String, dynamic>?;

    RexChipStatus guardStatus = RexChipStatus.ok;
    String guardLabel = 'Healthy';
    if (compactNeeded) {
      guardStatus = RexChipStatus.error;
      guardLabel = 'Compact Needed';
    } else if (alerted.isNotEmpty) {
      guardStatus = RexChipStatus.pending;
      guardLabel = 'Alert Active';
    }

    return RexCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          RexStatusChip(label: guardLabel, status: guardStatus, small: true),
          const Spacer(),
          if (compactNeeded)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: c.error.withAlpha(20),
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: c.error.withAlpha(60)),
              ),
              child: Text('Run /compact in Claude',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.error)),
            ),
        ]),
        const SizedBox(height: 12),
        // Thresholds
        _ThresholdRow(label: 'Context 70%', fired: alerted.contains('context-70')),
        _ThresholdRow(label: 'Context 85%', fired: alerted.contains('context-85')),
        _ThresholdRow(label: 'Context 95%', fired: alerted.contains('context-95')),
        _ThresholdRow(label: 'Daily 80%', fired: alerted.contains('daily-80')),
        _ThresholdRow(label: 'Daily 100%', fired: alerted.contains('daily-100')),
        if (signal != null) ...[
          const SizedBox(height: 12),
          Container(height: 0.5, color: c.separator),
          const SizedBox(height: 10),
          Row(children: [
            Icon(CupertinoIcons.exclamationmark_circle, size: 14, color: c.warning),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Compact signal: ${signal['reason']} at ${(signal['contextPercent'] as num?)?.toStringAsFixed(0)}%',
                style: TextStyle(fontSize: 12, color: c.warning),
              ),
            ),
          ]),
        ],
        const SizedBox(height: 14),
        Row(children: [
          RexButton(
            label: 'Clear Signal',
            icon: CupertinoIcons.trash,
            variant: RexButtonVariant.secondary,
            small: true,
            onPressed: onClear,
          ),
        ]),
      ]),
    );
  }
}

class _ThresholdRow extends StatelessWidget {
  final String label;
  final bool fired;
  const _ThresholdRow({required this.label, required this.fired});
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [
        Icon(
          fired ? CupertinoIcons.checkmark_circle_fill : CupertinoIcons.circle,
          size: 14,
          color: fired ? c.warning : c.textTertiary,
        ),
        const SizedBox(width: 8),
        Text(label, style: TextStyle(fontSize: 12, color: fired ? c.text : c.textTertiary)),
      ]),
    );
  }
}
