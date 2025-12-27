# Singapore Property Analyzer - Project Guide

## Quick Links

| Resource | Purpose |
|----------|---------|
| **Skills** | `/sql-guardrails`, `/input-boundary-guardrails`, `/contract-async-guardrails`, `/data-standards`, `/dashboard-guardrails`, `/api-url-guardrails` |
| **Docs** | `docs/backend.md` (SQL), `docs/frontend.md` (filters), `docs/architecture.md` |

---

# 1. CRITICAL CONSTRAINTS

## Memory: 512MB RAM
- SQL aggregation only (no pandas DataFrames)
- Paginated queries (never load 100K+ records)
- Pre-computed stats in `precomputed_stats` table

## Outlier Exclusion (MANDATORY)
```sql
WHERE COALESCE(is_outlier, false) = false  -- EVERY query on transactions
```

---

# 2. QUICK REFERENCE CARDS

## Card 1: New Chart Checklist
```
1. Use buildApiParams() for ALL API calls
2. Use useAbortableQuery() with signal
3. Pass response through adapter
4. Time X-axis → excludeHighlight: true
5. Import constants (REGIONS, BEDROOM_ORDER) - never hardcode
```

## Card 2: Filter Hierarchy
```
Sidebar slicers  → ALL charts
Cross-filters    → ALL charts
Fact filters     → Transaction table ONLY
```

## Card 3: Drill vs Cross-Filter
```
Drill = Visual-local (one chart)     Cross-filter = Dashboard-wide (all charts)

MANDATORY: Each chart has LOCAL drill state
  ❌ <DrillButtons hierarchyType="time" />
  ✅ <DrillButtons localLevel={level} onLocalDrillUp={...} />
```

## Card 4: Time-Series Charts
```
X-axis = TIME → excludeHighlight: true, remove highlight from deps
X-axis = CATEGORY → default behavior
```

## Card 5: SQL Rules
```
[ ] :param only (no %(param)s, no f-strings)
[ ] Python date objects (not strings)
[ ] Enums via api_contract.py
[ ] COALESCE(is_outlier, false) = false
[ ] SQL in services/, not routes
[ ] Deterministic ORDER BY (date + unique_id)
```

## Card 6: Async Safety
```
[ ] useAbortableQuery OR useStaleRequestGuard
[ ] signal passed to API: { signal: getSignal() }
[ ] Stale check: if (isStale(requestId)) return
[ ] AbortError silently ignored
[ ] Response through adapter
```

## Card 7: Contract Pattern
```
[ ] Enums from apiContract.js only
[ ] isSaleType.newSale() not === 'New Sale'
[ ] Never access response.data directly
[ ] Adapter normalizes v1/v2
```

## Card 8: API Endpoints
```
Need data? → Use /api/aggregate (don't create endpoint)
Missing metric? → Extend /aggregate
Project-scoped? → OK to create dedicated endpoint
```

## Card 9: Data Standards
```
Sources of truth:
  Backend:  constants.py, services/classifier.py
  Frontend: constants/index.js, schemas/apiContract.js

FORBIDDEN: Hardcoded 'CCR', 'New Sale', '1BR', area < 580
USE: REGIONS, isSaleType.newSale(), BEDROOM_ORDER, classifyBedroomThreeTier()
```

## Card 10: Bedroom Classification (Three-Tier)
```
Tier 1 (New ≥Jun'23): <580, <780, <1150, <1450, ≥1450 sqft
Tier 2 (New <Jun'23): <600, <850, <1200, <1500, ≥1500 sqft
Tier 3 (Resale):      <600, <950, <1350, <1650, ≥1650 sqft

Use: classifyBedroomThreeTier(area, saleType, date)
```

## Card 11: Input Boundary Rules
```
Golden Rule: Normalize ONCE at boundary → Trust internally

BOUNDARY LAYER (route handlers):
[ ] Use to_int(), to_date(), to_bool() from utils/normalize.py
[ ] Handle None explicitly
[ ] Invalid input → 400 (not 500)
[ ] Error includes input type

INTERNAL ZONE (services):
[ ] NO int(), strptime(), json.loads()
[ ] Types already correct
[ ] Assertions guard assumptions

Canonical Types:
  Date → datetime.date    | Money → int (cents)
  Time → datetime (UTC)   | Percent → float (0-1)
  IDs → str               | Flags → bool
```

