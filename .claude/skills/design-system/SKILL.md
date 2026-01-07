---
name: design-system
description: Unified design system for dashboards and frontend interfaces. Covers colors, typography, components, touch interactions, responsive layout, overflow prevention, and validation. Merged from dashboard-design, dashboard-layout, frontend-design, and validate-layout.
---

# Design System

Unified design system covering visual design, layout patterns, and validation.

**Trigger:** `/design-system`, building UI components, chart modifications, layout issues

---

# PART 1: VISUAL DESIGN

## 1.1 Color Palette — Institutional Print / Slate

**Philosophy:** "Financial Print / Blueprint Strategy" — Charts look like high-end architectural blueprints or printed financial reports. The Suit: Slate + Void. The Tie: Bloomberg Orange.

### Core Palettes

| Palette | Token | Hex | Usage |
|---------|-------|-----|-------|
| **INK** | `INK.primary` | `#0F172A` (slate-900) | Primary data, headers, chart bars |
| | `INK.dense` | `#1E293B` (slate-800) | Secondary emphasis |
| | `INK.mid` | `#475569` (slate-600) | Body text |
| | `INK.muted` | `#94A3B8` (slate-400) | Ghost data, placeholders |
| | `INK.light` | `#CBD5E1` (slate-300) | Subtle borders |
| **VOID** | `VOID.base` | `#0A0A0A` | Nav background (darkest) |
| | `VOID.surface` | `#1A1A1A` | Elevated cards on void |
| | `VOID.edge` | `#333333` | Machined metal borders |
| **CANVAS** | `CANVAS.base` | `#FAFAFA` | Main content background |
| | `CANVAS.paper` | `#FFFFFF` | Cards, modals |
| | `CANVAS.grid` | `#E5E7EB` | Chart grids, subtle borders |
| **SIGNAL** | `SIGNAL.accent` | `#F97316` (orange-500) | Buttons, highlights, CTAs |
| | `SIGNAL.accentA11y` | `#EA580C` (orange-600) | Text/borders (accessible) |
| | `SIGNAL.focus` | `#2563EB` (blue-600) | Focus rings |
| **DELTA** | `DELTA.positive` | `#059669` (emerald-600) | Gains, positive change |
| | `DELTA.negative` | `#DC2626` (red-600) | Losses, negative change |

### Region Colors (Monochrome Hierarchy)

| Region | Hex | Tailwind | Meaning |
|--------|-----|----------|---------|
| **CCR** | `#0F172A` | `slate-900` | Premium/Core (darkest) |
| **RCR** | `#334155` | `slate-700` | Mid-tier |
| **OCR** | `#64748B` | `slate-500` | Suburban (lightest) |

```tsx
// Tailwind patterns
text-slate-900              // Primary (INK.primary)
text-slate-600              // Body (INK.mid)
text-slate-400              // Muted (INK.muted)
border-slate-200            // Borders (CANVAS.grid)
bg-slate-50                 // Backgrounds (CANVAS.base)
bg-white                    // Cards (CANVAS.paper)
text-orange-500             // Accent (SIGNAL.accent)
```

### Chart Colors

```javascript
import { REGION, INK, SIGNAL, DELTA } from '../constants/colors';

// Region palette (monochrome hierarchy)
const regionColors = { CCR: REGION.CCR, RCR: REGION.RCR, OCR: REGION.OCR };

// For financial +/-
const deltaColors = { positive: DELTA.positive, negative: DELTA.negative };

// Signal accent for emphasis
const accentColor = SIGNAL.accent;
```

### Supply Palette

```javascript
import { SUPPLY } from '../constants/colors';
// SUPPLY.unsold: #0F172A (slate-900) — Most urgent
// SUPPLY.upcoming: #334155 (slate-700) — Pipeline
// SUPPLY.gls: #64748B (slate-500) — GLS sites
// SUPPLY.total: #94A3B8 (slate-400) — Totals
```

---

## 1.2 Touch Targets (MANDATORY)

```tsx
// EVERY interactive element:
<button className="
  min-h-[44px] min-w-[44px]      // iOS: 44pt, Android: 48dp
  hover:bg-slate-100             // Desktop
  active:bg-slate-200            // Touch feedback
  active:scale-[0.98]            // Press feedback
  focus-visible:ring-2 focus-visible:ring-blue-600  // Keyboard (SIGNAL.focus)
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
// Primary (SIGNAL accent)
className="min-h-[44px] px-4 py-2 rounded-none bg-orange-500 text-white hover:bg-orange-600 active:scale-[0.98]"

// Secondary (Slate)
className="min-h-[44px] px-4 py-2 rounded-none bg-white text-slate-900 border border-slate-300 hover:border-slate-500 active:bg-slate-100"

// Tertiary/Ghost
className="min-h-[44px] px-4 py-2 rounded-none bg-transparent text-slate-700 hover:bg-slate-100 active:bg-slate-200"

// Disabled
className="bg-slate-100 text-slate-400 cursor-not-allowed"
```

### Cards

