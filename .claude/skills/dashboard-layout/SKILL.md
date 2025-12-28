---
name: dashboard-layout
description: Responsive layout system for dashboards. Covers breakpoints, overflow prevention, chart containers, and multi-platform support.
---

# Dashboard Layout System

**Philosophy:** Desktop (1440px+) is PRIMARY. Mobile must be USABLE—not a clone.

> **Automated validation**: Run `/validate-layout` to check overflow and responsiveness programmatically.

---

## 1. Breakpoints

| Breakpoint | Width | Use |
|------------|-------|-----|
| Desktop | 1440px+ | Primary target, full layout |
| Small Desktop | 1280-1439px | Minor adjustments |
| Tablet | 768-1023px | 2-column, collapsible sidebar |
| Mobile | 375-767px | Single column, bottom nav |
| Small Mobile | 320-374px | Compact, essential only |

```tsx
// Desktop-first pattern
<div className="
  grid grid-cols-4 gap-6     // Desktop
  lg:grid-cols-3             // Small desktop
  md:grid-cols-2             // Tablet
  sm:grid-cols-1             // Mobile
">
```

---

## 2. Overflow Safety (CRITICAL)

**NEVER allow horizontal scroll at any viewport.**

```tsx
// EVERY container:
<div className="max-w-full overflow-x-hidden">
  <div className="flex min-w-0">           // Flex children need min-w-0
    <div className="min-w-0 flex-1">...</div>
  </div>
</div>

// Text:
<p className="break-words">...</p>
<span className="truncate max-w-full">...</span>

// Tables:
<div className="overflow-x-auto max-w-full -mx-4 px-4">
  <table className="min-w-[600px]">...</table>
</div>
```

---

## 3. iOS Safe Areas

```tsx
// Viewport meta (index.html)
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

// Safe area padding
<div className="pt-safe pb-safe">  // Notch + home indicator
// OR
<div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
```

---

## 4. Page Layout

```tsx
<div className="min-h-screen min-h-[100dvh] bg-gray-50">
  {/* Header */}
  <header className="h-14 md:h-16 px-4 md:px-6 pt-safe border-b bg-white sticky top-0 z-40">
    ...
  </header>

  <div className="flex">
    {/* Sidebar - Desktop only */}
    <aside className="hidden lg:flex w-64 border-r sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
      ...
    </aside>

    {/* Main content */}
    <main className="flex-1 min-w-0 p-4 md:p-6 pb-safe overflow-x-hidden">
      ...
    </main>
  </div>

  {/* Mobile bottom nav */}
  <nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 pb-safe bg-white border-t flex justify-around z-40">
    {/* 4-5 icons, 44px touch targets */}
  </nav>
</div>
```

---

## 5. Dashboard Grid

```tsx
<div className="space-y-4 md:space-y-6 max-w-full overflow-hidden">
  {/* KPI Cards */}
  <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
    {kpis.map(k => <KPICard key={k.id} {...k} />)}
  </div>

  {/* Charts */}
  <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2">
    <ChartCard title="Volume"><VolumeChart /></ChartCard>
    <ChartCard title="Trends"><TrendChart /></ChartCard>
  </div>
</div>
```

---

## 6. Chart Container

```tsx
function ChartCard({ title, children, minHeight = 300 }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden">
      <div className="p-3 md:p-4 border-b">
        <h3 className="font-semibold text-sm md:text-base truncate">{title}</h3>
      </div>
      <div className="flex-1 p-3 md:p-4 overflow-hidden" style={{ minHeight }}>
        {children}
      </div>
    </div>
  );
}

// Chart.js usage
<ChartCard title="Distribution">
  <Bar data={data} options={{ responsive: true, maintainAspectRatio: false }} />
</ChartCard>
```

---

## 7. Chart Height Ownership (CRITICAL)

**Rule:** A chart must either FULLY control its height OR let parent control it—NEVER both.

### The Problem

Hybrid height control causes layout bugs (white space, overflow, jitter):

```tsx
// ❌ BROKEN: Hybrid ownership (chart + parent both control height)
<div className="h-full" style={{ minHeight: height + 140 }}>
  <ChartSlot><Chart /></ChartSlot>
</div>
```

**Why it breaks:**
- `h-full` says "fill parent"
- `minHeight` says "at least this tall"
- CSS + Chart.js fight each other
- Result: unpredictable height, white space

### The Fix: Explicit Ownership

**Option A: Chart owns height (RECOMMENDED)**

```tsx
// ✅ CORRECT: Chart explicitly calculates and owns its total height
const cardHeight = height + 200; // height prop + overhead (header + footer)

<div
  className="flex flex-col overflow-hidden"
  style={{ height: cardHeight }}  // Explicit, deterministic
>
  <Header className="shrink-0" />
  <ChartSlot>
    <Chart />
  </ChartSlot>
  <Footer className="shrink-0" />
</div>
```

