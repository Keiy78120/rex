import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

// ── Page ─────────────────────────────────────────────────────────────────────

class ClientsPage extends StatefulWidget {
  const ClientsPage({super.key});

  @override
  State<ClientsPage> createState() => _ClientsPageState();
}

class _ClientsPageState extends State<ClientsPage> {
  bool _showCreate = false;
  final _nameCtrl  = TextEditingController();
  final _tradeCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _planCtrl  = TextEditingController(text: 'pro');

  static const _plans = ['starter', 'pro', 'enterprise'];
  static const _trades = [
    'plombier', 'electricien', 'peintre', 'macon',
    'couvreur', 'menuisier', 'chauffagiste', 'plaquiste', 'carreleur', 'charpentier',
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadClients();
    });
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _tradeCtrl.dispose();
    _phoneCtrl.dispose();
    _planCtrl.dispose();
    super.dispose();
  }

  Future<void> _createClient() async {
    final name  = _nameCtrl.text.trim();
    final trade = _tradeCtrl.text.trim();
    if (name.isEmpty || trade.isEmpty) return;

    setState(() => _showCreate = false);
    _nameCtrl.clear();
    _tradeCtrl.clear();
    _phoneCtrl.clear();

    await context.read<RexService>().createClient(
      name: name,
      trade: trade,
      phone: _phoneCtrl.text.trim().isEmpty ? null : _phoneCtrl.text.trim(),
      plan: _planCtrl.text,
    );
  }

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Clients',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.add,
          label: 'New client',
          onPressed: () => setState(() => _showCreate = !_showCreate),
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Create form
                if (_showCreate) ...[
                  _CreateForm(
                    nameCtrl:  _nameCtrl,
                    tradeCtrl: _tradeCtrl,
                    phoneCtrl: _phoneCtrl,
                    planCtrl:  _planCtrl,
                    plans:     _plans,
                    trades:    _trades,
                    isCreating: rex.isCreatingClient,
                    onCreate:  _createClient,
                    onCancel:  () => setState(() => _showCreate = false),
                  ),
                  const SizedBox(height: 20),
                ],

                // Stats bar
                if (rex.clients.isNotEmpty) ...[
                  _ClientsStats(clients: rex.clients),
                  const SizedBox(height: 20),
                ],

                // Loading
                if (rex.isLoadingClients)
                  const Center(child: CupertinoActivityIndicator()),

                // Empty
                if (!rex.isLoadingClients && rex.clients.isEmpty && !_showCreate)
                  RexEmptyState(
                    icon: CupertinoIcons.person_crop_circle_badge_plus,
                    title: 'No clients yet',
                    subtitle: 'Provision a client agent stack with Dify + n8n + Twenty CRM.',
                    actionLabel: 'New client',
                    onAction: () => setState(() => _showCreate = true),
                  ),

                // Client list
                if (rex.clients.isNotEmpty) ...[
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      'ACTIVE CLIENTS',
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
                        for (int i = 0; i < rex.clients.length; i++) ...[
                          _ClientRow(
                            client: rex.clients[i],
                            onPause:  () => rex.pauseClient(rex.clients[i]['id'] as String),
                            onResume: () => rex.resumeClient(rex.clients[i]['id'] as String),
                            onRemove: () => _confirmRemove(context, rex, rex.clients[i]),
                          ),
                          if (i < rex.clients.length - 1)
                            Container(height: 1, color: context.rex.separator),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
            );
          },
        );
      },
    );
  }

  void _confirmRemove(BuildContext ctx, RexService rex, Map<String, dynamic> client) {
    showCupertinoDialog(
      context: ctx,
      builder: (_) => CupertinoAlertDialog(
        title: const Text('Remove client?'),
        content: Text('${client['name']} will be stopped and marked removed.\nData is preserved unless you choose Purge.'),
        actions: [
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () {
              Navigator.pop(ctx);
              rex.removeClient(client['id'] as String, purge: false);
            },
            child: const Text('Remove'),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () {
              Navigator.pop(ctx);
              rex.removeClient(client['id'] as String, purge: true);
            },
            child: const Text('Remove + Purge'),
          ),
          CupertinoDialogAction(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
        ],
      ),
    );
  }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

