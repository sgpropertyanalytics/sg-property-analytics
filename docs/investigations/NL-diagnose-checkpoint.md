# New Launch Page "No Data" Bug Investigation

**Date:** 2026-01-03
**Branch:** `NL-diagnose`
**Status:** In Progress - Frontend rendering issue suspected

---

## Problem Statement

User reported "No data for selected filters" bug on the New Launch Market page (`/new-launch-market`) in production. The New Launch Timeline chart shows empty state while its sibling chart (New vs Resale) on the same page works correctly.

---

## Investigation Timeline

### Phase 1: Initial Context Gathering

**User Input:**
- Bug is on Production (Render)
- Only "New Launch Timeline" chart is affected
- Happens "on all scenarios" (not intermittent)

**Past Fix Attempts Found:**

| Commit | Date | Description | Result |
|--------|------|-------------|--------|
| `f2fbc88` | Dec 31, 2025 | Added PENDING state to eliminate "No data" flash | Partial |
| `bc6a779` | Jan 2, 2026 | Changed `initialData` from [] to null | Partial |
| `d79d6e8` | Jan 2, 2026 | Show updating overlay when filtering with empty data | Partial |
| `4d42d77` | Jan 2, 2026 | **Added missing `timeframe` field to contract schemas** | Should have fixed it |

### Phase 2: Code Comparison

Compared the working chart (`NewVsResaleChart`) vs broken chart (`NewLaunchTimelineChart`):

| Aspect | NewVsResaleChart | NewLaunchTimelineChart |
|--------|------------------|------------------------|
| Filter hook | `useZustandFilters()` | `useZustandFilters()` |
| Param builder | `buildApiParams()` | `buildApiParams()` |
| Timeframe sent | `timeframe: 'Y1'` | `timeframe: 'Y1'` |
| API endpoint | `/api/new-vs-resale` | `/api/new-launch-timeline` |
| Contract schema | Has `timeframe` ✓ | Has `timeframe` ✓ |
| Deferred fetch | `useDeferredFetch()` | `useDeferredFetch()` |
| Query hook | `useAppQuery()` | `useAppQuery()` |

**Conclusion:** Frontend code is IDENTICAL for filter handling. Both use the same `buildApiParams()` function from `useZustandFilters()`.

### Phase 3: API Testing (BREAKTHROUGH)

Tested production API directly:

```bash
# Correct backend URL (found in vercel.json)
curl "https://sg-property-analyzer.onrender.com/api/new-launch-timeline?timeframe=Y1&time_grain=quarter"
```

**Result: API RETURNS DATA!**

```json
{
  "data": [
    {"periodStart": "2025-01-01T00:00:00+00:00", "projectCount": 6, "totalUnits": 3249},
    {"periodStart": "2025-04-01T00:00:00+00:00", "projectCount": 4, "totalUnits": 1507},
    {"periodStart": "2025-07-01T00:00:00+00:00", "projectCount": 9, "totalUnits": 4146},
    {"periodStart": "2025-10-01T00:00:00+00:00", "projectCount": 5, "totalUnits": 2580}
  ],
  "meta": {
    "apiContractVersion": "v3",
    "apiVersion": "v1",
    "elapsedMs": 774.15
  }
}
```

**Absorption endpoint also works:**

```json
{
  "data": [
    {"avgAbsorption": 66.6, "periodStart": "2025-01-01", "projectCount": 6},
    {"avgAbsorption": 20.9, "periodStart": "2025-04-01", "projectCount": 4},
    {"avgAbsorption": 84.5, "periodStart": "2025-07-01", "projectCount": 9},
    {"avgAbsorption": 87.3, "periodStart": "2025-10-01", "projectCount": 5}
  ]
}
```

---

## Root Cause Analysis

### What We Know

1. **Backend is working correctly** - API returns valid data with Y1 timeframe
2. **Contract schemas are correct** - `timeframe` field exists in all relevant schemas
3. **Both charts use same filter system** - `useZustandFilters()` → `buildApiParams()`

### Suspected Issue

The bug is in the **frontend** - somewhere between:
1. API response received
2. Data transformation (adapters)
3. State management (useAppQuery)
4. Rendering decision (hasData check)

### Possible Causes

1. **Visibility gating** - `shouldFetch` from `useDeferredFetch()` might be false
2. **Data transformation error** - Adapter might be returning empty array
3. **hasData computation** - Might be incorrectly evaluating to false
4. **Vercel deployment** - Might not have latest code

---

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `frontend/src/components/powerbi/NewLaunchTimelineChart.jsx` | Chart component | Needs investigation |
| `frontend/src/adapters/aggregate/newLaunchTimeline.js` | Data transformer | Needs investigation |
| `frontend/src/adapters/aggregate/newLaunchAbsorption.js` | Absorption transformer | Needs investigation |
| `frontend/src/hooks/useAppQuery.js` | Query wrapper | May need debugging |
| `backend/routes/analytics/new_launch.py` | Route handler | **Working ✓** |
| `backend/services/new_launch_service.py` | Service | **Working ✓** |
| `backend/api/contracts/schemas/new_launch_timeline.py` | Contract | **Correct ✓** |

