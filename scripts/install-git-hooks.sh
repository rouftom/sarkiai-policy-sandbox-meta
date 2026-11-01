#!/bin/sh
# Install the repository's git hooks (idempotent).
#
#   ./scripts/install-git-hooks.sh
#   make hooks
#
# Sets core.hooksPath to .githooks so every clone can be wired in one command.

set -eu

root=$(git rev-parse --show-toplevel)
cd "$root"

if [ ! -f .githooks/pre-push ]; then
  echo "install-git-hooks: .githooks/pre-push is missing." >&2
  exit 1
fi

git config core.hooksPath .githooks
chmod +x .githooks/pre-push

echo "Git hooks installed: core.hooksPath=$(git config --get core.hooksPath)"
echo "Protected branches: main, develop, meta-hackathon (PR required)."
echo "See docs/agent-workflow.md."
