---
name: responsive-layout-system
description: Desktop-first responsive layout system for data-heavy analytics dashboards. Use when creating new layouts, adding responsive behavior, or adapting existing pages for tablet/mobile. Provides breakpoint strategy, container patterns, and safe downshift techniques that preserve chart functionality. Pairs with ui-freeze skill for existing dashboard modifications.
---

# Responsive Layout System: Desktop-First + Safe Downshift

## Philosophy
Desktop users are PRIMARY. Build for 1440px+ first, then gracefully adapt down. Mobile/tablet must be USABLE and PRESENTABLE—not feature-complete clones.

## Core Breakpoint Strategy

```css
/* Tailwind-compatible breakpoints */
/* Desktop-first: start with full layout, override DOWN */

/* Full desktop: 1440px+ (primary target) */
/* Standard desktop: 1280px-1439px */
@media (max-width: 1439px) { /* xl breakpoint adjustments */ }

/* Small desktop/Large tablet: 1024px-1279px */
@media (max-width: 1279px) { /* lg breakpoint adjustments */ }

/* Tablet: 768px-1023px */
@media (max-width: 1023px) { /* md breakpoint adjustments */ }

/* Mobile: 320px-767px */
@media (max-width: 767px) { /* sm breakpoint adjustments */ }
```

### Tailwind Classes (Desktop-First Pattern)
```tsx
// Desktop-first: Define desktop layout, override for smaller
<div className="
  grid grid-cols-4 gap-6           // Desktop: 4 columns
  xl:grid-cols-4                    // Large desktop: 4 columns
  lg:grid-cols-3                    // Small desktop: 3 columns  
  md:grid-cols-2                    // Tablet: 2 columns
  grid-cols-1                       // Mobile: 1 column (base)
">
```

**Important:** Tailwind is mobile-first by default. For desktop-first thinking:
- Write your desktop layout as the largest breakpoint (`xl:` or `2xl:`)
- Then define smaller breakpoints going down
- OR use CSS custom media queries as shown above

## Layout Container System

### Main Page Container
```tsx
// Property Analytics Dashboard Layout
<div className="min-h-screen bg-gray-50">
  {/* Header - Fixed height, responsive padding */}
  <header className="h-16 px-4 md:px-6 lg:px-8 border-b bg-white">
    {/* ... */}
  </header>
  
  {/* Main content area with sidebar */}
  <div className="flex">
    {/* Sidebar - Collapsible on tablet/mobile */}
    <aside className="
      w-64 lg:w-72           // Desktop: fixed width
      md:w-16 md:hover:w-64  // Tablet: collapsed, expand on hover
      hidden sm:block        // Mobile: hidden (use hamburger)
      transition-all duration-200
      border-r bg-white
    ">
      {/* ... */}
    </aside>
    
    {/* Content area - Fluid */}
    <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
      {/* Dashboard content */}
    </main>
  </div>
</div>
```

### Dashboard Grid Container
```tsx
// Chart grid that adapts without breaking charts
<div className="dashboard-grid">
  {/* KPI Cards Row */}
  <div className="
    grid gap-4
    grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-4
  ">
    <KPICard title="Total Transactions" value={stats.total} />
    <KPICard title="Avg PSF" value={stats.avgPsf} />
    <KPICard title="Median Price" value={stats.median} />
    <KPICard title="YoY Change" value={stats.yoyChange} />
  </div>
  
  {/* Main Charts Row */}
  <div className="
    grid gap-4 mt-6
    grid-cols-1 lg:grid-cols-2
  ">
    <ChartCard title="Transaction Volume">
      <VolumeChart data={volumeData} />
    </ChartCard>
    <ChartCard title="Price Trends">
      <PriceTrendChart data={priceData} />
    </ChartCard>
  </div>
  
  {/* Full-width chart */}
  <div className="mt-6">
    <ChartCard title="Market Distribution">
      <DistributionChart data={distData} />
    </ChartCard>
  </div>
</div>
```

