// lib/widgets/rex_topbar.dart
import 'package:flutter/cupertino.dart';
import '../theme.dart';
import 'rex_nav.dart';

class RexTopBar extends StatelessWidget {
  const RexTopBar({
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
    return Container(
      height: 52,
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(
          bottom: BorderSide(color: context.rex.separator, width: 0.5),
        ),
      ),
      padding: const EdgeInsets.only(top: 28, left: 12, right: 12),
      child: Row(
        children: [
          const SizedBox(width: 72), // space for macOS traffic lights
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: sections.asMap().entries.map((e) {
                  return _TopBarPill(
                    label: e.value.label,
                    selected: e.key == selectedIndex,
                    onTap: () => onChanged(e.key),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TopBarPill extends StatefulWidget {
  const _TopBarPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_TopBarPill> createState() => _TopBarPillState();
}

class _TopBarPillState extends State<_TopBarPill> {
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
          margin: const EdgeInsets.only(right: 4),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
          decoration: BoxDecoration(
            color: widget.selected
                ? accent.withValues(alpha: 0.12)
                : _hovered
                    ? context.rex.text.withValues(alpha: 0.05)
                    : const Color(0x00000000),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            widget.label,
            style: TextStyle(
              fontSize: 13,
              fontWeight: widget.selected ? FontWeight.w600 : FontWeight.w400,
              color: widget.selected ? accent : context.rex.textSecondary,
            ),
          ),
        ),
      ),
    );
  }
}
