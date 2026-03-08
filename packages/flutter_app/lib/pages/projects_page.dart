import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class ProjectsPage extends StatefulWidget {
  const ProjectsPage({super.key});

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> {
  bool _loading = false;
  String _filter = '';
  String _stackFilter = 'all';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    await context.read<RexService>().loadProjects();
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Projects',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Scan',
          onPressed: _load,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            if (_loading) {
              return const Center(child: CupertinoActivityIndicator(radius: 12));
            }

            final allStacks = _allStacks(rex.projects);
            final filtered = _filterProjects(rex.projects);

            return Column(
              children: [
                // Filter bar
                _FilterBar(
                  filter: _filter,
                  stackFilter: _stackFilter,
                  stacks: allStacks,
                  onFilterChanged: (v) => setState(() => _filter = v),
                  onStackChanged: (v) => setState(() => _stackFilter = v),
                ),
                // Content
                Expanded(
                  child: filtered.isEmpty
                      ? RexEmptyState(
                          icon: CupertinoIcons.folder,
                          title: rex.projects.isEmpty ? 'No projects found' : 'No matches',
                          subtitle: rex.projects.isEmpty
                              ? 'REX scans ~/Documents/Developer for projects automatically.'
                              : 'Try clearing the filter.',
                          actionLabel: rex.projects.isEmpty ? 'Scan Now' : null,
                          onAction: rex.projects.isEmpty ? _load : null,
                        )
                      : ListView.separated(
                          controller: scrollController,
                          padding: const EdgeInsets.all(20),
                          itemCount: filtered.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) => _ProjectCard(project: filtered[i]),
                        ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  List<String> _allStacks(List<Map<String, dynamic>> projects) {
    final Set<String> stacks = {};
    for (final p in projects) {
      final stack = (p['stack'] as List?)?.cast<String>() ?? [];
      stacks.addAll(stack);
    }
    return stacks.toList()..sort();
  }

  List<Map<String, dynamic>> _filterProjects(List<Map<String, dynamic>> projects) {
    var result = projects;
    if (_filter.isNotEmpty) {
      final q = _filter.toLowerCase();
      result = result.where((p) {
        final name = (p['name'] as String? ?? '').toLowerCase();
        final path = (p['path'] as String? ?? '').toLowerCase();
        return name.contains(q) || path.contains(q);
      }).toList();
    }
    if (_stackFilter != 'all') {
      result = result.where((p) {
        final stack = (p['stack'] as List?)?.cast<String>() ?? [];
        return stack.contains(_stackFilter);
      }).toList();
    }
    return result;
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.filter,
    required this.stackFilter,
    required this.stacks,
    required this.onFilterChanged,
    required this.onStackChanged,
  });

  final String filter;
  final String stackFilter;
  final List<String> stacks;
  final ValueChanged<String> onFilterChanged;
  final ValueChanged<String> onStackChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(bottom: BorderSide(color: context.rex.separator)),
      ),
      child: Column(
        children: [
          // Search field
          Container(
            decoration: BoxDecoration(
              color: context.rex.card,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: context.rex.separator),
            ),
            child: CupertinoTextField(
              placeholder: 'Filter projects…',
              placeholderStyle: TextStyle(fontSize: 13, color: context.rex.textTertiary),
              style: TextStyle(fontSize: 13, color: context.rex.text),
              decoration: const BoxDecoration(),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              prefix: Padding(
                padding: const EdgeInsets.only(left: 10),
                child: Icon(CupertinoIcons.search, size: 14, color: context.rex.textTertiary),
              ),
              onChanged: onFilterChanged,
            ),
          ),
          // Stack filter chips
          if (stacks.isNotEmpty) ...[
            const SizedBox(height: 8),
            SizedBox(
              height: 26,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  _StackChip(label: 'all', selected: stackFilter == 'all', onTap: () => onStackChanged('all')),
                  for (final s in stacks)
                    _StackChip(label: s, selected: stackFilter == s, onTap: () => onStackChanged(s)),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _StackChip extends StatelessWidget {
  const _StackChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 6),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: selected ? context.rex.accent.withValues(alpha: 0.12) : context.rex.card,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: selected ? context.rex.accent.withValues(alpha: 0.30) : context.rex.separator,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? context.rex.accent : context.rex.textSecondary,
          ),
        ),
      ),
    );
  }
}

