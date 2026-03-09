import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class ProvidersPage extends StatefulWidget {
  const ProvidersPage({super.key});

  @override
  State<ProvidersPage> createState() => _ProvidersPageState();
}

class _ProvidersPageState extends State<ProvidersPage> {
  bool _generatingLiteLLM = false;

  void _loadAll() {
    final rex = context.read<RexService>();
    rex.loadProviders();
    rex.loadInventory();
    rex.loadBudget();
    rex.loadRunbooks();
    rex.loadModelRouter();
    rex.loadLlmUsage();
    rex.loadLlmBackend();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadAll());
  }

  Future<void> _generateLiteLLM() async {
    setState(() => _generatingLiteLLM = true);
    final out = await context.read<RexService>().generateLiteLLMConfig();
    if (!mounted) return;
    setState(() => _generatingLiteLLM = false);
    if (out.isNotEmpty) {
      showCupertinoDialog(
        context: context,
        builder: (_) => CupertinoAlertDialog(
          title: const Text('LiteLLM Config'),
          content: Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(out, style: const TextStyle(fontSize: 11)),
          ),
          actions: [
            CupertinoDialogAction(
              isDefaultAction: true,
              child: const Text('OK'),
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Providers',
      actions: [
        _generatingLiteLLM
            ? const CupertinoActivityIndicator()
            : RexHeaderButton(
                icon: CupertinoIcons.doc_text,
                label: 'LiteLLM',
                onPressed: _generateLiteLLM,
              ),
        RexHeaderButton(
          icon: CupertinoIcons.refresh,
          label: 'Refresh',
          onPressed: _loadAll,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            if (rex.isLoading &&
                rex.providers.isEmpty &&
                rex.inventoryData == null) {
              return const Center(child: CupertinoActivityIndicator());
            }

            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                _RoutingOrderBanner(),
                const SizedBox(height: 20),
                _ProvidersSection(providers: rex.providers),
                const SizedBox(height: 8),
                _FreeTiersSection(),
                const SizedBox(height: 8),
                _LlmUsageSection(usage: rex.llmUsage),
                const SizedBox(height: 8),
                _LlmBackendSection(),
                const SizedBox(height: 8),
                _ModelRouterSection(),
                const SizedBox(height: 8),
                _ApiKeysSection(),
                const SizedBox(height: 8),
                _InventorySection(data: rex.inventoryData),
                const SizedBox(height: 8),
                _BudgetSection(data: rex.budgetSummary),
                const SizedBox(height: 8),
                _RunbooksSection(runbooks: rex.runbooks),
              ],
            );
          },
        );
      },
    );
  }
}

// -- Routing Order Banner --

const _routingSteps = [
  'Cache',
  'CLI',
  'Local',
  'Owned',
  'Free',
  'Sub',
  'Paid',
];

class _RoutingOrderBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: c.surfaceSecondary,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: c.separator),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: List.generate(_routingSteps.length, (i) {
          final isFirst = i < 4; // Cache/CLI/Local/Owned are preferred tiers
          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: isFirst
                      ? c.accent.withAlpha(20)
                      : c.textTertiary.withAlpha(15),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isFirst
                        ? c.accent.withAlpha(60)
                        : c.textTertiary.withAlpha(30),
                  ),
                ),
                child: Text(
                  '${i + 1}.${_routingSteps[i]}',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isFirst ? c.accent : c.textTertiary,
                  ),
                ),
              ),
              if (i < _routingSteps.length - 1)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 2),
                  child: Icon(CupertinoIcons.chevron_right,
                      size: 8, color: c.textTertiary),
                ),
            ],
          );
        }),
      ),
    );
  }
}

// -- Providers Section --

int _tierOrder(String tier) {
  switch (tier) {
    case 'free':
      return 0;
    case 'subscription':
      return 1;
    case 'pay-per-use':
      return 2;
    default:
      return 3;
  }
}