## Card 11b: Service Layer Type Contract
```
HARD RULES:
  1. Routes OWN parsing (to_date, to_int, etc.)
  2. Services OWN validation (business logic)
  3. Services may COERCE for backward-compat, but NEVER re-parse normalized types
  4. If you see strptime() in a service → WRONG (use coerce_to_date())

CANONICAL INTERNAL TYPE FOR DATES:
  ✅ datetime.date  — THE standard for all filter dicts
  ❌ datetime       — only convert at the very last moment if downstream needs it
  ❌ str            — only accept for legacy compatibility

Route Handler (boundary):
  date_from = to_date(request.args.get('date_from'))  # → date object
  filters['date_from'] = date_from

Service Layer (internal):
  from utils.normalize import coerce_to_date  # Centralized coercion
  from_dt = coerce_to_date(filters['date_from'])

WHY THIS MATTERS:
  ❌ strptime(date_obj, '%Y-%m-%d')  → TypeError: strptime expects str
  ✅ coerce_to_date(date_obj)        → passthrough (already date)
  ✅ coerce_to_date("2024-01-01")    → coerced (legacy compat)

BOUNDARY ASSERTIONS (dev/test only):
  At service entry, assert expected types to catch mismatches early:

  assert filters.get('date_from') is None or isinstance(filters['date_from'], date), \
      f"Expected date, got {type(filters['date_from'])}"

  This turns vague 500s into clear assertion failures.
```

## Card 12: Deterministic Ordering
```
RULE: Time-series queries MUST include stable tie-breaker in ORDER BY

FORBIDDEN:
  ORDER BY transaction_date              ❌ Non-deterministic

REQUIRED:
  ORDER BY transaction_date, id          ✅ Stable
  ORDER BY transaction_date, project_id, unit_id  ✅ Composite key

WHEN THIS MATTERS:
  - Cumulative sums / running totals
  - Window functions (LAG, LEAD, ROW_NUMBER)
  - "Pick first/last row" queries
  - Trend lines from sorted points

WHEN SAFE TO SKIP:
  - Aggregations (median, percentiles, COUNT)
  - GROUP BY date → aggregate → ORDER BY date

TIE-BREAKER PRIORITY:
  1. transaction_id / primary key (best)
  2. source_id from URA / ingestion key
  3. Composite: price, area, project_name
```

## Card 13: Filter Scope Isolation
```
RULE: PowerBIFilterContext (sidebar) ONLY affects Market Pulse page

Market Pulse (MacroOverview.jsx):
  ✅ May use usePowerBIFilters()
  Charts: TimeTrendChart, MedianPsfTrendChart, PriceDistributionChart

All Other Pages:
  ❌ Must NOT use usePowerBIFilters()
  ✅ Receive filters as props from parent

District Deep Dive:
  MarketStrategyMap → local state (controls filters)
  MarketMomentumGrid → props (period, bedroom, saleType)
  GrowthDumbbellChart → props (period, bedroom, saleType)

Project Deep Dive:
  FloorLiquidityHeatmap → props (bedroom, segment, district)

Pattern for non-Market Pulse charts:
  export function MyChart({ period, bedroom, saleType }) {
    const filterKey = `${period}:${bedroom}:${saleType}`;
    // Build API params from props, not usePowerBIFilters()
  }
```

## Card 14: API URL & Routing
```
SINGLE SOURCE OF TRUTH:
  frontend/src/api/client.js → getApiBase() → API_BASE
  All calls use apiClient (never raw fetch with hardcoded URLs)

CANONICAL PREFIX:
  Production: /api/* (Vercel rewrites to Render)
  Development: http://localhost:5000/api
  NEVER mix /health and /api/health in same env

ENVIRONMENT PARITY:
  Dev should mirror prod routing structure
  If prod uses /api/* rewrite → dev should too

FAIL FAST:
  [ ] Validate VITE_API_URL at build time in prod
  [ ] Smoke test /health, /api/health before deploy
  [ ] Log full resolved URL on 4xx/5xx errors

FORBIDDEN:
  ❌ fetch('/api/...') - use apiClient
  ❌ Different URL patterns per environment
  ❌ Hardcoded backend URLs in components
  ❌ Silent failures on missing config

DEBUG CHECKLIST (when 404 in prod):
  1. Check vercel.json rewrite rules
  2. Verify VITE_API_URL in Vercel env vars
  3. Confirm backend serves /api/* (not just /*)
  4. Check apiClient.defaults.baseURL in browser console
```

