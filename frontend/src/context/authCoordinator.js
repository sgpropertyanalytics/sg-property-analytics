/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    SINGLE-WRITER INVARIANT - READ FIRST                   ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  This reducer is the ONLY place auth/subscription state may be mutated.  ║
 * ║                                                                           ║
 * ║  DO NOT:                                                                  ║
 * ║  - Add useState for auth/tier/subscription in any context                 ║
 * ║  - Add new mutation paths outside this reducer                            ║
 * ║  - Bypass dispatch() with direct state manipulation                       ║
 * ║                                                                           ║
 * ║  ANY change here is HIGH BLAST RADIUS. Get review from auth owner.        ║
 * ║                                                                           ║
 * ║  @see docs/AUTH_DECISION_FRAMEWORK.md (evaluation criteria)               ║
 * ║  @see docs/plans/2026-01-14-auth-single-writer-framework.md               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// =============================================================================
// STATE
// =============================================================================

export const initialState = {
  // Auth domain
  user: null,
  authPhase: 'idle', // idle | syncing | established | retrying | error
  authError: null,
  initialized: false,

  // Subscription domain
  tier: 'unknown', // unknown | free | premium
  tierSource: 'none', // none | cache | server
  subPhase: 'pending', // pending | loading | resolved | degraded
  subError: null,
  cachedSubscription: null,

  // Request sequencing (per-domain)
  authRequestId: null,
  subRequestId: null,
  retryCount: 0,
};

// =============================================================================
// REDUCER
// =============================================================================

export function authCoordinatorReducer(state, action) {
  // 1. Staleness check - ignore responses from superseded requests
  if (isStaleRequest(state, action)) {
    return state;
  }

  // 2. Monotonicity check - prevent invalid tier downgrades
  if (!checkMonotonicity(state, action)) {
    return state;
  }

  // 3. Dev logging
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AuthCoordinator]', action.type, action);
  }

  // 4. Compute next state
  const nextState = computeNextState(state, action);

  // 5. Post-check: initialized monotonicity (false → true only)
  if (state.initialized && !nextState.initialized) {
    console.error('[AuthCoordinator] INVARIANT VIOLATION: initialized went true → false');
    return state; // Block the transition
  }

  return nextState;
}

// =============================================================================
// STALENESS CHECK
// =============================================================================

function isStaleRequest(state, action) {
  // Auth domain: Only OK/FAIL/TIMEOUT need requestId (they're async completions)
  // RETRY/ABORT are dispatched synchronously from the same flow, no requestId needed
  const authCompletions = ['TOKEN_SYNC_OK', 'TOKEN_SYNC_FAIL', 'TOKEN_SYNC_TIMEOUT'];
  if (authCompletions.includes(action.type)) {
    if (action.requestId == null) {
      console.error(`[AuthCoordinator] ${action.type} missing requestId`);
      return true;
    }
    if (state.authRequestId !== action.requestId) {
      console.warn(`[AuthCoordinator] Stale auth: ${action.requestId} != ${state.authRequestId}`);
      return true;
    }
  }

  // Sub domain: Only OK/FAIL need requestId
  const subCompletions = ['SUB_FETCH_OK', 'SUB_FETCH_FAIL'];
  if (subCompletions.includes(action.type)) {
    if (action.requestId == null) {
      console.error(`[AuthCoordinator] ${action.type} missing requestId`);
      return true;
    }
    if (state.subRequestId !== action.requestId) {
      console.warn(`[AuthCoordinator] Stale sub: ${action.requestId} != ${state.subRequestId}`);
      return true;
    }
  }

  return false;
}

// =============================================================================
// MONOTONICITY CHECK
// =============================================================================

function checkMonotonicity(state, action) {
  // Rule: Premium cannot be overwritten by timeout
  if (state.tier === 'premium' && action.type === 'SUB_PENDING_TIMEOUT') {
    console.warn('[AuthCoordinator] Blocked: timeout cannot overwrite premium');
    return false;
  }

  // Rule: Premium can only be downgraded by LOGOUT or server success (SUB_FETCH_OK/TOKEN_SYNC_OK)
  // SUB_FETCH_FAIL with auth errors would set tier:'free' in reducer - block that for premium users
  if (state.tier === 'premium' && action.type !== 'LOGOUT') {
    // Check explicit tier in action.subscription
    const nextTier = action.subscription?.tier;
    if (nextTier === 'free') {
      const isServerSuccess = action.type === 'SUB_FETCH_OK' || action.type === 'TOKEN_SYNC_OK';
      if (!isServerSuccess) {
        console.warn(`[AuthCoordinator] Blocked: ${action.type} cannot downgrade premium`);
        return false;
      }
    }

    // NOTE: SUB_FETCH_FAIL is NOT blocked here - reducer handles premium case by going to 'degraded'
    // This preserves BOTH monotonicity (tier stays premium) AND convergence (subPhase reaches terminal)
  }

  return true;
}

// =============================================================================
// STATE TRANSITIONS
// =============================================================================

