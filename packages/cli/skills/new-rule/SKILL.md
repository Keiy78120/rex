---
name: new-rule
description: Create a new rule in ~/.claude/rules/ when a recurring error or anti-pattern is identified. Implements "Mistakes become rules" automatically.
---

# New Rule

When an error or anti-pattern has been encountered multiple times (3+), create a permanent rule.

1. **Identify the pattern**: What went wrong? What's the root cause?
2. **Check existing rules**: Read `~/.claude/rules/` — does a similar rule already exist?
3. **Write the rule**:
   - File: `~/.claude/rules/{topic}.md` (new or append to existing)
   - Format: `JAMAIS X → TOUJOURS Y à la place` (every prohibition MUST have an alternative)
   - Include a concrete code example (good vs bad)
4. **Memorize**: Call `rex_learn` with category `"lesson"` and the rule summary
5. **Report**: Tell the user what rule was created and why

Rules must be actionable, not vague. "Don't do X" is insufficient — always specify what to do instead.
