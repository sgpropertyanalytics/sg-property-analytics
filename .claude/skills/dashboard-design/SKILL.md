---
name: dashboard-design
description: Platform-agnostic design system for data-heavy analytics dashboards. Use when styling dashboard pages, creating filter panels, building UI components, or applying visual design across ALL devices (desktop, tablet, iPad, iPhone, Android). Covers color palette, typography, component styling, filter UX patterns, touch interactions, and accessibility.
---

# Dashboard Design System

> **Filter UX patterns reference**: See [POWER_BI_PATTERNS.md](../../../POWER_BI_PATTERNS.md#6-filter-ux-patterns) for complete filter design patterns.

## Philosophy

### Design Principles

1. **Data First, Style Second** - Numbers and charts must be instantly scannable
2. **Professional Distinctiveness** - Recognizable identity without chaos
3. **Refined, Not Flashy** - Subtle details that reward attention
4. **Platform Agnostic** - Works identically on desktop, tablet, and mobile

---

## 1. Multi-Platform Component Requirements

### Every Interactive Element Must Have

```tsx
// Universal requirements for buttons, links, chips, toggles:
<button className="
  min-h-[44px] min-w-[44px]     // iOS minimum (Android: 48dp)
  px-4 py-2                      // Adequate padding

  // Visual states for ALL input methods:
  hover:bg-[#EAE0CF]/30          // Desktop mouse hover
  focus-visible:ring-2           // Keyboard focus
  active:bg-[#EAE0CF]/50         // Touch/click feedback
  active:scale-[0.98]            // Press feedback

  // Prevent unwanted touch behaviors:
  touch-action-manipulation      // No double-tap zoom
  select-none                    // No text selection

  transition-all duration-100    // Quick feedback
">
```

### State Differences by Input

| State | Desktop (Mouse) | Touch (Mobile/Tablet) | Keyboard |
|-------|-----------------|----------------------|----------|
| Resting | Default | Default | Default |
| Hover | `hover:` styles | N/A (skip) | N/A |
| Focus | `focus:` ring | `focus:` ring | `focus-visible:` ring |
| Active | `active:` press | `active:` press | `active:` press |
| Disabled | Greyed, no hover | Greyed | Greyed, skip in tab |

---

## 2. Color System

### Project Palette (Singapore Property Analyzer)

**Source**: https://colorhunt.co/palette/21344854779294b4c1eae0cf

| Color | Hex | Usage |
|-------|-----|-------|
| Deep Navy | `#213448` | Headings, primary text, CCR region |
| Ocean Blue | `#547792` | Secondary text, labels, RCR region |
| Sky Blue | `#94B4C1` | Borders, icons, OCR region, disabled |
| Sand/Cream | `#EAE0CF` | Backgrounds, hover states, footers |

### Tailwind Usage

```tsx
// Primary text
className="text-[#213448]"

// Secondary text
className="text-[#547792]"

// Borders
className="border-[#94B4C1]/50"

// Backgrounds
className="bg-[#EAE0CF]/30"

// Cards
className="bg-white rounded-lg border border-[#94B4C1]/50 shadow-sm"

// Active button (with touch feedback)
className="bg-[#547792] text-white border-[#547792] active:bg-[#213448]"

// Default button (with touch feedback)
className="bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] active:bg-[#EAE0CF]/50"

// Disabled
className="bg-[#EAE0CF]/50 text-[#94B4C1] cursor-not-allowed"
```

### Semantic Colors

```css
--positive: #22c55e;    /* Success, up */
--negative: #ef4444;    /* Error, down */
--neutral: #6b7280;     /* Unchanged */
--warning: #f59e0b;     /* Caution */
```

### Chart Colors

```javascript
// Region colors
const regionColors = {
  CCR: 'rgba(33, 52, 72, 0.8)',    // Deep Navy
  RCR: 'rgba(84, 119, 146, 0.8)',  // Ocean Blue
  OCR: 'rgba(148, 180, 193, 0.8)', // Sky Blue
};

// Bedroom colors
const bedroomColors = {
  1: 'rgba(247, 190, 129, 0.9)',
  2: 'rgba(79, 129, 189, 0.9)',
  3: 'rgba(40, 82, 122, 0.9)',
  4: 'rgba(17, 43, 60, 0.9)',
  5: 'rgba(155, 187, 89, 0.9)',
};
```

---

## 3. Typography

### Font Stack (Current Implementation)

```css
/* frontend/src/index.css */
--font-sans: "Inter", system-ui, -apple-system, sans-serif;
```

Inter is the primary UI font. For monospace numbers in data displays, use:
```tsx
<span className="font-mono tabular-nums">1,234,567</span>
```

### Responsive Typography

```tsx
// Headings - scale with viewport
<h1 className="text-xl md:text-2xl lg:text-3xl font-bold">
<h2 className="text-lg md:text-xl font-semibold">
<h3 className="text-base md:text-lg font-medium">

// Body
<p className="text-sm md:text-base">

// Small/Labels
<span className="text-xs md:text-sm">

// Data/Numbers - always monospace
<span className="font-mono tabular-nums text-lg md:text-xl">
```

---

## 4. Component Patterns (All Platforms)

### Buttons

```tsx
// Primary Button
<button className="
  min-h-[44px] px-4 py-2 rounded-md
  bg-[#213448] text-white
  hover:bg-[#547792]
  active:bg-[#1a2a3a] active:scale-[0.98]
  focus-visible:ring-2 focus-visible:ring-[#547792] focus-visible:ring-offset-2
  disabled:bg-[#94B4C1] disabled:cursor-not-allowed
  transition-all duration-100
  touch-action-manipulation
">

// Secondary Button
<button className="
  min-h-[44px] px-4 py-2 rounded-md
  bg-white text-[#213448]
  border border-[#94B4C1]
  hover:border-[#547792] hover:bg-[#EAE0CF]/20
  active:bg-[#EAE0CF]/50 active:scale-[0.98]
  focus-visible:ring-2 focus-visible:ring-[#547792]
  transition-all duration-100
  touch-action-manipulation
">

// Toggle Button (segment control)
<button className={`
  min-h-[44px] px-4 py-2 rounded-md border
  transition-all duration-100
  touch-action-manipulation
  ${isSelected
    ? 'bg-[#547792] text-white border-[#547792] active:bg-[#213448]'
    : 'bg-white text-[#213448] border-[#94B4C1] hover:border-[#547792] active:bg-[#EAE0CF]/50'
  }
`}>
```

### Cards

```tsx
<div className="
  bg-white rounded-lg
  border border-[#94B4C1]/50
  shadow-sm
  p-3 md:p-4 lg:p-6
  hover:shadow-md          // Desktop enhancement
  transition-shadow
  overflow-hidden
">
```

### Data Tables

```tsx
{/* Desktop: Full table */}
<div className="hidden md:block overflow-x-auto">
  <table className="w-full table-fixed">
    <thead>
      <tr className="border-b border-[#94B4C1]/50">
        <th className="
          text-left text-xs font-semibold
          uppercase tracking-wide
          text-[#547792] p-3
        ">
          Column
        </th>
      </tr>
    </thead>
    <tbody>
      <tr className="
        border-b border-[#94B4C1]/30
        hover:bg-[#EAE0CF]/20
        active:bg-[#EAE0CF]/30  // Touch feedback
        transition-colors
      ">
        <td className="p-3 text-sm">{value}</td>
      </tr>
    </tbody>
  </table>
</div>

{/* Mobile: Card view */}
<div className="md:hidden space-y-3">
  {data.map(row => (
    <div
      key={row.id}
      className="
        bg-white rounded-lg border border-[#94B4C1]/50 p-4
        active:bg-[#EAE0CF]/20
        transition-colors
      "
    >
      <div className="font-medium text-[#213448]">{row.title}</div>
      <div className="text-xs text-[#547792] mt-1">{row.details}</div>
    </div>
  ))}
</div>
```

### KPI Cards

```tsx
<div className="
  p-3 md:p-4
  bg-white rounded-lg border border-[#94B4C1]/50 shadow-sm
  min-w-0 overflow-hidden
">
  <span className="
    text-[10px] md:text-xs
    uppercase tracking-wide
    text-[#547792]
    truncate block
  ">
    {label}
  </span>
  <div className="
    text-lg md:text-xl lg:text-2xl
    font-bold mt-1
    font-mono tabular-nums
    text-[#213448]
    truncate
  ">
    {value}
  </div>
  {trend && (
    <span className={`
      text-xs md:text-sm
      ${trend > 0 ? 'text-green-600' : 'text-red-600'}
    `}>
      {trend > 0 ? '+' : ''}{trend}%
    </span>
  )}
</div>
```

---

## 5. Filter UX Patterns

### Responsive Filter Strategy

| Viewport | Pattern |
|----------|---------|
| Desktop (1024px+) | Horizontal filter bar, always visible |
| Tablet (768-1023px) | Collapsible bar or slide-in panel |
| Mobile (<768px) | Full-screen drawer or bottom sheet |

### Desktop Filter Bar

```tsx
<div className="hidden lg:block">
  <div className="
    bg-white rounded-lg border border-[#94B4C1]/50
    p-4 mb-6
  ">
    <div className="flex flex-wrap items-end gap-4">
      <FilterDropdown label="District" />
      <FilterDropdown label="Bedroom" />
      <FilterDateRange />

      {activeCount > 0 && (
        <button className="
          min-h-[44px] px-3
          text-sm text-[#547792]
          hover:text-[#213448]
          active:text-[#213448]
        ">
          Clear ({activeCount})
        </button>
      )}
    </div>

    {/* Active filter chips */}
    {activeCount > 0 && (
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-[#94B4C1]/30">
        {chips.map(chip => (
          <FilterChip key={chip.id} {...chip} />
        ))}
      </div>
    )}
  </div>
</div>
```

### Mobile Filter Drawer

```tsx
<div className="lg:hidden">
  {/* Toggle button */}
  <button
    onClick={() => setOpen(true)}
    className="
      w-full flex items-center gap-2
      min-h-[48px] px-4
      bg-white rounded-lg border border-[#94B4C1]/50
      active:bg-[#EAE0CF]/30
      transition-colors
    "
  >
    <FilterIcon className="w-5 h-5 text-[#547792]" />
    <span className="font-medium text-[#213448]">Filters</span>
    {activeCount > 0 && (
      <span className="
        ml-auto px-2 py-0.5
        bg-[#547792]/20 text-[#213448]
        text-sm rounded-full
      ">
        {activeCount}
      </span>
    )}
  </button>

  {/* Drawer */}
  {isOpen && (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
      />

      {/* Panel */}
      <div className="
        absolute inset-y-0 right-0
        w-full max-w-sm bg-white
        flex flex-col
        animate-slide-in-right
      ">
        {/* Header */}
        <div className="
          flex justify-between items-center
          p-4 border-b border-[#94B4C1]/30
          pt-safe  // iOS notch
        ">
          <h2 className="font-semibold text-[#213448]">Filters</h2>
          <button
            onClick={close}
            className="
              min-h-[44px] min-w-[44px]
              flex items-center justify-center
              active:bg-[#EAE0CF]/30
              rounded-full
            "
          >
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="
          flex-1 overflow-y-auto
          overscroll-contain  // Prevent pull-to-refresh
          p-4 space-y-6
        ">
          <FilterSection title="District">
            <FilterCheckboxGroup options={districts} />
          </FilterSection>

          <FilterSection title="Bedroom">
            <FilterButtonGroup options={bedrooms} />
          </FilterSection>

          {/* More sections... */}
        </div>

        {/* Sticky footer */}
        <div className="
          p-4 border-t border-[#94B4C1]/30
          bg-[#EAE0CF]/30
          pb-safe  // iOS home indicator
        ">
          <button className="
            w-full min-h-[48px]
            bg-[#213448] text-white rounded-md
            active:bg-[#1a2a3a]
            transition-colors
          ">
            Apply Filters
          </button>
          <button className="
            w-full min-h-[44px] mt-2
            text-[#547792]
            active:text-[#213448]
            transition-colors
          ">
            Clear All
          </button>
        </div>
      </div>
    </div>
  )}
</div>
```

### Filter Chip (Touch-Friendly)

```tsx
function FilterChip({ label, onRemove }) {
  return (
    <span className="
      inline-flex items-center gap-1
      px-2 py-1 rounded-full text-sm
      bg-[#547792]/20 text-[#213448]
      border border-[#547792]/30
    ">
      <span className="truncate max-w-[120px]">{label}</span>
      <button
        onClick={onRemove}
        className="
          min-h-[24px] min-w-[24px]
          flex items-center justify-center
          rounded-full
          hover:bg-[#547792]/30
          active:bg-[#547792]/50
          transition-colors
        "
        aria-label={`Remove ${label} filter`}
      >
        <XIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
```

### Filter Section (Collapsible)

```tsx
function FilterSection({ title, activeCount, children }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-[#94B4C1]/30 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="
          w-full min-h-[48px] px-4
          flex items-center justify-between
          hover:bg-[#EAE0CF]/20
          active:bg-[#EAE0CF]/30
          transition-colors
        "
      >
        <span className="font-medium text-[#213448]">{title}</span>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span className="text-xs bg-[#547792]/20 px-1.5 py-0.5 rounded">
              {activeCount}
            </span>
          )}
          <ChevronIcon className={`
            w-4 h-4 text-[#547792]
            transition-transform duration-200
            ${expanded ? 'rotate-180' : ''}
          `} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
```

### FilterGroup Rules

```tsx
// WRONG: Duplicate labels
<FilterGroup label="Districts">
  <Select label="Districts" />  {/* Label appears twice! */}
</FilterGroup>

// CORRECT: Single label source
<FilterGroup label="Districts">
  <Select label={null} />
</FilterGroup>

// CORRECT: No wrapper label
<FilterGroup label={null}>
  <Select label="Districts" />
</FilterGroup>
```

---

## 6. Motion & Animations

### Platform-Appropriate Motion

```css
/* Quick feedback (all platforms) */
.quick { transition: all 0.1s ease; }

/* Medium (drawer, expand) */
.medium { transition: all 0.2s ease-out; }

/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Standard Animations

```css
@keyframes slide-in-right {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes slide-in-left {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.animate-slide-in-right {
  animation: slide-in-right 0.2s ease-out;
}
```

### Avoid

```css
/* Continuous animations */
.always-pulsing { animation: pulse 2s infinite; }

/* Slow transitions */
.slow { transition: all 0.8s ease; }

/* Excessive movement */
.too-much:hover { transform: scale(1.2) rotate(5deg); }
```

---

## 7. Touch Interactions

### Touch Target Sizes

```css
/* iOS: 44pt minimum, Android: 48dp recommended */
.touch-target {
  min-height: 44px;
  min-width: 44px;
}

/* Adequate spacing between targets */
.touch-target + .touch-target {
  margin-left: 8px;  /* Prevent accidental taps */
}
```

### Touch Feedback

```tsx
// Press feedback
<button className="
  active:scale-[0.98]
  active:bg-opacity-80
  transition-transform duration-75
">

// Ripple effect alternative
<div className="
  relative overflow-hidden
  active:after:opacity-100
  after:absolute after:inset-0
  after:bg-black/10 after:opacity-0
  after:transition-opacity
">
```

### Prevent Unwanted Behaviors

```css
/* Double-tap zoom */
button, a, .interactive {
  touch-action: manipulation;
}

/* Pull-to-refresh in scroll containers */
.scroll-container {
  overscroll-behavior-y: contain;
}

/* Text selection on UI elements */
.ui-element {
  user-select: none;
  -webkit-user-select: none;
}
```

---

## 8. Empty, Loading & Error States

### Loading

```tsx
<div className="h-48 md:h-64 flex items-center justify-center">
  <div className="flex flex-col items-center gap-2">
    <div className="
      w-8 h-8
      border-2 border-[#547792] border-t-transparent
      rounded-full animate-spin
    " />
    <span className="text-sm text-[#547792]">Loading...</span>
  </div>
</div>
```

### Empty State

```tsx
<div className="h-48 md:h-64 flex items-center justify-center p-4">
  <div className="text-center">
    <SearchIcon className="w-10 h-10 md:w-12 md:h-12 text-[#94B4C1] mx-auto mb-2" />
    <p className="text-[#547792] text-sm md:text-base">No data matches your filters</p>
    <button
      onClick={clearFilters}
      className="
        mt-3 min-h-[44px] px-4
        text-sm text-[#213448]
        hover:underline active:underline
      "
    >
      Clear filters
    </button>
  </div>
</div>
```

### Error State

```tsx
<div className="h-48 md:h-64 flex items-center justify-center p-4">
  <div className="text-center">
    <AlertIcon className="w-10 h-10 text-red-400 mx-auto mb-2" />
    <p className="text-[#213448]">{error}</p>
    <button
      onClick={retry}
      className="mt-3 min-h-[44px] px-4 text-sm text-[#547792]"
    >
      Try again
    </button>
  </div>
</div>
```

---

## 9. Accessibility

### Focus Management

```tsx
// Visible focus rings
<button className="
  focus:outline-none
  focus-visible:ring-2
  focus-visible:ring-[#547792]
  focus-visible:ring-offset-2
">

// Focus trap in modals
useEffect(() => {
  if (isOpen) {
    const firstFocusable = modalRef.current?.querySelector('button, input');
    firstFocusable?.focus();
  }
}, [isOpen]);
```

### Screen Reader Support

```tsx
// Announce dynamic changes
<div aria-live="polite" className="sr-only">
  {activeCount} filters applied, showing {resultCount} results
</div>

// Label icon-only buttons
<button aria-label="Close filter panel">
  <XIcon aria-hidden="true" />
</button>

// Describe charts
<div role="img" aria-label="Bar chart showing transaction volume by month">
  <Chart />
</div>
```

### Color Contrast

```
Minimum contrast ratios (WCAG AA):
- Normal text: 4.5:1
- Large text (18px+): 3:1
- UI components: 3:1

Project palette contrasts:
- #213448 on white: 10.7:1 ✓
- #547792 on white: 4.6:1 ✓
- #94B4C1 on white: 2.8:1 ⚠ (use for decorative only)
```

---

## 10. Quick Checklist

### Visual Design
- [ ] Using project color palette (not generic purples)
- [ ] Typography readable at all sizes
- [ ] Numbers use `tabular-nums`
- [ ] Contrast ratios pass WCAG AA

### Platform Support
- [ ] Touch targets >= 44px
- [ ] `active:` states provide touch feedback
- [ ] No hover-only interactions
- [ ] Works without mouse

### Filters
- [ ] Desktop: horizontal bar visible
- [ ] Mobile: drawer accessible
- [ ] Filter chips have clear remove buttons
- [ ] No duplicate labels

### States
- [ ] Loading state designed
- [ ] Empty state designed
- [ ] Error state with retry
- [ ] Focus states visible

### Motion
- [ ] Respects `prefers-reduced-motion`
- [ ] Transitions < 200ms for feedback
- [ ] No continuous/distracting animations
