#!/bin/bash
#
# Install git hooks for data protection.
#
# Usage: ./scripts/hooks/install.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo "Installing data protection git hooks..."

# Ensure .git/hooks directory exists
if [ ! -d "$GIT_HOOKS_DIR" ]; then
    echo "Error: .git/hooks directory not found. Are you in a git repository?"
    exit 1
fi

# Install pre-commit hook
if [ -f "$GIT_HOOKS_DIR/pre-commit" ]; then
    echo "Backing up existing pre-commit hook to pre-commit.backup"
    mv "$GIT_HOOKS_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit.backup"
fi

cp "$SCRIPT_DIR/pre-commit" "$GIT_HOOKS_DIR/pre-commit"
chmod +x "$GIT_HOOKS_DIR/pre-commit"

echo ""
echo "Installed hooks:"
echo "  - pre-commit: Blocks deletion/corruption of tracked CSV files"
echo ""
echo "To uninstall: rm $GIT_HOOKS_DIR/pre-commit"
echo "To bypass:    git commit --no-verify"
echo ""
echo "Done!"
