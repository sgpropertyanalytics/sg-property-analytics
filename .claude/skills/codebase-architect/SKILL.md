---
name: codebase-architect
description: System architecture expertise for this codebase. Use when planning implementations, making architectural decisions, reasoning about data correctness, or debugging issues.
---

# System Architecture Expert

Deep knowledge of this codebase's patterns, incidents, and data integrity rules.

**Trigger:** Planning implementations, architectural decisions, data correctness, debugging

---

## Layer Responsibilities (Hard Rules)

```
Pages decide → Components render → Utils transform → Backend enforces
```

| Layer | Owns | NEVER Does |
|-------|------|------------|
| **Pages** | Business logic, data scope, sale type | - |
| **Components** | Rendering props | Logic, defaults, state |
| **Hooks** | Data fetching (TanStack Query) | Business decisions |
| **Adapters** | Transform API → chart format | Business logic |
| **Routes** | Parse params, validate | SQL, business logic |
| **Services** | SQL queries, computation | Parsing strings |

---

## Input Boundary Patterns

**Golden Rule:** Normalize at boundary, trust internally.

### normalize.py Helpers

```python
from utils.normalize import to_int, to_date, to_list, to_bool, ValidationError

# Route handler pattern
@app.route("/data")
def get_data():
    try:
        limit = to_int(request.args.get("limit"), default=100, field="limit")
        date_from = to_date(request.args.get("date_from"), field="date_from")
        districts = to_list(request.args.get("districts"), separator=",")
        include_new = to_bool(request.args.get("include_new"), field="include_new")
    except ValidationError as e:
        return {"error": str(e)}, 400

    # After this point, types are guaranteed correct
    return service.get_data(limit=limit, date_from=date_from)
```

### Canonical Type Table

| Concept | Canonical Type | Why |
|---------|---------------|-----|
| Dates | `datetime.date` | No timezone ambiguity |
| Money | `int` (cents) | No float rounding |
| Lists | `tuple` | Immutable, hashable |
| IDs | `str` | Universal format |
| Flags | `bool` | Explicit, not truthy |

### Service Layer Pattern

```python
def coerce_to_date(value) -> Optional[date]:
    """Defensive date handling within services."""
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        return datetime.strptime(value, "%Y-%m-%d").date()
    raise ValueError(f"Cannot coerce {type(value)} to date")
```

---

## Data Flow Patterns

### Two-Layer Filter Naming

```
API PARAMS (singular) → SERVICE FILTERS (plural)
district              → districts
bedroom               → bedrooms
sale_type             → sale_types
```

### /aggregate Extension Decision Tree

```
Need data for a chart?
        ↓
Can /aggregate handle it?
(Check: group_by values, metrics list)
        ↓
   YES → Use /aggregate with params
   NO  → Add new group_by or metric to /aggregate
        → DON'T create a dedicated endpoint
```

**Supported group_by:** month, quarter, year, district, bedroom, sale_type, project, region, floor_level

**Supported metrics:** count, median_psf, avg_psf, total_value, median_price, avg_price, min_psf, max_psf, price_25th, price_75th

---

## Data Integrity Patterns

### Two-Phase Computation

```sql
-- WRONG: Filter affects the percentile calculation
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY psf)
FROM transactions
WHERE district = 'D01'  -- Percentile is now D01-only

-- CORRECT: Compute globally, then filter for membership
WITH city_median AS (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
    FROM transactions
    WHERE COALESCE(is_outlier, false) = false
)
SELECT t.*, cm.median_psf,
       CASE WHEN t.psf < cm.median_psf THEN 'below' ELSE 'above' END
FROM transactions t
CROSS JOIN city_median cm
WHERE t.district = 'D01'
```

### Outlier Handling

- Global IQR computed at data ingestion
- Filter once at upload, never at runtime
- Every query MUST include: `WHERE COALESCE(is_outlier, false) = false`

### SQL Determinism

| Rule | Why |
|------|-----|
| Join on IDs, not display names | Names can be duplicated |
| Explicit `ORDER BY date, id` | Never rely on implicit order |
| No `MODE()` | Non-deterministic with ties |
| No unordered `array_agg()` | Order varies between runs |

### K-Anonymity

Minimum 10 records before showing aggregates to prevent individual identification.

### SQL Param Validation

```python
from db.sql import validate_sql_params

# Already implemented in backend/db/sql.py
validate_sql_params(query_text, params_dict)
# Raises ValueError if placeholders don't match params.keys()
```

---

## Historical Incidents (Learn From Mistakes)

### 1. CSV Deletion (Dec 30, 2025)
**What:** Runtime function deleted rows from `new_launch_units.csv`.
**Impact:** Resale Velocity KPI broke - data silently disappeared.
**Fix:** `fs_guard.py` blocks all writes to `backend/data/` and `scripts/data/`.
**Lesson:** Data files are IMMUTABLE at runtime.