String _tierLabel(String tier) {
  switch (tier) {
    case 'free':
      return 'Owned / Free';
    case 'subscription':
      return 'Subscription';
    case 'pay-per-use':
      return 'Pay-per-use';
    default:
      return tier;
  }
}

class _ProvidersSection extends StatelessWidget {
  final List<Map<String, dynamic>> providers;
  const _ProvidersSection({required this.providers});

  @override
  Widget build(BuildContext context) {
    if (providers.isEmpty) {
      return RexCard(
        title: 'Providers',
        child: const RexEmptyState(
          icon: CupertinoIcons.cloud,
          title: 'No providers detected',
          subtitle: 'Run rex doctor to scan available providers.',
        ),
      );
    }

    // Group by tier
    final grouped = <String, List<Map<String, dynamic>>>{};
    for (final p in providers) {
      final tier = p['costTier'] as String? ?? 'unknown';
      grouped.putIfAbsent(tier, () => []);
      grouped[tier]!.add(p);
    }

    // Sort groups: free -> subscription -> pay-per-use
    final sortedKeys = grouped.keys.toList()
      ..sort((a, b) => _tierOrder(a).compareTo(_tierOrder(b)));

    return Column(
      children: sortedKeys.map((tier) {
        final group = grouped[tier]!
          ..sort((a, b) {
            final ca = a['status'] == 'available' ? 0 : 1;
            final cb = b['status'] == 'available' ? 0 : 1;
            return ca.compareTo(cb);
          });
        return RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              RexSection(
                title: _tierLabel(tier),
                icon: tier == 'free'
                    ? CupertinoIcons.checkmark_shield
                    : tier == 'subscription'
                        ? CupertinoIcons.creditcard
                        : CupertinoIcons.money_dollar_circle,
              ),
              ...group.map((p) => _ProviderRow(provider: p)),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class _ProviderRow extends StatelessWidget {
  final Map<String, dynamic> provider;
  const _ProviderRow({required this.provider});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final name = provider['name'] ?? 'Unknown';
    final configured = provider['status'] == 'available';
    final caps = (provider['capabilities'] as List?)?.whereType<String>().toList() ?? [];

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      name,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: c.text,
                      ),
                    ),
                    const SizedBox(width: 8),
                    RexStatusChip(
                      label: configured ? 'available' : 'unavailable',
                      status: configured
                          ? RexChipStatus.ok
                          : RexChipStatus.inactive,
                      small: true,
                    ),
                  ],
                ),
                if (caps.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 4,
                    runSpacing: 4,
                    children: caps
                        .map((cap) => Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: c.codeBg,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                cap,
                                style: TextStyle(
                                    fontSize: 10, color: c.textTertiary),
                              ),
                            ))
                        .toList(),
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

// -- LLM Backend Section --

class _LlmBackendSection extends StatelessWidget {
  static const _backendIcons = <String, IconData>{
    'ollama': CupertinoIcons.cube_box,
    'llama-cpp': CupertinoIcons.chevron_left_slash_chevron_right,
    'localai': CupertinoIcons.cloud,
    'vllm': CupertinoIcons.bolt,
    'llamafile': CupertinoIcons.doc,
  };

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final b = rex.llmBackend;
        final type = b['type'] as String? ?? '';
        final url = b['url'] as String? ?? '';
        final apiFormat = b['apiFormat'] as String? ?? '';
        final healthy = b['healthy'] as bool? ?? false;
        final models = (b['models'] as List<dynamic>?)?.whereType<String>().toList() ?? <String>[];

