import 'package:flutter/cupertino.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

// ── Types ───────────────────────────────────────────────────────────────────

class SandboxMessage {
  const SandboxMessage({
    required this.role,
    required this.content,
    required this.timestamp,
    this.meta,
  });

  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime timestamp;
  final Map<String, dynamic>? meta; // source, latencyMs, model

  String get metaLabel {
    if (meta == null) return '';
    final src = meta!['source'] as String? ?? '';
    final ms = meta!['latencyMs'] as int? ?? 0;
    return '$src · ${ms}ms';
  }
}

// ── Page ────────────────────────────────────────────────────────────────────

class SandboxPage extends StatefulWidget {
  const SandboxPage({super.key});

  @override
  State<SandboxPage> createState() => _SandboxPageState();
}

class _SandboxPageState extends State<SandboxPage> {
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _focusNode = FocusNode();
  final _messages = <SandboxMessage>[];
  bool _isRunning = false;
  String _taskType = 'general';

  static const _taskTypes = ['general', 'code', 'classify', 'review'];

  @override
  void dispose() {
    _controller.dispose();
    _scrollController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final prompt = _controller.text.trim();
    if (prompt.isEmpty || _isRunning) return;

    _controller.clear();
    setState(() {
      _messages.add(SandboxMessage(
        role: 'user',
        content: prompt,
        timestamp: DateTime.now(),
      ));
      _isRunning = true;
    });
    _scrollToBottom();

    try {
      final rex = context.read<RexService>();
      final output = await rex.runAsk(prompt: prompt, taskType: _taskType);
      final response = output['response'] as String? ?? '(no response)';
      final meta = <String, dynamic>{
        'source': output['source'] ?? 'unknown',
        'latencyMs': output['latencyMs'] ?? 0,
        'model': output['model'] ?? '',
      };
      if (mounted) {
        setState(() {
          _messages.add(SandboxMessage(
            role: 'assistant',
            content: response,
            timestamp: DateTime.now(),
            meta: meta,
          ));
          _isRunning = false;
        });
        _scrollToBottom();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _messages.add(SandboxMessage(
            role: 'assistant',
            content: 'Error: $e',
            timestamp: DateTime.now(),
          ));
          _isRunning = false;
        });
      }
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _clear() => setState(() => _messages.clear());

  @override
  Widget build(BuildContext context) {
    return RexPageLayout(
      title: 'Sandbox',
      actions: [
        if (_messages.isNotEmpty)
          RexHeaderButton(
            icon: CupertinoIcons.trash,
            label: 'Clear',
            onPressed: _clear,
          ),
      ],
      builder: (context, _) {
        return Column(
          children: [
            // Routing hint bar
            _RoutingBar(taskType: _taskType, onChanged: (t) => setState(() => _taskType = t)),
            // Messages
            Expanded(
              child: _messages.isEmpty
                  ? _EmptyHint(onExample: (p) {
                      _controller.text = p;
                      _focusNode.requestFocus();
                    })
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
                      itemCount: _messages.length + (_isRunning ? 1 : 0),
                      itemBuilder: (context, i) {
                        if (i == _messages.length) return const _ThinkingBubble();
                        return _MessageBubble(message: _messages[i]);
                      },
                    ),
            ),
            // Input
            _InputBar(
              controller: _controller,
              focusNode: _focusNode,
              isRunning: _isRunning,
              onSend: _send,
            ),
          ],
        );
      },
    );
  }
}

// ── Routing hint bar ─────────────────────────────────────────────────────────

class _RoutingBar extends StatelessWidget {
  const _RoutingBar({required this.taskType, required this.onChanged});

  final String taskType;
  final ValueChanged<String> onChanged;

