# Flutter App — Contexte Claude Code

Stack: Flutter 3.x, Dart, macOS native
Entry: lib/main.dart
Build: flutter build macos --debug

## Design System REX

- Couleur accent: #E5484D (REX red)
- Sidebar: 220px fixe, non-resizable
- Toujours lire FRONTEND.md avant toute tâche UI/UX
- Composants: Material 3 + custom RexColors (voir theme.dart)

## Règles

- Logique métier UNIQUEMENT dans rex_service.dart — pas dans les pages
- Pages = UI only, rex_service.dart = toute la logique process
- Pas de setState dans les widgets complexes — utiliser ValueListenableBuilder
- Tester sur macOS avant commit (flutter build macos --debug)
