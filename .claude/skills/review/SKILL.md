---
name: review
description: Unified code review orchestrator. Runs pattern analysis, simplicity checks, contract validation, risk detection, and inline tests. Use when you want a comprehensive review before pushing or merging.
---

# Code Review Orchestrator

Comprehensive code review workflow that catches issues BEFORE pushing.

**Trigger:** `/review`, "review this", "check my changes"

---

## Workflow Overview

```
STEP 0: Scope Detection
    ↓
STEP 1: Pattern Analysis (codebase-pattern-finder)
    ↓
STEP 2: Simplicity Check (simplicity-reviewer)
    ↓
STEP 3: Contract & Consistency (fullstack-consistency-reviewer)
    ↓
STEP 4: Risk Detection (risk-agent)
    ↓
STEP 5: Run Inline Tests (tiered)
    ↓
STEP 6: Iterate on Failures
    ↓
STEP 7: Final Report
```

---

## STEP 0: Scope Detection

Detect what changed and categorize:

```bash
# Get changed files
git diff --name-only HEAD~1

# Or if uncommitted
git diff --name-only
git diff --name-only --cached
```

**Categorize scope:**
- `frontend` - Only frontend files changed
- `backend` - Only backend files changed
- `contracts` - API contracts, adapters, or schema files
- `both` - Frontend + backend changes
- `data` - Data files or ETL scripts

---

## STEP 1: Pattern Analysis

**Call Agent:** `codebase-pattern-finder`

```
Prompt: Find sibling patterns for the changed files.
- Look at 3+ files in the same directory
- Run: git log -20 -- <changed_files>
- Extract common patterns
- Report deviations from majority pattern
```

**Output:** Reference patterns and sibling examples

---

## STEP 2: Simplicity Check

**Call Agent:** `simplicity-reviewer`

```
Prompt: Check if the changes follow the simplest approach.
- Can this be done with fewer files?
- Can this be done with fewer lines?
- Is there a library solution? (CLAUDE.md §1.6)
- Does this match sibling patterns?
```

**Output:** PASS | NEEDS SIMPLIFICATION | FLAGGED

**If FLAGGED:** Show simpler alternative, ASK before proceeding.

---

## STEP 3: Contract & Consistency

**Call Agent:** `fullstack-consistency-reviewer`

```
Prompt: Check frontend↔backend contract alignment.
- Param names match (FE → BE)?
- Response fields handled (BE → FE)?
- Enum values match?
- Adapters handle all fields?
```

**Output:** Contract issues, impact assessment

---

## STEP 4: Risk Detection

**Call Agent:** `risk-agent`

```
Prompt: Check for real bugs based on evidence.
- 21 failure mode categories
- Evidence from git history
- Reality check protocol
- Line-by-line code quality
```

**Output:** REAL BUGS | TECH DEBT | CONSIDERATIONS

---

## STEP 5: Run Inline Tests

Select tier based on scope:

### Tier 1: Quick Checks (ALWAYS - ~30s)

```bash
# Frontend lint + typecheck
cd frontend && npm run lint && npm run typecheck

# Backend syntax check
python -m py_compile backend/routes/*.py backend/services/*.py

# Contract drift (quick check)
python backend/scripts/generate_contracts.py --check
```

### Tier 2: Core Tests (DEFAULT - ~3 min)

```bash
# ===== BACKEND UNIT TESTS (no DB needed) =====
cd backend

# Core validation
pytest tests/test_normalize.py -v
pytest tests/test_api_contract.py -v
pytest tests/test_property_age_bucket.py -v

# SQL safety (BOTH files - CI uses both)
pytest tests/test_sql_guardrails.py -v
pytest tests/test_sql_safety.py -v

# Contract tests
pytest tests/test_param_coverage.py -v

# ===== FRONTEND UNIT TESTS =====
cd frontend && npm run test:ci

# ===== SCRIPTS =====
# Route contract validation
python scripts/check_route_contract.py

# Data guard
python scripts/data_guard.py --ci
```

### Tier 3: Full Suite (COMPLEX - ~8 min)

