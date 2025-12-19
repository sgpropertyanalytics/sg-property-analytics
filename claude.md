# Singapore Property Analyzer - Project Guide

## Project Overview

A Power BI-style analytics dashboard for Singapore condo resale transactions. Built with:
- **Frontend**: React + Vite + Tailwind CSS + Chart.js
- **Backend**: Flask + SQLAlchemy + PostgreSQL
- **Hosting**: Render (512MB memory constraint)

---

## Color Palette Theme

**Source**: https://colorhunt.co/palette/21344854779294b4c1eae0cf

### Primary Colors (Navy/Blue Family)

| Color | Hex | RGB | Usage |
|-------|-----|-----|-------|
| **Deep Navy** | `#213448` | `rgb(33, 52, 72)` | Headings, primary text, CCR region |
| **Ocean Blue** | `#547792` | `rgb(84, 119, 146)` | Secondary text, labels, RCR region, chart bars |
| **Sky Blue** | `#94B4C1` | `rgb(148, 180, 193)` | Borders, icons, OCR region, disabled states |
| **Sand/Cream** | `#EAE0CF` | `rgb(234, 224, 207)` | Backgrounds, hover states, footers |

### Usage Patterns

```jsx
// Headings and primary text
className="text-[#213448]"

// Secondary text and labels
className="text-[#547792]"

// Borders and dividers
className="border-[#94B4C1]/50"

// Background with subtle tint
className="bg-[#EAE0CF]/30"

// Card styling
className="bg-white rounded-lg border border-[#94B4C1]/50"

// Footer bars
className="bg-[#EAE0CF]/30 border-t border-[#94B4C1]/30"
```

### Region Color Mapping (Charts)

```javascript
const regionColors = {
  CCR: `rgba(33, 52, 72, 0.8)`,   // #213448 - Deep Navy (Core Central Region)
  RCR: `rgba(84, 119, 146, 0.8)`, // #547792 - Ocean Blue (Rest of Central Region)
  OCR: `rgba(148, 180, 193, 0.8)` // #94B4C1 - Sky Blue (Outside Central Region)
};
```

### Bedroom Type Colors (Charts)

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

## Power BI Data Modeling Rules

### Golden Rule

> **Slicers belong to dimensions. Facts should almost never be slicers.**

### Filter Direction: Dimension → Fact (One-Way)

```
┌─────────────────┐         ┌─────────────────┐
│   DIMENSION     │────────▶│      FACT       │
│   (Slicers)     │         │   (Data Sink)   │
└─────────────────┘         └─────────────────┘
     Filters                  Gets Filtered
     Others                   Never Filters
```

### Current Architecture

| Component | Type | Filters Others? | Notes |
|-----------|------|-----------------|-------|
| **Sidebar Filters** | Dimension Slicers | Yes → All charts | Region, District, Bedroom, Sale Type |
| **Time Trend Chart** | Dimension Visual | Highlight only | Click applies visual highlight, not filter |
| **Volume by Location** | Dimension Visual | Yes (categorical) | Click filters by region/district |
| **Price Distribution** | Dimension Visual | Only → Fact table | Uses `factFilter` state |
| **Transaction Data Table** | **Fact Table** | Never | Pure data sink |

### Why Fact-Table Slicers Are Dangerous

If a slicer comes from a fact table (e.g., `Transactions[Price]`):

1. **Self-filtering**: You slice the same table you're aggregating
2. **Order-dependent measures**: Results change based on filter order
3. **Collapsed aggregates**: Totals lose meaning
4. **Hidden bias**: Row-level filtering creates invisible distortions

**Symptoms**:
- Averages that change when they shouldn't
- Totals that "collapse"
- KPIs that disagree across visuals

### Implementation Pattern

```jsx
// In PowerBIFilterContext.jsx

// factFilter - only applies to Fact tables
const [factFilter, setFactFilter] = useState({
  priceRange: { min: null, max: null },
});

// Dimension charts DON'T pass includeFactFilter
const params = buildApiParams({ ... });

// Fact table (TransactionDataTable) DOES pass includeFactFilter
const params = buildApiParams({ ... }, { includeFactFilter: true });
```

