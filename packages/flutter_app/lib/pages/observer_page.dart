import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

// ── Tab constants ────────────────────────────────────────────────────────────

enum _ObserverTab { runbooks, observations, habits, facts }

// ── Page ─────────────────────────────────────────────────────────────────────

class ObserverPage extends StatefulWidget {
  const ObserverPage({super.key});

  @override
  State<ObserverPage> createState() => _ObserverPageState();
}

class _ObserverPageState extends State<ObserverPage> {
  _ObserverTab _tab = _ObserverTab.runbooks;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  Future<void> _loadAll() async {
    setState(() => _loading = true);
    final rex = context.read<RexService>();
    await Future.wait([
      rex.loadRunbooks(),
      rex.loadObservations(),
      rex.loadHabits(),
      rex.loadFacts(),
    ]);
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Observer',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _loadAll,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            return Column(
              children: [
                _TabBar(current: _tab, onChanged: (t) => setState(() => _tab = t)),
                if (_loading)
                  const Expanded(
                    child: Center(child: CupertinoActivityIndicator(radius: 12)),
                  )
                else
                  Expanded(
                    child: _buildBody(rex, scrollController),
                  ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildBody(RexService rex, ScrollController sc) => switch (_tab) {
        _ObserverTab.runbooks => _RunbooksTab(runbooks: rex.runbooks, onRefresh: _loadAll, scrollController: sc),
        _ObserverTab.observations => _ObservationsTab(
            observations: rex.observations,
            stats: rex.observationStats,
            scrollController: sc,
            onRefresh: _loadAll,
          ),
        _ObserverTab.habits => _HabitsTab(habits: rex.habits, scrollController: sc),
        _ObserverTab.facts => _FactsTab(
            facts: rex.facts,
            stats: rex.factStats,
            scrollController: sc,
            onRefresh: _loadAll,
          ),
      };
}

// ── Tab bar ──────────────────────────────────────────────────────────────────

class _TabBar extends StatelessWidget {
  const _TabBar({required this.current, required this.onChanged});

  final _ObserverTab current;
  final ValueChanged<_ObserverTab> onChanged;

  static const _tabs = [
    (_ObserverTab.runbooks, 'Runbooks', CupertinoIcons.book_fill),
    (_ObserverTab.observations, 'Observations', CupertinoIcons.eye_fill),
    (_ObserverTab.habits, 'Habits', CupertinoIcons.repeat),
    (_ObserverTab.facts, 'Facts', CupertinoIcons.tag_fill),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(bottom: BorderSide(color: context.rex.separator)),
      ),
      child: Row(
        children: _tabs.map((t) {
          final (tab, label, icon) = t;
          final selected = tab == current;
          return Padding(
            padding: const EdgeInsets.only(right: 6),
            child: GestureDetector(
              onTap: () => onChanged(tab),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: selected
                      ? context.rex.accent.withValues(alpha: 0.12)
                      : const Color(0x00000000),
                  borderRadius: BorderRadius.circular(7),
                  border: Border.all(
                    color: selected
                        ? context.rex.accent.withValues(alpha: 0.30)
                        : const Color(0x00000000),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      icon,
                      size: 13,
                      color: selected ? context.rex.accent : context.rex.textSecondary,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                        color: selected ? context.rex.accent : context.rex.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Runbooks Tab ─────────────────────────────────────────────────────────────

class _RunbooksTab extends StatefulWidget {
  const _RunbooksTab({
    required this.runbooks,
    required this.onRefresh,
    required this.scrollController,
  });

  final List<Map<String, dynamic>> runbooks;
  final VoidCallback onRefresh;
  final ScrollController scrollController;

  @override
  State<_RunbooksTab> createState() => _RunbooksTabState();
}

class _RunbooksTabState extends State<_RunbooksTab> {
  bool _showAdd = false;
  final _nameCtrl = TextEditingController();
  final _triggerCtrl = TextEditingController();
  final _stepsCtrl = TextEditingController();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _triggerCtrl.dispose();
    _stepsCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final name = _nameCtrl.text.trim();
    final trigger = _triggerCtrl.text.trim();
    final steps = _stepsCtrl.text.split('\n').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
    if (name.isEmpty || trigger.isEmpty || steps.isEmpty) return;
    await context.read<RexService>().addRunbookEntry(name, trigger, steps);
    _nameCtrl.clear();
    _triggerCtrl.clear();
    _stepsCtrl.clear();
    setState(() => _showAdd = false);
    widget.onRefresh();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.runbooks.isEmpty && !_showAdd) {
      return RexEmptyState(
        icon: CupertinoIcons.book,
        title: 'No runbooks saved',
        subtitle: 'Runbooks capture workflow patterns for repeated use.',
        actionLabel: 'Add Runbook',
        onAction: () => setState(() => _showAdd = true),
      );
    }

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.all(20),
      children: [
        if (_showAdd) ...[
          _AddRunbookForm(
            nameCtrl: _nameCtrl,
            triggerCtrl: _triggerCtrl,
            stepsCtrl: _stepsCtrl,
            onSave: _save,
            onCancel: () => setState(() => _showAdd = false),
          ),
          const SizedBox(height: 16),
        ],
        if (!_showAdd)
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () => setState(() => _showAdd = true),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.plus_circle_fill, size: 14, color: context.rex.accent),
                  const SizedBox(width: 5),
                  Text(
                    'Add Runbook',
                    style: TextStyle(fontSize: 12, color: context.rex.accent, fontWeight: FontWeight.w500),
                  ),
                ],
              ),
            ),
          ),
        if (!_showAdd) const SizedBox(height: 12),
        for (final rb in widget.runbooks)
          _RunbookCard(runbook: rb, onDelete: widget.onRefresh),
      ],
    );
  }
}

class _AddRunbookForm extends StatelessWidget {
  const _AddRunbookForm({
    required this.nameCtrl,
    required this.triggerCtrl,
    required this.stepsCtrl,
    required this.onSave,
    required this.onCancel,
  });

  final TextEditingController nameCtrl;
  final TextEditingController triggerCtrl;
  final TextEditingController stepsCtrl;
  final VoidCallback onSave;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return RexCard(
      title: 'New Runbook',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Field(label: 'Name', controller: nameCtrl, placeholder: 'e.g., Fix merge conflicts'),
          const SizedBox(height: 10),
          _Field(label: 'Trigger phrase', controller: triggerCtrl, placeholder: 'e.g., merge conflict git rebase'),
          const SizedBox(height: 10),
          _Field(
            label: 'Steps (one per line)',
            controller: stepsCtrl,
            placeholder: 'Step 1\nStep 2\nStep 3',
            maxLines: 4,
          ),
          const SizedBox(height: 14),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              GestureDetector(
                onTap: onCancel,
                child: Text('Cancel', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
              ),
              const SizedBox(width: 16),
              GestureDetector(
                onTap: onSave,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: context.rex.accent,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: const Text('Save', style: TextStyle(fontSize: 12, color: CupertinoColors.white, fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RunbookCard extends StatelessWidget {
  const _RunbookCard({required this.runbook, required this.onDelete});

  final Map<String, dynamic> runbook;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final name = runbook['name'] as String? ?? 'Untitled';
    final trigger = runbook['trigger'] as String? ?? '';
    final steps = (runbook['steps'] as List?)?.cast<String>() ?? [];
    final uses = runbook['successCount'] as int? ?? 0;
    final source = runbook['source'] as String? ?? 'manual';
    final id = runbook['id'] as int? ?? 0;

    return RexCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.rex.text),
                ),
              ),
              RexStatusChip(
                label: '${uses}x',
                status: uses > 3 ? RexChipStatus.ok : RexChipStatus.inactive,
                small: true,
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: () async {
                  await context.read<RexService>().deleteRunbookEntry(id);
                  onDelete();
                },
                child: Icon(CupertinoIcons.trash, size: 14, color: context.rex.textTertiary),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Icon(CupertinoIcons.bolt, size: 12, color: context.rex.textTertiary),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  trigger,
                  style: TextStyle(fontSize: 11, color: context.rex.textSecondary, fontStyle: FontStyle.italic),
                ),
              ),
            ],
          ),
          if (steps.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (int i = 0; i < steps.length; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${i + 1}.',
                      style: TextStyle(fontSize: 12, color: context.rex.textTertiary, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        steps[i],
                        style: TextStyle(fontSize: 12, color: context.rex.text),
                      ),
                    ),
                  ],
                ),
              ),
          ],
          const SizedBox(height: 6),
          Text(
            'source: $source',
            style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
          ),
        ],
      ),
    );
  }
}

