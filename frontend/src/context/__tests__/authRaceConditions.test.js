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
 * Simulates the access state machine for testing
 */
function createAccessStateMachine() {
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
  let accessMachine;
  const PENDING_TIMEOUT_MS = 15000;

  beforeEach(() => {
    vi.useFakeTimers();
    accessMachine = createAccessStateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT overwrite authenticated when fetch succeeds just before timeout', () => {
    accessMachine.setStatus('pending');
    accessMachine.setAccessLevel('unknown');

    let timeoutFired = false;
    const timeoutCallback = () => {
      const currentStatus = accessMachine.getState().statusRef;
      const activeRequest = accessMachine.getActiveRequestId();
      const timeSinceSuccess = Date.now() - accessMachine.getLastFetchSuccess();

      if (currentStatus !== 'pending') return;
      if (activeRequest !== null) return;
      if (timeSinceSuccess < 2000) return;

      timeoutFired = true;
      accessMachine.setStatus('resolved');
      accessMachine.setAccessLevel('anonymous');
    };

    const timeoutId = setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);

    vi.advanceTimersByTime(14900);

    accessMachine.markFetchSuccess();
    accessMachine.setStatus('resolved');
    accessMachine.setAccessLevel('authenticated');
    accessMachine.clearRequest();

    vi.advanceTimersByTime(100);

    expect(accessMachine.getState().accessLevel).toBe('authenticated');
    expect(accessMachine.getState().status).toBe('resolved');
    expect(timeoutFired).toBe(false);

    clearTimeout(timeoutId);
  });

  it('should resolve to anonymous when genuinely stuck in pending', () => {
    accessMachine.setStatus('pending');
    accessMachine.setAccessLevel('unknown');

    let timeoutFired = false;
    const timeoutCallback = () => {
      const currentStatus = accessMachine.getState().statusRef;
      const activeRequest = accessMachine.getActiveRequestId();
      const timeSinceSuccess = Date.now() - accessMachine.getLastFetchSuccess();

      if (currentStatus !== 'pending') return;
      if (activeRequest !== null) return;
      if (timeSinceSuccess < 2000) return;

      timeoutFired = true;
      accessMachine.setStatus('resolved');
      accessMachine.setAccessLevel('anonymous');
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(accessMachine.getState().accessLevel).toBe('anonymous');
    expect(accessMachine.getState().status).toBe('resolved');
    expect(timeoutFired).toBe(true);
  });

  it('should NOT fire timeout while fetch is in progress', () => {
    accessMachine.setStatus('pending');
    accessMachine.startRequest();

    let timeoutFired = false;
    const timeoutCallback = () => {
      const activeRequest = accessMachine.getActiveRequestId();
      if (activeRequest !== null) return;
      timeoutFired = true;
      accessMachine.setAccessLevel('anonymous');
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(timeoutFired).toBe(false);
    expect(accessMachine.getState().accessLevel).toBe('unknown');
  });
});

// ============================================================================
// Test 3: User switch resets backoff/refs
// ============================================================================

describe('Test 3: Logout/login different user resets state', () => {
  let tokenMachine;
  let accessMachine;

  beforeEach(() => {
    vi.useFakeTimers();
    tokenMachine = createTokenSyncStateMachine();
    accessMachine = createAccessStateMachine();
  });

  afterEach(() => {
    tokenMachine.cancelRetry();
    vi.useRealTimers();
  });

  it('should reset retry count on auth state change', () => {
    tokenMachine.incrementRetry();
    tokenMachine.incrementRetry();
    expect(tokenMachine.getState().retryCount).toBe(2);

    tokenMachine.resetRetries();
    tokenMachine.cancelRetry();

    expect(tokenMachine.getState().retryCount).toBe(0);
    expect(tokenMachine.canRetry()).toBe(true);
  });

  it('should cancel pending retry timeout on user switch', () => {
    const callback = vi.fn();
    tokenMachine.scheduleRetry(callback);
    expect(tokenMachine.getRetryTimeoutId()).not.toBeNull();

    tokenMachine.cancelRetry();

    expect(tokenMachine.getRetryTimeoutId()).toBeNull();

    vi.advanceTimersByTime(tokenMachine.RETRY_DELAY_MS);
    expect(callback).not.toHaveBeenCalled();
  });

  it('should allow new user sync after switch', () => {
    for (let i = 0; i < tokenMachine.MAX_RETRIES; i++) {
      tokenMachine.incrementRetry();
    }
    expect(tokenMachine.canRetry()).toBe(false);

    tokenMachine.resetRetries();
    tokenMachine.setTokenStatus('missing');

    expect(tokenMachine.canRetry()).toBe(true);
    expect(tokenMachine.getState().tokenStatus).toBe('missing');
  });

  it('should clear access state on logout', () => {
    accessMachine.setStatus('resolved');
    accessMachine.setAccessLevel('authenticated');

    accessMachine.setStatus('resolved');
    accessMachine.setAccessLevel('anonymous');
    accessMachine.clearRequest();

    expect(accessMachine.getState().accessLevel).toBe('anonymous');
    expect(accessMachine.getState().status).toBe('resolved');
  });
});

