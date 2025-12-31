# Singapore Property Analyzer - System Rules

## Skills & Docs
| Skill | Trigger |
|-------|---------|
| `/sql-guardrails` | SQL queries |
| `/input-boundary-guardrails` | Route handlers |
| `/contract-async-guardrails` | Frontend data fetching |
| `/dashboard-guardrails` | Chart modifications |
| `/data-standards` | Classifications/labels |
| `/api-endpoint-guardrails` | New endpoints |
| `/api-contract-guardrails` | API contract changes |
| `/frontend-design` | Building UI components/pages |
| `/lazy-import-guardrails` | React.lazy() / dynamic imports |
| `/backend-impact-guardrails` | **Backend changes (MANDATORY)** |

## Agents
| Agent | Trigger |
|-------|---------|
| `regression-snapshot-guard` | "verify no regressions", "before deploy", "numbers shifted" |
| `ui-layout-validator` | "check layout", "verify responsive", "overflow issues" |
| `designer-validator` | "check typography", "verify colors", "design consistency", "font issues" |
| `data-integrity-validator` | "validate data", "check filters", "wrong counts" |
| `ingestion-orchestrator` | "scrape", "ingest", "upload CSV", "data sources", "tier A/B/C" |
| `etl-pipeline` | "upload CSV", "weekly update", "import transactions" |
| `fullstack-consistency-reviewer` | **MANDATORY before merge**, "review", "consistency check", "PR review" |

Docs: `docs/backend.md`, `docs/frontend.md`, `docs/architecture.md`, `INGESTION_ARCHITECTURE.md`, `docs/BACKEND_CHART_DEPENDENCIES.md`

## Page Routes

| Nav Label | Page Title | Route |
|-----------|------------|-------|
| Market Overview | Market Overview | `/market-overview` |
| District Overview | District Overview | `/district-overview` |
| New Launch Market | New Launch Market | `/new-launch-market` |
| Supply & Inventory | Supply & Inventory Outlook | `/supply-inventory` |
| Explore | Explore | `/explore` |
| Value Check | Value Check | `/value-check` |
| Exit Risk | Exit Risk Analysis | `/exit-risk` |
| Methodology | Methodology | `/methodology` |

**Legacy redirects:** Old routes (`/market-core`, `/primary-market`, `/district-deep-dive`, `/project-deep-dive`, `/value-parity`, `/supply-insights`) redirect to new routes for backwards compatibility.

---

# 0. ARCHITECTURAL INVARIANTS (NON-NEGOTIABLE)

These rules MUST be followed at all times. Violating them is a bug, even if the code "works."

## Core Philosophy — Page Owns Business Logic

| Layer | Responsibility |
|-------|----------------|
| **Pages** | Decide business logic (data scope, sale type, market mode) |
| **Components** | Receive props, render data, never enforce meaning |
| **Utils** | Transform inputs, never set defaults or infer intent |
| **Backend** | Enforce rules, validate inputs |

**Mental Model (memorize this):**
```
Pages decide meaning → Components visualize → Utils transform → Backend enforces → Nothing guesses
```

## Component Design Rules

Components MUST:
- Be stateless and reusable
- Accept configuration via props
- Never assume market context

Components must NOT:
- Hardcode sale type or business rules
- Infer business intent
- Override page-level decisions

```jsx
// ❌ FORBIDDEN - component decides business logic
params.sale_type = 'resale';

// ✅ REQUIRED - page passes intent via prop
<Component saleType={SaleType.RESALE} />
```

## Single Source of Truth (Enums)

All sale types MUST come from canonical enums. No string literals for business logic.

```jsx
// ✅ Correct
import { SaleType } from '../schemas/apiContract';
const SALE_TYPE = SaleType.RESALE;

// ❌ Incorrect - string literals
'Resale'
'resale'
'NEW'
'new-sale'
```

## Param Merge Precedence

When building API params, precedence order is:
1. **Page-level prop** (highest) - always wins
2. **Filter-derived value** - only if page didn't set it
3. **Default** (lowest) - none

```js
// utils.js - page prop takes precedence
if (!params.sale_type && activeFilters.saleType) {
  params.sale_type = activeFilters.saleType;  // Only if not already set
}
```

## Market Overview vs New Launch Market

These are SEPARATE data universes. They MUST NEVER be mixed.

| Page | Route | Data Scope | Purpose |
|------|-------|------------|---------|
| Market Overview | `/market-overview` | Resale ONLY | Secondary market analysis |
| New Launch Market | `/new-launch-market` | New Sale + Resale | Developer pricing, launches, absorption |

## Chart Rules

Charts:
- Accept `saleType` as prop
- Never decide saleType internally
- Never override page intent
- Must be reusable across pages

```jsx
// ✅ Allowed - conditional based on prop
if (saleType) params.sale_type = saleType;

// ❌ Forbidden - chart decides
params.sale_type = SaleType.RESALE;
```

## Utility Function Rules

Utils must be PURE. They:
- Transform inputs
- Never enforce logic
- Never set defaults
- Never infer intent

```js
// ❌ Not allowed in utils
if (!saleType) saleType = 'resale';  // Setting default = business logic

// ✅ Allowed - pure transformation
return saleType?.toLowerCase();
```