## Filter Panel Patterns

### Desktop: Horizontal filter bar
```tsx
<div className="
  filter-bar
  flex flex-wrap gap-4 items-end
  p-4 bg-white rounded-lg shadow-sm
  lg:flex-nowrap  // Desktop: single row
  md:flex-wrap    // Tablet: wrap as needed
">
  <FilterDropdown label="District" options={districts} />
  <FilterDropdown label="Property Type" options={types} />
  <FilterDropdown label="Bedroom" options={bedrooms} />
  <DateRangePicker label="Transaction Date" />
  <Button>Apply Filters</Button>
</div>
```

### Tablet/Mobile: Collapsible filter panel
```tsx
// Filter drawer for smaller screens
<div className="lg:hidden">
  <Button onClick={toggleFilters} className="w-full">
    <FilterIcon /> Filters {activeCount > 0 && `(${activeCount})`}
  </Button>
  
  {isOpen && (
    <div className="
      fixed inset-0 z-50 bg-black/50
      lg:hidden
    ">
      <div className="
        absolute right-0 top-0 h-full w-80 max-w-full
        bg-white p-4 overflow-y-auto
        animate-slide-in-right
      ">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold">Filters</h3>
          <Button variant="ghost" onClick={toggleFilters}>×</Button>
        </div>
        
        {/* Stacked filters for mobile */}
        <div className="space-y-4">
          <FilterDropdown label="District" options={districts} fullWidth />
          <FilterDropdown label="Property Type" options={types} fullWidth />
          <FilterDropdown label="Bedroom" options={bedrooms} fullWidth />
          <DateRangePicker label="Transaction Date" fullWidth />
        </div>
        
        <div className="mt-6 flex gap-2">
          <Button variant="outline" className="flex-1">Clear</Button>
          <Button className="flex-1">Apply</Button>
        </div>
      </div>
    </div>
  )}
</div>
```

## Chart Container Contract

### The Responsive Chart Wrapper
```tsx
// Standard chart card component
interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  minHeight?: number;  // Default: 300
}

export function ChartCard({ 
  title, 
  children, 
  className = '',
  minHeight = 300 
}: ChartCardProps) {
  return (
    <div className={`
      bg-white rounded-lg shadow-sm border
      p-4 md:p-6
      ${className}
    `}>
      <h3 className="text-sm font-medium text-gray-600 mb-4">
        {title}
      </h3>
      
      {/* Chart container - maintains minimum height */}
      <div 
        className="w-full overflow-hidden"
        style={{ minHeight: `${minHeight}px` }}
      >
        {/* Chart goes here - DO NOT modify the child */}
        {children}
      </div>
    </div>
  );
}
```

### Using with Recharts
```tsx
// The chart component uses ResponsiveContainer internally
<ChartCard title="Transaction Volume" minHeight={350}>
  <ResponsiveContainer width="100%" height={350}>
    <BarChart data={data}>
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="count" fill="#3b82f6" />
    </BarChart>
  </ResponsiveContainer>
</ChartCard>
```

## Responsive Behavior by Component Type

### Tables (Data-Heavy)
```tsx
// Desktop: Full table
// Tablet: Horizontal scroll in container
// Mobile: Card view OR horizontal scroll

<div className="overflow-x-auto">
  <table className="
    min-w-full  // Ensures table doesn't compress
    hidden md:table  // Hide full table on mobile
  ">
    {/* Full table content */}
  </table>
  
  {/* Mobile card view */}
  <div className="md:hidden space-y-4">
    {data.map(row => (
      <MobileDataCard key={row.id} data={row} />
    ))}
  </div>
</div>
```

