---
date: 2026-01-05T12:54:27+08:00
branch: main (working directory)
commit: 8b8c377 (uncommitted changes)
status: in_progress
---

# Handoff: Frost Overlay Loading State Migration

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Create FrostOverlay loading components | ✅ Complete | FrostSpinner, FrostProgressBar, FrostOverlay |
| Add frost CSS animations | ✅ Complete | Added to index.css |
| Refactor ChartFrame to use FrostOverlay | ✅ Complete | Default is frost, useSkeleton for legacy |
| Update UpdateIndicator | ✅ Complete | Now uses FrostSpinner |
| Migrate ResaleMetricsCards | ✅ Complete | |
| Migrate ProjectFundamentalsPanel | ✅ Complete | |
| Migrate ExitRiskDashboard | ✅ Complete | |
| Migrate table components | ✅ Complete | GLS, HotProjects, UpcomingLaunches |
| Migrate KPICardV2 and InlineCard | ✅ Complete | |
| Update Suspense fallbacks | ⏳ Planned | ExitRisk.jsx and DistrictDeepDive.jsx still use ChartSkeleton |
| Remove old skeleton CSS | ⏳ Planned | Keep for backward compat with Suspense fallbacks |
| Run verification | ⏳ Planned | Lint, typecheck, build |

## Critical References

- `CLAUDE.md` - Core invariants, especially #2 (Layer Responsibilities) and #10 (Handle All UI States)
- `frontend/src/components/common/ChartFrame.jsx` - Central loading state orchestrator
- `frontend/src/components/common/loading/` - New FrostOverlay components

## Recent Changes

### New Files Created
```
frontend/src/components/common/loading/
├── FrostSpinner.jsx     - Pulsing 3-dot spinner with Framer Motion
├── FrostProgressBar.jsx - Thin 2px sliding progress bar
├── FrostOverlay.jsx     - Glassmorphism blur container
└── index.js             - Barrel exports
```

### Modified Files
```
frontend/src/index.css:322-380 - Added frost overlay CSS animations
frontend/src/components/common/ChartFrame.jsx - Uses FrostOverlay instead of skeletons
frontend/src/components/common/UpdateIndicator.jsx - Uses FrostSpinner
frontend/src/components/powerbi/ResaleMetricsCards.jsx - FrostOverlay for loading
frontend/src/components/powerbi/ProjectFundamentalsPanel.jsx - FrostOverlay for loading
frontend/src/components/powerbi/ExitRiskDashboard.jsx - FrostOverlay for loading
frontend/src/components/powerbi/GLSDataTable.jsx - FrostOverlay for table loading
frontend/src/components/powerbi/HotProjectsTable.jsx - FrostOverlay for table loading
frontend/src/components/powerbi/UpcomingLaunchesTable.jsx - FrostOverlay for table loading
frontend/src/components/ui/KPICardV2.tsx - FrostOverlay for card loading
frontend/src/components/ui/InlineCard.tsx - FrostOverlay for card loading
frontend/src/pages/ExitRisk.jsx:27,570-582 - Import + replaced animate-pulse divs
```

## Learnings

1. **Chart.js renders to canvas, not DOM**
   - What: True "data morphing" (animating individual bars/dots) would require SVG-based library
   - Why it matters: User originally wanted D3-style data morphing, but Chart.js doesn't support it
   - Decision: Use Frost Overlay as universal loading pattern instead

2. **Table loading states require colspan trick**
   - What: Can't replace `<tr>` skeleton rows with `<div>` FrostOverlay
   - Solution: Wrap FrostOverlay in `<tr><td colSpan={columns.length}>`
   - File reference: `frontend/src/components/powerbi/GLSDataTable.jsx:366-370`

3. **Framer Motion already installed**
   - What: framer-motion v12.23.26 is available
   - Used for: FrostSpinner pulse animation, FrostProgressBar slide, FrostOverlay transitions

## Artifacts

### Created
- `frontend/src/components/common/loading/FrostSpinner.jsx` - 3 pulsing dots spinner
- `frontend/src/components/common/loading/FrostProgressBar.jsx` - Top-edge progress bar
- `frontend/src/components/common/loading/FrostOverlay.jsx` - Main frost container + FrostRefreshOverlay
- `frontend/src/components/common/loading/index.js` - Exports

### Modified (UI only, no logic changes)
- All files listed in "Recent Changes" above

## Action Items & Next Steps

1. **Update Suspense fallbacks to FrostOverlay** (Optional)
   - [ ] `ExitRisk.jsx:637,650,663,696` - 4 Suspense fallbacks still use ChartSkeleton
   - [ ] `DistrictDeepDive.jsx:58` - 1 Suspense fallback uses ChartSkeleton
   - Decision needed: Keep ChartSkeleton for Suspense (code-split lazy load) or migrate?

2. **Decide on old CSS cleanup**
   - [ ] Keep `skeleton-shimmer`, `update-indicator` CSS for backward compat
   - [ ] Or remove if all usages are migrated
   - Blocked by: Decision on Suspense fallbacks

3. **Run verification**
   - [ ] `npm run lint` - Check for unused imports/variables
   - [ ] `npm run typecheck` - TypeScript validation
   - [ ] `npm run build` - Production build test

4. **Remaining animate-pulse usages** (Low priority - legitimate uses)
   - `ProtectedRoute.jsx` - Auth loading state
   - `DebugModeIndicator.jsx` - Status dot pulse
   - `Landing.jsx` - Visual effect
   - `AccountSettingsModal.jsx` - Profile loading
   - These are NOT chart loading states, can keep as-is

## Blockers & Open Questions

- **Suspense fallbacks**: Should they use FrostOverlay or keep ChartSkeleton?
  - ChartSkeleton shows structure hints during lazy load
  - FrostOverlay is more consistent but less informative
  - Recommendation: Keep ChartSkeleton for Suspense, FrostOverlay for data loading

## Context for Resume

Key things the next agent should know:

1. **FrostOverlay has two modes**:
   - Initial load: Full frost (blur 8px) + spinner + progress bar
   - Refreshing: Light frost (blur 4px) + progress bar only (no spinner)

2. **ChartFrame backward compat**: Use `useSkeleton={true}` to force old skeleton mode

3. **Changes are UI-only**: No logic, API contracts, or field names were changed

4. **Design system colors used**:
   - Navy #213448, Blue #547792, Sky #94B4C1, Sand #EAE0CF

## Commands to Run

```bash
# Navigate to frontend
cd /Users/changyuesin/Desktop/sgpropertytrend/frontend

# Verify changes compile
npm run lint
npm run typecheck
npm run build

# Check what's changed
git status
git diff --stat

# If all good, commit
git add .
git commit -m "feat(ui): Migrate loading states to FrostOverlay

- Create FrostSpinner, FrostProgressBar, FrostOverlay components
- Update ChartFrame to use frost overlay by default
- Migrate panel components (ResaleMetrics, ProjectFundamentals, ExitRiskDashboard)
- Migrate table components (GLS, HotProjects, UpcomingLaunches)
- Migrate card components (KPICardV2, InlineCard)
- Add frost CSS animations to index.css
- Keep ChartSkeleton for backward compat (useSkeleton prop)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```
