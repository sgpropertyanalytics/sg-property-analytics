#!/bin/bash
#
# Install git hooks for data protection and merge policy enforcement.
#
# Usage: ./scripts/hooks/install.sh
#
# Hooks installed:
#   - pre-commit: Blocks deletion/corruption of tracked CSV files
#   - pre-push:   Blocks direct pushes to main (enforces PR workflow)
#   - post-merge: Warns about merge commits that could cause reverts
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

echo "Installing git hooks..."
echo ""

# Ensure .git/hooks directory exists
if [ ! -d "$GIT_HOOKS_DIR" ]; then
    echo "Error: .git/hooks directory not found. Are you in a git repository?"
    exit 1
fi

# Install each hook
for hook in pre-commit pre-push post-merge; do
    if [ -f "$SCRIPT_DIR/$hook" ]; then
        if [ -f "$GIT_HOOKS_DIR/$hook" ]; then
            echo "  Replacing existing $hook hook"
        fi
        cp "$SCRIPT_DIR/$hook" "$GIT_HOOKS_DIR/$hook"
        chmod +x "$GIT_HOOKS_DIR/$hook"
        echo "  ✓ Installed $hook"
    fi
done

echo ""
echo "Installed hooks:"
echo "  - pre-commit:  Blocks deletion/corruption of tracked CSV files"
echo "  - pre-push:    Blocks direct pushes to main (enforces PR workflow)"
echo "  - post-merge:  Warns about merge commits that could cause reverts"
echo ""
echo "To uninstall: rm $GIT_HOOKS_DIR/{pre-commit,pre-push,post-merge}"
echo "To bypass:    git <command> --no-verify (use with caution!)"
echo ""
echo "Done!"