---

## Data Plumbing Architecture

### Backend Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  URA API Data ──▶ scripts/upload.py ──▶ PostgreSQL Database    │
│                         │                                       │
│                         ▼                                       │
│              services/data_validation.py                        │
│              (auto-runs on app startup)                         │
│                         │                                       │
│                         ├── remove_invalid_records()            │
│                         ├── remove_duplicates_sql()             │
│                         └── filter_outliers_sql() (IQR method)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PRE-COMPUTED STATS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  services/data_computation.py                                   │
│       │                                                         │
│       ├── recompute_all_stats() ──▶ api_stats table            │
│       │       • Aggregates by segment, district, bedroom        │
│       │       • Stores outliers_excluded count in metadata      │
│       │                                                         │
│       └── get_metadata() ──▶ Returns row_count, date range,    │
│                              outliers_excluded                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  routes/analytics.py                                            │
│       │                                                         │
│       ├── /api/dashboard   ──▶ dashboard_service.py            │
│       │       • Panels: summary, time_series, location_volume   │
│       │       • Panels: price_histogram, bedroom_mix            │
│       │       • SQL aggregation (no DataFrame in memory)        │
│       │                                                         │
│       ├── /api/aggregate   ──▶ SQL GROUP BY queries            │
│       │                                                         │
│       ├── /api/transactions ──▶ Paginated transaction list     │
│       │                                                         │
│       └── /api/filter-options ──▶ Available filter values      │
│                                                                 │
│  services/analytics_reader.py                                   │
│       └── Reads pre-computed stats from api_stats table        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Frontend Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      FILTER CONTEXT                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  context/PowerBIFilterContext.jsx                               │
│       │                                                         │
│       ├── filters (sidebar slicers)                             │
│       │       • dateRange, districts, bedroomTypes              │
│       │       • segment, saleType, psfRange, sizeRange          │
│       │                                                         │
│       ├── crossFilter (categorical dimension clicks)            │
│       │       • district, region, bedroom, sale_type            │
│       │                                                         │
│       ├── factFilter (dimension → fact only)                    │
│       │       • priceRange (from Price Distribution chart)      │
│       │                                                         │
│       ├── highlight (time visual emphasis, non-filtering)       │
│       │       • year, quarter, month                            │
│       │                                                         │
│       ├── drillPath (current hierarchy level)                   │
│       │       • time: year → quarter → month                    │
│       │       • location: region → district → project           │
│       │                                                         │
│       └── buildApiParams(additionalParams, options)             │
│               • options.includeFactFilter = true (for Fact)     │
│               • options.excludeHighlight = true (for Time)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       COMPONENTS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  pages/MacroOverview.jsx (Main Dashboard)                       │
│       │                                                         │
│       ├── PowerBIFilterSidebar (dimension slicers)              │
│       │                                                         │
│       ├── TimeTrendChart (dimension - highlight only)           │
│       │       └── Uses excludeHighlight: true                   │
│       │                                                         │
│       ├── VolumeByLocationChart (dimension - cross-filters)     │
│       │       └── Click applies region/district filter          │
│       │                                                         │
│       ├── PriceDistributionChart (dimension → fact only)        │
│       │       └── Click sets factFilter.priceRange              │
│       │                                                         │
│       └── TransactionDataTable (fact table - data sink)         │
│               └── Uses includeFactFilter: true                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Startup Self-Healing Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  app.py: create_app()                                           │
│       │                                                         │
│       └── _run_startup_validation()                             │
│               │                                                 │
│               ├── data_validation.run_all_validations()         │
│               │       ├── remove_invalid_records()              │
│               │       ├── remove_duplicates_sql()               │
│               │       └── filter_outliers_sql()                 │
│               │                                                 │
│               └── if data cleaned:                              │
│                       data_computation.recompute_all_stats()    │
│                       (preserves cumulative outliers_excluded)  │
│                                                                 │
│  Works with gunicorn (runs inside create_app, not run_app)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure Overview

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
    ├── data_computation.py   # Pre-compute stats to api_stats table
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
│   ├── TimeTrendChart.jsx        # Time dimension (highlight)
│   ├── VolumeByLocationChart.jsx # Location dimension (cross-filter)
│   ├── PriceDistributionChart.jsx # Price dimension (fact-only filter)
│   ├── TransactionDataTable.jsx  # Fact table (data sink)
│   ├── DrillButtons.jsx          # Drill up/down controls
│   └── DrillBreadcrumb.jsx       # Navigation breadcrumbs
└── pages/
    └── MacroOverview.jsx         # Main dashboard page
