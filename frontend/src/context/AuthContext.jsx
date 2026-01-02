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

// Detect mobile browser
const isMobile = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

/**
 * Helper: Check if error is an abort/cancel (expected control flow, not a real error)
 * Abort happens when: component unmounts, newer request starts, or user navigates away.
 * This is EXPECTED behavior and should never block app readiness.
 */
export const isAbortError = (err) => {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
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
 * - 'present': Token exists in localStorage
 * - 'missing': No token, user authenticated (need sync)
 * - 'refreshing': Token sync in progress
 * - 'error': Token sync failed (non-abort)
 *
 * INVARIANT: tokenStatus does NOT mean "sync succeeded".
 * Subscription fetch must not deadlock if backend sync fails.
 */
const TokenStatus = {
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

  // Separate UI loading state for Google button (5s max)
  // This allows the button to become enabled even if Firebase is slow
  // Cleared by: 1) onAuthStateChanged callback, or 2) 5s timeout fallback
  const [authUiLoading, setAuthUiLoading] = useState(true);

  // Token status state machine - initialize based on localStorage
  const [tokenStatus, setTokenStatus] = useState(() => {
    return localStorage.getItem('token') ? TokenStatus.PRESENT : TokenStatus.MISSING;
  });

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

  // 5s safety net for authUiLoading - enables Google button even if Firebase is slow
  useEffect(() => {
    if (!authUiLoading) return; // Already cleared

    const uiLoadingTimeout = setTimeout(() => {
      if (authUiLoading) {
        console.warn('[Auth] UI loading timeout (5s) - enabling Google button');
        setAuthUiLoading(false);
        // NOTE: Does NOT set initialized - that's a separate contract
      }
    }, 5000);

    return () => clearTimeout(uiLoadingTimeout);
  }, [authUiLoading]);

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
              });

              if (!authStateGuardRef.current.isStale(requestId) && response.data.token) {
                localStorage.setItem('token', response.data.token);
                // Bootstrap subscription from firebase-sync response
                if (response.data.subscription) {
                  bootstrapSubscriptionRef.current(response.data.subscription, result.user.email);
                }
              }
            } catch (err) {
              if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
                console.error('[Auth] Backend sync failed after redirect:', err);
              }
            }
          }
        })
        .catch((err) => {
          console.error('[Auth] Redirect result error:', err);
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
          } else if (localStorage.getItem('token')) {
            // User exists, token exists (page refresh)
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
              } else {
                // Non-abort error → set error state
                // P0 FIX: Bootstrap subscription with free tier to break deadlock.
                // Without this, subscription stays in PENDING forever because:
                // 1. fetchSubscription checks for token (missing) and returns early
                // 2. Subscription never transitions out of PENDING
                // 3. AppReadyContext waits forever
                // By bootstrapping free tier, we ensure subscription resolves and boot completes.
                setTokenStatus(TokenStatus.ERROR);
                bootstrapSubscriptionRef.current(
                  { tier: 'free', subscribed: false, ends_at: null },
                  firebaseUser.email
                );
              }
            }
          }
        } catch (err) {
          // Catch-all: Log unexpected errors but NEVER let them block boot.
          // initialized was already set above, so this is just for logging.
          if (!isAbortError(err)) {
            console.error('[Auth] Unexpected error in auth state handler:', err);
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
       * @returns {{ ok: boolean, aborted: boolean, error?: Error }}
       */
      async function syncTokenWithBackend(firebaseUser, requestId, getSignalFn, isStaleFn) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const response = await apiClient.post('/auth/firebase-sync', {
            idToken,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          }, {
            signal: getSignalFn(),
          });

          // Guard: Don't update if auth state changed again
          if (isStaleFn(requestId)) {
            return { ok: false, aborted: false, stale: true };
          }

          if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            // Bootstrap subscription from firebase-sync response
            if (response.data.subscription) {
              bootstrapSubscription(response.data.subscription, firebaseUser.email);
            }
            return { ok: true, aborted: false };
          }

          return { ok: false, aborted: false, error: new Error('No token in response') };
        } catch (err) {
          // Abort/cancel is EXPECTED control flow (not an error)
          if (isAbortError(err)) {
            // Debug level - this happens normally during boot/navigation
            if (process.env.NODE_ENV === 'development') {
              console.warn('[Auth] Token sync cancelled (expected during boot/navigation)');
            }
            return { ok: false, aborted: true };
          }
          // Guard: Check stale after error
          if (isStaleFn(requestId)) {
            return { ok: false, aborted: false, stale: true };
          }

          // Real error - log but don't throw (non-blocking)
          console.error('[Auth] Backend token sync failed:', err);
          return { ok: false, aborted: false, error: err };
        }
      }

      return () => unsubscribe();
    } catch (err) {
      console.error('Failed to initialize Firebase auth:', err);
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
      });

      // Guard: Don't update if request is stale
      if (isStale(requestId)) return null;

      // Store JWT for subsequent API calls
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        // Bootstrap subscription from firebase-sync response
        if (response.data.subscription) {
          bootstrapSubscription(response.data.subscription, firebaseUser.email);
        }
      }

      return response.data;
    } catch (err) {
      // CRITICAL: Never treat abort/cancel as a real error
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return null;
      }
      // Guard: Check stale after error
      if (isStale(requestId)) return null;

      console.error('Backend sync failed:', err);
      // Don't fail auth - user is still signed in with Firebase
      // Backend sync will retry on next API call
      return null;
    }
  }, [startRequest, isStale, getSignal]);

  // Sign in with Google
  const signInWithGoogle = useCallback(async () => {
    setError(null);

    if (!isFirebaseConfigured()) {
      setError('Google Sign-In is not configured. Please contact the administrator.');
      throw new Error('Firebase not configured');
    }

    try {
      const auth = getFirebaseAuth();
      const provider = getGoogleProvider();

      // Use redirect on mobile (popups don't work reliably)
      if (isMobile()) {
        await signInWithRedirect(auth, provider);
        // Redirect will navigate away - result handled in useEffect
        return null;
      }

      // Use popup on desktop
      const result = await signInWithPopup(auth, provider);

      // Sync with backend to get JWT and subscription status
      const backendData = await syncWithBackend(result.user);

      return {
        firebaseUser: result.user,
        backendData,
      };
    } catch (err) {
      console.error('Google sign-in error:', err);
      setError(getErrorMessage(err.code));
      throw err;
    }
  }, [syncWithBackend]);

  // Sign out
  const logout = useCallback(async () => {
    setError(null);

    // Clear JWT token
    localStorage.removeItem('token');
    // Clear subscription state
    clearSubscription();
    // Clear TanStack Query cache to prevent stale data from previous user
    queryClient.clear();

    if (!isFirebaseConfigured()) {
      setUser(null);
      return;
    }

    try {
      const auth = getFirebaseAuth();
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
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
    console.warn('[Auth] refreshToken called, user:', user?.email);

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
      console.warn('[Auth] Getting fresh Firebase ID token...');
      const idToken = await user.getIdToken(true); // true = force refresh
      console.warn('[Auth] Got Firebase ID token, length:', idToken?.length);

      console.warn('[Auth] Calling /auth/firebase-sync...');
      const response = await apiClient.post('/auth/firebase-sync', {
        idToken,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      }, {
        signal: tokenRefreshGuard.getSignal(),
      });

      console.warn('[Auth] firebase-sync response:', {
        status: response.status,
        hasToken: !!response.data?.token,
        tokenLength: response.data?.token?.length,
        subscription: response.data?.subscription,
      });

      // Guard: Don't update if request is stale
      if (tokenRefreshGuard.isStale(requestId)) {
        return { ok: false, tokenStored: false, reason: 'stale_request' };
      }

      // Store new JWT
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        // Bootstrap subscription from firebase-sync response
        if (response.data.subscription) {
          bootstrapSubscription(response.data.subscription, user.email);
        }
        const storedToken = localStorage.getItem('token');
        const tokenStored = storedToken === response.data.token;
        console.warn('[Auth] Token stored successfully:', tokenStored);
        // Update token status
        setTokenStatus(TokenStatus.PRESENT);
        return { ok: true, tokenStored, reason: null };
      }

      console.warn('[Auth] firebase-sync response missing token');
      setTokenStatus(TokenStatus.ERROR);
      return { ok: false, tokenStored: false, reason: 'no_token_in_response' };
    } catch (err) {
      // Handle abort/cancel errors - restore previous status
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
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

      const reason = err.response?.status === 401 ? '401_unauthorized'
        : err.response?.status === 500 ? '500_server_error'
        : err.message?.includes('Network') ? 'network_error'
        : 'unknown_error';

      console.error('[Auth] Token refresh failed:', {
        reason,
        status: err.response?.status,
        message: err.message,
        data: err.response?.data,
      });

      // Non-abort error → set error state
      setTokenStatus(TokenStatus.ERROR);
      return { ok: false, tokenStored: false, reason };
    }
  }, [user, tokenRefreshGuard, tokenStatus]);

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
      const response = await apiClient.post('/auth/firebase-sync', {
        idToken,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      }, {
        signal: tokenRefreshGuard.getSignal(),
      });

      // Guard: Don't update if request is stale
      if (tokenRefreshGuard.isStale(requestId)) {
        return { ok: false, reason: 'stale_request' };
      }

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        // Bootstrap subscription from firebase-sync response
        if (response.data.subscription) {
          bootstrapSubscription(response.data.subscription, user.email);
        }
        setTokenStatus(TokenStatus.PRESENT);
        console.warn('[Auth] Token sync retry succeeded');
        return { ok: true, reason: null };
      }

      // No token in response → set ERROR and bootstrap free tier
      // P0 FIX: Ensure subscription is resolved to break deadlock
      console.warn('[Auth] Token sync response missing token');
      setTokenStatus(TokenStatus.ERROR);
      bootstrapSubscription(
        { tier: 'free', subscribed: false, ends_at: null },
        user.email
      );
      return { ok: false, reason: 'no_token_in_response' };
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

      // P0 FIX: Bootstrap free tier on error to ensure subscription resolves
      console.error('[Auth] Token sync retry failed:', err);
      setTokenStatus(TokenStatus.ERROR);
      bootstrapSubscription(
        { tier: 'free', subscribed: false, ends_at: null },
        user.email
      );
      return { ok: false, reason: 'error' };
    }
  }, [user, tokenRefreshGuard, tokenStatus, bootstrapSubscription]);

  // Listen for auth:token-expired events from API client
  // When a 401 occurs on non-auth endpoints, the client dispatches this event
  // We handle it by refreshing the token and notifying listeners to retry
  // Includes time-based debounce to prevent rapid-fire refresh attempts
  useEffect(() => {
    let isRefreshing = false;
    let lastRefreshTime = 0;
    const REFRESH_DEBOUNCE_MS = 2000; // Prevent more than one refresh per 2s

    const handleTokenExpired = async (event) => {
      const { url } = event.detail || {};
      const now = Date.now();

      // Debounce: Skip if refresh was done recently
      if (now - lastRefreshTime < REFRESH_DEBOUNCE_MS) {
        console.warn('[Auth] Token refresh skipped (debounced)', { url });
        return;
      }

      // Skip if no user (not logged in)
      if (!user) {
        console.warn('[Auth] Token expired but no user - ignoring');
        return;
      }

      // Skip if already refreshing (debounce parallel 401s)
      if (isRefreshing) {
        console.warn('[Auth] Token refresh already in progress - skipping');
        return;
      }

      console.warn('[Auth] Token expired event received, refreshing...', { url });
      isRefreshing = true;

      try {
        const result = await refreshToken();
        console.warn('[Auth] Token refresh result:', result);

        if (result.ok) {
          // Only update lastRefreshTime on SUCCESS (requirement: debounce successful refreshes)
          lastRefreshTime = Date.now();
          // Emit event so components can retry their failed requests
          window.dispatchEvent(new CustomEvent('auth:token-refreshed', {
            detail: { originalUrl: url }
          }));
        } else {
          // Refresh failed - user may need to re-login
          console.error('[Auth] Token refresh failed:', result.reason);
          // Emit failure event so UI can show re-login prompt
          window.dispatchEvent(new CustomEvent('auth:token-refresh-failed', {
            detail: { reason: result.reason, originalUrl: url }
          }));
        }
      } catch (err) {
        console.error('[Auth] Token refresh threw error:', err);
      } finally {
        isRefreshing = false;
      }
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