        return RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RexSection(
                title: 'LLM Backend',
                icon: CupertinoIcons.layers,
              ),
              if (type.isEmpty)
                const RexEmptyState(
                  icon: CupertinoIcons.cube_box,
                  title: 'Backend info unavailable',
                  subtitle: 'Run rex backend to configure.',
                )
              else ...[
                RexStatRow(
                  label: 'Engine',
                  value: type,
                  icon: _backendIcons[type] ?? CupertinoIcons.cube_box,
                  valueColor: healthy ? c.success : c.warning,
                ),
                RexStatRow(
                  label: 'Status',
                  value: healthy ? 'reachable' : 'unreachable',
                  icon: healthy ? CupertinoIcons.checkmark_circle_fill : CupertinoIcons.exclamationmark_circle,
                  valueColor: healthy ? c.success : c.error,
                ),
                if (url.isNotEmpty)
                  RexStatRow(
                    label: 'URL',
                    value: url,
                    icon: CupertinoIcons.link,
                  ),
                if (apiFormat.isNotEmpty)
                  RexStatRow(
                    label: 'API',
                    value: '$apiFormat format',
                    icon: CupertinoIcons.doc_text,
                  ),
                if (models.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    'Models (${models.length})',
                    style: TextStyle(fontSize: 11, color: c.textTertiary),
                  ),
                  const SizedBox(height: 4),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: models.take(6).map<Widget>((m) => RexStatusChip(label: m, status: RexChipStatus.ok, small: true)).toList(),
                  ),
                  if (models.length > 6)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        '+${models.length - 6} more',
                        style: TextStyle(fontSize: 11, color: c.textTertiary),
                      ),
                    ),
                ],
              ],
            ],
          ),
        );
      },
    );
  }
}

// -- Model Router Section --

class _ModelRouterSection extends StatelessWidget {
  static const _taskIcons = {
    'background': CupertinoIcons.bolt_fill,
    'categorize': CupertinoIcons.tag_fill,
    'consolidate': CupertinoIcons.layers_fill,
    'gateway': CupertinoIcons.paperplane_fill,
    'optimize': CupertinoIcons.sparkles,
    'reason': CupertinoIcons.bubble_left_bubble_right_fill,
    'code': CupertinoIcons.chevron_left_slash_chevron_right,
  };

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final router = rex.modelRouter;
        return RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RexSection(
                title: 'Local Model Router',
                icon: CupertinoIcons.arrow_branch,
              ),
              if (router.isEmpty)
                const RexEmptyState(
                  icon: CupertinoIcons.cube,
                  title: 'Ollama not detected',
                  subtitle: 'Start Ollama to see model routing.',
                )
              else
                ...router.entries.map((e) {
                  final icon = _taskIcons[e.key] ?? CupertinoIcons.circle;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Row(
                      children: [
                        Icon(icon, size: 13, color: context.rex.textTertiary),
                        const SizedBox(width: 8),
                        SizedBox(
                          width: 80,
                          child: Text(
                            e.key,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                              color: context.rex.textSecondary,
                            ),
                          ),
                        ),
                        Icon(CupertinoIcons.chevron_right, size: 9, color: context.rex.textTertiary),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            e.value,
                            style: TextStyle(
                              fontSize: 12,
                              fontFamily: 'Menlo',
                              color: context.rex.accent,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  );
                }),
            ],
          ),
        );
      },
    );
  }
}

// -- LLM Usage Section --

class _LlmUsageSection extends StatelessWidget {
  final Map<String, dynamic> usage;
  const _LlmUsageSection({required this.usage});

