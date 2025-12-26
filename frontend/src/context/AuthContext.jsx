import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from '../lib/firebase';
import apiClient from '../api/client';
import { useStaleRequestGuard } from '../hooks';

/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Uses Firebase Authentication with Google OAuth.
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

      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        // Start a new request for each auth state change - cancels any in-flight API calls
        const requestId = startRequest();

        setUser(firebaseUser);

        // If user is signed in, ensure we have a valid JWT token
        // This handles page refresh when Firebase session exists but JWT might be missing/expired
        if (firebaseUser) {
          const existingToken = localStorage.getItem('token');
          if (!existingToken) {
            // No token - sync with backend to get one
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
              }
            } catch (err) {
              // CRITICAL: Never treat abort/cancel as a real error
              if (err.name === 'CanceledError' || err.name === 'AbortError') {
                return;
              }
              // Guard: Check stale after error
              if (isStale(requestId)) return;

              console.error('[Auth] Backend sync failed on page load:', err);
            }
          }
        }

        // Guard: Don't update loading/initialized if stale
        if (isStale(requestId)) return;

        setLoading(false);
        setInitialized(true);
      });

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

  const value = {
    user,
    loading,
    initialized,
    error,
    signInWithGoogle,
    logout,
    syncWithBackend,
    isAuthenticated: !!user,
    isConfigured: isFirebaseConfigured(),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
