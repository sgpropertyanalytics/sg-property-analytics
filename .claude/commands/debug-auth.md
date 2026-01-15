---
description: Debug auth/subscription instability using the Auth Timeline Logger
---

# Debug Auth

Specialized debugging for auth and subscription state issues. Uses the Auth Timeline Logger (`window.__AUTH_TIMELINE__`) and single-writer reducer architecture to diagnose boot stuck, tier races, and subscription state problems.

## When to Use

- Boot stuck on `subscription` or `tier_unknown`
- Tier flapping (premium -> free -> premium)
- Auth state not resolving
- Subscription not loading after sign-in
- "Backend waking up" banner staying forever
- `subPhase` stuck in `pending` or `loading`

## Architecture Overview (Single-Writer Pattern)

**All auth/subscription state mutations flow through ONE reducer:**

```
authCoordinator.js (SINGLE SOURCE OF TRUTH)
├── Auth domain: user, authPhase, authError, initialized
├── Subscription domain: tier, tierSource, subPhase, subError
└── Request sequencing: authRequestId, subRequestId, retryCount
```

**Key state values:**

| State | Values | Meaning |
|-------|--------|---------|
| `authPhase` | idle, syncing, established, retrying, error | Token sync state machine |
| `subPhase` | pending, loading, resolved, degraded | Subscription fetch state machine |
| `tier` | unknown, free, premium | User's subscription tier |
| `tierSource` | none, cache, server | Where tier came from |

## Initial Response

```
I'll help debug auth/subscription instability.

**First, in your browser console, run:**

```javascript
window.__AUTH_TIMELINE__.getHistory()
```

Then paste the output here. This shows every tier/status mutation since page load.

**Quick diagnostics you can run now:**

```javascript
// Current boot state (3 key values)
window.__APP_READY_DEBUG__.status

// Detect race conditions (premium overwritten by free)
window.__AUTH_TIMELINE__.findRaces()

// Summary stats
window.__AUTH_TIMELINE__.getSummary()
```

While you gather that, I'll check the auth code for known issues.
```

## Investigation Steps

### Step 1: Analyze Timeline Output

When user provides timeline, look for these patterns:

**Pattern 1: Request staleness (stale response ignored)**
```
[AuthCoordinator] Stale sub: abc123 != def456
```
This is CORRECT behavior - the reducer rejected an outdated response.

**Pattern 2: Monotonicity violation blocked**
```
[AuthCoordinator] Blocked: timeout cannot overwrite premium
```
This is CORRECT behavior - protecting premium tier from timeout downgrade. Note: `SUB_FETCH_FAIL` for premium users goes to `degraded` state (keeps tier), not blocked.

**Pattern 3: Boot stuck - subPhase never leaves pending**
```
BOOT_STUCK blockedBy: ["subscription", "tier_unknown"]
```
Check if there's no SUB_FETCH_START at all, or SUB_FETCH_FAIL without recovery.

**Pattern 4: Gateway errors with retry**
```
TOKEN_SYNC_RETRY → TOKEN_SYNC_RETRY → TOKEN_SYNC_OK
```
Expected during cold starts. Backend waking up, retries succeeded.

**Pattern 5: 401 Auth error blocks cached premium**
```
SUB_FETCH_FAIL errorKind: AUTH_REQUIRED → tierSource: none
```
CORRECT: 401 errors block cached premium (session invalid, fail-closed).

**Pattern 6: 403 resolves to free tier (not an error)**
```
[Subscription] 403 PREMIUM_REQUIRED - treating as free tier
SUB_FETCH_OK → tier: free, tierSource: server
```
CORRECT: 403 is server confirmation user is free tier, dispatches `SUB_FETCH_OK` not `SUB_FETCH_FAIL`.

**Pattern 7: Gateway error preserves cached premium**
```
SUB_FETCH_FAIL errorKind: GATEWAY → tierSource: cache (unchanged)
```
CORRECT: Gateway errors (502/503/504) keep cached premium (fail-open for availability).

### Step 2: Check Reducer State Transitions

The single-writer reducer in `authCoordinator.js` handles all state:

```
Task - Check reducer action handling:
Read frontend/src/context/authCoordinator.js lines 147-358
Look for: Which action type is being dispatched but not handled correctly?
Return: The action type and expected vs actual state transition
```

### Step 3: Check Dispatch Sites

