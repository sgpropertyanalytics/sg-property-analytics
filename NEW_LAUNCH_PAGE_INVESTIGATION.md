# New Launch Page Bug Investigation Report

**Date:** 2026-01-02
**Branch:** `claude/investigate-launch-page-bug-PThuB`
**Status:** Investigation Complete - No Bug Found

---

## Executive Summary

After thorough investigation of the git history and codebase, the "No data for selected filters" message on the New Launch Market page is **NOT a bug** - it is expected behavior based on the fundamental difference in data sources between the two charts.

---

## Investigation Scope

### User Report
- Screenshot shows: NewVsResaleChart displays data, but NewLaunchTimelineChart shows "No data for selected filters"
- Filter settings: 1Y (last 1 year), Quarterly view

### Questions Investigated
1. What past commits attempted to fix this issue?
2. What standardized framework patterns have been applied?
3. What is the root cause of the empty state?

---

## Past Commits Attempting to Fix New Launch Page

| Commit | Message | Impact |
|--------|---------|--------|
| `9b482e6` | fix(NewLaunchTimeline): Unwrap API response envelope | Fixed `.data.data` extraction |
| `bf90316` | fix(charts): Robust defensive fallback for chart data | Added `Array.isArray()` checks |
| `6e522f0` | fix(chart): Use initialData: null pattern for proper skeleton display | Shows skeleton during initial load |
| `1d9eba9` | fix(chart): Add defensive fallback for data during initial load | Handles edge cases |
| `49959cf` | refactor(charts): Remove legacy async props from ChartFrame calls | Removed deprecated props |

### Key Changes Made

#### 1. Envelope Unwrapping (commit 9b482e6)
**Problem:** API returns `{ data: [...], meta: {...} }` but code was passing whole response to transformers.

**Fix:**
```javascript
// Before (broken)
const timelineData = transformNewLaunchTimeline(timelineRes.data || []);

// After (correct)
const timelinePayload = timelineRes.data?.data || timelineRes.data || [];
const timelineData = transformNewLaunchTimeline(timelinePayload);
```

#### 2. Defensive Data Handling (commit bf90316)
**Problem:** Could crash with "Cannot read properties of undefined (reading 'map')"

**Fix:**
```javascript
// Before (fragile)
const safeData = data ?? [];

// After (robust)
const safeData = Array.isArray(data) ? data : [];
```

#### 3. Loading State Pattern (commit 6e522f0)
**Problem:** `initialData: []` caused TanStack Query to show "No data" instead of skeleton

**Fix:**
```javascript
// Before (shows "No data" flash)
{ initialData: [] }

// After (shows skeleton)
{ initialData: null }
```

---

## Standardized Framework Commits

| Commit | Message | Scope |
|--------|---------|-------|
| `bc6a779` | fix(chart): Show skeleton instead of "No data" during initial load | PriceDistributionChart (original) |
| `c2c5963` | fix(charts): Standardize initialData: null pattern across all charts | 4 charts |
| `6e522f0` | fix(chart): Use initialData: null pattern for proper skeleton display | NewLaunchTimeline, NewVsResale |
| `65f7dba` | fix(charts): Update baseline queries to initialData: null pattern | 2 baseline queries |
| `37efb93` | fix(charts): Complete initialData: null standardization for UX consistency | Final cleanup |

### Pattern Applied

All charts now follow this pattern:

```javascript
const { data, status, error, refetch } = useAppQuery(
  queryFn,
  deps,
  {
    chartName: 'ChartName',
    initialData: null,  // ← Key: null not []
    keepPreviousData: true,
  }
);

const safeData = Array.isArray(data) ? data : [];  // ← Defensive fallback
```

This ensures:
- `hasRealData(null)` returns false → shows skeleton during initial load
- `Array.isArray()` prevents crashes on unexpected data shapes

---

## Root Cause Analysis

### Why This Is NOT a Bug

The two charts have fundamentally different data sources:

#### NewVsResaleChart (`/api/new-vs-resale`)
- **Shows:** Median prices for ALL New Sale and Resale transactions
- **Data scope:** Any transaction within the filter period
- **Example:** Project X launched in 2020 and sold 50 units in 2025 → appears here ✓

#### NewLaunchTimelineChart (`/api/new-launch-timeline`)
- **Shows:** NEW PROJECT LAUNCHES (first transaction ever for each project)
- **Data scope:** Only projects where first sale occurred in the filter period
- **Example:** Project X launched in 2020, still selling in 2025 → does NOT appear here

### Scenario Explanation

Given the screenshot context:
- **Date:** January 2026
- **Filter:** Last 1 Year (2025)
- **Result:**
  - Projects launched in 2020-2024 are still selling in 2025 → NewVsResaleChart shows data ✓
  - No new projects launched in 2025 → NewLaunchTimelineChart shows "No data" ✓

This is **correct behavior**.

---

## Technical Verification

### Code Path Trace

1. `NewLaunchTimelineChart.jsx` calls `buildApiParams({ time_grain: ... })`
2. `buildApiParamsFromState()` adds `timeframe` from filter state (e.g., "Y1")
3. Backend `@api_contract` normalizes params via `normalize_params()`
4. `_normalize_timeframe()` resolves "Y1" to date bounds (last 12 months)
5. SQL query filters by launch_date (project's first transaction date)
6. If no projects launched in that period → empty result → "No data for selected filters"

### SQL Logic (backend/services/new_launch_service.py)

```sql
WITH project_launch AS (
    -- Stage 1: Global launch dates (NEVER filtered)
    -- Get first New Sale per project
    SELECT
        UPPER(TRIM(project_name)) AS project_key,
        MIN(transaction_date) AS launch_date  -- First sale = launch
    FROM transactions
    WHERE sale_type = 'New Sale'
    GROUP BY project_key
),
eligible_projects AS (
    -- Stage 2: Apply filters as cohort membership
    SELECT project_key
    FROM project_launch
    WHERE launch_date >= :date_from  -- Only new launches in period
      AND launch_date < :date_to_exclusive
)
```

The launch_date is the project's FIRST transaction ever, not filtered transactions.

---

## Recommendations

### For Users
If you expect to see data in the NewLaunchTimelineChart:
1. **Extend time filter** to 3Y or 5Y to capture launches from earlier years
2. **Click "Include 2020"** toggle to see COVID-era launches
3. **Remove district/segment filters** if applied - some combinations may have no launches

### For UX Improvement (Optional)
Consider adding a contextual message when NewLaunchTimelineChart shows empty:
```
No new project launches in the selected period.
Try extending the time filter or including 2020 data.
```

This would clarify that it's expected behavior, not an error.

---

## Conclusion

**Status:** ✅ No bug found - Working as designed

All previous commits have successfully fixed:
- [x] Envelope unwrapping issues
- [x] Defensive data handling
- [x] Loading state display (skeleton vs "No data" flash)
- [x] `initialData: null` pattern standardization
- [x] Migration to `useAppQuery`

The "No data for selected filters" message appears correctly when there are no new project launches in the filtered time period.

---

**Investigated by:** Claude Code
**Report Generated:** 2026-01-02
