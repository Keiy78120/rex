import 'dart:convert';
import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

class AgentsPage extends StatefulWidget {
  const AgentsPage({super.key});

  @override
  State<AgentsPage> createState() => _AgentsPageState();
}

class _AgentsPageState extends State<AgentsPage> {
  final _nameController = TextEditingController();
  final _modelController = TextEditingController();
  final _intervalController = TextEditingController(text: '600');
  final _chatController = TextEditingController();
  final _chatScrollController = ScrollController();

  String _selectedProfile = 'read';
  bool _showCreateForm = false;
  bool _chatThinking = false;
  List<_ChatMessage> _chatHistory = [];

  @override
  void initState() {
    super.initState();
    _refresh();
    _loadChatHistory();
  }

  Future<void> _refresh() async {
    final rex = context.read<RexService>();
    await Future.wait([rex.loadAgents(), rex.loadAgentProfiles()]);
  }

  Future<void> _createAgent() async {
    final rex = context.read<RexService>();
    final interval = int.tryParse(_intervalController.text.trim());
    await rex.createAgent(
      _selectedProfile,
      name: _nameController.text.trim(),
      model: _modelController.text.trim(),
      intervalSec: interval,
    );
    setState(() => _showCreateForm = false);
    _nameController.clear();
    _modelController.clear();
  }

  Future<void> _startAgent(String id) async {
    await context.read<RexService>().startAgent(id);
  }

  Future<void> _runOnce(String id) async {
    await context.read<RexService>().runAgentOnce(id);
  }

  Future<void> _stopAgent(String id) async {
    await context.read<RexService>().stopAgent(id);
  }

  Future<void> _toggleEnabled(AgentInfo agent) async {
    await context.read<RexService>().setAgentEnabled(
      agent.id,
      !agent.enabled,
    );
  }

  Future<void> _deleteAgent(String id) async {
    await context.read<RexService>().deleteAgent(id);
  }

  // --- Chat ---

