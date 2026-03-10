import 'package:flutter/cupertino.dart';
import '../theme.dart';

/// Consistent card container with subtle border and optional header.
class RexCard extends StatelessWidget {
  const RexCard({
    super.key,
    this.title,
    this.trailing,
    this.padding = const EdgeInsets.all(16),
    required this.child,
  });

  final String? title;
  final Widget? trailing;
  final EdgeInsets padding;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: context.rex.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: context.rex.separator),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Text(
                    title!,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: context.rex.text,
                    ),
                  ),
                  const Spacer(),
                  if (trailing != null) trailing!,
                ],
              ),
            ),
          Padding(
            padding: title != null
                ? EdgeInsets.fromLTRB(padding.left, 12, padding.right, padding.bottom)
                : padding,
            child: child,
          ),
        ],
      ),
    );
  }
}

/// Status chip with dot indicator and label.
enum RexChipStatus { ok, warning, error, inactive, pending }

class RexStatusChip extends StatelessWidget {
  const RexStatusChip({
    super.key,
    required this.label,
    required this.status,
    this.small = false,
  });

  final String label;
  final RexChipStatus status;
  final bool small;

  Color _dotColor(BuildContext context) {
    switch (status) {
      case RexChipStatus.ok:
        return context.rex.success;
      case RexChipStatus.warning:
        return context.rex.warning;
      case RexChipStatus.error:
        return context.rex.error;
      case RexChipStatus.inactive:
        return context.rex.textTertiary;
      case RexChipStatus.pending:
        return CupertinoColors.systemBlue;
    }
  }

  @override
  Widget build(BuildContext context) {
    final dot = _dotColor(context);
    final fs = small ? 11.0 : 12.0;
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: small ? 8 : 10,
        vertical: small ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: dot.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: dot.withValues(alpha: 0.20)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: fs,
              fontWeight: FontWeight.w500,
              color: context.rex.text,
            ),
          ),
        ],
      ),
    );
  }
}

/// Section header with optional action button.
class RexSection extends StatelessWidget {
  const RexSection({
    super.key,
    required this.title,
    this.icon,
    this.action,
    this.padding = const EdgeInsets.only(bottom: 12),
  });

  final String title;
  final IconData? icon;
  final Widget? action;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 14, color: context.rex.textSecondary),
            const SizedBox(width: 8),
          ],
          Text(
            title.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.8,
              color: context.rex.textSecondary,
            ),
          ),
          if (action != null) ...[
            const Spacer(),
            action!,
          ],
        ],
      ),
    );
  }
}

/// Empty state with icon, title, and optional action.
class RexEmptyState extends StatelessWidget {
  const RexEmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 40, color: context.rex.textTertiary),
            const SizedBox(height: 16),
            Text(
              title,
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: context.rex.text,
              ),
              textAlign: TextAlign.center,
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: TextStyle(
                  fontSize: 13,
                  color: context.rex.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 16),
              GestureDetector(
                onTap: onAction,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    color: context.rex.accent,
                    borderRadius: BorderRadius.circular(7),
                  ),
                  child: Text(
                    actionLabel!,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: CupertinoColors.white,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Error state with message and retry button.
class RexErrorState extends StatelessWidget {
  const RexErrorState({
    super.key,
    required this.message,
    this.onRetry,
  });

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 48, horizontal: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(CupertinoIcons.exclamationmark_triangle,
                size: 36, color: context.rex.error),
            const SizedBox(height: 12),
            Text(
              message,
              style: TextStyle(fontSize: 13, color: context.rex.textSecondary),
              textAlign: TextAlign.center,
            ),
            if (onRetry != null) ...[
              const SizedBox(height: 16),
              GestureDetector(
                onTap: onRetry,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(7),
                    border: Border.all(color: context.rex.separator),
                  ),
                  child: Text(
                    'Retry',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: context.rex.text,
                    ),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Key-value stat row for dashboard displays.
class RexStatRow extends StatelessWidget {
  const RexStatRow({
    super.key,
    required this.label,
    required this.value,
    this.valueColor,
    this.icon,
  });

  final String label;
  final String value;
  final Color? valueColor;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: context.rex.textTertiary),
            const SizedBox(width: 8),
          ],
          Text(
            label,
            style: TextStyle(fontSize: 12, color: context.rex.textSecondary),
          ),
          const Spacer(),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: valueColor ?? context.rex.text,
            ),
          ),
        ],
      ),
    );
  }
}