class _ClientsStats extends StatelessWidget {
  const _ClientsStats({required this.clients});

  final List<Map<String, dynamic>> clients;

  @override
  Widget build(BuildContext context) {
    final active      = clients.where((c) => c['status'] == 'active').length;
    final totalBudget = clients.fold<double>(
      0, (sum, c) => sum + ((c['litellm'] as Map?)?['monthlyBudgetUsd'] as num? ?? 0).toDouble(),
    );
    final totalCost   = clients.fold<double>(
      0, (sum, c) => sum + ((c['metrics'] as Map?)?['totalCostUsd'] as num? ?? 0).toDouble(),
    );

    return Row(
      children: [
        Expanded(child: _StatCard(label: 'Total', value: '${clients.length}', color: context.rex.text)),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(label: 'Active', value: '$active', color: CupertinoColors.systemGreen)),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(label: 'Budget/mo', value: '\$${totalBudget.toStringAsFixed(0)}', color: context.rex.accent)),
        const SizedBox(width: 8),
        Expanded(child: _StatCard(label: 'Spent', value: '\$${totalCost.toStringAsFixed(2)}', color: CupertinoColors.systemOrange)),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value, required this.color});

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
          Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: color)),
          const SizedBox(height: 2),
          Text(label, style: TextStyle(fontSize: 11, color: context.rex.textSecondary)),
        ],
      ),
    );
  }
}

// ── Client row ────────────────────────────────────────────────────────────────

class _ClientRow extends StatelessWidget {
  const _ClientRow({
    required this.client,
    required this.onPause,
    required this.onResume,
    required this.onRemove,
  });

  final Map<String, dynamic> client;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onRemove;

  RexChipStatus _chipStatus(String? s) => switch (s) {
    'active'       => RexChipStatus.ok,
    'provisioning' => RexChipStatus.pending,
    'paused'       => RexChipStatus.inactive,
    'error'        => RexChipStatus.error,
    _              => RexChipStatus.inactive,
  };

