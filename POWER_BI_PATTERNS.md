# Power BI Patterns & Filter System

> **Single source of truth** for all Power BI-style filtering patterns in the Singapore Property Analyzer dashboard.

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Golden Rules](#2-golden-rules)
3. [Filter Types & Hierarchy](#3-filter-types--hierarchy)
4. [Component Behavior Matrix](#4-component-behavior-matrix)
5. [Implementation Patterns](#5-implementation-patterns)
6. [Filter UX Patterns](#6-filter-ux-patterns)
7. [Validation Requirements](#7-validation-requirements)
8. [Guardrails - What NOT to Touch](#8-guardrails---what-not-to-touch)

---

# 1. Core Concepts

## The Data Model

```
┌─────────────────┐         ┌─────────────────┐
│   DIMENSION     │────────▶│      FACT       │
│   (Slicers)     │         │   (Data Sink)   │
└─────────────────┘         └─────────────────┘
     Filters                  Gets Filtered
     Others                   Never Filters
```

**Key principle**: Slicers belong to dimensions. Facts should almost never be slicers.

## Dimensions vs Facts

| Type | Examples | Behavior |
|------|----------|----------|
| **Dimension** | Time, Location, Bedroom, Sale Type | Filters other charts |
| **Fact** | Transaction Table | Gets filtered, never filters others |

## Interaction Types

| Interaction | What it does | Backend Query? | Scope |
|-------------|--------------|----------------|-------|
| **Filter** (sidebar) | Restricts data scope | Yes | Global (all charts) |
| **Cross-filter** (chart click) | Filters by clicked value | Yes | Global (all charts) |
| **Highlight** (time click) | Emphasizes a period | Yes* | Global, but time chart shows full range |
| **Fact-filter** (price bin click) | Filters fact table only | Yes | Fact table only |
| **Drill** (up/down buttons) | Changes granularity | Yes | Single chart only |
| **Drill-through** (project click) | Opens detail panel | Yes (independent) | Detail panel only |

---

# 2. Golden Rules

## Rule 1: The Data Model Rule

> **Slicers belong to dimensions. Facts should almost never be slicers.**

- Dimension charts (TimeTrend, Volume, Bedroom) can cross-filter
- Fact tables (TransactionDataTable) are pure data sinks
- Price Distribution is special: it's a dimension that only filters the fact table

## Rule 2: The Interaction Rule

> **"What happened when or where" → Cross-filter**
> **"What portion is related" → Highlight**

| Intent | Type | Backend Query? |
|--------|------|----------------|
| Time and scope selection | Cross-filter | Yes |
| Composition/proportion view | Highlight | Visual only |

## Rule 3: The Drill Rule

> **Drill ≠ Filter. Drill is visual-local by default.**

| Action | Scope | Effect |
|--------|-------|--------|
| Drill up/down | Single visual | Changes granularity inside one chart |
| Cross-filter | Cross-visual | Changes data scope across all visuals |

## Rule 4: The Global Filter Rule

> **All sidebar slicers MUST apply to every visual. No exceptions.**

Global slicers: Districts, Date Range, Bedroom Types, Sale Type, PSF Range, Size Range

```jsx
// CORRECT - Always use buildApiParams
const params = buildApiParams({ group_by: 'quarter' });

// WRONG - Ignoring global filters
const params = { region: localRegion }; // DON'T DO THIS
```

## Rule 5: The Time-Series Rule

> **Time-axis charts preserve full timeline, only highlight visually.**

```
If X-axis = TIME (year/quarter/month):
  → Use excludeHighlight: true
  → Chart shows full timeline, visual highlight only

If X-axis = CATEGORY (district/bedroom/price):
  → Use excludeHighlight: false (default)
  → Chart filters to highlighted period
```

---

# 3. Filter Types & Hierarchy

## Filter Hierarchy

```
Global Slicers (sidebar)     → Apply to ALL charts
    ↓
Cross-Filters (chart clicks) → Apply to ALL charts
    ↓
Fact Filters (price bins)    → Apply to Transaction Table ONLY
```

## Filter State in PowerBIFilterContext

```jsx
// context/PowerBIFilterContext.jsx

filters (sidebar slicers)
├── dateRange, districts, bedroomTypes
└── segment, saleType, psfRange, sizeRange

crossFilter (chart clicks → all charts)
└── district, region, bedroom, sale_type

factFilter (dimension → fact table only)
└── priceRange (from Price Distribution chart)

highlight (time emphasis)
└── year, quarter, month

drillPath (hierarchy level)
├── time: year → quarter → month
└── location: region → district (NO project in global)

selectedProject (drill-through only, does NOT affect charts)
└── Opens ProjectDetailPanel with independent queries
```

## buildApiParams() Options

```jsx
buildApiParams(additionalParams, options)
├── options.includeFactFilter = true  // For Fact tables (TransactionDataTable)
└── options.excludeHighlight = true   // For Time-series charts (TimeTrendChart)
```

---

# 4. Component Behavior Matrix

| Component | Type | Responds to Highlight? | Cross-Filters? | Notes |
|-----------|------|------------------------|----------------|-------|
| PowerBIFilterSidebar | Slicer | N/A | Yes (global) | Source of global filters |
| TimeTrendChart | Dimension | No (`excludeHighlight`) | Yes | Source of time highlights |
| VolumeByLocationChart | Dimension | Yes | Yes | Region/district cross-filter |
| PriceDistributionChart | Dimension | Yes | Fact-only | Sets factFilter.priceRange |
| BedroomMixChart | Dimension | Yes | Yes | Bedroom cross-filter |
| NewVsResaleChart | Dimension | Yes | Yes | Sale type comparison |
| TransactionDataTable | **Fact** | Yes | **Never** | Pure data sink |
| ProjectDetailPanel | Drill-through | Independent | No | Own API queries |

## User Action → System Response

| User Action | Behavior | Scope |
|-------------|----------|-------|
| Change sidebar filter | All charts re-fetch | Global |
| Click time bar | Sets highlight → all charts re-fetch | Cross-filter |
| Click location bar | Sets crossFilter → all charts re-fetch | Cross-filter |
| Click bedroom segment | Sets crossFilter → all charts re-fetch | Cross-filter |
| Click price bin | Sets factFilter → TransactionTable only | Dimension → Fact |
| Drill up/down | Only that chart changes | Visual-local |
| Select project | Opens ProjectDetailPanel | Drill-through |

---

# 5. Implementation Patterns

## Adding a New Chart

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
  { excludeHighlight: true }  // ADD THIS
);

// Remove highlight from useEffect dependencies
useEffect(() => {
  fetchData();
}, [buildApiParams, filters]); // NO highlight
```

### Step 4: For Cross-Filtering Charts

```jsx
const { applyCrossFilter } = usePowerBIFilters();

const handleBarClick = (clickedValue) => {
  applyCrossFilter('location', 'district', clickedValue);
};
```

## Adding a New Filter

### Step 1: Add State to Context

```jsx
// context/PowerBIFilterContext.jsx
const [filters, setFilters] = useState({
  // ... existing filters
  myNewFilter: null,  // ADD
});
```

### Step 2: Update buildApiParams

```jsx
const buildApiParams = useCallback((additionalParams = {}, options = {}) => {
  const params = { ...additionalParams };

  // ... existing params

  if (filters.myNewFilter) {
    params.my_new_filter = filters.myNewFilter;  // ADD
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

## Drill Button Implementation

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

| Level | Up | Down |
|-------|--------|----------|
| Year (highest) | Disabled | Enabled |
| Quarter | Enabled | Enabled |
| Month (lowest) | Enabled | Disabled |
| Region (highest) | Disabled | Enabled |
| District (lowest) | Enabled | Disabled |

---

# 6. Filter UX Patterns

## Responsive Filter Strategy

| Viewport | Pattern |
|----------|---------|
| Desktop (1024px+) | Horizontal filter bar, always visible |
| Tablet (768-1023px) | Collapsible bar or slide-in panel |
| Mobile (<768px) | Full-screen drawer or bottom sheet |

## Desktop Filter Bar

```jsx
<div className="hidden lg:block">
  <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4 mb-6">
    <div className="flex flex-wrap items-end gap-4">
      <FilterDropdown label="District" />
      <FilterDropdown label="Bedroom" />
      <FilterDateRange />

      {activeCount > 0 && (
        <button className="min-h-[44px] px-3 text-sm text-[#547792]">
          Clear ({activeCount})
        </button>
      )}
    </div>

    {/* Active filter chips */}
    {activeCount > 0 && (
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#94B4C1]/30">
        {chips.map(chip => <FilterChip key={chip.id} {...chip} />)}
      </div>
    )}
  </div>
</div>
```

## Mobile Filter Drawer

```jsx
<div className="lg:hidden">
  {/* Toggle button */}
  <button
    onClick={() => setOpen(true)}
    className="
      w-full flex items-center gap-2
      min-h-[48px] px-4
      bg-white rounded-lg border border-[#94B4C1]/50
      active:bg-[#EAE0CF]/30
    "
  >
    <FilterIcon className="w-5 h-5 text-[#547792]" />
    <span className="font-medium text-[#213448]">Filters</span>
    {activeCount > 0 && (
      <span className="ml-auto px-2 py-0.5 bg-[#547792]/20 text-sm rounded-full">
        {activeCount}
      </span>
    )}
  </button>

  {/* Drawer panel */}
  {isOpen && (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div className="absolute inset-y-0 right-0 w-full max-w-sm bg-white flex flex-col">
        {/* Header, scrollable content, sticky footer with Apply button */}
      </div>
    </div>
  )}
</div>
```

## Filter Chip (Touch-Friendly)

```jsx
function FilterChip({ label, onRemove }) {
  return (
    <span className="
      inline-flex items-center gap-1
      px-2 py-1 rounded-full text-sm
      bg-[#547792]/20 text-[#213448]
      border border-[#547792]/30
    ">
      <span className="truncate max-w-[120px]">{label}</span>
      <button
        onClick={onRemove}
        className="
          min-h-[24px] min-w-[24px]
          flex items-center justify-center rounded-full
          hover:bg-[#547792]/30 active:bg-[#547792]/50
        "
        aria-label={`Remove ${label} filter`}
      >
        <XIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
```

## Filter UX Rules

1. **Touch targets**: Minimum 44px on all filter controls
2. **No duplicate labels**: FilterGroup and child input should not both show labels
3. **Active states**: Always provide `active:` states for touch feedback
4. **Clear indication**: Show active filter count and provide clear-all option

---

# 7. Validation Requirements

## Filter Validation Framework

When validating filter states, check these requirements:

### 1. Time Completeness

For any time filter, verify:
- Monthly: All 12 months present for selected year(s)
- Quarterly: All 4 quarters present (Q1-Q4)
- Yearly: Continuous range with no gaps

```sql
WITH expected_months AS (
    SELECT generate_series(1, 12) AS month_num
),
actual_months AS (
    SELECT DISTINCT EXTRACT(MONTH FROM transaction_date)::int AS month_num
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = 2024
    AND is_outlier = false
)
SELECT
    e.month_num,
    CASE WHEN a.month_num IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS status
FROM expected_months e
LEFT JOIN actual_months a ON e.month_num = a.month_num
ORDER BY e.month_num;
```

### 2. Dimensional Completeness

For any categorical filter, verify:
- All expected categories exist in result set
- No unexpected categories appear
- Cross-dimensional completeness (e.g., every district has every bedroom type)

```sql
WITH expected_combinations AS (
    SELECT DISTINCT d.district, b.bedroom_count
    FROM (SELECT DISTINCT district FROM transactions WHERE is_outlier = false) d
    CROSS JOIN (SELECT DISTINCT bedroom_count FROM transactions WHERE bedroom_count IN (2,3,4) AND is_outlier = false) b
),
actual_combinations AS (
    SELECT DISTINCT district, bedroom_count
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = 2024
    AND is_outlier = false
)
SELECT e.district, e.bedroom_count, 'MISSING' AS status
FROM expected_combinations e
LEFT JOIN actual_combinations a ON e.district = a.district AND e.bedroom_count = a.bedroom_count
WHERE a.district IS NULL;
```

### 3. Drill-Down Consistency

When drilling from aggregate to detail:
- SUM(detail) must equal aggregate value
- COUNT(detail) must match expected record count
- No orphan records excluded from parent aggregation

```sql
WITH yearly AS (
    SELECT COUNT(*) AS cnt, SUM(price) AS total
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = 2024
    AND is_outlier = false
),
quarterly AS (
    SELECT EXTRACT(QUARTER FROM transaction_date) AS q, COUNT(*) AS cnt, SUM(price) AS total
    FROM transactions
    WHERE EXTRACT(YEAR FROM transaction_date) = 2024
    AND is_outlier = false
    GROUP BY EXTRACT(QUARTER FROM transaction_date)
)
SELECT
    y.cnt AS year_count,
    SUM(q.cnt) AS sum_quarter_count,
    y.cnt - SUM(q.cnt) AS count_discrepancy
FROM yearly y, quarterly q
GROUP BY y.cnt, y.total;
```

### 4. Filter Isolation

Verify filtered data contains ONLY matching records:
- No date leakage outside time boundaries
- No category leakage from unselected filters

## Validation Output Format

For each validation:
- **Filter State**: {exact filters applied}
- **Expected**: {what should be present}
- **Actual**: {what was found}
- **Discrepancies**: {specific gaps or extras}
- **Root Cause**: {why this might be happening}
- **SQL Evidence**: {query that proves the issue}

## API Endpoints to Validate

| Endpoint | Purpose |
|----------|---------|
| `/api/aggregate` | Flexible aggregation endpoint |
| `/api/transactions` | Transaction list |
| `/api/dashboard` | Multi-panel dashboard data |
| `/api/filter-options` | Available filter values |

---

# 8. Guardrails - What NOT to Touch

## UI Freeze: The "Do Not Touch" List

When modifying dashboard code, NEVER change these without explicit user request:

### Chart Internals

```
Chart Configuration
├── Axis scales, domains, ranges
├── Data transformation/aggregation logic
├── Tooltip content and positioning logic
├── Legend configuration and positioning
└── Chart type (bar, line, pie, etc.)
```

### Filter Logic

```
Filter State
├── Filter state management (useState, Redux, context)
├── Filter-to-chart data binding
├── Cross-filter relationships
└── URL param sync for filters
```

### Data Layer

```
Data Processing
├── API calls and data fetching
├── Data parsing and normalization
└── Computed/derived metrics
```

### Interactive Features

```
Interactions
├── Click handlers on chart elements
├── Drill-down navigation
├── Zoom/pan functionality
└── Selection/highlight behavior
```

## The Safe Zone (What You CAN Modify)

```
Layout Containers
├── Grid/flex wrappers around charts
├── Responsive container widths
├── Gap/padding between cards
└── Section ordering/arrangement

Card/Panel Styling
├── Card borders, shadows, backgrounds
├── Header/title styling
├── Card padding (outer only)
└── Responsive card stacking

Page Layout
├── Sidebar width/collapse behavior
├── Header/nav responsiveness
├── Page margins/padding
└── Scroll container behavior
```

## The Wrapper Pattern

```tsx
// SAFE: Only the wrapper changes at breakpoints
<div className="chart-wrapper grid grid-cols-1 lg:grid-cols-2 gap-4">
  <div className="chart-card min-h-[300px] lg:min-h-[400px]">
    {/* Chart component remains UNTOUCHED */}
    <TransactionVolumeChart data={data} />
  </div>
</div>

// WRONG: Modifying chart internals for responsiveness
<TransactionVolumeChart
  data={data}
  height={isMobile ? 200 : 400}  // DON'T
  showLegend={!isMobile}         // DON'T
  tickCount={isMobile ? 3 : 6}   // DON'T
/>
```

## Definition of "Breaking"

A change is BREAKING if it causes:

1. **Visual Overflow**: Horizontal scroll, content cropped
2. **Data Display Issues**: Unreadable labels, off-screen tooltips
3. **Filter Dysfunction**: Filters not visible, state stops affecting charts
4. **Responsive Breakage**: Layout broken at any viewport
5. **Cross-Platform Failure**: Works on desktop but breaks on mobile

## Pre-Flight Check

Before modifying any dashboard file, answer:

1. Does this file contain chart rendering code? → Extra caution
2. Does this file contain filter state/logic? → Extra caution
3. Will my CSS changes cascade beyond the target element? → Scope it
4. Am I changing anything inside a chart component's props? → STOP, ask user

---

# Quick Reference Cards

## Card 1: Adding a New Chart

```
1. Create component in frontend/src/components/powerbi/
2. Import usePowerBIFilters() from context
3. Use buildApiParams() for ALL API calls
4. Add highlight to useEffect dependencies (unless time-series)
5. If X-axis is TIME → use excludeHighlight: true
```

## Card 2: Filter Hierarchy

```
Global Slicers (sidebar)     → Apply to ALL charts
    ↓
Cross-Filters (chart clicks) → Apply to ALL charts
    ↓
Fact Filters (price bins)    → Apply to Transaction Table ONLY
```

## Card 3: Drill vs Cross-Filter

```
DRILL = Visual-local (only that chart changes)
CROSS-FILTER = Dashboard-wide (all charts update)

Time click    → Cross-filter (updates all)
Location click → Cross-filter (updates all)
Drill up/down → Local only (one chart)
```

## Card 4: Time-Series Chart Rule

```
If X-axis = TIME (year/quarter/month):
  → Use excludeHighlight: true
  → Chart shows full timeline, visual highlight only

If X-axis = CATEGORY (district/bedroom/price):
  → Use excludeHighlight: false (default)
  → Chart filters to highlighted period
```

---

# See Also

- [CLAUDE.md](./CLAUDE.md) - Project overview and implementation guides
- [TECHNICAL_ARCHITECTURE.md](./TECHNICAL_ARCHITECTURE.md) - System design and data flows
