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
│       │       • location: region → district (NO project)        │
│       │                                                         │
│       ├── selectedProject (drill-through only)                  │
│       │       • name, district                                  │
│       │       • Does NOT affect global charts                   │
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
│       │       └── region/district global, project local view    │
│       │                                                         │
│       ├── ProjectDetailPanel (drill-through only)               │
│       │       └── Opens when project selected, own API queries  │
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
│   └── PowerBIFilterContext.jsx  # Filter state management + selectedProject
├── components/powerbi/
│   ├── PowerBIFilterSidebar.jsx  # Dimension slicers
│   ├── TimeTrendChart.jsx        # Time dimension (highlight)
│   ├── VolumeByLocationChart.jsx # Location dimension (cross-filter, local project view)
│   ├── PriceDistributionChart.jsx # Price dimension (fact-only filter)
│   ├── TransactionDataTable.jsx  # Fact table (data sink)
│   ├── DrillButtons.jsx          # Drill up/down controls
│   ├── DrillBreadcrumb.jsx       # Navigation breadcrumbs
│   └── ProjectDetailPanel.jsx    # Project drill-through (independent of global charts)
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

// Drill hierarchy for location-based charts (GLOBAL hierarchy stops at district)
// Project is drill-through only - opens ProjectDetailPanel, does NOT affect other charts
const LOCATION_DRILL_LEVELS = ['region', 'district'];  // NO 'project'
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

### MANDATORY: Drill Button Boundary Rules

**Drill buttons MUST be automatically disabled at hierarchy boundaries:**

| Hierarchy Level | Up Button (↑) | Down Button (↓) |
|-----------------|---------------|-----------------|
| **Time: Year** (highest) | ❌ Disabled | ✅ Enabled |
| **Time: Quarter** | ✅ Enabled | ✅ Enabled |
| **Time: Month** (lowest) | ✅ Enabled | ❌ Disabled |
| **Location: Region** (highest) | ❌ Disabled | ✅ Enabled |
| **Location: District** (lowest) | ✅ Enabled | ❌ Disabled |

**Note:** Project is NOT part of the global location hierarchy. Project selection is drill-through only (opens ProjectDetailPanel).

**Implementation Logic (in DrillButtons.jsx):**

```jsx
// Time: ['year', 'quarter', 'month']
// Location: ['region', 'district']  (NO 'project' - that's drill-through)
const levels = ['region', 'district'];
const currentIndex = levels.indexOf(currentLevel);

// SAFEGUARD: If level not found (-1), default to 0 to prevent incorrect button state
const safeIndex = currentIndex >= 0 ? currentIndex : 0;

const canDrillUp = safeIndex > 0;                    // Can't go up from highest
const canDrillDown = safeIndex < levels.length - 1; // Can't go down from lowest
```

**Why safeguard against -1 index:**
If `indexOf` returns -1 (invalid level value), without safeguard:
- `-1 > 0` = false → canDrillUp correctly disabled
- `-1 < 2` = true → canDrillDown **incorrectly enabled** ← BUG

The safeguard ensures buttons are always disabled at boundaries, even with unexpected state.

**Button Styling:**
```jsx
// Enabled: Interactive styling
const enabledStyle = "bg-white border border-[#94B4C1] hover:bg-[#EAE0CF] text-[#547792]";

// Disabled: Greyed out, no hover, cursor not-allowed
const disabledStyle = "bg-[#EAE0CF]/50 border border-[#94B4C1]/50 text-[#94B4C1] cursor-not-allowed";
```

**Never allow drill beyond boundaries:**
- Clicking disabled button = no action
- Clicking chart data at lowest level = apply cross-filter (not drill)
- System state should never allow drill level outside defined hierarchy

### Project Drill-Through (NOT Global Hierarchy)

**CRITICAL: Project is NOT part of the global location hierarchy.**

| Level | Part of Global Hierarchy? | Action on Click |
|-------|---------------------------|-----------------|
| Region | ✅ Yes | Drill down to district |
| District | ✅ Yes (lowest global level) | Show projects locally |
| Project | ❌ No (drill-through only) | Open ProjectDetailPanel |

**Implementation:**

