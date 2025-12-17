# Frontend Codebase Status Summary
**Branch:** `feature/dashboard-redesign`  
**Last Updated:** Current session

## 🎨 Current Architecture

### **Layout System**
- **Layout Component** (`src/components/layout/Layout.jsx`)
  - Wraps all dashboard pages with consistent sidebar + content structure
  - Manages sidebar collapsed state
  - Main content area: `ml-72` (288px) when expanded, `ml-16` (64px) when collapsed
  - Background: `bg-slate-50`
  - Padding: `p-6 md:p-8` with `max-w-7xl mx-auto` container

- **Sidebar Component** (`src/components/layout/Sidebar.jsx`)
  - **Theme:** "Deep Ocean" command center style
  - **Colors:** Dark slate-900 background, teal-500 accents
  - **Width:** `w-72` (288px) expanded, `w-16` (64px) collapsed
  - **Features:**
    - Logo: "SG PROPERTY Intelligence" with Building2 icon
    - **Embedded Market Filters** (hidden when collapsed):
      - Bedroom selector (1, 2, 3+)
      - District search input
    - Navigation with expandable groups
    - Smooth collapse/expand transitions
    - Active route highlighting (teal accents)

### **Navigation Structure**
```
Dashboard → / (redirects to /dashboard)
Market Reports → /reports
Analytics (expandable)
  ├─ Volume Trends → /volume
  └─ Price Heatmap → /heatmap
Comparables (expandable)
  ├─ Project Search → /projects
  └─ Watchlist → /watchlist
```

**Note:** Most routes (`/reports`, `/volume`, `/heatmap`, `/projects`, `/watchlist`) are **not yet implemented** - they will show 404. Only `/dashboard` is functional.

## 📁 File Structure

```
frontend/src/
├── api/
│   └── client.js              # Axios client with auto-detection (localhost in dev, Render in prod)
├── components/
│   ├── layout/
│   │   ├── Layout.jsx        # Main layout wrapper
│   │   ├── Sidebar.jsx        # Deep Ocean sidebar with filters
│   │   └── index.js           # Barrel export
│   ├── BarChart.jsx           # Chart.js bar chart component
│   ├── LineChart.jsx          # Chart.js line chart component
│   ├── RegionChart.jsx        # CCR/RCR/OCR region chart
│   └── SaleTypeChart.jsx      # New Sale vs Resale chart
├── context/
│   └── DataContext.jsx        # Global state: districts, API metadata
├── lib/
│   └── utils.js               # cn() utility (clsx + tailwind-merge)
├── pages/
│   ├── Dashboard.jsx          # Main dashboard (1620 lines - comprehensive analytics)
│   ├── Login.jsx              # Auth page
│   ├── price/                 # Empty (future routes)
│   ├── project/               # Empty (future routes)
│   └── volume/                # Empty (future routes)
└── App.jsx                    # Root component with routing
```

## 🔧 Key Features

### **1. API Client (`src/api/client.js`)**
- **Auto-detection logic:**
  1. Uses `VITE_API_URL` env var if set
  2. Uses production URL (`https://sg-property-analyzer.onrender.com/api`) if not localhost
  3. Falls back to `http://localhost:5000/api` for local dev
- **16 Analytics endpoints** (14 actively used)
- **3 Auth endpoints** (2 used)

### **2. Dashboard Page (`src/pages/Dashboard.jsx`)**
- **1620 lines** - comprehensive analytics dashboard
- **Global Filters:**
  - Bedroom types (2b, 3b, 4b) - multi-select
  - Market Segment (CCR/RCR/OCR/All)
  - District (All or specific)
- **Main Sections:**
  1. Global Filter Bar
  2. Price Trend by Quarter (LineChart + RegionChart)
  3. PSF Trend by Quarter (LineChart + RegionChart)
  4. Transaction Count by Bedroom Type (BarChart)
  5. Transaction Count: New Sale vs Resale (SaleTypeChart)
  6. District Summary (Volume & Liquidity) - expandable per-district
  7. Median Price: New Sale vs Resale by Bedroom Type (LineChart)
  8. District Summary (Price) - expandable per-district
  9. Comparable Value Analysis (Buy Box)

### **3. Global State (`src/context/DataContext.jsx`)**
- Provides `availableDistricts` (fetched once on mount)
- Provides `apiMetadata` (health status, row counts)
- Used by Dashboard for district dropdown

## 🎯 Current State

