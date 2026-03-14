# REX Flutter App — Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finalize the REX Flutter macOS app with all features functional, polished, and committed.

**Architecture:** Flutter + macos_ui 2.2.2. RexService (ChangeNotifier) handles all CLI calls via `_runRex()`. Pages are stateful widgets consuming RexService via Provider. Settings reads/writes `~/.claude/settings.json` as JSON.

**Tech Stack:** Flutter 3.x, macos_ui 2.2.2, provider 6, hotkey_manager 0.2.3, macos_window_utils, ffmpeg (avfoundation), openai-whisper (pip)

---

## Status actuel (2026-03-05)

✅ Fait cette session :
- Voice page avec recorder + whisper + history
- Settings page : 4 onglets (General, Claude, LLM, Advanced) avec lecture/écriture `~/.claude/settings.json`
- Global hotkey ⌘⇧V → toggle voice
- Gateway start/stop dans RexService
- Whisper adaptive model (tiny <30s, large-v3-turbo >=30s)
- Build passes ✅

---

## Task 1: Fix Settings — MacosTextField placeholder styling + validation

**Files:**
- Modify: `packages/flutter_app/lib/pages/settings_page.dart`

**Problème:** Les champs de texte dans les tabs Claude/LLM n't ont pas de validation (ex: température doit être 0.0–1.0, tokens entier > 0). De plus `runLlmTest()` dans le service a un problème d'échappement shell.

**Fix `runLlmTest` dans rex_service.dart:**
```dart
Future<String> runLlmTest(String prompt) async {
  // Use positional split — rex llm takes one arg (the full prompt joined)
  // _runRex splits on space so we need a different approach for multi-word prompts
  isLoading = true;
  notifyListeners();
  try {
    final env = Map<String, String>.from(Platform.environment);
    final extraPaths = ['/usr/local/bin', '/opt/homebrew/bin', '${env['HOME']}/.npm-global/bin'];
    env['PATH'] = '${extraPaths.join(':')}:${env['PATH'] ?? ''}';
    final result = await Process.run('rex', ['llm', prompt], environment: env)
        .timeout(const Duration(seconds: 60));
    isLoading = false;
    notifyListeners();
    return _stripAnsi(result.stdout as String).trim();
  } catch (e) {
    isLoading = false;
    notifyListeners();
    return 'Error: $e';
  }
}
```

**Validation température dans _LlmTabState:**
```dart
// Dans onChanged de temperature
onChanged: (v) {
  final parsed = double.tryParse(v);
  if (parsed != null && parsed >= 0 && parsed <= 1) {
    rex.setOllamaTemperature(v);
  }
},
```

**Steps:**
1. Edit `rex_service.dart` : remplacer `runLlmTest` par la version correcte ci-dessus
2. Edit `settings_page.dart` : ajouter validation température
3. Build: `flutter build macos --debug`
4. Commit: `git add packages/flutter_app && git commit -m "fix(settings): correct llm prompt passing and temperature validation"`

---

## Task 2: Voice page — auto-copy to clipboard après transcription

**Files:**
- Modify: `packages/flutter_app/lib/services/rex_service.dart`

