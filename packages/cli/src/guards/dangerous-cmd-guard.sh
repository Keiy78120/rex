#!/bin/bash
# REX Guard: Dangerous Command Blocker (AST mode)
# Hook: PreToolUse (matcher: Bash)
# Delegates to guard-ast.ts for token-level structural analysis.
# Replaces regex-based pattern matching — handles pipes, semicolons, subcommands.
exec rex guard-ast
