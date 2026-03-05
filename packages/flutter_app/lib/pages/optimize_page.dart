import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:macos_ui/macos_ui.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';

class OptimizePage extends StatefulWidget {
  const OptimizePage({super.key});

  @override
  State<OptimizePage> createState() => _OptimizePageState();
}

class _OptimizePageState extends State<OptimizePage> {
  String _analysisOutput = '';
  bool _analyzing = false;
  bool _applying = false;

  Future<void> _analyze() async {
    setState(() => _analyzing = true);
    final output = await context.read<RexService>().runOptimize();
    setState(() {
      _analysisOutput = output;
      _analyzing = false;
    });
  }

  Future<void> _apply() async {
    setState(() => _applying = true);
    final output = await context.read<RexService>().runOptimize(apply: true);
    setState(() {
      _analysisOutput = output;
      _applying = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MacosScaffold(
      toolBar: ToolBar(title: const Text('Optimize'), titleWidth: 150),
      children: [
        ContentArea(
          builder: (context, scrollController) {
            return ListView(
              controller: scrollController,
              padding: const EdgeInsets.all(20),
              children: [
                // Header
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        const Color(0xFF6366F1).withAlpha(20),
                        const Color(0xFF8B5CF6).withAlpha(10),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: const Color(0xFF6366F1).withAlpha(40),
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(
                        CupertinoIcons.bolt_fill,
                        size: 32,
                        color: Color(0xFF6366F1),
                      ),
                      const SizedBox(width: 16),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Token Optimizer',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                              ),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'Analyze your CLAUDE.md + rules for redundancy, verbosity, and optimization opportunities. Uses local LLM (Qwen).',
                              style: TextStyle(fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),

                // Actions
                Row(
                  children: [
                    PushButton(
                      controlSize: ControlSize.large,
                      onPressed: _analyzing ? null : _analyze,
                      child: _analyzing
                          ? const Row(
                              children: [
                                SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: ProgressCircle(radius: 7),
                                ),
                                SizedBox(width: 8),
                                Text('Analyzing...'),
                              ],
                            )
                          : const Text('Analyze'),
                    ),
                    const SizedBox(width: 12),
                    PushButton(
                      controlSize: ControlSize.large,
                      color: _analysisOutput.isNotEmpty
                          ? CupertinoColors.systemGreen
                          : null,
                      onPressed: _applying || _analysisOutput.isEmpty
                          ? null
                          : _apply,
                      child: _applying
                          ? const Row(
                              children: [
                                SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: ProgressCircle(radius: 7),
                                ),
                                SizedBox(width: 8),
                                Text('Applying...'),
                              ],
                            )
                          : const Text('Apply Optimizations'),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Output
                if (_analysisOutput.isNotEmpty) ...[
                  const Text(
                    'Analysis Results',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: MacosTheme.brightnessOf(context) == Brightness.dark
                          ? const Color(0xFF1A1A1A)
                          : const Color(0xFFF5F5F5),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                        color:
                            MacosTheme.brightnessOf(context) == Brightness.dark
                            ? const Color(0xFF333333)
                            : const Color(0xFFE5E5E5),
                      ),
                    ),
                    child: SelectableText(
                      _analysisOutput,
                      style: const TextStyle(
                        fontFamily: 'Menlo',
                        fontSize: 12,
                        height: 1.5,
                      ),
                    ),
                  ),
                ] else ...[
                  // Empty state
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 60),
                      child: Column(
                        children: [
                          Icon(
                            CupertinoIcons.sparkles,
                            size: 48,
                            color: CupertinoColors.systemGrey.withAlpha(120),
                          ),
                          const SizedBox(height: 12),
                          Text(
                            'Click Analyze to scan your CLAUDE.md',
                            style: TextStyle(
                              color: MacosTheme.of(
                                context,
                              ).typography.subheadline.color,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Requires Ollama running with Qwen model',
                            style: TextStyle(
                              fontSize: 12,
                              color: MacosTheme.of(
                                context,
                              ).typography.subheadline.color,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],

                const SizedBox(height: 20),

                // What it does
                const Text(
                  'What this does',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                _BulletPoint('Reads CLAUDE.md + all @import rules (~9 files)'),
                _BulletPoint('Estimates total token cost'),
                _BulletPoint(
                  'Identifies redundancy, verbosity, contradictions',
                ),
                _BulletPoint(
                  'Apply: rewrites with backup (.bak), shows diff & savings',
                ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _BulletPoint extends StatelessWidget {
  final String text;
  const _BulletPoint(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('  •  ', style: TextStyle(color: Color(0xFF6366F1))),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}