  static const _types = ['general', 'code', 'classify', 'review'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(
          bottom: BorderSide(color: context.rex.separator),
        ),
      ),
      child: Row(
        children: [
          Icon(CupertinoIcons.arrow_right_arrow_left, size: 13, color: context.rex.textTertiary),
          const SizedBox(width: 6),
          Text(
            'Route:  cache → Ollama → free tier → subscription',
            style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
          ),
          const Spacer(),
          Text(
            'Task type: ',
            style: TextStyle(fontSize: 11, color: context.rex.textSecondary),
          ),
          ..._types.map((t) => _TypeChip(label: t, selected: t == taskType, onTap: () => onChanged(t))),
        ],
      ),
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(left: 4),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: selected ? context.rex.accent.withValues(alpha: 0.12) : context.rex.card,
          borderRadius: BorderRadius.circular(5),
          border: Border.all(
            color: selected ? context.rex.accent.withValues(alpha: 0.35) : context.rex.separator,
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

// ── Message bubble ───────────────────────────────────────────────────────────

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final SandboxMessage message;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Avatar
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: isUser
                  ? context.rex.accent.withValues(alpha: 0.12)
                  : context.rex.card,
              borderRadius: BorderRadius.circular(7),
              border: Border.all(color: context.rex.separator),
            ),
            child: Center(
              child: Text(
                isUser ? 'K' : 'R',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: isUser ? context.rex.accent : context.rex.textSecondary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      isUser ? 'You' : 'REX',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: context.rex.text,
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (!isUser && message.metaLabel.isNotEmpty)
                      Text(
                        message.metaLabel,
                        style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                _SelectableContent(content: message.content),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SelectableContent extends StatelessWidget {
  const _SelectableContent({required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () {
        Clipboard.setData(ClipboardData(text: content));
      },
      child: Text(
        content,
        style: TextStyle(
          fontSize: 13,
          height: 1.5,
          color: context.rex.text,
        ),
      ),
    );
  }
}

// ── Thinking indicator ───────────────────────────────────────────────────────

class _ThinkingBubble extends StatelessWidget {
  const _ThinkingBubble();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: context.rex.card,
              borderRadius: BorderRadius.circular(7),
              border: Border.all(color: context.rex.separator),
            ),
            child: Center(
              child: Text(
                'R',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: context.rex.textSecondary,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          const CupertinoActivityIndicator(radius: 8),
          const SizedBox(width: 8),
          Text(
            'Routing…',
            style: TextStyle(fontSize: 12, color: CupertinoColors.systemGrey),
          ),
        ],
      ),
    );
  }
}

// ── Empty state with examples ────────────────────────────────────────────────

class _EmptyHint extends StatelessWidget {
  const _EmptyHint({required this.onExample});

  final ValueChanged<String> onExample;

  static const _examples = [
    'Summarize what rex does in one sentence',
    'What is the routing chain order?',
    'Write a TypeScript function to debounce API calls',
    'Classify this text: "The server is down again"',
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(32),
      children: [
        Center(
          child: Column(
            children: [
              Icon(
                CupertinoIcons.square_stack_3d_up,
                size: 36,
                color: context.rex.textTertiary,
              ),
              const SizedBox(height: 12),
              Text(
                'Prompt Sandbox',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                  color: context.rex.text,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Send a prompt through the REX routing chain.\nCache → Ollama → Free tier → Subscription.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 13,
                  height: 1.5,
                  color: context.rex.textSecondary,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 28),
        Text(
          'EXAMPLES',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.8,
            color: context.rex.textTertiary,
          ),
        ),
        const SizedBox(height: 10),
        for (final ex in _examples)
          GestureDetector(
            onTap: () => onExample(ex),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: context.rex.card,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: context.rex.separator),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      ex,
                      style: TextStyle(fontSize: 13, color: context.rex.text),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(
                    CupertinoIcons.arrow_up_right,
                    size: 13,
                    color: context.rex.textTertiary,
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

// ── Input bar ────────────────────────────────────────────────────────────────

class _InputBar extends StatelessWidget {
  const _InputBar({
    required this.controller,
    required this.focusNode,
    required this.isRunning,
    required this.onSend,
  });

  final TextEditingController controller;
  final FocusNode focusNode;
  final bool isRunning;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(top: BorderSide(color: context.rex.separator)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Container(
              constraints: const BoxConstraints(maxHeight: 120),
              decoration: BoxDecoration(
                color: context.rex.card,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: context.rex.separator),
              ),
              child: CupertinoTextField(
                controller: controller,
                focusNode: focusNode,
                placeholder: 'Ask anything…',
                placeholderStyle: TextStyle(
                  fontSize: 13,
                  color: context.rex.textTertiary,
                ),
                style: TextStyle(fontSize: 13, color: context.rex.text),
                decoration: const BoxDecoration(),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                maxLines: null,
                textInputAction: TextInputAction.newline,
                onSubmitted: (_) => onSend(),
                enabled: !isRunning,
              ),
            ),
          ),
          const SizedBox(width: 10),
          GestureDetector(
            onTap: isRunning ? null : onSend,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isRunning
                    ? context.rex.textTertiary
                    : context.rex.accent,
                borderRadius: BorderRadius.circular(9),
              ),
              child: Center(
                child: isRunning
                    ? const CupertinoActivityIndicator(radius: 8, color: CupertinoColors.white)
                    : const Icon(
                        CupertinoIcons.arrow_up,
                        size: 16,
                        color: CupertinoColors.white,
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
