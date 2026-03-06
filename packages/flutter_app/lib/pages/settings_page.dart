import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText, FlutterLogo;
import 'package:flutter/services.dart';
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  int _tabIndex = 0;
  String _ollamaModels = '';
  String _systemInfo = '';
  bool _loadingOllama = false;
  String _llmPrompt = '';
  String _llmResult = '';
  bool _llmRunning = false;
  String _pullModel = '';
  String _pullOutput = '';
  bool _pulling = false;
  final _llmController = TextEditingController();
  final _pullController = TextEditingController();

  static const _tabs = ['General', 'Claude', 'LLM', 'Files', 'Advanced'];

  @override
  void initState() {
    super.initState();
    _loadOllamaInfo();
    _loadSysInfo();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RexService>().loadClaudeSettings();
    });
  }

  @override
  void dispose() {
    _llmController.dispose();
    _pullController.dispose();
    super.dispose();
  }

  Future<void> _loadOllamaInfo() async {
    setState(() => _loadingOllama = true);
    try {
      final env = Map<String, String>.from(Platform.environment);
      env['PATH'] = '/opt/homebrew/bin:/usr/local/bin:${env['PATH'] ?? ''}';
      final result = await Process.run('ollama', ['list'], environment: env);
      _ollamaModels = result.exitCode == 0
          ? result.stdout as String
          : 'Ollama not running';
    } catch (_) {
      _ollamaModels = 'Ollama not installed';
    }
    setState(() => _loadingOllama = false);
  }

  void _loadSysInfo() {
    final cpu = Platform.numberOfProcessors;
    _systemInfo =
        'Platform: ${Platform.operatingSystem} ${Platform.operatingSystemVersion}\n'
        'Processors: $cpu\n'
        'Dart: ${Platform.version.split(' ').first}\n'
        'Home: ${Platform.environment['HOME'] ?? 'unknown'}';
    setState(() {});
  }

  Future<void> _testLlm() async {
    if (_llmPrompt.isEmpty) return;
    setState(() {
      _llmRunning = true;
      _llmResult = '';
    });
    final result = await context.read<RexService>().runLlmTest(_llmPrompt);
    if (mounted)
      setState(() {
        _llmRunning = false;
        _llmResult = result;
      });
  }

  Future<void> _pullOllama() async {
    if (_pullModel.isEmpty) return;
    setState(() {
      _pulling = true;
      _pullOutput = '';
    });
    final result = await context.read<RexService>().pullOllamaModel(_pullModel);
    if (mounted)
      setState(() {
        _pulling = false;
        _pullOutput = result;
        _loadOllamaInfo();
      });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return RexPageLayout(
      title: 'Settings',
      builder: (context, scrollController) {
        return Consumer<RexService>(
          builder: (context, rex, _) {
            return Column(
              children: [
                    // Tab bar
                    Container(
                      height: 36,
                      color: c.surface,
                      child: Row(
                        children: _tabs.asMap().entries.map((e) {
                          final selected = e.key == _tabIndex;
                          return GestureDetector(
                            onTap: () => setState(() => _tabIndex = e.key),
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 16,
                              ),
                              height: 36,
                              decoration: BoxDecoration(
                                border: Border(
                                  bottom: BorderSide(
                                    color: selected
                                        ? c.accent
                                        : Colors.transparent,
                                    width: 2,
                                  ),
                                ),
                              ),
                              child: Center(
                                child: Text(
                                  e.value,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: selected
                                        ? FontWeight.w600
                                        : FontWeight.normal,
                                    color: selected
                                        ? c.accent
                                        : c.textSecondary,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                    Container(height: 0.5, color: c.separator),
                    // Tab content
                    Expanded(
                      child: IndexedStack(
                        index: _tabIndex,
                        children: [
                          _GeneralTab(
                            rex: rex,
                            ollamaModels: _ollamaModels,
                            loadingOllama: _loadingOllama,
                            systemInfo: _systemInfo,
                            c: c,
                            onShowOutput: _showOutput,
                          ),
                          _ClaudeTab(rex: rex, c: c),
                          _LlmTab(
                            rex: rex,
                            c: c,
                            ollamaModels: _ollamaModels,
                            loadingOllama: _loadingOllama,
                            llmController: _llmController,
                            llmRunning: _llmRunning,
                            llmResult: _llmResult,
                            pullController: _pullController,
                            pulling: _pulling,
                            pullOutput: _pullOutput,
                            onLlmPromptChanged: (v) =>
                                setState(() => _llmPrompt = v),
                            onTestLlm: _testLlm,
                            onPullModelChanged: (v) =>
                                setState(() => _pullModel = v),
                            onPull: _pullOllama,
                          ),
                          _FilesTab(rex: rex, c: c),
                          _AdvancedTab(
                            rex: rex,
                            c: c,
                            onShowOutput: _showOutput,
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

  void _showOutput(BuildContext context, String title, String output) {
    showMacosAlertDialog(
      context: context,
      builder: (context) => MacosAlertDialog(
        appIcon: const FlutterLogo(size: 48),
        title: Text(title),
        message: SizedBox(
          height: 300,
          child: SingleChildScrollView(
            child: SelectableText(
              output,
              style: const TextStyle(fontFamily: 'Menlo', fontSize: 11),
            ),
          ),
        ),
        primaryButton: PushButton(
          controlSize: ControlSize.large,
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('OK'),
        ),
      ),
    );
  }
}

// ─── GENERAL TAB ────────────────────────────────────────────────────────────

class _GeneralTab extends StatelessWidget {
  final RexService rex;
  final String ollamaModels;
  final bool loadingOllama;
  final String systemInfo;
  final RexColors c;
  final void Function(BuildContext, String, String) onShowOutput;

  const _GeneralTab({
    required this.rex,
    required this.ollamaModels,
    required this.loadingOllama,
    required this.systemInfo,
    required this.c,
    required this.onShowOutput,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      children: [
        // Status chips
        Row(
          children: [
            _StatusChip(
              title: 'Ollama',
              running: rex.ollamaRunning,
              icon: CupertinoIcons.cube_box,
              c: c,
            ),
            const SizedBox(width: 12),
            _StatusChip(
              title: 'Gateway',
              running: rex.gatewayRunning,
              icon: CupertinoIcons.paperplane,
              c: c,
            ),
            const SizedBox(width: 12),
            _StatusChip(
              title: 'Whisper',
              running: rex.whisperInstalled,
              icon: CupertinoIcons.mic,
              c: c,
            ),
          ],
        ),

        const SizedBox(height: 24),

        _SectionLabel('QUICK SETUP', c: c),
        const SizedBox(height: 6),
        _Card(
          c: c,
          children: [
            _SettingsRow(
              icon: CupertinoIcons.hammer,
              title: 'rex init',
              subtitle: 'Install guards, hooks, MCP, skills, LaunchAgents',
              c: c,
              trailing: RexButton(
                label: 'Run',
                small: true,
                onPressed: rex.isLoading
                    ? null
                    : () async {
                        final output = await rex.runInit();
                        if (context.mounted)
                          onShowOutput(context, 'Init', output);
                      },
              ),
            ),
            _Divider(c: c),
            _SettingsRow(
              icon: CupertinoIcons.gear_alt,
              title: 'rex setup',
              subtitle: 'Install Ollama + models + Telegram gateway',
              c: c,
              trailing: RexButton(
                label: 'Run',
                small: true,
                onPressed: rex.isLoading
                    ? null
                    : () async {
                        final output = await rex.runSetup();
                        if (context.mounted)
                          onShowOutput(context, 'Setup', output);
                      },
              ),
            ),
            _Divider(c: c),
            _SettingsRow(
              icon: CupertinoIcons.arrow_clockwise_circle,
              title: 'Update app',
              subtitle: 'Build + install latest Flutter app from this repo',
              c: c,
              trailing: RexButton(
                label: 'Update',
                small: true,
                onPressed: rex.isLoading
                    ? null
                    : () async {
                        final output = await rex.runAppUpdate();
                        if (context.mounted)
                          onShowOutput(context, 'App Update', output);
                      },
              ),
            ),
            _Divider(c: c),
            _SettingsRow(
              icon: CupertinoIcons.bolt,
              title: 'Gateway',
              subtitle: rex.gatewayRunning
                  ? 'Telegram bot is running'
                  : 'Start Telegram bot',
              c: c,
              trailing: RexButton(
                label: rex.gatewayRunning ? 'Stop' : 'Start',
                small: true,
                variant: rex.gatewayRunning ? RexButtonVariant.danger : RexButtonVariant.primary,
                onPressed: () async {
                  if (rex.gatewayRunning) {
                    await rex.stopGateway();
                  } else {
                    await rex.startGateway();
                  }
                },
              ),
            ),
          ],
        ),

        const SizedBox(height: 24),

        // Ollama Models
        _SectionLabel('OLLAMA MODELS', c: c),
        const SizedBox(height: 6),
        loadingOllama
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: CupertinoActivityIndicator(),
                ),
              )
            : _CodeBox(
                text: ollamaModels.trim().isEmpty
                    ? 'No models found'
                    : ollamaModels.trim(),
                c: c,
              ),

        const SizedBox(height: 24),

        _SectionLabel('SYSTEM', c: c),
        const SizedBox(height: 6),
        _CodeBox(text: systemInfo, c: c),

        const SizedBox(height: 24),

        _SectionLabel('LINKS', c: c),
        const SizedBox(height: 6),
        _Card(
          c: c,
          children: [
            _SettingsRow(
              icon: CupertinoIcons.link,
              title: 'GitHub Repository',
              subtitle: 'github.com/Keiy78120/rex',
              c: c,
              trailing: RexButton(
                label: 'Open',
                small: true,
                variant: RexButtonVariant.secondary,
                onPressed: () =>
                    launchUrl(Uri.parse('https://github.com/Keiy78120/rex')),
              ),
            ),
            _Divider(c: c),
            _SettingsRow(
              icon: CupertinoIcons.doc_text,
              title: 'Ollama',
              subtitle: 'ollama.com — local LLM runtime',
              c: c,
              trailing: RexButton(
                label: 'Open',
                small: true,
                variant: RexButtonVariant.secondary,
                onPressed: () => launchUrl(Uri.parse('https://ollama.com')),
              ),
            ),
          ],
        ),

        const SizedBox(height: 40),
      ],
    );
  }
}

// ─── CLAUDE TAB ─────────────────────────────────────────────────────────────

class _ClaudeTab extends StatefulWidget {
  final RexService rex;
  final RexColors c;
  const _ClaudeTab({required this.rex, required this.c});

  @override
  State<_ClaudeTab> createState() => _ClaudeTabState();
}

class _ClaudeTabState extends State<_ClaudeTab> {
  late final TextEditingController _maxTokensCtrl;
  late final TextEditingController _autocompactCtrl;

  @override
  void initState() {
    super.initState();
    _maxTokensCtrl = TextEditingController(text: widget.rex.maxOutputTokens);
    _autocompactCtrl = TextEditingController(text: widget.rex.autocompactPct);
  }

  @override
  void dispose() {
    _maxTokensCtrl.dispose();
    _autocompactCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final rex = widget.rex;

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      children: [
        // Model picker
        _SectionLabel('DEFAULT MODEL', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            ...[
              ('haiku', 'claude-haiku-4-5', 'Fast, cost-effective'),
              ('sonnet', 'claude-sonnet-4-6', 'Balanced — recommended'),
              ('opus', 'claude-opus-4-6', 'Most capable'),
            ].map((opt) {
              final selected = rex.claudeModel == opt.$1;
              return _RadioRow(
                value: opt.$1,
                label:
                    opt.$1.substring(0, 1).toUpperCase() + opt.$1.substring(1),
                sublabel: '${opt.$2} — ${opt.$3}',
                selected: selected,
                c: c,
                onTap: () => rex.setClaudeModel(opt.$1),
              );
            }),
          ],
        ),

        const SizedBox(height: 20),

        // Effort level
        _SectionLabel('EFFORT LEVEL', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            ...[
              ('low', 'Low', 'Faster, fewer tokens'),
              ('normal', 'Normal', 'Balanced'),
              ('high', 'High', 'Most thorough — default'),
            ].map((opt) {
              final selected = rex.claudeEffort == opt.$1;
              return _RadioRow(
                value: opt.$1,
                label: opt.$2,
                sublabel: opt.$3,
                selected: selected,
                c: c,
                onTap: () => rex.setClaudeEffort(opt.$1),
              );
            }),
          ],
        ),

        const SizedBox(height: 20),

        // Token limits
        _SectionLabel('TOKEN LIMITS', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(CupertinoIcons.number, size: 16, color: c.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Max output tokens',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 90,
                    child: MacosTextField(
                      controller: _maxTokensCtrl,
                      placeholder: '64000',
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      onChanged: (v) => rex.setMaxOutputTokens(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
            _Divider(c: c),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.arrow_down_right_arrow_up_left,
                    size: 16,
                    color: c.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Auto-compact at %',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'CLAUDE_AUTOCOMPACT_PCT_OVERRIDE',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 60,
                    child: MacosTextField(
                      controller: _autocompactCtrl,
                      placeholder: '75',
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      onChanged: (v) => rex.setAutocompactPct(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                  Text(
                    '%',
                    style: TextStyle(fontSize: 13, color: c.textSecondary),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Display options
        _SectionLabel('DISPLAY', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  Icon(CupertinoIcons.timer, size: 16, color: c.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Show turn duration',
                      style: TextStyle(fontSize: 13, color: c.text),
                    ),
                  ),
                  MacosSwitch(
                    value: rex.showTurnDuration,
                    onChanged: (v) => rex.setShowTurnDuration(v),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 40),
      ],
    );
  }
}

// ─── LLM TAB ────────────────────────────────────────────────────────────────

class _LlmTab extends StatefulWidget {
  final RexService rex;
  final RexColors c;
  final String ollamaModels;
  final bool loadingOllama;
  final TextEditingController llmController;
  final bool llmRunning;
  final String llmResult;
  final TextEditingController pullController;
  final bool pulling;
  final String pullOutput;
  final ValueChanged<String> onLlmPromptChanged;
  final VoidCallback onTestLlm;
  final ValueChanged<String> onPullModelChanged;
  final VoidCallback onPull;

  const _LlmTab({
    required this.rex,
    required this.c,
    required this.ollamaModels,
    required this.loadingOllama,
    required this.llmController,
    required this.llmRunning,
    required this.llmResult,
    required this.pullController,
    required this.pulling,
    required this.pullOutput,
    required this.onLlmPromptChanged,
    required this.onTestLlm,
    required this.onPullModelChanged,
    required this.onPull,
  });

  @override
  State<_LlmTab> createState() => _LlmTabState();
}

class _LlmTabState extends State<_LlmTab> {
  late final TextEditingController _tempCtrl;
  late final TextEditingController _urlCtrl;
  late final TextEditingController _voiceOptimizeModelCtrl;

  @override
  void initState() {
    super.initState();
    _tempCtrl = TextEditingController(text: widget.rex.ollamaLlmTemperature);
    _urlCtrl = TextEditingController(text: widget.rex.ollamaUrl);
    _voiceOptimizeModelCtrl = TextEditingController(
      text: widget.rex.voiceOptimizeModel,
    );
  }

  @override
  void dispose() {
    _tempCtrl.dispose();
    _urlCtrl.dispose();
    _voiceOptimizeModelCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final rex = widget.rex;

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      children: [
        // Ollama config
        _SectionLabel('OLLAMA', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(CupertinoIcons.link, size: 16, color: c.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'Ollama URL',
                      style: TextStyle(fontSize: 13, color: c.text),
                    ),
                  ),
                  SizedBox(
                    width: 200,
                    child: MacosTextField(
                      controller: _urlCtrl,
                      placeholder: 'http://localhost:11434',
                      onChanged: (v) => rex.setOllamaUrl(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
            _Divider(c: c),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.thermometer,
                    size: 16,
                    color: c.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Temperature',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_LLM_TEMPERATURE (0.0 - 1.0)',
                          style: TextStyle(fontSize: 10, color: c.textTertiary),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 70,
                    child: MacosTextField(
                      controller: _tempCtrl,
                      placeholder: '0.7',
                      onChanged: (v) => rex.setOllamaTemperature(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Voice optimization
        _SectionLabel('VOICE OPTIMIZATION', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.waveform_path_badge_plus,
                    size: 16,
                    color: c.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Optimize Whisper transcript',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_VOICE_OPTIMIZE_ENABLED',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  MacosSwitch(
                    value: rex.voiceOptimizeEnabled,
                    onChanged: (v) => rex.setVoiceOptimizeEnabled(v),
                  ),
                ],
              ),
            ),
            _Divider(c: c),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(CupertinoIcons.cube_box, size: 16, color: c.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Optimization model (local)',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_VOICE_OPTIMIZE_MODEL',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 180,
                    child: MacosTextField(
                      controller: _voiceOptimizeModelCtrl,
                      placeholder: 'qwen3.5:4b',
                      onChanged: (v) => rex.setVoiceOptimizeModel(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Installed models
        _SectionLabel('INSTALLED MODELS', c: c),
        const SizedBox(height: 8),
        widget.loadingOllama
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: CupertinoActivityIndicator(),
                ),
              )
            : _CodeBox(
                text: widget.ollamaModels.trim().isEmpty
                    ? 'No models found'
                    : widget.ollamaModels.trim(),
                c: c,
              ),

        const SizedBox(height: 16),

        // Pull model
        Row(
          children: [
            Expanded(
              child: MacosTextField(
                controller: widget.pullController,
                placeholder: 'Model name (e.g. qwen3.5:4b)',
                onChanged: widget.onPullModelChanged,
              ),
            ),
            const SizedBox(width: 10),
            RexButton(
              label: widget.pulling ? 'Pulling...' : 'Pull',
              loading: widget.pulling,
              onPressed: widget.pulling ? null : widget.onPull,
            ),
          ],
        ),
        if (widget.pullOutput.isNotEmpty) ...[
          const SizedBox(height: 10),
          _CodeBox(text: widget.pullOutput, c: c),
        ],

        const SizedBox(height: 20),

        // LLM test
        _SectionLabel('TEST LLM', c: c),
        const SizedBox(height: 8),
        MacosTextField(
          controller: widget.llmController,
          placeholder: 'Enter prompt to test rex llm...',
          maxLines: 3,
          onChanged: widget.onLlmPromptChanged,
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            RexButton(
              label: widget.llmRunning ? 'Running...' : 'Send to rex llm',
              loading: widget.llmRunning,
              onPressed: widget.llmRunning ? null : widget.onTestLlm,
            ),
          ],
        ),
        if (widget.llmResult.isNotEmpty) ...[
          const SizedBox(height: 10),
          _CodeBox(text: widget.llmResult, c: c),
        ],

        const SizedBox(height: 40),
      ],
    );
  }
}

// ─── FILES TAB ──────────────────────────────────────────────────────────────

class _FilesTab extends StatefulWidget {
  final RexService rex;
  final RexColors c;
  const _FilesTab({required this.rex, required this.c});

  @override
  State<_FilesTab> createState() => _FilesTabState();
}

class _FilesTabState extends State<_FilesTab> {
  List<Map<String, String>> _files = [];
  int _selectedIndex = 0;
  String _content = '';
  bool _loading = false;
  bool _saving = false;
  bool _saved = false;
  late final TextEditingController _editorCtrl;

  @override
  void initState() {
    super.initState();
    _editorCtrl = TextEditingController();
    _files = widget.rex.listEditableFiles();
    if (_files.isNotEmpty) _loadFile(0);
  }

  @override
  void dispose() {
    _editorCtrl.dispose();
    super.dispose();
  }

  void _loadFile(int idx) {
    setState(() {
      _loading = true;
      _selectedIndex = idx;
    });
    final path = _files[idx]['path']!;
    final content =
        widget.rex.readFile(path) ??
        '# File not found: $path\n\nCreate it with your desired content.';
    setState(() {
      _content = content;
      _editorCtrl.text = content;
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final path = _files[_selectedIndex]['path']!;
    widget.rex.writeFile(path, _editorCtrl.text);
    await Future.delayed(const Duration(milliseconds: 300));
    if (mounted) {
      setState(() {
        _saving = false;
        _saved = true;
      });
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) setState(() => _saved = false);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Column(
      children: [
        // File selector
        Container(
          height: 40,
          color: c.codeBg,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            itemCount: _files.length,
            itemBuilder: (ctx, i) {
              final selected = i == _selectedIndex;
              return GestureDetector(
                onTap: () => _loadFile(i),
                child: Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: selected ? c.accent : c.surface,
                    borderRadius: BorderRadius.circular(5),
                    border: Border.all(
                      color: selected ? c.accent : c.separator,
                      width: 0.5,
                    ),
                  ),
                  child: Text(
                    _files[i]['label']!,
                    style: TextStyle(
                      fontSize: 11,
                      color: selected
                          ? const Color(0xFFFFFFFF)
                          : c.textSecondary,
                      fontFamily: 'Menlo',
                      fontWeight: selected
                          ? FontWeight.w600
                          : FontWeight.normal,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
        Container(height: 0.5, color: c.separator),
        // Save bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          color: c.surface,
          child: Row(
            children: [
              if (_files.isNotEmpty)
                Expanded(
                  child: Text(
                    _files[_selectedIndex]['path']!,
                    style: TextStyle(
                      fontSize: 10,
                      color: c.textTertiary,
                      fontFamily: 'Menlo',
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              const SizedBox(width: 8),
              RexButton(
                label: _saving ? 'Saving...' : (_saved ? 'Saved!' : 'Save'),
                small: true,
                loading: _saving,
                variant: _saved ? RexButtonVariant.success : RexButtonVariant.primary,
                icon: !_saving ? (_saved ? CupertinoIcons.checkmark : CupertinoIcons.floppy_disk) : null,
                onPressed: _saving ? null : _save,
              ),
            ],
          ),
        ),
        Container(height: 0.5, color: c.separator),
        // Editor
        Expanded(
          child: _loading
              ? const Center(child: CupertinoActivityIndicator())
              : MacosTextField(
                  controller: _editorCtrl,
                  maxLines: null,
                  expands: true,
                  style: TextStyle(
                    fontFamily: 'Menlo',
                    fontSize: 11,
                    height: 1.5,
                    color: c.text,
                  ),
                  decoration: BoxDecoration(color: c.codeBg),
                  padding: const EdgeInsets.all(14),
                ),
        ),
      ],
    );
  }
}

// ─── ADVANCED TAB ───────────────────────────────────────────────────────────

class _AdvancedTab extends StatefulWidget {
  final RexService rex;
  final RexColors c;
  final void Function(BuildContext, String, String) onShowOutput;
  const _AdvancedTab({
    required this.rex,
    required this.c,
    required this.onShowOutput,
  });

  @override
  State<_AdvancedTab> createState() => _AdvancedTabState();
}

class _AdvancedTabState extends State<_AdvancedTab> {
  late final TextEditingController _botTokenCtrl;
  late final TextEditingController _chatIdCtrl;

  @override
  void initState() {
    super.initState();
    _botTokenCtrl = TextEditingController(text: widget.rex.telegramBotToken);
    _chatIdCtrl = TextEditingController(text: widget.rex.telegramChatId);
  }

  @override
  void dispose() {
    _botTokenCtrl.dispose();
    _chatIdCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    final rex = widget.rex;
    final settings = rex.claudeSettings;
    final hooks = settings['hooks'] as Map<String, dynamic>? ?? {};
    final mcpServers = settings['mcpServers'] as Map<String, dynamic>? ?? {};

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
      children: [
        // Telegram config
        _SectionLabel('TELEGRAM GATEWAY', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.paperplane_fill,
                    size: 16,
                    color: c.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Bot Token',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_TELEGRAM_BOT_TOKEN',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 220,
                    child: MacosTextField(
                      controller: _botTokenCtrl,
                      placeholder: '1234567890:AAE...',
                      obscureText: true,
                      onChanged: (v) => rex.setTelegramBotToken(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
            _Divider(c: c),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.person_fill,
                    size: 16,
                    color: c.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Chat ID',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_TELEGRAM_CHAT_ID',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  SizedBox(
                    width: 140,
                    child: MacosTextField(
                      controller: _chatIdCtrl,
                      placeholder: '7945769486',
                      keyboardType: TextInputType.number,
                      onChanged: (v) => rex.setTelegramChatId(v),
                      textAlign: TextAlign.right,
                    ),
                  ),
                ],
              ),
            ),
            _Divider(c: c),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(CupertinoIcons.bell, size: 16, color: c.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Test notification',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'Sends "REX ping" to your chat',
                          style: TextStyle(fontSize: 11, color: c.textTertiary),
                        ),
                      ],
                    ),
                  ),
                  RexButton(
                    label: 'Ping',
                    small: true,
                    variant: RexButtonVariant.secondary,
                    onPressed: () async {
                      final token = rex.telegramBotToken;
                      final chatId = rex.telegramChatId;
                      if (token.isEmpty || chatId.isEmpty) {
                        widget.onShowOutput(
                          context,
                          'Error',
                          'Bot token and Chat ID are required',
                        );
                        return;
                      }
                      try {
                        final result = await Process.run('curl', [
                          '-s',
                          'https://api.telegram.org/bot$token/sendMessage',
                          '-d',
                          'chat_id=$chatId&text=REX+ping+from+Flutter+app',
                        ]);
                        if (context.mounted) {
                          widget.onShowOutput(
                            context,
                            'Telegram Test',
                            result.stdout as String,
                          );
                        }
                      } catch (e) {
                        if (context.mounted) {
                          widget.onShowOutput(context, 'Error', '$e');
                        }
                      }
                    },
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Memory categorization model
        _SectionLabel('MEMORY', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(CupertinoIcons.sparkles, size: 16, color: c.accent),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Categorize model',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_CATEGORIZE_MODEL — used by rex categorize',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  CupertinoSlidingSegmentedControl<String>(
                    groupValue: rex.categorizingModel,
                    children: const {
                      'qwen': Text('Qwen', style: TextStyle(fontSize: 12)),
                      'claude': Text('Claude', style: TextStyle(fontSize: 12)),
                    },
                    onValueChanged: (v) {
                      if (v != null) rex.setCategorizingModel(v);
                    },
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        _SectionLabel('CALL AUTOMATION', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.phone_fill,
                    size: 16,
                    color: c.accent,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Auto record call events',
                          style: TextStyle(fontSize: 13, color: c.text),
                        ),
                        Text(
                          'REX_CALL_AUTO_RECORD_ENABLED',
                          style: TextStyle(
                            fontSize: 10,
                            color: c.textTertiary,
                            fontFamily: 'Menlo',
                          ),
                        ),
                      ],
                    ),
                  ),
                  MacosSwitch(
                    value: rex.callAutoRecordEnabled,
                    onChanged: (v) => rex.setCallAutoRecordEnabled(v),
                  ),
                ],
              ),
            ),
            _Divider(c: c),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  Icon(
                    rex.callStateActive
                        ? CupertinoIcons.waveform_path_ecg
                        : CupertinoIcons.waveform_path,
                    size: 16,
                    color: rex.callStateActive ? c.success : c.textTertiary,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      rex.callStateActive
                          ? 'Call active: ${rex.callStateApp.isEmpty ? "unknown app" : rex.callStateApp}'
                          : 'No active call detected',
                      style: TextStyle(fontSize: 12, color: c.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Rex commands
        _SectionLabel('REX COMMANDS', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            _SettingsRow(
              icon: CupertinoIcons.clock,
              title: 'rex startup',
              subtitle: 'Install LaunchAgent (auto-start on login)',
              c: c,
              trailing: RexButton(
                label: 'Install',
                small: true,
                onPressed: () async {
                  final output = await rex.runStartup();
                  if (context.mounted)
                    widget.onShowOutput(context, 'Startup', output);
                },
              ),
            ),
            _Divider(c: c),
            _SettingsRow(
              icon: CupertinoIcons.trash,
              title: 'rex startup-remove',
              subtitle: 'Remove LaunchAgent',
              c: c,
              trailing: RexButton(
                label: 'Remove',
                small: true,
                variant: RexButtonVariant.secondary,
                onPressed: () async {
                  final output = await rex.runStartupRemove();
                  if (context.mounted)
                    widget.onShowOutput(context, 'Startup Remove', output);
                },
              ),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Hooks status
        _SectionLabel('HOOKS (${hooks.length} events)', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: hooks.isEmpty
              ? [
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      'No hooks configured',
                      style: TextStyle(color: c.textSecondary, fontSize: 12),
                    ),
                  ),
                ]
              : hooks.entries.map((e) {
                  final hookList = (e.value as List?)?.cast<dynamic>() ?? [];
                  final count = hookList.fold<int>(0, (sum, item) {
                    final hooks2 = ((item as Map?)?['hooks'] as List?) ?? [];
                    return sum + hooks2.length;
                  });
                  return _SettingsRow(
                    icon: CupertinoIcons.tag,
                    title: e.key,
                    subtitle: '$count handler(s)',
                    c: c,
                  );
                }).toList(),
        ),

        const SizedBox(height: 20),

        // MCP servers
        _SectionLabel('MCP SERVERS', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: mcpServers.isEmpty
              ? [
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Text(
                      'No MCP servers configured',
                      style: TextStyle(color: c.textSecondary, fontSize: 12),
                    ),
                  ),
                ]
              : mcpServers.entries.map((e) {
                  final srv = e.value as Map<String, dynamic>? ?? {};
                  final cmd = srv['command'] as String? ?? '';
                  final args = (srv['args'] as List?)?.join(' ') ?? '';
                  return _SettingsRow(
                    icon: CupertinoIcons.device_desktop,
                    title: e.key,
                    subtitle: '$cmd $args'.trim(),
                    c: c,
                  );
                }).toList(),
        ),

        const SizedBox(height: 20),

        // Plugins
        if ((settings['enabledPlugins'] as Map?)?.isNotEmpty == true) ...[
          _SectionLabel('PLUGINS', c: c),
          const SizedBox(height: 8),
          _Card(
            c: c,
            children: (settings['enabledPlugins'] as Map<String, dynamic>)
                .entries
                .map((e) {
                  final enabled = e.value as bool? ?? false;
                  return _SettingsRow(
                    icon: enabled
                        ? CupertinoIcons.checkmark_circle_fill
                        : CupertinoIcons.xmark_circle,
                    title: e.key.split('@').first,
                    subtitle: e.key,
                    c: c,
                  );
                })
                .toList(),
          ),
          const SizedBox(height: 20),
        ],

        // Reload button
        _SectionLabel('MAINTENANCE', c: c),
        const SizedBox(height: 8),
        _Card(
          c: c,
          children: [
            _SettingsRow(
              icon: CupertinoIcons.refresh,
              title: 'Reload settings',
              subtitle: 'Re-read ~/.claude/settings.json from disk',
              c: c,
              trailing: RexButton(
                label: 'Reload',
                small: true,
                variant: RexButtonVariant.secondary,
                onPressed: () => rex.loadClaudeSettings(),
              ),
            ),
          ],
        ),

        const SizedBox(height: 40),
      ],
    );
  }
}

// ─── SHARED WIDGETS ─────────────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  final String title;
  final bool running;
  final IconData icon;
  final RexColors c;

  const _StatusChip({
    required this.title,
    required this.running,
    required this.icon,
    required this.c,
  });

  @override
  Widget build(BuildContext context) {
    final color = running ? c.success : c.error;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.separator, width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: c.accent),
          const SizedBox(width: 8),
          Text(
            title,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: c.text,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 7,
            height: 7,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: color.withAlpha(80), blurRadius: 4)],
            ),
          ),
          const SizedBox(width: 4),
          Text(
            running ? 'OK' : 'Off',
            style: TextStyle(fontSize: 11, color: color),
          ),
        ],
      ),
    );
  }
}

class _Card extends StatelessWidget {
  final RexColors c;
  final List<Widget> children;
  const _Card({required this.c, required this.children});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: c.separator, width: 0.5),
      ),
      child: Column(children: children),
    );
  }
}

class _Divider extends StatelessWidget {
  final RexColors c;
  const _Divider({required this.c});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 44),
    child: Container(height: 0.5, color: c.separator),
  );
}

class _CodeBox extends StatelessWidget {
  final String text;
  final RexColors c;
  const _CodeBox({required this.text, required this.c});

  @override
  Widget build(BuildContext context) {
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

class _RadioRow extends StatelessWidget {
  final String value;
  final String label;
  final String sublabel;
  final bool selected;
  final RexColors c;
  final VoidCallback onTap;

  const _RadioRow({
    required this.value,
    required this.label,
    required this.sublabel,
    required this.selected,
    required this.c,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: selected ? c.accent : c.separator,
                  width: 2,
                ),
                color: selected ? c.accent : Colors.transparent,
              ),
              child: selected
                  ? const Center(
                      child: Icon(
                        CupertinoIcons.circle_fill,
                        size: 6,
                        color: Color(0xFFFFFFFF),
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: c.text,
                    ),
                  ),
                  Text(
                    sublabel,
                    style: TextStyle(fontSize: 11, color: c.textTertiary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final RexColors c;
  const _SectionLabel(this.text, {required this.c});

  @override
  Widget build(BuildContext context) {
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

class _SettingsRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final RexColors c;
  final Widget? trailing;

  const _SettingsRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.c,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(
        children: [
          Icon(icon, size: 16, color: c.accent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(fontSize: 13, color: c.text)),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 11, color: c.textTertiary),
                ),
              ],
            ),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

// Add Colors.transparent compatibility
class Colors {
  static const transparent = Color(0x00000000);
}
