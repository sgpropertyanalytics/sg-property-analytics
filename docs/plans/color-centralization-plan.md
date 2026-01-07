# Color Centralization Plan: Edit Once, Change All

**Status:** Ready to Execute
**Created:** 2026-01-07
**Goal:** 100% centralized colors — change `colors.js` or Tailwind tokens, entire app updates

---

## Current State

| Metric | Count | Status |
|--------|-------|--------|
| Hardcoded hex in components | 135 | ❌ Must fix |
| Files using Tailwind tokens | 162 usages | ✅ Good |
| Files importing colors.js | 11 | ⚠️ Should be more |
| Inline style colors | 35 | ❌ Must fix |

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SINGLE SOURCES OF TRUTH                  │
├─────────────────────────────────────────────────────────────┤
│  colors.js          │  index.css @theme    │  Tailwind      │
│  (JS exports)       │  (CSS variables)     │  (classes)     │
│                     │                      │                │
│  INK.primary        │  --color-ink-primary │  text-slate-900│
│  REGION.CCR         │  --color-region-ccr  │  bg-region-ccr │
│  SIGNAL.accent      │  --color-signal      │  text-orange-500│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     ALL COMPONENTS                          │
│                                                             │
│  ✅ Tailwind classes: className="text-slate-900"           │
│  ✅ CSS variables: style={{ color: 'var(--color-ink)' }}   │
│  ✅ JS imports: import { INK } from 'constants/colors'     │
│                                                             │
│  ❌ NO hardcoded hex: "#0F172A"                            │
│  ❌ NO inline hex: style={{ color: '#0F172A' }}            │
└─────────────────────────────────────────────────────────────┘
```

---

## Execution Phases

### Phase 1: High-Impact Files (21 files, ~100 refs)

Priority files by hardcoded color count:

| File | Refs | Strategy |
|------|------|----------|
| `ChartSkeleton.jsx` | 21 | SVG gradients → CSS variables |
| `BudgetActivityHeatmap.jsx` | 12 | Chart.js colors → import from colors.js |
| `PriceCompressionChart.jsx` | 8 | Chart.js colors → import from colors.js |
| `NewVsResaleChart.jsx` | 8 | Chart.js colors → import from colors.js |
| `MarketValueOscillator.jsx` | 8 | Chart.js colors → import from colors.js |
| `TimeTrendChart.jsx` | 7 | Chart.js colors → import from colors.js |
| `DistrictLiquidityMap/components.jsx` | 7 | Props → Tailwind classes |
| `NewLaunchTimelineChart.jsx` | 6 | Chart.js colors → import from colors.js |
| `HotProjectsTable.jsx` | 6 | Heat scale → import LIQUIDITY from colors.js |
| `PriceDistributionHeroChart.jsx` | 5 | Chart.js → import from colors.js |
| `DealCheckerMap.jsx` | 5 | Mapbox colors → CSS variables |

**Pattern for Chart.js files:**
```javascript
// BEFORE
borderColor: '#0F172A',
backgroundColor: '#334155',

// AFTER
import { INK, REGION } from '../../constants/colors';
// ...
borderColor: INK.primary,
backgroundColor: REGION.RCR,
```

**Pattern for SVG/inline styles:**
```jsx
// BEFORE
<stop stopColor="#0F172A" />
style={{ backgroundColor: '#334155' }}

