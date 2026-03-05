---
name: pr-review-loop
description: Automated PR review loop. Use when user says "review loop", "check PR comments", "fix PR feedback", or after creating a PR. Pulls comments from Gemini Code Assist and GitHub Copilot, fixes valid issues, and pushes updates.
---

# PR Review Loop

After a PR is created or when asked to check PR feedback:

1. **Pull review comments** from the PR:
   ```bash
   # Get PR number from current branch
   PR_NUMBER=$(gh pr view --json number -q .number 2>/dev/null)

   # Get all review comments (inline code comments)
   gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/comments --jq '.[] | "[\(.user.login)] \(.path):\(.line // .original_line) - \(.body)"'

   # Get PR review summaries
   gh pr view $PR_NUMBER --comments
   ```

2. **Categorize each comment**:
   - **Valid fix needed**: bug, security issue, logic error, missing edge case
   - **Good suggestion**: improvement worth making (cleaner code, better naming)
   - **Dismiss**: style preference, false positive, or not applicable

3. **Fix valid issues**:
   - Address each valid comment with a targeted fix
   - Run tests/lint after each fix to ensure no regressions
   - Do NOT introduce unrelated changes

4. **Commit and push fixes**:
   - One commit for all review fixes: `fix: address PR review feedback`
   - Push to the same branch (the PR updates automatically)

5. **Report to user**:
   - List what was fixed and why
   - List what was dismissed and why
   - Ask user to review the diff between v1 and v2

IMPORTANT: Never force-push. Always regular push. The user reviews the incremental diff.

## Auto-Learn

After processing all comments, call `rex_learn` MCP tool for each valid fix:
- category: `"lesson"`
- fact: the reviewer feedback pattern + fix (e.g. "Copilot flagged missing null check on X — added guard clause")
- Skip dismissed comments — only learn from actionable feedback
