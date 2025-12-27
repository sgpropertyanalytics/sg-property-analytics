#!/bin/bash
#
# CI Guard: Check for forbidden parsing patterns in routes
#
# This script prevents reintroduction of direct parsing in route files.
# All query parameter parsing MUST use utils/normalize.py helpers.
#
# Run: bash scripts/check_normalize_violations.sh
# Exit code: 0 if clean, 1 if violations found
#

set -e

ROUTES_DIR="routes"
VIOLATIONS=0

echo "Checking for forbidden parsing patterns in $ROUTES_DIR..."
echo ""

# Pattern 1: Direct int() on request.args
if grep -rn "int(request\." "$ROUTES_DIR" --include="*.py" 2>/dev/null | grep -v "__pycache__" | grep -v "to_int"; then
    echo ""
    echo "ERROR: Found direct int() parsing. Use to_int() from utils.normalize instead."
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 2: Direct float() on request.args
if grep -rn "float(request\." "$ROUTES_DIR" --include="*.py" 2>/dev/null | grep -v "__pycache__" | grep -v "to_float"; then
    echo ""
    echo "ERROR: Found direct float() parsing. Use to_float() from utils.normalize instead."
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 3: strptime for date parsing
if grep -rn "strptime" "$ROUTES_DIR" --include="*.py" 2>/dev/null | grep -v "__pycache__"; then
    echo ""
    echo "ERROR: Found strptime() usage. Use to_date() from utils.normalize instead."
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 4: Flask's type=int in request.args.get()
if grep -rn "\.get([^)]*type=int" "$ROUTES_DIR" --include="*.py" 2>/dev/null | grep -v "__pycache__"; then
    echo ""
    echo "ERROR: Found type=int in request.args.get(). Use to_int() from utils.normalize instead."
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 5: Flask's type=float in request.args.get()
if grep -rn "\.get([^)]*type=float" "$ROUTES_DIR" --include="*.py" 2>/dev/null | grep -v "__pycache__"; then
    echo ""
    echo "ERROR: Found type=float in request.args.get(). Use to_float() from utils.normalize instead."
    VIOLATIONS=$((VIOLATIONS + 1))
fi

echo ""
if [ $VIOLATIONS -eq 0 ]; then
    echo "All route files pass normalize guardrails check."
    exit 0
else
    echo "Found $VIOLATIONS forbidden parsing pattern(s)."
    echo ""
    echo "FIX: Import and use normalize utilities:"
    echo "  from utils.normalize import to_int, to_float, to_date, ValidationError, validation_error_response"
    echo ""
    echo "  # Instead of: int(request.args.get('limit', 100))"
    echo "  # Use: to_int(request.args.get('limit'), default=100, field='limit')"
    echo ""
    exit 1
fi
