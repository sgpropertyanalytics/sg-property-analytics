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
