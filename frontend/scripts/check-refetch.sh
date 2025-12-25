#!/bin/bash
# check-refetch.sh - Ensure all useAbortableQuery usages destructure refetch
#
# This CI guard prevents shipping components that use useAbortableQuery
# without destructuring refetch, which causes dead Retry buttons.
#
# Usage: bash frontend/scripts/check-refetch.sh
# Returns: exit 0 if all files pass, exit 1 if any file is missing refetch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")"
SRC_DIR="$FRONTEND_DIR/src"

echo "Checking for missing refetch destructuring in useAbortableQuery usages..."

FAILED=0

# Find all files that use useAbortableQuery
FILES_USING_HOOK=$(grep -rl "useAbortableQuery(" "$SRC_DIR" --include="*.jsx" --include="*.js" 2>/dev/null || true)

for file in $FILES_USING_HOOK; do
  # Skip the hook definition itself
  if [[ "$file" == *"useAbortableQuery.js" ]]; then
    continue
  fi

  # Skip adapter files (they don't use the hook for data fetching)
  if [[ "$file" == *"adapters"* ]]; then
    continue
  fi

  # Check if the file destructures refetch
  if ! grep -q "refetch.*=.*useAbortableQuery\|{ data.*refetch.*}.*=.*useAbortableQuery\|{.*refetch.*}.*=.*useAbortableQuery" "$file"; then
    # More lenient check: look for refetch anywhere in destructuring
    if ! grep -E "\{[^}]*refetch[^}]*\}[[:space:]]*=[[:space:]]*useAbortableQuery" "$file" > /dev/null; then
      echo "ERROR: $file uses useAbortableQuery but does not destructure 'refetch'"
      FAILED=1
    fi
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "FAILED: Some files use useAbortableQuery without destructuring refetch."
  echo "Fix: Change 'const { data, loading, error } = useAbortableQuery(...)'"
  echo "  to: 'const { data, loading, error, refetch } = useAbortableQuery(...)'"
  exit 1
fi

echo "PASSED: All useAbortableQuery usages properly destructure refetch."
exit 0
