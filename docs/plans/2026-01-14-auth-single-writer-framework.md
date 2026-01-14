# Auth Single-Writer Framework Implementation Plan

> **Last Updated:** 2026-01-14
> **Status:** Phase 2 Complete (user + initialized + tokenStatus migrated)
> **Decision Framework:** [`AUTH_DECISION_FRAMEWORK.md`](../AUTH_DECISION_FRAMEWORK.md) ← **READ FIRST**
> **Related:** `docs/AUTH_STABILITY_AUDIT.md`

## The Actual Goal

**DELETE mutation points, not add validators.**

```
BEFORE: 116 scattered setState/mutation points across 11 state variables
AFTER:  1 reducer commit path

VERIFICATION: grep -r "set(TokenStatus|User|Status|Subscription|Tier)" returns 0 matches
              outside authCoordinator.js
```

The reducer and validators are a MEANS to safely delete 115 mutation points. If they exist but mutations remain, we've failed.

---

## Reliability Criteria (MUST PROVE)

> **Direction ≠ Completion.** You can be "moving toward single writer" but still have 10 mutation points left, one path that bypasses the reducer, one timeout that isn't scoped. Any one of those is enough to keep the free↔premium flicker alive.

### Two Conditions for Reliability

**Condition A: Single-writer is REAL, not "mostly"**

You only get predictability when:
- There is ONE commit path for auth/tier/subscription
- AND zero other code can mutate those fields

If any "escape hatch" setter remains (even "just for retries" or "just for timeouts"), instability can persist.

```bash
# Verification (must pass)
grep -rE "set(TokenStatus|User|Status|Subscription|Tier|TierSource)" frontend/src/context/ \
  --include="*.jsx" | grep -v "authCoordinator"
# Expected: 0 matches
```

**Condition B: Sequencing covers ALL writers, including timeouts**

A lot of "still unstable" systems fail here:
- Request sequencing exists for fetch completion
- But timeouts, retries, and fallback branches still fire out-of-band
- They overwrite correct states

"requestId required" must apply to:
- ✅ Fetch success/fail
- ✅ Timeout actions
- ✅ Retry scheduling
- ✅ Fallback to free

If timeouts aren't request-scoped, the system can still flip randomly.

### Two Invariants That Must Never Be Violated

| Invariant | Definition | Failure Mode |
|-----------|------------|--------------|
| **Premium can't be lost due to timing** | If backend returns premium once during boot, you must NOT end free at end of boot regardless of timing | Timeout overwrites server-confirmed premium |
| **Boot must converge** | Within N seconds, state must converge to (authenticated + resolved tier) OR (guest/free) and not remain stuck | Boot stuck forever, tier oscillates |

**If you can't prove these two, you can't claim reliability.**

### Deterministic Repro Suite (To Prove Predictability)

**Step 1: Add debug timeline logging**

For every action dispatched, log:
- Action type
- requestId
- Resulting `(authPhase, subPhase, tier, tierSource)`

**Step 2: Run 10 refreshes under each scenario**

| Scenario | What It Tests |
|----------|---------------|
| Backend warm | Happy path convergence |
| Backend cold (Render sleeping) | Gateway error handling, retry logic |
| Offline simulation (throttle/block API) | Timeout fallback behavior |
| Multi-tab (open two tabs, refresh both) | Cross-tab state coherence |

**Step 3: Pass criteria (binary)**

- ✅ Final tier is the SAME every time for each scenario
- ✅ No oscillations after convergence
- ✅ Premium invariant never violated
- ✅ Boot converges within timeout

### What v7 Still Needs to Prove

| Question | Status | How to Verify |
|----------|--------|---------------|
| Are timeouts tied to requestId? | 🔲 Implement | Check `SUB_PENDING_TIMEOUT` action includes/checks requestId |
| Does `FIREBASE_USER_CHANGED` always reset subscription? | 🔲 Verify | Cross-domain invariant #1 |
| Any place still setting tier outside reducer? | 🔲 Grep | Condition A verification |
| Does token-sync schedule cause "PRESENT blocks sync"? | 🔲 Test | Run backend-cold scenario |

**Until these are verified, reliability is not guaranteed.**

---

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

Per `CLAUDE.md` Anti-Pattern section:
> "Avoid fixing issues by layering additional conditional logic, retries, or guards without re-establishing global invariants."

---

### The Framework (4 Invariants)

