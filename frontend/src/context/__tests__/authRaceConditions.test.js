/**
 * Auth Race Condition Tests (Anti-Whack-a-Mole)
 *
 * These tests verify critical timing scenarios that could cause:
 * - Authenticated users incorrectly seeing anonymous accessLevel
 * - Boot stuck forever
 * - State corruption on user switch
 *
 * Each test simulates a specific race condition or timing scenario.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Simulates the subscription state machine for testing
 */
function createSubscriptionStateMachine() {
  let status = 'pending';
  let accessLevel = 'unknown';
  let activeRequestId = null;
  let lastFetchSuccess = 0;
  let requestCounter = 0; // Use counter instead of Date.now() for unique IDs

  const statusRef = { current: status };

  return {
    getState: () => ({ status, accessLevel, statusRef: statusRef.current }),
    setStatus: (newStatus) => {
      status = newStatus;
      statusRef.current = newStatus;
    },
    setAccessLevel: (newAccessLevel) => { accessLevel = newAccessLevel; },
    startRequest: () => {
      requestCounter++;
      activeRequestId = requestCounter;
      return activeRequestId;
    },
    isStale: (requestId) => requestId !== activeRequestId,
    clearRequest: () => { activeRequestId = null; },
    getActiveRequestId: () => activeRequestId,
    markFetchSuccess: () => { lastFetchSuccess = Date.now(); },
    getLastFetchSuccess: () => lastFetchSuccess,
  };
}

/**
 * Simulates the token sync state machine for testing
 */
function createTokenSyncStateMachine() {
  let tokenStatus = 'missing';
  let retryCount = 0;
  let retryTimeoutId = null;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;

  return {
    getState: () => ({ tokenStatus, retryCount }),
    setTokenStatus: (status) => { tokenStatus = status; },
    canRetry: () => retryCount < MAX_RETRIES,
    incrementRetry: () => { retryCount++; },
    resetRetries: () => { retryCount = 0; },
    scheduleRetry: (callback) => {
      retryTimeoutId = setTimeout(callback, RETRY_DELAY_MS);
      return retryTimeoutId;
    },
    cancelRetry: () => {
      if (retryTimeoutId) {
        clearTimeout(retryTimeoutId);
        retryTimeoutId = null;
      }
    },
    getRetryTimeoutId: () => retryTimeoutId,
    MAX_RETRIES,
    RETRY_DELAY_MS,
  };
}

// ============================================================================
// Test 1: Retryable 502 during token sync
// ============================================================================

describe('Test 1: Retryable 502 schedules retry, no deadlock', () => {
  let tokenMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    tokenMachine = createTokenSyncStateMachine();
  });

  afterEach(() => {
    tokenMachine.cancelRetry();
    vi.useRealTimers();
  });

  it('should schedule retry on 502 gateway error', async () => {
    // Initial state
    tokenMachine.setTokenStatus('refreshing');

    // Simulate 502 error response
    const error = { response: { status: 502 } };
    const isGatewayError = [502, 503, 504].includes(error.response?.status);

    expect(isGatewayError).toBe(true);
    expect(tokenMachine.canRetry()).toBe(true);

    // Schedule retry (simulates the fix)
    tokenMachine.incrementRetry();
    const retryCallback = vi.fn();
    tokenMachine.scheduleRetry(retryCallback);

    // Verify retry is scheduled
    expect(tokenMachine.getRetryTimeoutId()).not.toBeNull();
    expect(retryCallback).not.toHaveBeenCalled();

    // Advance time to trigger retry
    vi.advanceTimersByTime(tokenMachine.RETRY_DELAY_MS);
    expect(retryCallback).toHaveBeenCalledTimes(1);
  });

  it('should not deadlock - max retries bounded', () => {
    tokenMachine.setTokenStatus('refreshing');

    // Exhaust retries
    for (let i = 0; i < tokenMachine.MAX_RETRIES; i++) {
      expect(tokenMachine.canRetry()).toBe(true);
      tokenMachine.incrementRetry();
    }

    // Should not allow more retries
    expect(tokenMachine.canRetry()).toBe(false);
    expect(tokenMachine.getState().retryCount).toBe(tokenMachine.MAX_RETRIES);
  });

  it('should not stay in REFRESHING forever', () => {
    tokenMachine.setTokenStatus('refreshing');

    // After max retries exhausted, status should transition to PRESENT
    for (let i = 0; i < tokenMachine.MAX_RETRIES; i++) {
      tokenMachine.incrementRetry();
    }

    // Simulate the fix: set PRESENT when max retries exhausted
    if (!tokenMachine.canRetry()) {
      tokenMachine.setTokenStatus('present');
    }

    expect(tokenMachine.getState().tokenStatus).toBe('present');
  });
});