// AFTER
<stop stopColor="var(--color-ink-primary)" />
style={{ backgroundColor: 'var(--color-region-rcr)' }}
// OR use Tailwind
className="bg-slate-700"
```

---

### Phase 2: Medium-Impact Files (10 files, ~35 refs)

| File | Refs | Strategy |
|------|------|----------|
| `GlobalNavRail.jsx` | 4 | Tailwind classes |
| `DistrictLiquidityMap/constants.js` | 4 | Import from colors.js |
| `AccountSettingsModal.jsx` | 4 | Tailwind classes |
| `SupplyWaterfallChart.jsx` | 3 | Import SUPPLY from colors.js |
| `DistrictMicroChart.jsx` | 3 | Import from colors.js |
| `DistrictComparisonChart.jsx` | 3 | Import from colors.js |
| `MarketStrategyMap.jsx` | 3 | Mapbox → CSS variables |
| `UpdateIndicator.jsx` | 3 | Tailwind classes |
| `FrostProgressBar.jsx` | 3 | CSS variables |
| `FrostSpinner.jsx` | 2 | CSS variables |

---

### Phase 3: Remaining Stragglers

Grep for any remaining hardcoded hex and fix individually.

```bash
# Find remaining
grep -rn "#[0-9A-Fa-f]\{6\}" frontend/src/components --include="*.jsx" --include="*.js"
```

---

### Phase 4: ESLint Enforcement (Prevent Regression)

Add ESLint rule to block new hardcoded colors:

**File:** `frontend/eslint.config.js`

```javascript
// Add to rules
'no-restricted-syntax': [
  'error',
  {
    selector: 'Literal[value=/^#[0-9A-Fa-f]{6}$/]',
    message: 'Hardcoded hex colors are forbidden. Import from constants/colors.js or use Tailwind classes.',
  },
],
```

**Whitelist only:**
- `frontend/src/constants/colors.js` (definitions)
- `frontend/src/index.css` (CSS variable definitions)

---

## Migration Cheatsheet

### Hex → Tailwind Class

| Old Hex | New Tailwind |
|---------|--------------|
| `#0F172A` | `text-slate-900`, `bg-slate-900` |
| `#1E293B` | `text-slate-800`, `bg-slate-800` |
| `#334155` | `text-slate-700`, `bg-slate-700` |
| `#475569` | `text-slate-600`, `bg-slate-600` |
| `#64748B` | `text-slate-500`, `bg-slate-500` |
| `#94A3B8` | `text-slate-400`, `bg-slate-400` |
| `#CBD5E1` | `text-slate-300`, `bg-slate-300` |
| `#E5E7EB` | `text-slate-200`, `bg-slate-200` |
| `#F97316` | `text-orange-500`, `bg-orange-500` |
| `#059669` | `text-emerald-600`, `bg-emerald-600` |
| `#DC2626` | `text-red-600`, `bg-red-600` |

### Hex → colors.js Import

| Old Hex | Import |
|---------|--------|
| `#0F172A` | `INK.primary` or `REGION.CCR` |
| `#334155` | `REGION.RCR` |
| `#64748B` | `REGION.OCR` |
| `#94A3B8` | `INK.muted` or `SUPPLY.total` |
| `#F97316` | `SIGNAL.accent` |
| `#059669` | `DELTA.positive` |
| `#DC2626` | `DELTA.negative` |

### Hex → CSS Variable (for inline styles)

| Old Hex | CSS Variable |
|---------|--------------|
| `#0F172A` | `var(--color-ink-primary)` |
| `#334155` | `var(--color-region-rcr)` |
| `#64748B` | `var(--color-region-ocr)` |
| `#F97316` | `var(--color-signal-accent)` |

---

## Verification

After each phase:

```bash
# Count remaining hardcoded (should decrease)
grep -rn "#[0-9A-Fa-f]\{6\}" frontend/src/components --include="*.jsx" --include="*.js" | wc -l

# Lint check
cd frontend && npm run lint

# Visual regression (manual)
# Check: Landing, Dashboard, Charts, Maps
```

---

## Success Criteria

- [ ] Zero hardcoded hex in components (except comments)
- [ ] All Chart.js colors imported from colors.js
- [ ] All Mapbox colors use CSS variables
- [ ] ESLint rule active and blocking new hardcoded colors
- [ ] Changing `INK.primary` in colors.js updates entire app

---

## Time Estimate

| Phase | Files | Effort |
|-------|-------|--------|
| Phase 1: High-impact | 11 files | ~1.5 hours |
| Phase 2: Medium-impact | 10 files | ~45 min |
| Phase 3: Stragglers | ~10 files | ~30 min |
| Phase 4: ESLint | 1 file | ~15 min |
| **Total** | **~32 files** | **~3 hours** |