**Problème:** Après transcription, le texte devrait être auto-copié dans le presse-papiers pour usage immédiat (comme dans l'ancienne version Tauri).

**Dans `stopRecordingAndTranscribe()`, après avoir set `currentTranscription`:**
```dart
// Auto-copy to clipboard
if (text.isNotEmpty) {
  final clipboardData = ClipboardData(text: text);
  await Clipboard.setData(clipboardData);
}
```

**Import à ajouter:**
```dart
import 'package:flutter/services.dart';
```

**Steps:**
1. Ajouter `import 'package:flutter/services.dart'` dans `rex_service.dart`
2. Ajouter l'auto-copy après `currentTranscription = text;`
3. Build + test: lancer l'app, enregistrer, vérifier que le clipboard est rempli
4. Commit: `git commit -m "feat(voice): auto-copy transcription to clipboard"`

---

## Task 3: Voice page — whisper model fallback

**Files:**
- Modify: `packages/flutter_app/lib/services/rex_service.dart`

**Problème:** `large-v3-turbo` peut ne pas être installé. Fallback automatique vers `tiny` si le modèle échoue, avec notification à l'utilisateur.

**Logique dans `stopRecordingAndTranscribe()`:**
```dart
final whisperModel = recordingDuration.inSeconds < 30 ? 'tiny' : 'large-v3-turbo';
lastWhisperModel = whisperModel;
currentTranscription = 'Transcribing (${whisperModel})...';
notifyListeners();

ProcessResult result;
try {
  result = await Process.run('whisper', [
    file, '--model', whisperModel, '--output_format', 'txt', '--output_dir', '/tmp'
  ]).timeout(const Duration(seconds: 120));
} catch (_) {
  // Fallback to tiny
  lastWhisperModel = 'tiny (fallback)';
  currentTranscription = 'Fallback to tiny model...';
  notifyListeners();
  result = await Process.run('whisper', [
    file, '--model', 'tiny', '--output_format', 'txt', '--output_dir', '/tmp'
  ]).timeout(const Duration(seconds: 60));
}
```

**Steps:**
1. Modifier `stopRecordingAndTranscribe()` avec le pattern try/fallback ci-dessus
2. Build test
3. Commit: `git commit -m "feat(voice): fallback to tiny model if large-v3-turbo not found"`

---

## Task 4: Memory page — améliorer l'affichage des catégories

**Files:**
- Read: `packages/flutter_app/lib/pages/memory_page.dart`
- Modify: `packages/flutter_app/lib/pages/memory_page.dart`

**Objectif:** Afficher les catégories mémoire (lesson, fact, pattern, etc.) comme des badges colorés, pas juste du texte brut.

**Vérifier d'abord ce que `rex prune --stats` retourne :**
```bash
rex prune --stats
```

**Pattern à implémenter:**
```dart
// Parse la sortie de runPrune(statsOnly: true) pour extraire les catégories
// Format attendu: "lesson: 42  fact: 18  pattern: 7"
Map<String, int> _parseCategories(String output) {
  final result = <String, int>{};
  final regex = RegExp(r'(\w+):\s*(\d+)');
  for (final match in regex.allMatches(output)) {
    result[match.group(1)!] = int.parse(match.group(2)!);
  }
  return result;
}
```

**Steps:**
1. Lire la memory_page.dart actuelle
2. Ajouter le parsing des catégories
3. Afficher des chips colorés par catégorie
4. Build + visual check
5. Commit: `git commit -m "feat(memory): display categorized memory stats as chips"`

---

## Task 5: Context page — nouveau onglet "Context"

**Files:**
- Create: `packages/flutter_app/lib/pages/context_page.dart`
- Modify: `packages/flutter_app/lib/main.dart`
- Modify: `packages/flutter_app/lib/services/rex_service.dart`

**Objectif:** Exposer `rex context <path>` dans l'UI. Permet d'analyser un projet et obtenir des recommandations MCP/skills.

**Dans rex_service.dart:**
```dart
Future<String> runContext(String path) async {
  isLoading = true;
  notifyListeners();
  final output = await _runRex('context $path', timeout: 60);
  lastOutput = output;
  isLoading = false;
  notifyListeners();
  return output;
}
```

**context_page.dart (structure):**
- Champ texte pour le path (par défaut `~`)
- Bouton "Analyze"
- Affichage résultat en SelectableText monospace
- Bouton "Open in Finder"

**Steps:**
1. Ajouter `runContext()` dans rex_service.dart
2. Créer context_page.dart avec l'UI décrite
3. Ajouter dans main.dart : sidebar item "Context" + dans IndexedStack
4. Build + test avec un vrai projet
5. Commit: `git commit -m "feat(context): add project context analyzer page"`

---

## Task 6: Gateway page — améliorer avec start/stop

**Files:**
- Read: `packages/flutter_app/lib/pages/gateway_page.dart`

**Objectif:** La gateway page doit avoir un gros bouton Start/Stop visible, pas juste l'état. Vérifier ce qui est déjà là et compléter si nécessaire.

**Steps:**
1. Lire gateway_page.dart
2. Si bouton Start/Stop manquant → l'ajouter en utilisant `rex.startGateway()` / `rex.stopGateway()`
3. Commit si changement

---

## Task 7: Polish et vérifications finales

**Checklist:**
- [ ] Dark mode fonctionne (toggle dans la sidebar)
- [ ] Light mode fonctionne (pas de fond dark en light mode)
- [ ] Boutons rouges (AccentColor.red) partout
- [ ] Voice page : recording + timer + transcription
- [ ] Settings Claude tab : model selector sauvegardé dans ~/.claude/settings.json
- [ ] Settings LLM tab : ollama list visible
- [ ] Health page : `rex doctor` parse correctement les groupes
- [ ] Memory page : search fonctionne
- [ ] Gateway page : start/stop visible

**Test flow:**
```bash
# 1. Lancer l'app
open build/macos/Build/Products/Debug/rex_app.app

# 2. Vérifier chaque page
# 3. Toggle dark/light
# 4. Tester le recording (si whisper installé)
# 5. Tester Settings → Claude → changer modèle → vérifier ~/.claude/settings.json
```

---

## Task 8: Commit final et push

**Steps:**
1. `git status` — vérifier tous les fichiers modifiés
2. `git diff` — review rapide
3. Créer une branche: `git checkout -b feat/flutter-app-complete`
4. Stage tout: `git add packages/flutter_app/`
5. Commit message:
```
feat(flutter): complete REX macOS app with voice, settings, and LLM controls

- Voice page with ffmpeg recording, whisper transcription (tiny/large-v3-turbo adaptive)
- Global hotkey Cmd+Shift+V for voice toggle
- Settings with 4 tabs: General, Claude, LLM, Advanced
- Claude tab: model selector (haiku/sonnet/opus), effort level, token limits
- LLM tab: Ollama config, temperature, model pull, rex llm test
- Advanced tab: hooks/MCP status, raw settings viewer
- Gateway start/stop from settings
- Context page for project analysis
- Auto-copy transcription to clipboard
```
6. Push: `git push -u origin feat/flutter-app-complete`

---

## Backlog (hors scope de ce plan)

Ces items sont dans `plans/jiggly-nibbling-harp.md` et peuvent être traités en sessions séparées :
- Skills versionnés dans le monorepo (`packages/cli/skills/`)
- Auto-rules : error-pattern-guard + `new-rule` skill automatique
- Ingest fallback (pending/ quand Ollama off)
- Distribution : `.github/workflows/release.yml` pour build .dmg
- npm publish CI

---

## Ordre d'exécution recommandé

| # | Task | Durée est. | Priorité |
|---|------|------------|----------|
| 1 | Fix runLlmTest + validation | 10 min | CRITIQUE |
| 2 | Voice auto-copy clipboard | 5 min | HAUTE |
| 3 | Whisper model fallback | 10 min | HAUTE |
| 4 | Memory categories display | 15 min | MOYENNE |
| 5 | Context page | 20 min | MOYENNE |
| 6 | Gateway page polish | 10 min | MOYENNE |
| 7 | Polish + test flow | 15 min | CRITIQUE |
| 8 | Commit + push | 5 min | CRITIQUE |
