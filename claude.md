# Singapore Property Analyzer - System Rules

## Quick Reference

### Skills
| Skill | Trigger |
|-------|---------|
| `/review` | **Code review before merge (RECOMMENDED)** |
| `/sql-guardrails` | SQL queries |
| `/input-boundary-guardrails` | Route handlers |
| `/contract-async-guardrails` | Frontend data fetching |
| `/dashboard-guardrails` | Chart modifications |
| `/data-standards` | Classifications/labels |
| `/api-guardrails` | New endpoints, 404 debugging |
| `/design-system` | UI components, colors, typography |
| `/backend-impact-guardrails` | **Backend changes (MANDATORY)** |
| `/git-context-guardrails` | **ANY implementation (MANDATORY)** |
| `/library-check` | **New infrastructure code (MANDATORY)** |
| `/learn-mistake` | Record bad recommendations to Historical Incidents |

### Agents
| Agent | Trigger |
|-------|---------|
| `simplicity-reviewer` | Part of `/review` workflow |
| `eli5-guardian` | "explain to me", "complicated", "simplify" |
| `risk-agent` | Bug detection, security, code quality |
| `regression-snapshot-guard` | "verify no regressions", "before deploy" |
| `fullstack-consistency-reviewer` | **MANDATORY before merge** |
| `ingestion-orchestrator` | "scrape", "ingest", "upload CSV" |
| `etl-pipeline` | "upload CSV", "weekly update" |

### Page Routes
| Route | Page |
|-------|------|
| `/market-overview` | Market Overview (Resale ONLY) |
| `/district-overview` | District Overview |
| `/new-launch-market` | New Launch Market (New Sale + Resale) |
| `/supply-inventory` | Supply & Inventory Outlook |
| `/explore` | Explore |
| `/value-check` | Value Check |
| `/exit-risk` | Exit Risk Analysis |
| `/methodology` | Methodology |

**Navigation:** [`REPO_MAP.md`](./REPO_MAP.md) (file locations, patterns, tech debt zones)