## Card 15: Date Anchoring Rule
```
RULE: UI date ranges must NEVER exceed today

WHY:
  - DB may contain future-dated records (projections, test data, import errors)
  - Date presets (12M, YTD) anchor from dateRange.max
  - If max = future date → 12M filter excludes recent actual data

IMPLEMENTATION (belt + suspenders):

  1. /filter-options endpoint (frontend anchor):
     if max_date > today:
         max_date = today

  2. Service layer (defensive clamp):
     if date_to and date_to > today.date():
         date_to = today.date()

APPLIES TO:
  - All date range filters (3M, 12M, 2Y, 5Y, YTD)
  - All time-series chart endpoints
  - Transaction list endpoints

SYMPTOM IF VIOLATED:
  - "Missing Q4 data" when 12M filter applied
  - Date presets show unexpected ranges
  - Charts skip recent periods
```

---

# 3. CORE PRINCIPLES

## Problem-Solving Rules
1. **Fix the class of problem** - Check if same logic exists elsewhere
2. **"Where else could this fail?"** - Scan for parallel code paths
3. **Invariant > conditional patch** - Add guardrails, not band-aids
4. **No hidden side effects** - State changes explicitly
5. **Future safety** - Assume messier data, new features reusing logic
6. **If unsure, ask** - Don't guess on behavior changes

## Power BI Rules
1. **Slicers = dimensions** - Facts should never be slicers
2. **Drill = local** - Each chart has own drill state
3. **Global filters apply everywhere** - No exceptions
4. **buildApiParams() always** - Never bypass global filters

---

# 4. CODE PATTERNS

## Frontend Component Structure
```jsx
// 1. Imports
import { usePowerBIFilters } from '../../context/PowerBIFilterContext';
import { useAbortableQuery } from '../../hooks/useAbortableQuery';
import { REGIONS, BEDROOM_ORDER } from '../../constants';
import { isSaleType } from '../../schemas/apiContract';

// 2. Component
export default function MyChart() {
  const { buildApiParams, filters } = usePowerBIFilters();
  const [localDrillLevel, setLocalDrillLevel] = useState('year');

  const { data, loading, error } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({ group_by: localDrillLevel }, { excludeHighlight: true });
      const res = await apiClient.get('/api/aggregate', { params, signal });
      return transformTimeSeries(res.data);
    },
    [JSON.stringify(filters), localDrillLevel]
  );

  if (loading) return <Skeleton />;
  if (error) return <Error />;
  return <Chart data={data} />;
}
```

## Backend Service Structure
```python
from datetime import date
from sqlalchemy import text
from schemas.api_contract import SaleType

def get_data(district: str = None, date_from: date = None):
    query = text("""
        SELECT district, COUNT(*) as count
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND (:district IS NULL OR district = :district)
          AND (:date_from IS NULL OR transaction_date >= :date_from)
        GROUP BY district
    """)
    return db.session.execute(query, {"district": district, "date_from": date_from}).fetchall()
```

---

# 5. FILE STRUCTURE

## Backend
```
backend/
├── constants.py              # District/region mappings
├── schemas/api_contract.py   # Enums, field names
├── services/
│   ├── classifier.py         # Bedroom classification
│   └── *_service.py          # Business logic (SQL here)
└── routes/analytics.py       # Thin route handlers
```

## Frontend
```
frontend/src/
├── constants/index.js        # REGIONS, BEDROOM_ORDER, classifiers
├── schemas/apiContract.js    # Enums, helpers (isSaleType)
├── adapters/                 # Transform API responses
├── hooks/useAbortableQuery.js
├── context/PowerBIFilterContext/
└── components/powerbi/       # Chart components
```

---

# 6. STYLING (Quick Reference)

```
Colors: #213448 (navy), #547792 (blue), #94B4C1 (sky), #EAE0CF (sand)

Regions: CCR=#213448, RCR=#547792, OCR=#94B4C1

Card: bg-white rounded-lg border border-[#94B4C1]/50
Text: text-[#213448] (primary), text-[#547792] (secondary)
```

