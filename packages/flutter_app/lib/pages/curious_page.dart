import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class CuriousPage extends StatefulWidget {
  const CuriousPage({super.key});

  @override
  State<CuriousPage> createState() => _CuriousPageState();
}

class _CuriousPageState extends State<CuriousPage> {
  String _filter = 'all';
  static const _filters = ['all', 'model', 'mcp', 'repo', 'news'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadCurious();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final all = rex.discoveries;
        final filtered = _filter == 'all'
            ? all
            : all.where((d) => d['type'] == _filter).toList();

        return RexPageLayout(
          title: 'Curious',
          actions: [
            if (rex.isRunningCurious)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: CupertinoActivityIndicator(radius: 8),
              )
            else
              RexHeaderButton(
                icon: CupertinoIcons.refresh,
                label: 'Check now',
                onPressed: rex.isLoadingCurious ? null : rex.runCuriousCheck,
              ),
          ],
          builder: (context, scrollController) {
            if (rex.isLoadingCurious && all.isEmpty) {
              return const Center(child: CupertinoActivityIndicator());
            }

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Status bar
                if (rex.curiousCheckedAt.isNotEmpty) ...[
                  _StatusBar(
                    newCount: rex.curiousNewCount,
                    checkedAt: rex.curiousCheckedAt,
                    total: all.length,
                  ),
                  const SizedBox(height: 16),
                ],

                // Filter chips
                if (all.isNotEmpty) ...[
                  _FilterBar(
                    selected: _filter,
                    onChanged: (f) => setState(() => _filter = f),
                    counts: {
                      for (final t in _filters.skip(1))
                        t: all.where((d) => d['type'] == t).length,
                    },
                  ),
                  const SizedBox(height: 16),
                ],

                // Empty state
                if (filtered.isEmpty && !rex.isLoadingCurious)
                  RexEmptyState(
                    icon: CupertinoIcons.search,
                    title: all.isEmpty ? 'No discoveries yet' : 'Nothing in this category',
                    subtitle: all.isEmpty
                        ? 'Hit "Check now" to scan for new models, MCPs, and AI news.'
                        : 'Try a different filter.',
                    actionLabel: all.isEmpty ? 'Check now' : null,
                    onAction: all.isEmpty ? rex.runCuriousCheck : null,
                  ),

                // Grouped by type
                if (filtered.isNotEmpty)
                  ..._buildGrouped(context, filtered),
              ],
            );
          },
        );
      },
    );
  }

  List<Widget> _buildGrouped(BuildContext context, List<Map<String, dynamic>> items) {
    if (_filter != 'all') {
      return [
        RexCard(child: Column(
          children: items.asMap().entries.map((e) {
            return Column(children: [
              _DiscoveryRow(item: e.value),
              if (e.key < items.length - 1)
                Container(height: 1, color: context.rex.separator),
            ]);
          }).toList(),
        )),
      ];
    }

    // Group by type for 'all' view
    final order = ['model', 'mcp', 'repo', 'news'];
    final widgets = <Widget>[];

    for (final type in order) {
      final typeItems = items.where((d) => d['type'] == type).toList();
      if (typeItems.isEmpty) continue;

      final icon = _typeIcon(type);
      final label = _typeLabel(type);

      widgets.add(Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(
          children: [
            Text(
              '$icon  $label',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.6,
                color: context.rex.textTertiary,
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
              decoration: BoxDecoration(
                color: context.rex.card,
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: context.rex.separator),
              ),
              child: Text(
                '${typeItems.length}',
                style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
              ),
            ),
          ],
        ),
      ));

      widgets.add(RexCard(
        child: Column(
          children: typeItems.take(8).toList().asMap().entries.map((e) {
            return Column(children: [
              _DiscoveryRow(item: e.value),
              if (e.key < typeItems.take(8).length - 1)
                Container(height: 1, color: context.rex.separator),
            ]);
          }).toList(),
        ),
      ));

      if (typeItems.length > 8) {
        widgets.add(Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Text(
            '… ${typeItems.length - 8} more in this category',
            style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
          ),
        ));
      }
    }

    return widgets;
  }

  String _typeIcon(String type) => switch (type) {
    'model' => '🤖',
    'mcp'   => '🔌',
    'repo'  => '📦',
    'news'  => '📰',
    _       => '·',
  };

  String _typeLabel(String type) => switch (type) {
    'model' => 'MODELS',
    'mcp'   => 'MCP SERVERS',
    'repo'  => 'REPOS',
    'news'  => 'NEWS',
    _       => type.toUpperCase(),
  };
}