  @override
  Widget build(BuildContext context) {
    if (usage.isEmpty) return const SizedBox.shrink();
    final c = context.rex;
    final providers = (usage['providers'] as Map<String, dynamic>?) ?? {};
    if (providers.isEmpty) return const SizedBox.shrink();
    final totalReq = (usage['totalRequests'] as int?) ?? 0;
    final totalErrors = (usage['totalErrors'] as int?) ?? 0;
    return RexCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        RexSection(title: 'LLM Usage', icon: CupertinoIcons.chart_bar_alt_fill),
        Row(children: [
          _UsageStat(label: 'Requests', value: '$totalReq', color: c.text),
          const SizedBox(width: 20),
          _UsageStat(label: 'Errors', value: '$totalErrors',
              color: totalErrors > 0 ? c.error : c.textSecondary),
        ]),
        const SizedBox(height: 10),
        ...providers.entries.map((e) {
          final p = e.value as Map<String, dynamic>;
          final req = (p['requests'] as int?) ?? 0;
          final errors = (p['errors'] as int?) ?? 0;
          final rl = (p['rateLimits'] as int?) ?? 0;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(children: [
              Expanded(child: Text(e.key,
                  style: TextStyle(fontSize: 12, color: c.text))),
              Text('$req req', style: TextStyle(fontSize: 11, color: c.textSecondary)),
              const SizedBox(width: 10),
              if (errors > 0)
                Text('$errors err', style: TextStyle(fontSize: 11, color: c.error)),
              if (rl > 0) ...[
                const SizedBox(width: 6),
                RexStatusChip(label: 'RL $rl', status: RexChipStatus.pending, small: true),
              ],
            ]),
          );
        }),
      ]),
    );
  }
}

class _UsageStat extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  const _UsageStat({required this.label, required this.value, required this.color});
  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(value, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: color)),
      Text(label, style: TextStyle(fontSize: 11, color: context.rex.textSecondary)),
    ]);
  }
}

// -- Free Tiers Section --

class _FreeTiersSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return RexCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const RexSection(
            title: 'Free Tier Routing',
            icon: CupertinoIcons.arrow_2_circlepath,
          ),
          FutureBuilder<List<Map<String, dynamic>>>(
            future: context.read<RexService>().getFreeTiers(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Center(child: CupertinoActivityIndicator()),
                );
              }
              final tiers = snapshot.data!;
              if (tiers.isEmpty) {
                return const RexEmptyState(
                  icon: CupertinoIcons.slash_circle,
                  title: 'No providers found',
                );
              }
              return Column(
                children: tiers.map((tier) {
                  final available = tier['available'] == true;
                  final blocked = tier['blocked'] == true;
                  final name = tier['name'] as String? ?? '';
                  final model = tier['defaultModel'] as String? ?? '';
                  final rpm = tier['rpmLimit'];

                  RexChipStatus chipStatus;
                  String chipLabel;
                  if (blocked) {
                    chipStatus = RexChipStatus.error;
                    chipLabel = 'rate-limited';
                  } else if (available) {
                    chipStatus = RexChipStatus.ok;
                    chipLabel = name == 'Ollama' ? 'local' : 'configured';
                  } else {
                    chipStatus = RexChipStatus.inactive;
                    chipLabel = 'no key';
                  }

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Icon(
                          available && !blocked
                              ? CupertinoIcons.circle_fill
                              : CupertinoIcons.circle,
                          color: chipStatus == RexChipStatus.ok
                              ? context.rex.success
                              : chipStatus == RexChipStatus.error
                                  ? context.rex.error
                                  : context.rex.textTertiary,
                          size: 10,
                        ),
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
                              if (model.isNotEmpty)
                                Text(
                                  model,
                                  style: TextStyle(
                                    fontSize: 11,
                                    color: context.rex.textSecondary,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        RexStatusChip(
                          label: chipLabel,
                          status: chipStatus,
                          small: true,
                        ),
                        const SizedBox(width: 8),
                        if (rpm != null)
                          Text(
                            '$rpm RPM',
                            style: TextStyle(
                              fontSize: 11,
                              color: context.rex.textSecondary,
                            ),
                          ),
                      ],
                    ),
                  );
                }).toList(),
              );
            },
          ),
        ],
      ),
    );
  }
}

// -- API Keys Section --

class _ApiKeysSection extends StatefulWidget {
  @override
  State<_ApiKeysSection> createState() => _ApiKeysSectionState();
}