### ✅ **Completed**
- [x] Sidebar layout with "Deep Ocean" theme
- [x] Layout wrapper component
- [x] Embedded filters in sidebar (bedroom, district search)
- [x] Collapsible sidebar functionality
- [x] Dashboard integrated with Layout
- [x] API client auto-detection (dev vs prod)
- [x] All chart components working
- [x] Filter consistency fixes across backend routes
- [x] Utils library (`cn()` function)

### 🚧 **In Progress / Pending**
- [ ] Sidebar filters are **visual only** - not connected to Dashboard filters yet
- [ ] Most navigation routes not implemented (`/reports`, `/volume`, `/heatmap`, `/projects`, `/watchlist`)
- [ ] Sidebar navigation structure doesn't match existing Dashboard sections

### 🔄 **Integration Needed**
The sidebar has its own filter state (`bedroomFilter`, district search), but these are **not connected** to the Dashboard's global filters (`selectedBedrooms`, `selectedSegment`, `selectedDistrict`). 

**Next Steps:**
1. Connect sidebar filters to Dashboard state (lift state up or use context)
2. Implement missing routes or update sidebar navigation to match existing functionality
3. Sync sidebar bedroom filter format ('1', '2', '3+') with Dashboard format ('2b', '3b', '4b')

## 📊 Component Dependencies

```
App.jsx
├── DataProvider (Context)
│   └── Fetches: districts, API health
├── Layout
│   ├── Sidebar
│   │   ├── Local state: collapsed, expandedGroups, bedroomFilter
│   │   └── Navigation links (most routes not implemented)
│   └── Main Content Area
│       └── Dashboard
│           ├── GlobalFilterBar
│           ├── DistrictSummaryVolumeLiquidity
│           ├── DistrictSummaryPrice
│           └── Multiple Chart components
└── Login (standalone, no Layout)
```

## 🎨 Styling

- **Framework:** Tailwind CSS v4.1.18
- **Utilities:** `clsx` + `tailwind-merge` (via `cn()` function)
- **Icons:** Lucide React
- **Charts:** Chart.js + react-chartjs-2

## 🔌 API Integration

**Active Endpoints:**
- `/api/health` - Health check
- `/api/districts` - Available districts
- `/api/price_trends` - Price trends with filters
- `/api/market_stats_by_district` - District stats (with bedroom filter)
- `/api/projects_by_district` - Project breakdown
- `/api/price_projects_by_district` - Price breakdown by project
- `/api/sale_type_trends` - New Sale vs Resale
- `/api/price_trends_by_region` - CCR/RCR/OCR trends
- `/api/comparable_value_analysis` - Buy Box feature
- And more...

**Filter Support:**
- ✅ Bedroom filter: Applied consistently across routes
- ✅ District filter: Applied consistently
- ✅ Segment filter: Applied consistently
- ✅ Timeframe filters: Applied where relevant

## 🚀 Development

**Local Testing:**
- Server runs on: `http://localhost:3000` (configured in `vite.config.js`)
- Backend expected on: `http://localhost:5000` (if running locally)
- Or uses production API: `https://sg-property-analyzer.onrender.com/api`

**Build:**
- `npm run dev` - Development server
- `npm run build` - Production build
- `npm run preview` - Preview production build

## 📝 Recent Commits (feature/dashboard-redesign)

1. **efae568** - Fix API connection: Auto-detect production and use Render backend URL
2. **555dd16** - Fix build: Add utils.js to git and update .gitignore
3. **dc8aaa8** - Add sidebar layout with navigation structure
4. **ea97732** - Fix filter consistency across analytics routes
5. **e629ca9** - Fix bedroom filter not applied to market_stats_by_district endpoint

## 🎯 Next Steps Recommendations

1. **Connect Sidebar Filters to Dashboard**
   - Lift filter state to Layout or create FilterContext
   - Sync sidebar bedroom format with Dashboard format
   - Connect district search to Dashboard district filter

2. **Implement Missing Routes OR Update Sidebar**
   - Option A: Create pages for `/reports`, `/volume`, `/heatmap`, `/projects`, `/watchlist`
   - Option B: Update sidebar navigation to match existing Dashboard sections

3. **Refactor Dashboard**
   - Consider splitting Dashboard into smaller page components
   - Move sections to dedicated routes (e.g., `/price/stats`, `/volume/transactions`)

4. **Enhance Sidebar Filters**
   - Add segment filter (CCR/RCR/OCR)
   - Make filters functional (currently visual only)
   - Add filter persistence (localStorage)

