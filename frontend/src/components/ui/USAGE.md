# Responsive UI Components - Usage Guide

Standardized responsive components for the Singapore Property Analytics Dashboard.

## Quick Start

```tsx
import {
  ChartCard,
  KPICard,
  FilterBar,
  DataTable,
  DashboardSection,
  ChartGrid,
  KPIGrid,
  useDeviceType,
} from '../components/ui';
```

---

## Components

### ChartCard

Responsive wrapper for all charts. Follows the chart-container-contract skill.

```tsx
// Basic usage
<ChartCard title="Transaction Volume" minHeight={300}>
  <Chart data={data} options={options} />
</ChartCard>

// With all features
<ChartCard
  title="Price Trends"
  subtitle="Monthly median PSF"
  info="3,456 transactions"
  minHeight={350}
  isLoading={loading}
  isUpdating={refetching}
  error={error?.message}
  actions={<DrillButtons />}
  fullWidth  // Spans 2 columns in grid
>
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data}>...</LineChart>
  </ResponsiveContainer>
</ChartCard>
```

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | string | required | Chart title |
| `subtitle` | string | - | Secondary text |
| `children` | ReactNode | required | Chart component |
| `minHeight` | number | 300 | Minimum height in px |
| `aspectRatio` | string | - | CSS aspect ratio (e.g., "16/9") |
| `isLoading` | boolean | false | Shows skeleton loader |
| `isUpdating` | boolean | false | Dims content, shows spinner |
| `error` | string | - | Shows error state |
| `actions` | ReactNode | - | Header actions |
| `fullWidth` | boolean | false | Spans full width in grid |

---

### KPICard

Responsive stat/metric cards.

```tsx
// Basic usage
<KPICard
  title="Total Transactions"
  value="12,345"
/>

// With all features
<KPICard
  title="Total Quantum"
  subtitle="past 30 days"
  value="$2.3B"
  loading={false}
  icon={<DollarIcon />}
  trend={{ value: 5.2, direction: 'up', label: 'vs last month' }}
  variant="highlighted"  // 'default' | 'highlighted' | 'muted'
  onClick={() => handleClick()}
/>
```

**Use KPIGrid for layout:**
```tsx
<KPIGrid columns={4}>
  <KPICard title="New Sales" value="1,234" />
  <KPICard title="Resales" value="5,678" />
  <KPICard title="Avg PSF" value="$1,850" />
  <KPICard title="YoY Change" value="+12%" />
</KPIGrid>
```

---

### FilterBar

Desktop filter bar + mobile drawer pattern.

```tsx
// Basic usage
<FilterBar
  activeCount={3}
  onClearAll={handleClearAll}
  filterChips={
    <>
      <FilterChip label="District 9" onRemove={() => removeFilter('d9')} />
      <FilterChip label="3BR" onRemove={() => removeFilter('3br')} />
    </>
  }
>
  {/* Filter controls - inline on desktop, stacked in drawer on mobile */}
  <FilterControl label="District" width="md">
    <Select options={districts} value={selected} onChange={setSelected} />
  </FilterControl>
  <FilterControl label="Bedrooms" width="sm">
    <BedroomButtons />
  </FilterControl>
</FilterBar>
```

**Subcomponents:**
- `FilterControl` - Wrapper for individual filters with label
- `FilterChip` - Removable chip showing active filter
- `FilterSection` - Collapsible section in mobile drawer
- `FilterDrawer` - The mobile drawer (used internally)

---

### DataTable

Responsive table with automatic mobile card view.

