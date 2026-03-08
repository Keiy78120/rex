import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../services/rex_service.dart';
import '../theme.dart';

class RexSidebar extends StatelessWidget {
  const RexSidebar({
    super.key,
    required this.currentIndex,
    required this.onChanged,
  });

  final int currentIndex;
  final ValueChanged<int> onChanged;

  static const _items = [
    (icon: CupertinoIcons.heart_fill, label: 'Health'),
    (icon: CupertinoIcons.globe, label: 'Network'),
    (icon: CupertinoIcons.layers_fill, label: 'Providers'),
    (icon: CupertinoIcons.mic_fill, label: 'Voice'),
    (icon: CupertinoIcons.waveform, label: 'Audio'),
    (icon: CupertinoIcons.search, label: 'Memory'),
    (icon: CupertinoIcons.paperplane_fill, label: 'Gateway'),
    (icon: CupertinoIcons.sparkles, label: 'Agents'),
    (icon: CupertinoIcons.link, label: 'MCP'),
    (icon: CupertinoIcons.bolt_fill, label: 'Optimize'),
    (icon: CupertinoIcons.checkmark_shield_fill, label: 'Review'),
    (icon: CupertinoIcons.square_stack_3d_up, label: 'Sandbox'),
    (icon: CupertinoIcons.doc_text, label: 'Logs'),
    (icon: CupertinoIcons.gear, label: 'Settings'),
  ];

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      decoration: BoxDecoration(
        color: context.rex.surface,
        border: Border(
          right: BorderSide(color: context.rex.separator, width: 1),
        ),
      ),
      child: Column(
        children: [
          const _SidebarHeader(),
          const SizedBox(height: 16),
          Expanded(
            child: LayoutBuilder(
              builder: (context, constraints) {
                const itemHeight = 36.0; // ~8 vertical padding * 2 + 18 icon + 2 margin
                final totalItemsHeight = _items.length * itemHeight;
                final topPadding = ((constraints.maxHeight - totalItemsHeight) / 2)
                    .clamp(4.0, double.infinity);
                return ListView.builder(
                  padding: EdgeInsets.fromLTRB(12, topPadding, 12, 0),
                  itemCount: _items.length,
                  itemBuilder: (context, index) {
                    final item = _items[index];
                    return _SidebarNavItem(
                      icon: item.icon,
                      label: item.label,
                      selected: index == currentIndex,
                      onTap: () => onChanged(index),
                    );
                  },
                );
              },
            ),
          ),
          const _SidebarFooter(),
        ],
      ),
    );
  }
}

class _SidebarHeader extends StatelessWidget {
  const _SidebarHeader();

  @override
  Widget build(BuildContext context) {
    return Consumer<RexService>(
      builder: (context, rex, _) {
        final statusColor = rex.healthStatus == 'healthy'
            ? CupertinoColors.systemGreen
            : rex.healthStatus == 'degraded'
                ? CupertinoColors.systemYellow
                : CupertinoColors.systemRed;
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 52, 16, 4),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFFE5484D), Color(0xFFC53030)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Center(
                  child: Text(
                    'R',
                    style: TextStyle(
                      color: CupertinoColors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      letterSpacing: -0.5,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'REX',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 14,
                      letterSpacing: 0.5,
                      color: context.rex.text,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Row(
                    children: [
                      Container(
                        width: 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: statusColor,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        rex.healthStatus.toUpperCase(),
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w500,
                          letterSpacing: 0.8,
                          color: context.rex.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SidebarNavItem extends StatefulWidget {
  const _SidebarNavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  State<_SidebarNavItem> createState() => _SidebarNavItemState();
}

class _SidebarNavItemState extends State<_SidebarNavItem> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final accent = context.rex.accent;
    final Color bgColor;
    if (widget.selected) {
      bgColor = accent.withValues(alpha: 0.10);
    } else if (_hovered) {
      bgColor = context.rex.text.withValues(alpha: 0.04);
    } else {
      bgColor = const Color(0x00000000);
    }

    final Color fgColor =
        widget.selected ? accent : context.rex.textSecondary;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 1),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(widget.icon, size: 18, color: fgColor),
              const SizedBox(width: 10),
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight:
                      widget.selected ? FontWeight.w600 : FontWeight.w400,
                  color: fgColor,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SidebarFooter extends StatelessWidget {
  const _SidebarFooter();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Text(
        'v6.0.0',
        style: TextStyle(
          fontSize: 11,
          color: context.rex.textTertiary,
        ),
      ),
    );
  }
}