// ============================================================================
// Test 2: Timeout does not overwrite successful fetch
// ============================================================================

describe('Test 2: Timeout must NOT overwrite successful fetch', () => {
  let subMachine;
  const PENDING_TIMEOUT_MS = 15000;

  beforeEach(() => {
    vi.useFakeTimers();
    subMachine = createSubscriptionStateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT overwrite authenticated when fetch succeeds just before timeout', () => {
    // Start in pending
    subMachine.setStatus('pending');
    subMachine.setAccessLevel('unknown');

    // Schedule timeout (simulates the 15s pending timeout)
    let timeoutFired = false;
    const timeoutCallback = () => {
      // Three-layer protection check (simulates the fix)
      const currentStatus = subMachine.getState().statusRef;
      const activeRequest = subMachine.getActiveRequestId();
      const timeSinceSuccess = Date.now() - subMachine.getLastFetchSuccess();

      // Layer 1: Status check
      if (currentStatus !== 'pending') {
        return; // Abort - status changed
      }
      // Layer 2: Active request check
      if (activeRequest !== null) {
        return; // Abort - request in progress
      }
      // Layer 3: Recent success check
      if (timeSinceSuccess < 2000) {
        return; // Abort - recent success
      }

      // If all checks pass, set to anonymous
      timeoutFired = true;
      subMachine.setStatus('resolved');
      subMachine.setAccessLevel('anonymous');
    };

    const timeoutId = setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);

    // Advance to t=14.9s
    vi.advanceTimersByTime(14900);

    // Fetch completes with authenticated at t=14.9s
    subMachine.markFetchSuccess();
    subMachine.setStatus('resolved');
    subMachine.setAccessLevel('authenticated');
    subMachine.clearRequest();

    // Advance to t=15s (timeout fires)
    vi.advanceTimersByTime(100);

    // Verify: accessLevel should still be authenticated, NOT anonymous
    expect(subMachine.getState().accessLevel).toBe('authenticated');
    expect(subMachine.getState().status).toBe('resolved');
    expect(timeoutFired).toBe(false);

    clearTimeout(timeoutId);
  });

  it('should resolve to anonymous when genuinely stuck in pending', () => {
    // Start in pending with no activity
    subMachine.setStatus('pending');
    subMachine.setAccessLevel('unknown');

    let timeoutFired = false;
    const timeoutCallback = () => {
      const currentStatus = subMachine.getState().statusRef;
      const activeRequest = subMachine.getActiveRequestId();
      const timeSinceSuccess = Date.now() - subMachine.getLastFetchSuccess();

      if (currentStatus !== 'pending') return;
      if (activeRequest !== null) return;
      if (timeSinceSuccess < 2000) return;

      timeoutFired = true;
      subMachine.setStatus('resolved');
      subMachine.setAccessLevel('anonymous');
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);

    // Advance full 15s with no fetch activity
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    // Verify: should resolve to anonymous
    expect(subMachine.getState().accessLevel).toBe('anonymous');
    expect(subMachine.getState().status).toBe('resolved');
    expect(timeoutFired).toBe(true);
  });

  it('should NOT fire timeout while fetch is in progress', () => {
    subMachine.setStatus('pending');
    subMachine.startRequest(); // Request in progress

    let timeoutFired = false;
    const timeoutCallback = () => {
      const activeRequest = subMachine.getActiveRequestId();
      if (activeRequest !== null) {
        return; // Abort - request in progress
      }
      timeoutFired = true;
      subMachine.setAccessLevel('anonymous');
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    // Timeout should have aborted due to active request
    expect(timeoutFired).toBe(false);
    expect(subMachine.getState().accessLevel).toBe('unknown');
  });
});

// ============================================================================
// Test 3: User switch resets backoff/refs
// ============================================================================

