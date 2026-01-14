---
description: Debug auth/subscription instability using the Auth Timeline Logger
---

# Debug Auth

Specialized debugging for auth and subscription state issues. Uses the Auth Timeline Logger (`window.__AUTH_TIMELINE__`) to diagnose boot stuck, tier races, and subscription state problems.

## When to Use

- Boot stuck on `subscription` or `tier_unknown`
- Tier flapping (premium → free → premium)
- Auth state not resolving
- Subscription not loading after sign-in
- "Backend waking up" banner staying forever

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
// Current boot state
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

**Pattern 1: Missing ensureSubscription after retryable error**
```
TOKEN_SYNC_START → TOKEN_SYNC_RETRY → (nothing)
```
❌ No FETCH_START after TOKEN_SYNC_RETRY = subscription never fetched

**Pattern 2: Stale response overwrites fresh**
```
CACHE_LOAD tier: unknown → premium
FETCH_OK tier: premium → free  ← RACE! Old response arrived late
```

**Pattern 3: Boot stuck because status never leaves pending**
```
BOOT_STUCK blockedBy: ["subscription", "tier_unknown"]
```
Check if there's no FETCH_START at all, or FETCH_ERR without recovery.

**Pattern 4: Logout during fetch discards result**
```
FETCH_START → CLEAR → (fetch completes but discarded)
```
This is correct behavior, not a bug.

### Step 2: Check Code Paths

Read these files for the specific issue:

```
Task - Check token sync path:
Read frontend/src/context/AuthContext.jsx lines 257-370
Look for: Does TOKEN_SYNC_RETRY call ensureSubscription? (It should, but might not)
Return: Whether ensureSubscription is called after retryable errors
```

```
Task - Check subscription status flow:
Read frontend/src/context/SubscriptionContext.jsx lines 356-610
Look for: What sets status to RESOLVED vs stays PENDING?
Return: All paths that should set status to non-pending
```

```
Task - Check boot gate logic:
Read frontend/src/context/AppReadyContext.jsx lines 88-110
Look for: What conditions block boot?
Return: The exact boolean conditions for subscriptionResolved and tierResolved
```

### Step 3: Cross-Reference with Timeline

Match timeline events to code paths:

| Timeline Event | Code Location | What Should Happen |
|----------------|---------------|-------------------|
| `TOKEN_SYNC_RETRY` | AuthContext.jsx:322-345 | Calls ensureSubscription with backoff |
| `TOKEN_SYNC_ERR` | AuthContext.jsx:367-388 | Calls ensureSubscription with backoff |
| `FETCH_START` | SubscriptionContext.jsx:431-436 | Request starts |
| `FETCH_OK` | SubscriptionContext.jsx:460-477 | Status → RESOLVED |
| `GATEWAY_ERR` | SubscriptionContext.jsx:556-569 | Status → DEGRADED |
| `PENDING_TIMEOUT` | SubscriptionContext.jsx:302-328 | 15s timeout → Resolve to free tier |
| `BOOT_STUCK` | AppReadyContext.jsx:224-235 | Logs which gates are blocked |

## Known Issues & Fixes

### Issue 1: ensureSubscription not called after retryable error

**Status**: ✅ FIXED

**Location**: `AuthContext.jsx:317-345` and `AuthContext.jsx:367-388`

**Problem**: When token sync hit gateway errors (502/503/504) or network errors, the code set `TokenStatus.PRESENT` but never called `ensureSubscription`, leaving subscription in `pending` state forever.

**Fix Applied**:
- Added `ensureSubscriptionRef.current()` calls in both `result.retryable` and "other errors" branches
- Added 3-second backoff guard (`lastEnsureCallRef`) to prevent spamming
- Auth Timeline Logger now shows `action: 'ensureSubscription'` or `'skipped (backoff)'`

### Issue 2: No fallback when backend stays down

**Status**: ✅ FIXED

**Location**: `SubscriptionContext.jsx:302-328`

**Problem**: If subscription status stayed `pending` indefinitely, boot would stay stuck forever.

**Fix Applied**:
- Added 15-second pending timeout that auto-resolves to free tier
- FAIL-OPEN design: never grant premium unless confirmed by backend
- Auth Timeline Logger emits `PENDING_TIMEOUT` event when triggered

### Issue 3: Race between bootstrap and fetch

**Problem**: Firebase-sync returns subscription (BOOTSTRAP), but onAuthStateChanged also triggers ensureSubscription (FETCH). If FETCH response arrives with different tier, it overwrites.

**Guard Exists**: `bootstrappedInSessionRef` should prevent this, but check if it's being set correctly.

## Debug Report Template

```markdown
## Auth Debug Report

### Timeline Analysis
- **Total events**: [from getSummary()]
- **Tier changes**: [count]
- **Races detected**: [from findRaces()]

### Boot State
- `tokenStatus`: [value]
- `subscriptionStatus`: [value]
- `tierSource`: [value]
- `tierResolved`: [value]
- `appReady`: [value]

### Issue Identified
[Which pattern from above matches]

### Root Cause
[Specific code path that's broken]

### Recommended Fix
[Specific code change needed]
```

## Quick Commands

**Browser Console**:
```javascript
// Full debug state
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
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/src/utils/authTimelineLogger.js` | Timeline logger utility |
| `frontend/src/context/AuthContext.jsx` | Token sync, auth state machine |
| `frontend/src/context/SubscriptionContext.jsx` | Subscription fetch, tier state |
| `frontend/src/context/AppReadyContext.jsx` | Boot gate logic |
| `frontend/src/context/subscriptionDerivations.js` | tierSource calculation |

## Future Improvements

After diagnosis, consider implementing:

1. **Single writer for tier** - One place that owns tier mutations
2. **Request sequencing** - Only apply latest requestId
3. **Monotonic tier resolution** - `unknown` cannot overwrite `premium`
4. **One authoritative endpoint** - `GET /auth/state` returns everything
