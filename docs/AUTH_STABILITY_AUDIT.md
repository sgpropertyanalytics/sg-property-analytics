# Auth/Subscription Stability Audit

**Date**: 2026-01-13
**Branch**: C
**Commits**: f71d91d8, da5495b0, 48b40a36

---

## Executive Summary

This audit addressed boot stuck issues where authenticated users would see "spinner forever" due to subscription status never resolving. Root cause was a missing `ensureSubscription` call after gateway errors during token sync.

**3 commits made** with P0 fixes, but **structural gaps remain** that could cause future whack-a-mole bugs. The fixes are tactical; a framework-level solution is recommended.

---

## Problem Statement

### Symptom
```
[AppReady] 🚨 CRITICAL: Boot stuck for >10000ms
Blocked by: subscription, tier_unknown
```

### Root Cause
When `firebase-sync` failed with gateway error (502/503/504):
1. `TokenStatus` was set to `PRESENT` (correct - user is authenticated)
2. But `ensureSubscription` was **never called** (bug)
3. Subscription stayed in `PENDING` forever
4. Boot gate never opened

---

## Changes Made

### Commit 1: `f71d91d8` - Initial Fixes

**Files Created:**
| File | Purpose |
|------|---------|
| `frontend/src/utils/authTimelineLogger.js` | Debug utility for tracking tier mutations |
| `.claude/commands/debug-auth.md` | Claude command for auth debugging |

**Files Modified:**
| File | Changes |
|------|---------|
| `AuthContext.jsx` | Added delayed firebase-sync retry (5s delay, max 2 retries) |
| `SubscriptionContext.jsx` | Added 15s pending timeout fallback |
| `AppReadyContext.jsx` | Added boot timeline logging |

**Key Changes:**
1. **Auth Timeline Logger** - `window.__AUTH_TIMELINE__` for debugging
2. **Delayed retry** - Instead of immediate ensureSubscription (which needs JWT), retry firebase-sync
3. **15s timeout** - Fail-open to free tier if subscription stays pending

### Commit 2: `da5495b0` - P0 Fixes from Codex Review

Codex identified 3 P0 issues:

| Issue | Fix |
|-------|-----|
| Timeout can overwrite successful fetch | Added `statusRef` check at fire time |
| Retry doesn't chain on retryable results | Added retry chaining up to max attempts |
| ensureSubscription after max retries won't work | Removed - let timeout handle it |

### Commit 3: `48b40a36` - Close Timeout Race

Added `lastFetchSuccessRef` as third layer of protection:

```javascript
// Three-layer timeout protection:
1. statusRef check - is status still PENDING?
2. activeRequestRef check - is a request in progress?
3. lastFetchSuccessRef check - did request succeed within 2s?
```

---

## Current Framework Analysis

### What Exists

| Element | Status | Location |
|---------|--------|----------|
| State machine documentation | ✅ Good | `docs/STATE_MACHINES.md` |
| Request sequencing (requestId) | ✅ Good | Both contexts use `startRequest()`/`isStale()` |
| Abort recovery | ✅ Good | `prevTokenStatusRef` restores on abort |
| Gateway error handling | ✅ Good | 502/503/504 → DEGRADED, not free |

### What's Scattered (Risk)

| Element | Status | Problem |
|---------|--------|---------|
| Single-writer rule | ⚠️ Scattered | Multiple places can mutate tier/status |
| Monotonicity rules | ⚠️ Partial | Some comments, not enforced |
| Race condition tests | ❌ Missing | No automated tests for timing scenarios |

### Mutation Points (Should Be Single-Writer)

**TokenStatus** (AuthContext.jsx):
- `onAuthStateChanged` callback
- `refreshToken()`
- `retryTokenSync()`
- Retry setTimeout callbacks

**SubscriptionStatus** (SubscriptionContext.jsx):
- `applyBootstrapSubscription()`
- `fetchSubscription()`
- `refreshSubscription()`
- `clearSubscription()`
- Pending timeout callback

---

## Recommended Framework

To prevent future whack-a-mole bugs, implement:

### 1. Single-Writer Rule
```
Only ONE reducer owns each piece of state.
Everything else emits events, doesn't mutate directly.
```

### 2. State Machine Table (Explicit)
```
firebaseUser: null → present
tokenSync: idle → syncing → established | retrying | failed-auth
subscription: idle → loading → resolved | degraded
appReady: depends on above, must have finite path
```

### 3. Monotonicity Rules
```
- premium cannot be overwritten by unknown
- timeout fallback to free cannot overwrite resolved server result
- degraded can only become resolved, not bounce to pending
```

### 4. Request Sequencing
```
Every async operation gets a requestId.
Only the latest requestId may commit state.
```

---

## Missing Tests (Anti-Whack-a-Mole)

These 6 tests would catch future regressions:

