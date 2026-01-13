# Auth Single-Writer Framework Implementation Plan

## Part 1: Mental Models & Frameworks

### The Problem We Keep Hitting

Every auth bug follows the same pattern:

```
Bug: "Premium user sees free tier"
Fix: Add guard in function X
New Bug: "Boot stuck forever"
Fix: Add timeout in function Y
New Bug: "Timeout overwrites premium"
Fix: Add ref check in function Z
...repeat forever...
```

**Root cause:** We're treating symptoms, not the disease.

The disease is **architectural** - we have **scattered mutation points** with **implicit rules** enforced by **comments and hope**.

---

### The Framework (Your 4 Invariants)

```
┌─────────────────────────────────────────────────────────────────┐
│                     SINGLE-WRITER RULE                          │
│                                                                 │
│  ONE reducer owns each state variable.                          │
│  Everything else emits events/actions.                          │
│  No scattered setX() calls.                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STATE MACHINE TABLE                           │
│                                                                 │
│  Explicit transitions. Invalid transitions = error.             │
│  Every state has a finite path to terminal.                     │
│  No "pending forever".                                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MONOTONICITY RULES                            │
│                                                                 │
│  Certain transitions are FORBIDDEN regardless of path:          │
│  - premium → free (unless explicit logout)                      │
│  - server-confirmed → timeout-fallback                          │
│  - resolved → pending                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   REQUEST SEQUENCING                            │
│                                                                 │
│  Every async op gets requestId.                                 │
│  Only latest requestId may commit.                              │
│  ✅ ALREADY IMPLEMENTED                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

### Current State vs Desired State

#### TokenStatus (AuthContext)

**Current: 31 mutation points across 7 functions**
```
onAuthStateChanged callback    → setTokenStatus(X)
syncTokenWithBackend          → setTokenStatus(Y)
refreshToken                  → setTokenStatus(Z)
retryTokenSync                → setTokenStatus(W)
timeout callbacks             → setTokenStatus(V)
error handlers                → setTokenStatus(U)
logout                        → setTokenStatus(T)
```

**Desired: 1 reducer, N event emitters**
```
onAuthStateChanged  → dispatch({ type: 'AUTH_STATE_CHANGED', user })
syncTokenWithBackend → dispatch({ type: 'TOKEN_SYNC_OK' | 'TOKEN_SYNC_RETRY' | 'TOKEN_SYNC_FAIL' })
refreshToken        → dispatch({ type: 'TOKEN_REFRESH_OK' | 'TOKEN_REFRESH_FAIL' })
timeout             → dispatch({ type: 'TOKEN_TIMEOUT' })
logout              → dispatch({ type: 'LOGOUT' })

                    ↓ ALL GO THROUGH

tokenReducer(state, action) {
  // 1. Validate transition (state machine)
  // 2. Check monotonicity
  // 3. Return new state (or throw/warn)
}
```

#### SubscriptionStatus (SubscriptionContext)

**Current: 24 mutation points across 5 functions**
```
applyBootstrapSubscription → setStatus(), setSubscription()
fetchSubscription         → setStatus(), setSubscription()
refreshSubscription       → setStatus(), setSubscription()
clearSubscription         → setStatus(), setSubscription()
pendingTimeout            → setStatus(), setSubscription()
```

**Desired: 1 reducer**
```
bootstrap    → dispatch({ type: 'BOOTSTRAP', subscription })
fetch        → dispatch({ type: 'FETCH_START' | 'FETCH_OK' | 'FETCH_ERR' })
refresh      → dispatch({ type: 'REFRESH_OK' | 'REFRESH_ERR' })
clear        → dispatch({ type: 'CLEAR' })
timeout      → dispatch({ type: 'PENDING_TIMEOUT' })

                    ↓

