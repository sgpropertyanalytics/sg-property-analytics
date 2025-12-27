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

Docs: `docs/backend.md`, `docs/frontend.md`, `docs/architecture.md`

---

# 1. HARD CONSTRAINTS

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
- Enums via `api_contract.py`
- SQL in `services/`, not `routes/`
- Deterministic ORDER BY: `ORDER BY date, id` (not just date)
  - Required for: window functions, cumulative sums, first/last row
  - Safe to skip: GROUP BY aggregations

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

- `usePowerBIFilters()` → Market Pulse page ONLY
- Other pages → receive filters as props
- Each chart has LOCAL drill state
- `buildApiParams()` for ALL API calls
- Time X-axis → `excludeHighlight: true`

## Dates
- UI date ranges must NEVER exceed today (clamp future dates)
- Date presets anchor from `dateRange.max`
- If control dependency not ready → disable OR fallback (never silent no-op)

## UI States
Every async hook returns `{ data, loading, error }`. UI must handle ALL THREE:
```jsx
if (loading) return <Skeleton />;
if (error) return <ErrorState />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

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

---

# 4. FILE STRUCTURE

```
backend/
├── constants.py           # District/region mappings
├── schemas/api_contract.py # Enums, field names
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

## Problem-Solving
1. Fix the class of problem (check parallel code paths)
2. Invariant > conditional patch
3. No hidden side effects
4. Assume messier data in future
5. If unsure → ask