**Option B: Parent owns height**

```tsx
// ✅ CORRECT: Parent provides fixed container, chart fills it
<div style={{ height: 500 }}>  {/* Parent owns */}
  <ChartCard className="h-full">  {/* Card fills parent */}
    <Chart />
  </ChartCard>
</div>
```

### Height Calculation Pattern

When chart owns height, document the overhead:

```tsx
// Card owns its height explicitly
// Overhead breakdown:
//   Header: ~60px (title + subtitle)
//   KPI row: ~80px
//   Insight box: ~50px
//   Footer: ~44px
//   Total overhead: ~234px
const cardHeight = height + 234;
```

### Anti-Patterns

```tsx
// ❌ h-full + minHeight (hybrid)
<div className="h-full" style={{ minHeight: 400 }}>

// ❌ h-full + height (conflicting)
<div className="h-full" style={{ height: 500 }}>

// ❌ flex-1 without parent height constraint
<div className="flex-1">  // What is parent height?

// ❌ Relying on implicit parent flex height
<div className="h-full">  // Parent has no defined height
```

### Checklist

```
HEIGHT OWNERSHIP:
[ ] Single owner: chart OR parent (not both)
[ ] If chart owns: explicit `style={{ height: X }}`
[ ] If parent owns: parent has explicit height, chart uses `h-full`
[ ] Document overhead calculation in comment
[ ] Test at 320px, 768px, 1440px viewports
```

---

## 8. Responsive Patterns

### Tables
```tsx
{/* Desktop: table */}
<div className="hidden md:block overflow-x-auto">
  <table>...</table>
</div>

{/* Mobile: cards */}
<div className="md:hidden space-y-3">
  {data.map(row => <MobileCard key={row.id} {...row} />)}
</div>
```

### Navigation
```tsx
{/* Desktop: sidebar */}
<aside className="hidden lg:block w-64">...</aside>

{/* Mobile: hamburger → drawer + bottom tabs */}
<button className="lg:hidden min-h-[44px] min-w-[44px]">☰</button>
<nav className="lg:hidden fixed bottom-0 inset-x-0 h-16 pb-safe">...</nav>
```

---

## 9. Anti-Patterns

```tsx
// ❌ Fixed pixel widths
<div style={{ width: '800px' }}>

// ✅ Fluid with max-width
<div className="w-full max-w-4xl">

// ❌ Missing min-w-0 on flex child (causes overflow)
<div className="flex"><div className="flex-1">...</div></div>

// ✅ Safe
<div className="flex"><div className="flex-1 min-w-0">...</div></div>

// ❌ Hover-only interaction
<div className="opacity-0 hover:opacity-100">

// ✅ Works on touch
<div className="opacity-0 hover:opacity-100 active:opacity-100">
```

---

## 10. Quick Checklist

```
OVERFLOW:
[ ] No horizontal scrollbar at 320px-1920px
[ ] All containers: max-w-full overflow-x-hidden
[ ] All flex children: min-w-0
[ ] Long text: break-words or truncate

RESPONSIVE:
[ ] Desktop (1440px): Full layout
[ ] Tablet (768px): 2-column
[ ] Mobile (375px): Single column
[ ] Small (320px): Still functional

MOBILE:
[ ] iOS safe areas (pt-safe, pb-safe)
[ ] Touch targets >= 44px
[ ] No hover-only interactions
[ ] Bottom nav for mobile

CHARTS:
[ ] Container has overflow-hidden
[ ] responsive: true, maintainAspectRatio: false
[ ] Fallback for very small screens

HEIGHT OWNERSHIP:
[ ] Single owner: chart OR parent (not both)
[ ] No h-full + minHeight hybrid
[ ] Overhead documented in comment
```

---

## 11. Row Height Strategies

### Strategy A: Stretch (Recommended for Mixed Content)

All items in a row stretch to the tallest item's height.

```tsx
<div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
  <DashboardCard>Short content</DashboardCard>
  <DashboardCard>Taller content with more text</DashboardCard>
</div>
```

**Use for:** KPI rows, mixed-height cards where visual alignment matters.

### Strategy B: Auto-Rows-Fr (Equal Height Rows)

All rows have equal height, regardless of content.

```tsx
<div className="grid grid-cols-2 auto-rows-fr gap-4">
  <DashboardCard>...</DashboardCard>
  <DashboardCard>...</DashboardCard>
</div>
```

**Use for:** Chart grids where consistent row height is desired.

### Strategy C: Fixed Row Heights (Bloomberg Style)

Explicit heights for each row type.

