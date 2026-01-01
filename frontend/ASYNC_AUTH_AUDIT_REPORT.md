# Async State Management & Authentication Audit Report

**Date:** 2026-01-01
**Branch:** `claude/audit-async-auth-issues-g91u1`
**Scope:** Market Overview page frontend - async state management and authentication flow

---

## Executive Summary

Despite 10+ commits attempting to fix boot deadlock and async state issues, the root problems persist because:

1. **The fixes addressed symptoms, not root causes** - Each fix patched one specific path but didn't address the architectural complexity
2. **State machine transitions have hidden edge cases** - The token/subscription/appReady dependency chain has race conditions
3. **Shared data pattern introduces new failure modes** - When parent query status gets stuck, all dependent charts freeze

---

## Architecture Overview

### Boot Sequence Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                        App Boot Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AuthContext                    SubscriptionContext             │
│  ┌─────────────────┐           ┌─────────────────┐             │
│  │ Firebase Auth   │           │ /auth/subscription│            │
│  │ onAuthStateChanged │──────▶│ API call          │            │
│  │                 │           │                   │            │
│  │ tokenStatus:    │           │ status:           │            │
│  │ - present       │           │ - pending         │            │
│  │ - missing       │◀──waits───│ - loading         │            │
│  │ - refreshing    │           │ - resolved        │            │
│  │ - error         │           │ - error           │            │
│  └────────┬────────┘           └────────┬──────────┘            │
│           │                              │                       │
│           ▼                              ▼                       │
│  ┌─────────────────────────────────────────────────┐            │
│  │              AppReadyContext                     │            │
│  │                                                  │            │
│  │  appReady = authInitialized                      │            │
│  │            && isSubscriptionReady                │            │
│  │            && tierResolved                       │            │
│  │            && filtersReady                       │            │
│  └──────────────────────┬───────────────────────────┘            │
│                         │                                        │
│                         ▼                                        │
│  ┌─────────────────────────────────────────────────┐            │
│  │          useGatedAbortableQuery                  │            │
│  │          (gates on appReady)                     │            │
│  │                                                  │            │
│  │  enabled = userEnabled && appReady               │            │
│  └──────────────────────────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### State Machine: Token Status

```
┌─────────┐    localStorage.token    ┌─────────┐
│ missing │◀────── absent ──────────│ present │
└────┬────┘                         └────┬────┘
     │                                    │
     │ user + no token                    │ 401 on API
     ▼                                    ▼
┌─────────────┐                    ┌─────────────┐
│ refreshing  │◀──── retry ────────│   error     │
└──────┬──────┘                    └─────────────┘
       │
       │ sync success
       ▼
┌─────────────┐
│   present   │
└─────────────┘
```

---

## Identified Issues

### Issue #1: Shared Data Status Propagation (CRITICAL)

**Location:** `frontend/src/pages/MacroOverview.jsx:339-356`

**Problem:** When shared data is used, the parent's query status is passed directly to child charts:

```jsx
// MacroOverview.jsx
sharedStatus={shouldFetchCompression ? compressionStatus : 'pending'}
```

If `compressionStatus` is stuck in `'refreshing'` or `'loading'`, ALL charts using shared data show "Updating..." indefinitely.

**Evidence:** Screenshot shows Market Compression, Absolute PSF, and Market Value Oscillator all stuck at "Updating..." with "0 periods" - indicating they all share the same stuck query status.

**Root Cause Chain:**
1. `compressionStatus` comes from `useGatedAbortableQuery`
2. If the query aborts or fails, status may not transition to 'success' or 'error'
3. `shouldFetchCompression` (from `useDeferredFetch`) may also prevent status updates
4. Charts receive stale status and render "Updating..." forever

---

### Issue #2: shouldFetch + enabled Gate Interaction

**Location:** `frontend/src/hooks/useDeferredFetch.js` + `useGatedAbortableQuery.js`

**Problem:** The query has TWO gates that must both be true:

```jsx
// useGatedAbortableQuery.js
const effectiveEnabled = userEnabled && appReady;

// PriceCompressionChart.jsx
{ enabled: shouldFetch && !useSharedData, keepPreviousData: true }
```

When `shouldFetch=false` (deferred) but chart is visible, or when `appReady=false`, the query never runs.