## Pre-Merge Safety Checklist

Before merging ANY analytics-related change:
- [ ] Page decides sale type
- [ ] Components are reusable (no hardcoded business logic)
- [ ] No string literals for enums
- [ ] Page prop overrides filter params
- [ ] Market Overview ≠ New Launch Market clearly separated
- [ ] Charts accept saleType as prop
- [ ] Utils are pure (no defaults, no inference)

**If unsure — STOP and ask.**

---

# 0.5 DATA CORRECTNESS INVARIANTS

These principles prevent silent correctness bugs in data processing and analytics.

## Single Source of Truth for Meaning

**Rule:** Define "what parameters mean" and "what response means" ONCE, enforce it everywhere.

| Layer | Defines | Enforces |
|-------|---------|----------|
| Contract schema | Parameter types, response shapes | Validation |
| Constants | Enum values, display labels | Lookup |
| Service | Business logic | Computation |

**Smell:** Param schema says "comma-separated string" but service expects `list[int]`. That's drift-by-design.

## Stable Identity > Display Strings

**Rule:** Always join/group on stable keys (IDs), not display names.

| ❌ Wrong | ✅ Correct |
|----------|-----------|
| `JOIN ON project_name` | `JOIN ON project_id` |
| `GROUP BY project_name` | `GROUP BY project_id` |
| `UPPER(TRIM(project_name))` everywhere | Canonicalize once → `canonical_key` column |

**Why:** Display names change (typos, duplicates, normalization). IDs don't.

## Two-Phase Computation

**Rule:** Compute invariant truth FIRST (Phase A), then filter as membership (Phase B).

```
Phase A: Compute globally (before any filtering)
  - launch_date = MIN(transaction_date) for ALL transactions
  - cohorts = defined by global launch_date
  - outlier_flags = computed before filtering

Phase B: Apply filters as membership, not redefinition
  - Filter selects which rows to SHOW
  - Filter does NOT change how metrics are COMPUTED
  - launch_date does NOT shift when you filter by district
```

**Smell:** `MIN(transaction_date)` inside filtered subquery → "launch date shifts when I filter".

## Deterministic Transformations

**Rule:** Every transformation must produce same output for same input.

| ❌ Non-deterministic | ✅ Deterministic |
|---------------------|-----------------|
| `MODE()` (arbitrary tie-break) | Explicit rule: "earliest row wins" |
| `array_agg(x)` (unordered) | `array_agg(x ORDER BY id)` |
| `MIN(project_name)` as canonical | `project_id` lookup |
| Relying on implicit row order | `ORDER BY date, id` always |

## DB Does Set Work; Python Does Orchestration

| Layer | Responsibility |
|-------|----------------|
| **DB** | Filtering, joining, aggregation, set operations |
| **Python** | Param validation, calling DB once, formatting response |

**Forbidden:**
```python
# ❌ WRONG: O(n²) pattern
names = db.execute("SELECT DISTINCT project_name FROM txn").fetchall()
for name in names:
    units = get_units_for_project(name)  # N queries!
```

**Required:**
```python
# ✅ CORRECT: Single bulk query
result = db.execute("""
    SELECT p.project_name, u.unit_count
    FROM projects p
    JOIN units u ON p.project_id = u.project_id
""")
```

## Static SQL + Param Guards

**Rule:** Prefer static queries with NULL guards over dynamic string building.

```python
# ❌ FORBIDDEN: Dynamic SQL string building
query = "SELECT * FROM txn WHERE 1=1"
if bedroom:
    query += f" AND bedroom = {bedroom}"  # Injection risk + messy

# ✅ CORRECT: Static SQL with NULL guards
query = """
    SELECT * FROM txn
    WHERE (:bedroom IS NULL OR bedroom = :bedroom)
      AND (:district IS NULL OR district = :district)
"""
```

## Contract is a Boundary, Not Decoration

**Rule:** Contract schemas must match exact runtime behavior.

| ❌ Contract Drift | ✅ Contract Truth |
|------------------|------------------|
| Schema says `List[str]`, service expects `str` | Types match exactly |
| Schema documents `filtersApplied`, backend doesn't produce it | Only document what's produced |
| Schema says camelCase, adapter outputs snake_case | End-to-end consistency |

**Smell:** Contract file exists but tests pass even when schema is wrong.

## Canonical Shapes End-to-End

**Rule:** Pick ONE canonical shape and make it consistent across all layers.

```
Request params  → Normalized params (g.normalized_params) → Response keys
   snake_case   →      snake_case                        →   camelCase (v2)
```

- Adapters do minimal reshaping, not meaning conversion
- Backend emits consistent field names
- Frontend adapters handle v1/v2 normalization

---

# 1. HARD CONSTRAINTS

## Data File Immutability (ABSOLUTE)

**NEVER delete, modify, or overwrite any CSV file in `backend/data/` or `scripts/data/`.**

This is not a guideline - it's a hard constraint. Violation = data loss = catastrophic failure.

