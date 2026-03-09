#!/bin/bash
# Usage: ./fetch-github.sh <owner/repo> [action: issues|prs|commits|readme]
REPO="${1:?Usage: fetch-github.sh <owner/repo> [action]}"
ACTION="${2:-issues}"
case "$ACTION" in
  issues)  gh issue list --repo "$REPO" --state open --limit 10 --json number,title,labels,createdAt 2>/dev/null | jq . ;;
  prs)     gh pr list --repo "$REPO" --state open --limit 10 --json number,title,state,createdAt 2>/dev/null | jq . ;;
  commits) gh api repos/$REPO/commits --jq '[.[:10][] | {sha: .sha[:7], msg: .commit.message | split("\n")[0], date: .commit.author.date}]' 2>/dev/null ;;
  readme)  gh api repos/$REPO/readme --jq '.content' 2>/dev/null | base64 -d | head -100 ;;
  *)       echo '{"error": "unknown action"}' ;;
esac