```

---

## Memory Constraints

Render free tier: **512MB RAM**

### Design Decisions for Memory Efficiency

1. **No in-memory DataFrames** - All analytics use SQL aggregation
2. **Server-side histogram** - `/api/dashboard?panels=price_histogram` computes bins in SQL
3. **Paginated transactions** - Never load all 100K+ records at once
4. **Pre-computed stats** - Heavy aggregations stored in `api_stats` table
5. **IQR outlier removal** - Reduces dataset size by removing extreme values

---

## Filtering Standard (Power BI Pattern)

### Global Slicers (Page Scope) — MUST Apply to Everything

All slicers in the **Global Slicer Bar** (sidebar) are **page-scoped** and **always apply to every visual** on the main page.

**Global slicers include:**
- Location (Districts, Market Segment: CCR/RCR/OCR)
- Date Range (From/To)
- Bedroom Types
- Sale Type (New Sale / Resale)
- PSF Range
- Size Range

**Rules:**
1. Every main-page API query **MUST** accept these global filters
2. Every main-page visual **MUST** use the filtered dataset returned from global filters
3. **No visual is allowed to "opt out"** of global slicers unless explicitly documented (rare exception)
4. Global slicers must be visible at all times and must not be duplicated inside individual chart cards

**Implementation:**
```jsx
// Global slicer state lives in PowerBIFilterContext (single source of truth)
const { buildApiParams, filters } = usePowerBIFilters();

// CORRECT: Use buildApiParams to include global filters
const params = buildApiParams({
  group_by: 'quarter',
  metrics: 'count,median_psf'
});

// WRONG: Ignoring global filters completely
const params = { region: localRegion, bedroom: localBedroom }; // DON'T DO THIS
```

### Local Filters (Visual Scope) — Narrow, Don't Replace

Visual components may add **local filters**, but local filters can only **further narrow** the already globally-filtered data. They cannot replace or override global filters.

**Example - Correct pattern:**
```jsx
// Start with global filters
const globalParams = buildApiParams({});