```tsx
// Standard card (weapon aesthetic)
className="bg-white rounded-none border border-slate-200 shadow-sm p-3 md:p-4 lg:p-6"

// Elevated card on VOID background
className="bg-neutral-900 rounded-none border border-neutral-700 text-white"
```

### KPI Cards

```tsx
<div className="p-3 md:p-4 bg-white rounded-none border border-slate-200">
  <span className="text-xs uppercase tracking-wider text-slate-500 font-mono">{label}</span>
  <div className="text-xl font-bold font-mono tabular-nums text-slate-900">{value}</div>
</div>
```

---

## 1.4 Typography

```tsx
// Headings (INK.primary)
<h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-slate-900">
<h2 className="text-lg md:text-xl font-semibold text-slate-900">

// Terminal headers (weapon aesthetic)
<span className="text-[10px] uppercase tracking-wider font-mono text-slate-500">LABEL</span>

// Body (INK.mid)
<p className="text-sm md:text-base text-slate-600">

// Muted/secondary text
<span className="text-slate-400">

// Numbers (always monospace)
<span className="font-mono tabular-nums text-slate-900">1,234,567</span>

// Accent text (SIGNAL)
<span className="text-orange-600 font-semibold">+12.5%</span>
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

// Sortable header (weapon aesthetic: no rounded corners)
<th onClick={() => handleSort('col')} className="cursor-pointer hover:bg-slate-100 select-none">
  <div className="flex items-center gap-1">
    <span className="font-mono text-xs uppercase tracking-wider">Label</span>
    <SortIcon column="col" config={sortConfig} />
  </div>
</th>
```

---

## 1.6 Filter Patterns

### Desktop (1024px+)

```tsx
<div className="hidden lg:block bg-white rounded-none border border-slate-200 p-4">
  <div className="flex flex-wrap items-end gap-4">
    <FilterDropdown /><FilterDropdown /><FilterDateRange />
  </div>
</div>
```

### Mobile (<1024px)

```tsx
// Toggle button → Full-screen drawer
<button className="w-full min-h-[48px] px-4 flex items-center gap-2 bg-white rounded-none border border-slate-200">
  <FilterIcon /><span>Filters</span>
  {activeCount > 0 && <span className="ml-auto bg-slate-200 px-2 text-slate-700">{activeCount}</span>}
</button>

// Drawer: sticky header, scrollable content, sticky footer with Apply button
```

### Filter Chip

```tsx
<span className="inline-flex items-center gap-1 px-2 py-1 rounded-none text-sm bg-slate-100 border border-slate-300 text-slate-700">
  {label}
  <button className="min-h-[24px] min-w-[24px] active:bg-slate-200">×</button>
</span>
```

---

## 1.7 States

### Loading

```tsx
<div className="h-48 flex items-center justify-center">
  <div className="w-8 h-8 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
</div>
```

### Empty

```tsx
<div className="h-48 flex items-center justify-center text-center">
  <div>
    <SearchIcon className="w-12 h-12 text-slate-400 mx-auto" />
    <p className="text-slate-500">No data matches filters</p>
    <button onClick={clearFilters} className="mt-3 text-sm text-orange-600 hover:text-orange-700">Clear filters</button>
  </div>
</div>
```

### Error

```tsx
<div className="h-48 flex items-center justify-center text-center">
  <div>
    <AlertIcon className="w-12 h-12 text-red-500 mx-auto" />
    <p className="text-slate-900">{error}</p>
    <button onClick={retry} className="mt-3 text-sm text-orange-600 hover:text-orange-700">Try again</button>
  </div>
</div>
```

---

## 1.8 Motion & Accessibility

```css
/* Weapon aesthetic: instant transitions preferred */
transition-none

/* Or quick feedback: 100ms max */
transition-all duration-100

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

```tsx
// Focus rings (SIGNAL.focus)
focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600

// Icon buttons need labels
<button aria-label="Close"><XIcon aria-hidden="true" /></button>

// Announce changes
<div aria-live="polite" className="sr-only">{resultCount} results</div>
```

**Contrast:** slate-900 (#0F172A) on white = 15.4:1, slate-500 (#64748B) on white = 4.6:1

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
[ ] Using Institutional Print palette (INK, REGION, SIGNAL, CANVAS, VOID)
[ ] Import colors from 'constants/colors' — no hardcoded hex
[ ] Numbers use font-mono tabular-nums
[ ] Touch targets >= 44px
[ ] Weapon aesthetic: rounded-none on cards, buttons, inputs

COLOR MAPPING:
[ ] Primary text: text-slate-900 (INK.primary)
[ ] Body text: text-slate-600 (INK.mid)
[ ] Muted text: text-slate-400 (INK.muted)
[ ] Borders: border-slate-200 (CANVAS.grid)
[ ] Accent: text-orange-500/600 (SIGNAL.accent)
[ ] Regions: slate-900/700/500 for CCR/RCR/OCR

STATES:
[ ] active: feedback on all buttons
[ ] Loading/Empty/Error states designed
[ ] focus-visible:ring-2 focus-visible:ring-blue-600 for keyboard

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
[ ] Colors imported from constants/colors

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