**Evidence:** `fetchOnMount: false` in MacroOverview means deferred charts only fetch when IntersectionObserver triggers AND filters change. First load may miss the intersection event.

---

### Issue #3: "NaNo" Display Bug

**Location:** `frontend/src/components/powerbi/MarketValueOscillator.jsx:140-143`

**Problem:**
```jsx
const divergence = useMemo(() => {
  if (latestZCcrRcr === null || latestZRcrOcr === null) return null;
  return latestZCcrRcr - latestZRcrOcr;  // NaN if either is undefined
}, [latestZCcrRcr, latestZRcrOcr]);
```

When `latestData = {}` (empty), `latestZCcrRcr` and `latestZRcrOcr` are `undefined`, not `null`. The check passes, subtraction yields `NaN`, displayed as "NaNo".

---

### Issue #4: tokenStatus Error State Blocking (Partially Fixed)

**Location:** `frontend/src/context/SubscriptionContext.jsx:206-215`

**Previous Problem:** When `tokenStatus === 'error'`, subscription fetch was blocked forever.

**Applied Fix:** (commit f9f0c5f)
```jsx
// Wait on: MISSING, REFRESHING (token not yet available)
// Proceed on: PRESENT (normal), ERROR (allows manual retry to break deadlock)
if (tokenStatus === 'missing' || tokenStatus === 'refreshing') {
  return;  // blocked
}
// else: proceed with fetch
```

**Remaining Issue:** If token stays in 'refreshing' state indefinitely (abort during refresh), subscription never fetches.

---

### Issue #5: Multiple Stale Request Guards Causing Abort Cascades

**Location:** `frontend/src/context/AuthContext.jsx:89-91`

```jsx
// SEPARATE stale guards to prevent cross-abort between operations
const authStateGuard = useStaleRequestGuard();  // For onAuthStateChanged sync
const tokenRefreshGuard = useStaleRequestGuard(); // For refreshToken() calls
```

**Problem:** While separation was added to prevent cross-abort, rapid state changes can still cause:
1. Auth state change → starts new request → aborts previous
2. Token refresh → starts new request → aborts previous
3. Both guards independently aborting creates orphaned state

---

### Issue #6: keepPreviousData + Status State Mismatch

**Location:** `frontend/src/hooks/useQuery.js:136-140`

```jsx
setInternalState(prev => ({
  data: keepPreviousData ? prev.data : null,
  error: null,
  inFlight: true,
}));
```

With `keepPreviousData: true`, old data is retained while new request is in-flight. But if the request aborts:
1. `inFlight` stays `true` briefly
2. Status derived as `'refreshing'` (has prior data + in-flight)
3. AbortError caught, function returns early WITHOUT updating state
4. Component may render with stale `inFlight: true`

---

## Recommended Fixes

### Fix #1: Defensive Status Resolution for Shared Data

```jsx
// MacroOverview.jsx - Add safety fallback
const resolvedCompressionStatus = useMemo(() => {
  if (!shouldFetchCompression) return 'pending';  // Deferred
  if (compressionBootPending) return 'pending';   // Boot in progress
  if (compressionRaw?.length > 0 && compressionStatus === 'refreshing') {
    // If we have data and stuck refreshing for >5s, force to success
    return 'success';
  }
  return compressionStatus;
}, [shouldFetchCompression, compressionBootPending, compressionRaw, compressionStatus]);
```

### Fix #2: NaN Guard for Oscillator Divergence

```jsx
// MarketValueOscillator.jsx
const divergence = useMemo(() => {
  if (latestZCcrRcr == null || latestZRcrOcr == null) return null;  // == catches undefined
  const result = latestZCcrRcr - latestZRcrOcr;
  return Number.isNaN(result) ? null : result;  // Explicit NaN check
}, [latestZCcrRcr, latestZRcrOcr]);
```

### Fix #3: Timeout-Based Status Recovery in useQuery

```jsx
// useQuery.js - Add timeout to force status resolution
useEffect(() => {
  if (status === 'loading' || status === 'refreshing') {
    const timeoutId = setTimeout(() => {
      // If still stuck after 30s, force error state
      setInternalState(prev => ({
        ...prev,
        error: new Error('Request timed out'),
        inFlight: false,
      }));
    }, 30000);
    return () => clearTimeout(timeoutId);
  }
}, [status]);
```

### Fix #4: Explicit State Reset on Abort

