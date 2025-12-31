# Comprehensive Stability Audit Report

**Date:** 2025-12-31
**Auditor:** Claude Code
**Branch:** `claude/audit-contract-drift-NgGaI`

---

## Executive Summary

This audit investigated 7 key stability concerns in the sg-property-analyzer codebase. The investigation found that **most critical issues have been addressed** through prior fixes, with **3 remaining gaps** requiring attention.

| Issue | Status | Priority |
|-------|--------|----------|
| 1. Frontend ↔ Backend contract drift | ✅ FIXED | - |
| 2. Response envelope inconsistency (.data.data) | ✅ FIXED | - |
| 3. UI state bugs: Loading vs Empty vs Error | ✅ MOSTLY FIXED | P2 |
| 4. Auth/token lifecycle fragility | ⚠️ PARTIAL | P1 |
| 5. Filter state correctness and isolation | ✅ FIXED | - |
| 6. Date granularity mismatch (URA month-level) | ✅ MOSTLY FIXED | P3 |
| 7. Missing observability for empty charts | ⚠️ PARTIAL | P2 |

---

## Issue 1: Frontend ↔ Backend Contract Drift

### Status: ✅ FULLY RESOLVED

**Original Symptom:** Charts suddenly disappear / 404s / silent "No data"

### Findings

The codebase has comprehensive contract validation safeguards:

#### 1.1 Single API Base (/api) - COMPLIANT
- **File:** `frontend/src/api/client.js:14-21`
- All API calls use centralized `/api` base URL
- Vite dev server proxies to backend, Vercel rewrites to Render
- No hardcoded URLs found anywhere in frontend

#### 1.2 Centralized Endpoints - COMPLIANT
- **File:** `frontend/src/api/endpoints.js`
- 48+ endpoints defined in single registry
- Deprecated `/districts` endpoint commented with notice (line 21)

#### 1.3 Contract Version Validation - ROBUST
- **Backend:** `backend/api/contracts/contract_schema.py` (1662+ lines)
  - Exports `apiContractVersion` (currently v3) and `contractHash` in all responses
- **Frontend:** `frontend/src/schemas/apiContract/version.js`
  - `assertKnownVersion()` called in 67 components/adapters
  - Throws in TEST mode, warns in DEV, silent degradation in PROD

#### 1.4 CI Smoke Tests - IMPLEMENTED
- **File:** `backend/tests/test_smoke_endpoints.py`
- 12+ critical endpoints tested on every CI run
- Tests: `/ping`, `/metadata`, `/filter-options`, `/aggregate`, `/dashboard`, `/kpi-summary-v2`, etc.

#### 1.5 Contract Guard - PREVENTS DRIFT
- **File:** `backend/scripts/contract_guard.py`
- Detects removed endpoints, removed fields, type changes
- Fails CI on breaking changes unless `BREAKING_CHANGE_OK=1`

#### 1.6 Deprecated Endpoint Protection - ENFORCED
- **CI Check:** `.github/workflows/regression.yml:152-173`
- Blocks any frontend usage of `/districts` endpoint
- Deprecated endpoints return 410 Gone with migration guidance

### Conclusion
No action required. Contract drift is prevented by multi-layer validation.

---

## Issue 2: Response Envelope Inconsistency (data.data)

### Status: ✅ FULLY RESOLVED

**Original Symptom:** Charts render empty even when API returns data

### Findings

#### 2.1 Axios Interceptor Unwrapping - IMPLEMENTED
- **File:** `frontend/src/api/client.js:131-162`
```javascript
export function unwrapEnvelope(body) {
  if (body && typeof body === 'object' && 'data' in body && typeof body.data === 'object') {
    return { data: body.data, meta: body.meta };
  }
  return { data: body, meta: undefined };
}
```
- Response interceptor automatically unwraps `{ data, meta }` envelope
- Components access `response.data` directly (not `response.data.data`)

#### 2.2 Prior Fixes Identified
| Commit | Fix |
|--------|-----|
| `00317ea` | KPI cards blank - envelope unwrapping |
| `3c4acaf` | 20+ components with `.data.data` pattern |
| `d7b3516` | BeadsChart missing circles |
| `9b482e6` | NewLaunchTimeline incomplete data |

#### 2.3 Regression Test - IN PLACE
- **File:** `frontend/src/api/client.test.js:78-136`
- Scans entire codebase for `.data.data` patterns
- Excludes: test files, comments, Chart.js internals
- Fails if violations found

#### 2.4 Remaining Defensive Fallbacks
- `NewLaunchTimelineChart.jsx:68-69` uses `response.data?.data || response.data || []`
- This is intentionally defensive, not a bug