### Forbidden Actions
- `os.remove()`, `Path.unlink()`, `shutil.rmtree()` on data files
- `open(csv_path, 'w')` - overwriting tracked CSVs
- `pd.to_csv()` to tracked file paths
- Any "cleanup" that touches tracked data files
- Moving, renaming, or "organizing" data files

### Before ANY File Operation
1. Is this file under `backend/data/` or `scripts/data/`?
2. Is this file tracked in git (`git ls-files <path>`)?
3. If YES to both → **STOP. Do not proceed.**

### Allowed Actions
- READ data files (always safe)
- Write to `backend/data/generated/` (gitignored)
- Write to `.data/` (gitignored)
- Write to `/tmp/` or system temp directories

### Output File Pattern
```python
# ❌ FORBIDDEN
df.to_csv("backend/data/projects.csv")

# ✅ REQUIRED
df.to_csv("backend/data/generated/projects_cleaned.csv")
```

### Runtime Protection
All file mutations go through `backend/utils/fs_guard.py`:
```python
from utils.fs_guard import safe_write_text, safe_unlink

# These will CRASH if targeting protected files
safe_write_text("backend/data/generated/output.csv", data)  # OK
safe_write_text("backend/data/projects.csv", data)  # RuntimeError!
```

## Memory (512MB)
- SQL aggregation only (no pandas)
- Paginated queries (never load 100K+ records)
- Use `precomputed_stats` table

## Outlier Exclusion
```sql
WHERE COALESCE(is_outlier, false) = false  -- EVERY transaction query
```

---

# 2. RULES BY DOMAIN

## SQL
- `:param` only (no `%(param)s`, no f-strings)
- Python `date` objects (not strings)
- Enums via `contract_schema.py`
- SQL in `services/`, not `routes/`
- Deterministic ORDER BY: `ORDER BY date, id` (not just date)
  - Required for: window functions, cumulative sums, first/last row
  - Safe to skip: GROUP BY aggregations

## Date Bounds Convention
**Rule:** Always use exclusive upper bound. Never have both `:max_date` and `:max_date_exclusive`.

```sql
-- CORRECT: Exclusive upper bound
WHERE transaction_date >= :min_date
  AND transaction_date < :max_date_exclusive

-- For "last 12 months":
WHERE transaction_date >= :max_date_exclusive - INTERVAL '12 months'
  AND transaction_date < :max_date_exclusive

-- WRONG: Creates param confusion
AND transaction_date <= :max_date  -- ❌ Don't use alongside _exclusive
```

**Why:** Mixing `max_date` and `max_date_exclusive` in same query → easy to forget one in params dict → silent query failure.

## Input Boundary
**Rule:** Normalize ONCE at boundary → trust internally

| Layer | Responsibility |
|-------|----------------|
| Routes | Parse with `to_int()`, `to_date()`, `to_bool()` from `utils/normalize.py` |
| Services | Validate business logic, use `coerce_to_date()` for legacy compat |

- Invalid input → 400 (never 500)
- `strptime()` in service → WRONG (use `coerce_to_date()`)
- Canonical types: `date` (not datetime/str), `int` (cents), `float` (0-1 percent)

## Frontend Async
- Use `useAbortableQuery` or `useStaleRequestGuard`
- Pass `signal` to ALL API calls
- Check `isStale(requestId)` before setState
- Silently ignore `AbortError`/`CanceledError`
- Response through adapter (never access `response.data` directly)

## Visibility-Gated Fetching (useDeferredFetch)
**Rule:** `containerRef` must be mounted unconditionally.

```jsx
// BUG: ref inside QueryState (not rendered during loading)
<QueryState loading={loading}>
  <div ref={containerRef}>...</div>
</QueryState>

// FIX: ref OUTSIDE QueryState
<div ref={containerRef}>
  <QueryState loading={loading}>...</QueryState>
</div>
```

Symptom: Chart loads initially but ignores filter changes (no error, just stale).

## Query Keys
**Rule:** If value changes API response → must be in query key

```js
// BUG: filterKey missing timeGrouping
filterKey: debouncedFilterKey  // ❌

// FIX: include ALL data-affecting state
filterKey: `${debouncedFilterKey}:${timeGrouping}`  // ✅
```

Data state: `timeGrouping`, `dateRange`, `segment`, `bedroom`, `drillLevel`
UI state: `isExpanded`, `tooltipPosition` (exclude from key)

## Enums & Constants
**Sources of truth:**
- Backend: `constants.py`, `services/classifier.py`
- Frontend: `constants/index.js`, `schemas/apiContract.js`

```js
// FORBIDDEN
if (row.sale_type === 'New Sale')
if (area < 580)

// REQUIRED
if (isSaleType.newSale(row.saleType))
classifyBedroomThreeTier(area, saleType, date)
```

## Filters
| Scope | Applies To |
|-------|------------|
| Sidebar slicers | ALL charts |
| Cross-filters | ALL charts |
| Fact filters | Transaction table ONLY |

- `usePowerBIFilters()` → Market Overview page ONLY
- Other pages → receive filters as props
- Each chart has LOCAL drill state
- `buildApiParams()` for ALL API calls
- Time X-axis → `excludeHighlight: true`

