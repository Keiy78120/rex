import 'package:flutter/cupertino.dart';

class RexColors {
  const RexColors._();

  static const RexColors instance = RexColors._();

  // ── Brand ─────────────────────────────────────────────────────────────────
  Color get accent => const Color(0xFFE5484D);
  Color get accentDark => const Color(0xFFC53030);
  Color get accentLight => const Color(0xFFFEE2E2);

  // ── Surfaces — 3 elevation layers ────────────────────────────────────────
  Color get surface => const Color(0xFFF5F5F7);          // page background
  Color get surfaceSecondary => const Color(0xFFFFFFFF); // headers, panels
  Color get card => const Color(0xFFFFFFFF);             // cards
  Color get codeBg => const Color(0xFFF0F0F3);           // code, inputs, chips

  // ── Text — 4 levels ───────────────────────────────────────────────────────
  Color get text => const Color(0xFF1A1A2E);
  Color get textSecondary => const Color(0xFF6B6B80);
  Color get textTertiary => const Color(0xFF9999AA);
  Color get textDisabled => const Color(0xFFBBBBC8);

  // ── Borders ───────────────────────────────────────────────────────────────
  Color get separator => const Color(0xFFE5E5EA);
  Color get separatorStrong => const Color(0xFFD0D0DC);

  // ── Status — stable hex, not system colors ────────────────────────────────
  Color get success => const Color(0xFF30B467);  // green
  Color get warning => const Color(0xFFF59E0B);  // amber
  Color get error => const Color(0xFFE5484D);    // red (= accent)
  Color get info => const Color(0xFF0070F3);     // blue
  Color get neutral => const Color(0xFF6B6B80);  // muted

  // ── Convenience ───────────────────────────────────────────────────────────
  /// Returns a status color from a string ('ok'|'pass'|'healthy' → success, etc.)
  Color statusColor(String? s) {
    switch (s?.toLowerCase()) {
      case 'ok':
      case 'pass':
      case 'healthy':
      case 'running':
        return success;
      case 'warn':
      case 'warning':
      case 'stale':
      case 'degraded':
        return warning;
      case 'fail':
      case 'error':
      case 'offline':
      case 'stopped':
        return error;
      case 'pending':
        return info;
      default:
        return neutral;
    }
  }
}

extension RexColorsContext on BuildContext {
  RexColors get rex => RexColors.instance;
}
