import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class ReviewPage extends StatefulWidget {
  const ReviewPage({super.key});

  @override
  State<ReviewPage> createState() => _ReviewPageState();
}

class _ReviewPageState extends State<ReviewPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final rex = context.read<RexService>();
      rex.checkPrePushGate();
      if (rex.reviewResults.isEmpty && !rex.isReviewing) {
        rex.runReview(mode: 'quick');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Review',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.play_fill,
          label: 'Quick',
          onPressed: () => context.read<RexService>().runReview(mode: 'quick'),
        ),
        RexHeaderButton(
          icon: CupertinoIcons.checkmark_shield_fill,
          label: 'Full',
          onPressed: () => context.read<RexService>().runReview(mode: 'full'),
        ),
        RexHeaderButton(
          icon: CupertinoIcons.sparkles,
          label: 'AI',
          onPressed: () => context.read<RexService>().runReview(mode: 'ai'),
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            if (rex.isReviewing) {
              return const Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    CupertinoActivityIndicator(radius: 14),
                    SizedBox(height: 16),
                    Text(
                      'Running review pipeline…',
                      style: TextStyle(
                        fontSize: 14,
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                  ],
                ),
              );
            }

            if (rex.reviewResults.isEmpty) {
              return RexEmptyState(
                icon: CupertinoIcons.checkmark_shield,
                title: 'No review data',
                subtitle: 'Run Quick or Full review to check the codebase.',
                actionLabel: 'Run Quick Review',
                onAction: () => rex.runReview(mode: 'quick'),
              );
            }

            final results = rex.reviewResults;
            final passed = results.where((r) => r['status'] == 'ok').length;
            final warned = results.where((r) => r['status'] == 'warn').length;
            final failed = results.where((r) => r['status'] == 'fail').length;
            final skipped = results.where((r) => r['status'] == 'skip').length;

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                _ReviewBanner(
                  passed: passed,
                  warned: warned,
                  failed: failed,
                  total: results.length,
                ),
                const SizedBox(height: 16),
                // Stats
                Row(
                  children: [
                    Expanded(
                      child: _StatMini(
                        label: 'Passed',
                        value: '$passed',
                        color: CupertinoColors.systemGreen,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _StatMini(
                        label: 'Warnings',
                        value: '$warned',
                        color: CupertinoColors.systemYellow,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _StatMini(
                        label: 'Failed',
                        value: '$failed',
                        color: CupertinoColors.systemRed,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _StatMini(
                        label: 'Skipped',
                        value: '$skipped',
                        color: CupertinoColors.systemGrey,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Section header
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    'Results — ${rex.reviewMode.toUpperCase()} mode',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5,
                      color: context.rex.textSecondary,
                    ),
                  ),
                ),
                // Results list
                RexCard(
                  child: Column(
                    children: [
                      for (int i = 0; i < results.length; i++) ...[
                        _ReviewRow(result: results[i]),
                        if (i < results.length - 1)
                          Container(height: 1, color: context.rex.separator),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                // Pre-push gate toggle
                RexCard(
                  child: RexToggleRow(
                    label: 'Pre-push gate',
                    subtitle: 'Block git push if secrets or TS errors found',
                    value: rex.prePushGateEnabled,
                    onChanged: (v) => rex.togglePrePushGate(enable: v),
                  ),
                ),
                const SizedBox(height: 8),
                // Hint
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Row(
                    children: [
                      Icon(
                        CupertinoIcons.info_circle,
                        size: 13,
                        color: context.rex.textTertiary,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Quick: TS + secrets  ·  Full: + lint + tests  ·  AI: LLM review',
                        style: TextStyle(
                          fontSize: 12,
                          color: context.rex.textTertiary,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

// ── Banner ─────────────────────────────────────────────────────────────────

class _ReviewBanner extends StatelessWidget {
  const _ReviewBanner({
    required this.passed,
    required this.warned,
    required this.failed,
    required this.total,
  });

  final int passed;
  final int warned;
  final int failed;
  final int total;

  @override
  Widget build(BuildContext context) {
    final hasIssues = failed > 0;
    final hasWarnings = warned > 0;

    final color = hasIssues
        ? CupertinoColors.systemRed
        : hasWarnings
            ? CupertinoColors.systemYellow
            : CupertinoColors.systemGreen;

    final label = hasIssues
        ? '$failed issue${failed != 1 ? 's' : ''} found'
        : hasWarnings
            ? '$warned warning${warned != 1 ? 's' : ''}'
            : 'All checks passed';

    final icon = hasIssues
        ? CupertinoIcons.xmark_circle_fill
        : hasWarnings
            ? CupertinoIcons.exclamationmark_triangle_fill
            : CupertinoIcons.checkmark_circle_fill;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.20)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 22),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                  color: color,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                '$passed of $total checks passed',
                style: TextStyle(fontSize: 12, color: context.rex.textSecondary),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Mini stat ───────────────────────────────────────────────────────────────

class _StatMini extends StatelessWidget {
  const _StatMini({
    required this.label,
    required this.value,
    required this.color,
  });

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
      decoration: BoxDecoration(
        color: context.rex.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            value,
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
          ),
        ],
      ),
    );
  }
}

// ── Result row ──────────────────────────────────────────────────────────────

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.result});

  final Map<String, dynamic> result;

  RexChipStatus _chipStatus(String s) => switch (s) {
        'ok' => RexChipStatus.ok,
        'warn' => RexChipStatus.warning,
        'fail' => RexChipStatus.error,
        _ => RexChipStatus.inactive,
      };

  (IconData, Color) _iconAndColor(String s) => switch (s) {
        'ok' => (CupertinoIcons.checkmark_circle_fill, CupertinoColors.systemGreen),
        'warn' => (CupertinoIcons.exclamationmark_triangle_fill, CupertinoColors.systemYellow),
        'fail' => (CupertinoIcons.xmark_circle_fill, CupertinoColors.systemRed),
        _ => (CupertinoIcons.minus_circle, CupertinoColors.systemGrey),
      };

  @override
  Widget build(BuildContext context) {
    final name = result['name'] as String? ?? '?';
    final statusStr = result['status'] as String? ?? 'skip';
    final message = result['message'] as String? ?? '';
    final (icon, color) = _iconAndColor(statusStr);
    final chipLabel = statusStr == 'ok' ? 'pass' : statusStr;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: context.rex.text,
                  ),
                ),
                if (message.isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    message,
                    style: TextStyle(fontSize: 12, color: context.rex.textSecondary),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          RexStatusChip(
            label: chipLabel,
            status: _chipStatus(statusStr),
            small: true,
          ),
        ],
      ),
    );
  }
}