## Business Logic Enforcement
**Rule:** Enforce business constraints at the page/chart layer, NOT in shared utils.

```
Layer         │ Responsibility
──────────────┼───────────────────────────────────────
UI            │ Displays data
Page/Chart    │ Declares data intent (e.g., resale-only)
API           │ Enforces rules (safest for analytics)
Utils         │ Pure helpers (no business logic)
```

**✅ CORRECT: Page-level enforcement with canonical enum**
```jsx
import { SaleType } from '../schemas/apiContract';

// Page-level data scope - all charts inherit this
const SALE_TYPE = SaleType.RESALE;  // Use canonical enum ('resale')

<TimeTrendChart saleType={SALE_TYPE} />
```

**✅ BETTER: API-level enforcement (for critical analytics)**
```python
# backend/routes/analytics.py
# For Market Overview endpoints, enforce resale-only server-side
if sale_type is None:
    sale_type = "Resale"  # Default to resale for Market Overview
```

**❌ WRONG: Hardcoded in utils**
```js
// utils.js - DON'T DO THIS
export function buildApiParams(...) {
  params.sale_type = 'Resale';  // Hidden, affects ALL pages
}
```

**Why page-level is best:**
- Explicit and self-documenting
- Easy to override for different pages
- Keeps utils reusable
- Matches mental model ("this page is resale-only")
- No hidden side effects

## Sale Type Normalization
**Rule:** Always use canonical enum values. Page props take precedence over filters.

**Sources of truth:**
```
Frontend: SaleType.RESALE = 'resale' (schemas/apiContract/enums.js)
Backend:  SALE_TYPE_RESALE = 'Resale' (constants.py)
```

**Precedence order (highest to lowest):**
1. Page-level prop (`saleType={SaleType.RESALE}`)
2. Filter-derived value (`activeFilters.saleType`)
3. Default (none - all sale types)

**Implementation in buildApiParams:**
```js
// utils.js - page prop wins
if (!params.sale_type && activeFilters.saleType) {
  params.sale_type = activeFilters.saleType;  // Only if not already set
}
```

**Checklist for sale type safety:**
- [ ] Use `SaleType.RESALE` enum, not string literals
- [ ] Page prop passed to all charts: `saleType={SALE_TYPE}`
- [ ] Utils don't override if sale_type already in params
- [ ] Backend validates/normalizes sale_type values

## Dates
- UI date ranges must NEVER exceed today (clamp future dates)
- Date presets anchor from `dateRange.max`
- If control dependency not ready → disable OR fallback (never silent no-op)

## URA Data Granularity
**Critical:** URA transaction data is **month-level only**. All transactions within a month are dated to the **1st of that month**.

```sql
-- BUG: "Last 90 days" from Dec 27 creates Oct 2 boundary
WHERE transaction_date >= '2025-10-02'  -- Excludes ALL October (dated Oct 1)

-- FIX: Use month boundaries
WHERE transaction_date >= '2025-10-01'  -- Includes October
```

**Rules:**
1. **Rolling windows = months, not days** — Use "last 3 months" not "last 90 days"
2. **Boundaries on 1st of month** — `current_min = date(year, month, 1)`
3. **Labels must match logic** — Don't say "90 days" if using month buckets

**KPI Pattern:**
```python
# Current: Oct, Nov, Dec | Previous: Jul, Aug, Sep
if max_date.month == 12:
    max_exclusive = date(max_date.year + 1, 1, 1)
else:
    max_exclusive = date(max_date.year, max_date.month + 1, 1)

# Go back 3 months
current_min = date(max_exclusive.year, max_exclusive.month - 3, 1)  # Handle year wrap
```

## Date Filter Contract
**API contract:** All date filters use half-open intervals.

| Parameter | Meaning | SQL |
|-----------|---------|-----|
| `date_from` | Inclusive start | `>= :date_from` |
| `date_to` | **Exclusive** end | `< :date_to` |

```python
# Route layer: normalize to exclusive
to_dt = to_date(request.args.get("date_to"))
if to_dt:
    filter_conditions.append(Transaction.transaction_date < to_dt + timedelta(days=1))
```

**Common bugs:**
- `<= date_to` with midnight → excludes entire end date
- Timezone shift → `2025-12-01` becomes `2025-11-30` in UTC
- String comparison instead of DATE type

**Smoke tests (must pass):**
| Test | Expected |
|------|----------|
| `from=2025-12-01, to=2025-12-02` | Dec 1 only |
| `from=2025-11-15, to=2025-12-15` | Both Nov and Dec |
| `from=2025-11-01, to=2025-12-01` | November only |

## UI States
Every async hook returns `{ data, loading, error }`. UI must handle ALL THREE:
```jsx
if (loading) return <Skeleton />;
if (error) return <ErrorState />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

## API Contracts
**Rule:** Routes with `@api_contract` decorator enforce param/response schemas automatically.

```python
from api.contracts import api_contract

@analytics_bp.route("/aggregate", methods=["GET"])
@api_contract("aggregate")  # Validates params + injects meta fields
def aggregate():
    params = g.normalized_params  # Access validated, normalized params
    ...