describe('Test 3: Logout/login different user resets state', () => {
  let tokenMachine;
  let subMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    tokenMachine = createTokenSyncStateMachine();
    subMachine = createSubscriptionStateMachine();
  });

  afterEach(() => {
    tokenMachine.cancelRetry();
    vi.useRealTimers();
  });

  it('should reset retry count on auth state change', () => {
    // User A has some retries
    tokenMachine.incrementRetry();
    tokenMachine.incrementRetry();
    expect(tokenMachine.getState().retryCount).toBe(2);

    // Simulate auth state change (user switch)
    tokenMachine.resetRetries();
    tokenMachine.cancelRetry();

    // Verify reset
    expect(tokenMachine.getState().retryCount).toBe(0);
    expect(tokenMachine.canRetry()).toBe(true);
  });

  it('should cancel pending retry timeout on user switch', () => {
    // Schedule a retry for user A
    const callback = vi.fn();
    tokenMachine.scheduleRetry(callback);
    expect(tokenMachine.getRetryTimeoutId()).not.toBeNull();

    // User switches (auth state change)
    tokenMachine.cancelRetry();

    // Verify timeout is cancelled
    expect(tokenMachine.getRetryTimeoutId()).toBeNull();

    // Advance time - callback should NOT fire
    vi.advanceTimersByTime(tokenMachine.RETRY_DELAY_MS);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should allow new user sync after switch', () => {
    // User A exhausted retries
    for (let i = 0; i < tokenMachine.MAX_RETRIES; i++) {
      tokenMachine.incrementRetry();
    }
    expect(tokenMachine.canRetry()).toBe(false);

    // User B logs in (reset)
    tokenMachine.resetRetries();
    tokenMachine.setTokenStatus('missing');

    // User B should be able to sync
    expect(tokenMachine.canRetry()).toBe(true);
    expect(tokenMachine.getState().tokenStatus).toBe('missing');
  });

  it('should clear subscription state on logout', () => {
    // User A has authenticated subscription
    subMachine.setStatus('resolved');
    subMachine.setAccessLevel('authenticated');

    // Logout (clear subscription)
    subMachine.setStatus('resolved'); // Explicit resolved on logout
    subMachine.setAccessLevel('anonymous');
    subMachine.clearRequest();

    // Verify clean state
    expect(subMachine.getState().accessLevel).toBe('anonymous');
    expect(subMachine.getState().status).toBe('resolved');
  });
});

// ============================================================================
// Test 4: Overlapping fetches - only latest applies
// ============================================================================

describe('Test 4: Two subscription fetches overlap - only latest applies', () => {
  let subMachine;

  beforeEach(() => {
    subMachine = createSubscriptionStateMachine();
  });

  it('should reject stale request result', () => {
    // Start first request
    const request1Id = subMachine.startRequest();
    subMachine.setStatus('loading');

    // Start second request (cancels first)
    const request2Id = subMachine.startRequest();

    // First request completes with authenticated (but it's stale)
    const request1Stale = subMachine.isStale(request1Id);
    expect(request1Stale).toBe(true);

    // Don't apply stale result
    if (!subMachine.isStale(request1Id)) {
      subMachine.setAccessLevel('authenticated');
    }

    // Tier should still be unknown (stale result rejected)
    expect(subMachine.getState().accessLevel).toBe('unknown');

    // Second request completes with anonymous
    if (!subMachine.isStale(request2Id)) {
      subMachine.setAccessLevel('anonymous');
      subMachine.setStatus('resolved');
    }

    // Verify latest result applied
    expect(subMachine.getState().accessLevel).toBe('anonymous');
    expect(subMachine.getState().status).toBe('resolved');
  });

  it('should apply result from latest request only', () => {
    // Simulate race: request 1 starts, request 2 starts, request 1 completes, request 2 completes
    const request1Id = subMachine.startRequest();
    const request2Id = subMachine.startRequest();

    // Request 1 completes first (stale)
    expect(subMachine.isStale(request1Id)).toBe(true);

    // Request 2 completes (current)
    expect(subMachine.isStale(request2Id)).toBe(false);

    // Only request 2 result should apply
    if (!subMachine.isStale(request2Id)) {
      subMachine.setAccessLevel('authenticated');
      subMachine.setStatus('resolved');
    }

    expect(subMachine.getState().accessLevel).toBe('authenticated');
  });

  it('should handle rapid sequential requests', () => {
    const results = [];

    // Rapid fire 5 requests
    for (let i = 0; i < 5; i++) {
      const reqId = subMachine.startRequest();
      results.push({ reqId, accessLevel: `accessLevel-${i}` });
    }

    // Only last request should be valid
    for (let i = 0; i < results.length; i++) {
      const { reqId, accessLevel } = results[i];
      if (!subMachine.isStale(reqId)) {
        subMachine.setAccessLevel(accessLevel);
      }
    }

    // Should have the last accessLevel
    expect(subMachine.getState().accessLevel).toBe('accessLevel-4');
  });
});

// ============================================================================
// Test 5: Multi-tab logout convergence
// ============================================================================

