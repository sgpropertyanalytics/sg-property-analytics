---
date: 2026-01-04T09:15:33+08:00
branch: rooty
commit: cf3a20c
status: ready_for_review
---

# Handoff: useDeferredFetch Query Disabling Fix

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Debug NewLaunchTimelineChart "No data" issue | ✅ Complete | Root cause found in useDeferredFetch |
| Fix useDeferredFetch mid-flight query disabling | ✅ Complete | Added initialFetchTriggeredRef guard |
| Standardize initialData: [] to null | ✅ Complete | 9 files fixed in earlier commit |
| Run tests and push | ✅ Complete | 358 tests pass |

## Critical References

- `REPO_MAP.md` Section 9 - Historical Incidents (TanStack initialData incident)
- `docs/PENDING_BUGS.md` - BUG-001 resolution (BeadsChart fix)
- `frontend/src/hooks/useDeferredFetch.js` - The fixed hook
- `frontend/src/lib/queryClient.js` - deriveQueryStatus with dataUpdatedAt check

## Recent Changes

```
frontend/src/hooks/useDeferredFetch.js:62-63 - Added initialFetchTriggeredRef
frontend/src/hooks/useDeferredFetch.js:112,117,146 - Clear flag on fetch completion
frontend/src/hooks/useDeferredFetch.js:121-126 - Guard shouldFetch=false with flag check
frontend/src/hooks/useDeferredFetch.js:155-159 - Clear flag when visible with shouldFetch=true
```

## Learnings

1. **useDeferredFetch disabled queries prematurely**
   - What: When filterKey changed while chart was below the fold (not visible), `setShouldFetch(false)` was called, disabling the TanStack Query before the initial fetch could complete
   - Why it matters: Charts below the fold (like NewLaunchTimelineChart under NewVsResaleChart) never made API calls
   - File reference: `frontend/src/hooks/useDeferredFetch.js:121-126`

2. **Visibility detection is async**
   - What: IntersectionObserver doesn't report visibility synchronously on mount
   - Why it matters: First render may have `isVisible=false` even for above-fold charts
   - File reference: `frontend/src/hooks/useDeferredFetch.js:64-81`

3. **Three distinct "No data" bugs with different root causes**
   - BeadsChart fix (3da418f): `initialData: {}` treated as success by TanStack
   - initialData standardization (83dd343): Preventive cleanup across 9 files
   - useDeferredFetch fix (cf3a20c): Query disabled mid-flight for below-fold charts

## Artifacts

Files modified in this session:
- `frontend/src/hooks/useDeferredFetch.js` - Added initialFetchTriggeredRef guard
- `frontend/src/components/insights/MarketStrategyMap.jsx` - initialData: null
- `frontend/src/components/insights/MarketHeatmap3D.jsx` - initialData: null
- `frontend/src/components/insights/DistrictLiquidityMap/DistrictLiquidityMap.jsx` - initialData: null
- `frontend/src/components/insights/MarketHeatmap.jsx` - initialData: null
- `frontend/src/components/powerbi/HotProjectsTable.jsx` - initialData: null
- `frontend/src/components/powerbi/UpcomingLaunchesTable.jsx` - initialData: null
- `frontend/src/components/powerbi/GLSDataTable.jsx` - initialData: null
- `frontend/src/pages/MacroOverview.jsx` - initialData: null (2 instances)

## Action Items & Next Steps

1. **Verify fix in production**
   - [ ] Deploy to Render/Vercel
   - [ ] Check New Launch Market page - NewLaunchTimelineChart should show data
   - [ ] Verify Network tab shows `new-launch-timeline` and `new-launch-absorption` API calls
   - Blocked by: Nothing - ready to verify

2. **Merge rooty branch to main**
   - [ ] Create PR from rooty to main
   - [ ] Review changes: 2 commits (initialData + useDeferredFetch fix)
   - Depends on: Production verification

## Blockers & Open Questions

None - fix is complete and tested.

## Context for Resume

Key things the next agent should know:

- **All 358 tests pass** - fix is safe
- **Two commits on rooty branch**:
  1. `83dd343` - initialData standardization (preventive)
  2. `cf3a20c` - useDeferredFetch fix (the actual bug fix)
- **The bug was NOT about initialData** - it was about visibility-based query deferral disabling queries mid-flight
- **Pattern to remember:** Charts below the fold that use `useDeferredFetch` with `fetchOnMount: true` should NOT have their initial fetch interrupted by visibility changes

Related historical incidents:
- "TanStack initialData Incident" (Jan 4, 2026) - `initialData: {}` caused false success
- "Layer-Upon-Layer Incident" (Dec 25, 2025) - Custom query infrastructure

## Commands to Run

```bash
# Verify current state
cd /Users/changyuesin/Desktop/sgpropertytrend/frontend
npm run test:ci  # Should show 358 tests passed

# View the commits
git log --oneline -3

# Create PR (if not already done)
gh pr create --title "fix: Prevent useDeferredFetch from disabling queries mid-flight" --body "..."
```
