import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText, Color;
import 'package:macos_ui/macos_ui.dart' show MacosTextField;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

const _kCategoryColors = <String, Color>{
  'debug':        Color(0xFF5E81F4),
  'fix':          Color(0xFF4CAF50),
  'idea':         Color(0xFFFFB300),
  'architecture': Color(0xFFE91E63),
  'pattern':      Color(0xFF00BCD4),
  'lesson':       Color(0xFFFF5722),
  'config':       Color(0xFF9C27B0),
  'session':      Color(0xFF757575),
  'fact':         Color(0xFF9C27B0),
  'error':        Color(0xFFF44336),
  'feature':      Color(0xFF2196F3),
};

class MemoryPage extends StatefulWidget {
  const MemoryPage({super.key});

  @override
  State<MemoryPage> createState() => _MemoryPageState();
}

class _MemoryPageState extends State<MemoryPage> {
  final _searchController = TextEditingController();
  String _searchResults = '';
  String _statsOutput = '';
  bool _searching = false;
  bool _categorizing = false;
  bool _consolidating = false;
  Map<String, int> _categories = {};
  int _totalEntries = 0;
  String? _selectedCategory;
  List<Map<String, dynamic>> _memoryList = [];
  bool _loadingMemories = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadStats();
      context.read<RexService>().loadMemoryHealth();
      context.read<RexService>().loadSnapshots();
      context.read<RexService>().loadLessons();
      context.read<RexService>().loadRunbooks();
    });
  }

  Future<void> _loadStats() async {
    final output = await context.read<RexService>().runPrune(statsOnly: true);
    if (mounted) {
      setState(() {
        _statsOutput = output;
        _parseStats(output);
      });
    }
  }

  void _parseStats(String output) {
    _categories = {};
    _totalEntries = 0;
    for (final line in output.split('\n')) {
      final catMatch = RegExp(r'^\s*(\w+):\s*(\d+)\s*$').firstMatch(line);
      if (catMatch != null) {
        final key = catMatch.group(1)!.toLowerCase();
        final val = int.tryParse(catMatch.group(2)!) ?? 0;
        if (key == 'total') {
          _totalEntries = val;
        } else {
          _categories[key] = val;
        }
      }
      final totalMatch = RegExp(r'[Tt]otal[^:]*:\s*(\d+)').firstMatch(line);
      if (totalMatch != null && _totalEntries == 0) {
        _totalEntries = int.tryParse(totalMatch.group(1)!) ?? 0;
      }
    }
  }

  Future<void> _search() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;
    setState(() { _searching = true; _selectedCategory = null; });
    final result = await context.read<RexService>().runSearch(query);
    if (mounted) {
      setState(() {
        _searchResults = result;
        _searching = false;
      });
    }
  }

  Future<void> _runCategorize() async {
    setState(() => _categorizing = true);
    final model = context.read<RexService>().categorizingModel;
    await context.read<RexService>().runCategorize(model: model);
    if (mounted) {
      setState(() => _categorizing = false);
      _loadStats();
    }
  }

  Future<void> _runConsolidate() async {
    setState(() => _consolidating = true);
    await context.read<RexService>().runConsolidate();
    if (mounted) {
      setState(() => _consolidating = false);
      _loadStats();
    }
  }

  Future<void> _loadMemoriesByCategory(String category) async {
    if (_selectedCategory == category) {
      setState(() { _selectedCategory = null; _memoryList = []; });
      return;
    }
    setState(() {
      _selectedCategory = category;
      _loadingMemories = true;
      _memoryList = [];
    });
    final memories = await context.read<RexService>().listMemories(category: category);
    if (mounted) {
      setState(() {
        _memoryList = memories;
        _loadingMemories = false;
      });
    }
  }

  // Estimate embedding coverage from stats
  int get _embeddedCount {
    return _categories.values.fold(0, (sum, v) => sum + v);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'Memory',
      actions: [
        RexHeaderButton(
          icon: _consolidating ? CupertinoIcons.ellipsis : CupertinoIcons.arrow_merge,
          label: _consolidating ? 'Merging...' : 'Consolidate',
          onPressed: _consolidating ? null : _runConsolidate,
          showLabel: true,
        ),
        RexHeaderButton(
          icon: CupertinoIcons.trash,
          label: 'Prune',
          onPressed: () async {
            final output = await context.read<RexService>().runPrune();
            if (mounted) setState(() => _statsOutput = output);
          },
          showLabel: true,
        ),
      ],
      builder: (context, scrollController) {
        return ListView(
          controller: scrollController,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          children: [
            // Stats overview
            RexCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  RexSection(
                    title: 'Overview',
                    icon: CupertinoIcons.cube,
                    action: _totalEntries > 0
                        ? RexStatusChip(
                            label: 'pending ${_totalEntries - _embeddedCount}',
                            status: (_totalEntries - _embeddedCount) > 0
                                ? RexChipStatus.pending
                                : RexChipStatus.ok,
                            small: true,
                          )
                        : null,
                  ),
                  if (_statsOutput.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(20),
                      child: Center(child: CupertinoActivityIndicator()),
                    )
                  else ...[
                    RexStatRow(
                      label: 'Total memories',
                      value: '$_totalEntries',
                      icon: CupertinoIcons.cube,
                    ),
                    RexStatRow(
                      label: 'Categorized',
                      value: '$_embeddedCount',
                      icon: CupertinoIcons.tag,
                    ),
                    RexStatRow(
                      label: 'Categories',
                      value: '${_categories.length}',
                      icon: CupertinoIcons.collections,
                    ),
                    Consumer<RexService>(
                      builder: (context, rex, _) {
                        final health = rex.memoryHealth;
                        if (health.isEmpty) return const SizedBox.shrink();
                        final pendingCount = (health['pending']?['count'] as int?) ?? 0;
                        final duplicatesCount = (health['duplicates']?['count'] as int?) ?? 0;
                        final orphansCount = (health['orphans']?['count'] as int?) ?? 0;
                        if (pendingCount == 0 && duplicatesCount == 0 && orphansCount == 0) {
                          return RexStatRow(
                            label: 'Health',
                            value: 'OK',
                            valueColor: c.success,
                            icon: CupertinoIcons.checkmark_shield_fill,
                          );
                        }
                        return Column(
                          children: [
                            if (pendingCount > 0)
                              RexStatRow(
                                label: 'Pending embed',
                                value: '$pendingCount',
                                valueColor: c.warning,
                                icon: CupertinoIcons.clock_fill,
                              ),
                            if (duplicatesCount > 0)
                              RexStatRow(
                                label: 'Duplicates',
                                value: '$duplicatesCount',
                                valueColor: c.warning,
                                icon: CupertinoIcons.doc_on_doc_fill,
                              ),
                            if (orphansCount > 0)
                              RexStatRow(
                                label: 'Orphans',
                                value: '$orphansCount',
                                valueColor: c.error,
                                icon: CupertinoIcons.exclamationmark_circle_fill,
                              ),
                          ],
                        );
                      },
                    ),
                    if (_totalEntries > 0) ...[
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            'Embedding coverage',
                            style: TextStyle(fontSize: 11, color: c.textTertiary),
                          ),
                          const Spacer(),
                          Text(
                            '${(_totalEntries > 0 ? (_embeddedCount / _totalEntries * 100) : 0).toStringAsFixed(0)}%',
                            style: TextStyle(fontSize: 11, color: c.textSecondary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      RexProgressBar(
                        value: _embeddedCount.toDouble(),
                        max: _totalEntries > 0 ? _totalEntries.toDouble() : 1,
                        color: c.success,
                      ),
                    ],
                  ],
                ],
              ),
            ),

            // Categories
            if (_categories.isNotEmpty)
              RexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const RexSection(
                      title: 'Categories',
                      icon: CupertinoIcons.tag,
                    ),
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: _kCategoryColors.entries
                            .where((e) => _categories.containsKey(e.key))
                            .map((e) {
                          final count = _categories[e.key] ?? 0;
                          final isSelected = _selectedCategory == e.key;
                          return GestureDetector(
                            onTap: () => _loadMemoriesByCategory(e.key),
                            child: Container(
                              margin: const EdgeInsets.only(right: 6),
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? e.value.withAlpha(60)
                                    : e.value.withAlpha(20),
                                borderRadius: BorderRadius.circular(5),
                                border: Border.all(
                                  color: isSelected
                                      ? e.value
                                      : e.value.withAlpha(60),
                                  width: isSelected ? 1.0 : 0.5,
                                ),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    '${e.key} $count',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: e.value,
                                      fontWeight: isSelected
                                          ? FontWeight.w700
                                          : FontWeight.w500,
                                    ),
                                  ),
                                  if (isSelected) ...[
                                    const SizedBox(width: 4),
                                    Icon(CupertinoIcons.chevron_down,
                                        size: 9, color: e.value),
                                  ],
                                ],
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ],
                ),
              ),

            // Search
            Row(
              children: [
                Expanded(
                  child: MacosTextField(
                    controller: _searchController,
                    placeholder: 'Search past sessions...',
                    onSubmitted: (_) => _search(),
                    prefix: const Padding(
                      padding: EdgeInsets.only(left: 8),
                      child: Icon(CupertinoIcons.search, size: 14),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                RexButton(
                  label: 'Search',
                  onPressed: _searching ? null : _search,
                  loading: _searching,
                  small: true,
                ),
              ],
            ),

            // Search results
            if (_searchResults.isNotEmpty) ...[
              const SizedBox(height: 16),
              RexCard(
                title: 'Search Results',
                child: _CodeBlock(text: _searchResults),
              ),
            ],

            // Memory list for selected category
            if (_selectedCategory != null) ...[
              const SizedBox(height: 8),
              RexCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    RexSection(
                      title: _selectedCategory!,
                      icon: CupertinoIcons.list_bullet,
                      action: GestureDetector(
                        onTap: () => setState(() {
                          _selectedCategory = null;
                          _memoryList = [];
                        }),
                        child: Icon(CupertinoIcons.xmark_circle,
                            size: 14, color: c.textTertiary),
                      ),
                    ),
                    if (_loadingMemories)
                      const Padding(
                        padding: EdgeInsets.all(20),
                        child: Center(child: CupertinoActivityIndicator()),
                      )
                    else if (_memoryList.isEmpty)
                      const RexEmptyState(
                        icon: CupertinoIcons.tray,
                        title: 'No memories found',
                      )
                    else
                      Column(
                        children:
                            _memoryList.asMap().entries.map((entry) {
                          final i = entry.key;
                          final mem = entry.value;
                          final content =
                              (mem['content'] as String?) ?? '';
                          final project = mem['project'] as String?;
                          final createdAt =
                              mem['created_at'] as String? ?? '';
                          final catColor =
                              _kCategoryColors[_selectedCategory] ??
                                  c.accent;
                          return Column(
                            children: [
                              if (i > 0)
                                Padding(
                                  padding:
                                      const EdgeInsets.only(left: 16),
                                  child: Container(
                                      height: 0.5,
                                      color: c.separator),
                                ),
                              Padding(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 10),
                                child: Row(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Container(
                                      width: 6,
                                      height: 6,
                                      margin: const EdgeInsets.only(
                                          top: 5, right: 10),
                                      decoration: BoxDecoration(
                                        color: catColor,
                                        shape: BoxShape.circle,
                                      ),
                                    ),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            content.length > 200
                                                ? '${content.substring(0, 200)}...'
                                                : content,
                                            style: TextStyle(
                                              fontSize: 12,
                                              color: c.text,
                                              height: 1.45,
                                              fontFamily: 'Menlo',
                                            ),
                                          ),
                                          const SizedBox(height: 4),
                                          Row(
                                            children: [
                                              if (project !=
                                                  null) ...[
                                                Icon(
                                                    CupertinoIcons
                                                        .folder,
                                                    size: 10,
                                                    color:
                                                        c.textTertiary),
                                                const SizedBox(
                                                    width: 3),
                                                Text(
                                                  project
                                                      .split('-')
                                                      .take(2)
                                                      .join('/'),
                                                  style: TextStyle(
                                                      fontSize: 10,
                                                      color: c
                                                          .textTertiary),
                                                ),
                                                const SizedBox(
                                                    width: 8),
                                              ],
                                              Icon(
                                                  CupertinoIcons.clock,
                                                  size: 10,
                                                  color:
                                                      c.textTertiary),
                                              const SizedBox(width: 3),
                                              Text(
                                                createdAt.length > 16
                                                    ? createdAt
                                                        .substring(
                                                            0, 16)
                                                    : createdAt,
                                                style: TextStyle(
                                                    fontSize: 10,
                                                    color:
                                                        c.textTertiary),
                                              ),
                                            ],
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          );
                        }).toList(),
                      ),
                  ],
                ),
              ),
            ],

            // Lessons from self-review
            Consumer<RexService>(
              builder: (context, rex, _) {
                final items = rex.lessons.where((l) => l['promoted'] != true && l['dismissed'] != true).take(5).toList();
                if (items.isEmpty) return const SizedBox.shrink();
                return Column(children: [
                  const SizedBox(height: 8),
                  RexCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      RexSection(
                        title: 'Lessons',
                        icon: CupertinoIcons.lightbulb_fill,
                        action: RexStatusChip(label: '${rex.lessons.length}', status: RexChipStatus.pending, small: true),
                      ),
                      ...items.asMap().entries.map((e) {
                        final i = e.key;
                        final l = e.value;
                        final text = (l['text'] as String?) ?? '';
                        final cat = (l['category'] as String?) ?? '';
                        final occ = (l['occurrences'] as int?) ?? 1;
                        return Column(children: [
                          if (i > 0) Container(height: 0.5, color: context.rex.separator),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Container(
                                width: 6, height: 6,
                                margin: const EdgeInsets.only(top: 5, right: 10),
                                decoration: BoxDecoration(color: const Color(0xFFFF5722), shape: BoxShape.circle),
                              ),
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(text, style: TextStyle(fontSize: 12, color: context.rex.text, height: 1.4)),
                                const SizedBox(height: 3),
                                Row(children: [
                                  if (cat.isNotEmpty) Text(cat, style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
                                  if (occ > 1) ...[
                                    const SizedBox(width: 8),
                                    Text('×$occ', style: TextStyle(fontSize: 10, color: context.rex.textTertiary)),
                                  ],
                                ]),
                              ])),
                            ]),
                          ),
                        ]);
                      }),
                    ]),
                  ),
                ]);
              },
            ),

            // Runbooks
            Consumer<RexService>(
              builder: (context, rex, _) {
                final items = rex.runbooks.take(3).toList();
                if (items.isEmpty) return const SizedBox.shrink();
                return Column(children: [
                  const SizedBox(height: 8),
                  RexCard(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      RexSection(
                        title: 'Runbooks',
                        icon: CupertinoIcons.doc_checkmark_fill,
                        action: RexStatusChip(label: '${rex.runbooks.length}', status: RexChipStatus.ok, small: true),
                      ),
                      ...items.asMap().entries.map((e) {
                        final i = e.key;
                        final r = e.value;
                        final name = (r['name'] as String?) ?? '';
                        final desc = (r['description'] as String?) ?? '';
                        final count = (r['successCount'] as int?) ?? 0;
                        return Column(children: [
                          if (i > 0) Container(height: 0.5, color: context.rex.separator),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(children: [
                              Icon(CupertinoIcons.checkmark_circle, size: 13, color: context.rex.success),
                              const SizedBox(width: 8),
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: context.rex.text)),
                                if (desc.isNotEmpty)
                                  Text(desc.length > 80 ? '${desc.substring(0, 80)}…' : desc,
                                      style: TextStyle(fontSize: 11, color: context.rex.textTertiary)),
                              ])),
                              if (count > 0)
                                Text('$count✓', style: TextStyle(fontSize: 11, color: context.rex.success)),
                            ]),
                          ),
                        ]);
                      }),
                    ]),
                  ),
                ]);
              },
            ),

            // Database raw output
            if (_statsOutput.isNotEmpty) ...[
              const SizedBox(height: 8),
              RexCard(
                title: 'Database',
                child: _CodeBlock(text: _statsOutput),
              ),
            ],

            // Snapshots
            Consumer<RexService>(
              builder: (context, rex, _) {
                final snaps = rex.snapshots;
                if (snaps.isEmpty) return const SizedBox.shrink();
                return Column(
                  children: [
                    const SizedBox(height: 8),
                    RexCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          RexSection(
                            title: 'Snapshots',
                            icon: CupertinoIcons.camera_viewfinder,
                            action: RexStatusChip(
                              label: '${snaps.length}',
                              status: RexChipStatus.ok,
                              small: true,
                            ),
                          ),
                          ...snaps.take(5).toList().asMap().entries.map((entry) {
                            final i = entry.key;
                            final s = entry.value;
                            final ts = s['timestamp'] as String? ?? '';
                            final project = s['project'] as String? ?? '';
                            final branch = s['branch'] as String? ?? '';
                            final files = (s['modifiedFiles'] as List?)?.length ?? 0;
                            final pr = s['pr'] as int?;
                            DateTime? dt;
                            try { dt = DateTime.parse(ts); } catch (_) {}
                            final ageMin = dt != null
                                ? DateTime.now().difference(dt).inMinutes
                                : null;
                            final ageStr = ageMin == null
                                ? ''
                                : ageMin < 60
                                    ? '${ageMin}m ago'
                                    : '${(ageMin / 60).round()}h ago';
                            return Column(
                              children: [
                                if (i > 0)
                                  Container(height: 0.5, color: context.rex.separator),
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 10),
                                  child: Row(
                                    children: [
                                      Icon(CupertinoIcons.camera_viewfinder,
                                          size: 14, color: context.rex.accent),
                                      const SizedBox(width: 10),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              '$project · $branch${pr != null ? ' · PR #$pr' : ''}',
                                              style: TextStyle(
                                                fontSize: 12,
                                                color: context.rex.text,
                                                fontWeight: FontWeight.w500,
                                              ),
                                            ),
                                            const SizedBox(height: 2),
                                            Text(
                                              '$files modified files${ageStr.isNotEmpty ? ' · $ageStr' : ''}',
                                              style: TextStyle(
                                                fontSize: 10,
                                                color: context.rex.textTertiary,
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            );
                          }),
                        ],
                      ),
                    ),
                  ],
                );
              },
            ),

            // How it works
            const SizedBox(height: 8),
            RexCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const RexSection(
                    title: 'How It Works',
                    icon: CupertinoIcons.info,
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.clock,
                    title: 'Auto-Ingest',
                    subtitle:
                        'LaunchAgent syncs sessions every hour',
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 30),
                    child: Container(height: 0.5, color: c.separator),
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.sparkles,
                    title: 'Smart Categories',
                    subtitle:
                        'Qwen/Claude classifies: debug, fix, idea, architecture, pattern',
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 30),
                    child: Container(height: 0.5, color: c.separator),
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.cube,
                    title: 'Vector Search',
                    subtitle:
                        'Semantic similarity via nomic-embed-text embeddings',
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 30),
                    child: Container(height: 0.5, color: c.separator),
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.arrow_merge,
                    title: 'Consolidate',
                    subtitle:
                        'Merge similar memories (cosine >= 0.82) via Qwen summarization',
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

class _CodeBlock extends StatelessWidget {
  final String text;
  const _CodeBlock({required this.text});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: c.codeBg,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.separator, width: 0.5),
      ),
      child: SelectableText(
        text,
        style: TextStyle(
          fontFamily: 'Menlo',
          fontSize: 11,
          height: 1.5,
          color: c.text,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const _InfoRow(
      {required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: c.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: TextStyle(fontSize: 13, color: c.text)),
                Text(subtitle,
                    style:
                        TextStyle(fontSize: 11, color: c.textTertiary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
