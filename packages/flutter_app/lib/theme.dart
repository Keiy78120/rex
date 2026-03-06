import 'package:flutter/cupertino.dart';

class RexColors {
  const RexColors._();

  static const RexColors instance = RexColors._();

  // REX brand
  Color get accent => const Color(0xFFE5484D);
  Color get accentDark => const Color(0xFFC53030);
  Color get accentLight => const Color(0xFFFEE2E2);

  // Surfaces — clean light palette
  Color get surface => const Color(0xFFF7F7F8);
  Color get surfaceSecondary => const Color(0xFFFFFFFF);
  Color get card => const Color(0xFFFFFFFF);
  Color get codeBg => const Color(0xFFF0F0F3);

  // Text
  Color get text => const Color(0xFF1A1A2E);
  Color get textSecondary => const Color(0xFF6B6B80);
  Color get textTertiary => const Color(0xFF9999AA);

  // Borders
  Color get separator => const Color(0xFFE5E5EA);

  // Status
  Color get success => CupertinoColors.systemGreen;
  Color get warning => CupertinoColors.systemYellow;
  Color get error => const Color(0xFFE5484D);
}

extension RexColorsContext on BuildContext {
  RexColors get rex => RexColors.instance;
}
