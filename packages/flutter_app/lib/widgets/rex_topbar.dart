// lib/widgets/rex_topbar.dart
import 'package:flutter/cupertino.dart';
import '../theme.dart';
import 'rex_nav.dart';

/// Horizontal row of section tabs — intended for use inside a [ToolBar]
/// via CustomToolbarItem. No Container/height/padding needed here; the
/// ToolBar handles toolbar chrome and traffic-light spacing natively.
class RexSectionTabRow extends StatelessWidget {
  const RexSectionTabRow({
    super.key,
    required this.sections,
    required this.selectedIndex,
    required this.onChanged,
  });

  final List<RexSection> sections;
  final int selectedIndex;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: sections.asMap().entries.map((e) {
        return _SectionTab(
          label: e.value.label,
          selected: e.key == selectedIndex,
          onTap: () => onChanged(e.key),
        );
      }).toList(),
    );
  }
}

class _SectionTab extends StatefulWidget {
  const _SectionTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_SectionTab> createState() => _SectionTabState();
}

class _SectionTabState extends State<_SectionTab> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final accent = context.rex.accent;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
          decoration: BoxDecoration(
            color: widget.selected
                ? accent.withValues(alpha: 0.10)
                : _hovered
                    ? context.rex.text.withValues(alpha: 0.05)
                    : const Color(0x00000000),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 13,
              fontWeight:
                  widget.selected ? FontWeight.w600 : FontWeight.w400,
              color: widget.selected ? accent : context.rex.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
