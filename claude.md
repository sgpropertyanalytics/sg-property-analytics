# Singapore Property Analyzer - Project Guide

## Quick Links

| Resource | Purpose |
|----------|---------|
| **Skills** | `/sql-guardrails`, `/contract-async-guardrails`, `/data-standards`, `/dashboard-guardrails` |
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
| `/contract-async-guardrails` | Any frontend data fetching |
| `/data-standards` | Any classification/label |
| `/dashboard-guardrails` | Any chart modification |
| `/api-endpoint-guardrails` | Creating new endpoints |