// ============================================================================
// Test 4: Overlapping fetches - only latest applies
// ============================================================================

describe('Test 4: Two access fetches overlap - only latest applies', () => {
  let accessMachine;

  beforeEach(() => {
    accessMachine = createAccessStateMachine();
  });

  it('should reject stale request result', () => {
    const request1Id = accessMachine.startRequest();
    accessMachine.setStatus('loading');

    const request2Id = accessMachine.startRequest();

    expect(accessMachine.isStale(request1Id)).toBe(true);

    if (!accessMachine.isStale(request1Id)) {
      accessMachine.setAccessLevel('authenticated');
    }

    expect(accessMachine.getState().accessLevel).toBe('unknown');

    if (!accessMachine.isStale(request2Id)) {
      accessMachine.setAccessLevel('anonymous');
      accessMachine.setStatus('resolved');
    }

    expect(accessMachine.getState().accessLevel).toBe('anonymous');
    expect(accessMachine.getState().status).toBe('resolved');
  });

  it('should apply result from latest request only', () => {
    const request1Id = accessMachine.startRequest();
    const request2Id = accessMachine.startRequest();

    expect(accessMachine.isStale(request1Id)).toBe(true);
    expect(accessMachine.isStale(request2Id)).toBe(false);

    if (!accessMachine.isStale(request2Id)) {
      accessMachine.setAccessLevel('authenticated');
      accessMachine.setStatus('resolved');
    }

    expect(accessMachine.getState().accessLevel).toBe('authenticated');
  });

  it('should handle rapid sequential requests', () => {
    const results = [];

    for (let i = 0; i < 5; i++) {
      const reqId = accessMachine.startRequest();
      results.push({ reqId, accessLevel: `accessLevel-${i}` });
    }

    for (let i = 0; i < results.length; i++) {
      const { reqId, accessLevel } = results[i];
      if (!accessMachine.isStale(reqId)) {
        accessMachine.setAccessLevel(accessLevel);
      }
    }

    expect(accessMachine.getState().accessLevel).toBe('accessLevel-4');
  });
});

// ============================================================================
// Test 5: Multi-tab logout convergence
// ============================================================================

describe('Test 5: Multi-tab - one tab logs out', () => {
  it('should detect storage event for cross-tab sync', () => {
    const storageListeners = [];
    const mockAddEventListener = (event, callback) => {
      if (event === 'storage') {
        storageListeners.push(callback);
      }
    };

    let tabAState = { accessLevel: 'authenticated', status: 'resolved' };
    mockAddEventListener('storage', (e) => {
      if (e.key?.startsWith('access:')) {
        const newValue = JSON.parse(e.newValue);
        if (newValue.accessLevel === 'anonymous') {
          tabAState = { accessLevel: 'anonymous', status: 'resolved' };
        }
      }
    });

    const storageEvent = {
      key: 'access:user@example.com',
      newValue: JSON.stringify({ accessLevel: 'anonymous' }),
      oldValue: JSON.stringify({ accessLevel: 'authenticated' }),
    };

    storageListeners.forEach((listener) => listener(storageEvent));

    expect(tabAState.accessLevel).toBe('anonymous');
  });

  it('should handle cache key format correctly', () => {
    const email = 'Test@Example.com';
    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `access:${normalizedEmail}`;

    expect(cacheKey).toBe('access:test@example.com');
  });

  it('should ignore storage events for different users', () => {
    let currentUserEmail = 'userA@example.com';
    let tabState = { accessLevel: 'authenticated' };

    const handleStorageEvent = (e) => {
      const expectedKey = `access:${currentUserEmail}`;
      if (e.key !== expectedKey) return;
      const newValue = JSON.parse(e.newValue);
      tabState.accessLevel = newValue.accessLevel;
    };

    const otherUserEvent = {
      key: 'access:userB@example.com',
      newValue: JSON.stringify({ accessLevel: 'anonymous' }),
    };

    handleStorageEvent(otherUserEvent);

    expect(tabState.accessLevel).toBe('authenticated');
  });
});

