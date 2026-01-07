---
date: 2026-01-07T09:30:00+08:00
branch: fix/landing-map-size
status: in_progress
---

# Handoff: Dashboard UI Makeover to Match Landing Page

## Overview

Transform authenticated dashboard pages from legacy navy/sand theme to match LandingV3's "Technical Brutalism / Analog Industrial" aesthetic for a cohesive product feel.

---

## Issues Found

### Issue 1: "False Disabled" Active State (HIGH SEVERITY)

**Problem:** The active menu item in GlobalNavRail looked DISABLED instead of ACTIVE.

- Original: Dark text (~#333) on dark grey background (~#444)
- Fails WCAG contrast standards
- User's eye skips over the most important element because low contrast signals "unimportant"

**Status:** ✅ FIXED
- Active state now uses `bg-mono-ink text-mono-canvas` (white on black)
- Added `ring-1 ring-white/15` for subtle depth
- Added blue accent bar on left side (`bg-brand-blue`)
- Added "ACTIVE" badge for extra visibility

### Issue 2: Content Area Had Sand/Beige Background

**Problem:** Main content area still had `bg-[#EAE0CF]/40` (sand tint) which didn't match the new light aesthetic.

**Status:** ✅ FIXED
- Changed to `bg-mono-canvas` (#FAFAFA)

### Issue 3: Pure White Too Bright

**Problem:** Pure white (#FFFFFF) was harsh on eyes and didn't blend well.

**Status:** ✅ FIXED
- Updated `--color-mono-canvas` from `#FFFFFF` to `#FAFAFA` (soft off-white)
- All components using `bg-mono-canvas` automatically inherit this softer tone

### Issue 4: Components Didn't Blend Together

**Problem:** Different components had different color vibes - disjointed aesthetic.

**Status:** 🔄 PARTIALLY FIXED
- Unified color tokens across layout, nav, filters, cards
- Chart containers still need work (see Pending TODOs)

---

## Completed Changes

### Phase 1: Initial Makeover (Commit d9034514)

| File | Changes |
|------|---------|
| `GlobalNavRail.jsx` | Background: `bg-[#213448]` → `bg-gray-50`, mono typography, hard edges |
| `DashboardLayout.jsx` | Background: `bg-[#EAE0CF]/30` → `bg-gray-50`, mobile header restyled |
| `FilterBar.jsx` | Terminal-styled trigger, mono badges |
| `PowerBIFilterSidebar.jsx` | Utility bar look, weapon-noise, rounded-none |
| `TimeGranularityToggle.jsx` | Hard edges, no transitions |
| `KPICardV2.tsx` | weapon-card, hud-corner, terminal-header, font-data |
| `DrillBreadcrumb.jsx` | Terminal styling |

### Phase 2: Color & Contrast Fixes (Uncommitted)

| File | Changes |
|------|---------|
| `colors.js` | `canvas: '#FFFFFF'` → `canvas: '#FAFAFA'` |
| `index.css` | `--color-mono-canvas: #FAFAFA`, body uses mono-canvas/mono-ink |
| `GlobalNavRail.jsx` | Fixed active state contrast, added ACTIVE badge, blue accent bar |
| `DashboardLayout.jsx` | Uses `bg-mono-canvas text-mono-ink` consistently |
| `MacroOverview.jsx` | Content area uses `bg-mono-canvas` |
| `App.jsx` | Minor cleanup |
| Multiple pages | Consistent bg-mono-canvas usage |

---

## Color System Strategy

### Design Philosophy

Match LandingV3's "ink on canvas" aesthetic:
- **Canvas:** `#FAFAFA` (soft off-white, not harsh pure white)
- **Ink:** `#000000` (pure black for text and emphasis)
- **Structural borders:** `border-mono-muted` (#E5E7EB)
- **Active states:** High contrast inverted (white on black)

### Token Hierarchy

```
Background layers:
  1. Shell/Layout: bg-mono-canvas (#FAFAFA)
  2. Cards/Containers: bg-card (#FFFCF5) - slightly warmer
  3. Active/Emphasis: bg-mono-ink (#000000)

Text hierarchy:
  1. Primary: text-mono-ink (#000000)
  2. Secondary: text-mono-mid (#525252)
  3. Tertiary: text-mono-light (#A3A3A3)

Borders:
  1. Structural: border-mono-muted (#E5E7EB)
  2. Emphasis: border-mono-ink (#000000)
```

### Active State Pattern

```jsx
// WRONG (low contrast, looks disabled)
const activeStyles = 'bg-gray-200 text-gray-700';

// CORRECT (high contrast, draws attention)
const activeStyles = 'bg-mono-ink text-mono-canvas ring-1 ring-white/15';
```

---

## Pending TODOs

### High Priority

- [ ] **Chart containers** - Apply weapon-card styling to all chart wrappers
- [ ] **TimeTrendChart, PriceCompressionChart, etc.** - Consistent card styling
- [ ] **TypeScript error in KPICardV2.tsx** - Fix unused `trend` and `children` variables

### Medium Priority

- [ ] **KeyInsightBox** - Align to terminal/weapon aesthetic
- [ ] **ErrorState, ChartFrame overlays** - Hard-edge terminal language
- [ ] **Tooltips across charts** - Consistent styling with weapon-shadow

### Low Priority

- [ ] **Remaining pages** - Apply same treatment to:
  - DistrictOverview
  - NewLaunchMarket
  - SupplyInventory
  - Explore
  - ValueCheck
  - ExitRisk

---

## Files Modified (Current Working Tree)

```
frontend/src/App.jsx                               |  2 +-
frontend/src/components/layout/DashboardLayout.jsx | 20 ++++----
frontend/src/components/layout/GlobalNavRail.jsx   | 56 +++++++++++-----------
frontend/src/components/powerbi/FilterBar.jsx      |  4 +-
frontend/src/components/ui/KPICardV2.tsx           |  2 +-
frontend/src/constants/colors.js                   |  2 +-
frontend/src/index.css                             | 10 ++--
frontend/src/pages/ExitRisk.jsx                    |  2 +-
frontend/src/pages/MacroOverview.jsx               |  6 +--
frontend/src/pages/PrimaryMarket.jsx               |  2 +-
frontend/src/pages/ProjectDeepDive.jsx             |  2 +-
```

---

## Verification Checklist

Before merging:

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] Active nav item has high contrast (visible, not muted)
- [ ] Background is soft off-white (#FAFAFA), not harsh white
- [ ] All components use consistent color tokens
- [ ] No jarring color transitions between landing and dashboard

---

## Reference

### LandingV3 Color Patterns

```jsx
// Canvas background
const CANVAS = '#fafafa';
const INK = '#000000';

// Section titles
<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">

// Cards
<div className="bg-white border border-black/10 rounded-none">

// Hover states
className="hover:bg-black/[0.02]"
```

### Weapon Utility Classes

```css
.weapon-card       { background: var(--color-card); border: 1px solid var(--color-mono-muted); border-radius: 0; }
.weapon-grid-bg    { background-image: crosshatch pattern 80px; }
.weapon-noise      { fractal noise overlay; }
.weapon-shadow     { box-shadow: 2px 2px 0px rgba(0,0,0,0.15); }
.hud-corner        { military corner brackets pseudo-elements; }
.terminal-header   { font-mono text-[10px] uppercase tracking-[0.18em]; }
```

---

## Commands to Resume

```bash
cd /Users/changyuesin/Desktop/sgpropertytrend/frontend

# Check current state
git status
git diff --stat

# Fix TypeScript errors
# Edit KPICardV2.tsx - prefix unused vars with underscore

# Run verification
npm run lint
npm run typecheck

# Continue with chart container styling
grep -rn "rounded-lg.*border" src/components/powerbi/ | head -20
```

---

## Context for Next Agent

1. **Color system is now unified** - Use `mono-*` tokens, not raw hex colors
2. **Active states need HIGH contrast** - Don't make them blend in
3. **Canvas is #FAFAFA** - Soft off-white, not pure white
4. **Charts still need work** - Card containers haven't been fully styled
5. **TypeScript has errors** - KPICardV2.tsx has unused variable warnings
