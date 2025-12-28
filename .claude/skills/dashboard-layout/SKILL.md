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

## 7. Responsive Patterns

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

## 8. Anti-Patterns

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

## 9. Quick Checklist

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
```