```

**What the decorator does:**
1. Validates public params against `ParamSchema`
2. Normalizes params (district→districts[], date_to→date_to_exclusive)
3. Validates normalized params against `ServiceBoundarySchema`
4. After handler, validates response against `ResponseSchema`
5. Injects meta fields: `requestId`, `elapsedMs`, `apiVersion`
6. Adds headers: `X-Request-ID`, `X-API-Contract-Version`

**Contract modes:**
- `WARN` (default): Log violations, don't fail
- `STRICT`: Fail on violations (use in dev/staging)

**Standardized error envelope:**
```json
{
  "error": {
    "code": "INVALID_PARAMS",
    "message": "bedroom must be integer",
    "field": "bedroom",
    "requestId": "req_abc123"
  }
}
```

**Adding new contract:**
1. Create schema in `api/contracts/schemas/`
2. Define `ParamSchema`, `ServiceBoundarySchema`, `ResponseSchema`
3. Call `register_contract()` at module import
4. Add `@api_contract("endpoint_name")` to route
5. Add snapshot test in `tests/contracts/snapshots/`

---

# 3. CODE PATTERNS

## Frontend Chart
```jsx
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useAbortableQuery } from '../../hooks';
import { REGIONS } from '../../constants';
import { isSaleType } from '../../schemas/apiContract';

export function MyChart() {
  const { buildApiParams, debouncedFilterKey, timeGrouping } = usePowerBIFilters();

  const { data, loading, error } = useAbortableQuery(
    (signal) => apiClient.get('/api/aggregate', {
      params: buildApiParams({ group_by: 'month' }, { excludeHighlight: true }),
      signal
    }).then(r => transformData(r.data)),
    [debouncedFilterKey, timeGrouping]
  );

  if (loading) return <Skeleton />;
  if (error) return <Error />;
  return <Chart data={data} />;
}
```

## Backend Service
```python
from datetime import date
from sqlalchemy import text

def get_data(district: str = None, date_from: date = None):
    return db.session.execute(text("""
        SELECT district, COUNT(*) as count
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND (:district IS NULL OR district = :district)
          AND (:date_from IS NULL OR transaction_date >= :date_from)
        GROUP BY district
    """), {"district": district, "date_from": date_from}).fetchall()
```

## Route Handler
```python
from utils.normalize import to_int, to_date, to_list, ValidationError, validation_error_response

@app.route("/data")
def get_data():
    try:
        limit = to_int(request.args.get("limit"), default=100, field="limit")
        date_from = to_date(request.args.get("date_from"), field="date_from")
        bedrooms = to_list(request.args.get("bedroom"), item_type=int, field="bedroom")
    except ValidationError as e:
        return validation_error_response(e)
    return service.get_data(limit=limit, date_from=date_from, bedrooms=bedrooms)
```

## Contract-Enabled Route Handler
```python
from api.contracts import api_contract
from flask import g, jsonify

@analytics_bp.route("/aggregate", methods=["GET"])
@api_contract("aggregate")
def aggregate():
    # Params already validated + normalized by decorator
    params = g.normalized_params

    # Call service with clean params
    result = dashboard_service.get_aggregated_data(
        districts=params.get('districts'),
        bedrooms=params.get('bedrooms'),
        date_from=params.get('date_from'),
    )

    # Return data - decorator injects meta fields automatically
    return jsonify({"data": result})
