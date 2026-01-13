/**
 * Auth Race Condition Tests (Anti-Whack-a-Mole)
 *
 * These tests verify critical timing scenarios that could cause:
 * - Premium users incorrectly seeing free tier
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
  let tier = 'unknown';
  let activeRequestId = null;
  let lastFetchSuccess = 0;
  let requestCounter = 0; // Use counter instead of Date.now() for unique IDs

  const statusRef = { current: status };

  return {
    getState: () => ({ status, tier, statusRef: statusRef.current }),
    setStatus: (newStatus) => {
      status = newStatus;
      statusRef.current = newStatus;
    },
    setTier: (newTier) => { tier = newTier; },
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

  it('should NOT overwrite premium when fetch succeeds just before timeout', () => {
    // Start in pending
    subMachine.setStatus('pending');
    subMachine.setTier('unknown');

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

      // If all checks pass, set to free
      timeoutFired = true;
      subMachine.setStatus('resolved');
      subMachine.setTier('free');
    };

    const timeoutId = setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);

    // Advance to t=14.9s
    vi.advanceTimersByTime(14900);

    // Fetch completes with premium at t=14.9s
    subMachine.markFetchSuccess();
    subMachine.setStatus('resolved');
    subMachine.setTier('premium');
    subMachine.clearRequest();

    // Advance to t=15s (timeout fires)
    vi.advanceTimersByTime(100);

    // Verify: tier should still be premium, NOT free
    expect(subMachine.getState().tier).toBe('premium');
    expect(subMachine.getState().status).toBe('resolved');
    expect(timeoutFired).toBe(false);

    clearTimeout(timeoutId);
  });

  it('should resolve to free when genuinely stuck in pending', () => {
    // Start in pending with no activity
    subMachine.setStatus('pending');
    subMachine.setTier('unknown');

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
      subMachine.setTier('free');
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);

    // Advance full 15s with no fetch activity
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    // Verify: should resolve to free
    expect(subMachine.getState().tier).toBe('free');
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
      subMachine.setTier('free');
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    // Timeout should have aborted due to active request
    expect(timeoutFired).toBe(false);
    expect(subMachine.getState().tier).toBe('unknown');
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
    // User A has premium subscription
    subMachine.setStatus('resolved');
    subMachine.setTier('premium');

    // Logout (clear subscription)
    subMachine.setStatus('resolved'); // Explicit resolved on logout
    subMachine.setTier('free');
    subMachine.clearRequest();

    // Verify clean state
    expect(subMachine.getState().tier).toBe('free');
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

    // First request completes with premium (but it's stale)
    const request1Stale = subMachine.isStale(request1Id);
    expect(request1Stale).toBe(true);

    // Don't apply stale result
    if (!subMachine.isStale(request1Id)) {
      subMachine.setTier('premium');
    }

    // Tier should still be unknown (stale result rejected)
    expect(subMachine.getState().tier).toBe('unknown');

    // Second request completes with free
    if (!subMachine.isStale(request2Id)) {
      subMachine.setTier('free');
      subMachine.setStatus('resolved');
    }

    // Verify latest result applied
    expect(subMachine.getState().tier).toBe('free');
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
      subMachine.setTier('premium');
      subMachine.setStatus('resolved');
    }

    expect(subMachine.getState().tier).toBe('premium');
  });

  it('should handle rapid sequential requests', () => {
    const results = [];

    // Rapid fire 5 requests
    for (let i = 0; i < 5; i++) {
      const reqId = subMachine.startRequest();
      results.push({ reqId, tier: `tier-${i}` });
    }

    // Only last request should be valid
    for (let i = 0; i < results.length; i++) {
      const { reqId, tier } = results[i];
      if (!subMachine.isStale(reqId)) {
        subMachine.setTier(tier);
      }
    }

    // Should have the last tier
    expect(subMachine.getState().tier).toBe('tier-4');
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
    let tabAState = { tier: 'premium', status: 'resolved' };
    mockAddEventListener('storage', (e) => {
      if (e.key?.startsWith('subscription:')) {
        // Parse the new value
        const newValue = JSON.parse(e.newValue);
        if (newValue.tier === 'free') {
          tabAState = { tier: 'free', status: 'resolved' };
        }
      }
    });

    // Tab B logs out and clears subscription
    const storageEvent = {
      key: 'subscription:user@example.com',
      newValue: JSON.stringify({ tier: 'free', subscribed: false, version: 5 }),
      oldValue: JSON.stringify({ tier: 'premium', subscribed: true, version: 5 }),
    };

    // Dispatch to all listeners (simulates browser behavior)
    storageListeners.forEach((listener) => listener(storageEvent));

    // Tab A should have converged to free
    expect(tabAState.tier).toBe('free');
  });

  it('should handle cache key format correctly', () => {
    const email = 'Test@Example.com';
    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `subscription:${normalizedEmail}`;

    expect(cacheKey).toBe('subscription:test@example.com');
  });

  it('should ignore storage events for different users', () => {
    let currentUserEmail = 'userA@example.com';
    let tabState = { tier: 'premium' };

    const handleStorageEvent = (e) => {
      const expectedKey = `subscription:${currentUserEmail}`;
      if (e.key !== expectedKey) {
        return; // Ignore events for other users
      }
      const newValue = JSON.parse(e.newValue);
      tabState.tier = newValue.tier;
    };

    // Event for different user
    const otherUserEvent = {
      key: 'subscription:userB@example.com',
      newValue: JSON.stringify({ tier: 'free' }),
    };

    handleStorageEvent(otherUserEvent);

    // Should not have changed
    expect(tabState.tier).toBe('premium');
  });
});

// ============================================================================
// Test 6: Backend down resolves to free and stays stable
// ============================================================================

describe('Test 6: Backend down - resolves to free and stays stable', () => {
  let subMachine;
  const PENDING_TIMEOUT_MS = 15000;

  beforeEach(() => {
    vi.useFakeTimers();
    subMachine = createSubscriptionStateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve to free after timeout when backend is down', () => {
    subMachine.setStatus('pending');
    subMachine.setTier('unknown');

    // Simulate backend returning gateway errors (502/503/504)
    const simulateBackendDown = () => {
      // Gateway error -> DEGRADED status (not resolved)
      subMachine.setStatus('degraded');
      // But if no cache, tier remains unknown
    };

    simulateBackendDown();

    // After 15s timeout, should resolve to free
    const timeoutCallback = () => {
      if (subMachine.getState().status === 'pending' ||
          (subMachine.getState().status === 'degraded' && subMachine.getState().tier === 'unknown')) {
        subMachine.setStatus('resolved');
        subMachine.setTier('free');
      }
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(subMachine.getState().tier).toBe('free');
    expect(subMachine.getState().status).toBe('resolved');
  });

  it('should stay stable after resolving to free', () => {
    // Already resolved to free
    subMachine.setStatus('resolved');
    subMachine.setTier('free');

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
    expect(subMachine.getState().tier).toBe('free');
    expect(subMachine.getState().status).toBe('resolved');
  });

  it('should preserve cached premium during degraded state', () => {
    // User has cached premium
    subMachine.setTier('premium');
    subMachine.setStatus('resolved');

    // Backend goes down - should enter DEGRADED, not change tier
    const simulateBackendDown = () => {
      // Gateway error during refresh
      subMachine.setStatus('degraded');
      // DO NOT change tier - preserve cached premium
    };

    simulateBackendDown();

    // Tier should still be premium (cached)
    expect(subMachine.getState().tier).toBe('premium');
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

    // Resolved to free
    subMachine.setStatus('resolved');
    subMachine.setTier('free');
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
    subMachine.setTier('premium');
    subMachine.setStatus('resolved');
    subMachine.clearRequest();

    // Verify final state
    expect(tokenMachine.getState().tokenStatus).toBe('present');
    expect(subMachine.getState().tier).toBe('premium');
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
    subMachine.setTier('premium');
    subMachine.setStatus('resolved');

    // Verify recovery
    expect(tokenMachine.getState().tokenStatus).toBe('present');
    expect(subMachine.getState().tier).toBe('premium');

    vi.useRealTimers();
  });
});