### Conclusion
No action required. All `.data.data` bugs fixed, regression test prevents recurrence.

---

## Issue 3: UI State Bugs: Loading vs Empty vs Error

### Status: ✅ MOSTLY FIXED (P2 gap)

**Original Symptom:** "No data selected" flashes while loading

### Findings

#### 3.1 Loading State - CORRECTLY IMPLEMENTED
- **File:** `frontend/src/hooks/useAbortableQuery.js`
- Three state flags: `loading`, `error`, `isFetching`
- `keepPreviousData` option prevents loading flash on filter changes
- `initialData` defaults prevent undefined crashes

#### 3.2 Empty Detection - CORRECT PRECEDENCE
- **File:** `frontend/src/components/common/QueryState.jsx`
```javascript
if (loading) return <ChartSkeleton />;
if (error) return <ErrorState />;
if (empty) return "No data for selected...";
return children;
```

#### 3.3 Skeleton Loaders - PRODUCTION QUALITY
- **File:** `frontend/src/components/common/ChartSkeleton.jsx`
- 6 skeleton types: `bar`, `line`, `pie`, `grid`, `table`, `map`
- Staggered shimmer animations

#### 3.4 Error Message Sanitization - SECURE
- **File:** `frontend/src/components/common/QueryState.jsx`
- User never sees raw axios messages
- Status-specific friendly messages (401→"Session expired", 500→"Server error")

#### 3.5 GAP FOUND: NewVsResaleChart Sparse Data Warning
- **File:** `frontend/src/components/powerbi/NewVsResaleChart.jsx:26-56`
- Chart calculates `resaleCompleteness` but doesn't expose it in UI
- When <75% data points exist, chart renders with missing line but no user warning
- Debug logging exists but only visible in console

### Recommendation (P2)
Add visual badge to NewVsResaleChart when `resaleCompleteness < 0.75` showing "Data may be incomplete"

---

## Issue 4: Auth/Token Lifecycle Fragility

### Status: ⚠️ PARTIAL (P1 gap)

**Original Symptom:** User logged in but subscription shows "free"; random 401 cascades

### Findings

#### 4.1 Token Storage - STANDARD
- **File:** `frontend/src/context/AuthContext.jsx`
- Firebase Auth → `/auth/firebase-sync` → JWT stored in localStorage
- Token injected via axios request interceptor

#### 4.2 401 Debounce - FIXED
- **Prior Bug:** Global `consecutive401Count` counter caused race conditions
- **Fix (3c4acaf):** Replaced with debounced `tokenClearTimeout` (500ms)
- **File:** `frontend/src/api/client.js:128-129`

#### 4.3 Subscription Downgrade Protection - FIXED
- **Prior Bug:** Subscription status could incorrectly show "free"
- **Fix:** SubscriptionContext keeps cached value if fetch fails
- **File:** `frontend/src/context/SubscriptionContext.jsx`

#### 4.4 Token Refresh - IMPLEMENTED
- **File:** `frontend/src/context/AuthContext.jsx:279-353`
- `refreshToken()` method returns structured result: `{ok, tokenStored, reason}`
- Called by SubscriptionContext on 401 retry

#### 4.5 CRITICAL GAP: Orphaned Token-Expired Event
- **File:** `frontend/src/api/client.js:183-187`
```javascript
// 401 on non-auth endpoint - emit event for token refresh
window.dispatchEvent(new CustomEvent('auth:token-expired', {
  detail: { url: requestUrl }
}));
```
- **Problem:** Event is dispatched but **NEVER listened to**
- Search confirms: 1 match (the dispatch), 0 listeners
- **Impact:** When token expires on chart API call, no retry occurs
- User must manually refresh page

#### 4.6 GAP: Request Queue Potential Desync
- **File:** `frontend/src/api/client.js:28-50`
- If exception throws before `activeRequests--`, counter becomes out-of-sync
- No bounds on `requestQueue` length
- Low probability but could cause deadlock

### Recommendations (P1)

1. **Add listener for `auth:token-expired` event in AuthContext:**
```javascript
useEffect(() => {
  const handler = async () => {
    await refreshToken();
    // Optionally trigger refetch
  };
  window.addEventListener('auth:token-expired', handler);
  return () => window.removeEventListener('auth:token-expired', handler);
}, [refreshToken]);
```

2. **Add try/finally to request queue to ensure counter decrement**

---

## Issue 5: Filter State Correctness and Isolation

### Status: ✅ FULLY RESOLVED

**Original Symptom:** Filters reset on navigation, or bleed across pages

### Findings