```
┌─────────────────────────────────────────────────────────────────┐
│                     SINGLE-WRITER RULE                          │
│                                                                 │
│  ONE reducer owns ALL state for each domain.                    │
│  Everything else emits events/actions.                          │
│  No scattered setX() calls.                                     │
│                                                                 │
│  ⚠️ MUST INCLUDE: user, initialized, authUiLoading, loading,   │
│     error, tokenStatus - not just tokenStatus alone!            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STATE MACHINE TABLE                           │
│                                                                 │
│  Explicit transitions. Invalid transitions = error.             │
│  Every state has a finite path to terminal.                     │
│  No "pending forever".                                          │
│                                                                 │
│  ⚠️ MUST MODEL: timeout, retry, abort as explicit actions      │
│     - not implicit async flow side effects!                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   MONOTONICITY RULES                            │
│                                                                 │
│  Certain transitions are FORBIDDEN regardless of path:          │
│  - premium → free (unless explicit logout OR server-confirmed)  │
│  - server-confirmed → timeout-fallback                          │
│  - resolved → pending                                           │
│  - initialized → uninitialized                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   REQUEST SEQUENCING                            │
│                                                                 │
│  Every async op gets requestId.                                 │
│  Only latest requestId may commit.                              │
│  ✅ ALREADY IMPLEMENTED (but scattered - should be in reducer)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Current State Analysis (Codex Review)

### Mutation Point Inventory

**AuthContext.jsx:**
| State Variable | Mutation Count | Should Be Single-Writer |
|----------------|----------------|------------------------|
| `tokenStatus` | 31 | ✅ Yes |
| `user` | 5 | ✅ Yes (currently missed) |
| `initialized` | 4 | ✅ Yes (currently missed) |
| `authUiLoading` | 2 | ✅ Yes (currently missed) |
| `loading` | 4 | ✅ Yes (currently missed) |
| `error` | 6 | ✅ Yes (currently missed) |

**SubscriptionContext.jsx:**
| State Variable | Mutation Count | Should Be Single-Writer |
|----------------|----------------|------------------------|
| `status` | 23 | ✅ Yes |
| `subscription` | 8 | ✅ Yes |
| `loading` | 8 | ✅ Yes (currently missed) |
| `fetchError` | 17 | ✅ Yes (currently missed) |
| `hasCachedSubscription` | 8 | ✅ Yes (currently missed) |

**Total: ~116 scattered mutation points across 11 state variables**

### Implicit State Machines (Currently Not Enforced)

1. **Token Status Machine** - `present/missing/refreshing/error` via scattered branches
2. **Subscription Status Machine** - `pending/loading/resolved/degraded/error` via scattered branches
3. **Boot/Ready Machine** - `initialized`, `authUiLoading`, `subscriptionReady` across multiple effects
4. **Request Lifecycle Machine** - requestId/abort/timeout/retry flows with 8+ refs

### Local Guard Explosion

| Context | isStale checks | abort checks | setTimeout sites | Guard refs |
|---------|---------------|--------------|------------------|------------|
| Auth | 32 | 15 | 6 | 8 |
| Subscription | 9 | 5 | 2 | 8 |

**This is the "increasing number of local safeguards" symptom from CLAUDE.md.**

### Duplicate Code Paths (Should Collapse)

```
AuthContext has 4 functions doing similar token sync:
├── syncWithBackend()         - called after sign-in
├── syncTokenWithBackend()    - called from onAuthStateChanged
├── refreshToken()            - called on 401
└── retryTokenSync()          - called from BootStuckBanner

