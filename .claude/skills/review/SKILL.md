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
# Frontend
cd frontend && npm run lint && npm run typecheck

# Backend
python -m py_compile backend/routes/*.py backend/services/*.py

# Contract drift
python backend/scripts/generate_contracts.py --check
```

### Tier 2: Core Tests (DEFAULT - ~3 min)

```bash
# Unit tests (no DB)
pytest tests/test_normalize.py -v
pytest tests/test_api_contract.py -v
pytest tests/test_sql_guardrails.py -v
pytest tests/test_property_age_bucket.py -v

# Frontend unit tests
cd frontend && npm run test:ci

# Route contract
python scripts/check_route_contract.py

# Data guard
python scripts/data_guard.py --ci
```

### Tier 3: Full Suite (COMPLEX - ~8 min)

```bash
# Integration tests (requires DATABASE_URL)
pytest tests/test_regression_snapshots.py -v
pytest tests/test_api_invariants.py -v

# Smoke endpoints
pytest backend/tests/test_smoke_endpoints.py -v

# E2E smoke
cd frontend && npm run build && npm run e2e:smoke

# ETL validation (if data files changed)
pytest tests/test_etl_validation.py -v
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

# Tier 2 (default)
pytest tests/test_normalize.py tests/test_api_contract.py tests/test_sql_guardrails.py -v
cd frontend && npm run test:ci

# Tier 3 (complex)
pytest tests/test_regression_snapshots.py tests/test_api_invariants.py -v
cd frontend && npm run build && npm run e2e:smoke

# Tier 4 (pre-merge)
cd frontend && npm run e2e:full
```

---

## CI Coverage

This review workflow covers 14 of 17 CI checks (82%):

| CI Check | In Review | Tier |
|----------|-----------|------|
| Contract Guard | Yes | 2 |
| Frontend Import Guard | Yes | 1 |
| SQL Safety | Yes | 2 |
| Data Guard | Yes | 2 |
| Route Contract | Yes | 2 |
| Unit Tests | Yes | 2 |
| Lint + Typecheck | Yes | 1 |
| Frontend Build | Yes | 3 |
| Smoke Tests | Yes | 3 |
| Integration Tests | Yes | 3 |
| E2E Full Runtime | Yes | 4 |
| Performance Tests | CI only | - |
| Security Audit | CI only | - |
| Dead Code | CI only | - |

GitHub CI becomes a safety net, not the primary feedback loop.
