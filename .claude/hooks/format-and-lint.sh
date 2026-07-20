#!/usr/bin/env bash
# PostToolUse hook (Write|Edit): runs Prettier + ESLint on the touched file.
# Scoped to this project via .claude/settings.json — not a global hook.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

input="$(cat)"
file="$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')"

[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  */node_modules/*|*/.next/*|*/.git/*)
    exit 0
    ;;
esac

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.mdx|*.css)
    npx --no-install prettier --write "$file" >/dev/null 2>&1
    ;;
esac

case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    lint_output="$(npx --no-install eslint --fix "$file" 2>&1)"
    if [ $? -ne 0 ]; then
      reason="$(printf '%s' "$lint_output" | jq -Rs .)"
      printf '{"decision":"block","reason":%s}\n' "$reason"
      exit 0
    fi
    ;;
esac

exit 0
