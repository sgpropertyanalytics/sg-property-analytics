---
date: 2026-01-06T23:14:02+08:00
branch: palantir
commit: ceb9da73
status: in_progress
---

# Handoff: White Ops / Munitions-Grade Design System Refactor

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Phase 1: Create colors.js | ✅ Complete | Centralized MONO, STATUS, BRAND, SUPPLY palettes |
| Phase 2-3: CSS theme + weapon classes | ✅ Complete | Added to index.css @theme block |
| Phase 4: Dashboard grid background | ✅ Complete | Added `weapon-grid-bg` to DashboardLayout |
| Phase 5: Sidebar transformation | ✅ Complete | GlobalNavRail: hard edges, instant transitions |
| Phase 6: Chart cards HUD styling | ⏳ Planned | Apply `.hud-corner`, `.terminal-header` |
| Phase 7: Filter components | ⏳ Planned | Remove rounded corners |
| Phase 8: Chart color consolidation | ⏳ Planned | Import from colors.js, remove duplicates |
| Phase 9: Map/tooltip components | ⏳ Planned | Hard edges, weapon-shadow |
| Phase 10: JetBrains Mono | ⏳ Planned | `npm install @fontsource/jetbrains-mono` |
| Phase 11: ESLint enforcement | ⏳ Planned | Tighten no-raw-hex-color rule |

## Critical References

These documents MUST be read before continuing:
- `REPO_MAP.md` - Navigation guide + historical incidents
- `CLAUDE.md` - Core invariants, especially Rule #3 (Single Source of Truth)
- `/Users/changyuesin/.claude/plans/cheerful-rolling-valley.md` - Full implementation plan
- `docs/plans/landingv3-ui-refinement-plan.md` - Design direction reference

## User Decisions Made

| Decision | Choice |
|----------|--------|
| Typography | JetBrains Mono for headers/labels only. Inter for body text. |
| Scope | **Exclude LandingV3.jsx** - it has its own aesthetic direction |
| ESLint | **Strict enforcement immediately** after migration |

## Recent Changes

```
frontend/src/constants/colors.js (NEW) - Centralized color system with MONO, STATUS, BRAND, SUPPLY, CHART palettes
frontend/src/constants/index.js:77-88 - Re-exports from colors.js
frontend/src/index.css:18-50 - Added CSS variables for all color tokens
frontend/src/index.css:65-156 - Added weapon utility classes (.hud-corner, .terminal-header, .weapon-card, etc.)
frontend/src/components/layout/DashboardLayout.jsx:251 - Added weapon-grid-bg class
frontend/src/components/layout/GlobalNavRail.jsx:46 - Changed TRANSITION_CLASS to "transition-none"
frontend/src/components/layout/GlobalNavRail.jsx:91-98 - NavItem: rounded-none, font-mono, border-b
frontend/src/components/layout/GlobalNavRail.jsx:119-121 - Active indicator: full-height, no rounded
frontend/src/components/layout/GlobalNavRail.jsx:158-172 - Tooltips: rounded-none, weapon-shadow
```

## Learnings

1. **Tailwind v4 uses CSS-first configuration**
   - What: Tailwind 4.x uses `@theme` blocks in CSS instead of tailwind.config.js
   - Why it matters: Colors must be added to index.css, not tailwind.config.js
   - File reference: `frontend/src/index.css:9-50`

2. **Existing creative assets in index.css**
   - What: Codebase already has `@keyframes glitch`, `scanSweep`, `pulseRing`, frost overlays
   - Why it matters: Plan was updated to AMPLIFY existing assets, not remove them
   - File reference: `frontend/src/index.css:393-783` (existing animations)

3. **LandingV3.jsx has its own aesthetic**
   - What: User explicitly excluded LandingV3 from transformation
   - Why it matters: Don't apply weapon classes to LandingV3.jsx
   - File reference: User decision during planning

## Artifacts

**Created:**
- `frontend/src/constants/colors.js` - Centralized color system with all palettes

**Modified:**
- `frontend/src/constants/index.js` - Re-exports color system
- `frontend/src/index.css` - CSS variables + weapon utility classes
- `frontend/src/components/layout/DashboardLayout.jsx` - Grid background
- `frontend/src/components/layout/GlobalNavRail.jsx` - Weapon aesthetic transformation

## Action Items & Next Steps

Priority order for the next agent:

1. **Phase 6: Chart Cards HUD Styling**
   - [ ] Find/create ChartCard component or create WeaponCard.jsx
   - [ ] Apply `.hud-corner` to major chart containers
   - [ ] Apply `.terminal-header` to chart titles
   - [ ] Add `.cursor-crosshair` to chart interactive areas
   - Blocked by: Nothing

2. **Phase 7: Filter Components**
   - [ ] `PowerBIFilterSidebar.jsx` - rounded-xl → rounded-none
   - [ ] `TimeGranularityToggle.jsx` - rounded-xl → rounded-none
   - [ ] `FilterBar.jsx` - rounded-md → rounded-none, remove scale effects
   - Depends on: Nothing (can run in parallel with Phase 6)