```bash
# ===== INTEGRATION TESTS (requires DATABASE_URL) =====
cd backend

# Regression snapshots - CRITICAL for data correctness
pytest tests/test_regression_snapshots.py -v

# API invariants
pytest tests/test_api_invariants.py -v

# Smoke endpoints
pytest tests/test_smoke_endpoints.py -v

# Chart dependencies - catches breaking changes
pytest tests/test_chart_dependencies.py -v

# KPI guardrails
pytest tests/test_kpi_guardrails.py -v

# ETL validation (if data files changed)
pytest tests/test_etl_validation.py -v

# ===== ADDITIONAL BACKEND TESTS =====
# Run if relevant files changed:

# If routes/services changed:
pytest tests/test_aggregate_median.py -v
pytest tests/test_filter_builder.py -v
pytest tests/test_timeframe_resolution.py -v
pytest tests/test_contract_timeframe_normalize.py -v

# If subscription/auth changed:
pytest tests/test_subscription_schema_guard.py -v
pytest tests/test_user_entitlements.py -v

# If data files changed:
pytest tests/test_csv_diff_detection.py -v
pytest tests/test_districts_superset.py -v

# If specific features changed:
pytest tests/test_supply_summary.py -v
pytest tests/test_exit_queue.py -v
pytest tests/test_price_bands.py -v
pytest tests/test_resale_velocity_kpi.py -v
pytest tests/test_new_launch_absorption.py -v

# ===== E2E SMOKE =====
cd frontend && npm run build && npm run e2e:smoke

# ===== MOCK VALIDATION =====
python scripts/validate_e2e_mocks.py || echo "Warning: E2E mocks may be stale"
```

### Tier 4: Full E2E Runtime (PRE-MERGE - ~10 min)

```bash
# Full E2E performance suite
cd frontend && npm run e2e:full
```

**When to use Tier 4:**
- Pre-merge for major UI changes
- Pre-merge for filter/state changes
- Pre-merge for chart modifications
- When user explicitly requests full runtime validation

### Tier Selection Logic

| Scope | Tier |
|-------|------|
| Single file, minor fix | Tier 1 |
| Frontend component | Tier 1 + Tier 2 frontend tests |
| Backend service/route | Tier 1 + Tier 2 |
| Contract/schema change | Tier 3 (full) |
| Multi-file refactor | Tier 3 (full) |
| Pre-merge | Tier 3 + Tier 4 |

### Root-Level Tests (Legacy - run if needed)

These tests exist in the root `tests/` directory:

```bash
# Run from project root
pytest tests/test_api_contract.py -v      # 67KB comprehensive contract tests
pytest tests/test_dashboard_median.py -v
pytest tests/test_duplicate_detection.py -v
pytest tests/test_iqr_consistency.py -v
pytest tests/test_startup_no_mutations.py -v
pytest tests/test_tenure_filter.py -v
pytest tests/test_csv_column_preservation.py -v
pytest tests/test_floor_level_classification.py -v
pytest tests/test_batch2_fixes.py -v
pytest tests/test_data_loader_batch1.py -v
```

---

## STEP 6: Iterate on Failures

### Smart Failure Handling

| Error Type | Action |
|------------|--------|
| Lint errors | Auto-fix (up to 3 attempts), retry |
| Type errors | Auto-fix (up to 3 attempts), retry |
| Unit test failures | Report, explain, ASK before fixing |
| Integration failures | Report, explain, ASK before fixing |
| Contract drift | Regenerate contracts, retry |

### Auto-Fix Commands

```bash
# Lint auto-fix
cd frontend && npm run lint -- --fix

# Python format
cd backend && python -m black .

# Regenerate contracts
python backend/scripts/generate_contracts.py
```

---

## STEP 7: Final Report

```markdown
## Review Complete

**Scope:** [frontend | backend | both | contracts | data]
**Files Changed:** X

### Summary

| Check | Result |
|-------|--------|
| Pattern Match | ALIGNED / DIVERGENT |
| Simplicity | PASS / NEEDS REVIEW |
| Contracts | ALIGNED / DRIFT DETECTED |
| Risks | NONE / MEDIUM / HIGH |
| Tests | ALL PASS / FAILURES |

### Findings

[List any issues found]

### Verdict

**READY TO PUSH** or **NEEDS WORK**

[If NEEDS WORK: list specific items to address]
```

---

## Quick Reference

### When to Run Each Agent

| Agent | Called In | Purpose |
|-------|-----------|---------|
| `codebase-pattern-finder` | Step 1 | Find sibling patterns |
| `simplicity-reviewer` | Step 2 | Proactive simplicity check |
| `fullstack-consistency-reviewer` | Step 3 | Contract validation |
| `risk-agent` | Step 4 | Bug detection |

### Test Commands Summary