```tsx
<div className="space-y-4">
  {/* KPI Row: 120px */}
  <div className="grid grid-cols-4 gap-4 h-[120px]">
    {kpis.map(k => <KPICard key={k.id} {...k} />)}
  </div>

  {/* Chart Row: 400px */}
  <div className="grid grid-cols-2 gap-4 h-[400px]">
    <ChartCard>...</ChartCard>
    <ChartCard>...</ChartCard>
  </div>
</div>
```

**Use for:** Dense dashboards with strict layout requirements.

### When to Use Which

| Scenario | Strategy | Why |
|----------|----------|-----|
| KPIs with varying text | Stretch | Tallest KPI sets row height |
| 2x2 chart grid | Auto-rows-fr | Consistent row heights |
| Bloomberg-style dense layout | Fixed | Predictable, compact |
| Mixed KPI + chart rows | Stretch per row | Different row types |

---

## 12. Canonical Component Contracts

### DashboardRow

Container for horizontally-aligned dashboard elements.

```tsx
function DashboardRow({
  children,
  cols = 2,
  gap = 4,
  height // optional: explicit height
}) {
  return (
    <div
      className={`
        grid gap-${gap} items-stretch
        grid-cols-1 md:grid-cols-${cols}
      `}
      style={height ? { height } : undefined}
    >
      {children}
    </div>
  );
}
```

**Contract:**
- Children stretch to fill row height
- Responsive: single column on mobile
- Gap scales with content density

### DashboardCard

Standard card wrapper with header/body/footer structure.

```tsx
function DashboardCard({
  title,
  subtitle,
  controls,  // Optional header controls
  footer,    // Optional footer content
  children,
  minHeight = 0
}) {
  return (
    <div className="bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden h-full">
      {/* HEADER: Fixed height */}
      <div className="p-3 md:p-4 border-b flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm md:text-base truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
          {controls && <div className="flex-shrink-0">{controls}</div>}
        </div>
      </div>

      {/* BODY: Flexible, scrolls if needed */}
      <div
        className="flex-1 min-h-0 p-3 md:p-4 overflow-auto"
        style={{ minHeight }}
      >
        {children}
      </div>

      {/* FOOTER: Fixed height (optional) */}
      {footer && (
        <div className="p-3 md:p-4 border-t flex-shrink-0 bg-gray-50">
          {footer}
        </div>
      )}
    </div>
  );
}
```

**Contract:**
- Header: fixed, never wraps (use truncate)
- Body: flexible, scrolls when content exceeds
- Footer: fixed, optional
- Card fills parent height (`h-full`)
- Body has `min-h-0` for scroll containment

### ChartFrame

Chart container with consistent height behavior.

```tsx
function ChartFrame({ children, minHeight = 300, aspectRatio }) {
  return (
    <div
      className="relative w-full h-full min-h-0"
      style={{
        minHeight,
        aspectRatio: aspectRatio || undefined
      }}
    >
      <div className="absolute inset-0">
        {children}
      </div>
    </div>
  );
}
```

**Contract:**
- Fills parent (works inside DashboardCard body)
- Minimum height prevents collapse
- Absolute positioning for chart library compatibility
- No padding (padding is on DashboardCard body)

---

## 13. Row Type Examples

### KPI Row

```tsx
<DashboardRow cols={4} gap={4}>
  <KPICard label="Total Volume" value="$2.3B" change="+12%" />
  <KPICard label="Transactions" value="1,234" change="-5%" />
  <KPICard label="Avg PSF" value="$1,850" change="+3%" />
  <KPICard label="Projects" value="45" />
</DashboardRow>
```

**Height:** Content-driven (stretch)
**Mobile:** 2 columns

### Chart Row

```tsx
<DashboardRow cols={2} gap={6}>
  <DashboardCard title="Volume Trend">
    <ChartFrame minHeight={300}>
      <Line data={volumeData} options={chartOptions} />
    </ChartFrame>
  </DashboardCard>
  <DashboardCard title="Price Distribution">
    <ChartFrame minHeight={300}>
      <Bar data={priceData} options={chartOptions} />
    </ChartFrame>
  </DashboardCard>
</DashboardRow>
```

**Height:** `minHeight` on ChartFrame (300px minimum)
**Mobile:** Single column, each chart full width

### Table Row

```tsx
<DashboardRow cols={1}>
  <DashboardCard
    title="Recent Transactions"
    footer={<Pagination />}
  >
    <div className="overflow-x-auto -mx-3 md:-mx-4 px-3 md:px-4">
      <table className="min-w-[600px] w-full">
        ...
      </table>
    </div>
  </DashboardCard>
</DashboardRow>
```

**Height:** Content-driven (table rows)
**Mobile:** Horizontal scroll for table, or card view alternative

### Mixed Dashboard Layout