// ── Observations Tab ─────────────────────────────────────────────────────────

class _ObservationsTab extends StatefulWidget {
  const _ObservationsTab({
    required this.observations,
    required this.stats,
    required this.scrollController,
    required this.onRefresh,
  });

  final List<Map<String, dynamic>> observations;
  final Map<String, dynamic> stats;
  final ScrollController scrollController;
  final VoidCallback onRefresh;

  @override
  State<_ObservationsTab> createState() => _ObservationsTabState();
}

class _ObservationsTabState extends State<_ObservationsTab> {
  bool _showAdd = false;
  String _selectedType = 'decision';
  final _contentCtrl = TextEditingController();

  static const _types = ['decision', 'blocker', 'solution', 'error', 'pattern', 'habit'];

  @override
  void dispose() {
    _contentCtrl.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final content = _contentCtrl.text.trim();
    if (content.isEmpty) return;
    await context.read<RexService>().addObservationEntry(_selectedType, content);
    _contentCtrl.clear();
    setState(() => _showAdd = false);
    widget.onRefresh();
  }

  Color _typeColor(String type) => switch (type) {
        'decision' => CupertinoColors.systemBlue,
        'blocker' => CupertinoColors.systemRed,
        'solution' => CupertinoColors.systemGreen,
        'error' => CupertinoColors.destructiveRed,
        'pattern' => CupertinoColors.systemPurple,
        'habit' => CupertinoColors.systemOrange,
        _ => CupertinoColors.systemGrey,
      };