// Local filter ADDS to global (narrows further)
if (localTimeGrain) {
  globalParams.time_grain = localTimeGrain;
}
```

**Example - Wrong pattern:**
```jsx
// WRONG: Local filter ignores global filters entirely
const params = {
  region: localRegion,  // Ignores global district selection!
  bedroom: localBedroom // Ignores global bedroom selection!
};
```

### Visual-Level Filters vs Global Filters

| Filter Type | Scope | Can Override Global? | Example |
|-------------|-------|---------------------|---------|
| Global Slicer | All visuals | N/A (is the base) | Sidebar District filter |
| Local Filter | Single visual | NO - only narrows | Drill level (Year/Quarter/Month) |
| Visual Filter | Single visual | NO - only narrows | Chart-specific grouping |

---

## Power BI Interaction Semantics

### The Core Rule (Memorize This)

> **If the interaction answers "what happened when or where", it's a cross-filter.**
> **If it answers "what portion of this is related", it can be a highlight.**

| Intent | Interaction Type | Backend Query? |
|--------|------------------|----------------|
| Time and scope | **Cross-filter** | ✅ Yes |
| Composition and contribution | Highlight | ❌ No |

### The Four Interaction Concepts

| Concept | Meaning | Scope | Affects Backend? |
|---------|---------|-------|------------------|
| **Filter** | Hard constraint | Global / Page / Visual | ✅ Yes |
| **Highlight** | Focus inside same visual | Visual-level only | ❌ No (by default) |
| **Cross-highlight** | Focus propagated to other visuals | Multiple visuals | ❌ No (visual only) |
| **Cross-filter** | Filter propagated to other visuals | Multiple visuals | ✅ Yes |
| **Drill** | Change granularity | Visual navigation | ✅ Yes (re-queries) |

### MUST Be Cross-Filters (Non-Negotiable)

These interactions **always** update all other visuals + backend queries:

**1. Time-Based Charts** (Most Important)
- Monthly transaction trend, Quarterly price trend, YoY comparison
- User intent: "What happened in this month?"
- Behavior: Click = filter date range to that period → all visuals update
- **Time-axis click = cross-filter. This is non-negotiable for BI tools.**

**2. Geographic Scope**
- District bar chart, Region breakdown, Planning area
- User intent: "What's happening in this district?"
- Behavior: Click = filter to that district → all visuals update

**3. Market Segment Selectors**
- New Sale vs Resale, Tenure (99yr/FH), Property type
- User intent: "Show me this segment only."
- Behavior: Click = global filter → all visuals update

**4. Drill-Down Actions**
- Year → Quarter → Month, Region → District → Project
- Behavior: Changes granularity + re-queries backend

### Interaction Matrix (Use This)

| Interaction | Behavior | Implementation |
|-------------|----------|----------------|
| Time trend click | **Cross-filter** | `applyHighlight('time', 'month', value)` |
| District/Region click | **Cross-filter** | `applyCrossFilter('location', 'district', value)` |
| Sale type click | **Cross-filter** | `applyCrossFilter('sale_type', value)` |
| Bedroom segment click | **Cross-filter** | `applyCrossFilter('bedroom', value)` |
| Drill down | **Cross-filter** | Update drill level + filter breadcrumbs |
| Price bin click | Dimension → Fact only | `setFactFilter(priceRange)` |

### Interaction Standard

> **Time, location, and market-segment interactions act as cross-filters and update all visuals.**
> **Visual-only highlights are NOT used for primary navigation.**
> **All backend queries are driven by a single `activeFilters` object that merges sidebar filters and interaction-driven state.**

### The `activeFilters` Pattern (Single Source of Truth)

```jsx
// In PowerBIFilterContext.jsx

// activeFilters combines sidebar filters + highlight into one object
const activeFilters = useMemo(() => {
  const combined = { ...filters };

  // Apply highlight as date filter (if sidebar date not set)
  if (highlight.dimension && highlight.value && !filters.dateRange.start) {
    if (highlight.dimension === 'month') {
      const [year, month] = highlight.value.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      combined.dateRange = {
        start: `${highlight.value}-01`,
        end: `${highlight.value}-${String(lastDay).padStart(2, '0')}`
      };
    }
    // ... quarter, year handling
  }

  return combined;
}, [filters, highlight, ...]);

// Exposed from context
{
  filters,           // Raw sidebar filters only
  highlight,         // Current time highlight (if any)
  activeFilters,     // Combined: filters + highlight (use for queries)
  buildApiParams,    // Builds API params from activeFilters
}
```

### Component Dependency Rule (Critical)

**Every chart that should respond to highlights MUST include `highlight` in useEffect dependencies.**

```jsx
// ❌ BAD - Chart won't respond to time highlight clicks
useEffect(() => {
  fetchData();
}, [buildApiParams, filters]);

