# Front-end Engineering Works

## Architecture: Single Authority Pattern

| Domain | Authority | Responsibility |
|--------|-----------|----------------|
| **Fetch** | `useAppQuery` | Status machine for async state (TanStack Query wrapper) |
| **UI** | `ChartFrame` with `status=…` | Single rendering contract |
| **Boot Gating** | `AppReadyContext` | ChartFrame reads boot state from context |

---

## PR3: Status-only ChartFrame Migration

**Goal:** Eliminate legacy booleans (`loading`, `isFetching`, `isBootPending`) from chart components. Make `status` the only truth that drives loading/empty/error UI.

**Status:** ✅ **LARGELY COMPLETE** (2025-01-02)

---

### Scope (Allowed Changes)

- [x] Change hook destructuring to take `status`
- [x] Pass `status` into `ChartFrame`
- [x] Remove passing `isFetching`/`isBootPending` into `ChartFrame`
- [x] Keep `error` + `refetch` wiring intact
- [x] Keep `isFiltering` (separate UI concern for debounce indicator)

### Non-Scope (Forbidden)

- No chart logic changes (transforms, metrics, filters)
- No UI copy changes
- No new features
- No new hooks
- No refactors unrelated to status plumbing

---

## The Standard Pattern

Every chart using `useAppQuery` should look like this:

```jsx
const { data, status, error, refetch } = useAppQuery(queryFn, deps, options);

return (
  <ChartFrame
    status={status}
    isFiltering={isFiltering}  // Optional: debounce indicator
    error={error}
    onRetry={refetch}
    empty={!data || data.length === 0}
    skeleton="bar"
    height={400}
  >
    {/* chart content */}
  </ChartFrame>
);
```

---

## Critical Rule

> **Never pass both `status` AND legacy booleans to `ChartFrame`.**
>
> That's the "multiple truths" bug factory.

**Removed props (redundant when `status` provided):**
- `isFetching` - Status encodes this as `loading`/`refreshing`
- `isBootPending` - ChartFrame reads from `AppReadyContext`

**Kept props:**
- `isFiltering` - Separate UI concern (debounce delay indicator)

---

## Why This Solves the "Multiple Versions" Problem

1. **Components stop inventing their own loading rules**
2. **"Pending gap" / "No data flash" becomes impossible** to reintroduce per-chart
3. **When agents touch charts, there's one contract to follow**

---

## Acceptance Criteria (Manual Testing)

| Scenario | Expected Behavior |
|----------|-------------------|
| First load | No "No data" flash before data arrives |
| Filter change | Shows proper loading overlay (not empty state) |
| 401 error | Refresh → refetch → chart recovers without user refresh |
| Abort/cancel | No error toast/flash |

---

## Migration Status

### ✅ Completed (12 charts - use `status`)

| Component | Commit |
|-----------|--------|
| MarketMomentumGrid | 44a7e44 |
| BudgetActivityHeatmap | 49959cf |
| DistrictComparisonChart | 49959cf |
| FloorLiquidityHeatmap | 49959cf |
| GrowthDumbbellChart | 49959cf |
| NewLaunchTimelineChart | 49959cf |
| NewVsResaleChart | 49959cf |
| PriceRangeMatrix | 35ff4ed |
| AbsolutePsfChart | Already clean |
| BeadsChart | Already clean |
| TimeTrendChart | Already clean |
| MarketValueOscillator | Already clean |

### ⚠️ Legacy Pattern (4 charts - use `loading`)

These receive async state as props from parent or use `useSupplyData`:

| Component | Status | Notes |
|-----------|--------|-------|
| PriceBandChart | `isBootPending` removed | Keeps `isFetching` (legacy path needs it) |
| PriceGrowthChart | `isBootPending` removed | Keeps `isFetching` (legacy path needs it) |
| SupplyBreakdownTable | `isBootPending` removed | Uses `useSupplyData` with `loading` |
| SupplyWaterfallChart | `isBootPending` removed | Uses `useSupplyData` with `loading` |

### Remaining Work

- [ ] Migrate `useSupplyData` to return `status` instead of `loading`
- [ ] Update PriceBandChart/PriceGrowthChart callers to pass `status`
- [ ] Add ESLint rule to prevent `isBootPending=` in ChartFrame calls

---

## Full Component Audit (26 components)

> Audit completed 2025-01-02. All components verified - no "No data" flash before first API response.

| Component | Pattern | Status |
|-----------|---------|--------|
| **MIGRATED (12)** |
| TimeTrendChart | ChartFrame+status | ✅ |
| BeadsChart | ChartFrame+status | ✅ |
| AbsolutePsfChart | ChartFrame+status | ✅ |
| MarketValueOscillator | ChartFrame+status | ✅ |
| NewVsResaleChart | ChartFrame+status | ✅ |
| GrowthDumbbellChart | ChartFrame+status | ✅ |
| FloorLiquidityHeatmap | ChartFrame+status | ✅ |
| NewLaunchTimelineChart | ChartFrame+status | ✅ |
| DistrictComparisonChart | ChartFrame+status | ✅ |
| BudgetActivityHeatmap | ChartFrame+status | ✅ |
| MarketMomentumGrid | ChartFrame+status | ✅ |
| PriceRangeMatrix | ChartFrame+status | ✅ |
| **LEGACY (4)** |
| PriceBandChart | ChartFrame+loading | ⚠️ dumb component |
| PriceGrowthChart | ChartFrame+loading | ⚠️ dumb component |
| SupplyBreakdownTable | ChartFrame+loading | ⚠️ useSupplyData |
| SupplyWaterfallChart | ChartFrame+loading | ⚠️ useSupplyData |
| **OTHER (10)** |
| ProjectDetailPanel | ChartFrame | ✅ |
| HotProjectsTable | ChartFrame | ✅ |
| UpcomingLaunchesTable | ChartFrame | ✅ |
| GLSDataTable | ChartFrame | ✅ |
| DistrictMicroChart | Props | ✅ no async |
| DealCheckerContent | Custom | ✅ |
| MarketStrategyMap | Custom | ✅ staleGuard |
| DistrictLiquidityMap | Custom | ✅ staleGuard |
| MarketHeatmap | Custom | ✅ |
| MarketHeatmap3D | Custom | ✅ |