3. **Phase 8: Chart Color Consolidation**
   - [ ] `PriceBandChart.jsx` - Import BRAND from colors.js
   - [ ] `DistrictComparisonChart.jsx` - Import BRAND
   - [ ] `PriceGrowthChart.jsx` - Import BRAND
   - [ ] `SupplyBreakdownTable.jsx` - Import SUPPLY
   - [ ] `waterfallAdapter.js` - Import SUPPLY
   - [ ] `DistrictLiquidityMap/constants.js` - Import BRAND
   - Depends on: Phase 1 (already complete)

4. **Phase 9: Map/Tooltip Components**
   - [ ] Search/replace rounded-lg → rounded-none in map components
   - [ ] Search/replace shadow-xl → weapon-shadow
   - [ ] Add cursor-crosshair to interactive areas
   - Depends on: Nothing

5. **Phase 10: Typography**
   - [ ] Run `npm install @fontsource/jetbrains-mono`
   - [ ] Add imports to index.css
   - [ ] Update --font-display variable
   - Blocked by: Nothing

6. **Phase 11: ESLint Enforcement**
   - [ ] Edit `eslint-plugin-design/rules/no-raw-hex-color.js`
   - [ ] Remove whitelisted directories (powerbi/, insights/, common/, adapters/)
   - [ ] Keep only constants files whitelisted
   - Depends on: Phases 6-9 (migrate components first)

## Blockers & Open Questions

- **None currently** - All decisions made, ready to continue implementation

## Context for Resume

Key things the next agent should know:

1. **The plan file is comprehensive** - Read `/Users/changyuesin/.claude/plans/cheerful-rolling-valley.md` for full details
2. **"Weapon aesthetic" means**: hard edges (rounded-none), instant transitions (duration-0), structural borders, monospace headers, HUD corners
3. **Existing creative assets exist** - Don't remove glitch/scan/pulse animations, they should be applied more broadly
4. **LandingV3.jsx is EXCLUDED** - It has its own design direction, don't modify it for this task
5. **Tailwind v4** - Config is in CSS @theme block, not JS

## New Utility Classes Available

```css
.hud-corner         /* 8px military corner brackets on top-left and bottom-right */
.terminal-header    /* 10px mono uppercase tracking-wider labels */
.weapon-card        /* Hard-edge card: white bg, 1px border, no radius */
.weapon-grid-bg     /* 80px crosshatch background pattern */
.weapon-noise       /* Fractal noise overlay (use with position:relative parent) */
.weapon-shadow      /* Hard offset shadow: 2px 2px 0px rgba(0,0,0,0.15) */
.weapon-shadow-md   /* Larger offset: 4px 4px 0px rgba(0,0,0,0.1) */
.weapon-active      /* Inverted state: dark bg, white text */
.weapon-border      /* Structural border: 1px solid var(--color-mono-muted) */
.weapon-border-hard /* Hard border: 1px solid var(--color-mono-dark) */
```

## CSS Variables Available

> **Note:** Palette evolved to "Institutional Print / Slate" system. See `frontend/src/constants/colors.js` for current source of truth.

```css
/* INK (Data/Text - "The Print") */
--color-ink-primary: #0F172A;   /* slate-900 - Headers, primary data */
--color-ink-dense: #1E293B;     /* slate-800 - Secondary emphasis */
--color-ink-mid: #475569;       /* slate-600 - Body text */
--color-ink-muted: #94A3B8;     /* slate-400 - Placeholders */
--color-ink-light: #CBD5E1;     /* slate-300 - Subtle borders */

/* VOID (Dark Frame) */
--color-void-base: #0A0A0A;     /* Nav background */
--color-void-surface: #1A1A1A;  /* Elevated cards */
--color-void-edge: #333333;     /* Metal borders */

/* CANVAS (Light Content) */
--color-canvas-base: #FAFAFA;   /* Main background */
--color-canvas-paper: #FFFFFF;  /* Cards, modals */
--color-canvas-grid: #E5E7EB;   /* Chart grids, borders */

/* SIGNAL (Accent - "The Tie") */
--color-signal-accent: #F97316;     /* orange-500 - CTAs */
--color-signal-accent-a11y: #EA580C; /* orange-600 - Accessible text */
--color-signal-focus: #2563EB;      /* blue-600 - Focus rings */

/* DELTA (Financial +/-) */
--color-delta-positive: #059669;  /* emerald-600 */
--color-delta-negative: #DC2626;  /* red-600 */

/* REGION (Monochrome Hierarchy: Dark→Light for CCR→OCR) */
--color-region-ccr: #0F172A;    /* slate-900 - Premium */
--color-region-rcr: #334155;    /* slate-700 - Mid-tier */
--color-region-ocr: #64748B;    /* slate-500 - Suburban */

/* SUPPLY (Full Slate - Inventory) */
--color-supply-unsold: #0F172A;   /* slate-900 */
--color-supply-upcoming: #334155; /* slate-700 */
--color-supply-gls: #64748B;      /* slate-500 */
--color-supply-total: #94A3B8;    /* slate-400 */
```

## Commands to Run

```bash
# Verify current state
cd /Users/changyuesin/Desktop/sgpropertytrend/frontend
git status
npm run lint

# Check the plan
cat /Users/changyuesin/.claude/plans/cheerful-rolling-valley.md

# Continue with Phase 6 (chart cards)
# Look for existing ChartCard component:
grep -r "ChartCard" src/components/

# Or search for common card patterns to apply hud-corner:
grep -rn "bg-white.*rounded-lg.*border" src/components/powerbi/
```
