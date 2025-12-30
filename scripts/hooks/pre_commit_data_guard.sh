#!/bin/bash
#
# Pre-commit hook: Block large row deletions in critical CSVs
#
# This hook runs the data guard script to prevent accidental data corruption.
# If the guard fails, it blocks the commit with instructions to fix.
#

set -e

CSV="backend/data/new_launch_units.csv"
BASELINE=".ci/baselines/new_launch_units.csv"

# Check if the CSV is staged for commit
if ! git diff --cached --name-only | grep -q "^$CSV$"; then
    exit 0  # Not staged, skip validation
fi

echo "Running data guard on staged CSV changes..."

# Run data guard in local mode
if ! python3 scripts/data_guard.py --mode local --file "$CSV" --baseline "$BASELINE"; then
    echo ""
    echo "============================================================"
    echo "DATA GUARD FAILED"
    echo "============================================================"
    echo ""
    echo "The staged changes to $CSV failed validation."
    echo ""
    echo "If these changes are intentional:"
    echo "  1. Update the baseline:"
    echo "     python3 scripts/baseline_snapshot.py --src $CSV --out $BASELINE"
    echo ""
    echo "  2. Stage the baseline:"
    echo "     git add $BASELINE"
    echo ""
    echo "  3. Commit both files together"
    echo ""
    echo "To bypass (not recommended):"
    echo "  git commit --no-verify"
    echo ""
    echo "============================================================"
    exit 1
fi

echo "Data guard passed."
