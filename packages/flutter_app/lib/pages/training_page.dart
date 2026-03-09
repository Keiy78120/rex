import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';


// ── Entry Point ───────────────────────────────────────────────────────────────

class TrainingPage extends StatefulWidget {
  const TrainingPage({super.key});

  @override
  State<TrainingPage> createState() => _TrainingPageState();
}

// ── State ─────────────────────────────────────────────────────────────────────

class _TrainingPageState extends State<TrainingPage> {
  int _tab = 0; // 0=Dataset, 1=Jobs, 2=Routing
  final _routeController = TextEditingController();
  Map<String, dynamic> _routeDecision = {};
  bool _routeLoading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final svc = context.read<RexService>();
      svc.loadTrainingStats();
      svc.loadTrainingJobs();
    });
  }

  @override
  void dispose() {
    _routeController.dispose();
    super.dispose();
  }

  Future<void> _testRoute() async {
    final msg = _routeController.text.trim();
    if (msg.isEmpty) return;
    setState(() => _routeLoading = true);
    final decision = await context.read<RexService>().getRoutingDecision(msg);
    setState(() {
      _routeDecision = decision;
      _routeLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Training',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: () {
            final svc = context.read<RexService>();
            svc.loadTrainingStats();
            svc.loadTrainingJobs();
          },
        ),
      ],
      builder: (context, _) {
        return Column(
          children: [
            _TabBar(selected: _tab, onChanged: (i) => setState(() => _tab = i)),
            Expanded(
              child: IndexedStack(
                index: _tab,
                children: [
                  _DatasetTab(onTrainStart: () => setState(() => _tab = 1)),
                  const _JobsTab(),
                  _RoutingTab(
                    controller: _routeController,
                    decision: _routeDecision,
                    loading: _routeLoading,
                    onTest: _testRoute,
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

// ── Tab Bar ───────────────────────────────────────────────────────────────────

class _TabBar extends StatelessWidget {
  const _TabBar({required this.selected, required this.onChanged});
  final int selected;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final tabs = ['Dataset', 'Jobs', 'Routing'];
    return Container(
      height: 40,
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(bottom: BorderSide(color: context.rex.separator)),
      ),
      child: Row(
        children: [
          const SizedBox(width: 16),
          ...tabs.asMap().entries.map((e) {
            final active = e.key == selected;
            return GestureDetector(
              onTap: () => onChanged(e.key),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(
                      color: active ? context.rex.accent : const Color(0x00000000),
                      width: 2,
                    ),
                  ),
                ),
                child: Text(
                  e.value,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                    color: active ? context.rex.accent : context.rex.textSecondary,
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}

// ── Dataset Tab ───────────────────────────────────────────────────────────────

class _DatasetTab extends StatelessWidget {
  const _DatasetTab({required this.onTrainStart});
  final VoidCallback onTrainStart;

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final stats = rex.trainingStats;
        final examples = (stats['examples'] as num?)?.toInt() ?? 0;
        final minLen = (stats['minLength'] as num?)?.toInt() ?? 50;
        final backend = (stats['backend'] as String?) ?? 'auto';

        return SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RexCard(
                title: 'Training Dataset',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    RexStatRow(
                      label: 'Examples available',
                      value: examples > 0 ? '$examples messages' : '—',
                      valueColor: examples > 100 ? context.rex.success : null,
                    ),
                    const SizedBox(height: 4),
                    RexStatRow(
                      label: 'Min message length',
                      value: '$minLen tokens',
                    ),
                    const SizedBox(height: 4),
                    RexStatRow(
                      label: 'Detected backend',
                      value: backend,
                      valueColor: backend != 'none' ? context.rex.success : null,
                    ),
                    if (examples == 0) ...[
                      const SizedBox(height: 12),
                      RexEmptyState(
                        icon: CupertinoIcons.chart_bar,
                        title: 'No training data yet',
                        subtitle: 'Run rex ingest first to collect sessions',
                      ),
                    ],
                  ],
                ),
              ),
              RexCard(
                title: 'How fine-tuning works',
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _PolicyRow(
                      dot: '1',
                      label: 'Collect',
                      desc: 'rex train collect — extract user/assistant pairs from memory',
                    ),
                    const SizedBox(height: 8),
                    _PolicyRow(
                      dot: '2',
                      label: 'Export',
                      desc: 'rex train export — write JSONL to ~/.claude/rex/training/',
                    ),
                    const SizedBox(height: 8),
                    _PolicyRow(
                      dot: '3',
                      label: 'Train (mlx-lm)',
                      desc: 'Apple Silicon: python3 -m mlx_lm.lora + LoRA adapter saved',
                    ),
                    const SizedBox(height: 8),
                    _PolicyRow(
                      dot: '4',
                      label: 'Train (OpenAI)',
                      desc: 'Uploads JSONL + creates gpt-4o-mini fine-tune job automatically',
                    ),
                  ],
                ),
              ),
              if (examples > 0) ...[
                Row(
                  children: [
                    Expanded(
                      child: _ActionButton(
                        label: 'Export Dataset',
                        icon: CupertinoIcons.arrow_down_doc,
                        onPressed: () async {
                          final path = await rex.exportTrainingData();
                          if (context.mounted) {
                            _showInfo(context, 'Exported to: $path');
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _ActionButton(
                        label: rex.isTraining ? 'Training…' : 'Start Training',
                        icon: CupertinoIcons.bolt_fill,
                        accent: true,
                        onPressed: rex.isTraining
                            ? null
                            : () async {
                                final ok = await rex.startTraining();
                                if (context.mounted) {
                                  if (ok) {
                                    onTrainStart();
                                  } else {
                                    _showInfo(context, 'Training failed — check logs');
                                  }
                                }
                              },
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _showInfo(BuildContext context, String msg) {
    showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Training'),
        content: Text(msg),
        actions: [
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────────

class _JobsTab extends StatelessWidget {
  const _JobsTab();

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final jobs = rex.trainingJobs;
        if (jobs.isEmpty) {
          return const Center(
            child: RexEmptyState(
              icon: CupertinoIcons.clock,
              title: 'No training jobs yet',
              subtitle: 'Start training from the Dataset tab.',
            ),
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: jobs.length,
          itemBuilder: (context, i) {
            final job = jobs[i];
            final status = (job['status'] as String?) ?? 'unknown';
            final model = (job['model'] as String?) ?? '?';
            final backend = (job['backend'] as String?) ?? '?';
            final examples = (job['examples'] as num?)?.toInt() ?? 0;
            final steps = (job['steps'] as num?)?.toInt() ?? 0;
            final adapter = job['adapterPath'] as String?;
            final err = job['error'] as String?;

            return RexCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      RexStatusChip(label: status, status: _statusToChip(status)),
                      const SizedBox(width: 8),
                      Text(
                        '$backend · $model',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.rex.text),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  RexStatRow(label: 'Examples', value: '$examples'),
                  if (steps > 0) ...[
                    const SizedBox(height: 4),
                    RexStatRow(label: 'Steps', value: '$steps'),
                  ],
                  if (adapter != null) ...[
                    const SizedBox(height: 4),
                    RexStatRow(label: 'Adapter', value: adapter),
                  ],
                  if (err != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      err,
                      style: TextStyle(fontSize: 11, color: context.rex.error),
                    ),
                  ],
                ],
              ),
            );
          },
        );
      },
    );
  }

  RexChipStatus _statusToChip(String status) {
    switch (status) {
      case 'completed':
        return RexChipStatus.ok;
      case 'running':
        return RexChipStatus.pending;
      case 'failed':
        return RexChipStatus.error;
      default:
        return RexChipStatus.inactive;
    }
  }
}

// ── Routing Tab ───────────────────────────────────────────────────────────────

class _RoutingTab extends StatelessWidget {
  const _RoutingTab({
    required this.controller,
    required this.decision,
    required this.loading,
    required this.onTest,
  });
  final TextEditingController controller;
  final Map<String, dynamic> decision;
  final bool loading;
  final VoidCallback onTest;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Policy overview
          RexCard(
            title: 'Routing Policy — Tier Decision Tree',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _PolicyRow(dot: '0', dotColor: 'green', label: 'SCRIPT', desc: 'git, file ops, memory SQL, health → instant, 0 tokens'),
                const SizedBox(height: 6),
                _PolicyRow(dot: '1', dotColor: 'green', label: 'LOCAL', desc: 'Ollama (qwen, deepseek) → <3s, 0 cost, private'),
                const SizedBox(height: 6),
                _PolicyRow(dot: '2', dotColor: 'green', label: 'FREE TIER', desc: 'Groq/Cerebras (Ollama offline) → <5s, 0 cost'),
                const SizedBox(height: 6),
                _PolicyRow(dot: '3', dotColor: 'orange', label: 'SONNET', desc: 'Complex code, cross-file, nuanced → subscription'),
                const SizedBox(height: 6),
                _PolicyRow(dot: '4', dotColor: 'red', label: 'OPUS', desc: 'Architecture, strategy, orchestration → max 3/day'),
                const SizedBox(height: 6),
                _PolicyRow(dot: '5', dotColor: 'blue', label: 'CODEX', desc: 'Background, file mods, context >80% → non-interactive'),
              ],
            ),
          ),
          // Routing simulator
          RexCard(
            title: 'Routing Simulator',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                CupertinoTextField(
                  controller: controller,
                  placeholder: 'Type a task or question…',
                  style: TextStyle(fontSize: 13, color: context.rex.text),
                  onSubmitted: (_) => onTest(),
                  suffix: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: loading ? null : onTest,
                      child: Icon(
                        loading ? CupertinoIcons.hourglass : CupertinoIcons.arrow_right_circle_fill,
                        size: 20,
                        color: loading ? context.rex.textTertiary : context.rex.accent,
                      ),
                    ),
                  ),
                ),
                if (decision.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  _RoutingResult(decision: decision),
                ],
              ],
            ),
          ),
          RexCard(
            title: 'Interconnection',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Opus → produces PLAN → Sonnet executes → Local handles subtasks\n'
                  'All tiers share REX memory and tools via tool-adapter\n'
                  'Tools injected by REX, not re-explained per model\n'
                  'Zero LLM calls for routing itself — pure heuristics',
                  style: TextStyle(fontSize: 12, color: context.rex.textSecondary, height: 1.6),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RoutingResult extends StatelessWidget {
  const _RoutingResult({required this.decision});
  final Map<String, dynamic> decision;

  @override
  Widget build(BuildContext context) {
    final tier = (decision['tier'] as String?) ?? '?';
    final model = (decision['model'] as String?) ?? '?';
    final reason = (decision['reason'] as String?) ?? '';
    final cost = (decision['estimatedCost'] as String?) ?? '';
    final confidence = ((decision['confidence'] as num?)?.toDouble() ?? 0) * 100;

    final tierColor = _tierColor(tier, context);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.rex.card,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: tierColor, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(
                tier.toUpperCase(),
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: tierColor),
              ),
              const SizedBox(width: 8),
              Text('→ $model', style: TextStyle(fontSize: 13, color: context.rex.text)),
            ],
          ),
          const SizedBox(height: 8),
          RexStatRow(label: 'Reason', value: reason),
          const SizedBox(height: 4),
          RexStatRow(label: 'Est. cost', value: cost),
          const SizedBox(height: 4),
          RexStatRow(label: 'Confidence', value: '${confidence.round()}%'),
        ],
      ),
    );
  }

  Color _tierColor(String tier, BuildContext context) {
    switch (tier) {
      case 'script':
      case 'local':
      case 'free-tier':
        return context.rex.success;
      case 'sonnet':
        return context.rex.warning;
      case 'opus':
        return context.rex.error;
      case 'codex':
        return const Color(0xFF4A9EFF);
      default:
        return context.rex.textTertiary;
    }
  }
}

// ── Shared Widgets ────────────────────────────────────────────────────────────

class _PolicyRow extends StatelessWidget {
  const _PolicyRow({
    required this.dot,
    required this.label,
    required this.desc,
    this.dotColor = 'gray',
  });
  final String dot;
  final String label;
  final String desc;
  final String dotColor;

  @override
  Widget build(BuildContext context) {
    final Color dc;
    switch (dotColor) {
      case 'green':
        dc = context.rex.success;
        break;
      case 'orange':
        dc = context.rex.warning;
        break;
      case 'red':
        dc = context.rex.error;
        break;
      case 'blue':
        dc = const Color(0xFF4A9EFF);
        break;
      default:
        dc = context.rex.textTertiary;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 18,
          height: 18,
          margin: const EdgeInsets.only(top: 1),
          decoration: BoxDecoration(
            color: dc.withValues(alpha: 0.15),
            borderRadius: BorderRadius.circular(4),
          ),
          child: Center(
            child: Text(
              dot,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: dc),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.rex.text)),
              Text(desc, style: TextStyle(fontSize: 11, color: context.rex.textSecondary)),
            ],
          ),
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.accent = false,
  });
  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool accent;

  @override
  Widget build(BuildContext context) {
    final color = accent ? context.rex.accent : context.rex.textSecondary;
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
        decoration: BoxDecoration(
          color: accent ? context.rex.accent.withValues(alpha: 0.1) : context.rex.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: accent ? context.rex.accent.withValues(alpha: 0.3) : context.rex.separator),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: onPressed == null ? context.rex.textTertiary : color),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w500,
                color: onPressed == null ? context.rex.textTertiary : color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