  @override
  Widget build(BuildContext context) {
    final name    = client['name'] as String? ?? '?';
    final trade   = client['trade'] as String? ?? '?';
    final status  = client['status'] as String? ?? 'unknown';
    final plan    = client['plan'] as String? ?? '';
    final ports   = client['ports'] as Map<String, dynamic>? ?? {};
    final metrics = client['metrics'] as Map<String, dynamic>? ?? {};
    final litellm = client['litellm'] as Map<String, dynamic>? ?? {};
    final isPaused = status == 'paused';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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
                            fontWeight: FontWeight.w600,
                            color: context.rex.text,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          trade,
                          style: TextStyle(fontSize: 12, color: context.rex.textSecondary),
                        ),
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: context.rex.card,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: context.rex.separator),
                          ),
                          child: Text(
                            plan,
                            style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Dify :${ports['dify']}  n8n :${ports['n8n']}  Twenty :${ports['twenty']}  '
                      '· \$${(litellm['monthlyBudgetUsd'] as num? ?? 0).toStringAsFixed(0)}/mo  '
                      '· used \$${(metrics['totalCostUsd'] as num? ?? 0).toStringAsFixed(3)}',
                      style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              RexStatusChip(
                label: status,
                status: _chipStatus(status),
                small: true,
              ),
              const SizedBox(width: 8),
              // Pause / Resume
              GestureDetector(
                onTap: isPaused ? onResume : onPause,
                child: Icon(
                  isPaused ? CupertinoIcons.play_circle : CupertinoIcons.pause_circle,
                  size: 18,
                  color: context.rex.textSecondary,
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: onRemove,
                child: Icon(CupertinoIcons.trash, size: 16, color: CupertinoColors.systemRed),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Create form ───────────────────────────────────────────────────────────────

class _CreateForm extends StatelessWidget {
  const _CreateForm({
    required this.nameCtrl,
    required this.tradeCtrl,
    required this.phoneCtrl,
    required this.planCtrl,
    required this.plans,
    required this.trades,
    required this.isCreating,
    required this.onCreate,
    required this.onCancel,
  });

  final TextEditingController nameCtrl;
  final TextEditingController tradeCtrl;
  final TextEditingController phoneCtrl;
  final TextEditingController planCtrl;
  final List<String> plans;
  final List<String> trades;
  final bool isCreating;
  final VoidCallback onCreate;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return RexCard(
      child: Padding(
        padding: const EdgeInsets.all(4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'New Client Agent',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: context.rex.text,
              ),
            ),
            const SizedBox(height: 12),

            // Name
            _Field(label: 'Name', child: CupertinoTextField(
              controller: nameCtrl,
              placeholder: 'Jean Martin',
              style: TextStyle(fontSize: 13, color: context.rex.text),
              decoration: BoxDecoration(
                color: context.rex.surface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: context.rex.separator),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            )),

            const SizedBox(height: 8),

            // Trade
            _Field(label: 'Trade', child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: context.rex.surface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: context.rex.separator),
              ),
              child: Wrap(
                spacing: 4,
                runSpacing: 4,
                children: trades.map((t) {
                  final selected = planCtrl.text == t || tradeCtrl.text == t;
                  return GestureDetector(
                    onTap: () => tradeCtrl.text = t,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: tradeCtrl.text == t
                            ? context.rex.accent.withValues(alpha: 0.12)
                            : context.rex.card,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: tradeCtrl.text == t
                              ? context.rex.accent.withValues(alpha: 0.35)
                              : context.rex.separator,
                        ),
                      ),
                      child: Text(
                        t,
                        style: TextStyle(
                          fontSize: 11,
                          color: tradeCtrl.text == t ? context.rex.accent : context.rex.textSecondary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            )),

            const SizedBox(height: 8),

            // Plan
            _Field(label: 'Plan', child: Row(
              children: plans.map((p) {
                final sel = planCtrl.text == p;
                return GestureDetector(
                  onTap: () => planCtrl.text = p,
                  child: Container(
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: sel ? context.rex.accent.withValues(alpha: 0.12) : context.rex.card,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(
                        color: sel ? context.rex.accent.withValues(alpha: 0.35) : context.rex.separator,
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(
                          p,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: sel ? FontWeight.w600 : FontWeight.w400,
                            color: sel ? context.rex.accent : context.rex.textSecondary,
                          ),
                        ),
                        Text(
                          p == 'starter' ? '\$15/mo' : p == 'pro' ? '\$40/mo' : '\$120/mo',
                          style: TextStyle(fontSize: 10, color: context.rex.textTertiary),
                        ),
                      ],
                    ),
                  ),
                );
              }).toList(),
            )),

            const SizedBox(height: 8),

            // Phone (optional)
            _Field(label: 'Phone (optional)', child: CupertinoTextField(
              controller: phoneCtrl,
              placeholder: '+33612345678',
              keyboardType: TextInputType.phone,
              style: TextStyle(fontSize: 13, color: context.rex.text),
              decoration: BoxDecoration(
                color: context.rex.surface,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: context.rex.separator),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            )),

            const SizedBox(height: 16),

            // Actions
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                GestureDetector(
                  onTap: onCancel,
                  child: Text('Cancel', style: TextStyle(fontSize: 13, color: context.rex.textSecondary)),
                ),
                const SizedBox(width: 16),
                GestureDetector(
                  onTap: isCreating ? null : onCreate,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: isCreating ? context.rex.textTertiary : context.rex.accent,
                      borderRadius: BorderRadius.circular(7),
                    ),
                    child: isCreating
                        ? const CupertinoActivityIndicator(radius: 7, color: CupertinoColors.white)
                        : const Text('Provision', style: TextStyle(fontSize: 13, color: CupertinoColors.white, fontWeight: FontWeight.w600)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 11, color: context.rex.textSecondary, fontWeight: FontWeight.w500)),
        const SizedBox(height: 4),
        child,
      ],
    );
  }
}