// ── Status bar ────────────────────────────────────────────────────────────────

class _StatusBar extends StatelessWidget {
  const _StatusBar({
    required this.newCount,
    required this.checkedAt,
    required this.total,
  });

  final int newCount;
  final String checkedAt;
  final int total;

  @override
  Widget build(BuildContext context) {
    String timeLabel = '';
    try {
      final dt = DateTime.parse(checkedAt);
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) {
        timeLabel = 'just now';
      } else if (diff.inHours < 1) {
        timeLabel = '${diff.inMinutes}m ago';
      } else if (diff.inDays < 1) {
        timeLabel = '${diff.inHours}h ago';
      } else {
        timeLabel = '${diff.inDays}d ago';
      }
    } catch (_) {}

    return Row(
      children: [
        if (newCount > 0)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: context.rex.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(5),
              border: Border.all(color: context.rex.accent.withValues(alpha: 0.3)),
            ),
            child: Text(
              '$newCount new',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: context.rex.accent,
              ),
            ),
          ),
        if (newCount > 0) const SizedBox(width: 8),
        Text(
          '$total discoveries · checked $timeLabel',
          style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
        ),
      ],
    );
  }
}

// ── Filter bar ────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.selected,
    required this.onChanged,
    required this.counts,
  });

  final String selected;
  final ValueChanged<String> onChanged;
  final Map<String, int> counts;

  static const _labels = {
    'all': 'All',
    'model': '🤖 Models',
    'mcp': '🔌 MCP',
    'repo': '📦 Repos',
    'news': '📰 News',
  };

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: _labels.entries.map((e) {
          final isSelected = e.key == selected;
          final count = counts[e.key];
          return GestureDetector(
            onTap: () => onChanged(e.key),
            child: Container(
              margin: const EdgeInsets.only(right: 6),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: isSelected
                    ? context.rex.accent.withValues(alpha: 0.10)
                    : context.rex.card,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(
                  color: isSelected
                      ? context.rex.accent.withValues(alpha: 0.35)
                      : context.rex.separator,
                ),
              ),
              child: Row(
                children: [
                  Text(
                    e.value,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                      color: isSelected ? context.rex.accent : context.rex.textSecondary,
                    ),
                  ),
                  if (count != null && count > 0) ...[
                    const SizedBox(width: 4),
                    Text(
                      '$count',
                      style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                    ),
                  ],
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Discovery row ─────────────────────────────────────────────────────────────

class _DiscoveryRow extends StatelessWidget {
  const _DiscoveryRow({required this.item});

  final Map<String, dynamic> item;

  String _icon(String? type) => switch (type) {
    'model' => '🤖',
    'mcp'   => '🔌',
    'repo'  => '📦',
    'news'  => '📰',
    _       => '·',
  };

  @override
  Widget build(BuildContext context) {
    final type    = item['type'] as String?;
    final title   = item['title'] as String? ?? '';
    final detail  = item['detail'] as String? ?? '';
    final url     = item['url'] as String?;
    final isNew   = item['isNew'] as bool? ?? false;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(_icon(type), style: const TextStyle(fontSize: 16)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        title,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: context.rex.text,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (isNew) ...[
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: CupertinoColors.systemGreen.withValues(alpha: 0.15),
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: const Text(
                          'NEW',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: CupertinoColors.systemGreen,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text(
                  detail,
                  style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (url != null) ...[
                  const SizedBox(height: 3),
                  GestureDetector(
                    onLongPress: () => Clipboard.setData(ClipboardData(text: url)),
                    child: Text(
                      url.length > 55 ? url.substring(0, 55) + '…' : url,
                      style: TextStyle(
                        fontSize: 10,
                        color: context.rex.accent.withValues(alpha: 0.8),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
