// eslint-disable-next-line no-restricted-imports -- MIGRATION_ONLY: useState to be removed by Phase 3
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { deriveTokenStatus } from './authCoordinator';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from '../lib/firebase';
import { queryClient } from '../lib/queryClient';
import apiClient from '../api/client';
import { useSubscription } from './SubscriptionContext';
import { logAuthEvent, AuthTimelineEvent } from '../utils/authTimelineLogger';

// Global counter for requestIds to prevent collisions across guards
let globalRequestIdCounter = 0;

/**
 * Inline stale request guard (previously useStaleRequestGuard hook)
 * Simple abort/stale request protection for auth operations.
 */
function useStaleRequestGuard() {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  const startRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    // Use global counter to prevent collisions across guards
    globalRequestIdCounter += 1;
    requestIdRef.current = globalRequestIdCounter;
    return requestIdRef.current;
  }, []);

  const isStale = useCallback((requestId) => {
    return requestId !== requestIdRef.current;
  }, []);

  const getSignal = useCallback(() => {
    return abortControllerRef.current?.signal;
  }, []);

  return { startRequest, isStale, getSignal };
}

/**
 * Helper: Check if error is an abort/cancel (expected control flow, not a real error)
 * Abort happens when: component unmounts, newer request starts, or user navigates away.
 * This is EXPECTED behavior and should never block app readiness.
 */
export const isAbortError = (err) => {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
};

/**
 * AUTH INVARIANT: REFRESHING must resolve to PRESENT | MISSING | ERROR within this timeout.
 * This prevents infinite pending states when backend is unresponsive.
 */
const TOKEN_REFRESH_TIMEOUT_MS = 8000;

/**
 * Helper: Wrap a promise with a timeout
 * On timeout, rejects with a timeout error (NOT an abort error - timeouts are real failures)
 */
