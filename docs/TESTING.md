# Testing & Debugging Guide

Claude MUST run tests inline and iterate until green. Do NOT mark task complete if tests fail.

> **Note:** This content was extracted from CLAUDE.md Sections 9 and 11 to keep the main file lean.

---

## Test Tiers

### Tier 1: Quick Checks (ALWAYS - 30s)
Run after EVERY code change:
```bash
# Frontend
cd frontend && npm run lint && npm run typecheck

# Backend
python -m py_compile backend/routes/*.py backend/services/*.py

# Contract drift
python backend/scripts/generate_contracts.py --check
```

### Tier 2: Core Tests (DEFAULT - 3 min)
Run for most changes:
```bash
# Unit tests (no DB needed) - ALL in backend/tests/
cd backend
pytest tests/test_normalize.py tests/test_api_contract.py -v
pytest tests/test_sql_guardrails.py tests/test_sql_safety.py -v
pytest tests/test_property_age_bucket.py tests/test_param_coverage.py -v

# Contract STRICT mode (if routes/schemas changed)
# Catches undeclared fields that slip through in WARN mode
CONTRACT_MODE=strict pytest tests/contracts/test_all_endpoints_strict.py -v --tb=short

# Endpoint smoke test (if routes changed)
# Catches runtime errors (NameError, TypeError) that py_compile misses
pytest tests/contracts/test_endpoint_smoke.py -v --tb=short

# Route coverage (if new routes added)
# Ensures new routes have @api_contract decorator
pytest tests/contracts/test_route_coverage.py -v

# Historical landmine check
# Warns if changes touch files from past incidents
python scripts/check_landmines.py

# Frontend unit tests
cd frontend && npm run test:ci

# Frontend smoke test (catches React crashes, context errors)
npm run build && npm run test:e2e:smoke

# Route contract
python scripts/check_route_contract.py

# Data guard
python scripts/data_guard.py --ci
```

### Tier 3: Full Suite (COMPLEX - 8 min)
Run for contract changes, multi-file changes, pre-merge:
```bash
# Integration tests (requires DATABASE_URL) - ALL in backend/tests/
cd backend
pytest tests/test_regression_snapshots.py tests/test_api_invariants.py -v
pytest tests/test_smoke_endpoints.py tests/test_chart_dependencies.py -v
pytest tests/test_kpi_guardrails.py -v

# E2E smoke (if UI changed)
cd frontend && npm run build && npm run e2e:smoke

# Mock validation
python scripts/validate_e2e_mocks.py || echo "Warning: E2E mocks may be stale"
```

### Tier 4: Full E2E Runtime (PRE-MERGE - 10 min)
Run for major UI, filter, or chart changes:
```bash
# Full E2E performance suite (all 13 test files)
cd frontend && npm run e2e:full
```

---

## When to Run Which Tier

| Change Scope | Tier |
|--------------|------|
| Single file, minor fix | Tier 1 |
| Frontend component | Tier 1 + frontend tests |
| Backend service/route | Tier 1 + Tier 2 |
| Contract/schema change | Tier 3 (full) |
| Multi-file refactor | Tier 3 (full) |
| Pre-merge | Tier 3 (full) |
| Major UI/filter/chart changes | Tier 4 (full E2E) |

---

## Smart Failure Handling

| Error Type | Action |
|------------|--------|
| Lint errors | Auto-fix, retry (up to 3x) |
| Type errors | Auto-fix, retry (up to 3x) |
| Unit test failures | Report, explain, ASK before fixing |
| Integration failures | Report, explain, ASK before fixing |
| Contract drift | Regenerate contracts, retry |

---

## Debugging 500 Errors

1. Check server logs for exception + traceback
2. Note endpoint, query params, filters
3. Look for `TypeError` in `strptime`/`int`/`float` → type mismatch

**Date param test matrix:**
| Input | Expected |
|-------|----------|
| `None` | No filter |
| `"2024-01-01"` | Parsed |
| `date(2024,1,1)` | Passthrough |
| `"invalid"` | 400 (not 500) |

---

## Regression Snapshots

Catch silent correctness drift when code "works" but numbers change.

**Tolerances:**
| Metric | Tolerance |
|--------|-----------|
| `count` | ±0 (exact) |
| `median_psf` | ±0.5% or ±$15 |
| `total_value` | ±0.5% |

```bash
pytest tests/test_regression_snapshots.py -v
pytest tests/test_regression_snapshots.py --update-snapshots  # After intentional changes
```

---

## Chart.js Registration

```jsx
ChartJS.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip);
```
- Register: Controller + Elements + Scales
- Spread `baseChartJsOptions`
- Use `ChartSlot` wrapper

---

## Quarterly Infrastructure Audit

Run every quarter to detect Library-First violations:

```bash
# Find custom data fetching patterns
grep -rn "useState.*null.*useEffect.*fetch" frontend/src/

# Find manual AbortController (React Query handles this)
grep -rn "new AbortController()" frontend/src/components/

# Find manual stale request tracking
grep -rn "requestIdRef.*current" frontend/src/

# Find large Context files (>100 lines, consider Zustand)
find frontend/src/context -name "*.jsx" -exec wc -l {} \; | awk '$1 > 100'

# Find custom form validation
grep -rn "validate.*form\|formErrors\|setErrors" frontend/src/
```

**Action:** Any findings should be added to tech debt tracker with migration plan.

---

## The `/review` Workflow

Use `/review` for comprehensive code review before merge:

```
/review (orchestrator)
    │
    ├── Step 1: Scope Detection (git diff)
    ├── Step 2: Pattern Analysis (codebase-pattern-finder)
    ├── Step 3: Simplicity Check (simplicity-reviewer)
    ├── Step 4: Contract Check (fullstack-consistency-reviewer)
    ├── Step 5: Risk Detection (risk-agent)
    ├── Step 6: Inline Tests (Tier 1-4 based on scope)
    └── Step 7: Final Report (READY TO PUSH / NEEDS WORK)
```

**Auto-formatting:** PostToolUse hooks run ESLint and Black after every write/edit.

---

## Required Tests for Backend Changes

```bash
pytest tests/test_regression_snapshots.py -v
pytest tests/test_chart_dependencies.py -v
```

## Dependency Chain

```
Data Sources → Services → Routes → Endpoints → Adapters → Charts → Pages
```