Each has its own guards, timeouts, retry logic.
Should be ONE canonical pipeline with events.
```

---

## Part 3: Refined Architecture

### Option A: Unified Auth Coordinator (Recommended)

**Key Insight from Codex:** Instead of 2 separate reducers with cross-context calls, use ONE coordinator that owns the entire auth bootstrap lifecycle.

```
┌─────────────────────────────────────────────────────────────────┐
│                   AUTH COORDINATOR REDUCER                       │
│                                                                 │
│  Owns ALL auth + subscription state in one place.               │
│  Single event queue. No cross-context choreography.             │
│                                                                 │
│  State Shape:                                                   │
│  {                                                              │
│    // Auth                                                      │
│    user: User | null,                                           │
│    authPhase: 'idle' | 'syncing' | 'established' | 'retrying' | 'error', │
│    initialized: boolean,                                        │
│    authError: Error | null,                                     │
│                                                                 │
│    // Subscription                                              │
│    tier: 'unknown' | 'free' | 'premium',                       │
│    tierSource: 'none' | 'cache' | 'server',                    │
│    subPhase: 'pending' | 'loading' | 'resolved' | 'degraded',  │
│    subError: Error | null,                                      │
│                                                                 │
│    // Request tracking (moved INTO reducer state)              │
│    // Use SEPARATE IDs per domain to avoid cross-flow issues   │
│    authRequestId: number | null,                                │
│    subRequestId: number | null,                                 │
│    retryCount: number,                                          │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

**Actions (Explicit Events):**
```javascript
// Auth lifecycle - ALL completion actions include requestId for staleness check
{ type: 'FIREBASE_USER_CHANGED', user: User | null }
{ type: 'TOKEN_SYNC_START', requestId: number }
{ type: 'TOKEN_SYNC_OK', requestId: number, subscription?: Subscription }
{ type: 'TOKEN_SYNC_RETRY', requestId: number, error: Error }
{ type: 'TOKEN_SYNC_FAIL', requestId: number, error: Error }
{ type: 'TOKEN_SYNC_TIMEOUT', requestId: number }
{ type: 'TOKEN_SYNC_ABORT', requestId: number }

// Subscription lifecycle - ALL completion actions include requestId for staleness check
{ type: 'SUB_FETCH_START', requestId: number }
{ type: 'SUB_FETCH_OK', requestId: number, subscription: Subscription }
{ type: 'SUB_FETCH_FAIL', requestId: number, error: Error, errorKind: string }
{ type: 'SUB_PENDING_TIMEOUT' } // No requestId - timeouts are global
{ type: 'SUB_BOOTSTRAP', subscription: Subscription } // No requestId - bootstrap is initial load

// Explicit user actions
{ type: 'LOGOUT' }
{ type: 'MANUAL_RETRY' }
```

### Boot Phase State Machine (Unified)

```
                         ┌──────────────┐
                         │     IDLE     │
                         └──────┬───────┘
                                │ FIREBASE_USER_CHANGED (user present)
                                ▼
                         ┌──────────────┐
              ┌──────────│   SYNCING    │──────────┐
              │          └──────┬───────┘          │
              │                 │                  │
         TOKEN_SYNC_OK    TOKEN_SYNC_RETRY   TOKEN_SYNC_FAIL
         (+ bootstrap)          │            TOKEN_SYNC_TIMEOUT
              │                 │                  │
              ▼                 ▼                  ▼
       ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
       │  ESTABLISHED │  │   RETRYING   │  │    ERROR     │
       │  (+ tier)    │  │  (max 2)     │  │  (terminal)  │
       └──────────────┘  └──────┬───────┘  └──────────────┘
              │                 │                  │
              │            RETRY_OK                │
              │                 │            MANUAL_RETRY
              └─────────────────┴──────────────────┘

       LOGOUT from any state → IDLE (clears all)
```

### Why Unified > Separate Reducers

| Aspect | Separate Reducers | Unified Coordinator |
|--------|-------------------|---------------------|
| Cross-context calls | Auth calls `refreshSubscription`, `clearSubscription` | No cross-calls needed |
| Boot invariants | Split across 2 files | Single `authPhase` + `subPhase` check |
| Event ordering | Implicit timing | Explicit action sequence |
| Testing | Mock 2 contexts | Test 1 reducer |
| Debugging | Check 2 timelines | Single event stream |

---

## Part 4: Implementation Plan

### Phase 0: Lint Rules (Day 1) ✅ COMPLETE

**Goal:** Prevent NEW mutations while we migrate. Surgical, not global.

**Status:** ✅ Implemented 2026-01-14

**Verification:**
```bash
$ npx eslint src/context/AuthContext.jsx src/context/SubscriptionContext.jsx 2>&1 | grep -c "error"
66  # violations detected - lint rules working

$ npx eslint src/context/SubscriptionContext.jsx 2>&1 | grep -E "(setShowPricingModal|setUpsellContext)"
# (no output) - UI setters correctly NOT flagged
```

**What was added to `eslint.config.js`:**
- AuthContext.jsx: `no-restricted-imports` bans `useState` from React
- SubscriptionContext.jsx: `no-restricted-syntax` bans auth setters (`setSubscription`, `setStatus`, `setFetchError`, `setHasCachedSubscription`, `setLoading`)
- UI setters allowed: `setShowPricingModal`, `setUpsellContext`

```javascript
// eslint.config.js - ONLY target the two auth context files

{
  files: ['frontend/src/context/AuthContext.jsx'],
  rules: {
    // Ban useState entirely - all state goes through reducer
    'no-restricted-imports': ['error', {
      paths: [{ name: 'react', importNames: ['useState'],
        message: 'Use useReducer with authCoordinatorReducer.' }]
    }]
  }
},
{
  files: ['frontend/src/context/SubscriptionContext.jsx'],
  rules: {
    // Ban auth state setters, allow UI state (paywall modal)
    'no-restricted-syntax': ['error', {
      selector: "CallExpression[callee.name=/^set(Status|Subscription|Tier|Loading|FetchError)/i]",
      message: 'Auth state mutation forbidden. Use dispatch().'
    }]
  }
}
```

**That's it.** No global rules. No complex patterns. Just these two files.

### Phase 1: Create Auth Coordinator Reducer (Days 2-4)

**New File:** `frontend/src/context/authCoordinator.js`

```javascript
// State shape
const initialState = {
  // Auth
  user: null,
  authPhase: 'idle', // idle | syncing | established | error
  initialized: false,
  authError: null,

  // Subscription
  tier: 'unknown',
  tierSource: 'none', // none | cache | server
  subPhase: 'pending', // pending | loading | resolved | degraded
  subError: null,
  cachedSubscription: null,

  // Request tracking - SEPARATE IDs per domain
  authRequestId: null,
  subRequestId: null,
  retryCount: 0,
};

// Transition table (enforced)
// INVARIANT: resolved → pending is FORBIDDEN (monotonicity rule)
const VALID_TRANSITIONS = {
  authPhase: {
    idle: ['syncing'],
    syncing: ['established', 'retrying', 'error', 'idle'], // idle = abort
    retrying: ['established', 'error', 'idle'],
    established: ['syncing', 'idle'], // syncing = refresh, idle = logout
    error: ['syncing', 'idle'], // syncing = manual retry
  },
  subPhase: {
    pending: ['loading', 'resolved'],
    loading: ['resolved', 'degraded', 'pending'], // pending = abort only
    resolved: ['loading'], // ONLY loading allowed - pending is FORBIDDEN (monotonicity)
    degraded: ['resolved', 'loading'], // resolved = retry success
  },
};
// NOTE: "New user" scenario doesn't require resolved → pending because:
// - LOGOUT action resets entire state to initialState (subPhase: 'pending')
// - New login starts fresh from initialState, not from previous resolved state

// Monotonicity rules - prevent invalid tier/status downgrades
const checkMonotonicity = (state, action) => {
  // Rule 1: Premium (from ANY source) cannot be overwritten by timeout
  // This protects both server-confirmed AND cached premium
  if (state.tier === 'premium' && action.type === 'SUB_PENDING_TIMEOUT') {
    console.warn('[AuthCoordinator] Blocked: timeout cannot overwrite premium tier');
    return false;
  }

  // Rule 2: initialized cannot go back to false (LOGOUT keeps it true)
  // This is already handled by LOGOUT action returning initialized: true

  // Rule 3: Premium tier can ONLY be downgraded by:
  // - LOGOUT (explicit user action)
  // - Server SUCCESS confirmation (SUB_FETCH_OK or TOKEN_SYNC_OK with tier: 'free')
  // NOTE: SUB_FETCH_FAIL setting tier: 'free' is NOT a server confirmation - it's a fallback
  if (state.tier === 'premium' && action.type !== 'LOGOUT') {
    // Check explicit tier in action.subscription
    const nextTier = action.subscription?.tier;
    if (nextTier === 'free') {
      const isServerSuccessConfirmation = action.type === 'SUB_FETCH_OK' || action.type === 'TOKEN_SYNC_OK';
      if (!isServerSuccessConfirmation) {
        console.warn(`[AuthCoordinator] Blocked: ${action.type} cannot downgrade premium without server confirmation`);
        return false;
      }
    }

    // Check implicit tier: 'free' set in reducer (SUB_FETCH_FAIL on auth errors)
    // SUB_FETCH_FAIL with non-gateway errors would set tier: 'free' in the reducer
    // Block this if current tier is premium
    if (action.type === 'SUB_FETCH_FAIL' && action.errorKind !== 'GATEWAY' && action.errorKind !== 'NETWORK') {
      // This would set tier to 'free' in the reducer - block it for premium users
      console.warn('[AuthCoordinator] Blocked: SUB_FETCH_FAIL cannot downgrade premium tier (use LOGOUT)');
      return false;
    }
  }

  // Rule 4: resolved → pending is blocked by VALID_TRANSITIONS
  // (No explicit check needed here - transition validation handles it)

  return true;
};

// Transition validation - KEEP IT SIMPLE
// Just check the transition table. Don't over-engineer.
const validateTransition = (state, action) => {
  // LOGOUT always allowed - safety escape hatch
  if (action.type === 'LOGOUT' || (action.type === 'FIREBASE_USER_CHANGED' && !action.user)) {
    return true;
  }

  const targetPhase = ACTION_TO_PHASE[action.type];
  if (!targetPhase) {
    // In DEV: warn if action looks like it changes phase but isn't mapped
    if (import.meta.env.DEV && action.type.includes('_')) {
      console.warn(`[AuthCoordinator] Unmapped action: ${action.type} - add to ACTION_TO_PHASE if it changes phase`);
    }
    return true;
  }

  const { domain, phase } = targetPhase;
  const currentPhase = state[domain];
  const validNextPhases = VALID_TRANSITIONS[domain]?.[currentPhase] || [];

  if (!validNextPhases.includes(phase)) {
    console.warn(`[AuthCoordinator] Blocked: ${domain} ${currentPhase} → ${phase}`);
    return false;
  }
  return true;
};

// =============================================================================
// CROSS-DOMAIN INVARIANTS (the 3 coupling points that historically bite us)
// =============================================================================
// These are NOT a theorem prover - just guardrails for known failure modes.

const checkCrossDomainInvariants = (state, action, nextState) => {
  // Invariant 1: Auth change must reset subscription
  // If firebase user becomes null → subPhase must go to resolved/free, tier cleared
  if (action.type === 'FIREBASE_USER_CHANGED' && !action.user) {
    if (nextState.subPhase !== 'resolved' || nextState.tier !== 'free') {
      console.error('[INVARIANT] Logout must reset subscription to resolved/free');
      return false;
    }
  }

  // Invariant 2: Token sync OK must lead to subscription resolution
  // If TOKEN_SYNC_OK with bootstrap → subPhase must be resolved
  // If TOKEN_SYNC_OK without bootstrap → subscription fetch should be triggered (caller's job)
  if (action.type === 'TOKEN_SYNC_OK' && action.subscription) {
    if (nextState.subPhase !== 'resolved') {
      console.error('[INVARIANT] TOKEN_SYNC_OK with subscription must resolve subPhase');
      return false;
    }
  }

  // Invariant 3: Premium requires established session
  // Cannot have server-confirmed premium without auth established
  if (nextState.tier === 'premium' && nextState.tierSource === 'server') {
    if (nextState.authPhase !== 'established') {
      console.error('[INVARIANT] Premium requires authPhase === established');
      return false;
    }
  }

  return true;
};

// Map actions to their target phases - SIMPLE TABLE
// Actions not listed here don't change phase (or are handled specially)
const ACTION_TO_PHASE = {
  // Auth
  TOKEN_SYNC_START: { domain: 'authPhase', phase: 'syncing' },
  TOKEN_SYNC_OK: { domain: 'authPhase', phase: 'established' },
  TOKEN_SYNC_RETRY: { domain: 'authPhase', phase: 'retrying' },
  TOKEN_SYNC_FAIL: { domain: 'authPhase', phase: 'error' },
  TOKEN_SYNC_TIMEOUT: { domain: 'authPhase', phase: 'error' },
  MANUAL_RETRY: { domain: 'authPhase', phase: 'syncing' },
  // Subscription
  SUB_FETCH_START: { domain: 'subPhase', phase: 'loading' },
  SUB_FETCH_OK: { domain: 'subPhase', phase: 'resolved' },
  SUB_BOOTSTRAP: { domain: 'subPhase', phase: 'resolved' },
  SUB_PENDING_TIMEOUT: { domain: 'subPhase', phase: 'resolved' },
  SUB_FETCH_FAIL_GATEWAY: { domain: 'subPhase', phase: 'degraded' },
  SUB_FETCH_FAIL_AUTH: { domain: 'subPhase', phase: 'resolved' },
};
// Note: LOGOUT and FIREBASE_USER_CHANGED (no user) bypass validation - always allowed

// Staleness check - ignores stale responses from superseded requests
// INVARIANT: All async completion actions MUST include requestId
const isStaleRequest = (state, action) => {
  // Auth domain completion actions (excludes START)
  const isAuthCompletion = action.type.startsWith('TOKEN_SYNC_') && action.type !== 'TOKEN_SYNC_START';
  if (isAuthCompletion) {
    // REQUIRE requestId on all auth completions
    if (action.requestId == null) {
      console.error(`[AuthCoordinator] INVARIANT VIOLATION: ${action.type} missing requestId - blocking action`);
      return true; // Block actions without requestId
    }
    if (state.authRequestId !== action.requestId) {
      console.warn(`[AuthCoordinator] Ignored stale auth response: ${action.type} (req ${action.requestId} != current ${state.authRequestId})`);
      return true;
    }
  }

  // Subscription domain completion actions (excludes START)
  const isSubCompletion = action.type.startsWith('SUB_FETCH_') && action.type !== 'SUB_FETCH_START';
  if (isSubCompletion) {
    // REQUIRE requestId on all sub completions
    if (action.requestId == null) {
      console.error(`[AuthCoordinator] INVARIANT VIOLATION: ${action.type} missing requestId - blocking action`);
      return true; // Block actions without requestId
    }
    if (state.subRequestId !== action.requestId) {
      console.warn(`[AuthCoordinator] Ignored stale sub response: ${action.type} (req ${action.requestId} != current ${state.subRequestId})`);
      return true;
    }
  }

  return false;
};

// Reducer
export function authCoordinatorReducer(state, action) {
  // 1. Staleness check (request sequencing enforcement)
  if (isStaleRequest(state, action)) {
    return state;
  }

  // 2. Transition validation (state machine enforcement)
  if (!validateTransition(state, action)) {
    return state;
  }

  // 3. Monotonicity check
  if (!checkMonotonicity(state, action)) {
    return state;
  }

  // 4. Log for audit trail
  if (import.meta.env.DEV) {
    console.warn('[AuthCoordinator]', action.type, action);
  }

  // 5. Compute next state
  const nextState = computeNextState(state, action);

  // 6. Cross-domain invariant check (DEV only - catches bugs, doesn't block)
  if (import.meta.env.DEV && !checkCrossDomainInvariants(state, action, nextState)) {
    console.error('[AuthCoordinator] Cross-domain invariant violated!', { state, action, nextState });
    // Don't block - just log. This is a bug detector, not a validator.
  }

  return nextState;
}

// Compute next state - pure switch statement
function computeNextState(state, action) {
  switch (action.type) {
    case 'FIREBASE_USER_CHANGED':
      if (!action.user) {
        // Logout path
        return {
          ...initialState,
          initialized: true, // Stay initialized
          authPhase: 'idle',
          subPhase: 'resolved',
          tier: 'free',
          tierSource: 'none',
        };
      }
      return {
        ...state,
        user: action.user,
        initialized: true,
        authPhase: state.authPhase === 'idle' ? 'syncing' : state.authPhase,
      };

    case 'TOKEN_SYNC_START':
      return {
        ...state,
        authPhase: 'syncing',
        authRequestId: action.requestId, // Per-domain ID
      };

    case 'TOKEN_SYNC_OK':
      return {
        ...state,
        authPhase: 'established',
        authError: null,
        retryCount: 0,
        authRequestId: null, // Clear auth request ID
        // Bootstrap subscription if provided
        ...(action.subscription ? {
          tier: action.subscription.tier,
          tierSource: 'server',
          subPhase: 'resolved',
          cachedSubscription: action.subscription,
        } : {}),
      };

    case 'TOKEN_SYNC_RETRY':
      if (state.retryCount >= 2) {
        return { ...state, authPhase: 'error', authError: action.error };
      }
      return {
        ...state,
        authPhase: 'retrying',
        retryCount: state.retryCount + 1,
      };

    case 'TOKEN_SYNC_FAIL':
    case 'TOKEN_SYNC_TIMEOUT':
      return {
        ...state,
        authPhase: 'error',
        authError: action.error || new Error('Token sync timeout'),
        user: null, // Force guest mode
        authRequestId: null, // Clear auth request ID
      };

    case 'TOKEN_SYNC_ABORT':
      return {
        ...state,
        authPhase: state.retryCount > 0 ? 'retrying' : 'idle',
        authRequestId: null, // Clear auth request ID
      };

    case 'SUB_FETCH_START':
      return {
        ...state,
        subPhase: 'loading',
        subRequestId: action.requestId, // Per-domain ID
      };

    case 'SUB_FETCH_OK':
      return {
        ...state,
        subPhase: 'resolved',
        tier: action.subscription.tier,
        tierSource: 'server',
        cachedSubscription: action.subscription,
        subError: null,
        subRequestId: null, // Clear sub request ID
      };

    case 'SUB_FETCH_FAIL':
      if (action.errorKind === 'GATEWAY' || action.errorKind === 'NETWORK') {
        return {
          ...state,
          subPhase: 'degraded',
          subError: action.error,
          subRequestId: null, // Clear sub request ID
          // Keep cached tier - don't downgrade
        };
      }
      return {
        ...state,
        subPhase: 'resolved', // Resolve to free on auth errors
        tier: 'free',
        tierSource: 'none',
        subError: action.error,
        subRequestId: null, // Clear sub request ID
      };

    case 'SUB_PENDING_TIMEOUT':
      // Only apply if still pending (monotonicity check handles premium protection)
      if (state.subPhase !== 'pending') return state;
      return {
        ...state,
        subPhase: 'resolved',
        tier: 'free',
        tierSource: 'none',
      };

    case 'SUB_BOOTSTRAP':
      return {
        ...state,
        subPhase: 'resolved',
        tier: action.subscription.tier,
        tierSource: 'server',
        cachedSubscription: action.subscription,
      };

    case 'LOGOUT':
      return {
        ...initialState,
        initialized: true,
        subPhase: 'resolved',
        tier: 'free',
      };

    case 'MANUAL_RETRY':
      return {
        ...state,
        authPhase: 'syncing',
        retryCount: 0,
        authError: null,
      };

    default:
      return state;
  }
}
```

### Phase 2: Collapse Duplicate Sync Paths (Days 5-6)

**Current:** 4 functions doing similar things
```
syncWithBackend()        → DELETE
syncTokenWithBackend()   → KEEP (rename to tokenSyncPipeline)
refreshToken()           → CONVERT to dispatch({ type: 'MANUAL_RETRY' })
retryTokenSync()         → CONVERT to dispatch({ type: 'MANUAL_RETRY' })
```

**After:** 1 canonical pipeline
```javascript
// Single token sync pipeline
// INVARIANT: All completion actions MUST include requestId
async function tokenSyncPipeline(user, dispatch, signal) {
  const requestId = Date.now();
  dispatch({ type: 'TOKEN_SYNC_START', requestId });

  try {
    const response = await withTimeout(
      apiClient.post('/auth/firebase-sync', { ... }, { signal }),
      8000,
      'Token sync'
    );

    dispatch({
      type: 'TOKEN_SYNC_OK',
      requestId, // REQUIRED - for staleness check
      subscription: response.data.subscription
    });
  } catch (err) {
    if (isAbortError(err)) {
      dispatch({ type: 'TOKEN_SYNC_ABORT', requestId }); // REQUIRED
    } else if (isGatewayError(err)) {
      dispatch({ type: 'TOKEN_SYNC_RETRY', requestId, error: err }); // REQUIRED
    } else {
      dispatch({ type: 'TOKEN_SYNC_FAIL', requestId, error: err }); // REQUIRED
    }
  }
}
```

### Phase 3: Migrate Contexts to Use Coordinator (Days 7-9)

**AuthContext.jsx changes:**
```javascript
// BEFORE: 52 individual useState + scattered mutations
const [user, setUser] = useState(null);
const [tokenStatus, setTokenStatus] = useState('missing');
// ... 4 more useState

// AFTER: Single useReducer
const [state, dispatch] = useReducer(authCoordinatorReducer, initialState);

// Expose same API shape for backwards compatibility
const value = useMemo(() => ({
  user: state.user,
  initialized: state.initialized,
  // Derived tokenStatus - explicit mapping for all authPhase values
  tokenStatus: (() => {
    switch (state.authPhase) {
      case 'established': return 'present';
      case 'error': return 'error';
      case 'idle':
        // idle + no user = missing (guest mode)
        // idle + user = refreshing (shouldn't happen, but handle defensively)
        return state.user ? 'refreshing' : 'missing';
      case 'syncing':
      case 'retrying':
        return 'refreshing';
      default:
        return 'missing';
    }
  })(),
  // ... derived values

  // Actions now dispatch
  logout: () => dispatch({ type: 'LOGOUT' }),
  retryTokenSync: () => dispatch({ type: 'MANUAL_RETRY' }),
}), [state]);
```

**SubscriptionContext.jsx changes:**
- Remove all state (moved to coordinator)
- Keep only paywall UI state (modal open/close)
- Import state from AuthContext or shared coordinator

### Phase 4: Add Enforcement Tests (Day 10)

```javascript
// authCoordinator.test.js

describe('Transition Validation (State Machine Enforcement)', () => {
  it('blocks invalid authPhase transitions', () => {
    const state = { ...initialState, authPhase: 'idle' };
    // Can't go directly to 'established' without syncing first
    const result = authCoordinatorReducer(state, { type: 'TOKEN_SYNC_OK', requestId: 1 });
    expect(result.authPhase).toBe('idle'); // Blocked - invalid transition
  });

  it('allows valid authPhase transitions', () => {
    let state = { ...initialState, authPhase: 'idle' };
    state = authCoordinatorReducer(state, { type: 'TOKEN_SYNC_START', requestId: 1 });
    expect(state.authPhase).toBe('syncing'); // Valid: idle → syncing

    state = authCoordinatorReducer(state, { type: 'TOKEN_SYNC_OK', requestId: 1 });
    expect(state.authPhase).toBe('established'); // Valid: syncing → established
  });

  it('blocks invalid subPhase transitions', () => {
    const state = { ...initialState, subPhase: 'resolved' };
    // Can't go to degraded from resolved (must go through loading)
    const result = authCoordinatorReducer(state, {
      type: 'SUB_FETCH_FAIL',
      requestId: 1,
      errorKind: 'GATEWAY',
      error: new Error()
    });
    expect(result.subPhase).toBe('resolved'); // Blocked
  });
});

describe('Monotonicity Rules', () => {
  it('blocks timeout overwriting server-confirmed premium', () => {
    const state = {
      ...initialState,
      tier: 'premium',
      tierSource: 'server',
      subPhase: 'resolved',
    };
    const result = authCoordinatorReducer(state, { type: 'SUB_PENDING_TIMEOUT' });
    expect(result.tier).toBe('premium'); // Not changed - monotonicity protection
  });

  it('allows server to downgrade premium to free', () => {
    const state = {
      ...initialState,
      tier: 'premium',
      tierSource: 'server',
      subPhase: 'loading', // Must be in loading state for SUB_FETCH_OK
    };
    const result = authCoordinatorReducer(state, {
      type: 'SUB_FETCH_OK',
      requestId: state.subRequestId, // Match request ID
      subscription: { tier: 'free' }
    });
    expect(result.tier).toBe('free'); // Allowed - server confirmed downgrade
  });
});

describe('Request Sequencing (Staleness Enforcement)', () => {
  it('uses separate requestIds for auth and sub domains', () => {
    let state = { ...initialState };
    state = authCoordinatorReducer(state, { type: 'TOKEN_SYNC_START', requestId: 100 });
    state = authCoordinatorReducer(state, { type: 'SUB_FETCH_START', requestId: 200 });

    expect(state.authRequestId).toBe(100);
    expect(state.subRequestId).toBe(200);
  });

  it('ignores stale auth responses', () => {
    let state = { ...initialState, authPhase: 'syncing', authRequestId: 100 };

    // Start new request (supersedes old one)
    state = authCoordinatorReducer(state, { type: 'TOKEN_SYNC_START', requestId: 200 });
    expect(state.authRequestId).toBe(200);

    // Old request completes - should be ignored
    const result = authCoordinatorReducer(state, {
      type: 'TOKEN_SYNC_OK',
      requestId: 100, // Stale!
      subscription: { tier: 'premium' }
    });
    expect(result.authPhase).toBe('syncing'); // Unchanged - stale response ignored
  });

  it('ignores stale subscription responses', () => {
    let state = { ...initialState, subPhase: 'loading', subRequestId: 100 };

    // Start new request
    state = authCoordinatorReducer(state, { type: 'SUB_FETCH_START', requestId: 200 });

    // Old request completes - should be ignored
    const result = authCoordinatorReducer(state, {
      type: 'SUB_FETCH_OK',
      requestId: 100, // Stale!
      subscription: { tier: 'premium' }
    });
    expect(result.tier).toBe('unknown'); // Unchanged - stale response ignored
  });

  it('accepts matching requestId responses', () => {
    let state = { ...initialState, subPhase: 'loading', subRequestId: 200 };

    const result = authCoordinatorReducer(state, {
      type: 'SUB_FETCH_OK',
      requestId: 200, // Matches!
      subscription: { tier: 'premium' }
    });
    expect(result.tier).toBe('premium'); // Applied - requestId matched
    expect(result.subPhase).toBe('resolved');
  });
});
```

---

## Part 5: Success Criteria

| Criterion | How to Verify | Enforcement Mechanism |
|-----------|---------------|----------------------|
| Single-writer (ALL state) | ESLint fails on `set*` calls + useState banned in contexts | `no-restricted-syntax` + `no-restricted-imports` |
| State machine (explicit) | `validateTransition()` blocks invalid phase changes | `ACTION_TO_PHASE` + `VALID_TRANSITIONS` |
| Monotonicity (enforced) | `checkMonotonicity()` blocks invalid tier changes | Returns false → state unchanged |
| Request sequencing (enforced) | `isStaleRequest()` blocks stale responses | Per-domain `authRequestId`/`subRequestId` |
| Duplicate paths collapsed | Only 1 `tokenSyncPipeline` function exists | Code review |
| No boot stuck | Every `authPhase` × `subPhase` combo has terminal path | State machine diagram |
| Audit trail | All state changes logged via reducer | `console.warn` in DEV mode |

---

## Part 6: Files Summary

### Delete
| File | Reason |
|------|--------|
| N/A | No deletions - gradual migration |

### Create
| File | Purpose |
|------|---------|
| `context/authCoordinator.js` | Unified reducer + state machine |
| `context/__tests__/authCoordinator.test.js` | Transition + monotonicity tests |

### Modify
| File | Change |
|------|--------|
| `AuthContext.jsx` | Replace 6 useState with useReducer import |
| `SubscriptionContext.jsx` | Remove state, import from coordinator |
| `.eslintrc.js` or `eslint.config.js` | Add no-restricted-syntax rule |

---

## Part 7: Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking external API | Keep same context value shape, derive from reducer state |
| Missing edge case in reducer | Extensive unit tests for all action types |
| Lint rule too aggressive | Scope to specific files with override comments |
| Performance (single reducer) | Reducer is pure, React will optimize |

---

## Summary

### What Success Looks Like

```bash
# BEFORE (current state)
$ grep -rE "set(TokenStatus|User|Initialized|Status|Subscription|Tier)" frontend/src/context/
→ 116 matches across AuthContext.jsx and SubscriptionContext.jsx

# AFTER (goal)
$ grep -rE "set(TokenStatus|User|Initialized|Status|Subscription|Tier)" frontend/src/context/
→ 0 matches (all state mutations go through dispatch())
```

### Sanity Test (All Must Be True)

| Question | Answer |
|----------|--------|
| All auth/tier/subscription writes happen in one reducer? | ✅ `authCoordinatorReducer` |
| All async completions dispatch actions, never set tier directly? | ✅ `dispatch({ type: 'SUB_FETCH_OK', ... })` |
| Timeouts are request-scoped (tied to requestId)? | ✅ `isStaleRequest()` blocks stale timeouts |
| What are the allowed transitions? | ✅ Small table: `VALID_TRANSITIONS` |
| **Plan ends with deleting code, not adding more?** | ✅ Delete 115 of 116 mutation points |

### 3 Cross-Domain Invariants (Guardrails for Known Failure Modes)

| Invariant | What It Prevents |
|-----------|------------------|
| Auth change must reset subscription | Logout leaves stale premium tier |
| Token sync OK must lead to subscription resolution | Boot deadlock (auth OK but sub pending forever) |
| Premium requires established session | Granting premium without backend-confirmed auth |

These are NOT a theorem prover - just 3 checks for the coupling points that historically cause bugs.

**Test:** Can you answer "what triggers subscription fetch after retryable token-sync error?" from:
- A single action path: `TOKEN_SYNC_RETRY` → effect schedules retry → `TOKEN_SYNC_OK` (with subscription)
- A single reducer transition: `syncing → retrying → established`
- A single invariant: "Token sync OK must lead to subscription resolution"

If yes → plan is right-sized. If no → too much deleted.

### Phase Summary

| Phase | Goal | Code Change | Status |
|-------|------|-------------|--------|
| 0. Lint rules | Prevent new mutations | +55 lines eslint config | ✅ Done |
| 1. Coordinator | Single source of truth | +200 lines new reducer | 🔲 Next |
| 2. Collapse duplicates | Remove 4 → 1 sync paths | **-150 lines deleted** | 🔲 |
| 3. Migrate contexts | Replace useState with dispatch | **-300 lines deleted** | 🔲 |
| 4. Tests | Verify transitions | +100 lines tests | 🔲 |

**Net result: ~250 lines deleted, cleaner architecture**

### Escape Hatches

- LOGOUT always works (safety)
- SubscriptionContext keeps `useState` for paywall modal (pure UI, not auth state)

**Timeline: ~10 days**