**Token sync (AuthContext.jsx):**
```
Task - Check token sync dispatch:
Read frontend/src/context/AuthContext.jsx lines 230-550
Look for: Are TOKEN_SYNC_START, TOKEN_SYNC_OK, TOKEN_SYNC_RETRY being dispatched correctly?
Return: Whether requestId is passed and dispatch happens at right time
```

**Subscription fetch (SubscriptionContext.jsx):**
```
Task - Check subscription dispatch:
Read frontend/src/context/SubscriptionContext.jsx lines 545-720
Look for: Are SUB_FETCH_START, SUB_FETCH_OK, SUB_FETCH_FAIL being dispatched correctly?
Return: Whether requestId is passed and errorKind is set correctly
```

### Step 4: Check Boot Gate Logic

```
Task - Check boot gate logic:
Read frontend/src/context/AppReadyContext.jsx lines 88-138
Look for: What conditions block boot? Is publicReady/proReady calculated correctly?
Return: The exact boolean conditions and which one is blocking
```

## Key Code Locations

| What | File | Lines |
|------|------|-------|
| **Single-writer reducer** | `authCoordinator.js` | 48-358 |
| Staleness check | `authCoordinator.js` | 81-110 |
| Monotonicity check | `authCoordinator.js` | 116-141 |
| Auth actions | `authCoordinator.js` | 152-217 |
| Subscription actions | `authCoordinator.js` | 221-334 |
| TOKEN_SYNC dispatch | `AuthContext.jsx` | 237-540 |
| ensureSubscription | `SubscriptionContext.jsx` | 730-795 |
| SUB_FETCH dispatch | `SubscriptionContext.jsx` | 545-720 |
| refreshSubscription | `SubscriptionContext.jsx` | 799-970 |
| Pending timeout | `SubscriptionContext.jsx` | 360-423 |
| Boot gates | `AppReadyContext.jsx` | 88-138 |
| Timeline logger | `authTimelineLogger.js` | 70-126 |

## Reducer Action Reference

### Auth Domain Actions

| Action | Dispatched When | Next authPhase |
|--------|-----------------|----------------|
| `TOKEN_SYNC_START` | Firebase user detected, starting sync | syncing |
| `TOKEN_SYNC_OK` | Backend confirmed token valid | established |
| `TOKEN_SYNC_RETRY` | Gateway error, will retry | retrying (max 2) |
| `TOKEN_SYNC_FAIL` | Unrecoverable error | error |
| `TOKEN_SYNC_TIMEOUT` | Sync took too long | error |
| `TOKEN_SYNC_ABORT` | User logged out mid-sync | idle/retrying |

### Subscription Domain Actions

| Action | Dispatched When | Next subPhase |
|--------|-----------------|---------------|
| `SUB_FETCH_START` | Starting subscription fetch | loading |
| `SUB_FETCH_OK` | Got valid subscription from server | resolved |
| `SUB_FETCH_FAIL` | Fetch failed (see errorKind) | degraded/resolved |
| `SUB_FETCH_ABORT` | Fetch cancelled | degraded |
| `SUB_PENDING_TIMEOUT` | 15s timeout, no response | resolved (free) |
| `SUB_BOOTSTRAP` | Got subscription from token sync | resolved |
| `SUB_CACHE_LOAD` | Loaded from localStorage | resolved |

### Error Kinds (SUB_FETCH_FAIL)

| errorKind | HTTP Status | Behavior |
|-----------|-------------|----------|
| `AUTH_REQUIRED` | 401 | Block cached premium (session invalid) |
| `GATEWAY` | 502/503/504 | Keep cached premium (backend unreliable) |
| `NETWORK` | timeout/network | Keep cached premium (connectivity issue) |
| `RATE_LIMITED` | 429 | Keep cached premium (throttled) |

**Note:** 403 (`PREMIUM_REQUIRED`) is NOT an error - it dispatches `SUB_FETCH_OK` with free tier (server confirmation of non-premium status).

## Known Issues & Resolutions

### Issue 1: Gateway errors don't call ensureSubscription

**Status:** RESOLVED (by design change)

**Problem:** Old architecture called `ensureSubscription` after gateway errors, but it requires JWT cookie from firebase-sync which failed.

**Resolution:** Architecture changed to retry token sync instead (`AuthContext.jsx:362-440`). The reducer handles gateway errors by keeping cached premium (fail-open, `authCoordinator.js:261-269`).