  @override
  Widget build(BuildContext context) {
    final byType = widget.stats['byType'] as Map<String, dynamic>? ?? {};
    final total = widget.stats['total'] as int? ?? 0;

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.all(20),
      children: [
        // Stats header
        if (total > 0) ...[
          _ObsStatsRow(byType: byType, total: total),
          const SizedBox(height: 16),
        ],

        // Add form
        if (_showAdd) ...[
          RexCard(
            title: 'Record Observation',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Type picker
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: _types.map((t) {
                    final sel = t == _selectedType;
                    return GestureDetector(
                      onTap: () => setState(() => _selectedType = t),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: sel ? _typeColor(t).withValues(alpha: 0.12) : context.rex.surface,
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(
                            color: sel ? _typeColor(t).withValues(alpha: 0.40) : context.rex.separator,
                          ),
                        ),
                        child: Text(
                          t,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: sel ? FontWeight.w600 : FontWeight.w400,
                            color: sel ? _typeColor(t) : context.rex.textSecondary,
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 10),
                _Field(
                  label: 'Content',
                  controller: _contentCtrl,
                  placeholder: 'Describe the observation…',
                  maxLines: 3,
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _showAdd = false),
                      child: Text('Cancel', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
                    ),
                    const SizedBox(width: 16),
                    GestureDetector(
                      onTap: _add,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: context.rex.accent,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: const Text('Add', style: TextStyle(fontSize: 12, color: CupertinoColors.white, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
        ],

        // Add button
        if (!_showAdd)
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () => setState(() => _showAdd = true),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.plus_circle_fill, size: 14, color: context.rex.accent),
                  const SizedBox(width: 5),
                  Text('Add Observation', style: TextStyle(fontSize: 12, color: context.rex.accent, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ),

        const SizedBox(height: 12),

        if (widget.observations.isEmpty)
          RexEmptyState(
            icon: CupertinoIcons.eye,
            title: 'No observations yet',
            subtitle: 'Record decisions, blockers, solutions, errors, and patterns.',
          )
        else
          RexCard(
            child: Column(
              children: [
                for (int i = 0; i < widget.observations.length; i++) ...[
                  _ObsRow(obs: widget.observations[i], typeColor: _typeColor),
                  if (i < widget.observations.length - 1)
                    Container(height: 1, color: context.rex.separator),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _ObsStatsRow extends StatelessWidget {
  const _ObsStatsRow({required this.byType, required this.total});

  final Map<String, dynamic> byType;
  final int total;

  @override
  Widget build(BuildContext context) {
    return RexCard(
      child: Row(
        children: [
          Icon(CupertinoIcons.eye_fill, size: 16, color: context.rex.textSecondary),
          const SizedBox(width: 8),
          Text('$total observations', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.rex.text)),
          const Spacer(),
          for (final e in byType.entries)
            Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Text(
                '${e.key}: ${e.value}',
                style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
              ),
            ),
        ],
      ),
    );
  }
}

class _ObsRow extends StatelessWidget {
  const _ObsRow({required this.obs, required this.typeColor});

  final Map<String, dynamic> obs;
  final Color Function(String) typeColor;

  @override
  Widget build(BuildContext context) {
    final type = obs['type'] as String? ?? 'unknown';
    final content = obs['content'] as String? ?? '';
    final project = obs['project'] as String? ?? '';
    final createdAt = obs['createdAt'] as String? ?? '';
    final color = typeColor(type);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 6,
            height: 6,
            margin: const EdgeInsets.only(top: 5),
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: color.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        type.toUpperCase(),
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 0.5, color: color),
                      ),
                    ),
                    if (project.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text(project, style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
                    ],
                  ],
                ),
                const SizedBox(height: 4),
                Text(content, style: TextStyle(fontSize: 13, color: context.rex.text, height: 1.4)),
                const SizedBox(height: 3),
                Text(
                  _formatDate(createdAt),
                  style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Habits Tab ────────────────────────────────────────────────────────────────

class _HabitsTab extends StatelessWidget {
  const _HabitsTab({required this.habits, required this.scrollController});

  final List<Map<String, dynamic>> habits;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    if (habits.isEmpty) {
      return RexEmptyState(
        icon: CupertinoIcons.repeat,
        title: 'No habits detected',
        subtitle: 'REX records repeated patterns automatically during sessions.',
      );
    }

    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.all(20),
      children: [
        RexCard(
          title: '${habits.length} Habit${habits.length == 1 ? '' : 's'} Tracked',
          child: Column(
            children: [
              for (int i = 0; i < habits.length; i++) ...[
                _HabitRow(habit: habits[i]),
                if (i < habits.length - 1) Container(height: 1, color: context.rex.separator),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _HabitRow extends StatelessWidget {
  const _HabitRow({required this.habit});

  final Map<String, dynamic> habit;

  @override
  Widget build(BuildContext context) {
    final pattern = habit['pattern'] as String? ?? '';
    final freq = habit['frequency'] as int? ?? 0;
    final confidence = (habit['confidence'] as num? ?? 0).toDouble();
    final barWidth = (confidence * 80).clamp(4.0, 80.0);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  pattern,
                  style: TextStyle(fontSize: 13, color: context.rex.text),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Container(
                      width: barWidth,
                      height: 3,
                      decoration: BoxDecoration(
                        color: context.rex.accent,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${(confidence * 100).toInt()}% confident',
                      style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          RexStatusChip(
            label: '${freq}×',
            status: freq >= 5 ? RexChipStatus.ok : freq >= 2 ? RexChipStatus.warning : RexChipStatus.inactive,
            small: true,
          ),
        ],
      ),
    );
  }
}

// ── Facts Tab ─────────────────────────────────────────────────────────────────

class _FactsTab extends StatefulWidget {
  const _FactsTab({
    required this.facts,
    required this.stats,
    required this.scrollController,
    required this.onRefresh,
  });

  final List<Map<String, dynamic>> facts;
  final Map<String, dynamic> stats;
  final ScrollController scrollController;
  final VoidCallback onRefresh;

  @override
  State<_FactsTab> createState() => _FactsTabState();
}

class _FactsTabState extends State<_FactsTab> {
  bool _showAdd = false;
  final _categoryCtrl = TextEditingController();
  final _contentCtrl = TextEditingController();

  @override
  void dispose() {
    _categoryCtrl.dispose();
    _contentCtrl.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final category = _categoryCtrl.text.trim();
    final content = _contentCtrl.text.trim();
    if (category.isEmpty || content.isEmpty) return;
    await context.read<RexService>().addFactEntry(category, content);
    _categoryCtrl.clear();
    _contentCtrl.clear();
    setState(() => _showAdd = false);
    widget.onRefresh();
  }

  @override
  Widget build(BuildContext context) {
    final byCategory = widget.stats['byCategory'] as Map<String, dynamic>? ?? {};
    final total = widget.stats['total'] as int? ?? 0;

    return ListView(
      controller: widget.scrollController,
      padding: const EdgeInsets.all(20),
      children: [
        // Stats
        if (total > 0) ...[
          RexCard(
            child: Row(
              children: [
                Icon(CupertinoIcons.tag_fill, size: 16, color: context.rex.textSecondary),
                const SizedBox(width: 8),
                Text('$total facts', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: context.rex.text)),
                const Spacer(),
                for (final e in byCategory.entries.take(4))
                  Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      '${e.key}: ${e.value}',
                      style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 4),
        ],

        // Add form
        if (_showAdd) ...[
          RexCard(
            title: 'New Fact',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Field(label: 'Category', controller: _categoryCtrl, placeholder: 'e.g., api, pattern, preference'),
                const SizedBox(height: 10),
                _Field(label: 'Fact', controller: _contentCtrl, placeholder: 'Write what REX should remember…', maxLines: 3),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    GestureDetector(
                      onTap: () => setState(() => _showAdd = false),
                      child: Text('Cancel', style: TextStyle(fontSize: 12, color: context.rex.textSecondary)),
                    ),
                    const SizedBox(width: 16),
                    GestureDetector(
                      onTap: _add,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          color: context.rex.accent,
                          borderRadius: BorderRadius.circular(7),
                        ),
                        child: const Text('Save', style: TextStyle(fontSize: 12, color: CupertinoColors.white, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 4),
        ],

        // Add button
        if (!_showAdd)
          Align(
            alignment: Alignment.centerRight,
            child: GestureDetector(
              onTap: () => setState(() => _showAdd = true),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(CupertinoIcons.plus_circle_fill, size: 14, color: context.rex.accent),
                  const SizedBox(width: 5),
                  Text('Add Fact', style: TextStyle(fontSize: 12, color: context.rex.accent, fontWeight: FontWeight.w500)),
                ],
              ),
            ),
          ),

        const SizedBox(height: 12),

        if (widget.facts.isEmpty)
          RexEmptyState(
            icon: CupertinoIcons.tag,
            title: 'No facts stored',
            subtitle: 'Store persistent facts REX should remember across sessions.',
          )
        else ...[
          for (final cat in byCategory.keys)
            _FactCategorySection(
              category: cat,
              facts: widget.facts.where((f) => f['category'] == cat).toList(),
            ),
          // uncategorized or all if no category grouping
          if (byCategory.isEmpty)
            RexCard(
              child: Column(
                children: [
                  for (int i = 0; i < widget.facts.length; i++) ...[
                    _FactRow(fact: widget.facts[i]),
                    if (i < widget.facts.length - 1)
                      Container(height: 1, color: context.rex.separator),
                  ],
                ],
              ),
            ),
        ],
      ],
    );
  }
}

class _FactCategorySection extends StatelessWidget {
  const _FactCategorySection({required this.category, required this.facts});

  final String category;
  final List<Map<String, dynamic>> facts;

  @override
  Widget build(BuildContext context) {
    if (facts.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Text(
            category.toUpperCase(),
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.8,
              color: context.rex.textTertiary,
            ),
          ),
        ),
        RexCard(
          child: Column(
            children: [
              for (int i = 0; i < facts.length; i++) ...[
                _FactRow(fact: facts[i]),
                if (i < facts.length - 1)
                  Container(height: 1, color: context.rex.separator),
              ],
            ],
          ),
        ),
        const SizedBox(height: 4),
      ],
    );
  }
}

class _FactRow extends StatelessWidget {
  const _FactRow({required this.fact});

  final Map<String, dynamic> fact;

  @override
  Widget build(BuildContext context) {
    final content = fact['content'] as String? ?? '';
    final source = fact['source'] as String? ?? '';
    final accessCount = fact['accessCount'] as int? ?? 0;
    final confidence = (fact['confidence'] as num? ?? 0.5).toDouble();

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(CupertinoIcons.tag, size: 13, color: context.rex.textTertiary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(content, style: TextStyle(fontSize: 13, color: context.rex.text, height: 1.4)),
                if (source.isNotEmpty || accessCount > 0) ...[
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (source.isNotEmpty)
                        Text(source, style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
                      if (source.isNotEmpty && accessCount > 0)
                        Text(' · ', style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
                      if (accessCount > 0)
                        Text('${accessCount}× accessed', style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '${(confidence * 100).toInt()}%',
            style: TextStyle(fontSize: 11, color: context.rex.textTertiary, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }
}

// ── Shared field widget ───────────────────────────────────────────────────────

class _Field extends StatelessWidget {
  const _Field({
    required this.label,
    required this.controller,
    required this.placeholder,
    this.maxLines = 1,
  });

  final String label;
  final TextEditingController controller;
  final String placeholder;
  final int maxLines;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: context.rex.textSecondary,
          ),
        ),
        const SizedBox(height: 5),
        Container(
          decoration: BoxDecoration(
            color: context.rex.surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: context.rex.separator),
          ),
          child: CupertinoTextField(
            controller: controller,
            placeholder: placeholder,
            placeholderStyle: TextStyle(fontSize: 13, color: context.rex.textTertiary),
            style: TextStyle(fontSize: 13, color: context.rex.text),
            decoration: const BoxDecoration(),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            maxLines: maxLines,
          ),
        ),
      ],
    );
  }
}