subscriptionReducer(state, action) {
  // 1. Validate transition
  // 2. Check monotonicity (premium → free blocked unless CLEAR)
  // 3. Return new state
}
```

---

### Why This Kills Whack-a-Mole

| Problem | How Framework Solves It |
|---------|------------------------|
| "Premium overwritten by free" | Monotonicity rule in reducer blocks it |
| "Timeout fires after fetch succeeds" | State machine: `resolved` has no path to `pending` |
| "Boot stuck forever" | State machine: every state has max-time terminal path |
| "Scattered guards everywhere" | All guards in ONE place (reducer) |
| "Can't audit what changed state" | Every change goes through reducer = audit log |
| "New dev adds setX() in wrong place" | TypeScript error: no exported setX() |

---

## Part 2: State Machine Definitions

### TokenSync State Machine

```
                    ┌─────────┐
                    │  IDLE   │ (initial)
                    └────┬────┘
                         │ AUTH_STATE_CHANGED (user present)
                         ▼
                    ┌─────────┐
         ┌─────────│ SYNCING │─────────┐
         │         └────┬────┘         │
         │              │              │
    SYNC_OK        SYNC_RETRY     SYNC_FAIL (401/403/timeout)
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐   ┌──────────┐   ┌─────────┐
    │ESTABLISHED│  │ RETRYING │   │  ERROR  │
    └─────────┘   └────┬─────┘   └─────────┘
         ▲             │              │
         │        RETRY_OK       (terminal, manual retry only)
         │             │
         └─────────────┘

    LOGOUT from any state → IDLE
```

**Invariants:**
- `SYNCING` must resolve within 8s (timeout → ERROR)
- `RETRYING` max 2 attempts, then → ERROR
- `ERROR` is terminal until manual `RETRY` or `LOGOUT`

### Subscription State Machine

```
                    ┌─────────┐
                    │ PENDING │ (initial)
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    BOOTSTRAP       FETCH_START     TIMEOUT (15s)
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐     ┌─────────┐     ┌─────────┐
    │RESOLVED │◄────│ LOADING │────►│RESOLVED │
    │(server) │     └────┬────┘     │ (free)  │
    └─────────┘          │          └─────────┘
         ▲               │
         │          FETCH_ERR
         │               │
         │               ▼
         │          ┌─────────┐
         │          │DEGRADED │ (gateway error, keep cache)
         │          └────┬────┘
         │               │
         │          FETCH_OK (retry succeeds)
         └───────────────┘

    CLEAR (logout) from any state → RESOLVED (free)
```

**Invariants:**
- `PENDING` must resolve within 15s (timeout → RESOLVED free)
- `DEGRADED` preserves cached tier (no downgrade)
- `RESOLVED` is stable (no path back to PENDING/LOADING unless new user)

### Monotonicity Rules (Encoded in Reducers)

```javascript
// In subscriptionReducer:
const MONOTONICITY_RULES = {
  // Rule 1: Server-confirmed premium cannot be overwritten by timeout
  canOverwriteTier: (current, next, action) => {
    if (current.tier === 'premium' &&
        current.source === 'server' &&
        action.type === 'PENDING_TIMEOUT') {
      return false; // BLOCKED
    }
    return true;
  },

  // Rule 2: Resolved cannot bounce to pending
  canTransitionStatus: (current, next) => {
    if (current === 'resolved' && next === 'pending') {
      return false; // BLOCKED (only CLEAR can reset)
    }
    return true;
  },

  // Rule 3: Degraded can only go to resolved, not loading
  canExitDegraded: (next) => {
    return next === 'resolved'; // Only valid exit
  },
};
```

---

## Part 3: Implementation Approach

### Option A: useReducer Refactor (Recommended)

**Approach:** Replace useState with useReducer in existing contexts.

**Pros:**
- Minimal structural change
- Single-writer enforced by TypeScript (no exported setX)
- Reducers are pure functions → easy to test
- Existing context API unchanged

**Cons:**
- Still within Context (not Zustand)
- 2 separate reducers (auth + subscription)

**Effort:** 3-4 days

### Option B: Zustand Migration

**Approach:** Move auth/subscription state to Zustand stores.

**Pros:**
- Follows CLAUDE.md pattern
- Better DevTools
- Easier to test
- Single store could merge auth+subscription

**Cons:**
- HIGH RISK (per REPO_MAP.md)
- Major refactor
- Need E2E tests first

**Effort:** 2-3 weeks

### Option C: Hybrid - Reducer Inside Context

**Approach:** Add reducer layer inside existing contexts without changing external API.

**Pros:**
- Zero breaking changes
- Incremental adoption
- Can migrate to Zustand later

**Cons:**
- Adds complexity layer
- Still have 1000+ line context files

**Effort:** 2-3 days

---

## Part 4: Recommendation

### Phase 1: Reducer Layer (This Week)

**Goal:** Single-writer + state machine + monotonicity in existing structure.

```javascript
// AuthContext.jsx - ADD reducer, KEEP context shell

