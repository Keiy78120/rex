import 'dart:io';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';

class ContextPage extends StatefulWidget {
  const ContextPage({super.key});

  @override
  State<ContextPage> createState() => _ContextPageState();
}

class _ContextPageState extends State<ContextPage> {
  final _pathController = TextEditingController();
  String _output = '';
  bool _running = false;
  List<String> _recentPaths = [];

  @override
  void initState() {
    super.initState();
    _pathController.text = Platform.environment['HOME'] ?? '';
  }

  @override
  void dispose() {
    _pathController.dispose();
    super.dispose();
  }

  Future<void> _analyze() async {
    final path = _pathController.text.trim();
    if (path.isEmpty) return;
    setState(() { _running = true; _output = ''; });

    final output = await context.read<RexService>().runContext(path);
    if (mounted) {
      setState(() {
        _running = false;
        _output = output;
        if (!_recentPaths.contains(path)) {
          _recentPaths.insert(0, path);
          if (_recentPaths.length > 5) _recentPaths = _recentPaths.sublist(0, 5);
        }
      });
    }
  }

  Future<void> _pickDirectory() async {
    // Simple common paths
    final home = Platform.environment['HOME'] ?? '';
    _pathController.text = '$home/Documents/Developer/keiy/rex';
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return MacosScaffold(
      toolBar: const ToolBar(
        title: Text('Context'),
        titleWidth: 150,
      ),
      children: [
        ContentArea(
          builder: (ctx, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
              children: [
                // Header
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    MacosIcon(CupertinoIcons.folder_fill, size: 20, color: c.accent),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Project Context Analyzer', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: c.text)),
                          const SizedBox(height: 4),
                          Text('Analyzes a project and recommends which MCP servers, skills, and Claude settings to activate.', style: TextStyle(fontSize: 12, color: c.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Path input
                _SectionLabel('PROJECT PATH', c: c),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: MacosTextField(
                        controller: _pathController,
                        placeholder: '/path/to/your/project',
                        onSubmitted: (_) => _analyze(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    PushButton(
                      controlSize: ControlSize.large,
                      secondary: true,
                      onPressed: _pickDirectory,
                      child: const MacosIcon(CupertinoIcons.folder, size: 16),
                    ),
                    const SizedBox(width: 8),
                    PushButton(
                      controlSize: ControlSize.large,
                      onPressed: _running ? null : _analyze,
                      child: _running
                          ? const Row(mainAxisSize: MainAxisSize.min, children: [
                              SizedBox(width: 14, height: 14, child: ProgressCircle(radius: 7)),
                              SizedBox(width: 8),
                              Text('Analyzing...'),
                            ])
                          : const Text('Analyze'),
                    ),
                  ],
                ),

                // Recent paths
                if (_recentPaths.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text('Recent:', style: TextStyle(fontSize: 11, color: c.textTertiary)),
                      const SizedBox(width: 8),
                      ..._recentPaths.take(3).map((p) => GestureDetector(
                        onTap: () { _pathController.text = p; setState(() {}); },
                        child: Container(
                          margin: const EdgeInsets.only(right: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: c.surface,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: c.separator, width: 0.5),
                          ),
                          child: Text(
                            p.split('/').last,
                            style: TextStyle(fontSize: 11, color: c.textSecondary),
                          ),
                        ),
                      )),
                    ],
                  ),
                ],

                const SizedBox(height: 24),

                // Output
                if (_output.isNotEmpty) ...[
                  _SectionLabel('ANALYSIS', c: c),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: c.codeBg,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: c.separator, width: 0.5),
                    ),
                    child: SelectableText(
                      _output,
                      style: TextStyle(fontFamily: 'Menlo', fontSize: 11, height: 1.5, color: c.text),
                    ),
                  ),
                ] else if (!_running) ...[
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 40),
                      child: Column(
                        children: [
                          MacosIcon(CupertinoIcons.folder_fill, size: 36, color: c.textTertiary),
                          const SizedBox(height: 10),
                          Text('Enter a project path and click Analyze', style: TextStyle(color: c.textSecondary, fontSize: 13)),
                          const SizedBox(height: 4),
                          Text('Detects stack, recommends MCP servers and skills', style: TextStyle(fontSize: 11, color: c.textTertiary)),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 24),

                // Info
                _SectionLabel('WHAT IT DETECTS', c: c),
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: c.surface,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: c.separator, width: 0.5),
                  ),
                  child: Column(
                    children: [
                      _InfoRow(icon: CupertinoIcons.doc_text, text: 'package.json / pubspec.yaml / Cargo.toml', c: c),
                      Container(height: 0.5, color: c.separator, margin: const EdgeInsets.only(left: 44)),
                      _InfoRow(icon: CupertinoIcons.gear, text: 'MCP servers to activate for the stack', c: c),
                      Container(height: 0.5, color: c.separator, margin: const EdgeInsets.only(left: 44)),
                      _InfoRow(icon: CupertinoIcons.hammer, text: 'Skills relevant to the project type', c: c),
                      Container(height: 0.5, color: c.separator, margin: const EdgeInsets.only(left: 44)),
                      _InfoRow(icon: CupertinoIcons.sparkles, text: 'Claude model recommendation based on complexity', c: c),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  final RexColors c;
  const _SectionLabel(this.text, {required this.c});
  @override
  Widget build(BuildContext context) =>
      Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: c.textSecondary, letterSpacing: 0.5));
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;
  final RexColors c;
  const _InfoRow({required this.icon, required this.text, required this.c});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
    child: Row(children: [
      MacosIcon(icon, size: 16, color: c.accent),
      const SizedBox(width: 12),
      Expanded(child: Text(text, style: TextStyle(fontSize: 12, color: c.text))),
    ]),
  );
}
