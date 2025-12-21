---
name: dashboard-layout
description: Platform-agnostic responsive layout system for data-heavy analytics dashboards. Use when creating layouts, adding responsive behavior, wrapping charts, or adapting pages for ANY device (desktop, laptop, tablet, iPad, iPhone, Android). Covers breakpoints, containers, chart wrappers, grids, overflow prevention, and device-specific considerations.
---

# Dashboard Layout System

## Philosophy

Desktop users are PRIMARY. Build for 1440px+ first, then gracefully adapt down. Mobile/tablet must be USABLE and PRESENTABLE—not feature-complete clones.

---

## 1. Multi-Platform Support Matrix

### Target Devices & Viewports

| Device Category | Examples | Width Range | Priority |
|-----------------|----------|-------------|----------|
| Large Desktop | iMac, 4K monitors | 1920px-2560px | Medium |
| Desktop | MacBook 15", external monitors | 1440px-1919px | **HIGH** |
| Small Desktop | MacBook 13", laptops | 1280px-1439px | HIGH |
| Tablet Landscape | iPad Pro/Air landscape | 1024px-1279px | HIGH |
| Tablet Portrait | iPad portrait, Android tablets | 768px-1023px | HIGH |
| Large Phone | iPhone Pro Max, large Android | 428px-767px | HIGH |
| Standard Phone | iPhone 14/15, most Android | 375px-427px | **HIGH** |
| Small Phone | iPhone SE, older Android | 320px-374px | Medium |

### Input Methods by Platform

| Platform | Primary Input | Secondary | Considerations |
|----------|---------------|-----------|----------------|
| Desktop | Mouse | Keyboard | Hover states, precise clicks, right-click |
| Laptop | Trackpad | Keyboard | Gesture support, hover states |
| iPad + Magic Keyboard | Pointer | Touch, Keyboard | Hover works! |
| iPad (touch only) | Touch | Apple Pencil | No hover, 44pt targets |
| iPhone | Touch | - | No hover, safe areas, 44pt targets |
| Android Phone | Touch | - | No hover, 48dp targets recommended |
| Android Tablet | Touch | Stylus | Similar to iPad touch |

---

## 2. Breakpoint Strategy

### Tailwind Breakpoints (Desktop-First)

```css
/* Full desktop: 1440px+ (primary target) */
/* Standard desktop: 1280px-1439px */
@media (max-width: 1439px) { /* xl adjustments */ }

/* Small desktop/Large tablet: 1024px-1279px */
@media (max-width: 1279px) { /* lg adjustments */ }

/* Tablet: 768px-1023px */
@media (max-width: 1023px) { /* md adjustments */ }

/* Large phone: 428px-767px */
@media (max-width: 767px) { /* sm adjustments */ }

/* Small phone: 320px-427px */
@media (max-width: 427px) { /* xs adjustments */ }
```

### Tailwind Classes Pattern

```tsx
<div className="
  grid grid-cols-4 gap-6    // Desktop: 4 columns
  xl:grid-cols-4            // Large desktop
  lg:grid-cols-3            // Small desktop
  md:grid-cols-2            // Tablet
  sm:grid-cols-1            // Phone
">
```

---

## 3. Device-Specific Considerations

### iOS Safe Areas (iPhone Notch/Dynamic Island/Home Indicator)

```tsx
// Viewport meta tag (in index.html)
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

// Bottom safe area (home indicator)
<div className="pb-safe">  // Custom class
// OR
<div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>

// Full safe area handling
<div className="
  pt-safe          // Top (notch/dynamic island)
  pb-safe          // Bottom (home indicator)
  pl-safe          // Left (landscape)
  pr-safe          // Right (landscape)
">

// Tailwind config addition:
// theme.extend.padding: {
//   'safe': 'env(safe-area-inset-bottom)',
// }
```

### Orientation Handling

```tsx
// Detect orientation
const isLandscape = window.matchMedia('(orientation: landscape)').matches;

// CSS for orientation
@media (orientation: portrait) {
  .sidebar { display: none; }
}
@media (orientation: landscape) {
  .sidebar { display: block; }
}

// Lock orientation for specific pages (PWA)
// In manifest.json: "orientation": "portrait"
```

### Virtual Keyboard (iOS/Android)

