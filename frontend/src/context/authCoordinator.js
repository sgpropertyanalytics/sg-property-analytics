/**
 * Auth Coordinator - Single-writer reducer for auth + access state
 */

export const initialState = {
  user: null,
  initialized: false,

  accessLevel: 'unknown', // unknown | anonymous | authenticated
  accessSource: 'none', // none | cache | server | timeout

  accessPhase: 'pending', // pending | loading | resolved | degraded
  accessError: null,
  cachedAccess: null,

  accessRequestId: null,
};

function normalizeAccessLevel(value) {
  if (value === 'authenticated' || value === 'anonymous' || value === 'unknown') return value;
  return 'unknown';
}

function getActionAccessLevel(action) {
  return normalizeAccessLevel(action.access?.accessLevel);
}

export function authCoordinatorReducer(state, action) {
  if (isStaleRequest(state, action)) {
    return state;
  }

  if (!checkMonotonicity(state, action)) {
    return state;
  }

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('[AuthCoordinator]', action.type, action);
  }

  const nextState = computeNextState(state, action);

  if (state.initialized && !nextState.initialized) {
    console.error('[AuthCoordinator] INVARIANT VIOLATION: initialized went true → false');
    return state;
  }

  return nextState;
}

function isStaleRequest(state, action) {
  const subCompletions = ['ACCESS_FETCH_OK', 'ACCESS_FETCH_FAIL'];
  if (subCompletions.includes(action.type)) {
    if (action.requestId == null) {
      console.error(`[AuthCoordinator] ${action.type} missing requestId`);
      return true;
    }
    if (state.accessRequestId !== action.requestId) {
      console.warn(`[AuthCoordinator] Stale access: ${action.requestId} != ${state.accessRequestId}`);
      return true;
    }
  }

  return false;
}

function checkMonotonicity(state, action) {
  if (action.type === 'ACCESS_PENDING_TIMEOUT' && state.accessLevel === 'authenticated') {
    console.warn('[AuthCoordinator] Blocked: timeout cannot overwrite authenticated access');
    return false;
  }

  if (state.accessLevel === 'authenticated' && action.type !== 'LOGOUT') {
    const nextAccessLevel = getActionAccessLevel(action);
    if (nextAccessLevel === 'anonymous' && action.type !== 'ACCESS_FETCH_OK') {
      console.warn(`[AuthCoordinator] Blocked: ${action.type} cannot downgrade authenticated access`);
      return false;
    }
  }

  return true;
}

function computeNextState(state, action) {
  switch (action.type) {
    case 'FIREBASE_USER_CHANGED':
      if (!action.user) {
        return {
          ...initialState,
          initialized: true,
          accessPhase: 'resolved',
          accessLevel: 'anonymous',
          accessSource: 'none',
        };
      }
      return {
        ...state,
        user: action.user,
        initialized: true,
      };

    case 'ACCESS_FETCH_START':
      return {
        ...state,
        accessPhase: 'loading',
        accessRequestId: action.requestId,
      };

    case 'ACCESS_FETCH_OK':
      return {
        ...state,
        accessPhase: 'resolved',
        accessLevel: getActionAccessLevel(action),
        accessSource: 'server',
        cachedAccess: action.access,
        accessError: null,
        accessRequestId: null,
      };

    case 'ACCESS_FETCH_FAIL':
      if (action.errorKind === 'AUTH' || action.errorKind === 'AUTH_REQUIRED') {
        return {
          ...state,
          accessPhase: 'degraded',
          accessSource: 'none',
          accessError: action.error,
          accessRequestId: null,
        };
      }

      if (action.errorKind === 'GATEWAY' || action.errorKind === 'NETWORK') {
        return {
          ...state,
          accessPhase: 'degraded',
          accessError: action.error,
          accessRequestId: null,
        };
      }

      if (state.accessLevel === 'authenticated') {
        return {
          ...state,
          accessPhase: 'degraded',
          accessError: action.error,
          accessRequestId: null,
        };
      }

      return {
        ...state,
        accessPhase: 'resolved',
        accessLevel: 'anonymous',
        accessSource: 'none',
        accessError: action.error,
        accessRequestId: null,
      };

    case 'ACCESS_FETCH_ABORT':
      if (state.accessPhase === 'loading') {
        return {
          ...state,
          accessPhase: 'degraded',
          accessRequestId: null,
        };
      }
      return {
        ...state,
        accessRequestId: null,
      };

    case 'ACCESS_PENDING_TIMEOUT':
      if (state.accessPhase !== 'pending') return state;
      return {
        ...state,
        accessPhase: 'resolved',
        accessLevel: 'anonymous',
        accessSource: 'timeout',
      };

    case 'ACCESS_CACHE_LOAD':
      return {
        ...state,
        accessPhase: 'resolved',
        accessLevel: getActionAccessLevel(action),
        accessSource: 'cache',
        cachedAccess: action.access,
      };

    case 'LOGOUT':
      return {
        ...initialState,
        initialized: true,
        accessPhase: 'resolved',
        accessLevel: 'anonymous',
        accessSource: 'none',
      };

    default:
      return state;
  }
}
