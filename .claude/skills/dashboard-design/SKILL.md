---
name: dashboard-design
description: Design system for analytics dashboards. Covers colors, typography, components, touch interactions, and accessibility.
---

# Dashboard Design System

## 1. Color Palette

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

## 2. Touch Targets (MANDATORY)

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

## 3. Components

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

## 4. Data Tables (MANDATORY: Sortable)

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

## 5. Filter Patterns

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
  <button className="min-h-[24px] min-w-[24px] rounded-full active:bg-[#547792]/50">×</button>
</span>
```

---

## 6. States

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

## 7. Typography

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

## 8. Motion

```css
/* Quick feedback: 100ms, Medium: 200ms */
transition-all duration-100

/* Respect user preference */
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## 9. Accessibility

```tsx
// Focus rings
focus:outline-none focus-visible:ring-2 focus-visible:ring-[#547792]

// Icon buttons need labels
<button aria-label="Close"><XIcon aria-hidden="true" /></button>

// Announce changes
<div aria-live="polite" className="sr-only">{resultCount} results</div>
```

**Contrast:** #213448 on white = 10.7:1 ✓, #547792 on white = 4.6:1 ✓

---

## 10. Quick Checklist

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

ACCESSIBILITY:
[ ] No hover-only interactions
[ ] Icon buttons have aria-label
[ ] Respects prefers-reduced-motion
```