#### 5.1 Page-Namespaced Keys - IMPLEMENTED
- **File:** `frontend/src/context/PowerBIFilter/storage.js`
```javascript
export function getFilterStorageKey(pageId, key) {
  return `powerbi:${pageId}:${key}`;  // e.g., powerbi:market_overview:filters
}
```
- Each page has isolated storage namespace
- Keys tracked: `FILTERS`, `DATE_PRESET`, `TIME_GROUPING`

#### 5.2 Hydration Guards - IMPLEMENTED
- **File:** `frontend/src/components/powerbi/PowerBIFilterSidebar.jsx:101-158`
- `hasAppliedInitialDates` ref prevents double initialization
- On navigation, filters reload for new pageId

#### 5.3 Reset Clears Page Namespace - CORRECT
- **File:** `frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx:231-235`
- `resetFilters()` sets state to `INITIAL_FILTERS`
- Effect syncs to page-namespaced storage

#### 5.4 No Cross-Page Bleeding - VERIFIED
- Provider wraps entire app (single instance)
- Navigation triggers reload of page-specific stored filters
- Tested across market-overview, new-launch-market, district-overview

#### 5.5 Minor Gap: No Schema Versioning
- If `INITIAL_FILTERS` structure changes, old stored values silently ignored
- Low risk - merge strategy handles new fields

### Conclusion
No action required. Filter isolation is robust.

---

## Issue 6: Date Granularity Mismatch (URA Month-Level)

### Status: ✅ MOSTLY FIXED (P3 gap)

**Original Symptom:** "No data" for valid periods; last 90 days excludes entire months

### Findings

#### 6.1 Frontend Date Snapping - IMPLEMENTED
- **File:** `frontend/src/components/powerbi/PowerBIFilterSidebar.jsx:106-134`
```javascript
// CRITICAL: Snap to 1st of month for URA data compatibility
startDate.setDate(1);
```
- All presets (M3, M6, Y1, Y3, Y5) return dates aligned to 1st of month

#### 6.2 Backend Month Normalization - IMPLEMENTED
- **File:** `backend/api/contracts/normalize.py:263-293`
```python
def _normalize_month_windows(params):
    # date_from → 1st of month
    # date_to → 1st of next month (exclusive)
```
- Prevents "Oct 2" boundary excluding all October data

#### 6.3 Timeframe Resolution - CORRECT
- **File:** `backend/constants.py:598+`
- `resolve_timeframe()` returns month boundaries exclusively
- Y1 = 12 complete months, not 365 days

#### 6.4 Empty Result Warnings - PARTIAL
- **File:** `backend/routes/analytics/aggregate.py:349-373`
- When `totalRecords == 0`:
  - Returns warnings array with diagnostic hints
  - Includes "URA data is month-level" note if date filter active
- **Gap:** No warning when query succeeds but dates were normalized

#### 6.5 GAP: Unused `normalize_ura_date()` Function
- **File:** `backend/utils/normalize.py:209-231`
- Function defined but **never called** anywhere
- Dead code that could cause confusion

### Recommendations (P3)

1. Remove unused `normalize_ura_date()` function or integrate into active code path
2. Consider adding `dateNormalized: true` flag to response meta when dates were auto-aligned

---

## Issue 7: Missing Observability for Empty Charts

### Status: ⚠️ PARTIAL (P2 gap)

**Original Symptom:** Debugging requires guesswork

### Findings

#### 7.1 Debug Overlay - IMPLEMENTED
- **File:** `frontend/src/hooks/useDebugOverlay.jsx`
- Full-featured overlay showing:
  - Endpoint, params, recordCount, warnings
  - requestId, elapsed time
  - Status indicators (loading, success, error, canceled)
  - Copy to clipboard as JSON
- Activation: `Ctrl+Shift+D`, `?debug=1`, or console command

#### 7.2 RequestId Propagation - COMPLETE
- **Backend:** `backend/api/middleware/request_id.py` injects `X-Request-ID`
- Propagated to `meta.requestId` and response headers
- Debug overlay captures from both sources

#### 7.3 Backend RecordCount - RETURNED
- **File:** `backend/routes/analytics/aggregate.py:602`
- Returns `totalRecords` in meta
- Debug overlay extracts it correctly

#### 7.4 Backend Warnings - GENERATED BUT NOT IN SCHEMA
- **File:** `backend/routes/analytics/aggregate.py:351-371`
- Generates helpful warnings: "5+ bedroom units are rare", "Try removing some filters"
- **Gap:** `warnings` field not defined in response schema
- **File:** `backend/api/contracts/schemas/aggregate.py:238-246`
- Schema only has: requestId, elapsedMs, cacheHit, filtersApplied, totalRecords, apiVersion
- Warnings may be stripped during validation

