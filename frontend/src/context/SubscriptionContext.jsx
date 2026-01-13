import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import apiClient from '../api/client';

// ===== Token Expired Debounce (shared with client.js pattern) =====
// Prevents multiple 401s from spamming auth:token-expired during boot
let lastTokenExpiredAt = 0;
const TOKEN_EXPIRED_DEBOUNCE_MS = 1500;

/**
 * Check if URL is an auth endpoint (should not trigger token-expired)
 * Auth endpoints handle their own 401s (e.g., login returns 401 for bad credentials)
 */
function isAuthUrl(url = '') {
  return url.includes('/api/auth/') || url.includes('/auth/');
}

/**
 * Emit token-expired event with debounce and auth endpoint guard
 * @param {string} url - The URL that returned 401
 */
function emitTokenExpired(url) {
  // Guard: Don't fire for auth endpoints (they handle their own 401s)
  if (isAuthUrl(url)) {
    console.warn('[Subscription] Skipping token-expired for auth endpoint:', url);
    return;
  }

  // Debounce: Skip if fired recently
  const now = Date.now();
  if (now - lastTokenExpiredAt < TOKEN_EXPIRED_DEBOUNCE_MS) {
    console.warn('[Subscription] Token-expired debounced');
    return;
  }

  lastTokenExpiredAt = now;
  window.dispatchEvent(new CustomEvent('auth:token-expired', { detail: { url } }));
}

/**
 * Inline stale request guard (previously useStaleRequestGuard hook)
 * Simple abort/stale request protection for subscription fetches.
 */