**Historical Incidents:** [`REPO_MAP.md#9-historical-incidents-landmines`](./REPO_MAP.md#9-historical-incidents-landmines) - **READ BEFORE making recommendations or adding abstractions**

**Docs:** `docs/architecture.md`, `docs/frontend.md`, `docs/backend.md`, `docs/BACKEND_CHART_DEPENDENCIES.md`, `docs/LIBRARY_FIRST_REFERENCE.md`

---

# 1. CORE INVARIANTS (NON-NEGOTIABLE)

These rules MUST be followed at all times. Violating them is a bug, even if the code "works."

Before implementing ANY task, Claude MUST understand the codebase context first. Read target files, check git history, find reference implementations. The architecture is SETTLED — work WITHIN it, don't redesign it.

## 1.1 Layer Responsibilities

| Layer | Owns | NEVER Does |
|-------|------|------------|
| **Pages** | Business logic, data scope, sale type | - |
| **Components** | Rendering props | Logic, defaults, state, hardcoded values |
| **Utils** | Pure transforms | Defaults, side effects, business decisions |
| **Routes** | Parsing, validation | SQL, business logic |
| **Services** | SQL, computation | Parsing strings |
| **Backend** | Rule enforcement | - |

**Mental model:** `Pages decide → Components render → Utils transform → Backend enforces`

**UI/Layout changes = presentation only.** If behavior changes, the refactor is invalid.

```jsx
// FORBIDDEN - component decides logic
params.sale_type = 'resale';

// REQUIRED - page passes intent
<Chart saleType={SaleType.RESALE} />
```

## 1.2 Single Source of Truth

| What | Source | FORBIDDEN |
|------|--------|-----------|
| Sale types | `SaleType` enum | String literals (`'Resale'`, `'new-sale'`) |
| Districts/Regions | `constants.py` | Hardcoded mappings |
| Bedroom thresholds | `classifier.py` | Magic numbers (`if area < 580`) |
| API params | `contract_schema.py` | Undocumented fields |

**Rule:** JOIN/GROUP on stable IDs, never display names.

**Param Precedence (highest → lowest):**
1. Page-level prop (`saleType={SaleType.RESALE}`) — always wins
2. Filter-derived value (`activeFilters.saleType`)
3. Default (none)

## 1.3 Reuse-First Principle

**NEVER introduce new patterns. Match existing exactly.**

1. Find reference implementation → copy pattern exactly
2. Extend existing code → don't recreate
3. All similar code follows same structure
4. Deviation requires explicit approval

**Reference files:**
- Charts: `frontend/src/components/powerbi/TimeTrendChart.jsx`
- Routes: `backend/routes/analytics.py`
- Services: `backend/services/dashboard_service.py`

**Before implementing:** `git log -20 -- <target_files>` to understand patterns.

## 1.4 Production-Grade Standard

Every solution MUST be:
- **Long-term**: Works in 2 years, at 10x scale
- **Consistent**: Matches how similar problems are solved
- **Maintainable**: Another developer can understand it

**FORBIDDEN (Band-Aids):**
| Band-Aid | Production-Grade |
|----------|------------------|
| `if (specificEdgeCase)` hack | Fix root cause |
| Hardcoded values | Use constants/config |
| Duplicating code "to be safe" | Reuse existing |
| `// TODO: fix later` | Fix now or don't merge |

## 1.6 Library-First Principle

> **Origin:** On Dec 25, 2025, we built 400+ lines of custom query hooks when React Query solves this in 5 lines. The `datePreset` cache key bug was a direct result. Never again.

**BEFORE writing ANY infrastructure code (>50 lines), you MUST:**

1. **Check for existing library** - Search npm/PyPI for battle-tested solutions
2. **Justify custom code** - Document why library doesn't work
3. **Get explicit approval** - User must approve custom infrastructure

### Frontend Libraries (MANDATORY)

| Category | Use This | NOT Custom Code |
|----------|----------|-----------------|
| Data fetching | `@tanstack/react-query` | `useEffect` + `fetch` + `useState` |
| State management | `zustand` | Large Context files (>100 lines) |
| Forms | `react-hook-form` | Manual form state |
| Validation | `zod` | Custom validation functions |
| Date/time | `date-fns` | Custom date utils |
| Charts | `chart.js` (already used) | Custom canvas rendering |
| HTTP client | `axios` (already used) | Raw `fetch` wrappers |

### Backend Libraries (MANDATORY)

| Category | Use This | NOT Custom Code |
|----------|----------|-----------------|
| Validation | `pydantic` or `marshmallow` | Custom validation decorators |
| Date handling | `python-dateutil` | Custom date parsing |
| Background jobs | `celery` or `rq` | Custom queue implementations |
| Caching | `flask-caching` | Custom cache wrappers |
| Rate limiting | `flask-limiter` | Custom rate limit logic |

### Known Tech Debt (Scheduled for Migration)

These files exist but violate Library-First. They are scheduled for replacement:

| File | Lines | Problem | Target Library |
|------|-------|---------|----------------|
| `useQuery.js` | ~100 | Custom data fetching | React Query |
| `useAbortableQuery.js` | ~100 | Manual abort handling | React Query |
| `useStaleRequestGuard.js` | ~100 | Manual stale detection | React Query |
| `useGatedAbortableQuery.js` | ~100 | Combined patterns | React Query |
| `generateFilterKey()` | ~20 | Manual cache keys | React Query auto-generates |
| `PowerBIFilterContext.jsx` | ~300 | Large state context | Zustand |

**Rule:** Do NOT extend these files. New features must use target libraries.

### Exceptions (Custom Code Allowed)

Custom code is acceptable ONLY for:
1. **Domain-specific logic** - Business rules unique to SG property (bedroom classification, district mapping)
2. **Thin adapters** - API response transformers (<30 lines each)
3. **UI components** - React components (not state/data infrastructure)
4. **Configuration** - Constants, enums, config files

### Red Flags (Auto-Reject)

| Pattern | Problem |
|---------|---------|
| New file in `/hooks` >50 lines | Probably reinventing a library |
| `useEffect` + `fetch` + `useState` combo | Use React Query |
| Manual `AbortController` | Use React Query |
| Manual `requestIdRef` for stale detection | Use React Query |
| `JSON.stringify` for cache keys | Use React Query |
| Context file >100 lines | Consider Zustand |
| Custom form validation | Use react-hook-form + zod |

## 1.5 Data Correctness Invariants

**Two-Phase Computation:**
- Phase A: Compute invariants globally (before filtering)
- Phase B: Apply filters as membership, not redefinition

**Deterministic Transformations:**
- Explicit `ORDER BY date, id` (never rely on implicit order)
- No `MODE()` or unordered `array_agg()`
- Join on IDs, not display strings

**DB vs Python:**
| DB | Python |
|----|--------|
| Filtering, joining, aggregation | Param validation, orchestration |
| Set operations | Formatting response |
| **Single bulk query** | **Never N+1 loops** |

---

# 2. HARD CONSTRAINTS

These are absolute limits. Violation = data loss or system failure.

## Data File Immutability (ABSOLUTE)

**NEVER delete, modify, or overwrite any CSV in `backend/data/` or `scripts/data/`.**

| FORBIDDEN | ALLOWED |
|-----------|---------|
| `os.remove()`, `Path.unlink()` on data files | Read data files |
| `open(csv_path, 'w')` | Write to `backend/data/generated/` |
| `pd.to_csv()` to tracked paths | Write to `/tmp/` |

## Memory (512MB)
- SQL aggregation only (no pandas on large data)
- Paginated queries (never 100K+ records)
- Use `precomputed_stats` table

## Outlier Exclusion
```sql
WHERE COALESCE(is_outlier, false) = false  -- EVERY transaction query
```

---

# 3. DOMAIN RULES

Technical patterns specific to this codebase. Follow these exactly.

## 3.1 SQL & Dates

**SQL:**
- `:param` bindings only (no f-strings, no `%(param)s`)
- Python `date` objects (not strings)
- SQL in `services/`, not `routes/`
- Static SQL with NULL guards: `(:param IS NULL OR col = :param)`

**Date Bounds (exclusive upper):**
```sql
WHERE transaction_date >= :min_date AND transaction_date < :max_date_exclusive
```

**URA Data = Month-Level:**
All transactions dated to 1st of month. Use "last 3 months" not "last 90 days".

```python
# KPI date bounds
current_min = date(max_date.year, max_date.month - 2, 1)  # 3 months back
```

## 3.2 Frontend Async

> **Note:** Current patterns (`useAbortableQuery`, `useStaleRequestGuard`) are tech debt scheduled for React Query migration. See Section 1.6.

- Use `useAbortableQuery` or `useStaleRequestGuard` (until React Query migration)
- Pass `signal` to ALL API calls
- Check `isStale(requestId)` before setState
- Response through adapter (never `response.data` directly)

**Proactive Pattern Detection:**
When you see these patterns in existing code, flag for migration:
```bash
# Detect custom async patterns (scheduled for React Query)
grep -rn "useState.*null.*useEffect.*fetch" frontend/src/
grep -rn "new AbortController()" frontend/src/components/
grep -rn "requestIdRef.*current" frontend/src/
```

**Query Keys:** Include ALL data-affecting state.
```js
filterKey: `${debouncedFilterKey}:${timeGrouping}`  // Not just debouncedFilterKey
```

**Visibility-Gated Fetching:** `containerRef` must be outside QueryState.
```jsx
<div ref={containerRef}>
  <QueryState loading={loading}>...</QueryState>
</div>
```

## 3.3 Filters & Params

| Scope | Applies To |
|-------|------------|
| Sidebar slicers | ALL charts |
| Cross-filters | ALL charts |
| Fact filters | Transaction table ONLY |

- `buildApiParams()` for ALL API calls
- Time X-axis → `excludeHighlight: true`
- `usePowerBIFilters()` → Market Overview page ONLY

## 3.4 API Contracts

```python
@analytics_bp.route("/aggregate", methods=["GET"])
@api_contract("aggregate")  # Validates params + injects meta
def aggregate():
    params = g.normalized_params
    result = dashboard_service.get_aggregated_data(**params)
    return jsonify({"data": result})
```

**Endpoints:**
- `/api/aggregate` — Flexible GROUP BY (prefer this)
- `/api/transactions` — Paginated list
- `/api/filter-options` — Dropdown values

**Rule:** Need data? Extend `/api/aggregate`. Don't create new endpoints.

## 3.5 UI States

Every async hook returns `{ data, loading, error }`. Handle ALL THREE:
```jsx
if (loading) return <Skeleton />;
if (error) return <ErrorState />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

---

# 4. CODE PATTERNS

Copy these patterns exactly. All new code must match these structures.

## Frontend Chart
```jsx
const { data, loading, error } = useAbortableQuery(
  (signal) => apiClient.get('/api/aggregate', {
    params: buildApiParams({ group_by: 'month' }, { excludeHighlight: true }),
    signal
  }).then(r => adapter(r.data)),
  [debouncedFilterKey, timeGrouping]
);
if (loading) return <Skeleton />; if (error) return <Error />; return <Chart data={data} />;
```

## Backend Service
```python
def get_data(district: str = None, date_from: date = None):
    return db.session.execute(text("""
        SELECT district, COUNT(*) FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND (:district IS NULL OR district = :district)
        GROUP BY district
    """), {"district": district, "date_from": date_from}).fetchall()
```

## Route Handler
```python
@app.route("/data")
def get_data():
    try:
        limit = to_int(request.args.get("limit"), default=100, field="limit")
        date_from = to_date(request.args.get("date_from"), field="date_from")
    except ValidationError as e:
        return validation_error_response(e)
    return service.get_data(limit=limit, date_from=date_from)
```

---

# 5. BACKEND CHANGE PROTOCOL

Before ANY backend change, trace the dependency chain and verify no charts break. This is MANDATORY.

> **Ref:** `docs/BACKEND_CHART_DEPENDENCIES.md` | **Skill:** `/backend-impact-guardrails`

## The 4 Questions (Before Every Backend Change)

1. **API CONTRACT** — Response shape, field names, params unchanged?
2. **FRONTEND RENDERING** — All pages load without React errors?
3. **VISUAL CHARTS** — Charts display with data, no empty states?
4. **CHART LOGIC** — Adapters, transformations, calculations correct?

**If YES to breaking any → STOP. Fix before proceeding.**

## Dependency Chain
```
Data Sources → Services → Routes → Endpoints → Adapters → Charts → Pages
```

## Impact Categories

| Category | Action | Example |
|----------|--------|---------|
| **BREAKING** | STOP. Migration plan required. | Removing data, renaming fields |
| **VALIDATION** | Manual verification required. | Changing aggregation logic |
| **SAFE** | Document and proceed. | Adding new optional fields |

## Critical Endpoints

| Endpoint | Risk | Charts Affected |
|----------|------|-----------------|
| `/api/aggregate` | CRITICAL | 10+ charts |
| `/api/kpi-summary-v2` | HIGH | All KPI cards |

## Required Tests
```bash
pytest tests/test_regression_snapshots.py -v
pytest tests/test_chart_dependencies.py -v
```

## Manual Page Verification (ALL pages)
`/market-overview`, `/district-overview`, `/new-launch-market`, `/supply-inventory`, `/explore`, `/value-check`, `/exit-risk`

---

# 6. REFERENCE DATA

## Bedroom Classification
```
Tier 1 (New ≥Jun'23): <580, <780, <1150, <1450, ≥1450 sqft
Tier 2 (New <Jun'23): <600, <850, <1200, <1500, ≥1500 sqft
Tier 3 (Resale):      <600, <950, <1350, <1650, ≥1650 sqft
```

## District → Region
```
CCR: D01, D02, D06, D07, D09, D10, D11
RCR: D03, D04, D05, D08, D12, D13, D14, D15, D20
OCR: D16-D19, D21-D28
```

## Colors
```
Primary: #213448 (navy), #547792 (blue), #94B4C1 (sky), #EAE0CF (sand)
Regions: CCR=#213448, RCR=#547792, OCR=#94B4C1
```

---

# 7. ENGINEERING PRINCIPLES

Design philosophy for this codebase. Apply these when making architectural decisions.

## 7.1 Component Design

1. **One Chart = One Question** — Multiple questions → split or add toggle
2. **Pure Chart + Container** — Chart renders props, Container wires data
3. **UI Components Don't Fetch** — Hooks fetch, components render
4. **Write for Deletion** — Removing feature folder deletes feature cleanly
5. **DRY at 3 Uses** — 1: local, 2: consider, 3: extract
6. **Composition > Abstraction** — Small parts, not mega-components
7. **No Import-Time Side Effects** — No fetch/DB/I/O at module top-level
8. **Never Leak Premium Data** — Backend masks for free users
9. **Simplest Rule Wins** — Business intent over technical correctness

## 7.2 API & Code Design

1. **Don't ship what nobody uses**
   - Bad: "It might be useful someday" → Add it
   - Good: "Is it used today?" → No → Don't add it
   - Dead code/fields become maintenance burden. Remove aggressively.

2. **Single source of truth**
   - Bad: Subscription info in `/aggregate` AND `/auth/subscription`
   - Good: Subscription info ONLY in `/auth/subscription`
   - Duplicated data drifts. One place for each piece of information.

3. **One job per component**
   - Bad: Serializer transforms data AND injects meta AND validates
   - Good: Serializer transforms data. Decorator handles meta. Validator validates.
   - When something breaks, you know exactly where to look.

4. **Make invalid states impossible**
   - Bad: Schema and serializer can disagree → Runtime errors
   - Good: Schema generates serializer → Can't disagree
   - Design so mistakes can't happen, not just "shouldn't" happen.

5. **Fail fast, fail loud**
   - Bad: Log warning, continue anyway → Problems hide
   - Good: Throw error immediately → Problems surface
   - The earlier you catch issues, the easier they are to fix.

6. **Explicit over implicit**
   - Bad: Fields magically appear from somewhere
   - Good: Every field traced to a declaration
   - Future you (or teammates) should understand code without archaeology.

7. **Boring is good**
   - Bad: Clever one-liner nobody understands
   - Good: Obvious 5 lines everyone understands
   - Code is read 10x more than written. Optimize for reading.

8. **Consistent patterns everywhere**
   - Bad: Endpoint A returns `{ data, meta }`, B returns `{ results, info }`, C returns `{ payload }`
   - Good: ALL endpoints return `{ data, meta }`
   - Learn once, apply everywhere. No surprises.

9. **Delete before you add**
   - Bad: Add new field, keep old field "for compatibility"
   - Good: Remove old field, add new field
   - Every line of code is a liability. Less code = less bugs.

10. **Test the contract, not the implementation**
    - Bad: Test that function calls X, Y, Z internally
    - Good: Test that input A produces output B
    - Implementation can change. Contract shouldn't.

11. **Make dependencies obvious**
    - Bad: Function secretly reads global state
    - Good: Function takes all inputs as parameters
    - If it's not in the function signature, it shouldn't affect the output.

12. **Optimize for change**
    - Bad: Hardcode values everywhere
    - Good: Single config file, referenced everywhere
    - Requirements change. Make changing easy.

---

# 8. CHECKLISTS

Run these before committing. If any box fails, stop and fix.

## Pre-Commit
- [ ] Can explain file in one sentence
- [ ] Used existing sources of truth (enums, constants)
- [ ] No duplicated logic
- [ ] Chart handles loading/empty/error/success
- [ ] Deletable without breaking unrelated features
- [ ] No premium data leaked to DOM
- [ ] ESLint disables scoped + justified

## New Chart
- [ ] Answers ONE question
- [ ] Pure chart + container split
- [ ] Uses `useAbortableQuery` + adapters
- [ ] Query key includes ALL data-affecting state
- [ ] Accepts `saleType` as prop (never hardcodes)
- [ ] Lazy import syntax matches export style

## Data Correctness
- [ ] Invariants computed globally before filters (Two-Phase)
- [ ] Joins use stable keys (IDs), not display names
- [ ] Aggregations deterministic (`ORDER BY date, id`)
- [ ] No `MODE()` or unordered `array_agg()`
- [ ] One canonical param + response shape
- [ ] Contracts reflect runtime exactly
- [ ] Static SQL with param guards
- [ ] DB does set work; Python does orchestration
- [ ] No repeated implementations of business rules

## Problem-Solving
1. Fix the class of problem (check parallel code paths)
2. Invariant > conditional patch
3. No hidden side effects
4. Assume messier data in future
5. If unsure → ask

## Infrastructure Code (Library-First)
- [ ] Checked npm/PyPI for existing library solution
- [ ] Custom code is <50 lines (or has documented justification)
- [ ] Not recreating: data fetching, state management, forms, validation
- [ ] User explicitly approved custom infrastructure (if >50 lines)
- [ ] Added to tech debt tracker if temporary

---

# 9. DEBUGGING & TESTING

## Debugging 500s
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

## Chart.js Registration
```jsx
ChartJS.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip);
```
- Register: Controller + Elements + Scales
- Spread `baseChartJsOptions`
- Use `ChartSlot` wrapper

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

# 10. FILE STRUCTURE

```
backend/
├── api/contracts/       # @api_contract decorator + schemas
├── constants.py         # District/region mappings
├── services/            # Business logic + SQL
├── routes/              # Thin handlers (parse only)
└── utils/normalize.py   # to_int, to_date, to_list

frontend/src/
├── constants/           # REGIONS, BEDROOM_ORDER
├── schemas/apiContract/ # Enums, isSaleType helpers
├── adapters/            # API response transformers
├── hooks/               # useAbortableQuery
├── context/             # PowerBIFilterContext
└── components/powerbi/  # Chart components
```

---

# 11. VERIFICATION (MANDATORY BEFORE TASK COMPLETION)

Claude MUST run tests inline and iterate until green. Do NOT mark task complete if tests fail.

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

## Smart Failure Handling

| Error Type | Action |
|------------|--------|
| Lint errors | Auto-fix, retry (up to 3x) |
| Type errors | Auto-fix, retry (up to 3x) |
| Unit test failures | Report, explain, ASK before fixing |
| Integration failures | Report, explain, ASK before fixing |
| Contract drift | Regenerate contracts, retry |

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
