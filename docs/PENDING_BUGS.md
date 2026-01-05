# Pending Bugs

_No pending bugs at this time._

---

## Resolved Bugs

### BUG-001: BeadsChart "No data for selected filters" [RESOLVED]

**Status:** Fixed
**Reported:** Jan 4, 2026
**Resolved:** Jan 4, 2026
**Environment:** Production (sgpropertytrend.com)
**Page:** Market Overview (`/market-overview`), New Launch Market (`/new-launch-market`)

#### Root Cause

Two related issues causing "No data for selected filters" to flash before chart loads:

1. **`initialData: {}` in MacroOverview** - When `useAppQuery` receives `initialData: {}`, TanStack Query immediately returns `isSuccess: true` with empty data. Before the actual fetch starts, there's a brief window where `status = 'success'` but `data = {}`, causing ChartFrame to show "No data" instead of skeleton.

2. **Missing edge case in `deriveQueryStatus`** - The status derivation function didn't account for the case where `isSuccess = true`, `hasData = false`, and `dataUpdatedAt = 0` (no fetch ever completed). This caused queries with empty initialData to report `SUCCESS` status instead of `LOADING`.

#### Fix Applied

1. **MacroOverview.jsx:177** - Changed `initialData: {}` to `initialData: null`
   ```diff
   - { chartName: 'MacroOverview-Dashboard', initialData: {}, keepPreviousData: true, enabled: shouldFetchPanels }
   + { chartName: 'MacroOverview-Dashboard', initialData: null, keepPreviousData: true, enabled: shouldFetchPanels }
   ```

2. **queryClient.js:148-150** - Added edge case handling in `deriveQueryStatus`:
   ```javascript
   // Success with no real data AND no fetch ever completed
   if (isSuccess && !hasData && queryResult.dataUpdatedAt === 0) {
     return QueryStatus.LOADING;
   }
   ```

#### Tests Added

- `queryClient.test.js`: "returns LOADING when isSuccess but no real data and no fetch ever completed"
- `queryClient.test.js`: "returns SUCCESS when isSuccess with no data but fetch has completed (legitimate empty result)"

#### Historical Context

This was the **6th distinct root cause** for the recurring "No data" issue:

| # | Root Cause | Fix Location |
|---|------------|--------------|
| 1 | Missing `timeframe` field in API schema | Backend contract |
| 2 | HTML response from cold start | API client retry |
| 3 | Visibility gating failure | useDeferredFetch |
| 4 | Defensive fallbacks mask errors | Adapter layer |
| 5 | Wrong data aggregation format | Adapter layer |
| **6** | **TanStack initialData causes premature success** | **deriveQueryStatus** |

**Lesson learned:** When using TanStack Query with `initialData`, always use `null` instead of empty objects/arrays to ensure proper loading state detection.