// ✅ GOOD - Chart responds to both filters AND highlights
useEffect(() => {
  fetchData();
}, [buildApiParams, filters, highlight]);
```

**Charts that respond to highlights:**
- `VolumeByLocationChart` ✅
- `BedroomMixChart` ✅
- `PriceDistributionChart` ✅
- `TransactionDataTable` ✅

**Charts that DON'T respond to highlights (time-series charts preserve timeline):**
- `TimeTrendChart` - Uses `excludeHighlight: true` (SOURCE of highlights)
- `NewVsResaleChart` - Uses `excludeHighlight: true` (time-series trend chart)

### Time-Series Chart Rule (Critical for New Charts)

> **If a chart's X-axis is TIME (year, quarter, month), it MUST use `excludeHighlight: true`.**

**Why**: Time-series charts show trends over time. Collapsing to a single point destroys context.

**How to identify a time-series chart:**
| Characteristic | Time-Series Chart | Breakdown Chart |
|----------------|-------------------|-----------------|
| X-axis | Time periods (months, quarters, years) | Categories (districts, bedrooms, price bins) |
| Purpose | Show trends over time | Show composition/distribution |
| On time highlight | Preserve full timeline, visual highlight only | Filter to highlighted period |
| `excludeHighlight` | `true` | `false` (default) |

**Examples:**
- `TimeTrendChart` → X-axis is time → `excludeHighlight: true`
- `NewVsResaleChart` → X-axis is time → `excludeHighlight: true`
- `VolumeByLocationChart` → X-axis is location → `excludeHighlight: false`
- `BedroomMixChart` → Segments are bedrooms → `excludeHighlight: false`

**When creating a new chart, ask:**
1. Does the X-axis represent time periods?
2. Would filtering to a single period destroy the chart's purpose?

If YES to both → use `excludeHighlight: true`.

### Backend Contract

The backend treats all incoming params as authoritative constraints:

```python
# Backend doesn't care if date_from/date_to came from:
# - Sidebar filter
# - Chart click highlight
# - Drill breadcrumb
#
# All are treated equally as constraints
@analytics_bp.route("/api/aggregate")
def aggregate():
    date_from = request.args.get('date_from')  # Constraint
    date_to = request.args.get('date_to')      # Constraint
    # ... apply as WHERE clauses
```

This keeps backend logic clean and deterministic.

### UX Indicator Pattern

When a highlight is active, show a visual indicator:

```jsx
// In chart header or filter bar
{highlight.value && (
  <span className="text-xs text-[#547792] flex items-center gap-1">
    Filtered to {formatHighlightLabel(highlight)}
    <button onClick={clearHighlight}>✕</button>
  </span>
)}
```

This avoids "why did everything change?" confusion.

### Interaction Summary

| User Action | What Happens | Scope |
|-------------|--------------|-------|
| Change sidebar filter | All charts re-fetch with new filter | Global |
| Click time bar (TimeTrendChart) | Sets highlight → activeFilters updates → all charts re-fetch | Cross-filter |
| Click location bar (VolumeByLocationChart) | Sets crossFilter → all charts re-fetch | Cross-filter |
| Click bedroom segment (BedroomMixChart) | Sets crossFilter → all charts re-fetch | Cross-filter |
| Click price bin (PriceDistributionChart) | Sets factFilter → only TransactionDataTable re-fetches | Dimension → Fact |
| Drill up/down | Only that chart changes granularity | Visual-local |

---

## Power BI Drill Up/Down Rules

### Core Principle

> **Drill ≠ Filter. Drill is visual-local by default.**

| Action | Scope | Effect |
|--------|-------|--------|
| **Drill** | Single visual only | Changes level of detail inside one chart |
| **Filter** | Cross-visual (dashboard) | Changes data scope across all visuals |

### Why Drill Must NOT Affect Other Visuals

If drill affected other charts, users would:
1. **Lose context** - Other charts change unexpectedly
2. **Confusion** - Can't understand why unrelated charts changed
3. **Perception of bugs** - Dashboard appears broken or unpredictable

Power BI treats drill as **visual-local by default** for this reason.

### Implementation Pattern

```jsx
// Drill state is LOCAL to each chart component
const [drillLevel, setDrillLevel] = useState('year'); // year → quarter → month
const [drillValue, setDrillValue] = useState(null);   // Selected value at current level

// Drill does NOT use global context - it's component state only
// This ensures other charts are never affected

// Drill hierarchy for time-based charts
const TIME_DRILL_LEVELS = ['year', 'quarter', 'month'];

