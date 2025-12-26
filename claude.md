# Singapore Property Analyzer - Project Guide

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Core Principles](#2-core-principles)
   - [Problem-Solving Rules](#problem-solving-rules-mandatory)
   - [Power BI Golden Rules](#power-bi-golden-rules)
   - [API Contract & Architecture Rules](#api-contract--architecture-rules-mandatory)
   - [SQL Best Practices](#sql-best-practices-mandatory)
   - [Contract & Async Safety](#contract--async-safety-mandatory)
3. [Architecture](#3-architecture)
4. [Implementation Guides](#4-implementation-guides)
5. [Styling Guide](#5-styling-guide)
6. [Reference Appendix](#6-reference-appendix)

## Related Documentation

All documentation has been consolidated into `/docs`:

| Document | Purpose |
|----------|---------|
| [docs/README.md](./docs/README.md) | Overview, quick links |
| [docs/architecture.md](./docs/architecture.md) | System design, data flow |
| [docs/backend.md](./docs/backend.md) | APIs, SQL rules, services |
| [docs/frontend.md](./docs/frontend.md) | UI, charts, adapters, async safety |
| [docs/data-model.md](./docs/data-model.md) | Metrics, bands, formulas |
| [docs/access-control.md](./docs/access-control.md) | Tiers, paywall, compliance |
| [docs/decisions.md](./docs/decisions.md) | Design decisions, roadmap |
| [docs/glossary.md](./docs/glossary.md) | Terms, acronyms |

---

# 1. QUICK START

## Project Overview

A Power BI-style analytics dashboard for Singapore condo resale transactions.

| Layer | Stack |
|-------|-------|
| **Frontend** | React + Vite + Tailwind CSS + Chart.js |
| **Backend** | Flask + SQLAlchemy + PostgreSQL |
| **Hosting** | Render (512MB memory constraint) |

## Critical Constraints

### Memory Limit: 512MB RAM

**All design decisions flow from this constraint:**

| Pattern | Why |
|---------|-----|
| No in-memory DataFrames | SQL aggregation only |
| Server-side histogram | Bins computed in SQL |
| Paginated transactions | Never load 100K+ records |
| Pre-computed stats | Heavy aggregations cached in `precomputed_stats` table |

### Outlier Exclusion (MANDATORY)

> **Every query touching `transactions` MUST include `WHERE is_outlier = false`**

```python
# ❌ BAD - Includes $890M outliers
query = db.session.query(func.count(Transaction.id)).all()

# ✅ GOOD
query = db.session.query(func.count(Transaction.id)).filter(
    Transaction.is_outlier == False
).all()
```

## Quick Reference Cards

### Card 1: Adding a New Chart

```
1. Create component in frontend/src/components/powerbi/
2. Import usePowerBIFilters() from context
3. Use buildApiParams() for ALL API calls
4. Add highlight to useEffect dependencies (unless time-series)
5. If X-axis is TIME → use excludeHighlight: true
```

### Card 2: Filter Hierarchy

```
Global Slicers (sidebar)     → Apply to ALL charts
    ↓
Cross-Filters (chart clicks) → Apply to ALL charts
    ↓
Fact Filters (price bins)    → Apply to Transaction Table ONLY
```

### Card 3: Drill vs Cross-Filter

```
DRILL = Visual-local (only that chart changes)
CROSS-FILTER = Dashboard-wide (all charts update)

Time click    → Cross-filter (updates all)
Location click → Cross-filter (updates all)
Drill up/down → Local only (one chart)
```

### Card 3.1: Drill Implementation Rule (MANDATORY)

```
EACH CHART MUST HAVE ITS OWN LOCAL DRILL STATE

❌ WRONG - Global drill (charts share state):
  <DrillButtons hierarchyType="time" />
  → Multiple charts change together when drilling

✅ CORRECT - Local drill (each chart independent):
  const [localDrillLevel, setLocalDrillLevel] = useState('year');
  <DrillButtons
    localLevel={localDrillLevel}
    localLevels={LOCAL_TIME_LEVELS}
    localLevelLabels={LOCAL_TIME_LABELS}
    onLocalDrillUp={handleLocalDrillUp}
    onLocalDrillDown={handleLocalDrillDown}
  />
  → Only this chart changes when drilling
```

### Card 4: Time-Series Chart Rule

```
If X-axis = TIME (year/quarter/month):
  → Use excludeHighlight: true
  → Chart shows full timeline, visual highlight only

If X-axis = CATEGORY (district/bedroom/price):
  → Use excludeHighlight: false (default)
  → Chart filters to highlighted period
```

### Card 5: Table Sorting (MANDATORY)

```
ALL TABLES MUST HAVE SORTABLE COLUMNS

Required implementation:
1. sortConfig state: { column: 'default', order: 'desc' }
2. handleSort(column) function to toggle sort
3. SortIcon component showing sort direction
4. Clickable headers with hover:bg-slate-100 cursor-pointer

Header pattern:
<th onClick={() => handleSort('col')} className="cursor-pointer hover:bg-slate-100 select-none">
  <div className="flex items-center gap-1">
    <span>Label</span>
    <SortIcon column="col" />
  </div>
</th>

Full pattern: See dashboard-design skill → Data Tables section
```

### Card 6: SQL Best Practices (MANDATORY)

```
SQL CHECKLIST (Before Any Query)

[ ] Uses :param style only (no %(param)s)
[ ] Date params are Python date/datetime objects
[ ] Enums use api_contract.py methods
[ ] Outlier filter uses COALESCE(is_outlier, false) = false
[ ] Numeric values are parameterized
[ ] SQL lives in service file, not route
[ ] v2 endpoint returns camelCase
[ ] Tests cover v1, v2, and edge cases

Full reference: See SQL_BEST_PRACTICES.md
```

### Card 7: Async Data Fetching (MANDATORY)

```
ASYNC SAFETY CHECKLIST (For Any API Call)

[ ] Uses useAbortableQuery OR useStaleRequestGuard
[ ] Signal passed to all API calls: signal: getSignal()
[ ] Stale check before setState: if (isStale(requestId)) return
[ ] AbortError/CanceledError ignored (not treated as error)
[ ] Chart data goes through adapter (transformTimeSeries, etc.)
[ ] Adapter validates API version: assertKnownVersion(response)

Pattern for simple cases (useAbortableQuery):
  const { data, loading, error } = useAbortableQuery(
    (signal) => apiClient.get('/api/data', { signal }),
    [filterKey]
  );

Pattern for complex cases (useStaleRequestGuard):
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const requestId = startRequest();
  const signal = getSignal();
  // ... fetch with signal ...
  if (isStale(requestId)) return;

Audit: Run `bash scripts/audit-async-safety.sh` to check all files
```

### Card 8: Contract & Adapter Pattern (MANDATORY)

```
CONTRACT & ADAPTER CHECKLIST (For Any Data Display)

Enum Safety:
[ ] Enums from schemas/apiContract.js only
[ ] Uses isSaleType.newSale() not === 'New Sale'
[ ] No hardcoded enum strings in components

Adapter Pattern:
[ ] API response passes through adapter
[ ] Component never accesses response.data directly
[ ] Adapter normalizes v1/v2/v3 responses
[ ] Adapter calls assertKnownVersion()

Layer Rule:
  Database → API → Contract → Adapter → Chart

  If logic leaks across layers → STOP → Add adapter/helper

Forbidden in Components:
  response.data.map(...)           // Use adapter
  row.sale_type === 'New Sale'     // Use isSaleType
  row.quarter ?? row.month         // Adapter handles this

Full reference: See CONTRACT_ASYNC_SAFETY.md
```

### Card 9: Hook Migration Checklist (MANDATORY)

```
HOOK MIGRATION CHECKLIST (When Refactoring to useAbortableQuery)

Before PR:
[ ] Delete old useState flags: updating, setUpdating, isLoading, setLoading
[ ] Search file for leftover references: grep -E "updating|setUpdating|isUpdating"
[ ] Verify render uses 'loading' from useAbortableQuery (not old flags)
[ ] Run npm run lint:ci locally (catches undefined variable errors)
[ ] Run npm run build locally (catches import/export issues)

Common Mistakes:
❌ Leftover `updating` in className conditionals
❌ Leftover `{updating && <Spinner />}` in JSX
❌ Old loading state that conflicts with hook's loading

After Migration:
  // OLD PATTERN (delete all of this):
  const [updating, setUpdating] = useState(false);
  setUpdating(true); ... setUpdating(false);
  className={`... ${updating ? 'opacity-70' : ''}`}

  // NEW PATTERN (useAbortableQuery handles everything):
  const { data, loading, error } = useAbortableQuery(...);
  if (loading) return <Loader />;
  if (error) return <Error />;

CI Scripts:
  npm run lint:ci      # Fails on errors (catches undefined 'updating')
  npm run lint:strict  # Fails on any warning (use when ready)
  npm run build        # Fails on broken imports
  npm run typecheck    # Catches type mismatches (optional, noisy)
```

---

# 2. CORE PRINCIPLES

## Problem-Solving Rules (MANDATORY)

When diagnosing or fixing any issue, Claude MUST follow these rules:

### 1. Fix the class of problem, not just the symptom
- Do not patch a single line without checking whether the same logic exists elsewhere
- Assume similar bugs may exist in other files, layers, or execution paths

### 2. Always ask: "Where else could this fail?"
- Before implementing a fix, scan for duplicate logic, repeated assumptions, parallel code paths
- If the fix applies in multiple places, refactor or centralize it

### 3. Prefer invariant enforcement over conditional patches
- Add guardrails, assertions, or validations that prevent invalid states
- Do not rely on "this probably won't happen again"

### 4. Avoid non-deterministic behavior
- A fix must produce the same result on every run
- Startup behavior, background tasks, or repeated executions must not change outcomes

### 5. No hidden side effects
- Fixes must not silently mutate data, state, or configuration unless explicitly requested
- If a fix changes behavior outside the immediate issue, state it clearly

### 6. Think in terms of lifecycle, not moment
- Consider: first run, re-run, restart, future data, future contributors
- A fix that only works "right now" is incomplete

### 7. Default to future safety
- Assume future features will reuse this logic
- Assume future data will be messier than today's
- Fixes should degrade safely, not catastrophically

### 8. Explain tradeoffs explicitly
- If a fix is chosen because it's simpler, faster, or temporary, say so
- Never hide limitations

### 9. If unsure, stop and ask
- If a change might affect unrelated behavior, ask before proceeding

### 10. Optimize for correctness first, elegance second
- Correct, boring, explicit code is preferred over clever shortcuts

---

## Power BI Golden Rules

> **Full documentation**: See [POWER_BI_PATTERNS.md](./POWER_BI_PATTERNS.md) for complete filter system reference.

**Key principles (quick reference):**

1. **Data Model Rule**: Slicers belong to dimensions. Facts should almost never be slicers.
2. **Interaction Rule**: "What happened when/where" → Cross-filter. "What portion" → Highlight.
3. **Drill Rule**: Drill ≠ Filter. Drill is visual-local by default.
4. **Drill Locality Rule**: Each chart MUST have its own local drill state. NEVER use `hierarchyType` prop for DrillButtons - always use local mode with `localLevel`, `onLocalDrillUp`, `onLocalDrillDown`.
5. **Global Filter Rule**: All sidebar slicers MUST apply to every visual. No exceptions.
6. **Time-Series Rule**: Time-axis charts use `excludeHighlight: true` to show full timeline.

```jsx
// ✅ CORRECT - Always use buildApiParams
const params = buildApiParams({ group_by: 'quarter' });

// ❌ WRONG - Ignoring global filters
const params = { region: localRegion }; // DON'T DO THIS
```

---

## API Contract & Architecture Rules (MANDATORY)

> **Key Principle**: DB stores data. API contract defines meaning. Frontend consumes meaning—nothing else.

### 1. Boundary Normalization (MANDATORY)

All naming/enum/value normalization must live in:
- **Backend**: `backend/schemas/api_contract.py`
- **Frontend**: `frontend/src/schemas/apiContract.js`

| Do | Don't |
|----|-------|
| Call contract methods in routes | Translate enums in routes/services |
| Use `SaleType.from_db()` | Write `if sale_type == 'New Sale':` |

### 2. Frontend Contract Consumption

Frontend must NEVER:
- Hardcode DB values (`'Resale'`, `'New Sale'`)
- Rely on snake_case fields directly

Frontend MUST:
- Import enums/helpers from `frontend/src/schemas/apiContract.js`
- Use `SaleType`, `isSaleType`, `getTxnField`, `getAggField`, etc.

```javascript
// ✅ CORRECT
import { SaleType, isSaleType, getTxnField } from '../schemas/apiContract';
const isNew = isSaleType.newSale(row.saleType);

// ❌ WRONG
if (row.sale_type === 'New Sale') { ... }
```

### 3. Dual-Mode Migration Rule

**Default API response**: Must remain backward compatible (old + new fields)

**`?schema=v2`**: Must be strict
- camelCase only
- Enums only (no DB strings)
- No partial v2 responses

### 4. Incremental Changes Only

One PR = one concern:

| PR Type | Contains |
|---------|----------|
| Schema/contract | Enum additions, field mappings |
| Frontend migration | Component updates to use contract |
| Performance | Query optimization, caching |

Do NOT mix business logic changes with contract refactors.

### 5. Route Responsibilities

| Routes MAY | Routes may NOT |
|------------|----------------|
| Parse params | Translate enums manually |
| Call `parse_filter_params()` | Know DB string values |
| Pass canonical values downstream | Implement if/elif mappings |

### 6. Testing Is Non-Optional

Every migrated endpoint must include:

**Contract tests:**
- Old + new fields present (default mode)
- Strict v2 shape when `?schema=v2`
- Enum validation

**Integration test:**
- Confirms no data loss (row counts unchanged)

### 7. Performance Work Isolation

Performance optimizations must be:
- Behavior-preserving
- In separate PRs

Do NOT combine with schema/contract work.

### 8. Endgame Rule

Dual-mode is temporary:
- Add TODOs with Phase 1c cleanup plan
- Legacy fields removed only after frontend migration completes

---

## SQL Best Practices (MANDATORY)

> **Full documentation**: See [SQL_BEST_PRACTICES.md](./SQL_BEST_PRACTICES.md) for complete SQL guardrails reference.

**Key rules (quick reference):**

1. **Parameter Style**: Use `:param` bind parameters ONLY. Never use `%(param)s` or f-string interpolation.
2. **Date Handling**: Pass Python `date`/`datetime` objects, not strings.
3. **Enum Normalization**: Always use `api_contract.py` methods (`SaleType.to_db()`).
4. **Outlier Filter**: Use `COALESCE(is_outlier, false) = false` consistently.
5. **SQL Location**: Queries in `services/`, not routes. Pure logic in `*_compute.py`.
6. **v2 Compliance**: New endpoints must support `?schema=v2`.

```python
# ✅ CORRECT - Parameterized query with proper types
from datetime import date
from schemas.api_contract import SaleType

query = text("""
    SELECT project, COUNT(*) as count
    FROM transactions
    WHERE COALESCE(is_outlier, false) = false
      AND sale_type = :sale_type
      AND transaction_date >= :date_from
""")

params = {
    "sale_type": SaleType.to_db(SaleType.RESALE),
    "date_from": date(2023, 1, 1),  # Python date, not string
}

# ❌ WRONG - Mixed styles, string dates, hardcoded enums
query = f"WHERE psf > {min_psf} AND sale_type = %(sale_type)s"
params = {"sale_type": "Resale", "date_from": "2024-01-01"}
```

---

## Contract & Async Safety (MANDATORY)

> **Full documentation**: See [CONTRACT_ASYNC_SAFETY.md](./CONTRACT_ASYNC_SAFETY.md) for complete frontend guardrails reference.

**Key rules (quick reference):**

1. **No Hardcoded Enums**: Use `apiContract.js` helpers (`isSaleType.newSale()`), never raw strings.
2. **Adapter Pattern**: All API responses pass through adapters before reaching components.
3. **Async Safety**: Use `useAbortableQuery` or `useStaleRequestGuard` for all data fetching.
4. **Abort Handling**: `AbortError`/`CanceledError` must be silently ignored (never shown as errors).
5. **Stale Prevention**: Always check `isStale(requestId)` before `setState`.
6. **Version Validation**: Adapters must call `assertKnownVersion(response)`.

```javascript
// ✅ CORRECT - Adapter pattern with abort safety
import { useAbortableQuery } from '../hooks/useAbortableQuery';
import { transformTimeSeries } from '../adapters/aggregateAdapter';
import { isSaleType } from '../schemas/apiContract';

const { data, loading, error } = useAbortableQuery(
  (signal) => apiClient.get('/api/data', { signal })
    .then(r => transformTimeSeries(r.data)),
  [filterKey]
);

// Using enums safely
const isNew = isSaleType.newSale(row.saleType);

// ❌ WRONG - Direct API access, hardcoded enums
const data = response.data.map(...);  // No adapter!
if (row.sale_type === 'New Sale') { ... }  // Hardcoded string!
```

---

# 3. ARCHITECTURE

## Data Flow Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA PIPELINE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  URA API ──▶ scripts/upload.py ──▶ PostgreSQL                       │
│                    │                                                 │
│                    ├── Remove invalid records (null/zero)            │
│                    ├── Remove duplicates (project+date+price+area)   │
│                    └── Mark outliers (area>10K sqft OR IQR bounds)   │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Startup ──▶ data_validation.run_validation_report() (READ-ONLY)    │
│          ──▶ data_computation.recompute_all_stats()                  │
│                    │                                                 │
│                    └── precomputed_stats table (cached aggregations) │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  API Layer (routes/analytics.py)                                     │
│       │                                                              │
│       ├── /api/dashboard ──▶ dashboard_service.py (SQL aggregation)  │
│       ├── /api/aggregate ──▶ SQL GROUP BY queries                    │
│       ├── /api/transactions ──▶ Paginated list                       │
│       └── /api/filter-options ──▶ Available filter values            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Frontend State Management

> **Full filter state documentation**: See [POWER_BI_PATTERNS.md](./POWER_BI_PATTERNS.md#3-filter-types--hierarchy)

```
PowerBIFilterContext.jsx
├── filters (sidebar slicers) → dateRange, districts, bedroomTypes, segment, saleType
├── crossFilter (chart clicks) → district, region, bedroom, sale_type
├── factFilter (price bins → fact table only) → priceRange
├── highlight (time emphasis) → year, quarter, month
├── drillPath (hierarchy level) → time: year→quarter→month, location: region→district
└── selectedProject (drill-through only, independent queries)

buildApiParams(additionalParams, options)
├── options.includeFactFilter = true (for Fact tables)
└── options.excludeHighlight = true (for Time-series charts)
```

## File Structure

### Backend (`/backend`)

```
backend/
├── app.py                    # Flask app factory, startup validation
├── config.py                 # Configuration (DATABASE_URL, etc.)
├── models/
│   ├── database.py           # SQLAlchemy db instance
│   └── transaction.py        # Transaction model
├── routes/
│   ├── analytics.py          # Public API endpoints
│   ├── auth.py               # JWT authentication
│   └── ads.py                # Ad serving
├── schemas/
│   └── api_contract.py       # v2 API schema: enums, field names, serializers
└── services/
    ├── dashboard_service.py  # Dashboard panel queries (SQL aggregation)
    ├── data_validation.py    # Data cleaning (outliers, duplicates, invalid)
    ├── data_computation.py   # Pre-compute stats to precomputed_stats table
    ├── analytics_reader.py   # Read pre-computed stats
    ├── price_bands_service.py    # Downside protection analysis (SQL + fallback)
    ├── price_bands_compute.py    # Pure computation functions (testable)
    └── exit_queue_service.py     # Exit queue risk analysis
```

### Frontend (`/frontend/src`)

```
frontend/src/
├── api/
│   └── client.js             # Axios API client
├── context/
│   ├── DataContext.jsx       # Global data/metadata context
│   └── PowerBIFilterContext.jsx  # Filter state management
├── components/powerbi/
│   ├── PowerBIFilterSidebar.jsx  # Dimension slicers
│   ├── TimeTrendChart.jsx        # Time dimension (excludeHighlight: true)
│   ├── VolumeByLocationChart.jsx # Location dimension (cross-filter)
│   ├── PriceDistributionChart.jsx # Price dimension (fact-only filter)
│   ├── TransactionDataTable.jsx  # Fact table (data sink)
│   ├── DrillButtons.jsx          # Drill up/down controls
│   ├── DrillBreadcrumb.jsx       # Navigation breadcrumbs
│   └── ProjectDetailPanel.jsx    # Project drill-through
└── pages/
    └── MacroOverview.jsx         # Main dashboard page
```

---

# 4. IMPLEMENTATION GUIDES

> **Complete implementation patterns**: See [POWER_BI_PATTERNS.md](./POWER_BI_PATTERNS.md#5-implementation-patterns) for full details.

## Guide: Adding a New Chart

### Step 1: Create the Component

```jsx
// frontend/src/components/powerbi/MyNewChart.jsx
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useState, useEffect } from 'react';
import apiClient from '../../api/client';

export default function MyNewChart() {
  const { buildApiParams, filters, highlight } = usePowerBIFilters();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // CRITICAL: Always use buildApiParams for global filter compliance
        const params = buildApiParams({
          group_by: 'your_grouping',
          metrics: 'count,median_psf'
        });

        const response = await apiClient.get('/api/aggregate', { params });
        setData(response.data);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [buildApiParams, filters, highlight]); // Include highlight if chart should respond

  return (/* your chart JSX */);
}
```

### Step 2: Determine Chart Type

| Question | If YES | If NO |
|----------|--------|-------|
| Is X-axis TIME? | `excludeHighlight: true` | Default behavior |
| Should clicks filter other charts? | Add cross-filter handler | Local state only |
| Is this a Fact table? | `includeFactFilter: true` | Default behavior |

### Step 3: For Time-Series Charts

```jsx
// Time-series charts preserve full timeline when highlight is active
const params = buildApiParams(
  { group_by: 'month' },
  { excludeHighlight: true }  // ← ADD THIS
);

// Remove highlight from useEffect dependencies
useEffect(() => {
  fetchData();
}, [buildApiParams, filters]); // ← NO highlight
```

### Step 4: For Cross-Filtering Charts

```jsx
const { applyCrossFilter } = usePowerBIFilters();

const handleBarClick = (clickedValue) => {
  applyCrossFilter('location', 'district', clickedValue);
};
```

### Step 5: Add to Dashboard

```jsx
// pages/MacroOverview.jsx
import MyNewChart from '../components/powerbi/MyNewChart';

// Add to layout grid
<div className="col-span-6">
  <MyNewChart />
</div>
```

---

## Guide: Adding a New Filter

### Step 1: Add State to Context

```jsx
// context/PowerBIFilterContext.jsx
const [filters, setFilters] = useState({
  // ... existing filters
  myNewFilter: null,  // ← ADD
});
```

### Step 2: Update buildApiParams

```jsx
const buildApiParams = useCallback((additionalParams = {}, options = {}) => {
  const params = { ...additionalParams };

  // ... existing params

  if (filters.myNewFilter) {
    params.my_new_filter = filters.myNewFilter;  // ← ADD
  }

  return params;
}, [filters, /* dependencies */]);
```

### Step 3: Add Backend Support

```python
# routes/analytics.py
@analytics_bp.route("/api/aggregate")
def aggregate():
    my_new_filter = request.args.get('my_new_filter')

    if my_new_filter:
        query = query.filter(Transaction.some_column == my_new_filter)
```

### Step 4: Add UI Control

```jsx
// components/powerbi/PowerBIFilterSidebar.jsx
<FilterControl
  label="My New Filter"
  value={filters.myNewFilter}
  onChange={(val) => updateFilter('myNewFilter', val)}
  options={filterOptions.myNewFilterOptions}
/>
```

---

## Guide: Adding a New API Endpoint

### Step 1: Create the Route

```python
# routes/analytics.py
@analytics_bp.route("/api/my-endpoint")
def my_endpoint():
    # 1. Get filter parameters
    district = request.args.get('district')
    date_from = request.args.get('date_from')

    # 2. Build query with MANDATORY outlier exclusion
    query = db.session.query(
        Transaction.district,
        func.count(Transaction.id)
    ).filter(
        Transaction.is_outlier == False  # ← MANDATORY
    )

    # 3. Apply filters
    if district:
        query = query.filter(Transaction.district == district)

    # 4. Return JSON
    return jsonify({"data": [...]})
```

### Step 2: Memory-Safe Patterns

```python
# ✅ GOOD - SQL aggregation (no memory spike)
result = db.session.execute(text("""
    SELECT district, COUNT(*), AVG(psf)
    FROM transactions
    WHERE is_outlier = false
    GROUP BY district
""")).fetchall()

# ❌ BAD - Loading all records into memory
df = pd.DataFrame([t.__dict__ for t in Transaction.query.all()])
```

### Step 3: Add Frontend Client

```jsx
// api/client.js or in component
export const fetchMyEndpoint = async (params) => {
  const response = await apiClient.get('/api/my-endpoint', { params });
  return response.data;
};
```

---

## Guide: Drill Button Implementation

### Using Standard DrillButtons Component (LOCAL MODE REQUIRED)

> **MANDATORY**: Always use LOCAL MODE for drill buttons. Each chart must manage its own drill state independently. Global mode (`hierarchyType` prop) causes multiple charts to drill together, violating the Power BI principle that "Drill = Visual-local".

```jsx
import { DrillButtons } from './DrillButtons';

// ✅ CORRECT - LOCAL MODE (each chart has independent drill state)
// Step 1: Add local state to your chart component
const [localDrillLevel, setLocalDrillLevel] = useState('year');
const LOCAL_TIME_LEVELS = ['year', 'quarter', 'month'];
const LOCAL_TIME_LABELS = { year: 'Year', quarter: 'Quarter', month: 'Month' };

const handleLocalDrillUp = () => {
  const currentIndex = LOCAL_TIME_LEVELS.indexOf(localDrillLevel);
  if (currentIndex > 0) {
    setLocalDrillLevel(LOCAL_TIME_LEVELS[currentIndex - 1]);
  }
};

const handleLocalDrillDown = () => {
  const currentIndex = LOCAL_TIME_LEVELS.indexOf(localDrillLevel);
  if (currentIndex < LOCAL_TIME_LEVELS.length - 1) {
    setLocalDrillLevel(LOCAL_TIME_LEVELS[currentIndex + 1]);
  }
};

// Step 2: Use local mode props
<DrillButtons
  localLevel={localDrillLevel}
  localLevels={LOCAL_TIME_LEVELS}
  localLevelLabels={LOCAL_TIME_LABELS}
  onLocalDrillUp={handleLocalDrillUp}
  onLocalDrillDown={handleLocalDrillDown}
/>

// Step 3: Use localDrillLevel in your API call (not drillPath.time)
const params = buildApiParams({
  group_by: `${localDrillLevel},sale_type`,
  metrics: 'count,median_psf'
}, { excludeHighlight: true });

// ❌ WRONG - NEVER use global mode (causes multiple charts to drill together)
<DrillButtons hierarchyType="time" />  // DON'T DO THIS
```

### Button State at Boundaries

| Level | Up (↑) | Down (↓) |
|-------|--------|----------|
| Year (highest) | Disabled | Enabled |
| Quarter | Enabled | Enabled |
| Month (lowest) | Enabled | Disabled |
| Region (highest) | Disabled | Enabled |
| District (lowest) | Enabled | Disabled |

### Project is NOT in Global Hierarchy

```jsx
// Project selection opens detail panel, does NOT filter other charts
const handleProjectClick = (projectName, district) => {
  setSelectedProject({ name: projectName, district });
  // Opens ProjectDetailPanel with independent API queries
};
```

---

# 5. STYLING GUIDE

## Color Palette

**Source**: https://colorhunt.co/palette/21344854779294b4c1eae0cf

| Color | Hex | Usage |
|-------|-----|-------|
| **Deep Navy** | `#213448` | Headings, primary text, CCR region |
| **Ocean Blue** | `#547792` | Secondary text, labels, RCR region |
| **Sky Blue** | `#94B4C1` | Borders, icons, OCR region, disabled |
| **Sand/Cream** | `#EAE0CF` | Backgrounds, hover states, footers |

## Tailwind Patterns

```jsx
// Headings
className="text-[#213448]"

// Secondary text
className="text-[#547792]"

// Borders
className="border-[#94B4C1]/50"

// Subtle background
className="bg-[#EAE0CF]/30"

// Card
className="bg-white rounded-lg border border-[#94B4C1]/50"

// Footer bar
className="bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30"

// Disabled state
className="bg-[#EAE0CF]/50 text-[#94B4C1] cursor-not-allowed"

// Enabled button
className="bg-white border border-[#94B4C1] hover:bg-[#EAE0CF] text-[#547792]"
```

## Chart Colors

### Region Colors

```javascript
const regionColors = {
  CCR: 'rgba(33, 52, 72, 0.8)',   // #213448 - Deep Navy
  RCR: 'rgba(84, 119, 146, 0.8)', // #547792 - Ocean Blue
  OCR: 'rgba(148, 180, 193, 0.8)' // #94B4C1 - Sky Blue
};
```

### Bedroom Colors

```javascript
const bedroomColors = {
  1: 'rgba(247, 190, 129, 0.9)', // Light orange
  2: 'rgba(79, 129, 189, 0.9)',  // Blue
  3: 'rgba(40, 82, 122, 0.9)',   // Dark blue
  4: 'rgba(17, 43, 60, 0.9)',    // Darkest navy
  5: 'rgba(155, 187, 89, 0.9)',  // Green
};
```

---

# 6. REFERENCE APPENDIX

## A. District to Region Mapping (SINGLE SOURCE OF TRUTH)

> **CRITICAL: These mappings are centralized. NEVER duplicate them in code.**
>
> - **Backend**: Import from `backend/constants.py`
> - **Frontend**: Import from `frontend/src/constants/index.js`

### The Authoritative Mapping

| Region | Districts | Description |
|--------|-----------|-------------|
| **CCR** | D01, D02, D06, D07, D09, D10, D11 | Core Central Region (Premium) |
| **RCR** | D03, D04, D05, D08, D12, D13, D14, D15, D20 | Rest of Central Region (City fringe) |
| **OCR** | D16, D17, D18, D19, D21, D22, D23, D24, D25, D26, D27, D28 | Outside Central Region (Suburban) |

### Backend Usage

```python
# backend/constants.py - SINGLE SOURCE OF TRUTH
from constants import (
    CCR_DISTRICTS,           # ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11']
    RCR_DISTRICTS,           # ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
    OCR_DISTRICTS,           # ['D16', ..., 'D28']
    get_region_for_district, # 'D07' → 'CCR'
    get_districts_for_region # 'CCR' → ['D01', 'D02', ...]
)

# Example: Get region for a district
region = get_region_for_district('D07')  # Returns 'CCR'

# Example: Get all districts for a region
districts = get_districts_for_region('RCR')  # Returns ['D03', 'D04', ...]
```

### Frontend Usage

```javascript
// frontend/src/constants/index.js - SINGLE SOURCE OF TRUTH
import {
  CCR_DISTRICTS,
  RCR_DISTRICTS,
  OCR_DISTRICTS,
  getRegionForDistrict,
  getDistrictsForRegion,
  isDistrictInRegion
} from '../constants';

// Example: Check if district is in region
const isCCR = isDistrictInRegion('D07', 'CCR');  // true

// Example: Get region for district
const region = getRegionForDistrict('D15');  // 'RCR'

// Example: Filter districts by region
const ccrDistricts = getDistrictsForRegion('CCR');
```

### Anti-Patterns (DO NOT DO THIS)

```python
# ❌ BAD - Hardcoded mappings that can become stale
if district in ['D01', 'D02', 'D06', 'D09', 'D10', 'D11']:  # Missing D07!
    region = 'CCR'

# ❌ BAD - SQL CASE statements with hardcoded values
CASE
  WHEN district IN ('D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11') THEN 'CCR'
  -- This can drift from the source of truth
END

# ✅ GOOD - Use centralized constants
from constants import get_region_for_district
region = get_region_for_district(district)
```

### Files Using Centralized Constants

| File | Usage |
|------|-------|
| `backend/constants.py` | **SOURCE OF TRUTH** - definitions |
| `backend/routes/analytics.py` | Imports for SQL CASE statements |
| `backend/services/dashboard_service.py` | Imports for aggregation |
| `backend/services/data_processor.py` | Imports for data processing |
| `backend/models/project_location.py` | Imports for model methods |
| `frontend/src/constants/index.js` | **SOURCE OF TRUTH** - frontend |
| `frontend/src/components/ValueParityPanel.jsx` | Imports for filtering |

## B. Bedroom Classification

| Count | Category |
|-------|----------|
| 1 | 1-Bedroom |
| 2 | 2-Bedroom |
| 3 | 3-Bedroom |
| 4 | 4-Bedroom |
| 5+ | 5+ Bedroom / Penthouse |

## C. Component Architecture Matrix

> **Full matrix with interaction details**: See [POWER_BI_PATTERNS.md](./POWER_BI_PATTERNS.md#4-component-behavior-matrix)

| Component | Type | Cross-Filters? | Notes |
|-----------|------|----------------|-------|
| PowerBIFilterSidebar | Slicer | Yes (global) | Source of global filters |
| TimeTrendChart | Dimension | Yes | `excludeHighlight: true` |
| VolumeByLocationChart | Dimension | Yes | Region/district cross-filter |
| PriceDistributionChart | Dimension | Fact-only | Sets factFilter.priceRange |
| TransactionDataTable | **Fact** | **Never** | Pure data sink |

## D. Outlier Detection Details

### Two-Stage Detection (in upload.py)

**Stage 1: En-bloc/Collective Sales (Area-based)**
```python
EN_BLOC_AREA_THRESHOLD = 10000  # sqft
# Units > 10,000 sqft are collective sales with total development area
```

**Stage 2: Price Outliers (Relaxed IQR)**
```python
IQR_MULTIPLIER = 5.0  # Relaxed to allow $4M-$10M luxury condos
lower_bound = Q1 - 5.0 * IQR
upper_bound = Q3 + 5.0 * IQR
```

### Outlier Exclusion Checklist

| Layer | File | Method |
|-------|------|--------|
| Dashboard Service | `services/dashboard_service.py` | `WHERE is_outlier = false` |
| Analytics Routes | `routes/analytics.py` | `WHERE is_outlier = false` |
| Data Computation | `services/data_computation.py` | `WHERE is_outlier = false` |
| Transaction Model | `models/transaction.py` | `.filter(Transaction.is_outlier == False)` |

## E. API Endpoints Reference

| Endpoint | Purpose | Key Params |
|----------|---------|------------|
| `/api/dashboard` | Multi-panel dashboard data | `panels`, filters |
| `/api/aggregate` | Flexible GROUP BY queries | `group_by`, `metrics`, filters |
| `/api/transactions` | Paginated transaction list | `page`, `per_page`, filters |
| `/api/filter-options` | Available filter values | None |
| `/api/metadata` | Dataset stats | None |
| `/api/projects/<name>/price-bands` | Downside protection analysis | `window_months`, `unit_psf`, `schema` |
| `/api/projects/<name>/exit-queue` | Exit queue risk analysis | `schema` |

### Price Bands Endpoint Details

**Purpose**: Historical price floor analysis for downside protection assessment.

**Query Parameters**:
- `window_months`: Analysis window (default 24, range 6-60)
- `unit_psf`: User's unit PSF for verdict calculation (optional)
- `schema`: `v2` for strict camelCase, omit for dual-mode

**Response Schema**:
- Default: v1 snake_case + `_v2` nested camelCase object
- `?schema=v2`: Strict camelCase only

**Key Response Fields**:
| Field | Description |
|-------|-------------|
| `bands` | Monthly P25/P50/P75 with smoothed values |
| `latest` | Most recent smoothed percentiles |
| `trend` | Floor direction (rising/flat/weakening) and slope |
| `verdict` | Badge (protected/watch/exposed) if `unit_psf` provided |
| `dataQuality` | Validity flags, trade counts, fallback info |

**Fallback Hierarchy**: Project → District+Tenure → District → Segment

## F. Interaction Behavior Reference

> **Full interaction patterns**: See [POWER_BI_PATTERNS.md](./POWER_BI_PATTERNS.md#4-component-behavior-matrix)

| User Action | Scope |
|-------------|-------|
| Change sidebar filter | Global (all charts) |
| Click time/location/bedroom bar | Cross-filter (all charts) |
| Click price bin | Fact table only |
| Drill up/down | Visual-local |
| Select project | Drill-through panel |