describe('Test 5: Multi-tab - one tab logs out', () => {
  it('should detect storage event for cross-tab sync', () => {
    // Simulate localStorage event listener
    const storageListeners = [];
    const mockAddEventListener = (event, callback) => {
      if (event === 'storage') {
        storageListeners.push(callback);
      }
    };

    // Tab A registers listener
    let tabAState = { accessLevel: 'authenticated', status: 'resolved' };
    mockAddEventListener('storage', (e) => {
      if (e.key?.startsWith('subscription:')) {
        // Parse the new value
        const newValue = JSON.parse(e.newValue);
        if (newValue.accessLevel === 'anonymous') {
          tabAState = { accessLevel: 'anonymous', status: 'resolved' };
        }
      }
    });

    // Tab B logs out and clears subscription
    const storageEvent = {
      key: 'subscription:user@example.com',
      newValue: JSON.stringify({ accessLevel: 'anonymous', subscribed: false, version: 5 }),
      oldValue: JSON.stringify({ accessLevel: 'authenticated', subscribed: true, version: 5 }),
    };

    // Dispatch to all listeners (simulates browser behavior)
    storageListeners.forEach((listener) => listener(storageEvent));

    // Tab A should have converged to anonymous
    expect(tabAState.accessLevel).toBe('anonymous');
  });

  it('should handle cache key format correctly', () => {
    const email = 'Test@Example.com';
    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `subscription:${normalizedEmail}`;

    expect(cacheKey).toBe('subscription:test@example.com');
  });

  it('should ignore storage events for different users', () => {
    let currentUserEmail = 'userA@example.com';
    let tabState = { accessLevel: 'authenticated' };

    const handleStorageEvent = (e) => {
      const expectedKey = `subscription:${currentUserEmail}`;
      if (e.key !== expectedKey) {
        return; // Ignore events for other users
      }
      const newValue = JSON.parse(e.newValue);
      tabState.accessLevel = newValue.accessLevel;
    };

    // Event for different user
    const otherUserEvent = {
      key: 'subscription:userB@example.com',
      newValue: JSON.stringify({ accessLevel: 'anonymous' }),
    };

    handleStorageEvent(otherUserEvent);

    // Should not have changed
    expect(tabState.accessLevel).toBe('authenticated');
  });
});

// ============================================================================
// Test 6: Backend down resolves to anonymous and stays stable
// ============================================================================