```tsx
// Prevent layout jump when keyboard opens
<body className="min-h-screen min-h-[100dvh]">  // dvh = dynamic viewport height

// Visual viewport API for precise control
window.visualViewport?.addEventListener('resize', () => {
  // Adjust layout when keyboard opens
});

// Input focus scroll behavior
<input
  className="scroll-mt-20"  // Scroll margin when focused
  inputMode="numeric"       // Optimized keyboard
/>
```

### Pull-to-Refresh Prevention

```css
/* Prevent Chrome pull-to-refresh on scroll containers */
.scroll-container {
  overscroll-behavior-y: contain;
}

/* Prevent entire page pull-to-refresh */
html, body {
  overscroll-behavior: none;
}
```

### Touch Action Control

```css
/* Prevent double-tap zoom on buttons */
button, a, .interactive {
  touch-action: manipulation;
}

/* Allow pan only */
.pan-container {
  touch-action: pan-x pan-y;
}

/* Prevent all touch default behavior */
.custom-gesture {
  touch-action: none;
}
```

---

## 4. Overflow Safety (CRITICAL)

### Forbidden Actions

- NEVER introduce horizontal overflow (no x-scroll on any viewport)
- NEVER allow tables, long text, or filters to exceed container width
- NEVER use fixed pixel widths larger than 320px (smallest target)

### Mandatory Container Rules

```tsx
// ALL layout containers MUST include:
<div className="max-w-full overflow-x-hidden">
  {/* Flex/grid children need min-w-0 */}
  <div className="flex min-w-0">
    <div className="min-w-0 flex-1">{/* content */}</div>
  </div>
</div>
```

### Mandatory Text Rules

```tsx
<p className="break-words">{longText}</p>
<span className="truncate max-w-full">{title}</span>
<p className="line-clamp-2">{description}</p>
```

### Mandatory Table Rules

```tsx
<div className="overflow-x-auto max-w-full -mx-4 px-4">
  <table className="table-fixed w-full min-w-[600px]">
    {/* Allow horizontal scroll, but contain it */}
  </table>
</div>
```

---

## 5. Page Layout Containers

### Main Dashboard Layout

```tsx
<div className="min-h-screen min-h-[100dvh] bg-gray-50">
  {/* Header */}
  <header className="
    h-14 md:h-16
    px-4 md:px-6 lg:px-8
    pt-safe  // iOS safe area
    border-b bg-white
    sticky top-0 z-40
  ">
    {/* Logo, nav, user menu */}
  </header>

  {/* Main content with sidebar */}
  <div className="flex">
    {/* Sidebar - Desktop only */}
    <aside className="
      hidden lg:flex lg:flex-col
      w-64 xl:w-72
      border-r bg-white
      sticky top-14 md:top-16
      h-[calc(100vh-3.5rem)] md:h-[calc(100vh-4rem)]
      overflow-y-auto
    ">
      {/* Nav items */}
    </aside>

    {/* Content - Fluid */}
    <main className="
      flex-1 min-w-0
      p-4 md:p-6 lg:p-8
      pb-safe  // iOS safe area
      overflow-x-hidden
    ">
      {/* Dashboard content */}
    </main>
  </div>

  {/* Mobile bottom nav */}
  <nav className="
    lg:hidden
    fixed bottom-0 inset-x-0
    h-16 pb-safe
    bg-white border-t
    flex items-center justify-around
    z-40
  ">
    {/* 4-5 nav icons, 44px touch targets */}
  </nav>
</div>
```

### Dashboard Grid

```tsx
<div className="space-y-4 md:space-y-6 max-w-full overflow-hidden">
  {/* KPI Cards */}
  <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
    {kpis.map(kpi => <KPICard key={kpi.id} {...kpi} />)}
  </div>

  {/* Charts Row */}
  <div className="grid gap-4 md:gap-6 grid-cols-1 lg:grid-cols-2">
    <ChartCard title="Volume"><VolumeChart /></ChartCard>
    <ChartCard title="Trends"><TrendChart /></ChartCard>
  </div>

  {/* Full-width section */}
  <ChartCard title="Distribution">
    <DistributionChart />
  </ChartCard>
</div>
```

---

## 6. Chart Container Contract

