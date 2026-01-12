import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from '../lib/firebase';
import { queryClient } from '../lib/queryClient';
import apiClient from '../api/client';
import { useSubscription } from './SubscriptionContext';

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
    requestIdRef.current += 1;
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // UI loading state for Google button
  // Cleared when onAuthStateChanged fires (Firebase auth state is known)
  const [authUiLoading, setAuthUiLoading] = useState(true);

  // Token status state machine - initialize as missing (cookie is HttpOnly)
  const [tokenStatus, setTokenStatus] = useState(TokenStatus.MISSING);

  // Track previous status for safe abort recovery (restore on abort, don't downgrade)
  const prevTokenStatusRef = useRef(tokenStatus);

  // SEPARATE stale guards to prevent cross-abort between operations
  // P0 FIX: refreshToken() must NOT abort syncTokenWithBackend()
  const authStateGuard = useStaleRequestGuard();  // For onAuthStateChanged sync
  const tokenRefreshGuard = useStaleRequestGuard(); // For refreshToken() calls

  // Subscription context methods (SubscriptionProvider wraps AuthProvider)
  const {
    bootstrapSubscription,
    ensureSubscription,
    clearSubscription,
  } = useSubscription();

  // P0 FIX: Ensure auth listener registers exactly once.
  // Use refs so callback always reads latest functions/state without re-registering.
  const authListenerRegisteredRef = useRef(false);
  const authStateGuardRef = useRef(authStateGuard);
  authStateGuardRef.current = authStateGuard;
  const ensureSubscriptionRef = useRef(ensureSubscription);
  ensureSubscriptionRef.current = ensureSubscription;
  const bootstrapSubscriptionRef = useRef(bootstrapSubscription);
  bootstrapSubscriptionRef.current = bootstrapSubscription;
  const tokenStatusRef = useRef(tokenStatus);
  tokenStatusRef.current = tokenStatus;

  // Legacy alias for backwards compatibility (used by syncWithBackend)
  const { startRequest, isStale, getSignal } = authStateGuard;

  // Initialize auth listener only if Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // Firebase not configured - skip auth listener
      setInitialized(true);
      setAuthUiLoading(false); // Clear UI loading
      // No user = token not needed
      setTokenStatus(TokenStatus.PRESENT);
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
                  bootstrapSubscriptionRef.current(response.data.subscription, result.user.email);
                }
                setTokenStatus(TokenStatus.PRESENT);
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

        // INVARIANT: Set user and initialized IMMEDIATELY when Firebase tells us auth state.
        // This MUST happen before any async operations to guarantee boot completes.
        // The try/finally ensures initialized is set even if subsequent code throws.
        try {
          setUser(firebaseUser);

          // CRITICAL: Set initialized=true SYNCHRONOUSLY after we know auth state.
          // This is the ONLY place initialized should be set for normal auth flow.
          // Guard: Only set if this is still the current request (prevents race conditions)
          if (!authStateGuardRef.current.isStale(requestId)) {
            setLoading(false);
            setAuthUiLoading(false); // Clear UI loading on first auth state
            setInitialized(true);
            didSetInitialized = true;
          }

          // === TOKEN STATUS STATE MACHINE ===
          if (!firebaseUser) {
            // No user → token not needed (treat as 'present' for gating purposes)
            setTokenStatus(TokenStatus.PRESENT);
          } else if (tokenStatusRef.current === TokenStatus.PRESENT) {
            // User exists, token already synced in this session
            setTokenStatus(TokenStatus.PRESENT);
            // Fetch subscription from backend (no firebase-sync on refresh)
            ensureSubscriptionRef.current(firebaseUser.email, { reason: 'auth_listener' });
          } else {
            // User exists, no token → need sync
            prevTokenStatusRef.current = tokenStatusRef.current; // Store for abort recovery
            setTokenStatus(TokenStatus.REFRESHING);

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
                // Abort is transient - restore previous status (never stay in REFRESHING)
                // This avoids accidentally downgrading PRESENT→MISSING on abort
                console.warn('[Auth] Token sync aborted, restoring prev status:', prevTokenStatusRef.current);
                setTokenStatus(prevTokenStatusRef.current);
              } else if (result.ok) {
                setTokenStatus(TokenStatus.PRESENT);
              } else if (result.retryable) {
                // P0 FIX 3: Gateway errors (502/503/504) - backend waking up
                // Don't degrade to guest - user is still authenticated with Firebase
                // Keep PRESENT status - Firebase auth is valid, backend just needs to wake up
                // The "backend waking up" banner will show via isBootSlow
                console.warn('[Auth] Token sync retryable error, keeping user authenticated', {
                  error: result.error?.message,
                });
                setTokenStatus(TokenStatus.PRESENT);
                // ensureSubscription will handle subscription fetch when backend is ready
              } else if (result.authFailure || result.timedOut) {
                // P0 FIX 3: Only degrade to guest on auth failures (401/403) or timeout
                // AUTH INVARIANT: ERROR sets user=null (monotonic guest transition)
                // CRITICAL: Must also resolve subscription to 'free' to unblock boot gate
                console.warn('[Auth] Token sync failed (auth failure or timeout), entering guest mode', {
                  authFailure: result.authFailure,
                  timedOut: result.timedOut,
                  error: result.error?.message,
                });
                setTokenStatus(TokenStatus.ERROR);
                setUser(null); // Force guest mode - user must re-login
                clearSubscription(); // Resolve subscription as free to unblock boot
              } else {
                // Other errors (network, etc.) - don't degrade, similar to retryable
                // Keep PRESENT - Firebase auth is valid
                console.warn('[Auth] Token sync error (non-auth), keeping user authenticated', {
                  error: result.error?.message,
                });
                setTokenStatus(TokenStatus.PRESENT);
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
          // SAFETY NET: Guarantee initialized is set even if everything above fails.
          // This is defensive programming - the try block should always set it,
          // but this ensures no code path can leave boot stuck.
          if (!authStateGuardRef.current.isStale(requestId) && !didSetInitialized) {
            console.warn('[Auth] Safety net: setting initialized in finally block');
            setLoading(false);
            setInitialized(true);
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
            bootstrapSubscription(response.data.subscription, firebaseUser.email);
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
      setInitialized(true);
      // If init fails, mark token as present (no blocking)
      setTokenStatus(TokenStatus.PRESENT);
    }
  // Register once by design; guard/functions are accessed via refs.
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
        bootstrapSubscription(response.data.subscription, firebaseUser.email);
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
  }, [startRequest, isStale, getSignal]);

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

    setTokenStatus(TokenStatus.MISSING);
    // Clear subscription state
    clearSubscription();
    // Clear TanStack Query cache to prevent stale data from previous user
    queryClient.clear();

    if (!isFirebaseConfigured()) {
      setUser(null);
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

    if (!user) {
      console.warn('[Auth] Cannot refresh token - no user');
      return { ok: false, tokenStored: false, reason: 'no_user' };
    }

    // Use SEPARATE guard to avoid aborting syncTokenWithBackend
    const requestId = tokenRefreshGuard.startRequest();

    // Update token status to refreshing
    prevTokenStatusRef.current = tokenStatus; // Store for abort recovery
    setTokenStatus(TokenStatus.REFRESHING);

    try {
      // Force refresh the Firebase ID token
      const idToken = await user.getIdToken(true); // true = force refresh

      // Wrap API call with timeout to guarantee terminal resolution
      const response = await withTimeout(
        apiClient.post('/auth/firebase-sync', {
          idToken,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
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
        bootstrapSubscription(response.data.subscription, user.email);
      }
      setTokenStatus(TokenStatus.PRESENT);
      return { ok: true, tokenStored: true, reason: null };
    } catch (err) {
      // Handle abort/cancel errors - restore previous status
      if (isAbortError(err)) {
        // Abort is transient - restore prev status (never stay in REFRESHING)
        if (!tokenRefreshGuard.isStale(requestId)) {
          setTokenStatus(prevTokenStatusRef.current);
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
        setTokenStatus(TokenStatus.ERROR);
        setUser(null); // Force guest mode
        clearSubscription(); // Resolve subscription as free to unblock boot
      } else {
        // Gateway errors or network errors - keep PRESENT (Firebase auth valid)
        console.warn('[Auth] Token refresh retryable error, keeping user authenticated', { reason });
        setTokenStatus(TokenStatus.PRESENT);
      }
      return { ok: false, tokenStored: false, reason };
    }
  }, [user, tokenRefreshGuard, tokenStatus, clearSubscription]);

  // Manual retry for token sync (called by BootStuckBanner)
  // P0 FIX: Uses tokenRefreshGuard (not authStateGuard) to avoid cross-abort
  // P0 FIX: On missing token, set MISSING (not ERROR) to avoid re-entering deadlock
  // P0 FIX: On abort, restore prev status (not stay REFRESHING) to avoid stuck state
  const retryTokenSync = useCallback(async () => {
    if (!user) {
      console.warn('[Auth] Cannot retry token sync - no user');
      return { ok: false, reason: 'no_user' };
    }

    console.warn('[Auth] Manual token sync retry triggered');
    prevTokenStatusRef.current = tokenStatus; // Store for abort recovery
    setTokenStatus(TokenStatus.REFRESHING);

    // Use tokenRefreshGuard - separate from authStateGuard
    const requestId = tokenRefreshGuard.startRequest();

    try {
      const idToken = await user.getIdToken(true); // Force refresh

      // Wrap API call with timeout to guarantee terminal resolution
      const response = await withTimeout(
        apiClient.post('/auth/firebase-sync', {
          idToken,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
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
        bootstrapSubscription(response.data.subscription, user.email);
      }
      setTokenStatus(TokenStatus.PRESENT);
      console.warn('[Auth] Token sync retry succeeded');
      return { ok: true, reason: null };
    } catch (err) {
      // Abort is transient - restore prev status (never stay in REFRESHING)
      if (isAbortError(err)) {
        console.warn('[Auth] Token sync retry aborted, restoring prev status:', prevTokenStatusRef.current);
        if (!tokenRefreshGuard.isStale(requestId)) {
          setTokenStatus(prevTokenStatusRef.current);
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
        setTokenStatus(TokenStatus.ERROR);
        setUser(null); // Force guest mode
        clearSubscription(); // Resolve subscription as free to unblock boot
      } else {
        // Gateway errors or network errors - keep PRESENT (Firebase auth valid)
        console.warn('[Auth] Token sync retry retryable error, keeping user authenticated', { reason });
        setTokenStatus(TokenStatus.PRESENT);
      }
      return { ok: false, reason };
    }
  }, [user, tokenRefreshGuard, tokenStatus, clearSubscription]);

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
      if (!user) {
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
  }, [user, refreshToken]);

  // Derived: is token ready for API calls?
  const tokenReady = tokenStatus === TokenStatus.PRESENT;

  const value = useMemo(() => ({
    user,
    loading,
    authUiLoading, // Separate UI loading for Google button (5s max)
    initialized,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    refreshToken, // Exposed for explicit token refresh
    retryTokenSync, // Manual retry for BootStuckBanner
    isAuthenticated: !!user,
    isConfigured: isFirebaseConfigured(),
    // Token state machine
    tokenStatus, // 'present' | 'missing' | 'refreshing' | 'error'
    tokenReady,  // Derived: tokenStatus === 'present'
  }), [
    user,
    loading,
    authUiLoading,
    initialized,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    refreshToken,
    retryTokenSync,
    tokenStatus,
    tokenReady,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