```bash
# Tier 1 (always)
cd frontend && npm run lint && npm run typecheck
python -m py_compile backend/routes/*.py backend/services/*.py

# Tier 2 (default) - ALL paths are backend/tests/
cd backend
pytest tests/test_normalize.py tests/test_api_contract.py -v
pytest tests/test_sql_guardrails.py tests/test_sql_safety.py -v
pytest tests/test_property_age_bucket.py tests/test_param_coverage.py -v
cd ../frontend && npm run test:ci

# Tier 3 (complex) - ALL paths are backend/tests/
cd backend
pytest tests/test_regression_snapshots.py tests/test_api_invariants.py -v
pytest tests/test_smoke_endpoints.py tests/test_chart_dependencies.py -v
pytest tests/test_kpi_guardrails.py -v
cd ../frontend && npm run build && npm run e2e:smoke

# Tier 4 (pre-merge)
cd frontend && npm run e2e:full
```

---

## Complete Backend Test Inventory

All tests are in `backend/tests/`:

| Test File | Category | When to Run |
|-----------|----------|-------------|
| `test_normalize.py` | Core | Always (Tier 2) |
| `test_api_contract.py` | Core | Always (Tier 2) |
| `test_property_age_bucket.py` | Core | Always (Tier 2) |
| `test_sql_guardrails.py` | SQL | Always (Tier 2) |
| `test_sql_safety.py` | SQL | Always (Tier 2) |
| `test_param_coverage.py` | Contract | Always (Tier 2) |
| `test_regression_snapshots.py` | Integration | Tier 3 |
| `test_api_invariants.py` | Integration | Tier 3 |
| `test_smoke_endpoints.py` | Integration | Tier 3 |
| `test_chart_dependencies.py` | Integration | Tier 3 |
| `test_kpi_guardrails.py` | Integration | Tier 3 |
| `test_etl_validation.py` | Data | If data changed |
| `test_aggregate_median.py` | Feature | If aggregate changed |
| `test_filter_builder.py` | Feature | If filters changed |
| `test_timeframe_resolution.py` | Feature | If timeframe changed |
| `test_contract_timeframe_normalize.py` | Feature | If timeframe changed |
| `test_subscription_schema_guard.py` | Auth | If auth changed |
| `test_user_entitlements.py` | Auth | If auth changed |
| `test_csv_diff_detection.py` | Data | If data changed |
| `test_districts_superset.py` | Data | If districts changed |
| `test_supply_summary.py` | Feature | If supply changed |
| `test_exit_queue.py` | Feature | If exit queue changed |
| `test_price_bands.py` | Feature | If price bands changed |
| `test_resale_velocity_kpi.py` | Feature | If KPI changed |
| `test_new_launch_absorption.py` | Feature | If absorption changed |
| `test_compliance.py` | Compliance | If compliance changed |
| `test_request_logging.py` | Infra | If logging changed |
| `test_cache_key.py` | Infra | If caching changed |
| `test_verification_service.py` | Infra | If verification changed |
| `test_insights_timeframe_integration.py` | Feature | If insights changed |
| `test_price_projects_by_district_query.py` | Feature | If district query changed |

---

## CI Coverage

This review workflow covers ALL CI regression checks:

| CI Check | In Review | Tier | Test File |
|----------|-----------|------|-----------|
| Contract Guard | Yes | 1 | `generate_contracts.py --check` |
| Frontend Import Guard | Yes | 1 | `npm run typecheck` |
| SQL Safety | Yes | 2 | `test_sql_safety.py` + `test_sql_guardrails.py` |
| Data Guard | Yes | 2 | `scripts/data_guard.py --ci` |
| Route Contract | Yes | 2 | `scripts/check_route_contract.py` |
| Unit Tests | Yes | 2 | Multiple test files |
| Lint + Typecheck | Yes | 1 | `npm run lint && typecheck` |
| Frontend Build | Yes | 3 | `npm run build` |
| Smoke Tests | Yes | 3 | `test_smoke_endpoints.py` |
| Integration Tests | Yes | 3 | `test_regression_snapshots.py` + `test_api_invariants.py` |
| E2E Smoke | Yes | 3 | `npm run e2e:smoke` |
| E2E Full | Yes | 4 | `npm run e2e:full` |
| Mock Validation | Yes | 3 | `scripts/validate_e2e_mocks.py` |
| Performance Tests | CI only | - | Nightly |
| Security Audit | CI only | - | Nightly |
| Dead Code | CI only | - | Advisory |

**Coverage: 14/17 checks (82%)** - All blocking checks included.

GitHub CI becomes a safety net, not the primary feedback loop.
