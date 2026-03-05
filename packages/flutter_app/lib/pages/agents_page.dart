import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

class AgentsPage extends StatefulWidget {
  const AgentsPage({super.key});

  @override
  State<AgentsPage> createState() => _AgentsPageState();
}

class _AgentsPageState extends State<AgentsPage> {
  final _nameController = TextEditingController();
  final _modelController = TextEditingController();
  final _intervalController = TextEditingController(text: '600');

  String _selectedProfile = 'read';
  String _lastOutput = '';

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final rex = context.read<RexService>();
    await Future.wait([rex.loadAgents(), rex.loadAgentProfiles()]);
  }

  Future<void> _createAgent() async {
    final rex = context.read<RexService>();
    final interval = int.tryParse(_intervalController.text.trim());
    final out = await rex.createAgent(
      _selectedProfile,
      name: _nameController.text.trim(),
      model: _modelController.text.trim(),
      intervalSec: interval,
    );
    setState(() => _lastOutput = out);
  }

  Future<void> _startAgent(String id) async {
    final out = await context.read<RexService>().startAgent(id);
    setState(() => _lastOutput = out);
  }

  Future<void> _runOnce(String id) async {
    final out = await context.read<RexService>().runAgentOnce(id);
    setState(() => _lastOutput = out);
  }

  Future<void> _stopAgent(String id) async {
    final out = await context.read<RexService>().stopAgent(id);
    setState(() => _lastOutput = out);
  }

  Future<void> _toggleEnabled(AgentInfo agent) async {
    final out = await context.read<RexService>().setAgentEnabled(
      agent.id,
      !agent.enabled,
    );
    setState(() => _lastOutput = out);
  }

  Future<void> _deleteAgent(String id) async {
    final out = await context.read<RexService>().deleteAgent(id);
    setState(() => _lastOutput = out);
  }

  Future<void> _viewLogs(String id) async {
    final out = await context.read<RexService>().readAgentLogs(id, tail: 40);
    setState(() => _lastOutput = out);
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(
        title: const Text('Agents'),
        titleWidth: 150,
        actions: [
          ToolBarIconButton(
            label: 'Refresh',
            icon: const MacosIcon(CupertinoIcons.refresh),
            onPressed: _refresh,
            showLabel: false,
          ),
        ],
      ),
      children: [
        ContentArea(
          builder: (context, scrollController) {
            return Consumer<RexService>(
              builder: (context, rex, _) {
                final profiles = rex.agentProfiles
                    .map((p) => (p['name'] as String?) ?? '')
                    .where((p) => p.isNotEmpty)
                    .toList();
                final availableProfiles = profiles.isEmpty
                    ? const [
                        'read',
                        'analysis',
                        'code-review',
                        'advanced',
                        'ultimate',
                      ]
                    : profiles;

                if (!availableProfiles.contains(_selectedProfile)) {
                  _selectedProfile = availableProfiles.first;
                }

                return ListView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(20),
                  children: [
                    _SectionTitle(title: 'Create Agent'),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: _cardDecoration(context),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: availableProfiles
                                .map(
                                  (profile) => PushButton(
                                    controlSize: ControlSize.small,
                                    secondary: _selectedProfile != profile,
                                    onPressed: () {
                                      setState(
                                        () => _selectedProfile = profile,
                                      );
                                    },
                                    child: Text(profile),
                                  ),
                                )
                                .toList(),
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _nameController,
                                  placeholder: 'Optional name',
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 170,
                                child: MacosTextField(
                                  controller: _intervalController,
                                  placeholder: 'Interval sec',
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Expanded(
                                child: MacosTextField(
                                  controller: _modelController,
                                  placeholder:
                                      'Optional model override (ex: qwen3.5:9b)',
                                ),
                              ),
                              const SizedBox(width: 8),
                              PushButton(
                                controlSize: ControlSize.large,
                                onPressed: rex.isLoading ? null : _createAgent,
                                child: rex.isLoading
                                    ? const SizedBox(
                                        width: 14,
                                        height: 14,
                                        child: ProgressCircle(radius: 7),
                                      )
                                    : const Text('Create'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 20),
                    Row(
                      children: [
                        _SectionTitle(
                          title: 'Configured Agents (${rex.agents.length})',
                        ),
                        const Spacer(),
                        PushButton(
                          controlSize: ControlSize.small,
                          onPressed: rex.isLoading
                              ? null
                              : () async {
                                  for (final agent in rex.agents.where(
                                    (a) => a.enabled,
                                  )) {
                                    await rex.startAgent(agent.id);
                                  }
                                  setState(
                                    () =>
                                        _lastOutput = 'Started enabled agents',
                                  );
                                },
                          child: const Text('Start all'),
                        ),
                        const SizedBox(width: 8),
                        PushButton(
                          controlSize: ControlSize.small,
                          onPressed: rex.isLoading
                              ? null
                              : () async {
                                  for (final agent in rex.agents.where(
                                    (a) => a.running,
                                  )) {
                                    await rex.stopAgent(agent.id);
                                  }
                                  setState(
                                    () =>
                                        _lastOutput = 'Stopped running agents',
                                  );
                                },
                          child: const Text('Stop all'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (rex.agents.isEmpty)
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: _cardDecoration(context),
                        child: const Text('No agents configured yet.'),
                      )
                    else
                      ...rex.agents.map(
                        (agent) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _AgentCard(
                            agent: agent,
                            busy: rex.isLoading,
                            onStart: () => _startAgent(agent.id),
                            onRunOnce: () => _runOnce(agent.id),
                            onStop: () => _stopAgent(agent.id),
                            onToggleEnabled: () => _toggleEnabled(agent),
                            onDelete: () => _deleteAgent(agent.id),
                            onLogs: () => _viewLogs(agent.id),
                          ),
                        ),
                      ),
                    const SizedBox(height: 20),
                    _SectionTitle(title: 'Last Output'),
                    const SizedBox(height: 8),
                    _OutputCard(
                      text: _lastOutput.isEmpty ? rex.lastOutput : _lastOutput,
                    ),
                  ],
                );
              },
            );
          },
        ),
      ],
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _modelController.dispose();
    _intervalController.dispose();
    super.dispose();
  }
}

class _AgentCard extends StatelessWidget {
  final AgentInfo agent;
  final bool busy;
  final VoidCallback onStart;
  final VoidCallback onRunOnce;
  final VoidCallback onStop;
  final VoidCallback onToggleEnabled;
  final VoidCallback onDelete;
  final VoidCallback onLogs;

  const _AgentCard({
    required this.agent,
    required this.busy,
    required this.onStart,
    required this.onRunOnce,
    required this.onStop,
    required this.onToggleEnabled,
    required this.onDelete,
    required this.onLogs,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = agent.running
        ? CupertinoColors.systemGreen
        : agent.enabled
        ? CupertinoColors.systemOrange
        : CupertinoColors.systemGrey;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: _cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 9,
                height: 9,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  '${agent.name} (${agent.profile})',
                  style: const TextStyle(fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                agent.id,
                style: TextStyle(
                  fontFamily: 'Menlo',
                  fontSize: 11,
                  color: MacosTheme.of(context).typography.subheadline.color,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'model=${agent.model} • every ${agent.intervalSec}s • ${agent.enabled ? 'enabled' : 'disabled'}',
            style: TextStyle(
              fontSize: 12,
              color: MacosTheme.of(context).typography.subheadline.color,
            ),
          ),
          if (agent.lastRunAt.isNotEmpty)
            Text(
              'last run: ${agent.lastRunAt}',
              style: TextStyle(
                fontSize: 12,
                color: MacosTheme.of(context).typography.subheadline.color,
              ),
            ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onStart,
                child: const Text('Start'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onRunOnce,
                child: const Text('Run once'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onStop,
                child: const Text('Stop'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onToggleEnabled,
                child: Text(agent.enabled ? 'Disable' : 'Enable'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onLogs,
                child: const Text('Logs'),
              ),
              PushButton(
                controlSize: ControlSize.small,
                onPressed: busy ? null : onDelete,
                child: const Text('Delete'),
              ),
            ],
          ),
        ],
      ),
    );
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
      decoration: _cardDecoration(context),
      child: SelectableText(
        text.isEmpty ? 'No output yet.' : text,
        style: const TextStyle(fontFamily: 'Menlo', fontSize: 12, height: 1.5),
      ),
    );
  }
}

BoxDecoration _cardDecoration(BuildContext context) {
  return BoxDecoration(
    color: MacosTheme.brightnessOf(context) == Brightness.dark
        ? const Color(0xFF1A1A1A)
        : const Color(0xFFF5F5F5),
    borderRadius: BorderRadius.circular(8),
    border: Border.all(
      color: MacosTheme.brightnessOf(context) == Brightness.dark
          ? const Color(0xFF333333)
          : const Color(0xFFE5E5E5),
    ),
  );
}