function useStaleRequestGuard() {
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef(null);

  const startRequest = useCallback(() => {
    // Abort previous request if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    // Increment and return new request ID
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
 * Subscription Context (Entitlement-Only)
 *
 * Manages subscription/entitlement state for the freemium model.
 * Provides isPremium flag and showPaywall() method for triggering the pricing modal.
 *
 * ARCHITECTURE:
 * - This context is ENTITLEMENT-ONLY - it does not manage auth state
 * - AuthContext owns auth state and PUSHES subscription data here
 * - SubscriptionProvider wraps AuthProvider (so AuthContext can call useSubscription)
 * - 401/logout handling is driven by AuthContext (calls clearSubscription)
 *
 * TIER MODEL:
 * - tier: 'free' | 'premium' (binary, no 'unknown')
 * - status: 'pending' | 'loading' | 'resolved' | 'error'
 * - Default tier is 'free', but UI MUST check isResolved before gating
 *
 * UI GATING RULES (CRITICAL):
 * - isPending: Show loading/skeleton (NEVER paywall/blur)
 * - isFreeResolved: Show paywall/blur
 * - isPremiumResolved: Show premium content
 * - NEVER use !isPremium to show paywall (would paywall during pending)
 *
 * AuthContext Integration:
 * - bootstrapSubscription(sub) - after firebase-sync returns subscription
 * - ensureSubscription() - canonical auto-fetch entrypoint (idempotent)
 * - fetchSubscription() - internal fetch (used by ensureSubscription)
 * - clearSubscription() - on logout or 401 token failure
 */

const SubscriptionContext = createContext(null);

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}

// Cache key prefix for localStorage (per-user keying)
const SUBSCRIPTION_CACHE_PREFIX = 'subscription:';

// Cache version - bump this to invalidate all existing caches on deploy
const CACHE_VERSION = 5; // Bumped for per-user cache migration

/**
 * Normalize email for cache key (lowercase, trimmed)
 * Returns null if email is falsy or not a string
 */
const normalizeEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  return email.toLowerCase().trim();
};

/**
 * Get cached subscription for a specific user
 * @param {string} email - User email (cache key identifier)
 * @returns {Object|null} Cached subscription or null
 */
const getCachedSubscription = (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  try {
    const cacheKey = `${SUBSCRIPTION_CACHE_PREFIX}${normalizedEmail}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.version !== CACHE_VERSION) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      if ((parsed.tier === 'free' || parsed.tier === 'premium') && typeof parsed.subscribed === 'boolean') {
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

/**
 * Save subscription to localStorage for a specific user
 * @param {Object} sub - Subscription data {tier, subscribed, ends_at}
 * @param {string} email - User email (cache key identifier)
 */
const cacheSubscription = (sub, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  try {
    const cacheKey = `${SUBSCRIPTION_CACHE_PREFIX}${normalizedEmail}`;
    localStorage.setItem(cacheKey, JSON.stringify({
      ...sub,
      version: CACHE_VERSION,
    }));
  } catch {
    // Ignore storage errors
  }
};

/**
 * Clear cached subscription for a specific user
 * @param {string} email - User email (cache key identifier)
 */
const clearCachedSubscription = (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  try {
    const cacheKey = `${SUBSCRIPTION_CACHE_PREFIX}${normalizedEmail}`;
    localStorage.removeItem(cacheKey);
  } catch {
    // Ignore storage errors
  }
};

/**
 * Clear old global cache key (migration cleanup)
 */
const clearLegacyCache = () => {
  try {
    localStorage.removeItem('subscription_cache');
  } catch {
    // Ignore
  }
};

// Default subscription: tier='free', but status='pending' means not resolved yet
const DEFAULT_SUBSCRIPTION = { tier: 'free', subscribed: false, ends_at: null };

/**
 * Subscription status states:
 * - 'pending': Not yet resolved (UI shows loading, NOT paywall)
 * - 'loading': API call in flight
 * - 'resolved': Subscription status EXPLICITLY known from backend
 * - 'degraded': Backend unavailable (502/503/504), using cache, don't flip to free
 * - 'error': Fetch/parse failed (non-gateway error)
 */
export const SubscriptionStatus = {
  PENDING: 'pending',
  LOADING: 'loading',
  RESOLVED: 'resolved',
  DEGRADED: 'degraded',
  ERROR: 'error',
};

/**
 * Gateway status codes that indicate backend is down/cold-starting
 * These should NOT cause tier to flip to free
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Classify subscription fetch errors for proper handling
 * @param {Error} err - Axios error object
 * @returns {{ kind: string, status: number|null }}
 */
function classifySubError(err) {
  const status = err?.response?.status ?? null;

  if (status === 401) return { kind: 'AUTH_REQUIRED', status };
  if (status === 403) return { kind: 'PREMIUM_REQUIRED', status };
  if (status === 429) return { kind: 'RATE_LIMITED', status };
  if (GATEWAY_STATUSES.has(status)) return { kind: 'GATEWAY', status };
  if (!status) return { kind: 'NETWORK', status: null }; // no response
  if (status >= 500) return { kind: 'SERVER', status };
  return { kind: 'OTHER', status };
}

/**
 * Unwrap API response envelope.
 * Returns { tier, subscribed, ends_at } or null on error.
 * Does NOT fallback to 'free' - caller must set ERROR status on null.
 */
export const unwrapSubscriptionResponse = (responseData) => {
  // Handle enveloped response: {data: {tier, subscribed, ...}, meta: {...}}
  if (responseData?.data && typeof responseData.data === 'object' && 'tier' in responseData.data) {
    const { tier, subscribed, ends_at } = responseData.data;
    if (tier === 'free' || tier === 'premium') {
      return { tier, subscribed: subscribed || false, ends_at: ends_at || null };
    }
    return null;
  }
  // Handle flat response (legacy): {tier, subscribed, ...}
  if (responseData && 'tier' in responseData) {
    const { tier, subscribed, ends_at } = responseData;
    if (tier === 'free' || tier === 'premium') {
      return { tier, subscribed: subscribed || false, ends_at: ends_at || null };
    }
    return null;
  }
  console.warn('[Subscription] Unknown response format:', responseData);
  return null;
};

export function SubscriptionProvider({ children }) {
  // Clear legacy global cache on mount (one-time migration)
  useEffect(() => {
    clearLegacyCache();
  }, []);

  // DON'T load cache on mount - we don't know who the user is yet
  // Cache is loaded per-user when AuthContext calls fetchSubscription(email)
  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [status, setStatus] = useState(SubscriptionStatus.PENDING);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [showPricingModal, setShowPricingModal] = useState(false);

  // Abort/stale request protection
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Ref for hidePaywall timeout cleanup
  const hidePaywallTimeoutRef = useRef(null);

  // Track active subscription request to avoid duplicate fetch abort loops
  const activeRequestRef = useRef({ requestId: null, email: null, type: null });

  // Track current user email for per-user cache operations
  const currentUserEmailRef = useRef(null);

  // 429 cooldown (prevents repeated hammering after rate limit)
  const cooldownUntilRef = useRef(0);

  // Track last stable status to avoid leaving LOADING after aborts
  const lastStableStatusRef = useRef(status);
  useEffect(() => {
    if (status !== SubscriptionStatus.LOADING) {
      lastStableStatusRef.current = status;
    }
  }, [status]);

  // Safety fuse: prevent repeated sequential fetches within short window (per user)
  const lastFetchAttemptRef = useRef({ email: null, ts: 0 });
  const MIN_FETCH_INTERVAL_MS = 2000;

  // Deterministic guard: Set true when bootstrapSubscription is called (from firebase-sync),
  // cleared after first fetchSubscription skip. Prevents duplicate fetch after sign-in
  // without relying on timing assumptions.
  const bootstrappedInSessionRef = useRef(false);

  // Auto-only debounce for ensureSubscription (manual refresh bypasses)
  const lastEnsureAttemptRef = useRef({ email: null, ts: 0 });
  const ENSURE_DEBOUNCE_MS = 1000;

  // Analytics context for upsell tracking
  const [upsellContext, setUpsellContext] = useState({
    field: null,
    source: null,
    district: null,
  });

  /**
   * Bootstrap subscription from AuthContext (primary path - no API call)
   * Called after firebase-sync returns subscription data.
   * @param {Object} sub - Subscription data {tier, subscribed, ends_at}
   * @param {string} email - User email for per-user cache
   */
  const bootstrapSubscription = useCallback((sub, email) => {
    if (!sub || (sub.tier !== 'free' && sub.tier !== 'premium')) {
      console.error('[Subscription] Bootstrap called with invalid tier:', sub?.tier);
      setFetchError(new Error(`Invalid tier value: ${sub?.tier}`));
      setStatus(SubscriptionStatus.ERROR);
      return;
    }

    // Normalize email for cache key
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      console.warn('[Subscription] Bootstrap called without valid email - skipping cache');
    }

    console.warn('[Subscription] Bootstrapping subscription');
    const newSub = {
      tier: sub.tier,
      subscribed: sub.subscribed || false,
      ends_at: sub.ends_at || null,
    };
    setSubscription(newSub);

    // Cache per-user (only if email is valid)
    if (normalizedEmail) {
      currentUserEmailRef.current = normalizedEmail;
      cacheSubscription(newSub, normalizedEmail);
    }

    setStatus(SubscriptionStatus.RESOLVED);
    setLoading(false);
    setFetchError(null);
    // Mark as bootstrapped to prevent duplicate fetch from onAuthStateChanged
    bootstrappedInSessionRef.current = true;
  }, []);

  /**
   * Fetch subscription from backend
   * Called by AuthContext on page refresh when no firebase-sync occurs.
   *
   * @param {string} email - User email for per-user cache
   *
   * FLOW:
   * 1. Load per-user cache first (fast display)
   * 2. Fetch from API to verify/update
   *
   * RACE GUARD: Checks current user after fetch to prevent overwriting
   * clearSubscription() state if logout happened during the request.
   */
  const fetchSubscription = useCallback(async (email) => {
    // Duplicate guard: If bootstrapSubscription was called in this session, skip ONCE
    // This prevents the onAuthStateChanged → fetchSubscription duplicate after sign-in
    // Deterministic: no timing assumptions, just "was bootstrap called before this fetch?"
    if (bootstrappedInSessionRef.current) {
      console.warn('[Subscription] Skipping fetch - already bootstrapped in this session');
      bootstrappedInSessionRef.current = false; // Clear flag so future fetches work
      return;
    }

    // Normalize email for cache key
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      console.warn('[Subscription] Fetch called without valid email - skipping cache operations');
    }

    // Track current user (only if email is valid)
    if (normalizedEmail) {
      currentUserEmailRef.current = normalizedEmail;
    }

    // Avoid repeated fetch calls for the same user while a request is in flight
    if (activeRequestRef.current.type === 'fetch'
      && activeRequestRef.current.email === (normalizedEmail || email)) {
      console.warn('[Subscription] Fetch already in progress');
      return;
    }

    const now = Date.now();
    if (cooldownUntilRef.current > now) {
      const waitMs = cooldownUntilRef.current - now;
      console.warn('[Subscription] Fetch blocked by cooldown:', { waitMs });
      return;
    }
    if (lastFetchAttemptRef.current.email === normalizedEmail
      && now - lastFetchAttemptRef.current.ts < MIN_FETCH_INTERVAL_MS) {
      console.warn('[Subscription] Fetch skipped due to recent request');
      return;
    }

    // Step 1: Load per-user cache first (fast display while verifying)
    const cachedSub = normalizedEmail ? getCachedSubscription(normalizedEmail) : null;
    if (cachedSub) {
      console.warn('[Subscription] Loaded subscription from cache');
      setSubscription(cachedSub);
      setStatus(SubscriptionStatus.RESOLVED);
      // Continue to verify from backend...
    }

    const requestId = startRequest();
    lastFetchAttemptRef.current = { email: normalizedEmail, ts: now };
    activeRequestRef.current = { requestId, email: normalizedEmail || email, type: 'fetch' };
    console.warn('[Subscription] Fetching /auth/subscription');
    setLoading(true);
    // Only set LOADING if we didn't have cache (avoid flash)
    if (!cachedSub) {
      setStatus(SubscriptionStatus.LOADING);
    }
    setFetchError(null);

    try {
      const response = await apiClient.get('/auth/subscription', {
        signal: getSignal(),
      });

      if (isStale(requestId)) return;

      // Race guard: User switched accounts mid-flight (email changed)
      if (normalizedEmail && currentUserEmailRef.current !== normalizedEmail) {
        console.warn('[Subscription] User changed during fetch, discarding result');
        return;
      }

      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        console.warn('[Subscription] Fetch success');
        setSubscription(subData);
        // Cache only if we have a valid normalized email
        if (normalizedEmail) {
          cacheSubscription(subData, normalizedEmail);
        }
        setStatus(SubscriptionStatus.RESOLVED);
        setLoading(false);
      } else {
        console.error('[Subscription] Failed to parse subscription response');
        setFetchError(new Error('Failed to parse subscription response'));
        setStatus(SubscriptionStatus.ERROR);
        setLoading(false);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        console.warn('[Subscription] Fetch aborted');
        setStatus(lastStableStatusRef.current);
        return;
      }
      if (isStale(requestId)) return;

      const { kind, status: httpStatus } = classifySubError(err);

      // Rate limit: enter cooldown (keep your existing logic)
      if (kind === 'RATE_LIMITED') {
        const retryAfterHeader = Number(err.response?.headers?.['retry-after']);
        const retryAfterMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 15000;
        cooldownUntilRef.current = Date.now() + retryAfterMs;
        console.warn('[Subscription] Rate limited, entering cooldown:', { retryAfterMs });
      }

      // 401: auth required → trigger re-login, do NOT downgrade tier
      if (kind === 'AUTH_REQUIRED') {
        console.warn('[Subscription] 401 AUTH_REQUIRED - session expired');
        setFetchError(err);
        // Keep cached subscription if any; don't overwrite to free
        setStatus(SubscriptionStatus.ERROR);
        // Use debounced emitter (will be skipped because /auth/subscription is auth endpoint)
        emitTokenExpired('/auth/subscription');
        return;
      }

      // 403: free tier (or not entitled) → tier known, resolve to free
      if (kind === 'PREMIUM_REQUIRED') {
        console.warn('[Subscription] 403 PREMIUM_REQUIRED - treating as free tier');
        setFetchError(null);
        setSubscription(DEFAULT_SUBSCRIPTION);
        if (normalizedEmail) cacheSubscription(DEFAULT_SUBSCRIPTION, normalizedEmail);
        setStatus(SubscriptionStatus.RESOLVED);
        return;
      }

      // Gateway/backend down OR network error: DEGRADED, keep cache, don't flip to free
      // NETWORK errors (no response) should also preserve cached premium
      if (kind === 'GATEWAY' || kind === 'NETWORK') {
        console.warn(`[Subscription] ${kind} error, entering DEGRADED:`, { status: httpStatus });
        setFetchError(err);
        // Keep cached subscription if loaded earlier; mark DEGRADED
        // DO NOT overwrite subscription to free here
        setStatus(SubscriptionStatus.DEGRADED);
        return;
      }

      // Other errors: mark ERROR but do not overwrite subscription
      console.error('[Subscription] Fetch error:', err.message);
      setFetchError(err);
      setStatus(SubscriptionStatus.ERROR);
    } finally {
      setLoading(false);
      if (activeRequestRef.current.requestId === requestId) {
        activeRequestRef.current = { requestId: null, email: null, type: null };
      }
    }
  }, [startRequest, isStale, getSignal]);

  /**
   * Canonical subscription fetch authority.
   * Idempotent auto-fetch entrypoint for AuthContext.
   * Skips if already resolved/loading for the same user, or in ERROR state
   * (manual retry required).
   */
  const ensureSubscription = useCallback((email, options = {}) => {
    const { force = false, reason = 'auto' } = options;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      console.warn('[Subscription] ensureSubscription called without valid email', { reason });
      return;
    }

    const now = Date.now();
    if (!force
      && lastEnsureAttemptRef.current.email === normalizedEmail
      && now - lastEnsureAttemptRef.current.ts < ENSURE_DEBOUNCE_MS) {
      console.warn('[Subscription] ensureSubscription debounced', { reason });
      return;
    }

    const isSameUser = currentUserEmailRef.current === normalizedEmail;
    const isResolved = status === SubscriptionStatus.RESOLVED;
    const isLoading = status === SubscriptionStatus.LOADING;
    const isError = status === SubscriptionStatus.ERROR;

    if (!force && isSameUser && (isResolved || isLoading)) {
      console.warn('[Subscription] ensureSubscription skipped (already resolved/loading)', {
        status,
        reason,
      });
      return;
    }

    if (!force && isSameUser && isError) {
      console.warn('[Subscription] ensureSubscription skipped (error state requires manual retry)', {
        reason,
      });
      return;
    }

    lastEnsureAttemptRef.current = { email: normalizedEmail, ts: now };
    fetchSubscription(normalizedEmail);
  }, [fetchSubscription, status]);

  /**
   * Clear subscription (called on logout or 401)
   * Sets to free tier with RESOLVED status (explicit logout = explicit free)
   */
  const clearSubscription = useCallback(() => {
    const email = currentUserEmailRef.current;
    console.warn('[Subscription] Clearing (logout)');
    setSubscription({ tier: 'free', subscribed: false, ends_at: null });
    setStatus(SubscriptionStatus.RESOLVED);
    setLoading(false);
    setFetchError(null);
    // Reset bootstrap flag for clean state on next sign-in
    bootstrappedInSessionRef.current = false;
    lastEnsureAttemptRef.current = { email: null, ts: 0 };
    // Clear per-user cache
    clearCachedSubscription(email);
    currentUserEmailRef.current = null;
  }, []);

  /**
   * Refresh subscription from backend (after payment)
   * Forces a fresh fetch. Uses currentUserEmailRef for cache.
   */
  const refreshSubscription = useCallback(async () => {
    const email = currentUserEmailRef.current;
    if (activeRequestRef.current.type === 'refresh' && activeRequestRef.current.email === email) {
      console.warn('[Subscription] Refresh already in progress');
      return;
    }
    const now = Date.now();
    if (cooldownUntilRef.current > now) {
      const waitMs = cooldownUntilRef.current - now;
      console.warn('[Subscription] Refresh blocked by cooldown:', { waitMs });
      return;
    }
    const requestId = startRequest();
    activeRequestRef.current = { requestId, email, type: 'refresh' };
    console.warn('[Subscription] Refreshing');
    setLoading(true);
    // Don't set LOADING status if we already have a resolved subscription
    // This prevents UI from temporarily going "unknown" when refreshing
    if (status !== SubscriptionStatus.RESOLVED) {
      setStatus(SubscriptionStatus.LOADING);
    }
    setFetchError(null);

    try {
      const response = await apiClient.get('/auth/subscription', {
        signal: getSignal(),
      });

      if (isStale(requestId)) return;

      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        console.warn('[Subscription] Refresh success');
        setSubscription(subData);
        cacheSubscription(subData, email);
        setStatus(SubscriptionStatus.RESOLVED);
      } else {
        setFetchError(new Error('Failed to parse refresh response'));
        setStatus(SubscriptionStatus.ERROR);
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        setStatus(lastStableStatusRef.current);
        return;
      }
      if (isStale(requestId)) return;

      const { kind, status: httpStatus } = classifySubError(err);

      // Rate limit: enter cooldown
      if (kind === 'RATE_LIMITED') {
        const retryAfterHeader = Number(err.response?.headers?.['retry-after']);
        const retryAfterMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 15000;
        cooldownUntilRef.current = Date.now() + retryAfterMs;
        console.warn('[Subscription] Rate limited, entering cooldown:', { retryAfterMs });
      }

      // 401: auth required → emit token-expired, do NOT downgrade tier
      if (kind === 'AUTH_REQUIRED') {
        console.warn('[Subscription] 401 during refresh - emit token-expired');
        setFetchError(err);
        setStatus(SubscriptionStatus.ERROR);
        // Use debounced emitter (will be skipped because /auth/subscription is auth endpoint)
        emitTokenExpired('/auth/subscription');
        return;
      }

      // 403: free tier → resolve to free
      if (kind === 'PREMIUM_REQUIRED') {
        console.warn('[Subscription] 403 during refresh - resolve to free tier');
        setFetchError(null);
        setSubscription(DEFAULT_SUBSCRIPTION);
        if (email) cacheSubscription(DEFAULT_SUBSCRIPTION, email);
        setStatus(SubscriptionStatus.RESOLVED);
        return;
      }

      // Gateway/backend down OR network error: DEGRADED, keep cache
      if (kind === 'GATEWAY' || kind === 'NETWORK') {
        console.warn(`[Subscription] ${kind} error during refresh, DEGRADED:`, { status: httpStatus });
        setFetchError(err);
        setStatus(SubscriptionStatus.DEGRADED);
        return;
      }

      // Other errors: mark ERROR but do not overwrite subscription
      console.error('[Subscription] Refresh error:', err.message);
      setFetchError(err);
      setStatus(SubscriptionStatus.ERROR);
    } finally {
      setLoading(false);
      if (activeRequestRef.current.requestId === requestId) {
        activeRequestRef.current = { requestId: null, email: null, type: null };
      }
    }
  }, [startRequest, isStale, getSignal, status]);

  /**
   * Manual retry wrapper for boot recovery
   * Delegates to refreshSubscription using currentUserEmailRef
   */
  const retrySubscription = useCallback(async () => {
    const email = currentUserEmailRef.current;
    if (!email) {
      console.warn('[Subscription] Retry requested without current user email');
      return;
    }
    console.warn('[Subscription] Manual retry triggered');
    await refreshSubscription();
  }, [refreshSubscription]);

  // ===== DERIVED STATE =====

  // Status checks
  const isResolved = status === SubscriptionStatus.RESOLVED;
  const isPending = status === SubscriptionStatus.PENDING || status === SubscriptionStatus.LOADING;
  const isError = status === SubscriptionStatus.ERROR;
  const isDegraded = status === SubscriptionStatus.DEGRADED;

  // Premium check with expiry validation
  const isPremiumActive = useMemo(() => {
    if (subscription.tier !== 'premium') return false;
    if (!subscription.subscribed) return false;
    if (subscription.ends_at) {
      const endsAt = new Date(subscription.ends_at);
      if (endsAt < new Date()) return false;
    }
    return true;
  }, [subscription]);

  // GATE CONDITIONS: Use these for paywall/blur/content gating
  // isFreeResolved: Show paywall/blur (ONLY when we KNOW user is free)
  const isFreeResolved = isResolved && !isPremiumActive;
  // isPremiumResolved: Show premium content (ONLY when we KNOW user is premium)
  const isPremiumResolved = isResolved && isPremiumActive;
  // isPremium: Alias for isPremiumResolved
  const isPremium = isPremiumResolved;

  // ===== BOOT VS ENTITLEMENT FLAGS (CRITICAL DISTINCTION) =====
  //
  // bootReady / isSubscriptionReady: App can proceed, don't hang
  //   - RESOLVED: tier confirmed by backend
  //   - ERROR: fetch failed, fall back to free restrictions
  //   - DEGRADED: gateway error, keep cache, don't flip to free
  //
  // tierCertain: We have EXPLICIT backend confirmation of tier
  //   - ONLY true when RESOLVED (backend said so)
  //   - NOT true for DEGRADED (we're guessing from cache)
  //
  // canAccessPremium: Safe to show premium content
  //   - RESOLVED + premium: confirmed by backend
  //   - DEGRADED + cached premium: trust cache for current user
  //
  const isSubscriptionReady = isResolved || isError || isDegraded;
  const bootReady = isSubscriptionReady; // Alias for clarity

  // tierCertain: ONLY when backend explicitly confirmed tier
  // Do NOT include DEGRADED - tier is "cached guess", not "known"
  const tierCertain = isResolved;

  // Legacy alias - but now correctly excludes DEGRADED
  const isTierKnown = tierCertain;

  // hasCachedPremium: In DEGRADED state, do we have a cached premium subscription?
  // We trust this because:
  // 1. Cache was loaded for current user (currentUserEmailRef check in fetchSubscription)
  // 2. Cache version was validated (getCachedSubscription checks version)
  const hasCachedPremium = isDegraded && subscription.tier === 'premium' && isPremiumActive;

  // canAccessPremium: Safe to unlock premium content
  // Either: backend confirmed premium, OR degraded but cached premium
  const canAccessPremium = isPremiumResolved || hasCachedPremium;

  const daysUntilExpiry = useMemo(() => {
    if (!isPremiumActive || !subscription.ends_at) return null;
    const endsAt = new Date(subscription.ends_at);
    const diff = endsAt.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [isPremiumActive, subscription.ends_at]);

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7;

  // Paywall actions
  const showPaywall = useCallback((context = {}) => {
    setUpsellContext({
      field: context.field || null,
      source: context.source || null,
      district: context.district || null,
    });
    setShowPricingModal(true);
  }, []);

  const hidePaywall = useCallback(() => {
    setShowPricingModal(false);
    if (hidePaywallTimeoutRef.current) {
      clearTimeout(hidePaywallTimeoutRef.current);
    }
    hidePaywallTimeoutRef.current = setTimeout(() => {
      setUpsellContext({ field: null, source: null, district: null });
      hidePaywallTimeoutRef.current = null;
    }, 300);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hidePaywallTimeoutRef.current) {
        clearTimeout(hidePaywallTimeoutRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({
    // Raw state
    subscription,
    tier: subscription.tier,
    status,
    loading,
    fetchError,

    // GATE CONDITIONS (use these for paywall/blur/content gating)
    isResolved,       // True when status==='resolved' (safe to gate on tier)
    isPending,        // True when pending/loading (show skeleton, NOT paywall)
    isError,          // True when status==='error'
    isDegraded,       // True when status==='degraded' (backend down, using cache)
    isFreeResolved,   // True when resolved AND free (show paywall/blur)
    isPremiumResolved,// True when resolved AND premium (show premium content)
    isPremium,        // Alias for isPremiumResolved

    // Boot gate helpers
    bootReady,          // App can proceed (RESOLVED, ERROR, or DEGRADED)
    isSubscriptionReady,// Alias for bootReady
    tierCertain,        // Backend confirmed tier (RESOLVED only)
    isTierKnown,        // Legacy alias for tierCertain
    canAccessPremium,   // Safe to show premium (RESOLVED+premium OR DEGRADED+cached premium)
    hasCachedPremium,   // DEGRADED with cached premium subscription

    // Expiry
    daysUntilExpiry,
    isExpiringSoon,

    // Paywall modal
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext,

    // Actions for AuthContext
    bootstrapSubscription,
    fetchSubscription,
    clearSubscription,
    refreshSubscription,
    retrySubscription,
    ensureSubscription,
    setSubscription,
  }), [
    subscription,
    status,
    loading,
    fetchError,
    isResolved,
    isPending,
    isError,
    isDegraded,
    isFreeResolved,
    isPremiumResolved,
    isPremium,
    bootReady,
    isSubscriptionReady,
    tierCertain,
    isTierKnown,
    canAccessPremium,
    hasCachedPremium,
    daysUntilExpiry,
    isExpiringSoon,
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext,
    bootstrapSubscription,
    fetchSubscription,
    clearSubscription,
    refreshSubscription,
    retrySubscription,
    ensureSubscription,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
