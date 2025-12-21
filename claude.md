# Singapore Property Analyzer - Project Guide

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Core Principles](#2-core-principles)
3. [Architecture](#3-architecture)
4. [Implementation Guides](#4-implementation-guides)
5. [Styling Guide](#5-styling-guide)
6. [Reference Appendix](#6-reference-appendix)

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

### Card 4: Time-Series Chart Rule

```
If X-axis = TIME (year/quarter/month):
  → Use excludeHighlight: true
  → Chart shows full timeline, visual highlight only

If X-axis = CATEGORY (district/bedroom/price):
  → Use excludeHighlight: false (default)
  → Chart filters to highlighted period
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

### The Data Model Rule

> **Slicers belong to dimensions. Facts should almost never be slicers.**

```
┌─────────────────┐         ┌─────────────────┐
│   DIMENSION     │────────▶│      FACT       │
│   (Slicers)     │         │   (Data Sink)   │
└─────────────────┘         └─────────────────┘
     Filters                  Gets Filtered
     Others                   Never Filters
```

### The Interaction Rule

> **If it answers "what happened when or where" → Cross-filter**
> **If it answers "what portion is related" → Highlight**

| Intent | Type | Backend Query? |
|--------|------|----------------|
| Time and scope | Cross-filter | ✅ Yes |
| Composition view | Highlight | ❌ No |

### The Drill Rule

> **Drill ≠ Filter. Drill is visual-local by default.**

| Action | Scope | Effect |
|--------|-------|--------|
| Drill | Single visual | Changes granularity inside one chart |
| Filter | Cross-visual | Changes data scope across all visuals |

### The Global Filter Rule

> **All sidebar slicers MUST apply to every visual. No exceptions.**

Global slicers: Districts, Date Range, Bedroom Types, Sale Type, PSF Range, Size Range

```jsx
// ✅ CORRECT - Always use buildApiParams
const params = buildApiParams({ group_by: 'quarter' });

// ❌ WRONG - Ignoring global filters
const params = { region: localRegion }; // DON'T DO THIS
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

```
┌─────────────────────────────────────────────────────────────────────┐
│                  PowerBIFilterContext.jsx                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  filters (sidebar slicers)                                           │
│  ├── dateRange, districts, bedroomTypes                              │
│  └── segment, saleType, psfRange, sizeRange                          │
│                                                                      │
│  crossFilter (chart clicks → all charts)                             │
│  └── district, region, bedroom, sale_type                            │
│                                                                      │
│  factFilter (dimension → fact table only)                            │
│  └── priceRange (from Price Distribution chart)                      │
│                                                                      │
│  highlight (time emphasis)                                           │
│  └── year, quarter, month                                            │
│                                                                      │
│  drillPath (hierarchy level)                                         │
│  ├── time: year → quarter → month                                    │
│  └── location: region → district (NO project in global)              │
│                                                                      │
│  selectedProject (drill-through only, does NOT affect charts)        │
│  └── Opens ProjectDetailPanel with independent queries               │
│                                                                      │
│  buildApiParams(additionalParams, options)                           │
│  ├── options.includeFactFilter = true (for Fact tables)              │
│  └── options.excludeHighlight = true (for Time-series charts)        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
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
└── services/
    ├── dashboard_service.py  # Dashboard panel queries (SQL aggregation)
    ├── data_validation.py    # Data cleaning (outliers, duplicates, invalid)
    ├── data_computation.py   # Pre-compute stats to precomputed_stats table
    └── analytics_reader.py   # Read pre-computed stats
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

### Using Standard DrillButtons Component

```jsx
import { DrillButtons } from './DrillButtons';

// GLOBAL MODE (affects breadcrumbs, other charts may respond)
<DrillButtons hierarchyType="time" />
<DrillButtons hierarchyType="location" />

// LOCAL MODE (visual-local only, no global effect)
<DrillButtons
  localLevel={drillLevel}
  localLevels={['year', 'quarter', 'month']}
  localLevelLabels={{ year: 'Year', quarter: 'Quarter', month: 'Month' }}
  onLocalDrillUp={() => setDrillLevel(prev => prevLevel(prev))}
  onLocalDrillDown={() => setDrillLevel(prev => nextLevel(prev))}
/>
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

| Component | Type | Responds to Highlight? | Cross-Filters? | Notes |
|-----------|------|------------------------|----------------|-------|
| PowerBIFilterSidebar | Slicer | N/A | Yes (global) | Source of global filters |
| TimeTrendChart | Dimension | No (`excludeHighlight`) | Yes | Source of time highlights |
| VolumeByLocationChart | Dimension | Yes | Yes | Region/district cross-filter |
| PriceDistributionChart | Dimension | Yes | Fact-only | Sets factFilter.priceRange |
| BedroomMixChart | Dimension | Yes | Yes | Bedroom cross-filter |
| TransactionDataTable | **Fact** | Yes | **Never** | Pure data sink |
| ProjectDetailPanel | Drill-through | Independent | No | Own API queries |

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

## F. Interaction Behavior Reference

| User Action | Behavior | Scope |
|-------------|----------|-------|
| Change sidebar filter | All charts re-fetch | Global |
| Click time bar | Sets highlight → all charts re-fetch | Cross-filter |
| Click location bar | Sets crossFilter → all charts re-fetch | Cross-filter |
| Click bedroom segment | Sets crossFilter → all charts re-fetch | Cross-filter |
| Click price bin | Sets factFilter → TransactionTable only | Dimension → Fact |
| Drill up/down | Only that chart changes | Visual-local |
| Select project | Opens ProjectDetailPanel | Drill-through |
