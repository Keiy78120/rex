import 'package:flutter/cupertino.dart';
import '../theme.dart';

class RexPageLayout extends StatelessWidget {
  const RexPageLayout({
    super.key,
    required this.title,
    this.actions = const [],
    required this.builder,
  });

  final String title;
  final List<Widget> actions;
  final Widget Function(BuildContext context, ScrollController scrollController)
      builder;

  @override
  Widget build(BuildContext context) {
    final sc = ScrollController();
    return Container(
      color: context.rex.surface,
      child: Column(
        children: [
          Container(
            height: 52,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            decoration: BoxDecoration(
              color: context.rex.surfaceSecondary,
              border: Border(
                bottom: BorderSide(color: context.rex.separator),
              ),
            ),
            child: Row(
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: context.rex.text,
                  ),
                ),
                const Spacer(),
                ...actions,
              ],
            ),
          ),
          Expanded(child: builder(context, sc)),
        ],
      ),
    );
  }
}

class RexHeaderButton extends StatefulWidget {
  const RexHeaderButton({
    super.key,
    required this.icon,
    required this.label,
    this.onPressed,
    this.showLabel = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool showLabel;

  @override
  State<RexHeaderButton> createState() => _RexHeaderButtonState();
}

class _RexHeaderButtonState extends State<RexHeaderButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;
    final color =
        enabled ? context.rex.textSecondary : context.rex.textTertiary;
    return Padding(
      padding: const EdgeInsets.only(left: 4),
      child: MouseRegion(
        onEnter: (_) => setState(() => _hovered = true),
        onExit: (_) => setState(() => _hovered = false),
        cursor:
            enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        child: GestureDetector(
          onTap: widget.onPressed,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: _hovered && enabled
                  ? context.rex.text.withValues(alpha: 0.06)
                  : null,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(widget.icon, size: 15, color: color),
                if (widget.showLabel) ...[
                  const SizedBox(width: 5),
                  Text(
                    widget.label,
                    style: TextStyle(fontSize: 12, color: color),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class RexButton extends StatefulWidget {
  const RexButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.variant = RexButtonVariant.primary,
    this.loading = false,
    this.small = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final RexButtonVariant variant;
  final bool loading;
  final bool small;

  @override
  State<RexButton> createState() => _RexButtonState();
}

enum RexButtonVariant { primary, secondary, ghost, danger, success }

class _RexButtonState extends State<RexButton> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final c = context.rex;
    final enabled = widget.onPressed != null && !widget.loading;
    final double h = widget.small ? 28 : 34;
    final double fontSize = widget.small ? 12 : 13;
    final px = widget.small ? 12.0 : 16.0;

    Color bg;
    Color fg;
    Color border;
    switch (widget.variant) {
      case RexButtonVariant.primary:
        bg = enabled
            ? (_hovered ? c.accentDark : c.accent)
            : c.accent.withValues(alpha: 0.4);
        fg = CupertinoColors.white;
        border = bg;
      case RexButtonVariant.danger:
        bg = enabled
            ? (_hovered ? const Color(0xFFC53030) : c.error)
            : c.error.withValues(alpha: 0.4);
        fg = CupertinoColors.white;
        border = bg;
      case RexButtonVariant.success:
        bg = enabled
            ? (_hovered ? const Color(0xFF2D8A4E) : c.success)
            : c.success.withValues(alpha: 0.4);
        fg = CupertinoColors.white;
        border = bg;
      case RexButtonVariant.secondary:
        bg = _hovered && enabled
            ? c.text.withValues(alpha: 0.04)
            : const Color(0x00000000);
        fg = enabled ? c.text : c.textTertiary;
        border = c.separator;
      case RexButtonVariant.ghost:
        bg = _hovered && enabled
            ? c.text.withValues(alpha: 0.04)
            : const Color(0x00000000);
        fg = enabled ? c.textSecondary : c.textTertiary;
        border = const Color(0x00000000);
    }

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
      child: GestureDetector(
        onTap: enabled ? widget.onPressed : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 120),
          height: h,
          padding: EdgeInsets.symmetric(horizontal: px),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(7),
            border: Border.all(color: border),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.loading) ...[
                SizedBox(
                  width: 14,
                  height: 14,
                  child: CupertinoActivityIndicator(radius: 7, color: fg),
                ),
                const SizedBox(width: 6),
              ] else if (widget.icon != null) ...[
                Icon(widget.icon, size: 14, color: fg),
                const SizedBox(width: 6),
              ],
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: fontSize,
                  fontWeight: FontWeight.w500,
                  color: fg,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
