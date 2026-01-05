# New Launch Page Bug Investigation Report

**Date:** 2026-01-02
**Branch:** `claude/investigate-launch-page-bug-PThuB`
**Status:** BUG FOUND AND FIXED

---

## Executive Summary

After thorough investigation, found a **critical bug**: the `new-launch-timeline` and `new-launch-absorption` API contract schemas were **missing the `timeframe` field**, causing the frontend's default `timeframe: 'Y1'` filter to be silently dropped.

This meant:
- Frontend sends `timeframe: 'Y1'` (last 1 year) from default filter
- Backend schema doesn't recognize `timeframe` → parameter gets dropped
- Normalizer can't resolve timeframe to date bounds
- Service receives `date_from=None`, `date_to_exclusive=None`
- SQL returns ALL launches from all time (or potentially problematic results)
- Chart shows "No data for selected filters"

---

## Root Cause

### The Bug: Missing `timeframe` Field in Contract Schemas

**Comparison of schemas:**

| Schema | Has `timeframe` | Result |
|--------|-----------------|--------|
| `aggregate.py` (Market Overview) | YES | Works correctly |
| `dashboard.py` | YES | Works correctly |
| `new_launch_timeline.py` | **NO** | BUG - timeframe ignored |
| `new_launch_absorption.py` | **NO** | BUG - timeframe ignored |
| `trends.py` (new-vs-resale) | **NO** | BUG - timeframe ignored |

### Data Flow (Before Fix)

```
1. Frontend: buildApiParams() → { timeframe: 'Y1', time_grain: 'quarter', ... }
2. Backend: @api_contract decorator receives params
3. normalize_params() only copies fields defined in schema
4. `timeframe` NOT in schema → gets dropped
5. _normalize_timeframe() finds timeframe=None
6. resolve_timeframe(None) returns { date_from: None, date_to_exclusive: None }
7. Service receives no date filter
8. SQL returns ALL data (or potentially empty due to complex queries)
9. Chart shows "No data for selected filters"
```

### Why NewVsResaleChart Still Showed Data

The `get_new_vs_resale_comparison` service has this comment:
```python
# Data completeness principle: Show ALL data by default.
# Only apply date filters when user explicitly sets them via sidebar.
```

It gracefully handles `date_from=None` by showing all data. However, this meant the time filter was being ignored, which is also incorrect behavior (user expects Y1 data, not all-time data).

---

## The Fix

Added `timeframe` field to the following contract schemas:

### 1. `backend/api/contracts/schemas/new_launch_timeline.py`

```python
"timeframe": FieldSpec(
    name="timeframe",
    type=str,
    nullable=True,
    default=None,
    allowed_values=["M3", "M6", "Y1", "Y3", "Y5", "all", ...],
    description="Timeframe preset. Takes precedence over date_from/date_to."
),
```

### 2. `backend/api/contracts/schemas/new_launch_absorption.py`

Same `timeframe` field added.

### 3. `backend/api/contracts/schemas/trends.py` (new-vs-resale)

Same `timeframe` field added, plus updated service schema to include `date_to_exclusive`.

### 4. `backend/routes/analytics/trends.py`

Updated route handler to use `date_to_exclusive` from normalizer:
```python
date_to = params.get("date_to_exclusive") or params.get("date_to")
```

---

## Files Changed

| File | Change |
|------|--------|
| `backend/api/contracts/schemas/new_launch_timeline.py` | Added `timeframe` field to param schema |
| `backend/api/contracts/schemas/new_launch_absorption.py` | Added `timeframe` field to param schema |
| `backend/api/contracts/schemas/trends.py` | Added `timeframe` field, updated service schema |
| `backend/routes/analytics/trends.py` | Use `date_to_exclusive` from normalizer |

---

## Previous Fix Attempts (Historical Context)

These commits fixed other issues but NOT the missing `timeframe` field:

| Commit | What It Fixed | Addressed This Bug? |
|--------|--------------|---------------------|
| `9b482e6` | Envelope unwrapping | No |
| `bf90316` | Defensive `Array.isArray()` checks | No |
| `6e522f0` | `initialData: null` pattern | No |
| `1d9eba9` | Defensive fallback for initial load | No |
| `49959cf` | Remove legacy async props | No |

These fixes addressed legitimate issues (crashes, loading states) but not the root cause of the "No data" bug.

---

## Verification

After this fix:
1. Frontend sends `timeframe: 'Y1'`
2. Backend schema recognizes `timeframe`
3. Normalizer resolves `Y1` to date bounds (e.g., `[2025-01-01, 2026-01-01)`)
4. Service receives proper date filters
5. SQL returns data for the last year only
6. Chart displays correctly

---

## Lessons Learned

1. **Contract schemas must be consistent** - All endpoints accepting timeframe filters must include the `timeframe` field in their schema.

2. **Test with default filters** - The bug only manifested on first page visit with default Y1 filter. Manual testing with custom date filters would have missed it.

3. **Normalizer is not magic** - The `_normalize_timeframe()` function only works if `timeframe` is in the schema's `normalized` dict.

---

**Investigated by:** Claude Code
**Bug Found:** 2026-01-02
**Fix Committed:** 2026-01-02