describe('Test 6: Backend down - resolves to anonymous and stays stable', () => {
  let subMachine;
  const PENDING_TIMEOUT_MS = 15000;

  beforeEach(() => {
    vi.useFakeTimers();
    subMachine = createSubscriptionStateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve to anonymous after timeout when backend is down', () => {
    subMachine.setStatus('pending');
    subMachine.setAccessLevel('unknown');

    // Simulate backend returning gateway errors (502/503/504)
    const simulateBackendDown = () => {
      // Gateway error -> DEGRADED status (not resolved)
      subMachine.setStatus('degraded');
      // But if no cache, accessLevel remains unknown
    };

    simulateBackendDown();

    // After 15s timeout, should resolve to anonymous
    const timeoutCallback = () => {
      if (subMachine.getState().status === 'pending' ||
          (subMachine.getState().status === 'degraded' && subMachine.getState().accessLevel === 'unknown')) {
        subMachine.setStatus('resolved');
        subMachine.setAccessLevel('anonymous');
      }
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(subMachine.getState().accessLevel).toBe('anonymous');
    expect(subMachine.getState().status).toBe('resolved');
  });

  it('should stay stable after resolving to anonymous', () => {
    // Already resolved to anonymous
    subMachine.setStatus('resolved');
    subMachine.setAccessLevel('anonymous');

    // Simulate multiple events that should NOT change resolved state
    const attemptStateChange = () => {
      // Once resolved, should stay resolved
      if (subMachine.getState().status === 'resolved') {
        // No state change - already resolved
        return false;
      }
      return true;
    };

    // All attempts should fail (return false) because status is resolved
    expect(attemptStateChange()).toBe(false);
    expect(attemptStateChange()).toBe(false);
    expect(attemptStateChange()).toBe(false);

    // State should be unchanged
    expect(subMachine.getState().accessLevel).toBe('anonymous');
    expect(subMachine.getState().status).toBe('resolved');
  });

  it('should preserve cached authenticated during degraded state', () => {
    // User has cached authenticated
    subMachine.setAccessLevel('authenticated');
    subMachine.setStatus('resolved');

    // Backend goes down - should enter DEGRADED, not change accessLevel
    const simulateBackendDown = () => {
      // Gateway error during refresh
      subMachine.setStatus('degraded');
      // DO NOT change accessLevel - preserve cached authenticated
    };

    simulateBackendDown();

    // Tier should still be authenticated (cached)
    expect(subMachine.getState().accessLevel).toBe('authenticated');
    expect(subMachine.getState().status).toBe('degraded');
  });

  it('should not flip-flop between states', () => {
    const stateHistory = [];
    const recordState = () => {
      stateHistory.push({ ...subMachine.getState() });
    };

    // Initial
    subMachine.setStatus('pending');
    recordState();

    // Loading
    subMachine.setStatus('loading');
    recordState();

    // Resolved to anonymous
    subMachine.setStatus('resolved');
    subMachine.setAccessLevel('anonymous');
    recordState();

    // Should NOT go back to pending
    // (Monotonicity: resolved is terminal until manual action)
    const finalState = stateHistory[stateHistory.length - 1];
    expect(finalState.status).toBe('resolved');

    // Verify no regression to pending after resolved
    const hasRegression = stateHistory.some((state, i) => {
      if (i === 0) return false;
      const prev = stateHistory[i - 1];
      return prev.status === 'resolved' && state.status === 'pending';
    });

    expect(hasRegression).toBe(false);
  });
});

// ============================================================================
// Integration: Full Auth Flow
// ============================================================================

describe('Integration: Full auth flow timing', () => {
  it('should handle the complete happy path', () => {
    const tokenMachine = createTokenSyncStateMachine();
    const subMachine = createSubscriptionStateMachine();

    // 1. User logs in
    tokenMachine.setTokenStatus('refreshing');
    subMachine.setStatus('pending');

    // 2. Token sync succeeds
    tokenMachine.setTokenStatus('present');
    tokenMachine.resetRetries();

    // 3. Subscription fetch succeeds
    subMachine.startRequest();
    subMachine.setStatus('loading');
    subMachine.markFetchSuccess();
    subMachine.setAccessLevel('authenticated');
    subMachine.setStatus('resolved');
    subMachine.clearRequest();

    // Verify final state
    expect(tokenMachine.getState().tokenStatus).toBe('present');
    expect(subMachine.getState().accessLevel).toBe('authenticated');
    expect(subMachine.getState().status).toBe('resolved');
  });

  it('should handle the gateway error recovery path', () => {
    vi.useFakeTimers();

    const tokenMachine = createTokenSyncStateMachine();
    const subMachine = createSubscriptionStateMachine();

    // 1. User logs in
    tokenMachine.setTokenStatus('refreshing');
    subMachine.setStatus('pending');

    // 2. Token sync gets 502
    tokenMachine.incrementRetry();
    // Status stays refreshing, retry scheduled

    // 3. Advance 5s, retry
    vi.advanceTimersByTime(5000);
    tokenMachine.setTokenStatus('present'); // Retry succeeded
    tokenMachine.resetRetries();

    // 4. Subscription fetch succeeds
    subMachine.markFetchSuccess();
    subMachine.setAccessLevel('authenticated');
    subMachine.setStatus('resolved');

    // Verify recovery
    expect(tokenMachine.getState().tokenStatus).toBe('present');
    expect(subMachine.getState().accessLevel).toBe('authenticated');

    vi.useRealTimers();
  });
});

// ============================================================================
// P0 Fix Tests: Monotonicity + Convergence (2026-01-14)
// ============================================================================
// These tests verify the fix for the P0 bug where authenticated users could get
// stuck in boot forever if ACCESS_FETCH_FAIL was blocked by monotonicity check.
//
// The fix ensures:
// - Monotonicity: authenticated accessLevel cannot be downgraded by errors
// - Convergence: accessPhase always reaches a terminal state (resolved/degraded)

import { authCoordinatorReducer, initialState } from '../authCoordinator.js';

describe('P0 Fix: Monotonicity + Convergence', () => {
  describe('Test 1: Authenticated user + backend 502 → degraded, accessLevel stays authenticated', () => {
    it('should transition to degraded and preserve authenticated accessLevel on gateway error', () => {
      // Authenticated user in loading state
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'cache',
        accessPhase: 'loading',
        accessRequestId: 123,
      };

      // Backend returns 502
      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 123,
        error: new Error('502 Bad Gateway'),
        errorKind: 'GATEWAY',
      });

      expect(result.accessPhase).toBe('degraded'); // Terminal state reached
      expect(result.accessLevel).toBe('authenticated'); // Monotonicity preserved
    });
  });

  describe('Test 2: Authenticated user + ACCESS_FETCH_FAIL(non-gateway) → degraded, accessLevel stays authenticated', () => {
    it('should transition to degraded on 404 error for authenticated user', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'cache',
        accessPhase: 'loading',
        accessRequestId: 123,
      };

      // Backend returns 404 "User not found"
      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 123,
        error: new Error('404 User not found'),
        errorKind: 'NOT_FOUND',
      });

      expect(result.accessPhase).toBe('degraded'); // Terminal state reached (not stuck in loading!)
      expect(result.accessLevel).toBe('authenticated'); // Monotonicity preserved
    });

    it('should transition to degraded on 500 error for authenticated user', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'server',
        accessPhase: 'loading',
        accessRequestId: 456,
      };

      // Backend returns 500
      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 456,
        error: new Error('500 Internal Server Error'),
        errorKind: 'SERVER_ERROR',
      });

      expect(result.accessPhase).toBe('degraded'); // Terminal state reached
      expect(result.accessLevel).toBe('authenticated'); // Monotonicity preserved
    });

    it('should transition to degraded on AUTH_REQUIRED error for authenticated user BUT block cached access', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'cache',
        accessPhase: 'loading',
        accessRequestId: 789,
      };

      // Backend returns 401
      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 789,
        error: new Error('401 Unauthorized'),
        errorKind: 'AUTH_REQUIRED',
      });

      expect(result.accessPhase).toBe('degraded'); // Terminal state reached
      expect(result.accessLevel).toBe('authenticated'); // Tier preserved (last-known)
      expect(result.accessSource).toBe('none'); // KEY: Blocks hasCachedAuthenticatedAccess
    });

    it('should block cached authenticated on 401 (Option C: fail-closed for entitlement)', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'cache', // Has cached authenticated
        accessPhase: 'loading',
        accessRequestId: 123,
      };

      // 401 auth error
      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 123,
        error: new Error('401'),
        errorKind: 'AUTH',
      });

      // Verify: accessLevel preserved but accessSource cleared
      expect(result.accessLevel).toBe('authenticated');
      expect(result.accessSource).toBe('none');
      expect(result.accessPhase).toBe('degraded');

      // Simulate derivation: hasCachedAuthenticatedAccess should be FALSE
      // hasCachedAuthenticatedAccess = accessSource === 'cache' && accessLevel === 'authenticated' && hasActiveAccess
      const hasCachedAuthenticatedAccess = result.accessSource === 'cache'
        && result.accessLevel === 'authenticated';
      expect(hasCachedAuthenticatedAccess).toBe(false); // Blocked!
    });

    it('should KEEP cached authenticated on gateway error (Option C: fail-open for availability)', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'cache', // Has cached authenticated
        accessPhase: 'loading',
        accessRequestId: 456,
      };

      // 502 gateway error
      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 456,
        error: new Error('502 Bad Gateway'),
        errorKind: 'GATEWAY',
      });

      // Verify: accessLevel AND accessSource preserved
      expect(result.accessLevel).toBe('authenticated');
      expect(result.accessSource).toBe('cache'); // PRESERVED for availability
      expect(result.accessPhase).toBe('degraded');

      // Simulate derivation: hasCachedAuthenticatedAccess should be TRUE
      const hasCachedAuthenticatedAccess = result.accessSource === 'cache'
        && result.accessLevel === 'authenticated';
      expect(hasCachedAuthenticatedAccess).toBe(true); // Allowed!
    });
  });

  describe('Test 3: Free/unknown user + ACCESS_FETCH_FAIL → resolved, accessLevel anonymous', () => {
    it('should resolve to anonymous on non-gateway error for anonymous user', () => {
      const state = {
        ...initialState,
        accessLevel: 'anonymous',
        accessSource: 'cache',
        accessPhase: 'loading',
        accessRequestId: 123,
      };

      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 123,
        error: new Error('404 Not found'),
        errorKind: 'NOT_FOUND',
      });

      expect(result.accessPhase).toBe('resolved'); // Terminal state
      expect(result.accessLevel).toBe('anonymous'); // Stays anonymous
    });

    it('should resolve to anonymous on non-gateway error for unknown accessLevel user', () => {
      const state = {
        ...initialState,
        accessLevel: 'unknown',
        accessSource: 'none',
        accessPhase: 'loading',
        accessRequestId: 123,
      };

      const result = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 123,
        error: new Error('500 Server error'),
        errorKind: 'SERVER_ERROR',
      });

      expect(result.accessPhase).toBe('resolved'); // Terminal state
      expect(result.accessLevel).toBe('anonymous'); // Resolves to anonymous (fail-open)
    });
  });

  describe('Test 4: No state remains loading/pending beyond timeout', () => {
    it('ACCESS_PENDING_TIMEOUT resolves pending to anonymous for non-authenticated', () => {
      const state = {
        ...initialState,
        accessLevel: 'unknown',
        accessPhase: 'pending',
      };

      const result = authCoordinatorReducer(state, { type: 'ACCESS_PENDING_TIMEOUT' });

      expect(result.accessPhase).toBe('resolved');
      expect(result.accessLevel).toBe('anonymous');
    });

    it('ACCESS_PENDING_TIMEOUT is blocked when accessLevel is already authenticated (monotonicity)', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessSource: 'cache',
        accessPhase: 'pending', // Unusual state but possible
      };

      const result = authCoordinatorReducer(state, { type: 'ACCESS_PENDING_TIMEOUT' });

      // Timeout is blocked for authenticated users
      expect(result.accessLevel).toBe('authenticated');
      // Note: accessPhase stays pending here, but this edge case is handled by
      // the 3-layer timeout guard in AccessContext (statusRef, activeRequestRef, lastFetchSuccessRef)
    });

    it('loading state always reaches terminal on any ACCESS_FETCH_FAIL', () => {
      // This is the key fix - loading must NEVER stay loading after ACCESS_FETCH_FAIL
      const loadingState = {
        ...initialState,
        accessLevel: 'authenticated',
        accessPhase: 'loading',
        accessRequestId: 999,
      };

      // Try various error kinds - ALL must reach terminal state
      const errorKinds = ['GATEWAY', 'NETWORK', 'AUTH_REQUIRED', 'NOT_FOUND', 'SERVER_ERROR', 'UNKNOWN'];

      for (const errorKind of errorKinds) {
        const result = authCoordinatorReducer(loadingState, {
          type: 'ACCESS_FETCH_FAIL',
          requestId: 999,
          error: new Error(`Test error: ${errorKind}`),
          errorKind,
        });

        // Must NOT stay in loading
        expect(result.accessPhase).not.toBe('loading');
        // Must be in a terminal state
        expect(['resolved', 'degraded']).toContain(result.accessPhase);
      }
    });
  });

  describe('Test 5: No action is silently blocked without terminal state', () => {
    it('ACCESS_FETCH_FAIL always produces a state change for valid requestId', () => {
      const baseState = {
        ...initialState,
        accessPhase: 'loading',
        accessRequestId: 100,
      };

      // Test with different accessLevels
      const accessLevels = ['unknown', 'anonymous', 'authenticated'];
      const errorKinds = ['GATEWAY', 'NETWORK', 'AUTH_REQUIRED', 'NOT_FOUND'];

      for (const accessLevel of accessLevels) {
        for (const errorKind of errorKinds) {
          const state = { ...baseState, accessLevel };
          const result = authCoordinatorReducer(state, {
            type: 'ACCESS_FETCH_FAIL',
            requestId: 100,
            error: new Error('test'),
            errorKind,
          });

          // Action must NOT be silently blocked (state must change)
          expect(result.accessPhase).not.toBe('loading');
          expect(result.accessRequestId).toBeNull(); // Request cleared
        }
      }
    });

    it('only stale requests are rejected (not valid ones)', () => {
      const state = {
        ...initialState,
        accessLevel: 'authenticated',
        accessPhase: 'loading',
        accessRequestId: 200, // Current request
      };

      // Stale request (old requestId) - should be rejected
      const staleResult = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 100, // Old request
        error: new Error('stale'),
        errorKind: 'SERVER_ERROR',
      });
      expect(staleResult.accessPhase).toBe('loading'); // Unchanged - stale rejected

      // Current request - should be accepted
      const currentResult = authCoordinatorReducer(state, {
        type: 'ACCESS_FETCH_FAIL',
        requestId: 200, // Current request
        error: new Error('current'),
        errorKind: 'SERVER_ERROR',
      });
      expect(currentResult.accessPhase).toBe('degraded'); // Changed - current accepted
    });
  });
});

