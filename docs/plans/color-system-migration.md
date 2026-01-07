# Color System Migration: "Institutional Print" Design

**Status:** Planning
**Created:** 2026-01-07
**Scope:** ~1,385 hardcoded color references across 57+ files

---

## 1. Design Philosophy

**"Financial Print / Blueprint Strategy"**

Charts look like high-end architectural blueprints or printed financial reports. The aesthetic signals "Hedge Fund" not "Retail Bank."

- **The Suit:** Slate + Void + Cool Gray foundation
- **The Tie:** Bloomberg Orange accent
- **The Print:** Deep slate ink on light canvas

---

## 2. New Color Schema

### 2.1 VOID (Dark Frame)
| Token | Hex | Usage |
|-------|-----|-------|
| `void` | #0A0A0A | Nav background, premium dark |
| `surface` | #1A1A1A | Elevated cards on void |
| `edge` | #333333 | Borders on dark surfaces |

### 2.2 CANVAS (Light Content)
| Token | Hex | Usage |
|-------|-----|-------|
| `canvas` | #FAFAFA | Main content background |
| `paper` | #FFFFFF | Cards, modals |
| `grid` | #E5E7EB | Chart grids, subtle borders |

### 2.3 INK (Data/Text)
| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `ink` | #0F172A | slate-900 | Primary data, headers |
| `dense` | #1E293B | slate-800 | Secondary emphasis |
| `mid` | #475569 | slate-600 | Body text |
| `muted` | #94A3B8 | slate-400 | Ghost data, historical |

### 2.4 REGION (Monochrome Hierarchy)
| Region | Hex | Tailwind | Semantic |
|--------|-----|----------|----------|
| CCR | #0F172A | slate-900 | Premium/Core (darkest) |
| RCR | #334155 | slate-700 | Mid-tier |
| OCR | #64748B | slate-500 | Suburban (lightest) |

### 2.5 SIGNAL (Accent)
| Token | Hex | Usage |
|-------|-----|-------|
| `accent` | #F97316 | Buttons, large graphics (orange-500) |
| `accentA11y` | #EA580C | Text/borders on light (orange-600) |

### 2.6 DELTA (Financial +/-)
| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `positive` | #059669 | emerald-600 | Gains, positive delta |
| `negative` | #DC2626 | red-600 | Losses, negative delta |

### 2.7 SUPPLY (Full Slate)
| Token | Hex | Tailwind | Usage |
|-------|-----|----------|-------|
| `unsold` | #0F172A | slate-900 | Heaviest (most urgent) |
| `upcoming` | #334155 | slate-700 | Pipeline |
| `gls` | #64748B | slate-500 | GLS sites |
| `total` | #94A3B8 | slate-400 | Totals (lightest) |

---

## 3. Migration Map

### 3.1 Colors to Kill (Legacy)
| Old Color | Old Hex | References | Replacement |
|-----------|---------|------------|-------------|
| sand | #EAE0CF | 199 | `grid` #E5E7EB |
| navy | #213448 | 377 | `ink` #0F172A |
| blue | #547792 | 477 | `RCR` #334155 |
| sky | #94B4C1 | 312 | `OCR` #64748B |
| supply.unsold | #6b4226 | ~5 | `unsold` #0F172A |
| supply.upcoming | #9c6644 | ~5 | `upcoming` #334155 |
| supply.gls | #c4a77d | ~5 | `gls` #64748B |
| supply.total | #e8dcc8 | ~5 | `total` #94A3B8 |

### 3.2 Context-Sensitive Replacements

