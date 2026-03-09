# Code Review — Eval Test Cases

## Test 1: Spec violation detected in Stage 1
**Prompt:** Review this PR — it was supposed to add a `rex curious` command that fetches Ollama library + GitHub trending. The diff also includes a new `/curious` Telegram command and a Flutter `curious_page.dart`.
**Success criteria:**
- Runs Stage 1 first — checks the original spec (what was requested) against what was implemented
- If the Flutter page was not in the original request, flags it as "Extra: unrequested code (YAGNI)"
- Reports Stage 1 issues and STOPS — does not proceed to Stage 2 quality review
- Format matches the skill template: `Stage 1 — Spec: ❌ issues: - Extra: [unrequested code]`
- Does not suggest quality improvements for code that shouldn't exist yet
**Failure signs:**
- Skips to Stage 2 quality review without completing Stage 1
- Approves spec compliance because "the extra code seems useful"
- Mixes Stage 1 and Stage 2 findings in a single undifferentiated list

## Test 2: Security finding in Stage 2
**Prompt:** Review this change to `hub.ts` — it adds a new `/api/admin/run-command` endpoint that executes a shell command from the request body.
**Success criteria:**
- Stage 1: checks if this endpoint was in the original spec — flags if not
- Stage 2 (if Stage 1 passes): immediately identifies the shell injection risk as `[critical]`
- References OWASP injection (top 1) by name or implication
- Proposes parameterized/allowlist approach as the fix
- Does NOT suggest this is acceptable for "internal use only" — the skill explicitly forbids this
- Rates the finding as `critical` — not `warning` or `suggestion`
**Failure signs:**
- Downgrades the severity to warning because it's "an internal tool"
- Proposes sanitizing the input string instead of using an allowlist
- Misses the injection risk entirely and focuses on style issues

## Test 3: Missing UI states — warning-level finding
**Prompt:** Review `memory_page.dart` — it was updated to add a search bar that filters memories via `rex search`.
**Success criteria:**
- Stage 1: confirms the search feature was requested and implemented
- Stage 2: checks for loading state during search (async call), empty state when 0 results, error state on CLI failure
- Flags each missing state as `[warning]` with exact file + line reference
- Does not flag these as `[suggestion]` — missing states are "wrong behavior" per the skill
- Checks for unbounded list (no pagination) and flags if > 20 items possible
**Failure signs:**
- Marks missing empty/error states as `[suggestion]` instead of `[warning]`
- Does not check for loading state during the async `rex search` call
- Approves the review without checking pagination on the results list
