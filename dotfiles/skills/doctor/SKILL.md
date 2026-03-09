---
name: doctor
description: Diagnostic complet de la configuration REX. Vérifie que tout est fonctionnel.
user-invocable: true
---

# REX Doctor

Diagnostic et réparation de l'environnement REX.

## Phase 1 — Diagnostic (show evidence)

Run and paste the output of each:

```bash
rex doctor          # Core health check
rex status          # Process status (daemon, gateway, hub)
rex memory-check    # Memory DB integrity + pending count
```

List each service as ✅ OK / ⚠️ degraded / ❌ failed with exact output.

## Phase 2 — Triage

For each ❌ failure:
1. State what's broken and why (one sentence)
2. State what impact it has (what stops working)
3. Propose the fix

Priority order:
1. Memory DB corruption or missing → `rex migrate` or restore backup
2. Daemon not running → `rex daemon` + check LaunchAgent
3. Gateway down → check token, `rex gateway`
4. Hub unreachable → `rex hub start`, check port 7420
5. Ollama down → `ollama serve` + check `OLLAMA_URL`
6. Embed backlog > 100 → `rex ingest` manually

## Phase 3 — Auto-repair

```bash
rex doctor --fix    # Attempts auto-repair
```

Show output. If auto-repair fails for any item, manual steps required.

## Phase 4 — Verify (evidence required)

Re-run `rex doctor` and show the output. All items must be ✅ before declaring healthy.

## REX-specific gotchas

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Embed count 0 despite sessions | sqlite-vec extension not loaded | `rex memory-check` — check extension path |
| Gateway 429 loop | processedUpdateIds not reset | Restart gateway (`rex gateway`) |
| Daemon not starting | LaunchAgent plist syntax error | `launchctl list com.dstudio.rex-daemon` |
| ingest lock stale | Crash left lockfile | `rm ~/.claude/rex/memory/ingest.lock` |
| Flutter app can't run rex | PATH missing node | Check `_env` getter in rex_service.dart |
| Hub 401 on all requests | REX_HUB_TOKEN missing | `rex hub token` then update settings.json |

## NEVER
- Declare healthy without running `rex doctor` and showing output
- Delete ingest.lock without checking if another process holds it (`lsof`)
- Restart daemon without checking why it stopped
