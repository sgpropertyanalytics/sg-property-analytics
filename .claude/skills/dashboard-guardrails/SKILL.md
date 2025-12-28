---
name: dashboard-guardrails
description: Protection and verification system for dashboard development. ALWAYS activate before modifying ANY existing dashboard code. Defines what NOT to touch (chart internals, filter logic), provides verification checklists for all platforms (desktop, tablet, iPad, iPhone, Android), and ensures no regressions. Use before AND after any dashboard changes.
---

# Dashboard Guardrails

> **Filter patterns reference**: See [POWER_BI_PATTERNS.md](../../../POWER_BI_PATTERNS.md#8-guardrails---what-not-to-touch) for complete filter guardrails.
> **Automated validation**: Run `/validate-layout` to check overflow and responsiveness programmatically.

## Purpose

Prevent accidental breaking of dashboard visualizations while ensuring changes work across all platforms. This skill acts as a guardrail—not a blocker—allowing improvements while protecting critical functionality.

---

## Part 1: UI Freeze (What NOT to Touch)

### When This Activates

- Editing files containing chart components (Recharts, Chart.js, D3, etc.)
- Modifying filter components or filter state logic
- Changing CSS that could cascade to chart containers
- Adjusting layout wrappers around data visualizations
- Any responsive/mobile adaptation work on dashboard pages

### The "Do Not Touch" List (Chart Internals)

```
❌ NEVER modify for responsiveness without explicit user request:

├── Chart Configuration
│   ├── Axis scales, domains, ranges
│   ├── Data transformation/aggregation logic
│   ├── Tooltip content and positioning logic
│   ├── Legend configuration and positioning
│   └── Chart type (bar, line, pie, etc.)
│
├── Filter Logic
│   ├── Filter state management (useState, Redux, context)
│   ├── Filter-to-chart data binding
│   ├── Cross-filter relationships
│   └── URL param sync for filters
│
├── Data Layer
│   ├── API calls and data fetching
│   ├── Data parsing and normalization
│   └── Computed/derived metrics
│
└── Interactive Features
    ├── Click handlers on chart elements
    ├── Drill-down navigation
    ├── Zoom/pan functionality
    └── Selection/highlight behavior
```

### The Safe Zone (Wrappers Only)

```
✅ YOU MAY modify:

├── Layout Containers
│   ├── Grid/flex wrappers around charts
│   ├── Responsive container widths
│   ├── Gap/padding between cards
│   └── Section ordering/arrangement
│
├── Card/Panel Styling
│   ├── Card borders, shadows, backgrounds
│   ├── Header/title styling
│   ├── Card padding (outer only)
│   └── Responsive card stacking
│
├── Page Layout
│   ├── Sidebar width/collapse behavior
│   ├── Header/nav responsiveness
│   ├── Page margins/padding
│   └── Scroll container behavior
│
└── Typography (Non-Chart)
    ├── Page titles, section headers
    ├── Filter labels (not values)
    └── Card titles
```

### Implementation Pattern: The Wrapper Approach

```tsx
// ✅ SAFE: Only the wrapper changes at breakpoints
<div className="chart-wrapper grid grid-cols-1 lg:grid-cols-2 gap-4">
  <div className="chart-card min-h-[300px] lg:min-h-[400px]">
    {/* Chart component remains UNTOUCHED */}
    <TransactionVolumeChart data={data} />
  </div>
</div>

// ❌ WRONG: Modifying chart internals for responsiveness
<TransactionVolumeChart
  data={data}
  height={isMobile ? 200 : 400}  // DON'T
  showLegend={!isMobile}         // DON'T
  tickCount={isMobile ? 3 : 6}   // DON'T
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

### Pre-Flight Check Before Any Edit

Before modifying any dashboard file, answer:

1. Does this file contain chart rendering code? → Extra caution
2. Does this file contain filter state/logic? → Extra caution
3. Will my CSS changes cascade beyond the target element? → Scope it
4. Am I changing anything inside a chart component's props? → STOP, ask user

---

## Part 2: Definition of "Breaking"

A change is BREAKING if it causes:

### 1. Visual Overflow
- Horizontal scroll appears inside chart containers
- Chart extends beyond its container bounds
- Legends/labels get cropped or hidden
- Content hidden without mobile alternative

### 2. Data Display Issues
- Axis labels become unreadable (too small, overlapping)
- Tooltips position off-screen or behind elements
- Data points become unclickable/untappable

### 3. Filter Dysfunction
- Filters no longer visible without awkward scrolling
- Filter dropdowns open off-screen
- Filter state stops affecting charts
- Can't access filters on mobile

### 4. Responsive Breakage
- Layout looks broken at any viewport width
- Touch targets too small on mobile (<44px)
- Essential info hidden on smaller screens without alternative
- Horizontal scroll on page

### 5. Cross-Platform Failure
- Works on desktop but breaks on tablet/mobile
- Works on iOS but breaks on Android (or vice versa)
- Hover-only interactions with no touch alternative

---

## Part 3: Multi-Platform Verification Checklist

### 3.1 Desktop (1440px+) — PRIMARY TARGET

#### Layout
- [ ] All charts visible in intended grid arrangement
- [ ] Sidebar fully expanded with text labels visible
- [ ] Filter bar displays in single/intended row arrangement
- [ ] KPI cards display in 4-column (or intended) layout
- [ ] No horizontal scrolling on page
- [ ] Adequate whitespace between sections

#### Charts
- [ ] All chart containers render at expected size
- [ ] X-axis labels fully readable (no truncation/overlap)
- [ ] Y-axis labels fully readable
- [ ] Legends visible and complete
- [ ] Tooltips appear on hover
- [ ] Interactive elements (click, hover) function correctly

#### Data Tables
- [ ] All columns visible
- [ ] Headers aligned with content
- [ ] Row hover states work
- [ ] **ALL columns sortable** (clickable headers with SortIcon)
- [ ] Sorting/pagination functions

---

### 3.2 Small Desktop / Large Tablet (1024px - 1439px)

#### Layout
- [ ] Grid adjusts appropriately (4-col → 3-col if needed)
- [ ] Sidebar may be narrower but still functional
- [ ] Filter bar wraps gracefully if needed
- [ ] No content hidden without alternative

#### Charts
- [ ] Charts resize proportionally
- [ ] No chart overflow beyond containers
- [ ] Labels still readable
- [ ] Tooltips position correctly (not off-screen)

---

### 3.3 Tablet / iPad (768px - 1023px)

#### Layout
- [ ] Grid stacks to 2 columns (or 1 where appropriate)
- [ ] Sidebar collapsed OR replaced with drawer
- [ ] Filters accessible via drawer/panel
- [ ] KPIs display in 2x2 grid or 2-column layout
- [ ] Primary navigation accessible

#### Charts
- [ ] Charts maintain minimum readable size
- [ ] No horizontal overflow in chart containers
- [ ] Touch interactions work (tap instead of hover)
- [ ] Legends may simplify but remain useful

#### Data Tables
- [ ] Horizontal scroll enabled if needed OR card view
- [ ] Critical columns visible without scroll

#### Touch (iPad-specific)
- [ ] Touch targets ≥ 44pt
- [ ] No hover-only interactions
- [ ] Gestures don't conflict with system gestures

---

### 3.4 Mobile / iPhone / Android (320px - 767px)

#### Layout
- [ ] Single column layout
- [ ] Hamburger menu for navigation
- [ ] Filters in drawer or bottom sheet
- [ ] KPIs in 2-column grid (2 per row)
- [ ] Clear visual hierarchy maintained
- [ ] No content "hidden forever" (always accessible)

#### Charts
- [ ] Charts readable (may be simplified)
- [ ] Touch targets ≥ 44px
- [ ] Swipe gestures don't conflict with page scroll
- [ ] Alternative views for complex charts if needed

#### Data Tables
- [ ] Card view OR horizontal scroll
- [ ] Row actions accessible
- [ ] Key data visible without interaction

#### Touch & Interaction
- [ ] All buttons/links minimum 44px touch target
- [ ] Form inputs have adequate size
- [ ] Dropdowns open without being cut off
- [ ] Modal/drawer close buttons easily tappable
- [ ] Active states provide touch feedback

#### Platform-Specific
- [ ] iOS: Safe areas handled (notch, home indicator)
- [ ] iOS: Overscroll behavior contained
- [ ] Android: Touch targets ≥ 48dp recommended
- [ ] Both: Virtual keyboard doesn't break layout

---

### 3.5 Edge Cases

Test at these specific widths:

| Width | Device | Priority |
|-------|--------|----------|
| 320px | iPhone SE (old) | Medium |
| 375px | iPhone SE/14/15 | **HIGH** |
| 390px | iPhone 14 Pro | HIGH |
| 428px | iPhone Pro Max | Medium |
| 768px | iPad portrait | **HIGH** |
| 1024px | iPad landscape | **HIGH** |
| 1280px | MacBook 13" | HIGH |
| 1440px | MacBook 15" | **HIGH** |
| 1920px | Desktop HD | HIGH |

---

## Part 4: Cross-Cutting Verification

### Performance
- [ ] No layout shifts after initial render
- [ ] No jank during resize
- [ ] Charts don't re-fetch data on resize
- [ ] Smooth transitions when collapsing/expanding

### Accessibility
- [ ] Focus indicators visible at all sizes
- [ ] Skip links functional
- [ ] Screen reader announces filter changes
- [ ] Reduced motion respected if set
- [ ] Color contrast passes WCAG AA

### Browser Support
- [ ] Chrome (latest)
- [ ] Safari (latest, including iOS Safari)
- [ ] Firefox (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome for Android

### State Preservation
- [ ] Filters persist across viewport changes
- [ ] Scroll position maintained on resize
- [ ] Modal/drawer state doesn't break on resize
- [ ] URL reflects current filter state

---

## Part 5: Required Output Format

For EVERY change to dashboard code, provide:

```markdown
### Files Changed

| File | Change Type | Rationale |
|------|-------------|-----------|
| `path/to/file.tsx` | wrapper-only | Added responsive grid classes |
| `path/to/file.css` | scoped styles | Scoped to `.dashboard-layout` only |

### Chart Internals Status
- [ ] CONFIRMED: No chart config modified
- [ ] CONFIRMED: No filter logic modified
- [ ] CONFIRMED: No data layer touched

### Platform Verification
- [ ] Desktop (1440px): VERIFIED
- [ ] Tablet (768px): VERIFIED
- [ ] Mobile (375px): VERIFIED
- [ ] No horizontal overflow at any viewport
- [ ] Touch targets ≥ 44px on mobile

### Additional Checks
- [ ] No new console errors
- [ ] Reduced motion respected
- [ ] Focus states work
```

---

## Part 6: Emergency Recovery

If a breaking change is introduced:

1. **Identify** the specific breaking commit/change
2. **Revert** to last working state
3. **Apply** changes incrementally with viewport testing after each
4. **Never** batch multiple chart-adjacent changes together

### Quick Browser Check

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M)
3. Test at: 375px → 768px → 1024px → 1440px
4. Check for horizontal scroll at each size
5. Verify touch targets with "Touch simulation" enabled

---

## Part 7: Automated Testing (Optional)

### Playwright Viewport Test

```typescript
const viewports = [
  { width: 375, height: 667, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1440, height: 900, name: 'desktop' },
];

for (const vp of viewports) {
  test(`Dashboard renders at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/dashboard');

    // No horizontal scroll
    const hasHScroll = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHScroll).toBe(false);

    // Charts visible
    await expect(page.locator('.chart-card').first()).toBeVisible();

    // Touch targets (mobile)
    if (vp.width < 768) {
      const buttons = await page.locator('button').all();
      for (const btn of buttons) {
        const box = await btn.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
}
```

---

## Part 8: Sign-Off Template

Before marking work as complete:

```markdown
## Dashboard Change Sign-Off

### Change Summary
[Brief description of what was changed]

### UI Freeze Compliance
- [x] No chart internals modified
- [x] No filter logic modified
- [x] No data layer touched
- [x] Only wrapper/layout changes made

### Platform Verification
- [x] Desktop (1440px): Working
- [x] Tablet (768px): Working
- [x] Mobile (375px): Working

### Regression Check
- [x] No new horizontal overflow
- [x] All existing charts render
- [x] All filters functional
- [x] Navigation works

Verified by: [name]
Date: [date]
```

---

## Quick Reference: What Can I Change?

| Element | Safe to Change? | Notes |
|---------|-----------------|-------|
| Grid column count | ✅ Yes | Responsive breakpoints |
| Card padding | ✅ Yes | Outer padding only |
| Container width | ✅ Yes | Use max-width, not fixed |
| Chart height | ⚠️ Careful | Use minHeight on wrapper |
| Chart axis config | ❌ No | Chart internal |
| Filter state logic | ❌ No | Core functionality |
| Tooltip content | ❌ No | Chart internal |
| Data transformations | ❌ No | Data layer |
| Click handlers | ❌ No | Core functionality |
| Touch targets | ✅ Yes | Wrapper/button sizing |
| Animations | ✅ Yes | Wrapper level only |
| Table sorting | ✅ Required | ALL tables MUST have sortable columns |

---

## Part 9: PowerBIFilterContext Scope Isolation

### Critical Architectural Rule

**PowerBIFilterContext (sidebar filters) ONLY affects the Market Pulse page (MacroOverview.jsx).**

All other pages (District Deep Dive, Project Deep Dive, Insights, etc.) must NOT use `usePowerBIFilters()` in their charts.

### Page Filter Ownership

| Page | Filter System | Components That May Use PowerBIFilterContext |
|------|---------------|---------------------------------------------|
| **Market Pulse** | PowerBIFilterContext (sidebar) | TimeTrendChart, MedianPsfTrendChart, PriceDistributionChart, NewVsResaleChart, PriceCompressionChart |
| **District Deep Dive** | Local state (DistrictPriceContent) | NONE - uses props |
| **Project Deep Dive** | Component props | NONE - uses props |
| **Floor Dispersion** | Component props | NONE - uses props |
| **Insights** | Component-local state | NONE - uses local state |

### Charts That Are ISOLATED from PowerBIFilterContext

These charts receive filters as props from their parent page:

```
District Deep Dive:
├── MarketStrategyMap (local filters: period, bed, saleType)
├── MarketMomentumGrid (props: period, bedroom, saleType)
└── GrowthDumbbellChart (props: period, bedroom, saleType)

Project Deep Dive:
└── FloorLiquidityHeatmap (props: bedroom, segment, district)
```

### How to Check Compliance

Before adding `usePowerBIFilters()` to any component:

1. **Check the page** - Is this component used on Market Pulse?
2. **If YES** → May use PowerBIFilterContext
3. **If NO** → Must receive filters as props from parent

### Implementation Pattern for Non-Market Pulse Charts

```jsx
// ✅ CORRECT: Receives filters as props (no PowerBIFilterContext)
export function MyChart({ period = '12m', bedroom = 'all', saleType = 'all' }) {
  const filterKey = useMemo(() => `${period}:${bedroom}:${saleType}`, [period, bedroom, saleType]);

  const { data } = useAbortableQuery(
    async (signal) => {
      const params = { group_by: 'quarter' };
      if (period !== 'all') params.date_from = periodToDateFrom(period);
      if (bedroom !== 'all') params.bedrooms = bedroom;
      if (saleType !== 'all') params.sale_type = saleType;

      return await getAggregate(params, { signal });
    },
    [filterKey]
  );
}

// ❌ WRONG: Using PowerBIFilterContext outside Market Pulse
export function MyChart() {
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters(); // DON'T
}
