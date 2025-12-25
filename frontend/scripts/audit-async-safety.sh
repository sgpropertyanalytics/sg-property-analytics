#!/bin/bash
# Async Data-Fetching Safety Audit Script
# Run from frontend directory: bash scripts/audit-async-safety.sh

set -e

echo "=================================="
echo "ASYNC DATA-FETCHING SAFETY AUDIT"
echo "=================================="
echo ""

cd "$(dirname "$0")/.."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

VIOLATIONS=0

echo "Rule: No component may call fetch or axios directly."
echo "      All async data loading must go through useAbortableQuery or useStaleRequestGuard."
echo ""

# Find all JSX/JS files with API calls
echo "Scanning for violations..."
echo ""

for file in $(find src -name "*.jsx" -o -name "*.js" 2>/dev/null | grep -v node_modules | grep -v __tests__); do
  # Check if file has API calls (apiClient, axios, fetch, or common API functions)
  if grep -qE "(apiClient\.|axios\.|fetch\(|getAggregateData|getTransactionsList|getDealChecker|getFilterOptions|getKpiSummary|getProjectNames|getDashboard|getProjectExitQueue|getProjectPriceBands)" "$file" 2>/dev/null; then

    # Check if it has proper guards
    HAS_GUARD=false
    if grep -qE "useStaleRequestGuard|useAbortableQuery|AbortController" "$file" 2>/dev/null; then
      HAS_GUARD=true
    fi

    # Check if it's in useEffect with async pattern
    HAS_ASYNC_EFFECT=false
    if grep -qE "useEffect.*async|useCallback.*async" "$file" 2>/dev/null; then
      HAS_ASYNC_EFFECT=true
    fi

    if [ "$HAS_ASYNC_EFFECT" = true ] && [ "$HAS_GUARD" = false ]; then
      echo -e "${RED}UNSAFE${NC} $file"
      VIOLATIONS=$((VIOLATIONS + 1))

      # Show which patterns are missing
      echo "  Issues:"
      if ! grep -q "AbortController\|getSignal\|signal:" "$file" 2>/dev/null; then
        echo "    - Missing AbortController for request cancellation"
      fi
      if ! grep -q "requestId\|isStale\|useStaleRequestGuard\|useAbortableQuery" "$file" 2>/dev/null; then
        echo "    - Missing stale request detection (requestId/isStale)"
      fi
      if ! grep -q "CanceledError\|AbortError" "$file" 2>/dev/null; then
        echo "    - May treat abort errors as real errors"
      fi
      echo ""
    elif [ "$HAS_GUARD" = true ]; then
      echo -e "${GREEN}SAFE${NC}   $file"
    fi
  fi
done

echo ""
echo "=================================="
echo "SUMMARY"
echo "=================================="

if [ $VIOLATIONS -eq 0 ]; then
  echo -e "${GREEN}All async data-fetching components are safe!${NC}"
  exit 0
else
  echo -e "${RED}Found $VIOLATIONS files with unsafe async patterns${NC}"
  echo ""
  echo "To fix, use one of these patterns:"
  echo ""
  echo "1. Use useAbortableQuery (recommended for simple cases):"
  echo "   import { useAbortableQuery } from '../hooks';"
  echo "   const { data, loading, error } = useAbortableQuery("
  echo "     (signal) => apiClient.get('/api/data', { signal }),"
  echo "     [filterKey]"
  echo "   );"
  echo ""
  echo "2. Use useStaleRequestGuard (for complex cases):"
  echo "   import { useStaleRequestGuard } from '../hooks';"
  echo "   const { startRequest, isStale, getSignal } = useStaleRequestGuard();"
  echo "   // In useEffect: const requestId = startRequest();"
  echo "   // Pass signal: await api.get({ signal: getSignal() });"
  echo "   // Guard: if (isStale(requestId)) return;"
  echo "   // Error: if (err.name === 'CanceledError') return;"
  exit 1
fi