  Future<void> _sendChat() async {
    final msg = _chatController.text.trim();
    if (msg.isEmpty || _chatThinking) return;

    setState(() {
      _chatHistory.add(_ChatMessage(role: 'user', text: msg));
      _chatThinking = true;
    });
    _chatController.clear();
    _scrollChatToBottom();

    try {
      final response = await context.read<RexService>().chatOrchestrator(msg);
      if (mounted) {
        setState(() {
          _chatHistory.add(_ChatMessage(role: 'orchestrator', text: response));
          _chatThinking = false;
        });
        _scrollChatToBottom();
        _saveChatHistory();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _chatHistory.add(_ChatMessage(role: 'orchestrator', text: 'Error: $e'));
          _chatThinking = false;
        });
      }
    }
  }

  void _scrollChatToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _clearChat() {
    setState(() => _chatHistory.clear());
    _saveChatHistory();
  }

  String get _chatFilePath {
    final home = Platform.environment['HOME'] ?? '';
    return '$home/.claude/rex/orchestrator-chat.json';
  }

  void _loadChatHistory() {
    try {
      final file = File(_chatFilePath);
      if (file.existsSync()) {
        final data = jsonDecode(file.readAsStringSync()) as List;
        _chatHistory = data
            .map((e) => _ChatMessage(
                  role: e['role'] as String,
                  text: e['text'] as String,
                ))
            .toList();
      }
    } catch (_) {}
  }

  void _saveChatHistory() {
    try {
      final dir = File(_chatFilePath).parent;
      if (!dir.existsSync()) dir.createSync(recursive: true);
      final data = _chatHistory.map((m) => {'role': m.role, 'text': m.text}).toList();
      final trimmed = data.length > 50 ? data.sublist(data.length - 50) : data;
      File(_chatFilePath).writeAsStringSync(jsonEncode(trimmed));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'Agents',
      actions: [
        RexHeaderButton(
          icon: CupertinoIcons.plus,
          label: 'Create',
          onPressed: () => setState(() => _showCreateForm = !_showCreateForm),
          showLabel: true,
        ),
      ],
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            final profiles = rex.agentProfiles
                .map((p) => (p['name'] as String?) ?? '')
                .where((p) => p.isNotEmpty)
                .toList();
            final availableProfiles = profiles.isEmpty
                ? const [
                    'scout',
                    'reviewer',
                    'fixer',
                    'architect',
                    'worker',
                    'monitor',
                    'orchestrator',
                  ]
                : profiles;

            if (!availableProfiles.contains(_selectedProfile)) {
              _selectedProfile = availableProfiles.first;
            }

            return Column(
              children: [
                // Top: agents list
                Expanded(
                  flex: 3,
                  child: ListView(
                    controller: scrollController,
                    padding: const EdgeInsets.all(16),
                    children: [
                      // Create form (collapsible)
                      if (_showCreateForm)
                        RexCard(
                          title: 'Create Agent',
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              RexSection(
                                title: 'Profile',
                                padding: const EdgeInsets.only(bottom: 8),
                              ),
                              Wrap(
                                spacing: 6,
                                runSpacing: 6,
                                children: availableProfiles
                                    .map(
                                      (profile) => RexButton(
                                        label: profile,
                                        small: true,
                                        variant: _selectedProfile == profile
                                            ? RexButtonVariant.primary
                                            : RexButtonVariant.secondary,
                                        onPressed: () =>
                                            setState(() => _selectedProfile = profile),
                                      ),
                                    )
                                    .toList(),
                              ),
                              const SizedBox(height: 10),
                              Row(
                                children: [
                                  Expanded(
                                    child: MacosTextField(
                                      controller: _nameController,
                                      placeholder: 'Name',
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  SizedBox(
                                    width: 100,
                                    child: MacosTextField(
                                      controller: _intervalController,
                                      placeholder: 'Interval (s)',
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  RexButton(
                                    label: 'Create',
                                    onPressed: rex.isLoading ? null : _createAgent,
                                    loading: rex.isLoading,
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),

                      // Agents list header
                      RexSection(
                        title: 'Agents (${rex.agents.length})',
                        action: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            RexButton(
                              label: 'Start all',
                              small: true,
                              variant: RexButtonVariant.ghost,
                              onPressed: rex.isLoading
                                  ? null
                                  : () async {
                                      for (final agent
                                          in rex.agents.where((a) => a.enabled)) {
                                        await rex.startAgent(agent.id);
                                      }
                                    },
                            ),
                            const SizedBox(width: 4),
                            RexButton(
                              label: 'Stop all',
                              small: true,
                              variant: RexButtonVariant.ghost,
                              onPressed: rex.isLoading
                                  ? null
                                  : () async {
                                      for (final agent
                                          in rex.agents.where((a) => a.running)) {
                                        await rex.stopAgent(agent.id);
                                      }
                                    },
                            ),
                          ],
                        ),
                      ),

                      if (rex.agents.isEmpty)
                        RexEmptyState(
                          icon: CupertinoIcons.sparkles,
                          title: 'No agents yet',
                          subtitle: 'Create one with the + button above',
                        )
                      else
                        ...rex.agents.map(
                          (agent) => _AgentCard(
                            agent: agent,
                            busy: rex.isLoading,
                            onStart: () => _startAgent(agent.id),
                            onRunOnce: () => _runOnce(agent.id),
                            onStop: () => _stopAgent(agent.id),
                            onToggleEnabled: () => _toggleEnabled(agent),
                            onDelete: () => _deleteAgent(agent.id),
                          ),
                        ),
                    ],
                  ),
                ),

                // Separator
                Container(height: 1, color: c.separator),

                // Bottom: Chat with orchestrator
                Expanded(
                  flex: 4,
                  child: Column(
                    children: [
                      // Chat header
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        child: Row(
                          children: [
                            Icon(CupertinoIcons.sparkles,
                                size: 14, color: c.accent),
                            const SizedBox(width: 6),
                            Text(
                              'Orchestrator',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                                color: c.text,
                              ),
                            ),
                            const Spacer(),
                            if (_chatThinking)
                              Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const CupertinoActivityIndicator(radius: 6),
                                  const SizedBox(width: 6),
                                  Text(
                                    'thinking...',
                                    style: TextStyle(
                                        fontSize: 11, color: c.textTertiary),
                                  ),
                                ],
                              ),
                            if (_chatHistory.isNotEmpty)
                              RexHeaderButton(
                                icon: CupertinoIcons.trash,
                                label: 'Clear',
                                onPressed: _clearChat,
                              ),
                          ],
                        ),
                      ),

                      // Chat messages
                      Expanded(
                        child: _chatHistory.isEmpty
                            ? Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(CupertinoIcons.bubble_left_bubble_right,
                                        size: 28, color: c.textTertiary),
                                    const SizedBox(height: 8),
                                    Text(
                                      'Chat with the Opus orchestrator',
                                      style: TextStyle(
                                          fontSize: 12, color: c.textTertiary),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      'It can create agents, run tasks, and coordinate work',
                                      style: TextStyle(
                                          fontSize: 11, color: c.textTertiary),
                                    ),
                                  ],
                                ),
                              )
                            : ListView.builder(
                                controller: _chatScrollController,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 16, vertical: 8),
                                itemCount: _chatHistory.length,
                                itemBuilder: (context, index) {
                                  final msg = _chatHistory[index];
                                  return _ChatBubble(message: msg);
                                },
                              ),
                      ),

                      // Chat input
                      Container(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        decoration: BoxDecoration(
                          border: Border(
                            top: BorderSide(color: c.separator, width: 0.5),
                          ),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: MacosTextField(
                                controller: _chatController,
                                placeholder: 'Ask the orchestrator...',
                                onSubmitted: (_) => _sendChat(),
                              ),
                            ),
                            const SizedBox(width: 8),
                            RexButton(
                              label: 'Send',
                              icon: CupertinoIcons.paperplane_fill,
                              onPressed: _chatThinking ? null : _sendChat,
                              loading: _chatThinking,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  @override
  void dispose() {
    _nameController.dispose();
    _modelController.dispose();
    _intervalController.dispose();
    _chatController.dispose();
    _chatScrollController.dispose();
    super.dispose();
  }
}

// --- Data ---

class _ChatMessage {
  final String role;
  final String text;
  _ChatMessage({required this.role, required this.text});
}

// --- Widgets ---

class _AgentCard extends StatelessWidget {
  final AgentInfo agent;
  final bool busy;
  final VoidCallback onStart;
  final VoidCallback onRunOnce;
  final VoidCallback onStop;
  final VoidCallback onToggleEnabled;
  final VoidCallback onDelete;

  const _AgentCard({
    required this.agent,
    required this.busy,
    required this.onStart,
    required this.onRunOnce,
    required this.onStop,
    required this.onToggleEnabled,
    required this.onDelete,
  });

  String _meta() {
    final parts = <String>[agent.profile];
    parts.add(agent.model.isNotEmpty ? agent.model : 'default');
    if (agent.intervalSec > 0) parts.add('${agent.intervalSec}s');
    if (agent.lastRunAt.isNotEmpty) parts.add(agent.lastRunAt);
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final chipStatus = agent.running
        ? RexChipStatus.ok
        : agent.enabled
            ? RexChipStatus.warning
            : RexChipStatus.inactive;
    final chipLabel = agent.running
        ? 'Running'
        : agent.enabled
            ? 'Enabled'
            : 'Disabled';

    return RexCard(
      title: agent.name.isNotEmpty ? agent.name : agent.id,
      trailing: RexStatusChip(
        label: chipLabel,
        status: chipStatus,
        small: true,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(
              _meta(),
              style: TextStyle(fontSize: 11, color: c.textSecondary),
              overflow: TextOverflow.ellipsis,
            ),
          ),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (agent.running)
                RexButton(
                  label: 'Stop',
                  small: true,
                  variant: RexButtonVariant.danger,
                  onPressed: busy ? null : onStop,
                )
              else
                RexButton(
                  label: 'Start',
                  small: true,
                  variant: RexButtonVariant.success,
                  onPressed: busy ? null : onStart,
                ),
              RexButton(
                label: 'Run once',
                small: true,
                variant: RexButtonVariant.secondary,
                icon: CupertinoIcons.bolt,
                onPressed: busy ? null : onRunOnce,
              ),
              RexButton(
                label: 'Delete',
                small: true,
                variant: RexButtonVariant.ghost,
                onPressed: busy ? null : onDelete,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ChatBubble extends StatelessWidget {
  final _ChatMessage message;
  const _ChatBubble({required this.message});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final isUser = message.role == 'user';

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment:
            isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!isUser) ...[
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: c.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(CupertinoIcons.sparkles, size: 13, color: c.accent),
            ),
            const SizedBox(width: 8),
          ],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isUser
                    ? c.accent.withValues(alpha: 0.08)
                    : c.surfaceSecondary,
                borderRadius: BorderRadius.circular(10),
                border: isUser
                    ? null
                    : Border.all(color: c.separator, width: 0.5),
              ),
              child: Text(
                message.text,
                style: TextStyle(
                  fontSize: isUser ? 13 : 12,
                  height: 1.4,
                  color: c.text,
                  fontFamily: isUser ? null : 'Menlo',
                ),
              ),
            ),
          ),
          if (isUser) ...[
            const SizedBox(width: 8),
            Container(
              width: 24,
              height: 24,
              decoration: BoxDecoration(
                color: c.text.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(CupertinoIcons.person_fill,
                  size: 13, color: c.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}
