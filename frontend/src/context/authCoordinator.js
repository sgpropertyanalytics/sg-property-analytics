/**
 * Auth Coordinator - Single-writer reducer for auth + subscription state
 *
 * Firebase-Only model: No token sync, no JWT, no cookies.
 * Firebase SDK handles auth; this reducer tracks auth state + subscription state.
 *
 * SINGLE-WRITER INVARIANT:
 * This reducer is the ONLY place auth/subscription state may be mutated.
 */

// =============================================================================
// STATE
// =============================================================================

export const initialState = {
  // Auth domain
  user: null,
  initialized: false,

  // Subscription domain
  tier: 'unknown', // unknown | free | premium
  tierSource: 'none', // none | cache | server
  subPhase: 'pending', // pending | loading | resolved | degraded
  subError: null,
  cachedSubscription: null,

  // Request sequencing
  subRequestId: null,
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
    return state;
  }

  return nextState;
}

// =============================================================================
// STALENESS CHECK
// =============================================================================

function isStaleRequest(state, action) {
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
  // Prevent timeout from overriding error or premium state
  if (action.type === 'SUB_PENDING_TIMEOUT') {
    if (state.tier === 'premium') {
      console.warn('[AuthCoordinator] Blocked: timeout cannot overwrite premium');
      return false;
    }
  }

  // Rule: Premium can only be downgraded by LOGOUT or server success (SUB_FETCH_OK)
  if (state.tier === 'premium' && action.type !== 'LOGOUT') {
    const nextTier = action.subscription?.tier;
    if (nextTier === 'free') {
      if (action.type !== 'SUB_FETCH_OK') {
        console.warn(`[AuthCoordinator] Blocked: ${action.type} cannot downgrade premium`);
        return false;
      }
    }
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
        // Logout / no user - reset everything
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
      // AUTH errors (401/403): Session invalid → block cached premium
      if (action.errorKind === 'AUTH' || action.errorKind === 'AUTH_REQUIRED') {
        return {
          ...state,
          subPhase: 'degraded',
          tierSource: 'none',
          subError: action.error,
          subRequestId: null,
        };
      }

      // GATEWAY/NETWORK errors: Keep cached premium for availability
      if (action.errorKind === 'GATEWAY' || action.errorKind === 'NETWORK') {
        return {
          ...state,
          subPhase: 'degraded',
          subError: action.error,
          subRequestId: null,
        };
      }

      // Other errors: depends on current tier
      if (state.tier === 'premium') {
        return {
          ...state,
          subPhase: 'degraded',
          subError: action.error,
          subRequestId: null,
        };
      }
      return {
        ...state,
        subPhase: 'resolved',
        tier: 'free',
        tierSource: 'none',
        subError: action.error,
        subRequestId: null,
      };

    case 'SUB_FETCH_ABORT':
      if (state.subPhase === 'loading') {
        return {
          ...state,
          subPhase: 'degraded',
          subRequestId: null,
        };
      }
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
        tierSource: 'timeout',
      };

    case 'SUB_CACHE_LOAD':
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

    default:
      return state;
  }
}