**Sand (#EAE0CF) splits into:**
- `bg-[#EAE0CF]` backgrounds → `bg-slate-200` or `bg-[#E5E7EB]`
- `text-[#EAE0CF]` on dark → `text-slate-100` or `text-[#F1F5F9]`

**Navy (#213448) splits into:**
- Region CCR badge → `#0F172A`
- Dark backgrounds → `void` #0A0A0A or `surface` #1A1A1A
- Chart primary → `ink` #0F172A

**Blue (#547792) splits into:**
- Region RCR badge → `#334155`
- Interactive elements → Consider `accent` #F97316

**Sky (#94B4C1) splits into:**
- Region OCR badge → `#64748B`
- Ghost/muted data → `muted` #94A3B8

---

## 4. Execution Phases

### Phase 1: Source of Truth (colors.js)
**Files:** 1
**Risk:** Low

1. Rewrite `frontend/src/constants/colors.js` with new schema
2. Add deprecation warnings for old tokens
3. Export both old and new during transition

```javascript
// DEPRECATED - Remove in Phase 4
/** @deprecated Use INK.primary instead */
export const BRAND = { ... };

// NEW SYSTEM
export const INK = { ... };
export const REGION = { ... };
```

### Phase 2: Tailwind Config
**Files:** 2 (tailwind.config.js, index.css)
**Risk:** Low

1. Add new color tokens to `@theme` in index.css
2. Ensure Tailwind classes like `bg-ink`, `text-region-ccr` work

### Phase 3: High-Impact Files First
**Files:** ~10 most-referenced
**Risk:** Medium

Priority order by reference count:
1. `DistrictLiquidityMap/components.jsx` (~40 refs)
2. `MarketStrategyMap.jsx` (~25 refs)
3. `Landing.jsx` (~20 refs)
4. `Login.jsx` (~15 refs)
5. Chart components (TimeTrendChart, PriceDistributionChart, etc.)

### Phase 4: Mass Migration
**Files:** Remaining 45+
**Risk:** Medium-High

Use search-and-replace with review:
```bash
# Example: Replace sand backgrounds
grep -rl "bg-\[#EAE0CF\]" frontend/src | xargs sed -i '' 's/bg-\[#EAE0CF\]/bg-slate-200/g'
```

### Phase 5: Cleanup
**Files:** colors.js, any stragglers
**Risk:** Low

1. Remove deprecated BRAND export
2. Remove old color definitions
3. Final grep audit for any remaining old hex codes

---

## 5. Verification Checklist

### Visual Regression (Per Phase)
- [ ] Landing page renders correctly
- [ ] Login page contrast passes WCAG AA
- [ ] All dashboard pages load without color errors
- [ ] Charts maintain data readability
- [ ] Region badges distinguishable
- [ ] Supply charts readable

### Accessibility
- [ ] Text on light backgrounds: 4.5:1 contrast ratio
- [ ] Text on dark backgrounds: 4.5:1 contrast ratio
- [ ] Orange accent (#EA580C) on white: 3.1:1 (passes AA for large text)
- [ ] Region colors distinguishable without relying on hue alone

### Code Quality
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] No hardcoded hex values outside colors.js
- [ ] All color usages via tokens

---

## 6. Rollback Plan

If visual regressions are severe:
1. `git revert` the phase commit
2. Re-enable old color exports in colors.js
3. Document which specific files/components failed

---

## 7. Success Criteria

- [ ] Zero references to #EAE0CF (sand)
- [ ] Zero references to #213448 (old navy) outside CCR region mapping
- [ ] Zero references to #547792 (old blue) outside RCR region mapping
- [ ] Zero references to #94B4C1 (old sky) outside OCR region mapping
- [ ] All colors flow from single source (colors.js)
- [ ] "Institutional Print" aesthetic achieved

---

## 8. Open Questions

1. **Chart Libraries:** Do Recharts/D3 components accept Tailwind classes or need hex values?
2. **Third-party Components:** Any UI libraries with hardcoded colors?
3. **Dark Mode Charts:** Should charts on void background use inverted palette?

---

## Appendix: File Impact List

<details>
<summary>Files with >5 color references (click to expand)</summary>

```
DistrictLiquidityMap/components.jsx    ~40 refs
MarketStrategyMap.jsx                  ~25 refs
Landing.jsx                            ~20 refs
Login.jsx                              ~15 refs
TimeTrendChart.jsx                     ~12 refs
PriceDistributionChart.jsx             ~10 refs
colors.js                              ~10 refs (definitions)
...
```

</details>
