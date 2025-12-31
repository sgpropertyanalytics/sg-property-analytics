---
name: regression-snapshot-guard
description: >
  Thin wrapper around Regression Suite CI. Runs same checks locally.

  Triggers: "verify no regressions", "before deploy", "run preflight", "numbers shifted"

  Modes: fast (default, ~10s) | full (all CI jobs, ~60s)
tools: Read, Grep, Glob, Bash
model: haiku
---

# Regression Snapshot Guard

> **Source of truth:** `.github/workflows/regression.yml`
>
> This agent runs the **exact same commands** as CI. No additional checks.

---

## MODES

### Fast (default)

No DB required. ~10 seconds.

```bash
cd backend && pytest tests/test_normalize.py \
                     tests/test_api_contract.py \
                     tests/test_property_age_bucket.py \
                     tests/test_sql_guardrails.py \
                     tests/test_sql_safety.py \
                     -v --tb=short
```

### Full

All CI jobs. Requires DATABASE_URL for integration tests.

```bash
# Contract Guard
python backend/scripts/generate_contracts.py
git diff --exit-code backend/contracts_manifest.sha256

# Frontend Import Guard
./scripts/frontend_import_guard.sh

# Unit Tests + ETL
cd backend && pytest tests/test_normalize.py \
                     tests/test_api_contract.py \
                     tests/test_property_age_bucket.py \
                     tests/test_sql_guardrails.py \
                     tests/test_sql_safety.py \
                     tests/test_etl_validation.py \
                     -v --tb=short

# Integration Tests (requires DB)
cd backend && pytest tests/test_regression_snapshots.py \
                     tests/test_api_invariants.py \
                     -v --tb=short
```

---

## WORKFLOW

1. Detect mode: "quick"/"fast" → fast | "full"/"deploy" → full | default: fast
2. Run commands (copy exactly from above)
3. Report: PASS or FAIL with fix suggestion

---

## SNAPSHOT UPDATE

When intentional data change (new ingestion, algorithm fix):

```bash
cd backend && pytest tests/test_regression_snapshots.py --update-snapshots
```

Commit with reason: `chore: Update snapshots after Dec 2025 ingestion`