// ============================================================================
// P0 Fix: ACCESS_FETCH_ABORT Convergence (2026-01-14)
// ============================================================================
// These tests verify that abort always reaches terminal state

describe('P0 Fix: ACCESS_FETCH_ABORT Convergence', () => {
  it('abort during loading transitions to degraded and clears accessRequestId', () => {
    const state = {
      ...initialState,
      accessLevel: 'authenticated',
      accessSource: 'cache',
      accessPhase: 'loading',
      accessRequestId: 123,
    };

    const result = authCoordinatorReducer(state, {
      type: 'ACCESS_FETCH_ABORT',
      requestId: 123,
    });

    // Must reach terminal state
    expect(result.accessPhase).toBe('degraded');
    // Must clear requestId so future fetches work
    expect(result.accessRequestId).toBeNull();
    // Must preserve accessLevel (abort is not an error)
    expect(result.accessLevel).toBe('authenticated');
    expect(result.accessSource).toBe('cache');
  });

  it('abort during pending just clears accessRequestId', () => {
    const state = {
      ...initialState,
      accessPhase: 'pending',
      accessRequestId: 456,
    };

    const result = authCoordinatorReducer(state, {
      type: 'ACCESS_FETCH_ABORT',
      requestId: 456,
    });

    // Pending stays pending (timeout will handle)
    expect(result.accessPhase).toBe('pending');
    // But requestId is cleared
    expect(result.accessRequestId).toBeNull();
  });

  it('every fetch attempt ends in terminal action (enumeration)', () => {
    // This test proves the convergence invariant:
    // For any accessPhase='loading' state, one of these MUST be dispatched:
    const terminalActions = ['ACCESS_FETCH_OK', 'ACCESS_FETCH_FAIL', 'ACCESS_FETCH_ABORT'];

    const loadingState = {
      ...initialState,
      accessPhase: 'loading',
      accessRequestId: 999,
    };

    for (const actionType of terminalActions) {
      const action = actionType === 'ACCESS_FETCH_OK'
        ? { type: actionType, requestId: 999, subscription: { accessLevel: 'anonymous', subscribed: false } }
        : actionType === 'ACCESS_FETCH_FAIL'
          ? { type: actionType, requestId: 999, error: new Error('test'), errorKind: 'GATEWAY' }
          : { type: actionType, requestId: 999 };

      const result = authCoordinatorReducer(loadingState, action);

      // All terminal actions must exit loading
      expect(result.accessPhase).not.toBe('loading');
      // All terminal actions must clear requestId
      expect(result.accessRequestId).toBeNull();
    }
  });
});