### KPI Cards
```tsx
// Always visible, adapt sizing
<div className="
  kpi-card
  p-3 md:p-4 lg:p-6
  bg-white rounded-lg shadow-sm
">
  <span className="text-xs md:text-sm text-gray-500">
    {label}
  </span>
  <div className="text-lg md:text-xl lg:text-2xl font-bold mt-1">
    {formatValue(value)}
  </div>
  {trend && (
    <TrendIndicator value={trend} className="mt-2 text-xs md:text-sm" />
  )}
</div>
```

### Navigation/Sidebar
```tsx
// Desktop: Full sidebar
// Tablet: Icon-only or mini sidebar  
// Mobile: Hidden + hamburger menu

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      {/* Mobile hamburger */}
      <button 
        className="lg:hidden fixed top-4 left-4 z-50 p-2"
        onClick={() => setIsOpen(true)}
      >
        <MenuIcon />
      </button>
      
      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-white border-r
        transform transition-transform duration-200
        lg:transform-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Nav content */}
      </aside>
      
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
```

## CSS Variables for Consistent Spacing

```css
:root {
  /* Spacing scale */
  --space-page-x: 2rem;      /* Page horizontal padding */
  --space-page-y: 1.5rem;    /* Page vertical padding */
  --space-card: 1.5rem;      /* Card internal padding */
  --space-grid-gap: 1.5rem;  /* Gap between grid items */
  
  /* Component sizes */
  --sidebar-width: 16rem;
  --header-height: 4rem;
  --filter-bar-height: auto;
  
  /* Chart defaults */
  --chart-min-height: 300px;
  --chart-aspect-ratio: 16/9;
}

@media (max-width: 1023px) {
  :root {
    --space-page-x: 1.5rem;
    --space-page-y: 1rem;
    --space-card: 1rem;
    --space-grid-gap: 1rem;
    --sidebar-width: 4rem;
  }
}

@media (max-width: 767px) {
  :root {
    --space-page-x: 1rem;
    --space-page-y: 0.75rem;
    --space-card: 0.75rem;
    --space-grid-gap: 0.75rem;
    --sidebar-width: 0;
  }
}
```

## Testing Checklist by Breakpoint

### Desktop (1440px+) ✓
- [ ] All charts visible without scroll
- [ ] Sidebar fully expanded with labels
- [ ] Filter bar in single row
- [ ] 4-column KPI layout
- [ ] Tables show all columns

### Small Desktop (1024-1439px)
- [ ] Charts may stack 2-wide
- [ ] Sidebar may be narrower
- [ ] Filter bar may wrap to 2 rows
- [ ] 4-column KPI layout maintained

### Tablet (768-1023px)
- [ ] Charts stack 1-2 columns
- [ ] Sidebar collapsed to icons or hidden
- [ ] Filters in collapsible panel
- [ ] 2-column KPI layout
- [ ] Tables scroll horizontally

### Mobile (320-767px)
- [ ] Single column layout
- [ ] Hamburger navigation
- [ ] Filter drawer/bottom sheet
- [ ] 2-column KPI layout (2x2 grid)
- [ ] Tables as cards OR horizontal scroll
- [ ] Touch targets ≥ 44px

## Anti-Patterns to Avoid

```tsx
// ❌ WRONG: Fixed pixel widths
<div style={{ width: '800px' }}>

// ✅ CORRECT: Fluid with max-width
<div className="w-full max-w-4xl">

// ❌ WRONG: Height that causes overflow
<div style={{ height: '400px' }}>

// ✅ CORRECT: Min-height with auto
<div className="min-h-[400px] h-auto">

// ❌ WRONG: Hiding content without alternative
<div className="hidden md:block">
  {/* Important content just gone on mobile */}
</div>

// ✅ CORRECT: Alternative presentation
<div className="hidden md:block">{/* Desktop view */}</div>
<div className="md:hidden">{/* Mobile alternative */}</div>
```

## Integration with ui-freeze Skill

When both skills are active:
1. This skill handles layout/container decisions
2. ui-freeze protects chart internals
3. Changes apply ONLY to wrappers, never chart props
4. Both skills' checklists must pass before completion
