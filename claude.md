# Singapore Property Analyzer - Project Guide

## Quick Links

| Resource | Purpose |
|----------|---------|
| **Skills** | `/sql-guardrails`, `/input-boundary-guardrails`, `/contract-async-guardrails`, `/data-standards`, `/dashboard-guardrails` |
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