```jsx
// In VolumeByLocationChart.jsx

// LOCAL state for showing projects (not global)
const [showProjectsForDistrict, setShowProjectsForDistrict] = useState(null);

const handleClick = (event) => {
  if (showProjectsForDistrict) {
    // Showing projects: Open detail panel (does NOT affect other charts)
    setSelectedProject(projectName, district);
  } else if (drillPath.location === 'region') {
    // At region: Drill down to district (global)
    drillDown('location', regionValue, regionValue);
  } else if (drillPath.location === 'district') {
    // At district: Show projects for that district (LOCAL view)
    setShowProjectsForDistrict(districtValue);
  }
};
```

**Why Project is Drill-Through Only:**

1. **Market-level charts should not change** when viewing a single project
2. **Projects are too granular** for market analysis (hundreds of projects)
3. **Power BI pattern**: Drill-through opens detail page, doesn't filter main page
4. **Context preservation**: Users can explore a project without losing market view

**ProjectDetailPanel:**

- Opens as a modal/overlay when a project is selected
- Fetches project-specific data (trend + price distribution)
- Uses its own API queries - does NOT use `buildApiParams()` from context
- Other dashboard charts remain completely unchanged
- Close button clears `selectedProject` state

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

---

## Problem-Solving & Bug-Fixing Rules (MANDATORY)

When diagnosing or fixing any issue, Claude MUST follow these rules:

### 1. Fix the **class of problem**, not just the symptom
- Do not patch a single line without checking whether the same logic exists elsewhere.
- Assume similar bugs may exist in other files, layers, or execution paths.

### 2. Always ask: "Where else could this fail?"
- Before implementing a fix, scan for:
  - duplicate logic
  - repeated assumptions
  - parallel code paths
- If the fix applies in multiple places, refactor or centralize it.

### 3. Prefer invariant enforcement over conditional patches
- Add guardrails, assertions, or validations that prevent invalid states.
- Do not rely on "this probably won't happen again."

### 4. Avoid non-deterministic behavior
- A fix must produce the same result on every run.
- Startup behavior, background tasks, or repeated executions must not change outcomes unless explicitly intended.

### 5. No hidden side effects
- Fixes must not silently mutate data, state, or configuration unless explicitly requested.
- If a fix changes behavior outside the immediate issue, it must be stated clearly.

### 6. Think in terms of lifecycle, not moment
- Consider:
  - first run
  - re-run
  - restart
  - future data
  - future contributors
- A fix that only works "right now" is incomplete.

### 7. Default to future safety
- Assume future features will reuse this logic.
- Assume future data will be messier than today's.
- Fixes should degrade safely, not catastrophically.

### 8. Explain tradeoffs explicitly
- If a fix is chosen because it's simpler, faster, or temporary, say so.
- Never hide limitations.

### 9. If unsure, stop and ask
- If a change might affect unrelated behavior, ask before proceeding.
- Do not guess silently.

### 10. Optimize for correctness first, elegance second
- Correct, boring, explicit code is preferred over clever shortcuts.

---

## Outlier Exclusion Standard (Single Source of Truth)

### The Rule

> **All analytics queries MUST exclude outliers using `WHERE is_outlier = false` or equivalent.**

### Where Outliers Are Marked

Outliers are marked during data upload in `scripts/upload.py`:
- Uses Global IQR method to identify extreme prices
- Sets `is_outlier = true` on affected rows (soft-delete, not hard-delete)
- Records are preserved but excluded from analytics

### Outlier Exclusion Checklist

Every query that aggregates transaction data MUST exclude outliers:

| Layer | File | How to Exclude |
|-------|------|----------------|
| **Dashboard Service** | `services/dashboard_service.py` | `WHERE is_outlier = false` in SQL |
| **Analytics Routes** | `routes/analytics.py` | `WHERE is_outlier = false` in SQL |
| **Data Computation** | `services/data_computation.py` | `WHERE is_outlier = false` in SQL |
| **Transaction Model** | `models/transaction.py` | Use `.filter(Transaction.is_outlier == False)` |

### Anti-Pattern: Forgetting Outlier Exclusion

```python
# ❌ BAD - Includes outliers, will show $890M transactions
query = db.session.query(func.count(Transaction.id)).all()

# ✅ GOOD - Excludes outliers
query = db.session.query(func.count(Transaction.id)).filter(
    or_(Transaction.is_outlier == False, Transaction.is_outlier == None)
).all()
```

### Validation

When adding new analytics endpoints or charts:
1. Check if query touches `transactions` table
2. If yes, add `is_outlier = false` filter
3. Test with known outlier data to confirm exclusion