function computeNextState(state, action) {
  switch (action.type) {
    // -------------------------------------------------------------------------
    // AUTH DOMAIN
    // -------------------------------------------------------------------------
    case 'FIREBASE_USER_CHANGED':
      if (!action.user) {
        // Logout - reset everything
        return {
          ...initialState,
          initialized: true,
          subPhase: 'resolved',
          tier: 'free',
          tierSource: 'none',
        };
      }
      return {
        ...state,
        user: action.user,
        initialized: true,
      };

    case 'TOKEN_SYNC_START':
      return {
        ...state,
        authPhase: 'syncing',
        authRequestId: action.requestId,
      };

    case 'TOKEN_SYNC_OK':
      return {
        ...state,
        authPhase: 'established',
        authError: null,
        retryCount: 0,
        authRequestId: null,
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
        authRequestId: null,
      };

    case 'TOKEN_SYNC_ABORT':
      return {
        ...state,
        authPhase: state.retryCount > 0 ? 'retrying' : 'idle',
        authRequestId: null,
      };

    // -------------------------------------------------------------------------
    // SUBSCRIPTION DOMAIN
    // -------------------------------------------------------------------------
    case 'SUB_FETCH_START':
      return {
        ...state,
        subPhase: 'loading',
        subRequestId: action.requestId,
      };

    case 'SUB_FETCH_OK':
      return {
        ...state,
        subPhase: 'resolved',
        tier: action.subscription.tier,
        tierSource: 'server',
        cachedSubscription: action.subscription,
        subError: null,
        subRequestId: null,
      };

    case 'SUB_FETCH_FAIL':
      // =========================================================================
      // OPTION C: Split handling for auth vs gateway errors
      // - Gateway/network: fail-open (keep cached premium for availability)
      // - Auth errors: fail-closed (block cached premium for entitlement safety)
      // =========================================================================

      // AUTH errors (401/403): Session invalid → block cached premium immediately
      // Set tierSource='none' so hasCachedPremium becomes false
      if (action.errorKind === 'AUTH' || action.errorKind === 'AUTH_REQUIRED') {
        return {
          ...state,
          subPhase: 'degraded',
          tierSource: 'none', // KEY: Blocks hasCachedPremium derivation
          subError: action.error,
          subRequestId: null,
          // tier preserved as last-known, but won't grant access without tierSource
        };
      }

      // GATEWAY/NETWORK errors (502/503/504, timeouts): Backend unreliable
      // Keep cached premium for availability (fail-open)
      if (action.errorKind === 'GATEWAY' || action.errorKind === 'NETWORK') {
        return {
          ...state,
          subPhase: 'degraded',
          subError: action.error,
          subRequestId: null,
          // tierSource unchanged → hasCachedPremium still works
        };
      }

      // Other errors (404, 500): Depends on current tier
      if (state.tier === 'premium') {
        // Premium users: degraded, keep cache (treat like gateway for availability)
        return {
          ...state,
          subPhase: 'degraded',
          subError: action.error,
          subRequestId: null,
        };
      }
      // Non-premium: resolve to free
      return {
        ...state,
        subPhase: 'resolved',
        tier: 'free',
        tierSource: 'none',
        subError: action.error,
        subRequestId: null,
      };

    case 'SUB_FETCH_ABORT':
      // P0 FIX: Abort must reach terminal state (convergence invariant)
      // If we were loading, transition to degraded so boot can complete
      // Keep tier/tierSource unchanged (abort is not an error signal)
      if (state.subPhase === 'loading') {
        return {
          ...state,
          subPhase: 'degraded',
          subRequestId: null, // Clear so future fetches aren't blocked
        };
      }
      // If not loading (e.g., pending), just clear requestId
      return {
        ...state,
        subRequestId: null,
      };

    case 'SUB_PENDING_TIMEOUT':
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

    case 'SUB_CACHE_LOAD':
      // Load from localStorage - tierSource: 'cache' until server confirms
      return {
        ...state,
        subPhase: 'resolved',
        tier: action.subscription.tier,
        tierSource: 'cache',
        cachedSubscription: action.subscription,
      };

    // -------------------------------------------------------------------------
    // USER ACTIONS
    // -------------------------------------------------------------------------
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

// =============================================================================
// DERIVED STATE HELPERS
// =============================================================================

/**
 * Derive tokenStatus from authPhase (backwards compatibility)
 */
export function deriveTokenStatus(authPhase, user, initialized) {
  switch (authPhase) {
    case 'established':
      return 'present';
    case 'error':
      return 'error';
    case 'syncing':
    case 'retrying':
      return 'refreshing';
    case 'idle':
    default:
      // Guest mode (no user + initialized) = no sync needed = present
      if (!user && initialized) return 'present';
      // User exists but not synced = need sync
      if (user) return 'missing';
      // Not initialized yet = missing
      return 'missing';
  }
}

/**
 * Derive subscriptionStatus from subPhase (backwards compatibility)
 */
export function deriveSubscriptionStatus(subPhase) {
  switch (subPhase) {
    case 'resolved':
      return 'RESOLVED';
    case 'degraded':
      return 'DEGRADED';
    case 'loading':
      return 'LOADING';
    case 'pending':
    default:
      return 'PENDING';
  }
}