class _ApiKeysSectionState extends State<_ApiKeysSection> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final keys = rex.providerApiKeyLabels;
        final setCount = keys.keys.where((k) => rex.isProviderKeySet(k)).length;

        return RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GestureDetector(
                onTap: () => setState(() => _expanded = !_expanded),
                child: Row(
                  children: [
                    Icon(CupertinoIcons.lock, size: 14, color: c.textSecondary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'API Keys',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: c.text,
                        ),
                      ),
                    ),
                    RexStatusChip(
                      label: '$setCount/${keys.length} configured',
                      status: setCount > 0 ? RexChipStatus.ok : RexChipStatus.inactive,
                      small: true,
                    ),
                    const SizedBox(width: 8),
                    Icon(
                      _expanded ? CupertinoIcons.chevron_up : CupertinoIcons.chevron_down,
                      size: 12,
                      color: c.textTertiary,
                    ),
                  ],
                ),
              ),
              if (_expanded) ...[
                const SizedBox(height: 12),
                Text(
                  'Configure API keys to unlock providers. Free tier keys give access to models at no cost.',
                  style: TextStyle(fontSize: 11, color: c.textTertiary),
                ),
                const SizedBox(height: 12),
                ...keys.entries.map((entry) => _ApiKeyRow(
                  envKey: entry.key,
                  label: entry.value,
                )),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _ApiKeyRow extends StatefulWidget {
  final String envKey;
  final String label;
  const _ApiKeyRow({required this.envKey, required this.label});

  @override
  State<_ApiKeyRow> createState() => _ApiKeyRowState();
}

class _ApiKeyRowState extends State<_ApiKeyRow> {
  late TextEditingController _controller;
  bool _obscure = true;
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final rex = context.read<RexService>();
    final isSet = rex.isProviderKeySet(widget.envKey);
    final isFree = widget.label.contains('free');

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 160,
            child: Row(
              children: [
                if (isFree)
                  Container(
                    width: 6,
                    height: 6,
                    margin: const EdgeInsets.only(right: 6),
                    decoration: BoxDecoration(
                      color: CupertinoColors.systemGreen,
                      shape: BoxShape.circle,
                    ),
                  ),
                Flexible(
                  child: Text(
                    widget.label,
                    style: TextStyle(
                      fontSize: 12,
                      color: c.text,
                      fontWeight: FontWeight.w400,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (_editing)
            Expanded(
              child: Row(
                children: [
                  Expanded(
                    child: CupertinoTextField(
                      controller: _controller,
                      obscureText: _obscure,
                      placeholder: widget.envKey,
                      style: TextStyle(fontSize: 12, color: c.text),
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    ),
                  ),
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => setState(() => _obscure = !_obscure),
                    child: Icon(
                      _obscure ? CupertinoIcons.eye_slash : CupertinoIcons.eye,
                      size: 14,
                      color: c.textTertiary,
                    ),
                  ),
                  const SizedBox(width: 4),
                  RexButton(
                    label: 'Save',
                    small: true,
                    onPressed: () {
                      final val = _controller.text.trim();
                      if (val.isNotEmpty) {
                        rex.setProviderApiKey(widget.envKey, val);
                      }
                      setState(() => _editing = false);
                    },
                  ),
                  const SizedBox(width: 4),
                  GestureDetector(
                    onTap: () => setState(() => _editing = false),
                    child: Icon(CupertinoIcons.xmark, size: 12, color: c.textTertiary),
                  ),
                ],
              ),
            )
          else
            Expanded(
              child: Row(
                children: [
                  RexStatusChip(
                    label: isSet ? 'Configured' : 'Not set',
                    status: isSet ? RexChipStatus.ok : RexChipStatus.inactive,
                    small: true,
                  ),
                  const Spacer(),
                  RexButton(
                    label: isSet ? 'Update' : 'Set',
                    small: true,
                    variant: isSet ? RexButtonVariant.secondary : RexButtonVariant.primary,
                    onPressed: () {
                      _controller.text = isSet ? rex.getProviderApiKey(widget.envKey) : '';
                      setState(() {
                        _editing = true;
                        _obscure = true;
                      });
                    },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// -- Inventory Section --

class _InventorySection extends StatelessWidget {
  final Map<String, dynamic>? data;
  const _InventorySection({required this.data});

  @override
  Widget build(BuildContext context) {
    if (data == null) {
      return RexCard(
        title: 'Inventory',
        child: const RexEmptyState(
          icon: CupertinoIcons.desktopcomputer,
          title: 'Inventory not loaded',
        ),
      );
    }
    final c = context.rex;
    final hw = data!['hardware'] as Map<String, dynamic>? ?? {};
    final clis = (data!['clis'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
    final services =
        (data!['services'] as List?)?.whereType<Map<String, dynamic>>().toList() ?? [];
    final models = data!['models'] as Map<String, dynamic>? ?? {};
    final genModels = (models['generation'] as List?) ?? [];
    final embedModels = (models['embedding'] as List?) ?? [];

    return Column(
      children: [
        // Hardware
        RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RexSection(
                title: 'Hardware',
                icon: CupertinoIcons.desktopcomputer,
              ),
              RexStatRow(
                label: 'CPU',
                value: hw['cpu']?.toString() ?? '-',
                icon: CupertinoIcons.desktopcomputer,
              ),
              RexStatRow(
                label: 'RAM',
                value: hw['ram']?.toString() ?? '-',
                icon: CupertinoIcons.chart_bar,
              ),
              RexStatRow(
                label: 'GPU',
                value: hw['gpu']?.toString() ?? '-',
                icon: CupertinoIcons.gamecontroller,
              ),
              RexStatRow(
                label: 'Disk Free',
                value: hw['diskFree']?.toString() ?? '-',
                icon: CupertinoIcons.tray,
              ),
            ],
          ),
        ),
        // CLIs
        if (clis.isNotEmpty)
          RexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const RexSection(
                  title: 'CLIs',
                  icon: CupertinoIcons.command,
                ),
                Wrap(
                  spacing: 8,
                  runSpacing: 6,
                  children: clis.map((cli) {
                    return RexStatusChip(
                      label: '${cli['name']} ${cli['version'] ?? ''}',
                      status: RexChipStatus.ok,
                      small: true,
                    );
                  }).toList(),
                ),
              ],
            ),
          ),
        // Services
        if (services.isNotEmpty)
          RexCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const RexSection(
                  title: 'Services',
                  icon: CupertinoIcons.gear_alt,
                ),
                ...services.map((svc) {
                  final running = svc['status'] == 'running';
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Row(
                      children: [
                        RexStatusChip(
                          label: svc['name'] ?? '',
                          status: running
                              ? RexChipStatus.ok
                              : RexChipStatus.inactive,
                          small: true,
                        ),
                      ],
                    ),
                  );
                }),
              ],
            ),
          ),
        // Models
        RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const RexSection(
                title: 'Models',
                icon: CupertinoIcons.cube,
              ),
              RexStatRow(
                label: 'Generation',
                value: '${genModels.length}',
              ),
              RexStatRow(
                label: 'Embedding',
                value: '${embedModels.length}',
              ),
              if (genModels.isNotEmpty || embedModels.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  [...genModels, ...embedModels]
                      .map((m) => m.toString())
                      .join(', '),
                  style: TextStyle(
                      fontSize: 10,
                      fontFamily: 'Menlo',
                      color: c.textTertiary),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// -- Budget Section --

class _BudgetSection extends StatelessWidget {
  final Map<String, dynamic>? data;
  const _BudgetSection({required this.data});

  @override
  Widget build(BuildContext context) {
    if (data == null) {
      return RexCard(
        title: 'Budget',
        child: const RexEmptyState(
          icon: CupertinoIcons.money_dollar_circle,
          title: 'No tracked usage yet',
        ),
      );
    }
    // Parse actual CLI budget format
    final todayEntries = (data!['today'] as List?) ?? [];
    final todayTotal = todayEntries.fold<double>(
        0,
        (sum, e) =>
            sum +
            ((e as Map?)?['estimatedCost'] as num? ?? 0).toDouble());
    final weekTotalMap = data!['weekTotal'] as Map<String, dynamic>? ?? {};
    final weekTotal =
        (weekTotalMap['estimatedCost'] as num?)?.toDouble() ?? 0;
    final entries = (data!['entries'] as List?) ?? todayEntries;
    final byProvider = <String, dynamic>{};
    for (final e in entries) {
      if (e is Map) {
        final p = e['provider']?.toString() ?? 'unknown';
        final cost = (e['estimatedCost'] as num?)?.toDouble() ?? 0;
        byProvider[p] = ((byProvider[p] as num?)?.toDouble() ?? 0) + cost;
      }
    }

    if (todayTotal == 0 && weekTotal == 0 && byProvider.isEmpty) {
      return RexCard(
        title: 'Budget',
        child: const RexEmptyState(
          icon: CupertinoIcons.money_dollar_circle,
          title: 'No tracked usage yet',
        ),
      );
    }

    return RexCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const RexSection(
            title: 'Budget',
            icon: CupertinoIcons.money_dollar_circle,
          ),
          RexStatRow(
            label: 'Today',
            value: '\$${todayTotal.toStringAsFixed(2)} USD',
            valueColor: todayTotal > 0 ? context.rex.accent : null,
          ),
          RexStatRow(
            label: 'This Week',
            value: '\$${weekTotal.toStringAsFixed(2)} USD',
          ),
          if (byProvider.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Per Provider',
                style: TextStyle(
                    fontSize: 11, color: context.rex.textTertiary)),
            const SizedBox(height: 8),
            ...byProvider.entries.map((entry) {
              final val = (entry.value as num).toDouble();
              final total = byProvider.values
                  .fold<double>(0, (sum, v) => sum + (v as num).toDouble());
              return Column(
                children: [
                  RexStatRow(
                    label: entry.key,
                    value: '\$${val.toStringAsFixed(2)}',
                  ),
                  const SizedBox(height: 4),
                  RexProgressBar(value: val, max: total > 0 ? total : 1),
                  const SizedBox(height: 8),
                ],
              );
            }),
          ],
        ],
      ),
    );
  }
}

// -- Runbooks Section --

class _RunbooksSection extends StatelessWidget {
  final List<Map<String, dynamic>> runbooks;
  const _RunbooksSection({required this.runbooks});

  @override
  Widget build(BuildContext context) {
    if (runbooks.isEmpty) {
      return RexCard(
        title: 'Runbooks',
        child: const RexEmptyState(
          icon: CupertinoIcons.book,
          title: 'No runbooks saved yet',
          subtitle: 'Successful workflows will appear here.',
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: runbooks.map((r) {
        final name = r['name'] ?? 'Untitled';
        final trigger = r['trigger'] ?? '';
        final usedCount = r['successCount'] ?? r['usedCount'] ?? 0;
        final lastUsed = r['lastUsed'] as String?;

        return RexCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(CupertinoIcons.book,
                      size: 16, color: context.rex.textSecondary),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      name,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: context.rex.text),
                    ),
                  ),
                  RexStatusChip(
                    label: '$usedCount runs',
                    status: usedCount > 0
                        ? RexChipStatus.ok
                        : RexChipStatus.inactive,
                    small: true,
                  ),
                ],
              ),
              if (trigger.isNotEmpty) ...[
                const SizedBox(height: 4),
                RexStatRow(
                  label: 'Trigger',
                  value: trigger,
                ),
              ],
              if (usedCount > 0)
                RexStatRow(
                  label: 'Success count',
                  value: '$usedCount',
                ),
              if (lastUsed != null)
                RexStatRow(
                  label: 'Last used',
                  value: lastUsed,
                ),
            ],
          ),
        );
      }).toList(),
    );
  }
}