### The Boundary Rule

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYOUT LAYER (You control this)                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Card wrapper, padding, grid position                        │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ CHART CONTAINER (The boundary)                          │ │ │
│ │ │ ┌─────────────────────────────────────────────────────┐ │ │ │
│ │ │ │ ░░░░░░ CHART INTERNALS (DO NOT TOUCH) ░░░░░░░░░░░░░ │ │ │ │
│ │ │ └─────────────────────────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Standard ChartCard Component

```tsx
export function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  minHeight = 300,
  mobileMinHeight = 250,  // Smaller on mobile
  aspectRatio,
  actions,
  isLoading,
  error,
}: ChartCardProps) {
  return (
    <div className={`
      bg-white rounded-lg border shadow-sm
      flex flex-col max-w-full overflow-hidden
      ${className}
    `}>
      {/* Header */}
      <div className="
        flex items-start justify-between
        p-3 md:p-4 border-b min-w-0
      ">
        <div className="min-w-0 flex-1">
          <h3 className="
            font-semibold text-gray-900
            text-sm md:text-base
            truncate
          ">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 ml-2">{actions}</div>}
      </div>

      {/* Chart Container */}
      <div
        className="flex-1 p-3 md:p-4 overflow-hidden"
        style={{
          minHeight: `${mobileMinHeight}px`,
        }}
      >
        <div
          className="h-full w-full"
          style={{
            minHeight: `min(${minHeight}px, 60vh)`,  // Limit on small screens
          }}
        >
          {isLoading ? <LoadingState /> : error ? <ErrorState message={error} /> : children}
        </div>
      </div>
    </div>
  );
}
```

### Chart Library Patterns

```tsx
// Recharts - CORRECT
<ChartCard title="Volume" minHeight={350}>
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <XAxis dataKey="month" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 12 }} />
      <Tooltip />
      <Bar dataKey="count" fill="#3b82f6" />
    </BarChart>
  </ResponsiveContainer>
</ChartCard>

// Chart.js - CORRECT
<ChartCard title="Distribution" minHeight={300}>
  <Bar
    data={chartData}
    options={{
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: window.innerWidth < 768 ? 'bottom' : 'right'
        }
      }
    }}
  />
</ChartCard>
```

### Very Small Screens (<375px)

```tsx
function ResponsiveChartSection({ data }: Props) {
  const { width } = useWindowSize();

  // Very small screens: simplified view
  if (width < 375) {
    return (
      <div className="p-4 bg-white rounded-lg border">
        <h3 className="font-semibold mb-2">Summary</h3>
        <DataSummaryList data={data} />
      </div>
    );
  }

  // Normal: full chart
  return (
    <ChartCard title="Analysis">
      <Chart data={data} />
    </ChartCard>
  );
}
```

---

## 7. Responsive Component Patterns

### Tables (All Devices)

```tsx
{/* Desktop: Full table */}
<div className="hidden md:block overflow-x-auto">
  <table className="min-w-full table-fixed">
    {/* Full table */}
  </table>
</div>

{/* Mobile: Card view */}
<div className="md:hidden space-y-3">
  {data.map(row => (
    <div
      key={row.id}
      className="
        bg-white rounded-lg border p-4
        active:bg-gray-50  // Touch feedback
      "
    >
      <div className="font-medium">{row.title}</div>
      <div className="text-sm text-gray-500 mt-1">{row.details}</div>
    </div>
  ))}
</div>
```

### Navigation/Sidebar

```tsx
function ResponsiveNav() {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-64 border-r">
        <NavContent />
      </aside>

      {/* Mobile hamburger */}
      <button
        className="
          lg:hidden fixed top-4 left-4 z-50
          min-h-[44px] min-w-[44px]
          flex items-center justify-center
          bg-white rounded-lg shadow
        "
        onClick={() => setMobileMenuOpen(true)}
      >
        <MenuIcon />
      </button>

      {/* Mobile drawer */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <nav className="
            absolute inset-y-0 left-0
            w-64 max-w-[80vw]
            bg-white
            pt-safe pb-safe
            overflow-y-auto
            animate-slide-in-left
          ">
            <NavContent />
          </nav>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav className="
        lg:hidden fixed bottom-0 inset-x-0
        h-16 pb-safe
        bg-white border-t
        flex items-center justify-around
      ">
        {navItems.slice(0, 5).map(item => (
          <a
            key={item.id}
            href={item.href}
            className="
              flex flex-col items-center justify-center
              min-h-[44px] min-w-[44px]
              px-3 py-2
              text-xs
            "
          >
            <item.icon className="w-6 h-6" />
            <span className="mt-1">{item.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
```

