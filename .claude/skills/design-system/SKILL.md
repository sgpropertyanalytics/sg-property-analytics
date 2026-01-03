---
name: design-system
description: Unified design system for dashboards and frontend interfaces. Covers colors, typography, components, touch interactions, responsive layout, overflow prevention, and validation. Merged from dashboard-design, dashboard-layout, frontend-design, and validate-layout.
---

# Design System

Unified design system covering visual design, layout patterns, and validation.

**Trigger:** `/design-system`, building UI components, chart modifications, layout issues

---

# PART 1: VISUAL DESIGN

## 1.1 Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Navy | `#213448` | Headings, primary text, CCR |
| Ocean Blue | `#547792` | Secondary text, labels, RCR |
| Sky Blue | `#94B4C1` | Borders, icons, OCR, disabled |
| Sand/Cream | `#EAE0CF` | Backgrounds, hover states |

```tsx
// Tailwind patterns
text-[#213448]              // Primary
text-[#547792]              // Secondary
border-[#94B4C1]/50         // Borders
bg-[#EAE0CF]/30             // Backgrounds
bg-white rounded-lg border border-[#94B4C1]/50  // Cards
```

### Chart Colors

```javascript
const regionColors = { CCR: '#213448', RCR: '#547792', OCR: '#94B4C1' };
const bedroomColors = { 1: '#f7be81', 2: '#4f81bd', 3: '#28527a', 4: '#112b3c', 5: '#9bbb59' };
```

---

## 1.2 Touch Targets (MANDATORY)

```tsx
// EVERY interactive element:
<button className="
  min-h-[44px] min-w-[44px]      // iOS: 44pt, Android: 48dp
  hover:bg-[#EAE0CF]/30          // Desktop
  active:bg-[#EAE0CF]/50         // Touch feedback
  active:scale-[0.98]            // Press feedback
  focus-visible:ring-2           // Keyboard
  touch-action-manipulation      // No double-tap zoom
  select-none
">
```

| State | Desktop | Touch | Keyboard |
|-------|---------|-------|----------|
| Hover | `hover:` | N/A | N/A |
| Active | `active:` | `active:` | `active:` |
| Focus | `focus:` | `focus:` | `focus-visible:` |

---

## 1.3 Components

### Buttons

```tsx
// Primary
className="min-h-[44px] px-4 py-2 rounded-md bg-[#213448] text-white hover:bg-[#547792] active:scale-[0.98]"

// Secondary
className="min-h-[44px] px-4 py-2 rounded-md bg-white text-[#213448] border border-[#94B4C1] hover:border-[#547792] active:bg-[#EAE0CF]/50"

// Disabled
className="bg-[#EAE0CF]/50 text-[#94B4C1] cursor-not-allowed"
```

### Cards

```tsx
className="bg-white rounded-lg border border-[#94B4C1]/50 shadow-sm p-3 md:p-4 lg:p-6"
```

### KPI Cards

```tsx
<div className="p-3 md:p-4 bg-white rounded-lg border border-[#94B4C1]/50">
  <span className="text-xs uppercase text-[#547792]">{label}</span>
  <div className="text-xl font-bold font-mono tabular-nums text-[#213448]">{value}</div>
</div>
```

---

## 1.4 Typography

```tsx
// Headings
<h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-[#213448]">
<h2 className="text-lg md:text-xl font-semibold">

// Body
<p className="text-sm md:text-base">

// Numbers (always monospace)
<span className="font-mono tabular-nums">1,234,567</span>
```

---

## 1.5 Data Tables (MANDATORY: Sortable)

Every table MUST have sortable columns:

```tsx
// Sort state
const [sortConfig, setSortConfig] = useState({ column: 'default', order: 'desc' });

// Sort handler
const handleSort = (col) => setSortConfig(prev => ({
  column: col,
  order: prev.column === col && prev.order === 'desc' ? 'asc' : 'desc'
}));

// Sortable header
<th onClick={() => handleSort('col')} className="cursor-pointer hover:bg-slate-100 select-none">
  <div className="flex items-center gap-1">
    <span>Label</span>
    <SortIcon column="col" config={sortConfig} />
  </div>
</th>
```

