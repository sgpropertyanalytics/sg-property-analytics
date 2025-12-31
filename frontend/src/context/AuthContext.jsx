import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from '../lib/firebase';
import apiClient from '../api/client';
import { useStaleRequestGuard } from '../hooks';

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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [initialized, setInitialized] = useState(false);

  // Abort/stale request protection for API calls
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Initialize auth listener only if Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      // Firebase not configured - skip auth listener
      setInitialized(true);
      return;
    }

    try {
      const auth = getFirebaseAuth();
      setLoading(true);

      // Handle redirect result (for mobile sign-in)
      getRedirectResult(auth)
        .then(async (result) => {
          if (result?.user) {
            // User signed in via redirect - sync with backend
            const requestId = startRequest();
            try {
              const idToken = await result.user.getIdToken();
              const response = await apiClient.post('/auth/firebase-sync', {
                idToken,
                email: result.user.email,
                displayName: result.user.displayName,
                photoURL: result.user.photoURL,
              }, {
                signal: getSignal(),
              });

              if (!isStale(requestId) && response.data.token) {
                localStorage.setItem('token', response.data.token);
                // Clear stale subscription cache on redirect login
                localStorage.removeItem('subscription_cache');
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
        const requestId = startRequest();
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
          if (!isStale(requestId)) {
            setLoading(false);
            setInitialized(true);
            didSetInitialized = true;
          }

          // === OPTIONAL: Backend token sync (runs AFTER boot is unblocked) ===
          // If user is signed in, ensure we have a valid JWT token.
          // This handles page refresh when Firebase session exists but JWT might be missing/expired.
          // IMPORTANT: This is async and may fail/abort - that's OK, boot already completed above.
          if (firebaseUser) {
            const existingToken = localStorage.getItem('token');
            if (!existingToken) {
              // No token - sync with backend to get one (best-effort, not blocking)
              await syncTokenWithBackend(firebaseUser, requestId, getSignal, isStale);
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
          if (!isStale(requestId) && !didSetInitialized) {
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
       */
      async function syncTokenWithBackend(firebaseUser, requestId, getSignal, isStale) {
        try {
          const idToken = await firebaseUser.getIdToken();
          const response = await apiClient.post('/auth/firebase-sync', {
            idToken,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            photoURL: firebaseUser.photoURL,
          }, {
            signal: getSignal(),
          });

          // Guard: Don't update if auth state changed again
          if (isStale(requestId)) return;

          if (response.data.token) {
            localStorage.setItem('token', response.data.token);
            // Clear stale subscription cache on page load sync
            localStorage.removeItem('subscription_cache');
          }
        } catch (err) {
          // Abort/cancel is EXPECTED control flow (not an error)
          if (isAbortError(err)) {
            // Debug level - this happens normally during boot/navigation
            if (process.env.NODE_ENV === 'development') {
              console.log('[Auth] Token sync cancelled (expected during boot/navigation)');
            }
            return;
          }
          // Guard: Check stale after error
          if (isStale(requestId)) return;

          // Real error - log but don't throw (non-blocking)
          console.error('[Auth] Backend token sync failed:', err);
        }
      }

      return () => unsubscribe();
    } catch (err) {
      console.error('Failed to initialize Firebase auth:', err);
      setLoading(false);
      setInitialized(true);
    }
  }, [startRequest, isStale, getSignal]);

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
        // Clear stale subscription cache on new login - forces fresh fetch
        // Prevents stale 'free' cache from overriding actual premium status
        localStorage.removeItem('subscription_cache');
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
  const refreshToken = useCallback(async () => {
    console.log('[Auth] refreshToken called, user:', user?.email);

    if (!user) {
      console.warn('[Auth] Cannot refresh token - no user');
      return { ok: false, tokenStored: false, reason: 'no_user' };
    }

    const requestId = startRequest();

    try {
      // Force refresh the Firebase ID token
      console.log('[Auth] Getting fresh Firebase ID token...');
      const idToken = await user.getIdToken(true); // true = force refresh
      console.log('[Auth] Got Firebase ID token, length:', idToken?.length);

      console.log('[Auth] Calling /auth/firebase-sync...');
      const response = await apiClient.post('/auth/firebase-sync', {
        idToken,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      }, {
        signal: getSignal(),
      });

      console.log('[Auth] firebase-sync response:', {
        status: response.status,
        hasToken: !!response.data?.token,
        tokenLength: response.data?.token?.length,
        subscription: response.data?.subscription,
      });

      // Guard: Don't update if request is stale
      if (isStale(requestId)) {
        return { ok: false, tokenStored: false, reason: 'stale_request' };
      }

      // Store new JWT
      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        const storedToken = localStorage.getItem('token');
        const tokenStored = storedToken === response.data.token;
        console.log('[Auth] Token stored successfully:', tokenStored);
        return { ok: true, tokenStored, reason: null };
      }

      console.warn('[Auth] firebase-sync response missing token');
      return { ok: false, tokenStored: false, reason: 'no_token_in_response' };
    } catch (err) {
      // Ignore abort/cancel errors
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return { ok: false, tokenStored: false, reason: 'aborted' };
      }

      // Guard: Check stale after error
      if (isStale(requestId)) {
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

      return { ok: false, tokenStored: false, reason };
    }
  }, [user, startRequest, isStale, getSignal]);

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
        console.log('[Auth] Token refresh skipped (debounced)', { url });
        return;
      }

      // Skip if no user (not logged in)
      if (!user) {
        console.warn('[Auth] Token expired but no user - ignoring');
        return;
      }

      // Skip if already refreshing (debounce parallel 401s)
      if (isRefreshing) {
        console.log('[Auth] Token refresh already in progress - skipping');
        return;
      }

      console.log('[Auth] Token expired event received, refreshing...', { url });
      isRefreshing = true;

      try {
        const result = await refreshToken();
        console.log('[Auth] Token refresh result:', result);

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

  const value = useMemo(() => ({
    user,
    loading,
    initialized,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    refreshToken, // Exposed for explicit token refresh
    isAuthenticated: !!user,
    isConfigured: isFirebaseConfigured(),
  }), [
    user,
    loading,
    initialized,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    refreshToken,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