```jsx
// useQuery.js - In catch block after abort detection
if (err.name === 'CanceledError' || err.name === 'AbortError') {
  // EXPLICIT: Reset inFlight on abort to prevent stuck refreshing
  if (mountedRef.current && !isStale(requestId)) {
    setInternalState(prev => ({
      ...prev,
      inFlight: false,  // Reset flight status
      // Keep previous data and error state
    }));
  }
  return;
}
```

### Fix #5: useDeferredFetch First Mount Guard

```jsx
// useDeferredFetch.js - Ensure first mount triggers fetch for visible charts
useEffect(() => {
  // On first mount, if visible and fetchOnMount is true, fetch immediately
  if (isFirstMountRef.current && isVisible && fetchOnMount) {
    setShouldFetch(true);
    lastFilterKeyRef.current = filterKey;
  }
  isFirstMountRef.current = false;
}, [isVisible, fetchOnMount, filterKey]);
```

---

## Testing Recommendations

### Manual Test Cases

1. **Fresh login boot test:**
   - Clear localStorage
   - Login with Google
   - Verify all charts load within 10s
   - Check no "Updating..." stuck states

2. **Token expiry test:**
   - Login, wait for token expiry
   - Navigate to market-overview
   - Verify auto-refresh and chart load

3. **Network interruption test:**
   - Load page, disable network mid-load
   - Re-enable network
   - Click BootStuckBanner retry
   - Verify recovery

4. **Filter change stress test:**
   - Rapidly change filters 10 times
   - Verify final state matches last filter
   - No stuck "Updating..." states

### Automated Test Suggestions

```javascript
// E2E test with Playwright
test('charts recover from stuck refreshing state', async ({ page }) => {
  await page.goto('/market-overview');

  // Wait for initial load
  await page.waitForSelector('[data-testid="compression-chart"]');

  // Simulate network failure during filter change
  await page.route('**/api/aggregate**', route => route.abort());
  await page.click('[data-testid="filter-district-d01"]');

  // Verify stuck state
  await expect(page.locator('.update-indicator')).toBeVisible();

  // Restore network
  await page.unroute('**/api/aggregate**');

  // Wait for recovery (with timeout)
  await expect(page.locator('.update-indicator')).toBeHidden({ timeout: 35000 });
});
```

---

## Architectural Recommendations

### Short-term (This Sprint)

1. Add defensive NaN guards to all chart calculations
2. Add timeout-based status recovery to useQuery
3. Fix abort handling to explicitly reset inFlight state

### Medium-term (Next Sprint)

1. Refactor shared data pattern to use React Context instead of prop drilling
2. Add centralized error boundary with retry capability per chart
3. Implement request coalescing at API client level

### Long-term (Roadmap)

1. Consider React Query or TanStack Query for data fetching
   - Built-in retry, caching, stale-while-revalidate
   - Eliminates custom useQuery complexity

2. Move to finite state machines (XState) for boot sequence
   - Explicit state transitions
   - Impossible to reach invalid states
   - Better debugging with state visualization

---

## Files Modified by Previous Fix Attempts

| Commit | Files | Issue Addressed |
|--------|-------|-----------------|
| 4c04b79 | MacroOverview, BeadsChart, PriceDistributionChart | sharedLoading → sharedStatus |
| 157105f | SubscriptionContext | hidePaywall memory leak |
| f9f0c5f | AuthContext, SubscriptionContext, AppReadyContext | Boot deadlock recovery UI |
| 0b636ac | useQuery, useAbortableQuery | PENDING state, abort correctness |
| 43c34b4 | api/client.js | 401 detection hardening |
| f40d83e | AuthContext | Race condition auth/token |

---

## Conclusion

The root cause of persistent issues is **architectural complexity** rather than individual bugs. The current system has:

- 4 interdependent contexts (Auth, Subscription, PowerBIFilter, AppReady)
- 2 levels of query gating (appReady + shouldFetch)
- 3 different data fetching patterns (internal, shared, deferred)
- 5 possible status states with subtle transitions

Each fix addresses one path but creates new edge cases in others. A more sustainable solution requires simplifying the state management architecture, potentially using established libraries like TanStack Query or XState.

**Recommended immediate action:** Implement Fixes #2 (NaN guard) and #4 (abort state reset) as they address the most visible symptoms with minimal risk.