---

## 1.6 Filter Patterns

### Desktop (1024px+)

```tsx
<div className="hidden lg:block bg-white rounded-lg border border-[#94B4C1]/50 p-4">
  <div className="flex flex-wrap items-end gap-4">
    <FilterDropdown /><FilterDropdown /><FilterDateRange />
  </div>
</div>
```

### Mobile (<1024px)

```tsx
// Toggle button → Full-screen drawer
<button className="w-full min-h-[48px] px-4 flex items-center gap-2 bg-white rounded-lg border">
  <FilterIcon /><span>Filters</span>
  {activeCount > 0 && <span className="ml-auto bg-[#547792]/20 px-2 rounded-full">{activeCount}</span>}
</button>

// Drawer: sticky header, scrollable content, sticky footer with Apply button
```

### Filter Chip

```tsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-[#547792]/20 border border-[#547792]/30">
  {label}
  <button className="min-h-[24px] min-w-[24px] rounded-full active:bg-[#547792]/50">x</button>
</span>
```

---

## 1.7 States

### Loading

```tsx
<div className="h-48 flex items-center justify-center">
  <div className="w-8 h-8 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
</div>
```

### Empty

```tsx
<div className="h-48 flex items-center justify-center text-center">
  <div>
    <SearchIcon className="w-12 h-12 text-[#94B4C1] mx-auto" />
    <p className="text-[#547792]">No data matches filters</p>
    <button onClick={clearFilters} className="mt-3 text-sm text-[#213448]">Clear filters</button>
  </div>
</div>
```

### Error

```tsx
<div className="h-48 flex items-center justify-center text-center">
  <div>
    <AlertIcon className="w-12 h-12 text-red-400 mx-auto" />
    <p className="text-[#213448]">{error}</p>
    <button onClick={retry} className="mt-3 text-sm">Try again</button>
  </div>
</div>
```

---

## 1.8 Motion & Accessibility

```css
/* Quick feedback: 100ms, Medium: 200ms */
transition-all duration-100

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

```tsx
// Focus rings
focus:outline-none focus-visible:ring-2 focus-visible:ring-[#547792]

// Icon buttons need labels
<button aria-label="Close"><XIcon aria-hidden="true" /></button>

// Announce changes
<div aria-live="polite" className="sr-only">{resultCount} results</div>
```

**Contrast:** #213448 on white = 10.7:1, #547792 on white = 4.6:1

---

# PART 2: RESPONSIVE LAYOUT

**Philosophy:** Desktop (1440px+) is PRIMARY. Mobile must be USABLE—not a clone.

## 2.1 Breakpoints

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

## 2.2 Overflow Safety (CRITICAL)

**NEVER allow horizontal scroll at any viewport.**

### DO

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

### DON'T

```tsx
// Missing min-w-0 on flex child -> causes overflow
<div className="flex">
  <div className="flex-1">Long content here...</div>
</div>

// Fixed width without max-w-full -> breaks on mobile
<div style={{ width: 600 }}>...</div>

// Text without break-words -> overflows container
<p>{veryLongUserGeneratedContent}</p>
```

---

## 2.3 Chart Height Ownership (CRITICAL)

**Rule:** A chart must either FULLY control its height OR let parent control it—NEVER both.

### The Problem

Hybrid height control causes layout bugs:

```tsx
// BROKEN: Hybrid ownership
<div className="h-full" style={{ minHeight: height + 140 }}>
  <ChartSlot><Chart /></ChartSlot>
</div>
```

### The Fix

**Option A: Chart owns height (RECOMMENDED)**

```tsx
const cardHeight = height + 200; // height prop + overhead

<div
  className="flex flex-col overflow-hidden"
  style={{ height: cardHeight }}
>
  <Header className="shrink-0" />
  <ChartSlot><Chart /></ChartSlot>
  <Footer className="shrink-0" />
</div>
```

**Option B: Parent owns height**

```tsx
<div style={{ height: 500 }}>
  <ChartCard className="h-full">
    <Chart />
  </ChartCard>
</div>
```

### Anti-Patterns

```tsx
// h-full + minHeight (hybrid)
<div className="h-full" style={{ minHeight: 400 }}>

// h-full + height (conflicting)
<div className="h-full" style={{ height: 500 }}>

// flex-1 without parent height constraint
<div className="flex-1">
```

---

## 2.4 Page Layout

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

## 2.5 Dashboard Grid

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

## 2.6 Chart Container

```tsx
function ChartCard({ title, children, minHeight = 300 }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden">
      <div className="p-3 md:p-4 border-b shrink-0">
        <h3 className="font-semibold text-sm md:text-base truncate">{title}</h3>
      </div>
      <div className="flex-1 min-h-0 p-3 md:p-4 overflow-hidden" style={{ minHeight }}>
        {children}
      </div>
    </div>
  );
}