const withTimeout = (promise, ms, operation) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${operation} timed out after ${ms}ms`)),
      ms
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

/**
 * Helper: Check if error is a timeout error (from withTimeout)
 */
const isTimeoutError = (err) => {
  return err?.message?.includes('timed out after');
};

const logAuthError = (message, err, details = {}) => {
  console.error(message, {
    ...details,
    message: err?.message,
    code: err?.code,
    status: err?.response?.status,
  });
};

/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Uses Firebase Authentication with Google OAuth.
 *
 * CRITICAL INVARIANT:
 * `initialized` = "Firebase auth state is KNOWN" (user or null)
 * `initialized` ≠ "Backend token sync complete"
 *
 * The `initialized` flag MUST become true as soon as Firebase tells us the auth state,
 * regardless of whether backend sync succeeds, fails, or is aborted.
 * This ensures app boot (appReady) is never blocked by backend availability.
 *
 * After Firebase sign-in, syncs with backend to:
 * - Create/find user in database
 * - Get JWT token for API calls
 * - Get subscription status
 *
 * Firebase is lazily initialized - only when sign-in is attempted.
 * This prevents blocking the landing page when API keys aren't configured.
 */

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Token status state machine
 * - 'present': Token synced with backend for this session
 * - 'missing': No token, user authenticated (need sync)
 * - 'refreshing': Token sync in progress
 * - 'error': Token sync failed (non-abort)
 *
 * INVARIANT: tokenStatus does NOT mean "sync succeeded".
 * Subscription fetch must not deadlock if backend sync fails.
 */
export const TokenStatus = {
  PRESENT: 'present',
  MISSING: 'missing',
  REFRESHING: 'refreshing',
  ERROR: 'error',
};

export function AuthProvider({ children }) {
  // ==========================================================================
  // AUTH COORDINATOR (single-writer for auth + subscription state)
  // The reducer lives in SubscriptionProvider (outer wrapper).
  // We get coordState and dispatch via useSubscription().
  // ==========================================================================
  const {
    coordState,
    dispatch,
    actions: subscriptionActions,
  } = useSubscription();

  // ==========================================================================
  // MIGRATION_ONLY: Legacy useState - remove as we wire dispatch
  // Track count: grep -c "MIGRATION_ONLY" src/context/AuthContext.jsx
  // user + initialized: MIGRATED to coordState (Phase 1 complete)
  // ==========================================================================
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // UI loading state for Google button
  // Cleared when onAuthStateChanged fires (Firebase auth state is known)
  const [authUiLoading, setAuthUiLoading] = useState(true);

  // tokenStatus is now DERIVED from coordState.authPhase (Phase 2 complete)
  // No useState needed - see deriveTokenStatus() at bottom of component

  // SEPARATE stale guards to prevent cross-abort between operations
  // P0 FIX: refreshToken() must NOT abort syncTokenWithBackend()
  const authStateGuard = useStaleRequestGuard();  // For onAuthStateChanged sync
  const tokenRefreshGuard = useStaleRequestGuard(); // For refreshToken() calls
  const { refresh: refreshSubscription, ensure: ensureSubscription, clear: clearSubscription } = subscriptionActions;

  // P0 FIX: Ensure auth listener registers exactly once.
  // Use refs so callback always reads latest functions/state without re-registering.
  const authListenerRegisteredRef = useRef(false);
  const authStateGuardRef = useRef(authStateGuard);
  authStateGuardRef.current = authStateGuard;
  const ensureSubscriptionRef = useRef(ensureSubscription);
  ensureSubscriptionRef.current = ensureSubscription;
  const refreshSubscriptionRef = useRef(refreshSubscription);
  refreshSubscriptionRef.current = refreshSubscription;
  // tokenStatusRef now tracks derived status from coordState.authPhase (not useState)
  const derivedTokenStatusForRef = deriveTokenStatus(coordState.authPhase, coordState.user, coordState.initialized);
  const tokenStatusRef = useRef(derivedTokenStatusForRef);
  tokenStatusRef.current = derivedTokenStatusForRef;

  // Track previous status for safe abort recovery (restore on abort, don't downgrade)
  const prevTokenStatusRef = useRef(derivedTokenStatusForRef);

  // P0 FIX: Delayed retry for firebase-sync on retryable errors
  // When backend is waking up (502/503/504), we schedule a retry instead of calling ensureSubscription
  // ensureSubscription requires JWT cookie from firebase-sync, so it won't work if firebase-sync failed
  const TOKEN_SYNC_RETRY_DELAY_MS = 5000; // Retry after 5 seconds
  const TOKEN_SYNC_MAX_RETRIES = 2; // Max retry attempts
  const syncRetryCountRef = useRef(0);
  const syncRetryTimeoutRef = useRef(null);

  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (syncRetryTimeoutRef.current) {
        clearTimeout(syncRetryTimeoutRef.current);
      }
    };
  }, []);

  // Legacy alias for backwards compatibility (used by syncWithBackend)
  const { startRequest, isStale, getSignal } = authStateGuard;

  // Initialize auth listener only if Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // Firebase not configured - skip auth listener
      dispatch({ type: 'FIREBASE_USER_CHANGED', user: null }); // Sets initialized: true
      setAuthUiLoading(false); // Clear UI loading
      // No user + initialized = tokenStatus derives to 'present' automatically
      return;
    }

    try {
      const auth = getFirebaseAuth();
      setLoading(true);

      if (process.env.NODE_ENV !== 'production') {
        if (authListenerRegisteredRef.current) {
          console.error('[Auth] onAuthStateChanged registered more than once', new Error().stack);
        }
        authListenerRegisteredRef.current = true;
      }

      // Handle redirect result (for mobile sign-in)
      getRedirectResult(auth)
        .then(async (result) => {
          if (result?.user) {
            // User signed in via redirect - sync with backend
            const requestId = authStateGuardRef.current.startRequest();
            // P0 FIX: Dispatch TOKEN_SYNC_START to set authRequestId for staleness check
            dispatch({ type: 'TOKEN_SYNC_START', requestId });
            try {
              const idToken = await result.user.getIdToken();
              const response = await apiClient.post('/auth/firebase-sync', {
                idToken,
                email: result.user.email,
                displayName: result.user.displayName,
                photoURL: result.user.photoURL,
              }, {
                signal: authStateGuardRef.current.getSignal(),
                __allowRetry: true, // Retry on 502/503/504 (Render cold start)
              });

              if (!authStateGuardRef.current.isStale(requestId)) {
                // Bootstrap subscription from firebase-sync response
                if (response.data.subscription) {
                  refreshSubscriptionRef.current({
                    bootstrap: response.data.subscription,
                    email: result.user.email,
                  });
                }
                dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: response.data.subscription });
              }
            } catch (err) {
              if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                logAuthError('[Auth] Backend sync failed after redirect', err);
              }
            }
          }
        })
        .catch((err) => {
          logAuthError('[Auth] Redirect result error', err);
        });

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        // Start a new request for each auth state change - cancels any in-flight API calls
        // Uses authStateGuard - separate from tokenRefreshGuard to avoid cross-abort
        const requestId = authStateGuardRef.current.startRequest();
        // Local flag to track if we've set initialized in this callback
        let didSetInitialized = false;

        // P0 FIX: Reset retry count on auth state change (prevents cross-user state leak)
        // Also clear any pending retry timeout
        syncRetryCountRef.current = 0;
        if (syncRetryTimeoutRef.current) {
          clearTimeout(syncRetryTimeoutRef.current);
          syncRetryTimeoutRef.current = null;
        }

        // INVARIANT: Set user and initialized IMMEDIATELY when Firebase tells us auth state.
        // This MUST happen before any async operations to guarantee boot completes.
        // The try/finally ensures initialized is set even if subsequent code throws.
        try {
          // Single dispatch sets both user and initialized
          dispatch({ type: 'FIREBASE_USER_CHANGED', user: firebaseUser });

          // CRITICAL: Clear loading states SYNCHRONOUSLY after we know auth state.
          // Guard: Only set if this is still the current request (prevents race conditions)
          if (!authStateGuardRef.current.isStale(requestId)) {
            setLoading(false);
            setAuthUiLoading(false); // Clear UI loading on first auth state
            didSetInitialized = true;
          }

          // === TOKEN STATUS STATE MACHINE ===
          if (!firebaseUser) {
            // No user → token not needed (derives to 'present' automatically)
            logAuthEvent(AuthTimelineEvent.AUTH_NO_USER, {
              source: 'auth_listener',
              tokenStatusBefore: tokenStatusRef.current,
              tokenStatusAfter: TokenStatus.PRESENT,
            });
            // No dispatch needed - FIREBASE_USER_CHANGED with null user already sets authPhase
            // which derives to tokenStatus 'present' for guest mode
          } else if (tokenStatusRef.current === TokenStatus.PRESENT) {
            // User exists, token already synced in this session
            // authPhase is already 'established', no dispatch needed
            logAuthEvent(AuthTimelineEvent.AUTH_STATE_CHANGE, {
              source: 'auth_listener',
              tokenStatusBefore: TokenStatus.PRESENT,
              tokenStatusAfter: TokenStatus.PRESENT,
              action: 'ensureSubscription',
              email: firebaseUser.email,
            });
            // Fetch subscription from backend (no firebase-sync on refresh)
            ensureSubscriptionRef.current(firebaseUser.email, { reason: 'auth_listener' });
          } else {
            // User exists, no token → need sync
            prevTokenStatusRef.current = tokenStatusRef.current; // Store for abort recovery
            logAuthEvent(AuthTimelineEvent.TOKEN_SYNC_START, {
              source: 'auth_listener',
              tokenStatusBefore: tokenStatusRef.current,
              tokenStatusAfter: TokenStatus.REFRESHING,
              email: firebaseUser.email,
            });
            dispatch({ type: 'TOKEN_SYNC_START', requestId });

            // Sync with backend to get token
            const result = await syncTokenWithBackend(
              firebaseUser,
              requestId,
              authStateGuardRef.current.getSignal,
              authStateGuardRef.current.isStale
            );

            // Update token status based on result
            // Guard: Only update if this is still the current request
            if (!authStateGuardRef.current.isStale(requestId)) {
              if (result.aborted) {
                // Abort is transient - dispatch abort to restore state
                console.warn('[Auth] Token sync aborted');
                logAuthEvent(AuthTimelineEvent.ABORT, {
                  source: 'token_sync',
                  tokenStatusBefore: TokenStatus.REFRESHING,
                  tokenStatusAfter: prevTokenStatusRef.current,
                });
                dispatch({ type: 'TOKEN_SYNC_ABORT', requestId });
              } else if (result.ok) {
                logAuthEvent(AuthTimelineEvent.TOKEN_SYNC_OK, {
                  source: 'token_sync',
                  tokenStatusBefore: TokenStatus.REFRESHING,
                  tokenStatusAfter: TokenStatus.PRESENT,
                });
                dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: result.subscription });
              } else if (result.retryable) {
                // P0 FIX: Gateway errors (502/503/504) - backend waking up
                // Don't degrade to guest - user is still authenticated with Firebase
                // DON'T call ensureSubscription - it requires JWT cookie from firebase-sync
                // Instead, schedule a delayed retry of firebase-sync
                const canRetry = syncRetryCountRef.current < TOKEN_SYNC_MAX_RETRIES;
                console.warn('[Auth] Token sync retryable error, keeping user authenticated', {
                  error: result.error?.message,
                  retryCount: syncRetryCountRef.current,
                  willRetry: canRetry,
                });
                logAuthEvent(AuthTimelineEvent.TOKEN_SYNC_RETRY, {
                  source: 'token_sync',
                  tokenStatusBefore: TokenStatus.REFRESHING,
                  tokenStatusAfter: canRetry ? TokenStatus.REFRESHING : TokenStatus.PRESENT,
                  error: result.error?.message,
                  retryCount: syncRetryCountRef.current,
                  action: canRetry ? 'scheduled_retry' : 'max_retries_exhausted',
                });

                if (canRetry) {
                  // Keep REFRESHING and schedule retry
                  // Don't change tokenStatus - stay in REFRESHING to allow retry
                  syncRetryCountRef.current += 1;
                  syncRetryTimeoutRef.current = setTimeout(async () => {
                    // Re-check if user still exists and we should retry
                    if (!firebaseUser || authStateGuardRef.current.isStale(requestId)) {
                      console.warn('[Auth] Retry cancelled - user changed or request stale');
                      return;
                    }
                    console.warn('[Auth] Retrying firebase-sync after delay', {
                      attempt: syncRetryCountRef.current,
                    });
                    const retryResult = await syncTokenWithBackend(
                      firebaseUser,
                      requestId,
                      authStateGuardRef.current.getSignal,
                      authStateGuardRef.current.isStale
                    );
                    // Handle retry result
                    if (!authStateGuardRef.current.isStale(requestId)) {
                      if (retryResult.ok) {
                        syncRetryCountRef.current = 0; // Reset on success
                        dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: retryResult.subscription });
                      } else if (retryResult.retryable && syncRetryCountRef.current < TOKEN_SYNC_MAX_RETRIES) {
                        // P0 FIX: Chain retry if still retryable and under max
                        console.warn('[Auth] Retry still retryable, scheduling another attempt', {
                          attempt: syncRetryCountRef.current,
                        });
                        syncRetryCountRef.current += 1;
                        dispatch({ type: 'TOKEN_SYNC_RETRY' }); // Track retry count in reducer
                        // Schedule another retry (recursive via setTimeout)
                        syncRetryTimeoutRef.current = setTimeout(async () => {
                          if (!firebaseUser || authStateGuardRef.current.isStale(requestId)) return;
                          const chainResult = await syncTokenWithBackend(
                            firebaseUser, requestId,
                            authStateGuardRef.current.getSignal,
                            authStateGuardRef.current.isStale
                          );
                          if (!authStateGuardRef.current.isStale(requestId)) {
                            if (chainResult.ok) {
                              syncRetryCountRef.current = 0;
                              dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: chainResult.subscription });
                            } else {
                              // Final attempt failed - give up, let 15s timeout handle it
                              // Set established (no subscription) so boot gate opens
                              dispatch({ type: 'TOKEN_SYNC_OK', requestId });
                            }
                          }
                        }, TOKEN_SYNC_RETRY_DELAY_MS);
                      } else {
                        // Non-retryable error OR max retries exhausted - give up
                        // Set established (no subscription) so boot gate opens
                        dispatch({ type: 'TOKEN_SYNC_OK', requestId });
                        // Let 15s subscription timeout handle resolution to free
                      }
                    }
                  }, TOKEN_SYNC_RETRY_DELAY_MS);
                } else {
                  // Max retries exhausted - set established and let 15s timeout handle subscription
                  // P0 FIX: Don't call ensureSubscription - it won't work without JWT cookie
                  dispatch({ type: 'TOKEN_SYNC_OK', requestId });
                }
              } else if (result.authFailure || result.timedOut) {
                // P0 FIX 3: Only degrade to guest on auth failures (401/403) or timeout
                // AUTH INVARIANT: ERROR sets user=null (monotonic guest transition)
                // CRITICAL: Must also resolve subscription to 'free' to unblock boot gate
                console.warn('[Auth] Token sync failed (auth failure or timeout), entering guest mode', {
                  authFailure: result.authFailure,
                  timedOut: result.timedOut,
                  error: result.error?.message,
                });
                logAuthEvent(AuthTimelineEvent.AUTH_FAILURE, {
                  source: 'token_sync',
                  tokenStatusBefore: TokenStatus.REFRESHING,
                  tokenStatusAfter: TokenStatus.ERROR,
                  authFailure: result.authFailure,
                  timedOut: result.timedOut,
                  error: result.error?.message,
                  action: 'clearSubscription',
                });
                const failAction = result.timedOut ? 'TOKEN_SYNC_TIMEOUT' : 'TOKEN_SYNC_FAIL';
                dispatch({ type: failAction, requestId, error: result.error });
                dispatch({ type: 'FIREBASE_USER_CHANGED', user: null }); // Force guest mode
                clearSubscription(); // Resolve subscription as free to unblock boot
              } else {
                // Other errors (network, etc.) - treat like retryable
                // DON'T call ensureSubscription - it requires JWT cookie from firebase-sync
                // Schedule a delayed retry of firebase-sync
                const canRetry = syncRetryCountRef.current < TOKEN_SYNC_MAX_RETRIES;
                console.warn('[Auth] Token sync error (non-auth), keeping user authenticated', {
                  error: result.error?.message,
                  retryCount: syncRetryCountRef.current,
                  willRetry: canRetry,
                });
                logAuthEvent(AuthTimelineEvent.TOKEN_SYNC_ERR, {
                  source: 'token_sync',
                  tokenStatusBefore: TokenStatus.REFRESHING,
                  tokenStatusAfter: canRetry ? TokenStatus.REFRESHING : TokenStatus.PRESENT,
                  error: result.error?.message,
                  retryCount: syncRetryCountRef.current,
                  action: canRetry ? 'scheduled_retry' : 'max_retries_exhausted',
                });

                if (canRetry) {
                  // Keep REFRESHING and schedule retry (same logic as retryable branch)
                  syncRetryCountRef.current += 1;
                  dispatch({ type: 'TOKEN_SYNC_RETRY' }); // Track retry count in reducer
                  syncRetryTimeoutRef.current = setTimeout(async () => {
                    if (!firebaseUser || authStateGuardRef.current.isStale(requestId)) {
                      console.warn('[Auth] Retry cancelled - user changed or request stale');
                      return;
                    }
                    console.warn('[Auth] Retrying firebase-sync after network error', {
                      attempt: syncRetryCountRef.current,
                    });
                    const retryResult = await syncTokenWithBackend(
                      firebaseUser,
                      requestId,
                      authStateGuardRef.current.getSignal,
                      authStateGuardRef.current.isStale
                    );
                    if (!authStateGuardRef.current.isStale(requestId)) {
                      if (retryResult.ok) {
                        syncRetryCountRef.current = 0;
                        dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: retryResult.subscription });
                      } else if (retryResult.retryable && syncRetryCountRef.current < TOKEN_SYNC_MAX_RETRIES) {
                        // P0 FIX: Chain retry if still retryable and under max
                        syncRetryCountRef.current += 1;
                        dispatch({ type: 'TOKEN_SYNC_RETRY' }); // Track retry count in reducer
                        syncRetryTimeoutRef.current = setTimeout(async () => {
                          if (!firebaseUser || authStateGuardRef.current.isStale(requestId)) return;
                          const chainResult = await syncTokenWithBackend(
                            firebaseUser, requestId,
                            authStateGuardRef.current.getSignal,
                            authStateGuardRef.current.isStale
                          );
                          if (!authStateGuardRef.current.isStale(requestId)) {
                            if (chainResult.ok) {
                              syncRetryCountRef.current = 0;
                              dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: chainResult.subscription });
                            } else {
                              // Final attempt failed - set established so boot gate opens
                              dispatch({ type: 'TOKEN_SYNC_OK', requestId });
                            }
                          }
                        }, TOKEN_SYNC_RETRY_DELAY_MS);
                      } else {
                        // Non-retryable or max retries - set established so boot gate opens
                        dispatch({ type: 'TOKEN_SYNC_OK', requestId });
                      }
                    }
                  }, TOKEN_SYNC_RETRY_DELAY_MS);
                } else {
                  // Max retries exhausted - set established and let 15s timeout handle subscription
                  // P0 FIX: Don't call ensureSubscription - it won't work without JWT cookie
                  dispatch({ type: 'TOKEN_SYNC_OK', requestId });
                }
              }
            }
          }
        } catch (err) {
          // Catch-all: Log unexpected errors but NEVER let them block boot.
          // initialized was already set above, so this is just for logging.
          if (!isAbortError(err)) {
            logAuthError('[Auth] Unexpected error in auth state handler', err);
          }
        } finally {
          // Safety net removed - dispatch({ type: 'FIREBASE_USER_CHANGED' }) at line 282
          // now unconditionally sets initialized, so this is no longer needed.
          if (!authStateGuardRef.current.isStale(requestId) && !didSetInitialized) {
            console.warn('[Auth] Safety net: unexpected path - initialized should be set by dispatch');
            setLoading(false);
          }
        }
      });

      /**
       * Sync JWT token with backend (best-effort, non-blocking)
       * This is separated to make the main auth flow clearer.
       * Abort/cancel is expected control flow and logged at debug level.
       *
       * AUTH INVARIANT: Must resolve within TOKEN_REFRESH_TIMEOUT_MS (8s)
       * On timeout → treat as error, not abort (timeouts are real failures)
       *
       * P0 FIX 3: Only degrade to guest mode on 401/403 (auth failures)
       * Gateway errors (502/503/504) should NOT cause guest mode.
       *
       * @returns {{ ok: boolean, aborted: boolean, timedOut?: boolean, retryable?: boolean, authFailure?: boolean, error?: Error }}
       */
      async function syncTokenWithBackend(firebaseUser, requestId, getSignalFn, isStaleFn) {
        try {
          const idToken = await firebaseUser.getIdToken();

          // Wrap API call with timeout to guarantee terminal resolution
          const response = await withTimeout(
            apiClient.post('/auth/firebase-sync', {
              idToken,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
              photoURL: firebaseUser.photoURL,
            }, {
              signal: getSignalFn(),
              __allowRetry: true, // Retry on 502/503/504 (Render cold start)
            }),
            TOKEN_REFRESH_TIMEOUT_MS,
            'Token sync'
          );

          // Guard: Don't update if auth state changed again
          if (isStaleFn(requestId)) {
            return { ok: false, aborted: false, stale: true };
          }

          // Bootstrap subscription from firebase-sync response
          if (response.data.subscription) {
            refreshSubscription({
              bootstrap: response.data.subscription,
              email: firebaseUser.email,
            });
          }
          return { ok: true, aborted: false };
        } catch (err) {
          // Abort/cancel is EXPECTED control flow (not an error)
          if (isAbortError(err)) {
            // Debug level - this happens normally during boot/navigation
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Auth] Token sync cancelled (expected during boot/navigation)');
            }
            return { ok: false, aborted: true };
          }

          // Timeout is a REAL failure (not abort) - must terminate state machine
          if (isTimeoutError(err)) {
            logAuthError('[Auth] Token sync timed out', err, { timeout_ms: TOKEN_REFRESH_TIMEOUT_MS });
            return { ok: false, aborted: false, timedOut: true, error: err };
          }

          // Guard: Check stale after error
          if (isStaleFn(requestId)) {
            return { ok: false, aborted: false, stale: true };
          }

          // P0 FIX 3: Check error status to determine if retryable vs auth failure
          const status = err?.response?.status;
          const isGatewayError = status === 502 || status === 503 || status === 504;
          const isAuthFailure = status === 401 || status === 403;

          if (isGatewayError) {
            // Gateway errors: backend is waking up, don't degrade auth
            console.warn('[Auth] Token sync hit gateway error (backend waking up)', { status });
            return { ok: false, aborted: false, retryable: true, error: err };
          }

          if (isAuthFailure) {
            // Auth failures: token is invalid, must degrade
            logAuthError('[Auth] Token sync auth failure - will degrade to guest', err, { status });
            return { ok: false, aborted: false, authFailure: true, error: err };
          }

          // Other errors (network, etc.) - log but don't throw
          logAuthError('[Auth] Backend token sync failed', err, { status });
          return { ok: false, aborted: false, error: err };
        }
      }

      return () => {
        unsubscribe();
        // P0 Fix 1: Reset for React Strict Mode (simulates unmount/remount in dev)
        // Without this, the double-mount logs misleading "registered more than once" error
        if (process.env.NODE_ENV !== 'production') {
          authListenerRegisteredRef.current = false;
        }
      };
    } catch (err) {
      logAuthError('Failed to initialize Firebase auth', err);
      setLoading(false);
      dispatch({ type: 'FIREBASE_USER_CHANGED', user: null }); // Sets initialized: true
      // No user + initialized = tokenStatus derives to 'present' automatically
    }
  // Register once by design; guard/functions are accessed via refs.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentional: refs provide stable access to latest functions
  }, []);

  // Sync Firebase user with backend
  const syncWithBackend = useCallback(async (firebaseUser) => {
    if (!firebaseUser) return null;

    const requestId = startRequest();

    try {
      // Get Firebase ID token
      const idToken = await firebaseUser.getIdToken();

      // Sync with backend - include profile data from Google OAuth
      const response = await apiClient.post('/auth/firebase-sync', {
        idToken,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
      }, {
        signal: getSignal(),
        __allowRetry: true, // Retry on 502/503/504 (Render cold start)
      });

      // Guard: Don't update if request is stale
      if (isStale(requestId)) return null;

      // Bootstrap subscription from firebase-sync response
      if (response.data.subscription) {
        refreshSubscription({
          bootstrap: response.data.subscription,
          email: firebaseUser.email,
        });
      }

      return response.data;
    } catch (err) {
      // CRITICAL: Never treat abort/cancel as a real error
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return null;
      }
      // Guard: Check stale after error
      if (isStale(requestId)) return null;

      logAuthError('Backend sync failed', err);
      // Don't fail auth - user is still signed in with Firebase
      // Backend sync will retry on next API call
      return null;
    }
  }, [startRequest, isStale, getSignal, refreshSubscription]);

  // Sign in with Google
  // Tries popup first (better UX), falls back to redirect if popup fails
  const signInWithGoogle = useCallback(async () => {
    setError(null);

    if (!isFirebaseConfigured()) {
      setError('Google Sign-In is not configured. Please contact the administrator.');
      throw new Error('Firebase not configured');
    }

    const auth = getFirebaseAuth();
    const provider = getGoogleProvider();

    try {
      // Try popup first - better UX
      const result = await signInWithPopup(auth, provider);

      // Sync with backend to get JWT and subscription status
      const backendData = await syncWithBackend(result.user);

      return {
        firebaseUser: result.user,
        backendData,
      };
    } catch (err) {
      // Check if this is a popup-related error that should trigger fallback
      const shouldFallbackToRedirect =
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request' ||
        err.message?.includes('fireauth') ||
        err.message?.includes('Cross-Origin');

      if (shouldFallbackToRedirect && err.code !== 'auth/popup-closed-by-user') {
        // Fallback to redirect for popup failures (except user-initiated close)
        console.warn('[Auth] Popup failed, falling back to redirect:', err.code || err.message);
        try {
          await signInWithRedirect(auth, provider);
          return null; // Redirect navigates away
        } catch (redirectErr) {
          logAuthError('Google sign-in redirect error', redirectErr);
          setError(getErrorMessage(redirectErr.code));
          throw redirectErr;
        }
      }

      logAuthError('Google sign-in error', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  }, [syncWithBackend]);

  // Sign out
  const logout = useCallback(async () => {
    setError(null);

    // Dispatch LOGOUT to reset auth state (sets user=null, tier=free, authPhase=idle)
    dispatch({ type: 'LOGOUT' });
    // Clear subscription state
    clearSubscription();
    // Clear TanStack Query cache to prevent stale data from previous user
    queryClient.clear();

    if (!isFirebaseConfigured()) {
      // LOGOUT already set user to null, but dispatch again for consistency
      dispatch({ type: 'FIREBASE_USER_CHANGED', user: null });
      await apiClient.post('/auth/logout');
      return;
    }

    try {
      const auth = getFirebaseAuth();
      await signOut(auth);
      await apiClient.post('/auth/logout');
    } catch (err) {
      logAuthError('Sign-out error', err);
      setError('Failed to sign out. Please try again.');
      throw err;
    }
  }, []);

  // Get user-friendly error message
  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/popup-closed-by-user':
        return 'Sign-in cancelled. Please try again.';
      case 'auth/popup-blocked':
        return 'Pop-up blocked by browser. Please allow pop-ups and try again.';
      case 'auth/cancelled-popup-request':
        return 'Only one sign-in window can be open at a time.';
      case 'auth/network-request-failed':
        return 'Network error. Please check your connection.';
      case 'auth/unauthorized-domain':
        return 'This domain is not authorized for sign-in.';
      case 'auth/invalid-api-key':
        return 'Authentication is not configured. Please contact the administrator.';
      default:
        return 'An error occurred during sign-in. Please try again.';
    }
  };

  // Refresh token - get new Firebase ID token and sync with backend
  // Call this when you suspect the JWT may be expired
  // Returns structured result: { ok: boolean, tokenStored: boolean, reason?: string }
  // P0 FIX: Uses separate tokenRefreshGuard to avoid aborting syncTokenWithBackend
  const refreshToken = useCallback(async () => {
    console.warn('[Auth] refreshToken called');

    if (!coordState.user) {
      console.warn('[Auth] Cannot refresh token - no user');
      return { ok: false, tokenStored: false, reason: 'no_user' };
    }

    // Use SEPARATE guard to avoid aborting syncTokenWithBackend
    const requestId = tokenRefreshGuard.startRequest();

    // Update token status to refreshing via dispatch
    prevTokenStatusRef.current = derivedTokenStatusForRef; // Store for abort recovery
    dispatch({ type: 'TOKEN_SYNC_START', requestId });

    try {
      // Force refresh the Firebase ID token
      const idToken = await coordState.user.getIdToken(true); // true = force refresh

      // Wrap API call with timeout to guarantee terminal resolution
      const response = await withTimeout(
        apiClient.post('/auth/firebase-sync', {
          idToken,
          email: coordState.user.email,
          displayName: coordState.user.displayName,
          photoURL: coordState.user.photoURL,
        }, {
          signal: tokenRefreshGuard.getSignal(),
          __allowRetry: true, // Retry on 502/503/504 (Render cold start)
        }),
        TOKEN_REFRESH_TIMEOUT_MS,
        'Token refresh'
      );

      // Guard: Don't update if request is stale
      if (tokenRefreshGuard.isStale(requestId)) {
        return { ok: false, tokenStored: false, reason: 'stale_request' };
      }

      // Bootstrap subscription from firebase-sync response
      if (response.data.subscription) {
        refreshSubscription({
          bootstrap: response.data.subscription,
          email: coordState.user.email,
        });
      }
      dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: response.data.subscription });
      return { ok: true, tokenStored: true, reason: null };
    } catch (err) {
      // Handle abort/cancel errors - restore previous status
      if (isAbortError(err)) {
        // Abort is transient - dispatch abort to restore state
        if (!tokenRefreshGuard.isStale(requestId)) {
          dispatch({ type: 'TOKEN_SYNC_ABORT' });
        }
        return { ok: false, tokenStored: false, reason: 'aborted' };
      }

      // Guard: Check stale after error
      if (tokenRefreshGuard.isStale(requestId)) {
        return { ok: false, tokenStored: false, reason: 'stale_request' };
      }

      // P0 FIX 3: Classify error type
      const status = err?.response?.status;
      const isGatewayError = status === 502 || status === 503 || status === 504;
      const isAuthFailure = status === 401 || status === 403;
      const isTimeout = isTimeoutError(err);

      const reason = isTimeout ? 'timeout'
        : isAuthFailure ? `${status}_auth_failure`
        : isGatewayError ? `${status}_gateway_error`
        : err.message?.includes('Network') ? 'network_error'
        : 'unknown_error';

      logAuthError('[Auth] Token refresh failed', err, { reason, status });

      // P0 FIX 3: Only degrade to guest on auth failures or timeout
      if (isAuthFailure || isTimeout) {
        console.warn('[Auth] Token refresh auth failure/timeout, entering guest mode', { reason });
        const failAction = isTimeout ? 'TOKEN_SYNC_TIMEOUT' : 'TOKEN_SYNC_FAIL';
        dispatch({ type: failAction, requestId, error: err });
        dispatch({ type: 'FIREBASE_USER_CHANGED', user: null }); // Force guest mode
        clearSubscription(); // Resolve subscription as free to unblock boot
      } else {
        // Gateway errors or network errors - keep established (Firebase auth valid)
        console.warn('[Auth] Token refresh retryable error, keeping user authenticated', { reason });
        dispatch({ type: 'TOKEN_SYNC_OK', requestId }); // No subscription, but establish connection
      }
      return { ok: false, tokenStored: false, reason };
    }
  }, [coordState.user, tokenRefreshGuard, clearSubscription, dispatch, refreshSubscription]);

  // Manual retry for token sync (called by BootStuckBanner)
  // P0 FIX: Uses tokenRefreshGuard (not authStateGuard) to avoid cross-abort
  // P0 FIX: On missing token, set MISSING (not ERROR) to avoid re-entering deadlock
  // P0 FIX: On abort, restore prev status (not stay REFRESHING) to avoid stuck state
  const retryTokenSync = useCallback(async () => {
    if (!coordState.user) {
      console.warn('[Auth] Cannot retry token sync - no user');
      return { ok: false, reason: 'no_user' };
    }

    console.warn('[Auth] Manual token sync retry triggered');

    // Use tokenRefreshGuard - separate from authStateGuard
    const requestId = tokenRefreshGuard.startRequest();

    prevTokenStatusRef.current = derivedTokenStatusForRef; // Store for abort recovery
    dispatch({ type: 'TOKEN_SYNC_START', requestId });

    try {
      const idToken = await coordState.user.getIdToken(true); // Force refresh

      // Wrap API call with timeout to guarantee terminal resolution
      const response = await withTimeout(
        apiClient.post('/auth/firebase-sync', {
          idToken,
          email: coordState.user.email,
          displayName: coordState.user.displayName,
          photoURL: coordState.user.photoURL,
        }, {
          signal: tokenRefreshGuard.getSignal(),
          __allowRetry: true, // Retry on 502/503/504 (Render cold start)
        }),
        TOKEN_REFRESH_TIMEOUT_MS,
        'Token sync retry'
      );

      // Guard: Don't update if request is stale
      if (tokenRefreshGuard.isStale(requestId)) {
        return { ok: false, reason: 'stale_request' };
      }

      // Bootstrap subscription from firebase-sync response
      if (response.data.subscription) {
        refreshSubscription({
          bootstrap: response.data.subscription,
          email: coordState.user.email,
        });
      }
      dispatch({ type: 'TOKEN_SYNC_OK', requestId, subscription: response.data.subscription });
      console.warn('[Auth] Token sync retry succeeded');
      return { ok: true, reason: null };
    } catch (err) {
      // Abort is transient - dispatch abort to restore state
      if (isAbortError(err)) {
        console.warn('[Auth] Token sync retry aborted, restoring prev status:', prevTokenStatusRef.current);
        if (!tokenRefreshGuard.isStale(requestId)) {
          dispatch({ type: 'TOKEN_SYNC_ABORT' });
        }
        return { ok: false, reason: 'aborted' };
      }

      // Guard: Check stale after error
      if (tokenRefreshGuard.isStale(requestId)) {
        return { ok: false, reason: 'stale_request' };
      }

      // P0 FIX 3: Classify error type
      const status = err?.response?.status;
      const isGatewayError = status === 502 || status === 503 || status === 504;
      const isAuthFailure = status === 401 || status === 403;
      const isTimeout = isTimeoutError(err);

      const reason = isTimeout ? 'timeout'
        : isAuthFailure ? `${status}_auth_failure`
        : isGatewayError ? `${status}_gateway_error`
        : 'error';

      logAuthError('[Auth] Token sync retry failed', err, { reason, status });

      // P0 FIX 3: Only degrade to guest on auth failures or timeout
      if (isAuthFailure || isTimeout) {
        console.warn('[Auth] Token sync retry auth failure/timeout, entering guest mode', { reason });
        const failAction = isTimeout ? 'TOKEN_SYNC_TIMEOUT' : 'TOKEN_SYNC_FAIL';
        dispatch({ type: failAction, requestId, error: err });
        dispatch({ type: 'FIREBASE_USER_CHANGED', user: null }); // Force guest mode
        clearSubscription(); // Resolve subscription as free to unblock boot
      } else {
        // Gateway errors or network errors - keep established (Firebase auth valid)
        console.warn('[Auth] Token sync retry retryable error, keeping user authenticated', { reason });
        dispatch({ type: 'TOKEN_SYNC_OK', requestId }); // No subscription, but establish connection
      }
      return { ok: false, reason };
    }
  }, [coordState.user, tokenRefreshGuard, clearSubscription, dispatch, refreshSubscription]);

  // Shared refresh promise ref - persists across effect runs
  // SINGLE-FLIGHT PATTERN: concurrent 401s await the same refresh
  const refreshPromiseRef = useRef(null);
  const lastRefreshTimeRef = useRef(0);

  // Listen for auth:token-expired events from API client
  // When a 401 occurs on non-auth endpoints, the client dispatches this event
  // We handle it by refreshing the token and notifying listeners to retry
  useEffect(() => {
    const REFRESH_DEBOUNCE_MS = 2000; // Prevent more than one refresh per 2s

    const handleTokenExpired = async (event) => {
      const { url } = event.detail || {};
      const now = Date.now();

      // Debounce: Skip if refresh was done recently
      if (now - lastRefreshTimeRef.current < REFRESH_DEBOUNCE_MS) {
        console.warn('[Auth] Token refresh skipped (debounced)', { url });
        return;
      }

      // Skip if no user (not logged in)
      if (!coordState.user) {
        console.warn('[Auth] Token expired but no user - ignoring');
        return;
      }

      // SINGLE-FLIGHT: If refresh in progress, await the same promise
      if (refreshPromiseRef.current) {
        console.warn('[Auth] Token refresh in progress - awaiting existing promise', { url });
        try {
          await refreshPromiseRef.current;
        } catch {
          // Existing refresh failed
        }
        return;
      }

      console.warn('[Auth] Token expired event received, refreshing...', { url });

      // Create shared promise for this refresh (stored in ref for persistence)
      refreshPromiseRef.current = (async () => {
        try {
          const result = await refreshToken();
          console.warn('[Auth] Token refresh result:', result);

          if (result.ok) {
            lastRefreshTimeRef.current = Date.now();
            window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
              detail: { originalUrl: url }
            }));
            return { ok: true };
          } else {
            console.error('[Auth] Token refresh failed:', result.reason);
            window.dispatchEvent(new CustomEvent('auth:token-refresh-failed', {
              detail: { reason: result.reason, originalUrl: url }
            }));
            return { ok: false, reason: result.reason };
          }
        } catch (err) {
          logAuthError('[Auth] Token refresh threw error', err);
          throw err;
        } finally {
          refreshPromiseRef.current = null;
        }
      })();

      await refreshPromiseRef.current;
    };

    window.addEventListener('auth:token-expired', handleTokenExpired);

    return () => {
      window.removeEventListener('auth:token-expired', handleTokenExpired);
    };
  }, [coordState.user, refreshToken]);

  // Derived: tokenStatus from coordState.authPhase (Phase 2 migration)
  const derivedTokenStatus = deriveTokenStatus(
    coordState.authPhase,
    coordState.user,
    coordState.initialized
  );
  const tokenReady = derivedTokenStatus === TokenStatus.PRESENT;

  const value = useMemo(() => ({
    user: coordState.user,
    loading,
    authUiLoading, // Separate UI loading for Google button (5s max)
    initialized: coordState.initialized,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    refreshToken, // Exposed for explicit token refresh
    retryTokenSync, // Manual retry for BootStuckBanner
    isAuthenticated: !!coordState.user,
    isConfigured: isFirebaseConfigured(),
    // Token state machine - now derived from coordState.authPhase
    tokenStatus: derivedTokenStatus,
    tokenReady,
  }), [
    coordState.user,
    coordState.initialized,
    coordState.authPhase,
    loading,
    authUiLoading,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    refreshToken,
    retryTokenSync,
    derivedTokenStatus,
    tokenReady,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
