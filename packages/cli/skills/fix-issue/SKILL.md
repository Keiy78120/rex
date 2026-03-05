---
name: fix-issue
description: Fix a GitHub issue end-to-end. Use when user says "/fix-issue 123" or "fix issue #123".
disable-model-invocation: true
---

# Fix GitHub Issue

Analyze and fix the GitHub issue: $ARGUMENTS

1. **Get issue details**:
   ```bash
   gh issue view $ARGUMENTS
   ```

2. **Understand the problem**:
   - Read the issue description, labels, and comments
   - Identify the affected area of the codebase
   - Search for relevant files using Grep/Glob

3. **Create a feature branch**:
   ```bash
   gh issue view $ARGUMENTS --json title -q .title
   # Branch name: fix/issue-NUMBER-short-description
   git checkout -b fix/issue-$ARGUMENTS-<short-description>
   ```

4. **Implement the fix**:
   - Read relevant code before modifying
   - Follow existing patterns in the codebase
   - Make minimal, focused changes

5. **Verify the fix**:
   - Run tests if they exist
   - Run linter if configured
   - Build the project to check for errors

6. **Commit and create PR**:
   - Commit with message referencing the issue: `fix: <description> (closes #$ARGUMENTS)`
   - Push branch and create PR linking to the issue
   - Wait for Gemini/Copilot reviews

7. **Report to user**: show what was changed and ask for review