const tokenReducer = (state, action) => {
  // State machine validation
  if (!isValidTransition(state.status, action.type)) {
    console.error(`Invalid transition: ${state.status} + ${action.type}`);
    return state;
  }

  // Process action
  switch (action.type) {
    case 'AUTH_STATE_CHANGED':
      return action.user ? { status: 'syncing', user: action.user } : { status: 'idle', user: null };
    case 'TOKEN_SYNC_OK':
      return { ...state, status: 'established' };
    case 'TOKEN_SYNC_RETRY':
      return state.retryCount < 2
        ? { ...state, status: 'retrying', retryCount: state.retryCount + 1 }
        : { ...state, status: 'error' };
    // ... etc
  }
};

// Replace 31 setTokenStatus() calls with:
dispatch({ type: 'TOKEN_SYNC_OK' });
```

### Phase 2: Monotonicity Guards (Next Week)

**Goal:** Add monotonicity rules to reducers.

```javascript
const subscriptionReducer = (state, action) => {
  // Monotonicity check BEFORE state machine
  if (!checkMonotonicity(state, action)) {
    console.warn(`Monotonicity violation blocked: ${action.type}`);
    return state;
  }

  // State machine...
};
```

### Phase 3: Zustand Migration (Later)

**Goal:** Move to Zustand when E2E coverage exists.

---

## Part 5: Success Criteria

After implementation, these statements must be true:

| Criterion | How to Verify |
|-----------|---------------|
| Single-writer | `grep "setTokenStatus\|setStatus\|setSubscription"` returns 0 outside reducers |
| State machine | Invalid transitions throw/warn in dev mode |
| Monotonicity | `premium → free` without explicit logout throws |
| No boot stuck | Every state has path to terminal within 15s |
| Audit trail | `window.__AUTH_TIMELINE__` shows every action |

---

## Part 6: Files to Change

### Phase 1 Changes

| File | Change |
|------|--------|
| `AuthContext.jsx` | Add `tokenReducer`, replace 31 `setTokenStatus` with `dispatch` |
| `SubscriptionContext.jsx` | Add `subscriptionReducer`, replace 24 `setStatus` with `dispatch` |
| `docs/STATE_MACHINES.md` | Add transition tables |

### New Files

| File | Purpose |
|------|---------|
| `context/authReducer.js` | Token state machine + reducer |
| `context/subscriptionReducer.js` | Subscription state machine + reducer |
| `context/__tests__/authReducer.test.js` | Unit tests for state machine |
| `context/__tests__/subscriptionReducer.test.js` | Unit tests for state machine |

---

## Summary

**The 4-invariant framework:**

1. ✅ **Request sequencing** - Already implemented
2. 🔧 **Single-writer** - Replace useState with useReducer
3. 🔧 **State machine** - Transition tables in reducers
4. 🔧 **Monotonicity** - Guard functions in reducers

**Key insight:** We don't need a big migration. We need to **centralize control** in reducers while keeping the existing context shell.

**Timeline:**
- Phase 1 (reducers): 3-4 days
- Phase 2 (monotonicity): 2 days
- Phase 3 (Zustand): Deferred to when E2E exists
