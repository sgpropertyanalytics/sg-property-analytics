# Frontend Codebase Audit

## Current Components

| Component | Purpose | Props | API Used | Filters/State |
|-----------|---------|-------|----------|---------------|
| **BarChart** | Renders bar charts using Chart.js | `data`, `selectedBedrooms`, `valueFormatter`, `title`, `horizontal`, `stacked`, `showCountLabels`, `beginAtZero` | None (receives data as prop) | None (display only) |
| **LineChart** | Renders line charts for price/PSF trends | `data`, `selectedBedrooms`, `valueFormatter`, `title` | None (receives data as prop) | None (display only) |
| **RegionChart** | Renders line charts for CCR/RCR/OCR trends | `data`, `valueFormatter`, `title`, `isPSF` | None (receives data as prop) | None (display only) |
| **SaleTypeChart** | Renders line chart for New Sale vs Resale trends | `data` | None (receives data as prop) | None (display only) |
| **Layout** | Wrapper component with sidebar layout | `children` | None | Manages `sidebarCollapsed` state |
| **Sidebar** | Navigation sidebar with collapsible groups | `collapsed`, `onCollapse` | None | Manages `expandedGroups` state (By Price, By Volume, By Project) |
| **Card** | Simple wrapper for content sections | `title`, `children` | None | None |
| **GlobalFilterBar** | Global filter controls (bedroom, segment, district) | `selectedBedrooms`, `setSelectedBedrooms`, `selectedSegment`, `setSelectedSegment`, `selectedDistrict`, `setSelectedDistrict`, `availableDistricts` | None | Manages global filter state |
| **DistrictSummaryVolumeLiquidity** | District summary table with volume/liquidity metrics | `selectedBedrooms`, `selectedSegment`, `volumeData` | `getProjectsByDistrict` | Manages `sortBy`, `expandedDistricts`, `districtProjects`, `loadingDistricts` |
| **DistrictSummaryPrice** | District summary table with price metrics | `selectedSegment`, `selectedDistrict` | `getMarketStatsByDistrict`, `getPriceProjectsByDistrict` | Manages `priceSectionBedrooms`, `priceSortBy`, `priceSortTimeframe`, `priceStatsByDistrict`, `priceDistrictProjects`, `priceExpandedDistricts`, `priceLoadingDistricts`, `excludedDistricts` |

## Current Pages