---

# 7. APPENDIX

## District → Region Mapping
```
CCR: D01, D02, D06, D07, D09, D10, D11
RCR: D03, D04, D05, D08, D12, D13, D14, D15, D20
OCR: D16-D19, D21-D28

Use: getRegionForDistrict('D07') → 'CCR'
```

## API Endpoints
```
/api/aggregate     - Flexible GROUP BY (use this first!)
/api/transactions  - Paginated list
/api/filter-options - Dropdown values
/api/projects/<name>/price-bands - Downside analysis
```

## Skills Reference
| Skill | When to Activate |
|-------|------------------|
| `/sql-guardrails` | Any SQL query |
| `/input-boundary-guardrails` | Any route handler accepting external input |
| `/contract-async-guardrails` | Any frontend data fetching |
| `/data-standards` | Any classification/label |
| `/dashboard-guardrails` | Any chart modification |
| `/api-endpoint-guardrails` | Creating new endpoints |
| `/api-url-guardrails` | API client setup, URL routing, 404 debugging |

---

# 8. ENGINEERING PRINCIPLES

_Practical coding doctrine: clarity over cleverness, safe refactors, reusable blocks, stable contracts._

## Core Philosophy
```
This is a decision-intelligence product. Optimize for:
- Clarity over cleverness
- Safe refactors & predictable behavior
- Reusable building blocks
- Stable UI & data contracts
- Security/compliance (no premium data leakage)

If a change makes code harder to read, delete, or leaks data → reject it.
```

## Principle 1: One Chart = One Question
Every chart answers **one** user decision question. State it explicitly:
```js
// Question: "How does price decay with age for 2BR in CCR?"
```
If a chart tries to answer 2-3 questions → split into separate charts or add a toggle.

## Principle 2: Pure Chart + Container Split
Build charts in 2 layers:
```
PriceDecayChart.tsx       ← Pure: props in → render out (no fetching)
PriceDecayChartContainer.tsx  ← Wiring: reads filters, calls hooks, passes props
```
**Why:** Keeps pages thin, charts portable, logic testable.

## Principle 3: UI Components Don't Fetch
```
✅ useXyzData() handles fetching, caching, normalization
✅ <XyzChart data={...} /> purely renders

❌ fetch() inside chart components
❌ inline data orchestration in UI
```

## Principle 4: Feature Folder Structure
```
src/features/<feature-name>/
  components/    ← Pure UI
  hooks/         ← Data fetching
  api/           ← API calls
  utils/         ← Helpers
  constants.ts   ← Local constants
  index.ts       ← Public exports
```
- Feature-specific → keep in feature folder
- Used across features → promote to `src/lib/`

## Principle 5: DRY Without Over-Abstraction
```
1 use  → keep local
2 uses → consider extracting
3 uses → extract (required)
```
Prefer extracting **logic** (hooks/utils) before extracting "mega components."

## Principle 6: Composition Over Abstraction
Build from small parts:
```
ChartShell → Legend → Tooltip → ChartCanvas → MetricPill → EmptyState
```
**Avoid:** "do-everything" base components, inheritance patterns, magic factories.

## Principle 7: Write for Deletion
Good code is easy to delete. Design so:
- Removing a feature folder deletes the feature cleanly
- Dependencies are explicit
- Side effects are localized
- Minimal global coupling

**Smell:** If deleting something breaks unrelated features.

## Principle 8: Security — Never Leak Premium Data
```
✅ Backend returns masked/aggregated values for free users
✅ Frontend renders only what it receives
❌ Render real numbers then blur with CSS (DevTools bypass!)
```
Treat this as a **security rule**, not a UX choice.

## Principle 9: Naming Conventions
```
Hooks:        useThing
Containers:   ThingContainer
Pure visuals: ThingChart, ThingTable, ThingPanel
Transformers: buildThingSeries, normalizeThing, toThingViewModel
Constants:    THING_DEFAULTS, THING_THRESHOLDS
```
**Explicit names > short names.**

## Principle 10: ESLint Disables — Scoped & Explained
```js
// ✅ Allowed
// eslint-disable-next-line react-hooks/exhaustive-deps
// Reason: stable callback excluded to prevent re-fetch loop

// ❌ Not allowed
/* eslint-disable */
```
Every suppression must have a justification comment.