```

---

# 4. KPI PATTERN

**Mental Model:** KPI code should be ADDITIVE (new file), not EDITING (shared SQL).

```
KPI Spec → Param Builder → SQL → Mapper → Card UI
```

## Rules

1. **Each KPI owns its SQL** — Don't share SQL between KPIs
2. **Shared logic → functions** — `build_date_bounds(filters)`, not copy-paste
3. **One param dict per query** — No mixing `:max_date` and `:max_date_exclusive`
4. **Validate placeholders** — Compare SQL `:placeholders` to `params.keys()` before execute

## Adding New KPI

```
1. Copy KPI template file
2. Define: spec, SQL, mapper
3. Run: placeholder validation + smoke test
4. Wire to UI
```

**Never:** Edit existing KPI's SQL when adding new one.

---

# 5. FILE STRUCTURE

```
backend/
├── api/
│   ├── contracts/
│   │   ├── registry.py    # Contract registry + dataclasses
│   │   ├── validate.py    # Schema validation logic
│   │   ├── normalize.py   # Param normalization adapters
│   │   ├── wrapper.py     # @api_contract decorator
│   │   └── schemas/       # Per-endpoint contracts
│   │       ├── aggregate.py
│   │       └── kpi_summary.py
│   └── middleware/
│       ├── request_id.py  # X-Request-ID injection
│       └── error_envelope.py
├── constants.py           # District/region mappings
├── api/contracts/contract_schema.py # Enums, field names
├── services/*_service.py  # Business logic + SQL
├── routes/                # Thin handlers (parse only)
└── utils/normalize.py     # to_int, to_date, coerce_to_date

frontend/src/
├── constants/index.js     # REGIONS, BEDROOM_ORDER
├── schemas/apiContract.js # Enums, isSaleType helpers
├── adapters/              # API response transformers
├── hooks/useAbortableQuery.js
├── context/PowerBIFilterContext/
└── components/powerbi/    # Chart components
```

---

# 5. ENGINEERING PRINCIPLES

1. **One Chart = One Question** — If answering 2-3 questions → split or add toggle
2. **Pure Chart + Container** — Chart renders props, Container wires data
3. **UI Components Don't Fetch** — Hooks fetch, components render
4. **Write for Deletion** — Removing feature folder should delete feature cleanly
5. **DRY at 3 Uses** — 1 use: local, 2 uses: consider, 3 uses: extract
6. **Composition > Abstraction** — Small parts, not mega-components
7. **No Import-Time Side Effects** — No fetch/DB/I/O at module top-level
8. **Never Leak Premium Data** — Backend masks for free users (CSS blur = bypass)
9. **ESLint Disables Explained** — Scoped + justification comment required
10. **Simplest Rule Wins** — When fixing bugs:
    - Prefer business intent over technical correctness
    - Avoid regex unless explicitly required
    - Do not parse display strings to infer logic
    - Ask: "What is the simplest rule that satisfies the product requirement?"

---

# 6. API RULES

## Endpoints
```
/api/aggregate      - Flexible GROUP BY (prefer this)
/api/transactions   - Paginated list
/api/filter-options - Dropdown values
```

**Rule:** Need data? Use `/api/aggregate`. Missing metric? Extend it. Don't create new endpoints.

## URL Routing
- Single source: `frontend/src/api/client.js` → `getApiBase()`
- Never raw `fetch()` with hardcoded URLs
- Prod: `/api/*` (Vercel rewrites to Render)
- Dev: `http://localhost:5000/api`

## Error Handling
- 400s: intentional, explainable, include allowed values
- 500s: never caused by user input
- Dashboard mode: prefer empty results over crashes

```python
{"error": "Invalid date format", "field": "date_from", "expected": "YYYY-MM-DD", "received": "01-01-2024"}
```

---

# 6.5 BACKEND CHANGE RULES (NON-NEGOTIABLE)

> **Reference:** `docs/BACKEND_CHART_DEPENDENCIES.md`
> **Skill:** `/backend-impact-guardrails` (MANDATORY)
> **Agent:** `fullstack-consistency-reviewer` (MANDATORY before merge)

## The 4 Questions (Ask Before Every Backend Change)

```
1. Does this break the API CONTRACT?
   → Response shape, field names, required params

2. Does this break FRONTEND RENDERING?
   → Will pages load? Will components mount?

3. Does this break VISUAL CHARTS?
   → Will charts display? Data present? No empty states?

4. Does this break CHART LOGIC/CALCULATIONS?
   → Adapters, transformations, aggregations, metrics

If YES to ANY → STOP. Fix before proceeding.
```

## Data-to-Chart Dependency Chain

```
Data Sources → Services → Routes → Endpoints → Adapters → Charts → Pages
```

**Before ANY backend change, trace this chain.**

## Mandatory Pre-Change Workflow

1. **IDENTIFY** what you're changing (data/service/route/model)
2. **CONSULT** `docs/BACKEND_CHART_DEPENDENCIES.md`
3. **MAP** dependencies: data → endpoints → charts → pages
4. **CATEGORIZE** impact: BREAKING / VALIDATION / SAFE
5. **IF BREAKING: STOP** — create migration plan first
6. **RUN** tests + manual page verification
7. **DOCUMENT** impact assessment

## Impact Categories

| Category | Action | Example |
|----------|--------|---------|
| **BREAKING** | STOP. Migration plan required. | Removing data, renaming fields |
| **VALIDATION** | Manual verification required. | Changing aggregation logic |
| **SAFE** | Document and proceed. | Adding new optional fields |

## The Resale Data Rule

The MacroOverview page depends entirely on resale transaction data.

```
Resale CSV data (removed)
    ↓
transactions table (sale_type = 'Resale')
    ↓
dashboard_service.py aggregations
    ↓
/api/aggregate, /api/kpi-summary-v2
    ↓
TimeTrendChart, KPI Cards
    ↓
MacroOverview page = BROKEN
```

**This dependency chain MUST be checked before any data removal.**

## Critical Endpoints

| Endpoint | Risk Level | Charts Affected |
|----------|------------|-----------------|
| `/api/aggregate` | CRITICAL | 10+ charts |
| `/api/kpi-summary-v2` | HIGH | All KPI cards |
| `/insights/district-psf` | HIGH | MarketStrategyMap (v1, no validation) |
| `/insights/district-liquidity` | HIGH | DistrictLiquidityMap (v1, no validation) |

## Required Tests Before Merge

```bash
# All must pass
pytest tests/test_regression_snapshots.py -v
pytest tests/test_chart_dependencies.py -v
pytest tests/test_api_invariants.py -v
```

## Manual Page Verification

ALL pages must be checked after backend changes:
- [ ] /market-overview
- [ ] /district-overview
- [ ] /new-launch-market
- [ ] /supply-inventory
- [ ] /explore
- [ ] /value-check
- [ ] /exit-risk

---

# 7. CHART.JS

```jsx
// Register ALL required: Controller + Elements + Scales
ChartJS.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
```

Checklist:
- [ ] Register controller (LineController, BarController, BubbleController)
- [ ] Register elements (PointElement, BarElement, LineElement)
- [ ] Register scales (CategoryScale, LinearScale)
- [ ] Spread `baseChartJsOptions`
- [ ] Handle 4 states: loading, error, empty, success
- [ ] Use `ChartSlot` wrapper

---

# 8. DEBUGGING 500s

1. Check server logs for exception + traceback
2. Note endpoint, query params, selected filters
3. Look for `TypeError` in `strptime`/`int`/`float` → type mismatch

**Log pattern:**
```python
except Exception as e:
    logger.error(f"GET /api/dashboard: {e}")
    logger.error(f"Params: {[(k, repr(v), type(v).__name__) for k,v in filters.items()]}")
```

**Date param test matrix:**
| Input | Expected |
|-------|----------|
| `None` | No filter |
| `"2024-01-01"` | Parsed |
| `date(2024,1,1)` | Passthrough |
| `datetime(...)` | Extract `.date()` |
| `"invalid"` | 400 (not 500) |

---

# 9. REFERENCE DATA

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

## Styling
```
Colors: #213448 (navy), #547792 (blue), #94B4C1 (sky), #EAE0CF (sand)
Regions: CCR=#213448, RCR=#547792, OCR=#94B4C1
```

---

# 10. CHECKLISTS

## Pre-Commit
- [ ] Can explain file in one sentence
- [ ] Used existing sources of truth
- [ ] No duplicated logic
- [ ] Chart handles loading/empty/error/success
- [ ] Deletable without breaking unrelated features
- [ ] No premium data leaked to DOM
- [ ] ESLint disables scoped + justified

## New Chart
- [ ] Answers ONE question
- [ ] Pure chart + container split
- [ ] Uses adapters
- [ ] Uses `useAbortableQuery`
- [ ] Uses constants (REGIONS, BEDROOM_ORDER)
- [ ] Query key includes ALL data-affecting state

## Lazy Import (React.lazy)
**CRITICAL: Import syntax must match export style. Mismatch = runtime crash.**

| Export Style | Lazy Syntax |
|--------------|-------------|
| `export default X` | `lazy(() => import('./X'))` |
| `export function X` | `lazy(() => import('./X').then(m => ({ default: m.X })))` |

- [ ] Checked target file's export style first
- [ ] Syntax matches export style
- [ ] Tested component loads in browser
- [ ] Suspense fallback provided

## Problem-Solving
1. Fix the class of problem (check parallel code paths)
2. Invariant > conditional patch
3. No hidden side effects
4. Assume messier data in future
5. If unsure → ask

## Data Correctness

Before any data/analytics change:

**Correctness:**
- [ ] Invariants computed globally before filters (Two-Phase)
- [ ] Joins use stable keys (IDs), not display names
- [ ] Aggregations are deterministic (explicit ORDER BY or tie-break rule)
- [ ] No `MODE()` or unordered `array_agg()`

**Consistency:**
- [ ] One canonical param + response shape
- [ ] Contracts reflect runtime exactly (no drift)
- [ ] Centralized canonicalization (no scattered UPPER/TRIM)

**Maintainability:**
- [ ] Static SQL with param guards (no string concatenation)
- [ ] DB does set work; Python does orchestration (no N+1 queries)
- [ ] No repeated implementations of business rules

## Backend Change Impact (MANDATORY)

Before ANY backend change affecting data or APIs:

**The 4 Questions:**
- [ ] 1. API CONTRACT — Response shape, field names, params unchanged (or updated)
- [ ] 2. FRONTEND RENDERING — All 7 pages load without React errors
- [ ] 3. VISUAL CHARTS — Charts display with data, no unexpected empty states
- [ ] 4. CHART LOGIC — Adapters, transformations, calculations still correct

**Dependency Analysis:**
- [ ] Consulted `docs/BACKEND_CHART_DEPENDENCIES.md`
- [ ] Mapped data → endpoints → charts → pages
- [ ] Categorized impact: BREAKING / VALIDATION / SAFE

**If BREAKING:**
- [ ] STOPPED — Created migration plan
- [ ] Documented which charts will break
- [ ] Got explicit approval for breaking change

**Automated Tests:**
- [ ] `pytest tests/test_regression_snapshots.py -v`
- [ ] `pytest tests/test_chart_dependencies.py -v`
- [ ] `pytest tests/test_api_invariants.py -v`

**Manual Page Verification (ALL pages):**
- [ ] /market-overview
- [ ] /district-overview
- [ ] /new-launch-market
- [ ] /supply-inventory
- [ ] /explore
- [ ] /value-check
- [ ] /exit-risk

**Sign-off:**
- [ ] No console errors on any page
- [ ] Updated `BACKEND_CHART_DEPENDENCIES.md` (if applicable)

---

# 11. TESTING & CI

## Regression Snapshot Tests
**Mission:** Catch silent correctness drift after refactors—when code "works" but numbers subtly change.

**Slices monitored:**
- Segment metrics: CCR/RCR/OCR × last 3 complete months
- District metrics: 7 districts × last quarter
  - CCR: D01 (CBD), D09 (Orchard), D10 (Tanglin)
  - RCR: D03 (Queenstown), D15 (East Coast)
  - OCR: D19 (Serangoon), D23 (Hillview)

**Tolerances:**
| Metric | Tolerance |
|--------|-----------|
| `count` | ±0 (exact) |
| `median_psf` | ±0.5% or ±$15 |
| `avg_psf` | ±0.5% or ±$15 |
| `total_value` | ±0.5% |

**Run tests:**
```bash
cd backend && pytest tests/test_regression_snapshots.py -v
```

**Update snapshots** (after intentional changes only):
```bash
pytest tests/test_regression_snapshots.py --update-snapshots
```

**Root cause categories for failures:**
- `BOUNDARY_CHANGE`: Date filter inclusive/exclusive flip
- `FILTER_DRIFT`: Segment/district mapping changed
- `METRIC_DRIFT`: Calculation method changed (median→avg)
- `OUTLIER_CHANGE`: Outlier exclusion rule modified

## CI Workflow
**File:** `.github/workflows/backend-tests.yml`

Triggers on push/PR to `main` when `backend/**` changes:
1. Runs unit tests (no DB required)
2. Runs regression snapshot tests (requires `DATABASE_URL` secret)

**GitHub Secrets required:**
- `DATABASE_URL`: PostgreSQL connection string for regression tests

## Files
```
backend/tests/
├── conftest.py                      # --update-snapshots flag
├── test_regression_snapshots.py     # Regression tests
└── snapshots/regression/
    ├── segment_metrics.json         # CCR/RCR/OCR golden data
    ├── district_metrics.json        # D09/D10/D15 golden data
    └── README.md

.claude/agents/
└── regression-snapshot-guard.md     # Agent definition
```

---

# 12. UI/LAYOUT REFACTORING (NON-NEGOTIABLE)

Your primary responsibility is to preserve architectural integrity while making UI or layout changes.

## Core Rule (Mandatory)

**UI changes must NEVER introduce new logic.**

If behavior already exists, it must be:
- Reused
- Wrapped
- Reorganized

**Never recreated. Never duplicated.**

## Single Source of Truth (SSOT)

There must be exactly ONE owner of:
- Business logic
- State
- Filtering behavior
- Data transformations

**You must NOT:**
- Reimplement logic in a new component
- Duplicate state
- Recreate hooks that already exist

**You must:**
- Reuse existing hooks and context
- Pass logic down via props
- Wrap logic with layout components only

## Layout ≠ Logic

UI changes are presentation-only.

| Allowed | Forbidden |
|---------|-----------|
| Changing layout (vertical → horizontal) | Adding state |
| Changing spacing or grouping | Rewriting logic |
| Changing component structure | Altering behavior |
| Changing visual hierarchy | Changing data flow |

**If behavior changes → the refactor is invalid.**

## Composition Over Duplication

```jsx
// ❌ Never do this
Sidebar (logic + UI)
ControlBarFilters (logic + UI)

// ✅ Always do this
FilterLogic (hooks, rules)
 ├── SidebarLayout
 └── HorizontalLayout
```

If two components behave the same → they must share logic.

## UI Is Not a Feature

| Features | UI |
|----------|-----|
| Own logic | Displays state |
| Define behavior | Triggers events |
| Enforce rules | Never owns logic |

## Invariant Preservation

The following must NEVER change during UI refactors:
- Filter semantics
- Date normalization
- Selection logic
- Reset behavior
- Default values
- Data mappings

**If any invariant changes → the change is invalid.**

## Layout-Only Changes Must Be Diff-Light

If a change is truly layout-only:
- No new hooks
- No new logic files
- No duplicated state
- Minimal diffs

**Large diffs = architecture violation.**

## No Parallel Implementations

**Forbidden:**
- `DesktopFilters` + `MobileFilters` with separate logic
- `Sidebar` + `ControlBar` with duplicated behavior
- "Temporary" rewritten logic

All layouts must share the same logic layer.

## Mobile/Responsive UI

Mobile UI:
- Uses same context
- Uses same state
- Uses same handlers
- Only presentation changes

## Pre-Change Checklist

Before submitting UI/layout changes:
- [ ] No new logic added
- [ ] No duplicated state
- [ ] Existing hooks reused
- [ ] Behavior unchanged
- [ ] Layout-only modification
- [ ] Single source of truth preserved

**If any box fails → stop.**

## Absolute Rule

> This is a layout-only refactor. Do not create new logic, state, or behavior. Reuse existing logic exactly as-is.

**If this rule is violated, the change must be reverted.**

## Before Making Any Change

**Check all claude.md rules and existing UI templates before making changes.**

Do not duplicate or reimplement logic or layouts.

- Every page must use the same shared template/component
- If a change does not appear on a page, the issue is a **broken reference** — not a missing implementation
- **Your task is to fix the wiring, not rewrite the UI**

## Engineering Philosophy

```
Logic is permanent
UI is disposable
Duplication is a bug
Reuse is mandatory
Behavior must be stable
Layout must be flexible
```