/// Horizontal progress bar with label.
class RexProgressBar extends StatelessWidget {
  const RexProgressBar({
    super.key,
    required this.value,
    this.max = 1.0,
    this.color,
    this.height = 6,
  });

  final double value;
  final double max;
  final Color? color;
  final double height;

  @override
  Widget build(BuildContext context) {
    final pct = max > 0 ? (value / max).clamp(0.0, 1.0) : 0.0;
    final barColor = color ?? context.rex.accent;
    return Container(
      height: height,
      decoration: BoxDecoration(
        color: context.rex.codeBg,
        borderRadius: BorderRadius.circular(height / 2),
      ),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: pct,
        child: Container(
          decoration: BoxDecoration(
            color: barColor,
            borderRadius: BorderRadius.circular(height / 2),
          ),
        ),
      ),
    );
  }
}

/// Data-dense list row — no card wrapping needed.
/// Use multiple RexListRows inside a RexCard or bare Container.
class RexListRow extends StatelessWidget {
  const RexListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    this.showDivider = true,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
            child: Row(
              children: [
                if (leading != null) ...[
                  leading!,
                  const SizedBox(width: 12),
                ],
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        title,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: context.rex.text,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          style: TextStyle(
                            fontSize: 11,
                            color: context.rex.textTertiary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
                if (trailing != null) ...[
                  const SizedBox(width: 8),
                  trailing!,
                ],
              ],
            ),
          ),
        ),
        if (showDivider)
          Container(
            height: 0.5,
            margin: EdgeInsets.only(left: leading != null ? 40.0 : 16.0),
            color: context.rex.separator,
          ),
      ],
    );
  }
}

/// A single KPI item for use in RexKpiRow.
class RexKpiItem {
  const RexKpiItem({
    required this.value,
    required this.label,
    this.valueColor,
    this.icon,
  });

  final String value;
  final String label;
  final Color? valueColor;
  final IconData? icon;
}

/// Horizontal cockpit-style KPI strip — large value + small label.
/// Replaces the pattern of multiple RexStatRow with equal-width cells.
class RexKpiRow extends StatelessWidget {
  const RexKpiRow({super.key, required this.items, this.valueSize = 22});

  final List<RexKpiItem> items;
  final double valueSize;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: items
          .map(
            (item) => Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (item.icon != null) ...[
                    Icon(item.icon, size: 14, color: item.valueColor ?? context.rex.accent),
                    const SizedBox(height: 4),
                  ],
                  Text(
                    item.value,
                    style: TextStyle(
                      fontSize: valueSize,
                      fontWeight: FontWeight.w700,
                      color: item.valueColor ?? context.rex.text,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item.label,
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0.3,
                      color: context.rex.textTertiary,
                    ),
                  ),
                ],
              ),
            ),
          )
          .toList(),
    );
  }
}

/// Toggle row with label and switch.
class RexToggleRow extends StatelessWidget {
  const RexToggleRow({
    super.key,
    required this.label,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(fontSize: 13, color: context.rex.text),
                ),
                if (subtitle != null)
                  Text(
                    subtitle!,
                    style: TextStyle(fontSize: 11, color: context.rex.textTertiary),
                  ),
              ],
            ),
          ),
          CupertinoSwitch(
            value: value,
            onChanged: onChanged,
            activeTrackColor: context.rex.accent,
          ),
        ],
      ),
    );
  }
}
