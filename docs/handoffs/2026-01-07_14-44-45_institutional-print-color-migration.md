---
date: 2026-01-07T14:44:45+08:00
branch: feature/institutional-print-colors
commit: 7799e559
status: in_progress
---

# Handoff: Institutional Print Color System Migration

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Phase 1: Rewrite colors.js | ✅ Complete | New schema with VOID, CANVAS, INK, REGION, SIGNAL, DELTA, SUPPLY |
| Phase 2: Tailwind @theme tokens | ✅ Complete | All CSS custom properties added to index.css |
| Phase 3: High-impact files | ✅ Complete | 6 files migrated, 2 deprecated files deleted |
| Phase 4: Mass migration | 🔄 In Progress | ~48 refs remaining across 24 files |
| Phase 5: Cleanup deprecated exports | ⏳ Planned | Remove BRAND, MONO from colors.js |

## Critical References

These documents MUST be read before continuing:
- `REPO_MAP.md` - Navigation guide + historical incidents
- `docs/plans/color-system-migration.md` - Full migration plan with color mappings
- `frontend/src/constants/colors.js` - Source of truth (new schema implemented)
- `frontend/src/index.css` - Tailwind @theme tokens (lines 14-97)

## PR

**PR #304**: https://github.com/dragonmaiden/sg-property-analyzer/pull/304

## Color Mapping Reference

| Old (Legacy) | Hex | New (Slate) | Hex |
|--------------|-----|-------------|-----|
| navy | #213448 | slate-900 / INK.primary | #0F172A |
| blue | #547792 | slate-700 / REGION.RCR | #334155 |
| sky | #94B4C1 | slate-500 / REGION.OCR | #64748B |
| sand | #EAE0CF | slate-200 / CANVAS.grid | #E5E7EB |

**Special mappings:**
- Text colors: #547792 → #475569 (slate-600 for better readability)
- Muted/ghost: #94B4C1 → #94A3B8 (slate-400)
- Light text on dark: #EAE0CF → #F1F5F9 (slate-100)

## Recent Changes (Uncommitted)

Files modified in Phase 4 (not yet committed):
- `frontend/src/adapters/aggregate/beadsChart.js` - BEDROOM_COLORS updated to slate
- `frontend/src/components/common/ChartSkeleton.jsx` - SVG gradient stopColors
- `frontend/src/components/powerbi/DealCheckerMap.jsx` - Mapbox fill/line colors
- `frontend/src/components/powerbi/MarketValueOscillator.jsx` - Chart border/hover colors
- `frontend/src/components/powerbi/NewLaunchTimelineChart.jsx` - Chart colors + spinner
- `frontend/src/components/powerbi/PriceCompressionChart.jsx` - Chart colors + SVG legend
- `frontend/src/pages/Login.jsx` - Decoration colors + docblock comments

## Learnings

1. **Landing.jsx was deprecated**
   - What: `Landing.jsx` was replaced by `LandingV3.jsx` - 72 legacy refs eliminated by deletion
   - `YouVsMarketVisual.jsx` was orphaned (only used by Landing.jsx) - also deleted
   - File reference: Deleted in commit 7799e559

2. **colors.js deprecated exports must remain**
   - What: BRAND (navy/blue/sky/sand) still exported for backward compat
   - Why it matters: Don't migrate these 4 refs in colors.js - intentional
   - File reference: `frontend/src/constants/colors.js:173-178`

3. **Chart.js patterns are consistent**
   - borderColor, pointHoverBackgroundColor, stroke patterns repeat across chart files
   - Same search-replace can be applied to remaining chart components

## Artifacts

Files created:
- `docs/plans/color-system-migration.md` - Full migration plan

Files significantly modified:
- `frontend/src/constants/colors.js` - Complete rewrite with new schema
- `frontend/src/index.css` - New @theme tokens (lines 14-97)

Files deleted:
- `frontend/src/pages/Landing.jsx` - Deprecated, replaced by LandingV3
- `frontend/src/components/landing/YouVsMarketVisual.jsx` - Orphaned component
- `frontend/src/components/landing/` - Empty folder removed

## Action Items & Next Steps

Priority order for the next agent:

1. **Commit current Phase 4 progress** (7 files staged)
   - [ ] `git add -A && git commit -m "feat(colors): Phase 4 partial - migrate chart components"`
   - [ ] `git push origin feature/institutional-print-colors`
   - Blocked by: Nothing

2. **Continue Phase 4 - Remaining ~48 refs across 24 files**
   - [ ] `HotProjectsTable.jsx` - 4 refs (heat scale colors)
   - [ ] `DistrictLiquidityMap/constants.js` - 4 refs (theme color constants)
   - [ ] `AccountSettingsModal.jsx` - 4 refs (docblock comments only)
   - [ ] `Methodology.jsx` - 3 refs
   - [ ] `landingPreviewData.js` - 3 refs
   - [ ] `main.jsx` - 3 refs
   - [ ] `constants/index.js` - 3 refs
   - [ ] And ~16 more files with 1-3 refs each
   - Skip: `colors.js` (4 refs are intentional deprecated exports)

3. **Phase 5: Cleanup deprecated exports**
   - [ ] Remove BRAND export from colors.js (after all consumers migrated)
   - [ ] Remove MONO export from colors.js
   - [ ] Remove THEME_COLORS export
   - Depends on: Phase 4 completion

4. **Final verification**
   - [ ] `npm run lint` - should pass with 0 errors
   - [ ] `npm run typecheck` - should pass
   - [ ] Visual regression check on key pages

## Blockers & Open Questions

None currently. Migration is straightforward pattern matching.

## Context for Resume

Key things the next agent should know:
- **Design philosophy**: "Institutional Print" / "Financial Blueprint" - charts look like printed financial reports
- **Region colors**: Monochrome slate gradient (CCR darkest → OCR lightest) instead of distinct hues
- **Signal accent**: Bloomberg Orange (#F97316) for highlights/CTAs
- **The 4 refs in colors.js are intentional** - deprecated BRAND export for backward compat

## Commands to Run

```bash
# Verify current state
cd /Users/changyuesin/Desktop/sgpropertytrend
git status

# Check remaining legacy colors (should be ~48)
grep -rn "#213448\|#547792\|#94B4C1\|#EAE0CF" frontend/src --include="*.jsx" --include="*.js" | wc -l

# Commit staged Phase 4 progress
git add -A
git commit -m "feat(colors): Phase 4 partial - migrate chart components to slate"
git push origin feature/institutional-print-colors

# Continue migration
grep -rn "#213448\|#547792\|#94B4C1\|#EAE0CF" frontend/src --include="*.jsx" --include="*.js" | cut -d: -f1 | sort | uniq -c | sort -rn

# After Phase 4 complete
npm run lint
npm run typecheck
```

## Progress Summary

```
Phase 1: ████████████████████ 100% (colors.js rewrite)
Phase 2: ████████████████████ 100% (Tailwind tokens)
Phase 3: ████████████████████ 100% (high-impact files)
Phase 4: ████████████░░░░░░░░  65% (~48 of 87 refs remaining)
Phase 5: ░░░░░░░░░░░░░░░░░░░░   0% (pending)

Overall: ~93% complete (87 of ~1,385 original refs remaining)
```