// ── Project Card ─────────────────────────────────────────────────────────────

class _ProjectCard extends StatefulWidget {
  const _ProjectCard({required this.project});

  final Map<String, dynamic> project;

  @override
  State<_ProjectCard> createState() => _ProjectCardState();
}

class _ProjectCardState extends State<_ProjectCard> {
  bool _hovered = false;

  Color _stackColor(String tech) => switch (tech) {
        'next.js' || 'react' => const Color(0xFF61DAFB),
        'flutter' || 'dart' => const Color(0xFF54C5F8),
        'typescript' || 'node' => const Color(0xFF3178C6),
        'cakephp' || 'php' => const Color(0xFF777BB4),
        'tailwind' => const Color(0xFF38BDF8),
        'cloudflare-workers' => const Color(0xFFF48120),
        'angular' || 'ionic' => const Color(0xFFDD0031),
        'sqlite' || 'drizzle' => const Color(0xFF0089D6),
        _ => CupertinoColors.systemGrey,
      };

  @override
  Widget build(BuildContext context) {
    final name = widget.project['name'] as String? ?? '';
    final path = widget.project['path'] as String? ?? '';
    final stack = (widget.project['stack'] as List?)?.cast<String>() ?? [];
    final status = widget.project['status'] as String? ?? 'unknown';
    final lastActive = widget.project['lastActive'] as String? ?? '';
    final memCount = widget.project['memoryCount'] as int? ?? 0;
    final repo = widget.project['repo'] as String? ?? '';

    final isActive = status == 'active';
    final statusChip = isActive ? RexChipStatus.ok : RexChipStatus.inactive;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: _hovered ? context.rex.card.withValues(alpha: 0.95) : context.rex.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: _hovered ? context.rex.accent.withValues(alpha: 0.20) : context.rex.separator,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              children: [
                Expanded(
                  child: Text(
                    name,
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: context.rex.text),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                RexStatusChip(
                  label: status,
                  status: statusChip,
                  small: true,
                ),
              ],
            ),
            const SizedBox(height: 4),
            // Path
            Text(
              path,
              style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
              overflow: TextOverflow.ellipsis,
            ),
            // Stack chips
            if (stack.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 5,
                runSpacing: 4,
                children: stack.map((tech) {
                  final color = _stackColor(tech);
                  return Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.10),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      tech,
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w500, color: color),
                    ),
                  );
                }).toList(),
              ),
            ],
            // Footer stats
            const SizedBox(height: 8),
            Row(
              children: [
                if (memCount > 0) ...[
                  Icon(CupertinoIcons.memories, size: 12, color: context.rex.textTertiary),
                  const SizedBox(width: 4),
                  Text('$memCount memories', style: TextStyle(fontSize: 11, color: context.rex.textTertiary)),
                  const SizedBox(width: 12),
                ],
                if (repo.isNotEmpty) ...[
                  Icon(CupertinoIcons.link, size: 12, color: context.rex.textTertiary),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(repo, style: TextStyle(fontSize: 11, color: context.rex.textTertiary), overflow: TextOverflow.ellipsis),
                  ),
                ] else
                  const Spacer(),
                if (lastActive.isNotEmpty)
                  Text(_relativeDate(lastActive), style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _relativeDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      final diff = DateTime.now().difference(dt);
      if (diff.inDays == 0) return 'today';
      if (diff.inDays == 1) return 'yesterday';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      if (diff.inDays < 30) return '${(diff.inDays / 7).floor()}w ago';
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}
