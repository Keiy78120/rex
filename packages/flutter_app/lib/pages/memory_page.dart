import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText, Color;
import 'package:macos_ui/macos_ui.dart' show MacosTextField;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadStats());
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

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'Memory',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.tray_arrow_down,
          label: 'Ingest',
          onPressed: () async {
            await context.read<RexService>().runIngest();
            _loadStats();
          },
          showLabel: true,
        ),
        RexHeaderButton(
          icon: _categorizing ? CupertinoIcons.ellipsis : CupertinoIcons.sparkles,
          label: _categorizing ? 'Classifying...' : 'Categorize',
          onPressed: _categorizing ? null : _runCategorize,
          showLabel: true,
        ),
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
              const SizedBox(height: 20),
              _SectionLabel('SEARCH RESULTS'),
              const SizedBox(height: 6),
              _CodeBlock(text: _searchResults),
            ],

            // Stats
            const SizedBox(height: 20),
            _SectionLabel('DATABASE'),
            const SizedBox(height: 8),
            if (_statsOutput.isEmpty)
              const Padding(padding: EdgeInsets.all(20), child: Center(child: CupertinoActivityIndicator()))
            else ...[
              if (_totalEntries > 0 || _categories.isNotEmpty) ...[
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: c.accent.withAlpha(20),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: c.accent.withAlpha(60), width: 0.5),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(CupertinoIcons.cube, size: 13, color: c.accent),
                          const SizedBox(width: 6),
                          Text('$_totalEntries memories',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c.accent)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: SingleChildScrollView(
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
                                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                                decoration: BoxDecoration(
                                  color: isSelected ? e.value.withAlpha(60) : e.value.withAlpha(20),
                                  borderRadius: BorderRadius.circular(5),
                                  border: Border.all(
                                    color: isSelected ? e.value : e.value.withAlpha(60),
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
                                        fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                                      ),
                                    ),
                                    if (isSelected) ...[
                                      const SizedBox(width: 4),
                                      Icon(CupertinoIcons.chevron_down, size: 9, color: e.value),
                                    ],
                                  ],
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
              ],
              _CodeBlock(text: _statsOutput),
            ],

            // Memory list for selected category
            if (_selectedCategory != null) ...[
              const SizedBox(height: 20),
              Row(
                children: [
                  Container(
                    width: 3,
                    height: 14,
                    decoration: BoxDecoration(
                      color: _kCategoryColors[_selectedCategory] ?? c.accent,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _SectionLabel(_selectedCategory!.toUpperCase()),
                  const Spacer(),
                  GestureDetector(
                    onTap: () => setState(() { _selectedCategory = null; _memoryList = []; }),
                    child: Icon(CupertinoIcons.xmark_circle, size: 14, color: c.textTertiary),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (_loadingMemories)
                const Padding(padding: EdgeInsets.all(20), child: Center(child: CupertinoActivityIndicator()))
              else if (_memoryList.isEmpty)
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.separator, width: 0.5),
                  ),
                  child: Text('No memories found.', style: TextStyle(color: c.textSecondary, fontSize: 12)),
                )
              else
                Container(
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.separator, width: 0.5),
                  ),
                  child: Column(
                    children: _memoryList.asMap().entries.map((entry) {
                      final i = entry.key;
                      final mem = entry.value;
                      final content = (mem['content'] as String?) ?? '';
                      final project = mem['project'] as String?;
                      final createdAt = mem['created_at'] as String? ?? '';
                      final catColor = _kCategoryColors[_selectedCategory] ?? c.accent;
                      return Column(
                        children: [
                          if (i > 0)
                            Padding(
                              padding: const EdgeInsets.only(left: 44),
                              child: Container(height: 0.5, color: c.separator),
                            ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            child: Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Container(
                                  width: 6, height: 6,
                                  margin: const EdgeInsets.only(top: 5, right: 10),
                                  decoration: BoxDecoration(
                                    color: catColor,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
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
                                          if (project != null) ...[
                                            Icon(CupertinoIcons.folder, size: 10, color: c.textTertiary),
                                            const SizedBox(width: 3),
                                            Text(
                                              project.split('-').take(2).join('/'),
                                              style: TextStyle(fontSize: 10, color: c.textTertiary),
                                            ),
                                            const SizedBox(width: 8),
                                          ],
                                          Icon(CupertinoIcons.clock, size: 10, color: c.textTertiary),
                                          const SizedBox(width: 3),
                                          Text(
                                            createdAt.length > 16
                                                ? createdAt.substring(0, 16)
                                                : createdAt,
                                            style: TextStyle(fontSize: 10, color: c.textTertiary),
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
                ),
            ],

            // Info
            const SizedBox(height: 24),
            _SectionLabel('HOW IT WORKS'),
            const SizedBox(height: 6),
            Container(
              decoration: BoxDecoration(
                color: c.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: c.separator, width: 0.5),
              ),
              child: Column(
                children: [
                  _InfoRow(
                    icon: CupertinoIcons.clock,
                    title: 'Auto-Ingest',
                    subtitle: 'LaunchAgent syncs sessions every hour',
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 44),
                    child: Container(height: 0.5, color: c.separator),
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.sparkles,
                    title: 'Smart Categories',
                    subtitle: 'Qwen/Claude classifies: debug, fix, idea, architecture, pattern',
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 44),
                    child: Container(height: 0.5, color: c.separator),
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.cube,
                    title: 'Vector Search',
                    subtitle: 'Semantic similarity via nomic-embed-text embeddings',
                  ),
                  Padding(
                    padding: const EdgeInsets.only(left: 44),
                    child: Container(height: 0.5, color: c.separator),
                  ),
                  _InfoRow(
                    icon: CupertinoIcons.arrow_merge,
                    title: 'Consolidate',
                    subtitle: 'Merge similar memories (cosine >= 0.82) via Qwen summarization',
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

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Text(
      text,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: c.textSecondary,
        letterSpacing: 0.5,
      ),
    );
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

  const _InfoRow({required this.icon, required this.title, required this.subtitle});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: c.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 13, color: c.text)),
                Text(subtitle, style: TextStyle(fontSize: 11, color: c.textTertiary)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
