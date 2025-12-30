#!/bin/bash
#
# Install git hooks for data protection
#

set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="$REPO_ROOT/.git/hooks"

echo "Installing data guard pre-commit hook..."

cp "$REPO_ROOT/scripts/hooks/pre_commit_data_guard.sh" "$HOOK_DIR/pre-commit"
chmod +x "$HOOK_DIR/pre-commit"

echo ""
echo "Pre-commit hook installed successfully."
echo ""
echo "The hook will now validate changes to critical CSV files before commit."
echo "To uninstall: rm $HOOK_DIR/pre-commit"
