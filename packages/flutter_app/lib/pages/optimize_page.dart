import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart' show SelectableText;
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';
import '../widgets/rex_page_layout.dart';
import '../widgets/rex_shared.dart';

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
    final c = context.rex;
    return RexPageLayout(
      title: 'Optimize',
      actions: [
        _analyzing
            ? RexButton(
                label: 'Analyzing...',
                loading: true,
                small: true,
                onPressed: null,
              )
            : RexButton(
                label: 'Analyze',
                icon: CupertinoIcons.search,
                small: true,
                onPressed: _analyze,
              ),
        const SizedBox(width: 6),
        _applying
            ? RexButton(
                label: 'Applying...',
                loading: true,
                small: true,
                variant: RexButtonVariant.success,
                onPressed: null,
              )
            : RexButton(
                label: 'Apply',
                icon: CupertinoIcons.checkmark_alt,
                small: true,
                variant: RexButtonVariant.success,
                onPressed: _analysisOutput.isNotEmpty ? _apply : null,
              ),
      ],
      builder: (context, scrollController) {
        return ListView(
          controller: scrollController,
          padding: const EdgeInsets.all(20),
          children: [
            // Header card
            RexCard(
              child: Row(
                children: [
                  Icon(
                    CupertinoIcons.bolt_fill,
                    size: 28,
                    color: c.accent,
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
                            fontSize: 16,
                            color: c.text,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Analyze your CLAUDE.md + rules for redundancy, verbosity, and optimization opportunities.',
                          style: TextStyle(fontSize: 12, color: c.textSecondary),
                        ),
                      ],
                    ),
                  ),
                  RexStatusChip(
                    label: _analysisOutput.isNotEmpty ? 'Analyzed' : 'Ready',
                    status: _analysisOutput.isNotEmpty
                        ? RexChipStatus.ok
                        : RexChipStatus.inactive,
                    small: true,
                  ),
                ],
              ),
            ),

            // Results or empty state
            if (_analysisOutput.isNotEmpty) ...[
              RexSection(title: 'Analysis Results'),
              RexCard(
                padding: EdgeInsets.zero,
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: c.codeBg,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: SelectableText(
                    _analysisOutput,
                    style: TextStyle(
                      fontFamily: 'Menlo',
                      fontSize: 12,
                      height: 1.5,
                      color: c.text,
                    ),
                  ),
                ),
              ),
            ] else ...[
              RexEmptyState(
                icon: CupertinoIcons.sparkles,
                title: 'No analysis yet',
                subtitle: 'Click Analyze to scan your CLAUDE.md.\nRequires Ollama running with a Qwen model.',
                actionLabel: 'Analyze Now',
                onAction: _analyze,
              ),
            ],

            const SizedBox(height: 8),

            // How it works
            RexSection(title: 'How It Works'),
            RexCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _InfoRow(icon: CupertinoIcons.doc_text, text: 'Reads CLAUDE.md + all @import rules (~9 files)'),
                  _InfoRow(icon: CupertinoIcons.number, text: 'Estimates total token cost'),
                  _InfoRow(icon: CupertinoIcons.search, text: 'Identifies redundancy, verbosity, contradictions'),
                  _InfoRow(icon: CupertinoIcons.arrow_2_squarepath, text: 'Apply: rewrites with backup (.bak), shows diff & savings'),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String text;
  const _InfoRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 14, color: c.accent),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, color: c.text),
            ),
          ),
        ],
      ),
    );
  }
}