```tsx
const columns = [
  { key: 'project', label: 'Project', primary: true, sortable: true },
  { key: 'district', label: 'District', sortable: true },
  { key: 'price', label: 'Price', align: 'right', sortable: true,
    render: (val) => `$${val.toLocaleString()}` },
  { key: 'type', label: 'Type', showInCard: false },  // Hidden in card view
];

<>
  <DataTableHeader
    title="Transactions"
    totalRecords={pagination.total}
    activeFilters={3}
    onRefresh={refetch}
  />
  <DataTable
    data={transactions}
    columns={columns}
    loading={loading}
    error={error}
    maxHeight={400}
    sortConfig={{ column: 'price', order: 'desc' }}
    onSort={handleSort}
    onRowClick={(row) => openDetail(row)}
    cardViewBreakpoint="md"  // Switch to cards below this breakpoint
  />
  <DataTablePagination
    currentPage={page}
    totalPages={totalPages}
    totalRecords={total}
    pageSize={25}
    onPageChange={setPage}
    onPageSizeChange={setPageSize}
  />
</>
```

---

### Layout Components

**DashboardSection** - Titled section with spacing:
```tsx
<DashboardSection title="Market Overview" subtitle="Last 30 days">
  {/* Content */}
</DashboardSection>
```

**ChartGrid** - Responsive grid for charts:
```tsx
<ChartGrid columns={2}>  {/* 1 col mobile, 2 cols desktop */}
  <ChartCard title="Chart 1">...</ChartCard>
  <ChartCard title="Chart 2">...</ChartCard>
</ChartGrid>
```

**KPIGrid** - Grid for KPI cards:
```tsx
<KPIGrid columns={4}>  {/* 2 cols mobile, 4 cols desktop */}
  <KPICard ... />
</KPIGrid>
```

**SidebarLayout** - Desktop sidebar + main content:
```tsx
<SidebarLayout
  sidebar={<FilterSidebar />}
  sidebarWidth="default"
  sidebarCollapsed={collapsed}
>
  <DashboardMain>
    {/* Main content */}
  </DashboardMain>
</SidebarLayout>
```

---

## Responsive Hooks

```tsx
import {
  useDeviceType,
  useCurrentBreakpoint,
  useBreakpointUp,
  useBreakpointDown,
  useWindowSize,
  useIsTouchDevice,
} from '../components/ui';

function MyComponent() {
  const { isMobile, isTablet, isDesktop } = useDeviceType();
  const breakpoint = useCurrentBreakpoint(); // 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  const isLargeScreen = useBreakpointUp('lg');
  const isBelowTablet = useBreakpointDown('md');
  const { width, height } = useWindowSize();
  const isTouch = useIsTouchDevice();

  return (
    <div>
      {isMobile && <MobileView />}
      {isDesktop && <DesktopView />}
    </div>
  );
}
```

---

## Breakpoint Strategy

Desktop-first approach per `responsive-layout-system` skill:

| Breakpoint | Width | Use Case |
|------------|-------|----------|
| xs | < 640px | Small mobile |
| sm | 640px+ | Mobile |
| md | 768px+ | Tablet portrait |
| lg | 1024px+ | Tablet landscape / small desktop |
| xl | 1280px+ | Desktop |
| 2xl | 1440px+ | Large desktop (PRIMARY TARGET) |

**Test at these widths:**
- 375px (iPhone SE)
- 768px (iPad portrait)
- 1024px (iPad landscape)
- 1440px (MacBook 15")

---

## Migration Example

### Before (existing KPICard in MacroOverview.jsx):
```tsx
function KPICard({ title, subtitle, value, loading, icon }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <span className="text-sm">{title}</span>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
```

### After (using standardized component):
```tsx
import { KPICard, KPIGrid } from '../components/ui';

<KPIGrid columns={3}>
  <KPICard
    title="Total New Sales"
    subtitle="past 30 days"
    value={kpis.newSalesCount.toLocaleString()}
    loading={kpis.loading}
    icon={<ChartIcon />}
  />
</KPIGrid>
```

---

## Checklist Before Using

Per `responsive-dod` skill, verify components at:

- [ ] 1440px (desktop) - Primary layout
- [ ] 1024px (tablet landscape)
- [ ] 768px (tablet portrait)
- [ ] 375px (mobile)

Check:
- [ ] No horizontal overflow
- [ ] Touch targets ≥ 44px on mobile
- [ ] All content accessible
- [ ] Charts render correctly
- [ ] Filters work at all sizes