### 2. Layer-Upon-Layer (Dec 25, 2025)
**What:** Built 400+ lines of custom hooks instead of using TanStack Query.
**Impact:** `datePreset` cache key bug, race conditions, maintenance burden.
**Fix:** Migrated to `useAppQuery()` (TanStack Query wrapper).
**Lesson:** Check if library exists before writing >50 lines of infrastructure.

### 3. Silent Param Drop (Jan 2, 2026)
**What:** Frontend sent `timeframe`, backend schema didn't have it, silently dropped.
**Impact:** Time filter selections ignored - always showed Y1 data.
**Fix:** `test_frontend_backend_alignment.py` validates param acceptance.
**Lesson:** Test the integration boundary, not just each layer.

### 4. Boot Deadlock (Jan 1, 2026)
**What:** Abort handling didn't reset `inFlight` state.
**Impact:** Queries stuck in 'refreshing' forever, spinner never stopped.
**Fix:** Reset state on abort with multiple guards.
**Lesson:** Async code needs abort/cancel/timeout tests.

### 5. Filter Over-Engineering (Jan 4, 2026)
**What:** Filter-to-API flow grew to 7 layers when 3 would work.
**Impact:** `useDeferredFetch` bug, debugging required tracing 5 files.
**Fix:** Simplified to: Zustand → useQuery → Backend.
**Lesson:** If explaining data flow needs a diagram, it's too complex.

### 6. Resale Data Rule Violation (Dec 2025)
**What:** Removed CSV without checking what charts consumed it.
**Impact:** Charts broke silently, no data shown.
**Fix:** `docs/BACKEND_CHART_DEPENDENCIES.md` documents all dependencies.
**Lesson:** Before changing data sources, trace all consumers.

### 7. "Just Replace With Pydantic"
**What:** Claude recommended replacing 374-line normalize.py with Pydantic without reading the full validation stack (1660-line contract_schema + 290-line decorator).
**Impact:** Would have broken battle-tested production system.
**Lesson:** Read the FULL system before recommending rewrites. "Custom" doesn't mean "bad".

---

## How to Navigate This Codebase

### Key Directories

| What | Where |
|------|-------|
| Charts | `frontend/src/components/powerbi/` |
| Services | `backend/services/` |
| Routes | `backend/routes/analytics/` |
| Constants (backend) | `backend/constants.py` |
| Constants (frontend) | `frontend/src/constants/index.js` |
| Normalize helpers | `backend/utils/normalize.py` |
| Filter state | `frontend/src/stores/filterStore.js` |
| Query hook | `frontend/src/hooks/useAppQuery.js` |
| Adapters | `frontend/src/adapters/aggregate/` |

### Reference Implementations

| Task | Copy This |
|------|-----------|
| New chart | `TimeTrendChart.jsx` |
| New adapter | `adapters/aggregate/timeSeries.js` |
| New route | `routes/analytics/aggregate.py` |
| New service function | `dashboard_service.py:get_aggregated_data()` |
| New page | `MacroOverview.jsx` |

---

## Red Flags to Watch For

| Pattern | Problem |
|---------|---------|
| New hook >50 lines | Probably reinventing a library |
| Dynamic SQL string building | SQL injection risk, use static SQL with NULL guards |
| Hardcoded enum strings (`'Resale'`, `'New Sale'`) | Use constants from `apiContract.js` |
| Missing `COALESCE(is_outlier, false) = false` | Outliers will pollute results |
| `useEffect` + `fetch` + `useState` combo | Use `useAppQuery` instead |
| Manual `AbortController` | TanStack Query handles this |
| Context file >100 lines | Consider Zustand |
| Component hardcodes `sale_type` | Should receive as prop |

---

## Decision Frameworks

### When to Extend /aggregate vs Create New Endpoint

**Extend /aggregate if:**
- Need a new metric (add to METRICS dict)
- Need a new group_by dimension (add to GROUP_BY_COLUMNS)
- Need a new filter param (add to schema)

**Create new endpoint only if:**
- Project-scoped with complex business logic (`/projects/<name>/price-bands`)
- Admin/debug endpoints
- Special data source (not transactions table)

### When Custom Code is OK

1. **Domain-specific logic** - Bedroom classification, district mapping
2. **Thin adapters** - API response transformers (<30 lines)
3. **UI components** - React components (not data infrastructure)
4. **Configuration** - Constants, enums, config files

### The 5 Questions Before Any Abstraction

| Question | If NO → |
|----------|---------|
| Is there a bug RIGHT NOW? | Don't add the layer |
| Does the library already handle this? | Use the library |
| Can I delete this layer and still work? | Delete it |
| Would a new developer understand in 5 minutes? | Too complex |
| Am I adding a layer just to rename fields? | Fix naming at source |
