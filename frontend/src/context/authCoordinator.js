/**
 * Auth Coordinator - Single-writer reducer for auth + access state
 *
 * Firebase-Only model: No token sync, no JWT, no cookies.
 * Firebase SDK handles auth; this reducer tracks auth state + access state.
 *
 * SINGLE-WRITER INVARIANT:
 * This reducer is the ONLY place auth/access state may be mutated.
 */

// =============================================================================
// STATE
// =============================================================================

export const initialState = {
  // Auth domain
  user: null,
  initialized: false,

  // Access domain (neutral naming)
  accessLevel: 'unknown', // unknown | anonymous | authenticated
  accessSource: 'none', // none | cache | server | timeout

  // Legacy aliases for backward compatibility
  tier: 'unknown',
  tierSource: 'none',

  subPhase: 'pending', // pending | loading | resolved | degraded
  subError: null,
  cachedSubscription: null,

  // Request sequencing
  subRequestId: null,
};

const LEGACY_ACCESS_MAP = {
  unknown: 'unknown',
  free: 'authenticated',
  premium: 'authenticated',
  authenticated: 'authenticated',
  anonymous: 'anonymous',
};

function normalizeAccessLevel(value) {
  if (!value) return 'unknown';
  return LEGACY_ACCESS_MAP[value] || 'unknown';
}

function withLegacyAliases(nextState) {
  let normalizedAccessLevel = nextState.accessLevel;
  let normalizedAccessSource = nextState.accessSource;

  if (normalizedAccessLevel === undefined && nextState.tier !== undefined) {
    normalizedAccessLevel = normalizeAccessLevel(nextState.tier);
  }
  if (normalizedAccessSource === undefined && nextState.tierSource !== undefined) {
    normalizedAccessSource = nextState.tierSource;
  }

  normalizedAccessLevel = normalizeAccessLevel(normalizedAccessLevel ?? 'unknown');
  normalizedAccessSource = normalizedAccessSource ?? 'none';

  // Keep legacy keys stable during migration to neutral naming.
  return {
    ...nextState,
    accessLevel: normalizedAccessLevel,
    accessSource: normalizedAccessSource,
    tier: normalizedAccessLevel === 'authenticated' ? 'free' : normalizedAccessLevel,
    tierSource: normalizedAccessSource,
  };
}

function getActionAccessLevel(action) {
  const raw = action.subscription?.accessLevel ?? action.subscription?.tier;
  return normalizeAccessLevel(raw);
}

// =============================================================================
// REDUCER
// =============================================================================

export function authCoordinatorReducer(state, action) {
  const normalizedState = withLegacyAliases(state);

  // 1. Staleness check - ignore responses from superseded requests
  if (isStaleRequest(normalizedState, action)) {
    return normalizedState;
  }

  // 2. Monotonicity check - prevent invalid access regressions
  if (!checkMonotonicity(normalizedState, action)) {
    return normalizedState;
  }

  // 3. Dev logging
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AuthCoordinator]', action.type, action);
  }

  // 4. Compute next state
  const nextState = withLegacyAliases(computeNextState(normalizedState, action));

  // 5. Post-check: initialized monotonicity (false → true only)
  if (normalizedState.initialized && !nextState.initialized) {
    console.error('[AuthCoordinator] INVARIANT VIOLATION: initialized went true → false');
    return normalizedState;
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
  // Prevent timeout from overriding already-resolved authenticated access.
  if (action.type === 'SUB_PENDING_TIMEOUT') {
    if (state.accessLevel === 'authenticated') {
      console.warn('[AuthCoordinator] Blocked: timeout cannot overwrite authenticated access');
      return false;
    }
  }

  // Rule: authenticated access can only be downgraded by LOGOUT or server success.
  if (state.accessLevel === 'authenticated' && action.type !== 'LOGOUT') {
    const nextAccessLevel = getActionAccessLevel(action);
    if (nextAccessLevel === 'anonymous') {
      if (action.type !== 'SUB_FETCH_OK') {
        console.warn(`[AuthCoordinator] Blocked: ${action.type} cannot downgrade authenticated access`);
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
          accessLevel: 'anonymous',
          accessSource: 'none',
        };
      }
      return {
        ...state,
        user: action.user,
        initialized: true,
      };

    // -------------------------------------------------------------------------
    // ACCESS DOMAIN
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
        accessLevel: getActionAccessLevel(action),
        accessSource: 'server',
        cachedSubscription: action.subscription,
        subError: null,
        subRequestId: null,
      };

    case 'SUB_FETCH_FAIL':
      // AUTH errors (401/403): session invalid -> block cached access source.
      if (action.errorKind === 'AUTH' || action.errorKind === 'AUTH_REQUIRED') {
        return {
          ...state,
          subPhase: 'degraded',
          accessSource: 'none',
          subError: action.error,
          subRequestId: null,
        };
      }

      // GATEWAY/NETWORK errors: preserve last-known access level for availability.
      if (action.errorKind === 'GATEWAY' || action.errorKind === 'NETWORK') {
        return {
          ...state,
          subPhase: 'degraded',
          subError: action.error,
          subRequestId: null,
        };
      }

      if (state.accessLevel === 'authenticated') {
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
        accessLevel: 'anonymous',
        accessSource: 'none',
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
        accessLevel: 'anonymous',
        accessSource: 'timeout',
      };

    case 'SUB_CACHE_LOAD':
      return {
        ...state,
        subPhase: 'resolved',
        accessLevel: getActionAccessLevel(action),
        accessSource: 'cache',
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
        accessLevel: 'anonymous',
        accessSource: 'none',
      };

    default:
      return state;
  }
}