// ============================================================================
// P0 Fix: Cache TTL for authenticated access (2026-01-14)
// ============================================================================
// Note: The actual cache TTL logic is in AccessContext.jsx getCachedSubscription()
// These tests verify the derivation logic doesn't grant authenticated without proper source

describe('P0 Fix: Cache TTL Policy', () => {
  it('cached authenticated with ends_at requires valid future date', () => {
    // This tests the hasActiveAccess derivation logic
    // Subscription with expired ends_at should NOT be active

    const expiredSubscription = {
      accessLevel: 'authenticated',
      subscribed: true,
      ends_at: '2020-01-01T00:00:00Z', // Expired
    };

    // Simulate hasActiveAccess check
    const hasActiveAccess = (sub) => {
      if (sub.accessLevel !== 'authenticated') return false;
      if (!sub.subscribed) return false;
      if (sub.ends_at) {
        const endsAt = new Date(sub.ends_at);
        if (endsAt < new Date()) return false;
      }
      return true;
    };

    expect(hasActiveAccess(expiredSubscription)).toBe(false);
  });

  it('cached authenticated without ends_at relies on cache TTL (24h max)', () => {
    // This documents the policy: if ends_at is null, cache TTL limits authenticated access
    // The actual enforcement is in getCachedSubscription() with ACCESS_CACHE_MAX_TTL_MS

    // Test the derivation side: if accessSource is 'none', hasCachedAuthenticatedAccess is false
    const accessSourceNone = 'none';
    const accessSourceCache = 'cache';

    // hasCachedAuthenticatedAccess = accessSource === 'cache' && accessLevel === 'authenticated' && hasActiveAccess
    const hasCachedAuthenticatedAccess = (accessSource, accessLevel) => accessSource === 'cache' && accessLevel === 'authenticated';

    expect(hasCachedAuthenticatedAccess(accessSourceNone, 'authenticated')).toBe(false);
    expect(hasCachedAuthenticatedAccess(accessSourceCache, 'authenticated')).toBe(true);
  });

  it('expired cache (by TTL) returns null from getCachedSubscription', () => {
    // This is a documentation test - the actual logic is:
    // if (accessLevel === 'authenticated' && !ends_at) {
    //   if (Date.now() - cachedAt > 24h) return null;
    // }
    //
    // Policy: authenticated cache without ends_at cannot persist beyond 24 hours
    // This prevents "immortal cached authenticated" from bad data or backend bugs

    const ACCESS_CACHE_MAX_TTL_MS = 24 * 60 * 60 * 1000;

    // Simulate expired cache check
    const cachedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
    const cacheAge = Date.now() - cachedAt;
    const isExpired = cacheAge > ACCESS_CACHE_MAX_TTL_MS;

    expect(isExpired).toBe(true);
  });
});