---

## Data Flow Trace

```
Frontend Request:
  useZustandFilters().buildApiParams({ time_grain: 'quarter' })
    → Adds timeframe: 'Y1' from filters.timeFilter
    → Returns { timeframe: 'Y1', timeGrain: 'quarter' }

API Call:
  getNewLaunchTimeline(params)
    → GET /api/new-launch-timeline?timeframe=Y1&time_grain=quarter
    → Returns { data: [...], meta: {...} }

Response Handling:
  timelineRes.data?.data || timelineRes.data || []
    → Should extract array of periods

Transformation:
  transformNewLaunchTimeline(timelinePayload, timeGrain)
    → Parses dates, formats labels
    → Returns transformed array

Render Decision:
  hasData = timelineData.length > 0 && absorptionData.length > 0
    → If false, shows "No data for selected filters"
```

---

## Debug Logging Added (Commit ac9d8dd)

Console logging has been added to `NewLaunchTimelineChart.jsx` to trace the data flow.

**To diagnose on production:**
1. Deploy the `NL-diagnose` branch to Vercel
2. Open browser DevTools Console on `/new-launch-market` page
3. Look for `[NewLaunchTimeline]` logs:

```
[NewLaunchTimeline] API params: {...}
[NewLaunchTimeline] timelineRes.data: {...}
[NewLaunchTimeline] absorptionRes.data: {...}
[NewLaunchTimeline] timelinePayload: [...]
[NewLaunchTimeline] absorptionPayload: [...]
[NewLaunchTimeline] status: "success" | "loading" | etc
[NewLaunchTimeline] shouldFetch: true | false
[NewLaunchTimeline] data: [...] | null
[NewLaunchTimeline] safeData.length: N
[NewLaunchTimeline] filteredData.length: N
[NewLaunchTimeline] hasData: true | false
[NewLaunchTimeline] error: null | Error
```

**What to look for:**
- If `shouldFetch: false` → IntersectionObserver issue
- If `API params` missing `timeframe` → Filter state issue
- If `timelineRes.data` empty → API issue (unlikely, we tested it works)
- If `safeData.length: 0` but API returned data → Envelope unwrapping issue
- If `filteredData.length: 0` but `safeData.length > 0` → 2020 filter issue
- If `status: 'error'` → Check the error object

## Root Cause Found & Fixed

### The Problem
When Render's backend is cold (after 15 min inactivity on free tier), requests time out. Vercel's proxy returns the SPA's index.html as a fallback. The frontend received HTML instead of JSON, which:

1. Axios interceptor tried to parse it
2. `unwrapEnvelope` saw it wasn't a proper `{data, meta}` object
3. Returned the HTML string as-is
4. Component checked `Array.isArray(htmlString)` → false → `safeData = []`
5. Showed "No data for selected filters" with **no error**

This is why the user saw "no errors on the console log" but the chart showed no data.

### The Fix (`frontend/src/api/client.js`)

1. **HTML Detection**: Added check in `unwrapEnvelope()` to detect HTML responses:
   ```js
   if (typeof body === 'string' && (body.includes('<!DOCTYPE') || body.includes('<html'))) {
     console.warn('[API] Received HTML instead of JSON - backend may be cold starting');
     throw error with code 'HTML_RESPONSE';
   }
   ```

2. **Retry Logic**: Added HTML_RESPONSE to retryable errors so it auto-retries:
   ```js
   if (error?.code === 'HTML_RESPONSE') {
     return true; // Will retry after 1s delay
   }
   ```

3. **User Message**: Added friendly error message:
   ```
   "Server is warming up. Please wait a moment and try again."
   ```

### Expected Behavior After Fix

1. User loads page when Render is cold
2. First request receives HTML → **detected** → throws error
3. API client **retries** after 1s (Render now warming)
4. Second request succeeds with JSON → chart renders
5. If still fails after retry → shows error state with user message instead of confusing "No data"

## Cleanup Done

- Removed debug console.log statements from `NewLaunchTimelineChart.jsx`
- Kept console.warn for HTML detection (ESLint allows warn/error)

## Next Steps

1. **Commit and push** to `NL-diagnose` branch
2. **Test on production** - load page after Render sleeps
3. **Verify** error message shows during cold start, then chart loads after retry

---

## Environment Details

| Item | Value |
|------|-------|
| Frontend Host | Vercel |
| Backend Host | Render (`sg-property-analyzer.onrender.com`) |
| API Proxy | Vercel rewrites `/api/*` to Render |
| Branch | `NL-diagnose` |
| Plan File | `/Users/changyuesin/.claude/plans/foamy-leaping-jellyfish.md` |

---

## Related Documentation

- [CLAUDE.md](../../CLAUDE.md) - Project rules and patterns
- [REPO_MAP.md](../../REPO_MAP.md) - File locations and architecture
- [NEW_LAUNCH_PAGE_INVESTIGATION.md](../../NEW_LAUNCH_PAGE_INVESTIGATION.md) - Previous investigation notes