## Principle 11: No Import-Time Side Effects
```
RULE: Never do I/O, heavy compute, or data loading at import time.

ALLOWED at module top-level:
  ✅ Constants
  ✅ Type definitions
  ✅ Function definitions
  ✅ Class definitions

FORBIDDEN at module top-level:
  ❌ fetch() / axios calls
  ❌ Database queries
  ❌ File reads
  ❌ Heavy computation
  ❌ console.log (except in dev guards)

PUT SIDE EFFECTS INSIDE:
  → Request handlers
  → Service functions
  → useEffect / lifecycle hooks
  → Background tasks
  → Explicit init() functions
```

**Why:** Import-time side effects cause:
- Slow cold starts (all imports run before first request)
- Test isolation failures
- Circular dependency crashes
- Unpredictable initialization order

## Pre-Commit Checklist
Before you commit, ask:
```
[ ] Can I explain what this file does in one sentence?
[ ] Did I use existing sources of truth (not create new ones)?
[ ] Did I duplicate logic or formatting?
[ ] Does the chart handle loading/empty/error/success?
[ ] Can this be deleted without breaking unrelated features?
[ ] Did I leak premium data into the DOM?
[ ] Are ESLint disables scoped and justified?
```
If "no" to any → fix before merging.

## New Chart PR Requirements
```
[ ] Clear question it answers (Principle 1)
[ ] Pure chart + container split (Principle 2)
[ ] Uses adapters & canonical shapes (Card 7)
[ ] Handles all 4 states (Card 6)
[ ] Uses centralized formatting/labels
[ ] No premium leakage (Principle 8)
[ ] Uses constants (REGIONS, BEDROOM_ORDER)
```

## Reference Feature Structure
```
src/features/market-trends/price-decay/
  components/
    PriceDecayChart.tsx           # Pure render
    PriceDecayChartContainer.tsx  # Wiring
  hooks/
    usePriceDecay.ts              # Data fetching
  api/
    priceDecayApi.ts              # API calls
  utils/
    buildSeries.ts                # Transformations
  constants.ts                    # Local constants
  index.ts                        # Public exports

src/lib/
  apiContract.ts                  # Shared contract
  adapters/                       # v1/v2/v3 adapters
  format/                         # money, number, date
  labels/                         # UI text
  constants/                      # App-wide constants
```

---

**Final Principle:** We are building a product that survives iteration. Optimize for stable contracts, reusable primitives, clean feature boundaries, safe refactors, and clear decision-oriented visuals.

---

# 9. ROUTE INPUT NORMALIZATION (Required)

All API routes MUST normalize query/body inputs using shared `utils/normalize.py` helpers.

## Rules

1. **No direct parsing in routes** - `int()`, `float()`, `datetime.strptime()`, `request.args.get(..., type=...)` are **FORBIDDEN** in route files
2. **Use normalize utilities** - Import from `utils.normalize`:
   - `to_int()`, `to_float()`, `to_bool()`
   - `to_date()`, `to_datetime()`, `to_str()`
   - `to_list()`, `to_enum()`
3. **Invalid input → 400** - Parse errors return structured 400 response, never 500
4. **Preserve defaults** - Migration must not change default values or behavior

## Pattern

```python
from utils.normalize import (
    to_int, to_float, to_date, to_list,
    ValidationError as NormalizeValidationError,
    validation_error_response
)

@app.route("/data")
def get_data():
    try:
        # Parse at boundary
        limit = to_int(request.args.get("limit"), default=100, field="limit")
        date_from = to_date(request.args.get("date_from"), field="date_from")
        bedrooms = to_list(request.args.get("bedroom"), item_type=int, field="bedroom")
    except NormalizeValidationError as e:
        return validation_error_response(e)

    # Now types are guaranteed
    return service.get_data(limit=limit, date_from=date_from, bedrooms=bedrooms)
```

## CI Guard

Run before commits to check for violations:
```bash
bash scripts/check_normalize_violations.sh
```

## Canonical Types

| Concept | Type | Helper |
|---------|------|--------|
| Date | `datetime.date` | `to_date()` |
| Timestamp | `datetime.datetime` | `to_datetime()` |
| Money | `int` (cents) | `to_int()` |
| Percent | `float` (0-1) | `to_float()` |
| IDs | `str` | `to_str()` |
| Flags | `bool` | `to_bool()` |