// Chart.js usage - always set these options
<ChartCard title="Distribution">
  <Bar data={data} options={{ responsive: true, maintainAspectRatio: false }} />
</ChartCard>
```

---

## 2.7 iOS Safe Areas

```tsx
// Viewport meta (index.html)
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

// Safe area padding
<div className="pt-safe pb-safe">
// OR
<div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
```

---

# PART 3: CREATIVE DESIGN

For distinctive interfaces, not generic AI aesthetics.

## 3.1 Design Thinking

Before writing code:

1. **Purpose** — What problem does this solve? Who uses it?
2. **Tone** — Select a distinctive aesthetic direction
3. **Constraints** — Technical requirements, browser support
4. **Differentiation** — What makes this unforgettable?

## 3.2 Anti-Patterns to Avoid

**Generic AI-generated aesthetics:**
- Overused fonts (Inter, Roboto, Arial, system-ui)
- Cliche color schemes (especially purple gradients)
- Predictable centered layouts
- Cookie-cutter card grids
- Generic hero sections with stock patterns

---

# PART 4: VALIDATION

## 4.1 Quick Checklist

```
VISUAL:
[ ] Using project palette (#213448, #547792, #94B4C1, #EAE0CF)
[ ] Numbers use font-mono tabular-nums
[ ] Touch targets >= 44px

STATES:
[ ] active: feedback on all buttons
[ ] Loading/Empty/Error states designed
[ ] focus-visible: rings for keyboard

FILTERS:
[ ] Desktop: horizontal bar
[ ] Mobile: drawer with Apply button
[ ] Chips have remove buttons

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

CHARTS:
[ ] Container has overflow-hidden
[ ] responsive: true, maintainAspectRatio: false
[ ] Single height owner (chart OR parent)

ACCESSIBILITY:
[ ] No hover-only interactions
[ ] Icon buttons have aria-label
[ ] Respects prefers-reduced-motion
```

---

## 4.2 Validation Commands

```bash
# Find height ownership violations
grep -r "h-full.*minHeight\|minHeight.*h-full" frontend/src/components/
grep -r 'className="[^"]*h-full[^"]*".*style=.*height' frontend/src/components/

# Find overflow risks
grep -r "flex-1[^}]*>" frontend/src/components/ | grep -v "min-w-0"

# Find missing chart options
grep -r "<Line\|<Bar\|<Pie\|<Doughnut" frontend/src/components/ | grep -v "maintainAspectRatio"

# Find hardcoded colors
grep -rn "\"#[0-9A-Fa-f]\{6\}\"" frontend/src/components/powerbi/
```

---

## 4.3 Common Mistakes Quick Reference

| Mistake | Symptom | Fix |
|---------|---------|-----|
| `h-full` + `minHeight` | White space at bottom | Remove `h-full`, use explicit `height` |
| Missing `min-w-0` on flex child | Horizontal overflow | Add `min-w-0` |
| Missing `overflow-hidden` on card | Chart expands infinitely | Add `overflow-hidden` |
| Missing `shrink-0` on header | Header collapses | Add `shrink-0` |
| Missing `min-h-0` on flex-1 | Scroll doesn't work | Add `min-h-0` |
| Hover-only interactions | Doesn't work on touch | Add `:active` state |