// Drill hierarchy for location-based charts
const LOCATION_DRILL_LEVELS = ['region', 'district', 'project'];
```

### Drill UI Components

```jsx
// DrillButtons.jsx - Up/Down navigation
<DrillButtons
  canDrillDown={drillLevel !== 'month'}
  canDrillUp={drillLevel !== 'year'}
  onDrillDown={handleDrillDown}
  onDrillUp={handleDrillUp}
/>

// Show current level indicator
<span className="text-xs text-[#547792]">
  Showing: {drillLevel === 'year' ? 'Yearly' : drillLevel === 'quarter' ? 'Quarterly' : 'Monthly'}
</span>
```

### Click Behavior for Drill

```jsx
// Clicking a data point drills down into that value
const handleChartClick = (clickedValue) => {
  if (drillLevel === 'year') {
    setDrillLevel('quarter');
    setDrillValue(clickedValue); // e.g., "2023" → show Q1-Q4 of 2023
  } else if (drillLevel === 'quarter') {
    setDrillLevel('month');
    setDrillValue(clickedValue); // e.g., "2023-Q1" → show Jan-Mar 2023
  }
  // At month level, click does nothing (already at lowest level)
};
```

### MANDATORY: Standardized DrillButtons Component

**Every chart with drill functionality MUST use the `DrillButtons` component** for visual consistency across the dashboard. Never create custom drill buttons.

```jsx
import { DrillButtons } from './DrillButtons';

// GLOBAL MODE: Uses PowerBIFilterContext (affects other charts via breadcrumbs)
<DrillButtons hierarchyType="time" />
<DrillButtons hierarchyType="location" />

// LOCAL MODE: Uses local state (visual-local, does NOT affect other charts)
// Required props: localLevel, localLevels, localLevelLabels, onLocalDrillUp, onLocalDrillDown
<DrillButtons
  localLevel={localDrillLevel}
  localLevels={['year', 'quarter', 'month']}
  localLevelLabels={{ year: 'Year', quarter: 'Quarter', month: 'Month' }}
  onLocalDrillUp={handleDrillUp}
  onLocalDrillDown={handleDrillDown}
/>
```

**Why standardization matters:**
1. **Visual consistency** - All drill buttons look identical across all charts
2. **UX predictability** - Users learn one pattern, applied everywhere
3. **Maintenance** - Fix styling in one place, updates all charts
4. **Accessibility** - Consistent ARIA labels and keyboard navigation

**DrillButtons provides these controls:**
- **Drill Up (↑)** - Go back up one level in the hierarchy
- **Go to Next Level (↓)** - Drill down to next level for all data
- **View Transactions** - Scroll to transaction table
- **Current level label** - Shows Year/Quarter/Month

**REMOVED - Do NOT implement:**
- ~~Click-to-drill mode toggle~~ - This button was removed because it was dead code. No chart had click handlers wired to the drill mode state. If click-to-drill is needed in the future, it must be fully implemented (chart click handlers, drill mode state management) before adding the UI button.

---

## District to Region Mapping

```javascript
const DISTRICT_REGION_MAP = {
  // CCR - Core Central Region (Premium districts)
  '01': 'CCR', '02': 'CCR', '06': 'CCR', '07': 'CCR',
  '09': 'CCR', '10': 'CCR', '11': 'CCR',

  // RCR - Rest of Central Region (City fringe)
  '03': 'RCR', '04': 'RCR', '05': 'RCR', '08': 'RCR',
  '12': 'RCR', '13': 'RCR', '14': 'RCR', '15': 'RCR',
  '20': 'RCR', '21': 'RCR',

  // OCR - Outside Central Region (Suburban)
  '16': 'OCR', '17': 'OCR', '18': 'OCR', '19': 'OCR',
  '22': 'OCR', '23': 'OCR', '24': 'OCR', '25': 'OCR',
  '26': 'OCR', '27': 'OCR', '28': 'OCR',
};
```

---

## Bedroom Classification

| Bedroom Count | Category |
|---------------|----------|
| 1 | 1-Bedroom |
| 2 | 2-Bedroom |
| 3 | 3-Bedroom |
| 4 | 4-Bedroom |
| 5+ | 5+ Bedroom / Penthouse |
