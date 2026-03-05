import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

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

  @override
  void initState() {
    super.initState();
    _loadStats();
  }

  Future<void> _loadStats() async {
    final output = await context.read<RexService>().runPrune(statsOnly: true);
    setState(() => _statsOutput = output);
  }

  Future<void> _search() async {
    final query = _searchController.text.trim();
    if (query.isEmpty) return;
    setState(() => _searching = true);
    final result = await context.read<RexService>().runSearch(query);
    setState(() {
      _searchResults = result;
      _searching = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('Memory'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Ingest',
            icon: const MacosIcon(CupertinoIcons.tray_arrow_down),
            onPressed: () async {
              final output = await context.read<RexService>().runIngest();
              setState(() => _statsOutput = output);
              _loadStats();
            },
            showLabel: true,
          ),
          ToolBarIconButton(
            label: 'Prune',
            icon: const MacosIcon(CupertinoIcons.trash),
            onPressed: () async {
              final output = await context.read<RexService>().runPrune();
              setState(() => _statsOutput = output);
            },
            showLabel: true,
          ),
        ],
      ),
      children: [
        ContentArea(
          builder: (context, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Search bar
                Row(
                  children: [
                    Expanded(
                      child: MacosTextField(
                        controller: _searchController,
                        placeholder: 'Semantic search across past sessions...',
                        onSubmitted: (_) => _search(),
                        prefix: const Padding(
                          padding: EdgeInsets.only(left: 8),
                          child: MacosIcon(CupertinoIcons.search, size: 16),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    PushButton(
                      controlSize: ControlSize.regular,
                      onPressed: _searching ? null : _search,
                      child: _searching
                          ? const SizedBox(
                              width: 14,
                              height: 14,
                              child: ProgressCircle(radius: 7),
                            )
                          : const Text('Search'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Search results
                if (_searchResults.isNotEmpty) ...[
                  _SectionTitle(title: 'Search Results'),
                  const SizedBox(height: 8),
                  _OutputCard(text: _searchResults),
                  const SizedBox(height: 20),
                ],

                // Stats
                _SectionTitle(title: 'Database Stats'),
                const SizedBox(height: 8),
                if (_statsOutput.isNotEmpty)
                  _OutputCard(text: _statsOutput)
                else
                  const Center(child: ProgressCircle()),
                const SizedBox(height: 20),

                // Info cards
                Row(
                  children: [
                    Expanded(child: _InfoCard(
                      icon: CupertinoIcons.doc_text,
                      title: 'Auto-Ingest',
                      subtitle: 'Sessions are ingested automatically via LaunchAgent every hour and at session end.',
                      color: CupertinoColors.systemBlue,
                    )),
                    const SizedBox(width: 12),
                    Expanded(child: _InfoCard(
                      icon: CupertinoIcons.sparkles,
                      title: 'Smart Categories',
                      subtitle: 'Qwen classifies chunks: debug, fix, idea, architecture, pattern, lesson, config.',
                      color: CupertinoColors.systemPurple,
                    )),
                  ],
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
    );
  }
}

class _OutputCard extends StatelessWidget {
  final String text;
  const _OutputCard({required this.text});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: MacosTheme.brightnessOf(context) == Brightness.dark
            ? const Color(0xFF1A1A1A)
            : const Color(0xFFF5F5F5),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: MacosTheme.brightnessOf(context) == Brightness.dark
              ? const Color(0xFF333333)
              : const Color(0xFFE5E5E5),
        ),
      ),
      child: SelectableText(
        text,
        style: const TextStyle(
          fontFamily: 'Menlo',
          fontSize: 12,
          height: 1.5,
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: color.withAlpha(15),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withAlpha(40)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Text(title, style: TextStyle(fontWeight: FontWeight.w600, color: color, fontSize: 13)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 12,
              color: MacosTheme.of(context).typography.subheadline.color,
            ),
          ),
        ],
      ),
    );
  }
}
