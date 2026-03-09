import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class ResourceHubPage extends StatefulWidget {
  const ResourceHubPage({super.key});

  @override
  State<ResourceHubPage> createState() => _ResourceHubPageState();
}

class _ResourceHubPageState extends State<ResourceHubPage> {
  String _filter = 'all';
  final _searchCtrl = TextEditingController();
  String _searchQuery = '';
  String? _installingId;

  static const _filters = [
    ('all', 'All'),
    ('mcp', 'MCP'),
    ('guard', 'Guards'),
    ('skill', 'Skills'),
    ('script', 'Scripts'),
    ('boilerplate', 'Boilerplates'),
    ('tool', 'Tools'),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadHubResources();
    });
    _searchCtrl.addListener(() {
      setState(() => _searchQuery = _searchCtrl.text.trim());
    });
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _install(
      BuildContext context, Map<String, dynamic> resource) async {
    final id = resource['id'] as String;
    setState(() => _installingId = id);
    try {
      final result =
          await context.read<RexService>().installHubResource(id);
      if (!mounted) return;
      _showToast(context, result.isNotEmpty ? result : '${resource['name']} installed.');
    } finally {
      if (mounted) setState(() => _installingId = null);
    }
  }

  void _showToast(BuildContext context, String msg) {
    showCupertinoDialog(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Hub'),
        content: Text(msg),
        actions: [
          CupertinoDialogAction(
            child: const Text('OK'),
            onPressed: () => Navigator.pop(ctx),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final resources = _searchQuery.isEmpty
            ? rex.filteredHubResources
            : rex.filteredHubResources
                .where((r) {
                  final q = _searchQuery.toLowerCase();
                  return (r['name'] as String? ?? '').toLowerCase().contains(q) ||
                      (r['description'] as String? ?? '')
                          .toLowerCase()
                          .contains(q) ||
                      (r['tags'] as List<dynamic>? ?? [])
                          .any((t) => t.toString().toLowerCase().contains(q));
                })
                .toList();

        return RexPageLayout(
          title: 'Hub',
          actions: [
            if (rex.isHubLoading)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8),
                child: CupertinoActivityIndicator(radius: 8),
              )
            else
              RexHeaderButton(
                icon: CupertinoIcons.refresh,
                label: 'Refresh',
                onPressed: () => rex.loadHubResources(forceRefresh: true),
              ),
          ],
          builder: (context, scrollController) {
            return Column(
              children: [
                // ── Filter + Search bar ─────────────────────────────────
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                  decoration: BoxDecoration(
                    color: context.rex.surfaceSecondary,
                    border: Border(
                      bottom: BorderSide(color: context.rex.separator),
                    ),
                  ),
                  child: Column(
                    children: [
                      // Search
                      CupertinoTextField(
                        controller: _searchCtrl,
                        placeholder: 'Search resources…',
                        prefix: Padding(
                          padding: const EdgeInsets.only(left: 10),
                          child: Icon(
                            CupertinoIcons.search,
                            size: 15,
                            color: context.rex.textTertiary,
                          ),
                        ),
                        style: TextStyle(
                            fontSize: 13, color: context.rex.text),
                        placeholderStyle: TextStyle(
                            fontSize: 13, color: context.rex.textTertiary),
                        decoration: BoxDecoration(
                          color: context.rex.card,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: context.rex.separator),
                        ),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 8),
                      ),
                      const SizedBox(height: 10),
                      // Filter chips
                      SizedBox(
                        height: 28,
                        child: ListView.separated(
                          scrollDirection: Axis.horizontal,
                          itemCount: _filters.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(width: 6),
                          itemBuilder: (context, i) {
                            final (value, label) = _filters[i];
                            final active = _filter == value;
                            return GestureDetector(
                              onTap: () {
                                setState(() => _filter = value);
                                rex.setHubFilter(value);
                              },
                              child: AnimatedContainer(
                                duration: const Duration(milliseconds: 120),
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 12, vertical: 5),
                                decoration: BoxDecoration(
                                  color: active
                                      ? context.rex.accent
                                      : context.rex.card,
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(
                                    color: active
                                        ? context.rex.accent
                                        : context.rex.separator,
                                  ),
                                ),
                                child: Text(
                                  label,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w500,
                                    color: active
                                        ? CupertinoColors.white
                                        : context.rex.textSecondary,
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Resource list ─────────────────────────────────────────
                Expanded(
                  child: _buildContent(context, rex, resources, scrollController),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildContent(
    BuildContext context,
    RexService rex,
    List<Map<String, dynamic>> resources,
    ScrollController scrollController,
  ) {
    if (rex.isHubLoading && resources.isEmpty) {
      return const Center(child: CupertinoActivityIndicator());
    }

    if (rex.hubError.isNotEmpty && resources.isEmpty) {
      return RexEmptyState(
        icon: CupertinoIcons.exclamationmark_triangle,
        title: 'Load failed',
        subtitle: rex.hubError,
        actionLabel: 'Retry',
        onAction: () => rex.loadHubResources(forceRefresh: true),
      );
    }

    if (resources.isEmpty) {
      return RexEmptyState(
        icon: CupertinoIcons.square_grid_2x2,
        title: _searchQuery.isNotEmpty
            ? 'No results for "$_searchQuery"'
            : 'No resources',
        subtitle: _searchQuery.isEmpty
            ? 'Tap Refresh to fetch from GitHub'
            : null,
        actionLabel: _searchQuery.isEmpty ? 'Refresh' : null,
        onAction: _searchQuery.isEmpty
            ? () => rex.loadHubResources(forceRefresh: true)
            : null,
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(16),
      itemCount: resources.length + 1,
      itemBuilder: (context, i) {
        if (i == 0) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              '${resources.length} resource${resources.length == 1 ? '' : 's'}',
              style: TextStyle(
                fontSize: 12,
                color: context.rex.textTertiary,
              ),
            ),
          );
        }
        final r = resources[i - 1];
        return _ResourceCard(
          resource: r,
          installing: _installingId == r['id'],
          onInstall: () => _install(context, r),
        );
      },
    );
  }
}

// ── Resource card ─────────────────────────────────────────────────────────────

class _ResourceCard extends StatelessWidget {
  const _ResourceCard({
    required this.resource,
    required this.installing,
    required this.onInstall,
  });

  final Map<String, dynamic> resource;
  final bool installing;
  final VoidCallback onInstall;

  static const _typeColors = {
    'mcp': Color(0xFF7C3AED),
    'guard': Color(0xFFDC2626),
    'skill': Color(0xFF2563EB),
    'script': Color(0xFF059669),
    'boilerplate': Color(0xFFD97706),
    'tool': Color(0xFF0891B2),
  };

  Color _typeColor() =>
      _typeColors[resource['type'] as String? ?? ''] ?? const Color(0xFF6B7280);

  @override
  Widget build(BuildContext context) {
    final type = resource['type'] as String? ?? '';
    final name = resource['name'] as String? ?? '';
    final description = resource['description'] as String? ?? '';
    final tags = (resource['tags'] as List<dynamic>? ?? []).cast<String>();
    final verified = resource['verified'] == true;
    final stars = resource['stars'] as int?;
    final isBuiltIn = (resource['source'] as String? ?? '') == 'builtin';
    final typeColor = _typeColor();

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: context.rex.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header: name + type badge + actions
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    Text(
                      name,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: context.rex.text,
                      ),
                    ),
                    const SizedBox(width: 8),
                    _TypeBadge(type: type, color: typeColor),
                    if (verified) ...[
                      const SizedBox(width: 6),
                      Icon(
                        CupertinoIcons.checkmark_seal_fill,
                        size: 13,
                        color: context.rex.success,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (isBuiltIn)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: context.rex.surfaceSecondary,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: context.rex.separator),
                  ),
                  child: Text(
                    'Built-in',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: context.rex.textSecondary,
                    ),
                  ),
                )
              else
                RexButton(
                  label: 'Install',
                  icon: CupertinoIcons.cloud_download,
                  variant: RexButtonVariant.secondary,
                  small: true,
                  loading: installing,
                  onPressed: installing ? null : onInstall,
                ),
            ],
          ),
          // Description
          if (description.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              description,
              style: TextStyle(
                fontSize: 12,
                color: context.rex.textSecondary,
                height: 1.4,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          // Tags + stars
          if (tags.isNotEmpty || stars != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: tags
                        .take(5)
                        .map(
                          (t) => Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: context.rex.surfaceSecondary,
                              borderRadius: BorderRadius.circular(4),
                              border:
                                  Border.all(color: context.rex.separator),
                            ),
                            child: Text(
                              t,
                              style: TextStyle(
                                fontSize: 10,
                                color: context.rex.textTertiary,
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  ),
                ),
                if (stars != null) ...[
                  const SizedBox(width: 8),
                  Icon(CupertinoIcons.star_fill,
                      size: 11, color: context.rex.textTertiary),
                  const SizedBox(width: 3),
                  Text(
                    stars >= 1000
                        ? '${(stars / 1000).toStringAsFixed(1)}k'
                        : '$stars',
                    style: TextStyle(
                      fontSize: 11,
                      color: context.rex.textTertiary,
                    ),
                  ),
                ],
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge({required this.type, required this.color});
  final String type;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        type.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