---

# 10. API ERROR HANDLING (Golden Rules)

**400s must be intentional, explainable, and recoverable. 500s must never be caused by user input.**

## Preventing Unnecessary 400s

1. **Normalize at boundary** - Parse once, convert to canonical types, reject invalid early
2. **Accept loose input, enforce strict output** - Trim whitespace, handle empty strings as None
3. **Provide defaults for optional params** - `limit=100`, `page=1`, `date_from=None`
4. **Return allowed values in errors** - `{"error": "Invalid value", "field": "bedroom", "allowed": [1,2,3,4,5]}`
5. **Normalize empty values** - Treat `None`, `""`, `" "`, `"null"` as equivalent → `None`

## Error Response Format

```python
# Good - clear, actionable
{
  "error": "Invalid date format",
  "field": "date_from",
  "expected": "YYYY-MM-DD",
  "received": "01-01-2024"
}

# Bad - unhelpful
{"error": "bad request"}
```

## Dashboard Safe Mode

For exploratory dashboards, prefer empty results over crashes:

```python
# Instead of raising, return empty with warning
if no_data_matches_filters:
    return {"data": [], "warning": "No transactions match filters"}
```

---

# 11. CHART.JS COMPONENT CHECKLIST

When creating Chart.js components, always:

```
[ ] Register ALL required controllers (BubbleController, LineController, etc.)
[ ] Register ALL required elements (PointElement, BarElement, etc.)
[ ] Register ALL required scales (LinearScale, CategoryScale, etc.)
[ ] Spread baseChartJsOptions (maintainAspectRatio: false)
[ ] Handle 4 states: loading, error, empty, success
[ ] Use ChartSlot wrapper for flex layout
```

## Controller Registration Examples

```jsx
// Bubble Chart
import { BubbleController, LinearScale, PointElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(BubbleController, LinearScale, PointElement, Tooltip, Legend);

// Bar Chart
import { BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(BarController, CategoryScale, LinearScale, BarElement, Tooltip, Legend);

// Line Chart
import { LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(LineController, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);
```

**Common 404/Error causes:**
- Missing controller registration (e.g., `BubbleController` for Bubble charts)
- Missing element registration (e.g., `PointElement` for scatter/bubble)
- Missing scale registration (e.g., `CategoryScale` for categorical axes)

---

# 12. DEBUGGING 500 ERRORS

## Card 15: When You See a 500
```
IMMEDIATE ACTIONS:
  1. Check server logs for the actual exception + traceback
  2. Note: endpoint, query params, and which filters were selected
  3. Look for TypeError in strptime/int/float → likely type mismatch

LOGGING REQUIREMENTS FOR API ROUTES:
  [ ] Log endpoint + method on error
  [ ] Log query params (repr + types)
  [ ] Log normalized filter dict (with types)
  [ ] Ensure error response is JSON (never HTML for API routes)

EXAMPLE LOGGING PATTERN:
  except Exception as e:
      logger.error(f"GET /api/dashboard ERROR: {e}")
      logger.error(f"Query params: {dict(request.args)}")
      logger.error(f"Normalized filters: {[(k, repr(v), type(v).__name__) for k,v in filters.items()]}")
      traceback.print_exc()
      return jsonify({"error": str(e)}), 500

TIP: Log repr(value) + type(value) for boundary params
     This catches the "strptime got date instead of str" bug instantly.
```

## Boundary Bug Test Matrix

To prevent regression, test these combinations for date parameters:

| Input Type | `date_from` | `date_to` | Expected Result |
|------------|-------------|-----------|-----------------|
| None | `None` | `None` | ✅ No filter applied |
| String | `"2024-01-01"` | `"2024-12-31"` | ✅ Parsed & filtered |
| Date object | `date(2024,1,1)` | `date(2024,12,31)` | ✅ Passthrough |
| Datetime | `datetime(...)` | `datetime(...)` | ✅ Extracted .date() |
| Mixed | `date(...)` | `"2024-12-31"` | ✅ Both coerced |
| Invalid string | `"not-a-date"` | `None` | ✅ 400 error (not 500) |

**Regression test:** Filters only trigger when selected
- Without filters → works ✅
- With date filter selected → works ✅ (was causing 500 before fix)
