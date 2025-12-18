---
name: ui-freeze
description: Non-regression guardrail for data-heavy analytics dashboards. Use when modifying ANY existing dashboard code to prevent breaking charts, filters, tooltips, or data visualizations. Protects chart internals while allowing wrapper/layout changes. ALWAYS activate this skill before editing any file containing chart components, filter logic, or data visualization code.
---

# UI Freeze: Dashboard Visual Protection

## Purpose
Prevent accidental breaking of existing dashboard visualizations when making layout, styling, or responsive changes. This skill acts as a guardrail—not a blocker—allowing improvements while protecting critical functionality.

## When This Skill Activates
- Editing files containing chart components (Recharts, Chart.js, D3, Plotly, etc.)
- Modifying filter components or filter state logic
- Changing CSS that could cascade to chart containers
- Adjusting layout wrappers around data visualizations
- Any responsive/mobile adaptation work on dashboard pages

## The "Do Not Touch" List (Chart Internals)

### NEVER modify these without explicit user request:
```
├── Chart Configuration
│   ├── axis scales, domains, ranges
│   ├── data transformation/aggregation logic
│   ├── tooltip content and positioning logic
│   ├── legend configuration and positioning
│   └── chart type (bar, line, pie, etc.)
│
├── Filter Logic
│   ├── filter state management (useState, Redux, etc.)
│   ├── filter-to-chart data binding
│   ├── cross-filter relationships
│   └── URL param sync for filters
│
├── Data Layer
│   ├── API calls and data fetching
│   ├── data parsing and normalization
│   └── computed/derived metrics
│
└── Interactive Features
    ├── click handlers on chart elements
    ├── drill-down navigation
    ├── zoom/pan functionality
    └── selection/highlight behavior
```

## Safe Modification Zone (Wrappers Only)

### YOU MAY modify:
```
├── Layout Containers
│   ├── grid/flex wrappers around charts
│   ├── responsive container widths
│   ├── gap/padding between cards
│   └── section ordering/arrangement
│
├── Card/Panel Styling
│   ├── card borders, shadows, backgrounds
│   ├── header/title styling
│   ├── card padding (outer only)
│   └── responsive card stacking
│
├── Page Layout
│   ├── sidebar width/collapse behavior
│   ├── header/nav responsiveness
│   ├── page margins/padding
│   └── scroll container behavior
│
└── Typography (Non-Chart)
    ├── page titles, section headers
    ├── filter labels (not values)
    └── card titles
```

## Definition of "Breaking" (Must Avoid)

A change is BREAKING if it causes:

1. **Visual Overflow**
   - Horizontal scroll appears inside chart containers
   - Chart extends beyond its container bounds
   - Legends/labels get cropped or hidden

2. **Data Display Issues**
   - Axis labels become unreadable (too small, overlapping)
   - Tooltips position off-screen or behind elements
   - Data points become unclickable

3. **Filter Dysfunction**
   - Filters no longer visible without awkward scrolling
   - Filter dropdowns open off-screen
   - Filter state stops affecting charts

4. **Responsive Breakage**
   - Layout looks broken at any viewport width
   - Touch targets too small on mobile (<44px)
   - Essential info hidden on smaller screens

## Required Output Format

For EVERY change to dashboard code, provide:

```markdown
### Files Changed
| File | Change Type | Rationale |
|------|-------------|-----------|
| `path/to/file.tsx` | wrapper-only | Added responsive grid classes |
| `path/to/file.css` | scoped styles | Scoped to `.dashboard-layout` only |

### Verification Checklist
- [ ] Charts render at 1920px width
- [ ] Charts render at 1024px width  
- [ ] Charts render at 768px width
- [ ] Charts render at 375px width
- [ ] All filters accessible without scroll
- [ ] Tooltips functional on all breakpoints
- [ ] No horizontal overflow on any viewport

### Chart Internals Status
- [ ] CONFIRMED: No chart config modified
- [ ] CONFIRMED: No filter logic modified
- [ ] CONFIRMED: No data layer touched
```

## Implementation Pattern: The Wrapper Approach

### CORRECT: Responsive wrapper around chart
```tsx
// ✅ SAFE: Only the wrapper changes at breakpoints
<div className="chart-wrapper grid grid-cols-1 lg:grid-cols-2 gap-4">
  <div className="chart-card min-h-[300px] lg:min-h-[400px]">
    {/* Chart component remains UNTOUCHED */}
    <TransactionVolumeChart data={data} />
  </div>
</div>
```

### WRONG: Modifying chart internals for responsiveness
```tsx
// ❌ BREAKING: Changing chart config based on viewport
<TransactionVolumeChart 
  data={data}
  height={isMobile ? 200 : 400}  // DON'T DO THIS
  showLegend={!isMobile}         // DON'T DO THIS
  tickCount={isMobile ? 3 : 6}   // DON'T DO THIS
/>
```

### If Chart Must Be Responsive
When chart internals MUST change for different viewports (rare), use this safe pattern:

```tsx
// ✅ SAFE: ResponsiveContainer handles it internally
import { ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    {/* Chart config stays fixed */}
  </BarChart>
</ResponsiveContainer>
```

## Pre-Flight Check Before Any Edit

Before modifying any dashboard file, answer:

1. Does this file contain chart rendering code? → Extra caution
2. Does this file contain filter state/logic? → Extra caution
3. Will my CSS changes cascade beyond the target element? → Scope it
4. Am I changing anything inside a chart component's props? → STOP, ask user

## Emergency Recovery

If a breaking change is introduced:

1. Immediately identify the specific breaking commit/change
2. Revert to last working state
3. Apply changes incrementally with viewport testing after each
4. Never batch multiple chart-adjacent changes together