| Page | Route | Components Used | API Calls | Filters Managed |
|------|-------|-----------------|-----------|-----------------|
| **Dashboard** | `/dashboard` | `GlobalFilterBar`, `DistrictSummaryVolumeLiquidity`, `DistrictSummaryPrice`, `Card`, `LineChart`, `BarChart`, `RegionChart`, `SaleTypeChart` | `getPriceTrends`, `getTotalVolume`, `getAvgPsf`, `getSaleTypeTrends`, `getPriceTrendsBySaleType`, `getPriceTrendsByRegion`, `getPsfTrendsByRegion`, `getMarketStats`, `getMarketStatsByDistrict`, `getComparableValueAnalysis`, `getProjectsByDistrict`, `getPriceProjectsByDistrict` | `selectedBedrooms`, `selectedSegment`, `selectedDistrict`, `saleTypeSegment` |
| **Login** | `/login` | None (standalone form) | `login`, `register` | `email`, `password`, `isLogin`, `error`, `loading` |
| **price/** | (Empty directory) | - | - | - |
| **project/** | (Empty directory) | - | - | - |
| **volume/** | (Empty directory) | - | - | - |

## Global State (Context)

| Context | State Variables | Used By | API Calls |
|---------|-----------------|---------|-----------|
| **DataContext** | `availableDistricts`, `apiMetadata`, `loading`, `error`, `isDataReady` | `Dashboard` | `getDistricts`, `getHealth` |

## API Functions (from `src/api/client.js`)

### Analytics Endpoints
| Function | Endpoint | Parameters | Used By |
|----------|----------|------------|---------|
| `getHealth` | `/health` | None | `DataContext` |
| `getDistricts` | `/districts` | None | `DataContext` |
| `getResaleStats` | `/resale_stats` | `districts`, `segment`, `start_date`, `end_date` | Not currently used |
| `getPriceTrends` | `/price_trends` | `districts`, `segment` | `Dashboard` |
| `getTotalVolume` | `/total_volume` | `districts`, `segment` | `Dashboard` |
| `getAvgPsf` | `/avg_psf` | `districts`, `segment` | `Dashboard` |
| `getTransactions` | `/transactions` | `districts`, `bedroom`, `segment`, `limit`, `start_date`, `end_date` | Not currently used |
| `getSaleTypeTrends` | `/sale_type_trends` | `districts`, `segment` | `Dashboard` |
| `getPriceTrendsBySaleType` | `/price_trends_by_sale_type` | `districts`, `segment` | `Dashboard` |
| `getPriceTrendsByRegion` | `/price_trends_by_region` | `districts` | `Dashboard` |
| `getPsfTrendsByRegion` | `/psf_trends_by_region` | `districts` | `Dashboard` |
| `getMarketStats` | `/market_stats` | `segment` | `Dashboard` |
| `getMarketStatsByDistrict` | `/market_stats_by_district` | `districts`, `bedroom`, `segment`, `short_months`, `long_months` | `Dashboard` (via `DistrictSummaryPrice`) |
| `getProjectsByDistrict` | `/projects_by_district` | `district`, `bedroom`, `segment` | `Dashboard` (via `DistrictSummaryVolumeLiquidity`) |
| `getPriceProjectsByDistrict` | `/price_projects_by_district` | `district`, `bedroom`, `months`, `segment` | `Dashboard` (via `DistrictSummaryPrice`) |
| `getComparableValueAnalysis` | `/comparable_value_analysis` | `target_price`, `band`, `bedroom`, `districts`, `min_lease`, `sale_type` | `Dashboard` (Buy Box feature) |

### Auth Endpoints
| Function | Endpoint | Parameters | Used By |
|----------|----------|------------|---------|
| `register` | `/auth/register` | `email`, `password` | `Login` |
| `login` | `/auth/login` | `email`, `password` | `Login` |
| `getCurrentUser` | `/auth/me` | None | Not currently used |

## Dashboard Component Structure

### Main Dashboard State
- **Global Filters**: `selectedBedrooms`, `selectedSegment`, `selectedDistrict`
- **Data State**: `priceTrends`, `volumeData`, `psfData`, `saleTypeTrends`, `priceTrendsBySaleType`, `priceTrendsByRegion`, `psfTrendsByRegion`, `marketStats`, `marketStatsByDistrict`, `buyBoxResult`
- **UI State**: `saleTypeSegment`, `buyBoxLoading`, `loading`, `error`

### Dashboard Sections
1. **Global Filter Bar** - Controls filters for all sections
2. **Price Trend by Quarter** - LineChart + RegionChart
3. **PSF Trend by Quarter** - LineChart + RegionChart
4. **Transaction Count by Bedroom Type** - BarChart
5. **Transaction Count: New Sale vs Resale** - SaleTypeChart
6. **District Summary (Volume & Liquidity)** - `DistrictSummaryVolumeLiquidity` component
7. **Median Price: New Sale vs Resale by Bedroom Type** - LineChart
8. **District Summary (Price)** - `DistrictSummaryPrice` component
9. **Comparable Value Analysis (Buy Box)** - Form + results display

### Data Flow
1. **DataContext** fetches `availableDistricts` and `apiMetadata` on app mount
2. **Dashboard** uses context data and manages its own filter state
3. **Global filters** affect all API calls in Dashboard's main `useEffect`
4. **Sub-components** (`DistrictSummaryVolumeLiquidity`, `DistrictSummaryPrice`) have their own local state and make additional API calls when expanded

## Key Observations

### Filter Application
- **Global filters** (`selectedBedrooms`, `selectedSegment`, `selectedDistrict`) are applied to:
  - `getPriceTrends`
  - `getTotalVolume`
  - `getAvgPsf`
  - `getSaleTypeTrends`
  - `getPriceTrendsByRegion`
  - `getPsfTrendsByRegion`
- **Local filters** in sub-components:
  - `DistrictSummaryVolumeLiquidity` uses global `selectedBedrooms` and `selectedSegment`
  - `DistrictSummaryPrice` has its own `priceSectionBedrooms` filter (independent of global)

### Unused API Functions
- `getResaleStats` - Not currently called
- `getTransactions` - Not currently called
- `getCurrentUser` - Not currently called

### Empty Directories (Future Routes)
- `src/pages/price/` - Planned price analysis pages
- `src/pages/project/` - Planned project analysis pages
- `src/pages/volume/` - Planned volume analysis pages
- `src/components/dashboard/` - Empty (potential future dashboard-specific components)
- `src/components/ui/` - Empty (potential future UI components)

### Sidebar Navigation
The `Sidebar` component has navigation items for routes that don't exist yet:
- `/price/stats` - Market Stats
- `/price/trends` - Price Trends
- `/price/districts` - District Summary
- `/volume/transactions` - Transaction Volume
- `/volume/region` - Region Analysis
- `/project/search` - Project Search
- `/project/compare` - Compare Projects

These routes are not yet implemented - all functionality is currently in the single `Dashboard` page.

## Migration Notes

When migrating to the new sidebar structure:
1. **Preserve all existing API calls** - All endpoints are actively used
2. **Maintain filter state** - Global filters affect multiple sections
3. **Component reusability** - Chart components are pure display components (good for reuse)
4. **State management** - Consider lifting some local state (e.g., `priceSectionBedrooms`) to global if needed for consistency
5. **Route planning** - Empty directories suggest planned separation of concerns