#### 7.5 GAP: Debug Overlay Only in 2 Charts
- **Using overlay:** TimeTrendChart, BeadsChart
- **Missing overlay (16+ charts):**
  - PriceCompressionChart, AbsolutePsfChart, GrowthDumbbellChart
  - PriceDistributionChart, NewLaunchTimelineChart, PriceRangeMatrix
  - FloorLiquidityHeatmap, MarketMomentumGrid, ProjectDetailPanel
  - UpcomingLaunchesTable, HotProjectsTable, DistrictComparisonChart
  - BudgetActivityHeatmap, NewVsResaleChart, and more

#### 7.6 GAP: Generic Empty State Message
- **File:** `frontend/src/components/common/QueryState.jsx:44`
```jsx
if (empty) return <div>No data for selected filters.</div>;
```
- Provides no diagnostic info (recordCount, requestId, applied filters)

### Recommendations (P2)

1. **Add `warnings` to aggregate response schema:**
```python
"warnings": FieldSpec(name="warnings", type=list, required=False),
```

2. **Expand debug overlay to all data-fetching charts**

3. **Enhance QueryState empty message** to show "Debug info" link when in debug mode

---

## Summary of Remaining Work

### P1 - Critical (Fix Soon)
| Issue | Location | Fix |
|-------|----------|-----|
| Orphaned `auth:token-expired` event | `frontend/src/api/client.js:183-187` | Add event listener in AuthContext |

### P2 - Important (Fix This Sprint)
| Issue | Location | Fix |
|-------|----------|-----|
| NewVsResaleChart sparse data warning | `NewVsResaleChart.jsx` | Add UI badge for low completeness |
| Debug overlay missing from 16 charts | Various chart components | Add `useDebugOverlay` hook |
| Warnings not in response schema | `schemas/aggregate.py` | Add `warnings` field |
| Generic empty state | `QueryState.jsx` | Add debug info option |

### P3 - Minor (Backlog)
| Issue | Location | Fix |
|-------|----------|-----|
| Unused `normalize_ura_date()` | `backend/utils/normalize.py` | Remove or integrate |
| No filter schema versioning | `PowerBIFilter/storage.js` | Add version field to stored filters |
| Date normalization not surfaced | Response meta | Add `dateNormalized` flag |

---

## Files Audited

### Frontend
- `frontend/src/api/client.js` - API client, interceptors, queue
- `frontend/src/api/endpoints.js` - Endpoint registry
- `frontend/src/context/AuthContext.jsx` - Auth/token management
- `frontend/src/context/SubscriptionContext.jsx` - Subscription state
- `frontend/src/context/PowerBIFilter/` - Filter state management
- `frontend/src/hooks/useAbortableQuery.js` - Async data fetching
- `frontend/src/hooks/useDebugOverlay.jsx` - Debug observability
- `frontend/src/hooks/useStaleRequestGuard.js` - Race condition prevention
- `frontend/src/components/common/QueryState.jsx` - Loading/empty/error states
- `frontend/src/components/common/ChartSkeleton.jsx` - Loading skeletons
- `frontend/src/components/powerbi/*.jsx` - Chart components
- `frontend/src/schemas/apiContract/` - Contract definitions
- `frontend/src/adapters/aggregate/` - Data transformation layer

### Backend
- `backend/api/contracts/contract_schema.py` - API versioning, enums
- `backend/api/contracts/schemas/aggregate.py` - Aggregate endpoint schema
- `backend/api/contracts/normalize.py` - Request normalization
- `backend/api/middleware/request_id.py` - Request ID injection
- `backend/routes/analytics/aggregate.py` - Main aggregation endpoint
- `backend/utils/normalize.py` - Data normalization utilities
- `backend/utils/filter_builder.py` - SQL filter construction
- `backend/constants.py` - Timeframe resolution

### CI/Testing
- `backend/tests/test_smoke_endpoints.py` - Endpoint smoke tests
- `backend/tests/test_api_contract.py` - Contract tests
- `backend/scripts/contract_guard.py` - Breaking change detection
- `.github/workflows/regression.yml` - CI workflow

---

## Conclusion

The sg-property-analyzer codebase has addressed the majority of the reported stability issues through systematic fixes over multiple commits. The remaining gaps are focused on:

1. **Auth token refresh for non-auth 401s** - Critical but low-frequency impact
2. **Observability gaps** - Debug overlay exists but not widely deployed
3. **Minor dead code** - Low risk, cleanup opportunity

The codebase demonstrates strong engineering practices including:
- Contract-first API design with version validation
- Multi-layer CI safeguards preventing drift
- Proper state management with loading/error/empty distinction
- Page-isolated filter persistence

**Overall Assessment:** Production-ready with minor improvements needed.