### KPI Cards

```tsx
<div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-4">
  {kpis.map(kpi => (
    <div
      key={kpi.id}
      className="
        p-3 md:p-4
        bg-white rounded-lg border shadow-sm
        min-w-0 overflow-hidden
      "
    >
      <span className="
        text-[10px] md:text-xs
        uppercase tracking-wide
        text-gray-500
        truncate block
      ">
        {kpi.label}
      </span>
      <div className="
        text-base md:text-lg lg:text-xl
        font-bold mt-1
        truncate
        font-mono tabular-nums
      ">
        {kpi.value}
      </div>
      {kpi.trend && (
        <span className={`
          text-xs md:text-sm
          ${kpi.trend > 0 ? 'text-green-600' : 'text-red-600'}
        `}>
          {kpi.trend > 0 ? '+' : ''}{kpi.trend}%
        </span>
      )}
    </div>
  ))}
</div>
```

---

## 8. CSS Variables

```css
:root {
  --space-page-x: 2rem;
  --space-page-y: 1.5rem;
  --space-card: 1.5rem;
  --space-grid-gap: 1.5rem;
  --sidebar-width: 16rem;
  --header-height: 4rem;
  --chart-min-height: 300px;
  --touch-target: 44px;
}

@media (max-width: 1023px) {
  :root {
    --space-page-x: 1.5rem;
    --space-page-y: 1rem;
    --space-card: 1rem;
    --space-grid-gap: 1rem;
    --sidebar-width: 0;
    --header-height: 3.5rem;
  }
}

@media (max-width: 767px) {
  :root {
    --space-page-x: 1rem;
    --space-page-y: 0.75rem;
    --space-card: 0.75rem;
    --space-grid-gap: 0.75rem;
    --chart-min-height: 250px;
  }
}
```

---

## 9. Anti-Patterns

```tsx
// WRONG: Fixed pixel widths
<div style={{ width: '800px' }}>

// CORRECT: Fluid with max-width
<div className="w-full max-w-4xl">

// WRONG: Missing min-w-0 on flex child
<div className="flex">
  <div className="flex-1">{/* Can overflow! */}</div>
</div>

// CORRECT: Prevent flex child overflow
<div className="flex">
  <div className="flex-1 min-w-0">{/* Safe */}</div>
</div>

// WRONG: Hiding content without alternative
<div className="hidden md:block">
  {/* Content just gone on mobile! */}
</div>

// CORRECT: Alternative presentation
<div className="hidden md:block">{/* Desktop */}</div>
<div className="md:hidden">{/* Mobile alternative */}</div>

// WRONG: Hover-only interaction
<div className="opacity-0 hover:opacity-100">

// CORRECT: Works on touch too
<div className="opacity-0 hover:opacity-100 focus:opacity-100 group-active:opacity-100">
```

---

## 10. Quick Checklist

Before completing any layout change:

### Overflow & Containers
- [ ] No horizontal scrollbar at any viewport (320px to 1920px)
- [ ] All containers have `max-w-full overflow-x-hidden`
- [ ] All flex/grid children have `min-w-0`
- [ ] Long text uses `break-words` or `truncate`
- [ ] Tables wrapped in `overflow-x-auto`

### Multi-Platform
- [ ] iOS safe areas handled (notch, home indicator)
- [ ] Touch targets >= 44px on all interactive elements
- [ ] No hover-only interactions
- [ ] Works in both portrait and landscape
- [ ] Virtual keyboard doesn't break layout

### Responsive
- [ ] Desktop (1440px): Full layout works
- [ ] Tablet (768px): Graceful adaptation
- [ ] Mobile (375px): Single column, usable
- [ ] Small phone (320px): Still functional

### Charts
- [ ] Charts use `ResponsiveContainer` or equivalent
- [ ] Chart containers have overflow:hidden
- [ ] Fallback for very small screens if needed