```tsx
<div className="space-y-4 md:space-y-6">
  {/* Row 1: KPIs */}
  <DashboardRow cols={4} gap={4}>
    <KPICard ... />
    <KPICard ... />
    <KPICard ... />
    <KPICard ... />
  </DashboardRow>

  {/* Row 2: Charts */}
  <DashboardRow cols={2} gap={6}>
    <DashboardCard title="Trend">
      <ChartFrame><Line ... /></ChartFrame>
    </DashboardCard>
    <DashboardCard title="Distribution">
      <ChartFrame><Bar ... /></ChartFrame>
    </DashboardCard>
  </DashboardRow>

  {/* Row 3: Table */}
  <DashboardRow cols={1}>
    <DashboardCard title="Transactions">
      <TransactionTable />
    </DashboardCard>
  </DashboardRow>
</div>
```

---

## 14. Empty/Loading State Contracts

**Rule:** All states must occupy the same height to prevent layout shift.

### Loading State

```tsx
function ChartLoading({ height = 300 }) {
  return (
    <div
      className="flex items-center justify-center bg-gray-50 rounded"
      style={{ height }}
    >
      <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Usage in ChartFrame
<ChartFrame minHeight={300}>
  {loading ? <ChartLoading height={300} /> : <Line data={data} />}
</ChartFrame>
```

### Empty State

```tsx
function ChartEmpty({ height = 300, message = "No data available" }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-gray-400 bg-gray-50 rounded"
      style={{ height }}
    >
      <svg className="w-12 h-12 mb-2" ...>...</svg>
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

### Error State

```tsx
function ChartError({ height = 300, onRetry }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-red-500 bg-red-50 rounded"
      style={{ height }}
    >
      <svg className="w-12 h-12 mb-2" ...>...</svg>
      <p className="text-sm mb-2">Failed to load chart</p>
      {onRetry && (
        <button onClick={onRetry} className="text-xs underline">
          Retry
        </button>
      )}
    </div>
  );
}
```

### State Height Contract

| State | Height | Background | Content |
|-------|--------|------------|---------|
| Loading | Same as data | `bg-gray-50` | Centered spinner |
| Empty | Same as data | `bg-gray-50` | Centered icon + message |
| Error | Same as data | `bg-red-50` | Centered icon + message + retry |
| Data | `minHeight` prop | transparent | Chart |

**Critical:** Pass the same `height` / `minHeight` to all state components.

---

## 15. Bloomberg Style Guide

Dense, information-rich layout inspired by financial terminals.

### Principles

1. **High density** — More data per screen, less whitespace
2. **Consistent row heights** — Predictable visual rhythm
3. **Compact spacing** — Smaller gaps, tighter padding
4. **Dark mode friendly** — Works on dark backgrounds
5. **Keyboard navigable** — Focus states, shortcuts

### Spacing Tokens (Compact)

| Token | Value | Use |
|-------|-------|-----|
| `gap-2` | 8px | Between KPIs |
| `gap-3` | 12px | Between chart cards |
| `p-2` | 8px | Card padding (compact) |
| `p-3` | 12px | Card padding (standard) |
| `space-y-3` | 12px | Between rows |

### Compact Card Variant

```tsx
function CompactCard({ title, children }) {
  return (
    <div className="bg-white rounded border shadow-sm overflow-hidden">
      <div className="px-2 py-1.5 border-b bg-gray-50">
        <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide truncate">
          {title}
        </h3>
      </div>
      <div className="p-2 min-h-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
```

### Dense Grid Example

```tsx
<div className="space-y-3">
  {/* KPI strip: 5 columns, minimal height */}
  <div className="grid grid-cols-5 gap-2 h-[80px]">
    <CompactKPI label="VOL" value="$2.3B" />
    <CompactKPI label="TXN" value="1,234" />
    <CompactKPI label="PSF" value="$1,850" />
    <CompactKPI label="CHG" value="+3.2%" positive />
    <CompactKPI label="YTD" value="+12.5%" positive />
  </div>

  {/* 3-column chart grid */}
  <div className="grid grid-cols-3 gap-3 h-[280px]">
    <CompactCard title="PRICE TREND">
      <ChartFrame minHeight={200}><Line .../></ChartFrame>
    </CompactCard>
    <CompactCard title="VOLUME DIST">
      <ChartFrame minHeight={200}><Bar .../></ChartFrame>
    </CompactCard>
    <CompactCard title="REGION MIX">
      <ChartFrame minHeight={200}><Pie .../></ChartFrame>
    </CompactCard>
  </div>
</div>
```

### When to Use

- Power users who prefer density over aesthetics
- Dashboard views with 10+ KPIs
- Multi-chart comparison layouts
- Financial/trading interfaces
