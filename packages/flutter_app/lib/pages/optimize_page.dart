import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';

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
    return RexPageLayout(
      title: 'Optimize',
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
                    context.rex.accent.withAlpha(20),
                    context.rex.accent.withAlpha(10),
                  ],
                ),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: context.rex.accent.withAlpha(40),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.bolt_fill,
                    size: 32,
                    color: context.rex.accent,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Token Optimizer',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 18,
                            color: context.rex.text,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Analyze your CLAUDE.md + rules for redundancy, verbosity, and optimization opportunities. Uses local LLM (Qwen).',
                          style: TextStyle(fontSize: 12, color: context.rex.textSecondary),
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
                _analyzing
                    ? RexButton(
                        label: 'Analyzing...',
                        loading: true,
                        onPressed: null,
                      )
                    : RexButton(
                        label: 'Analyze',
                        onPressed: _analyze,
                      ),
                const SizedBox(width: 12),
                _applying
                    ? RexButton(
                        label: 'Applying...',
                        loading: true,
                        variant: RexButtonVariant.success,
                        onPressed: null,
                      )
                    : RexButton(
                        label: 'Apply Optimizations',
                        variant: RexButtonVariant.success,
                        onPressed: _analysisOutput.isNotEmpty ? _apply : null,
                      ),
              ],
            ),
            const SizedBox(height: 20),

            // Output
            if (_analysisOutput.isNotEmpty) ...[
              Text(
                'Analysis Results',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: context.rex.text),
              ),
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: context.rex.codeBg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: context.rex.separator),
                ),
                child: SelectableText(
                  _analysisOutput,
                  style: TextStyle(
                    fontFamily: 'Menlo',
                    fontSize: 12,
                    height: 1.5,
                    color: context.rex.text,
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
                        color: context.rex.textTertiary,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Click Analyze to scan your CLAUDE.md',
                        style: TextStyle(
                          color: context.rex.textSecondary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Requires Ollama running with Qwen model',
                        style: TextStyle(
                          fontSize: 12,
                          color: context.rex.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],

            const SizedBox(height: 20),

            // What it does
            Text(
              'What this does',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: context.rex.text),
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
          Text('  •  ', style: TextStyle(color: context.rex.accent)),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13, color: context.rex.text))),
        ],
      ),
    );
  }
}
