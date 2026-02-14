import { createContext, useContext, useEffect, useCallback, useMemo, useRef, useReducer } from 'react';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from '../lib/firebase';
import { queryClient } from '../lib/queryClient';
import { logAuthEvent, AuthTimelineEvent } from '../utils/authTimelineLogger';

/**
 * Authentication Context - Firebase-Only Model
 *
 * Provides authentication state and methods throughout the app.
 * Uses Firebase Authentication with Google OAuth.
 *
 * ARCHITECTURE:
 * - Firebase SDK handles all token management (auto-refresh, persistence)
 * - API client attaches Firebase ID token via request interceptor
 * - No backend JWT, no cookie sync, no firebase-sync endpoint needed
 * - onAuthStateChanged is the single source of truth for auth state
 *
 * CRITICAL INVARIANT:
 * `initialized` = "Firebase auth state is KNOWN" (user or null)
 */

const AuthContext = createContext(null);

const authInitialState = {
  user: null,
  initialized: false,
};

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_AUTH':
      return {
        user: action.user ?? null,
        initialized: true,
      };
    case 'LOGOUT_LOCAL':
      return {
        user: null,
        initialized: true,
      };
    default:
      return state;
  }
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * Helper: Check if error is an abort/cancel (expected control flow, not a real error)
 */
export const isAbortError = (err) => {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
};

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, authInitialState);
  const authListenerRegisteredRef = useRef(false);

  // Initialize auth listener only if Firebase is configured
  useEffect(() => {
    if (!isFirebaseConfigured()) {
      dispatch({ type: 'SET_AUTH', user: null });
      return;
    }

    try {
      const auth = getFirebaseAuth();

      if (process.env.NODE_ENV !== 'production') {
        if (authListenerRegisteredRef.current) {
          console.error('[Auth] onAuthStateChanged registered more than once');
        }
        authListenerRegisteredRef.current = true;
      }

      // Handle redirect result (for mobile sign-in)
      getRedirectResult(auth).catch((err) => {
        console.error('[Auth] Redirect result error:', err);
      });

      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        logAuthEvent(AuthTimelineEvent.AUTH_STATE_CHANGE, {
          source: 'auth_listener',
          hasUser: !!firebaseUser,
          email: firebaseUser?.email,
        });

        dispatch({ type: 'SET_AUTH', user: firebaseUser ?? null });
      });

      return () => {
        unsubscribe();
        if (process.env.NODE_ENV !== 'production') {
          authListenerRegisteredRef.current = false;
        }
      };
    } catch (err) {
      console.error('[Auth] Failed to initialize Firebase auth:', err);
      dispatch({ type: 'SET_AUTH', user: null });
    }
  }, []);

  // Sign in with Google (popup with redirect fallback)
  const signInWithGoogle = useCallback(async () => {
    if (!isFirebaseConfigured()) {
      throw new Error('Firebase not configured');
    }

    const auth = getFirebaseAuth();
    const provider = getGoogleProvider();

    try {
      // Popup: immediate feedback, no page navigation, works on desktop
      const result = await signInWithPopup(auth, provider);
      return result;
    } catch (err) {
      // Fallback to redirect if popup is blocked (common on mobile)
      if (err?.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw err;
    }
  }, []);

  // Sign out
  const logout = useCallback(async () => {
    dispatch({ type: 'LOGOUT_LOCAL' });
    queryClient.clear();

    if (isFirebaseConfigured()) {
      try {
        const auth = getFirebaseAuth();
        await signOut(auth);
      } catch (err) {
        console.error('[Auth] Sign-out error:', err);
        throw err;
      }
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
        return `This domain is not authorized for sign-in. Add "${window.location.hostname}" to Firebase Console → Authentication → Settings → Authorized domains.`;
      case 'auth/invalid-api-key':
        return 'Authentication is not configured. Please contact the administrator.';
      default:
        return 'An error occurred during sign-in. Please try again.';
    }
  };

  const value = useMemo(() => ({
    user: state.user,
    initialized: state.initialized,
    isAuthenticated: !!state.user,
    isConfigured: isFirebaseConfigured(),
    signInWithGoogle,
    logout,
    getErrorMessage,
  }), [
    state.user,
    state.initialized,
    signInWithGoogle,
    logout,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