### Issue 2: Stale responses overwriting fresh data

**Status:** RESOLVED (single-writer pattern)

**Problem:** Multiple async responses could arrive out of order, with stale data overwriting fresh.

**Resolution:** `authCoordinator.js:81-110` implements staleness check using requestId. Actions missing requestId or with non-matching requestId are rejected.

### Issue 3: Premium overwritten by timeout

**Status:** RESOLVED (monotonicity check)

**Problem:** `SUB_PENDING_TIMEOUT` could overwrite premium tier with free.

**Resolution:** `authCoordinator.js:118-121` blocks timeout from overwriting premium. Monotonicity rule: premium can only be downgraded by LOGOUT or server success.

### Issue 4: Boot stuck forever

**Status:** RESOLVED (15s timeout)

**Problem:** If subscription stayed in `pending` forever, boot would never complete.

**Resolution:** `SubscriptionContext.jsx:360-423` implements 15-second pending timeout that auto-resolves to free tier (fail-open, never grants premium without server confirmation).

### Issue 5: 401 errors keeping cached premium

**Status:** RESOLVED (Option C split handling)

**Problem:** 401 errors were treated same as gateway errors, allowing invalid sessions to keep premium access.

**Resolution:** `authCoordinator.js:246-257` splits error handling:
- 401 (`AUTH_REQUIRED`): Set `tierSource: 'none'` -> blocks `hasCachedPremium`
- 403 (`PREMIUM_REQUIRED`): Resolves via `SUB_FETCH_OK` with free tier (not an error)
- GATEWAY/NETWORK errors: Keep `tierSource` -> preserves `hasCachedPremium`

## Debug Report Template

```markdown
## Auth Debug Report

### Timeline Analysis
- **Total events**: [from getSummary()]
- **Tier changes**: [count]
- **Races detected**: [from findRaces()]

### Reducer State
- `authPhase`: [idle|syncing|established|retrying|error]
- `subPhase`: [pending|loading|resolved|degraded]
- `tier`: [unknown|free|premium]
- `tierSource`: [none|cache|server]

### Boot State
- `tokenStatus`: [derived from authPhase]
- `subscriptionStatus`: [derived from subPhase]
- `publicReady`: [boolean]
- `proReady`: [boolean]
- `appReady`: [boolean]

### Issue Identified
[Which pattern from above matches]

### Root Cause
[Specific action/dispatch that's broken]

### Recommended Fix
[Specific code change needed]
```

## Quick Commands

**Browser Console:**
```javascript
// Full debug state (3 key values + all flags)
window.__APP_READY_DEBUG__.status

// Timeline history
window.__AUTH_TIMELINE__.getHistory()

// Last 5 events
window.__AUTH_TIMELINE__.getLastN(5)

// Find tier overwrites (races)
window.__AUTH_TIMELINE__.findRaces()

// Filter by source
window.__AUTH_TIMELINE__.filterBySource('token_sync')
window.__AUTH_TIMELINE__.filterBySource('fetch')
window.__AUTH_TIMELINE__.filterBySource('bootstrap')

// Summary
window.__AUTH_TIMELINE__.getSummary()

// Clear history (for fresh test)
window.__AUTH_TIMELINE__.clear()

// Force boot if stuck on filters
window.__FILTER_STORE__?.getState().forceDefaults()
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/context/authCoordinator.js` | **SINGLE-WRITER REDUCER** - all state mutations |
| `frontend/src/context/AuthContext.jsx` | Token sync, Firebase auth listener |
| `frontend/src/context/SubscriptionContext.jsx` | Subscription fetch, ensure/refresh |
| `frontend/src/context/AppReadyContext.jsx` | Boot gate logic, stuck detection |
| `frontend/src/utils/authTimelineLogger.js` | Timeline logger utility (DEV only) |

## Invariants to Check

1. **Single-writer**: All tier/auth mutations go through `dispatch()` to `authCoordinatorReducer`
2. **Request sequencing**: Every async completion has `requestId` matching current `authRequestId`/`subRequestId`
3. **Monotonicity**: Premium cannot be downgraded except by LOGOUT or server success
4. **Convergence**: Every flow must reach terminal state (`resolved`/`degraded`/`error`)
5. **Staleness**: Old responses are rejected if requestId doesn't match