| # | Test Scenario | What It Validates |
|---|---------------|-------------------|
| 1 | Retryable 502 during token sync | Must schedule retry, must not deadlock |
| 2 | Token sync succeeds at t=14.9s, timeout at 15s | Must NOT overwrite premium with free |
| 3 | Logout/login different user | Backoff/refs reset, new user sync runs |
| 4 | Two subscription fetches overlap | Only latest applies |
| 5 | Multi-tab: one tab logs out | Other tab must converge |
| 6 | Backend down for N seconds | Resolves to free and stays stable |

### Test Implementation Notes

```javascript
// Example: Test #2 - Timeout must not overwrite
it('timeout does not overwrite successful fetch', async () => {
  // 1. Start subscription in PENDING
  // 2. Advance time to 14.9s
  // 3. Resolve fetch with premium
  // 4. Advance time to 15s (timeout fires)
  // 5. Assert: tier is still premium, not free
});
```

---

## Files Reference

### Created This Session
| File | Purpose |
|------|---------|
| `frontend/src/utils/authTimelineLogger.js` | Timeline debug utility |
| `.claude/commands/debug-auth.md` | Debug command |
| `docs/AUTH_STABILITY_AUDIT.md` | This document |

### Modified This Session
| File | Lines Changed |
|------|---------------|
| `frontend/src/context/AuthContext.jsx` | +200 (retry logic) |
| `frontend/src/context/SubscriptionContext.jsx` | +50 (timeout + guards) |
| `frontend/src/context/AppReadyContext.jsx` | +20 (logging) |

### Key Existing Files
| File | Purpose |
|------|---------|
| `docs/STATE_MACHINES.md` | State machine documentation |
| `frontend/src/context/__tests__/AuthContext.test.js` | Auth tests (limited) |
| `frontend/src/context/__tests__/SubscriptionContext.test.js` | Subscription tests (limited) |

---

## Debug Commands

### Browser Console
```javascript
// Full debug state
window.__APP_READY_DEBUG__.status

// Auth timeline
window.__AUTH_TIMELINE__.getHistory()
window.__AUTH_TIMELINE__.findRaces()
window.__AUTH_TIMELINE__.getSummary()

// Filter by source
window.__AUTH_TIMELINE__.filterBySource('token_sync')
window.__AUTH_TIMELINE__.filterBySource('fetch')
```

### Claude Command
```
/debug-auth
```

---

## Risk Assessment

### Fixed (This Session)
- ✅ Boot stuck on gateway errors
- ✅ Missing ensureSubscription call
- ✅ Timeout overwriting successful fetch
- ✅ Retry not chaining on retryable results

### Remaining Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| No race condition tests | High | Add 6 anti-whack-a-mole tests |
| Scattered mutation points | Medium | Implement single-writer pattern |
| No monotonicity enforcement | Medium | Add invariant checks |
| Multi-tab coherency | Low | Add cache versioning |

---

## Next Steps

### Immediate (Before Deploy)
1. Manual test the happy path (login → premium → logout)
2. Manual test gateway error scenario (throttle network)
3. Review Auth Timeline output for any races

### Short-Term
1. Add the 6 anti-whack-a-mole tests
2. Document monotonicity rules in STATE_MACHINES.md
3. Add invariant assertions in dev mode

### Long-Term
1. Implement single-writer pattern (event-driven)
2. Create `/auth/state` unified endpoint
3. Add multi-tab synchronization

---

## Appendix: Auth Timeline Events

| Event | Source | Meaning |
|-------|--------|---------|
| `BOOT_START` | app_ready | Boot began |
| `BOOT_COMPLETE` | app_ready | Boot finished |
| `BOOT_STUCK` | app_ready | Boot exceeded 10s |
| `TOKEN_SYNC_START` | auth_listener | Firebase sync starting |
| `TOKEN_SYNC_OK` | token_sync | Sync succeeded |
| `TOKEN_SYNC_RETRY` | token_sync | Gateway error, will retry |
| `TOKEN_SYNC_ERR` | token_sync | Non-auth error |
| `AUTH_FAILURE` | token_sync | 401/403 or timeout |
| `BOOTSTRAP` | bootstrap | Subscription from firebase-sync |
| `FETCH_START` | fetch | Subscription API call starting |
| `FETCH_OK` | fetch | Subscription fetched |
| `FETCH_ERR` | fetch | Fetch failed |
| `GATEWAY_ERR` | fetch/refresh | 502/503/504 error |
| `PENDING_TIMEOUT` | subscription | 15s timeout fired |
| `CLEAR` | logout | Subscription cleared |

---

## Conclusion

The immediate boot stuck issue is fixed with three commits. However, the underlying architecture has scattered mutation points and lacks comprehensive race condition tests.

**Recommendation**: Before adding more features to auth/subscription, invest in the 6 anti-whack-a-mole tests. They will catch regressions and provide confidence for future changes.