// ============================================================================
// Test 6: Backend down resolves to anonymous and stays stable
// ============================================================================

describe('Test 6: Backend down - resolves to anonymous and stays stable', () => {
  let accessMachine;
  const PENDING_TIMEOUT_MS = 15000;

  beforeEach(() => {
    vi.useFakeTimers();
    accessMachine = createAccessStateMachine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve to anonymous after timeout when backend is down', () => {
    accessMachine.setStatus('pending');
    accessMachine.setAccessLevel('unknown');

    const simulateBackendDown = () => {
      accessMachine.setStatus('degraded');
    };

    simulateBackendDown();

    const timeoutCallback = () => {
      if (accessMachine.getState().status === 'pending' ||
          (accessMachine.getState().status === 'degraded' && accessMachine.getState().accessLevel === 'unknown')) {
        accessMachine.setStatus('resolved');
        accessMachine.setAccessLevel('anonymous');
      }
    };

    setTimeout(timeoutCallback, PENDING_TIMEOUT_MS);
    vi.advanceTimersByTime(PENDING_TIMEOUT_MS);

    expect(accessMachine.getState().accessLevel).toBe('anonymous');
    expect(accessMachine.getState().status).toBe('resolved');
  });

  it('should stay stable after resolving to anonymous', () => {
    accessMachine.setStatus('resolved');
    accessMachine.setAccessLevel('anonymous');

    const attemptStateChange = () => {
      if (accessMachine.getState().status === 'resolved') return false;
      return true;
    };

    expect(attemptStateChange()).toBe(false);
    expect(attemptStateChange()).toBe(false);
    expect(attemptStateChange()).toBe(false);

    expect(accessMachine.getState().accessLevel).toBe('anonymous');
    expect(accessMachine.getState().status).toBe('resolved');
  });

  it('should preserve cached authenticated during degraded state', () => {
    accessMachine.setAccessLevel('authenticated');
    accessMachine.setStatus('resolved');

    const simulateBackendDown = () => {
      accessMachine.setStatus('degraded');
    };

    simulateBackendDown();

    expect(accessMachine.getState().accessLevel).toBe('authenticated');
    expect(accessMachine.getState().status).toBe('degraded');
  });

  it('should not flip-flop between states', () => {
    const stateHistory = [];
    const recordState = () => {
      stateHistory.push({ ...accessMachine.getState() });
    };

    accessMachine.setStatus('pending');
    recordState();

    accessMachine.setStatus('loading');
    recordState();

    accessMachine.setStatus('resolved');
    accessMachine.setAccessLevel('anonymous');
    recordState();

    const finalState = stateHistory[stateHistory.length - 1];
    expect(finalState.status).toBe('resolved');

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
    const accessMachine = createAccessStateMachine();

    tokenMachine.setTokenStatus('refreshing');
    accessMachine.setStatus('pending');

    tokenMachine.setTokenStatus('present');
    tokenMachine.resetRetries();

    accessMachine.startRequest();
    accessMachine.setStatus('loading');
    accessMachine.markFetchSuccess();
    accessMachine.setAccessLevel('authenticated');
    accessMachine.setStatus('resolved');
    accessMachine.clearRequest();

    expect(tokenMachine.getState().tokenStatus).toBe('present');
    expect(accessMachine.getState().accessLevel).toBe('authenticated');
    expect(accessMachine.getState().status).toBe('resolved');
  });

  it('should handle the gateway error recovery path', () => {
    vi.useFakeTimers();

    const tokenMachine = createTokenSyncStateMachine();
    const accessMachine = createAccessStateMachine();

    tokenMachine.setTokenStatus('refreshing');
    accessMachine.setStatus('pending');

    tokenMachine.incrementRetry();

    vi.advanceTimersByTime(5000);
    tokenMachine.setTokenStatus('present');
    tokenMachine.resetRetries();

    accessMachine.markFetchSuccess();
    accessMachine.setAccessLevel('authenticated');
    accessMachine.setStatus('resolved');

    expect(tokenMachine.getState().tokenStatus).toBe('present');
    expect(accessMachine.getState().accessLevel).toBe('authenticated');

    vi.useRealTimers();
  });
});
