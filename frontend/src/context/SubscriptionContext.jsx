import { createContext, useContext, useState, useReducer, useCallback, useMemo, useRef, useEffect } from 'react';
import apiClient from '../api/client';
import { logAuthEvent, AuthTimelineEvent } from '../utils/authTimelineLogger';
import {
  TierSource,
  deriveCanAccessPremium,
  deriveHasCachedPremium,
  deriveIsTierKnown,
} from './subscriptionDerivations';
import {
  authCoordinatorReducer,
  initialState as coordinatorInitialState,
} from './authCoordinator';

/**
 * Inline stale request guard
 * Simple abort/stale request protection for subscription fetches.
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
 * Subscription Context (Entitlement-Only)
 *
 * Manages subscription/entitlement state for the freemium model.
 * Firebase-Only model: no bootstrap from firebase-sync, always fetches from server.
 *
 * ARCHITECTURE:
 * - AuthContext sets user via dispatch, then calls ensure(email)
 * - SubscriptionContext fetches /auth/subscription (Bearer token added by API client)
 * - localStorage cache for fast display, verified by server fetch
 * - BroadcastChannel for cross-tab sync
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
const CACHE_VERSION = 6;
const PREMIUM_CACHE_MAX_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeEmail = (email) => {
  if (!email || typeof email !== 'string') return null;
  return email.toLowerCase().trim();
};

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
        if (parsed.ends_at) {
          const parsedDate = new Date(parsed.ends_at);
          if (Number.isNaN(parsedDate.getTime())) {
            parsed.ends_at = null;
          }
        }
        if (parsed.tier === 'premium' && !parsed.ends_at) {
          const cachedAt = parsed.cachedAt || 0;
          const cacheAge = Date.now() - cachedAt;
          if (cacheAge > PREMIUM_CACHE_MAX_TTL_MS) {
            localStorage.removeItem(cacheKey);
            return null;
          }
        }
        return parsed;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

let subscriptionSyncChannel = null;

const cacheSubscription = (sub, email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  try {
    const cacheKey = `${SUBSCRIPTION_CACHE_PREFIX}${normalizedEmail}`;
    const cachedData = {
      ...sub,
      version: CACHE_VERSION,
      cachedAt: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cachedData));
    if (subscriptionSyncChannel) {
      subscriptionSyncChannel.postMessage({
        type: 'SUBSCRIPTION_CHANGED',
        email: normalizedEmail,
        subscription: cachedData,
      });
    }
  } catch {
    // Ignore storage errors
  }
};

const clearCachedSubscription = (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return;
  try {
    const cacheKey = `${SUBSCRIPTION_CACHE_PREFIX}${normalizedEmail}`;
    localStorage.removeItem(cacheKey);
    if (subscriptionSyncChannel) {
      subscriptionSyncChannel.postMessage({
        type: 'SUBSCRIPTION_CLEARED',
        email: normalizedEmail,
      });
    }
  } catch {
    // Ignore storage errors
  }
};

const DEFAULT_SUBSCRIPTION = { tier: 'free', subscribed: false, ends_at: null };

export const SubscriptionStatus = {
  PENDING: 'pending',
  LOADING: 'loading',
  RESOLVED: 'resolved',
  DEGRADED: 'degraded',
  ERROR: 'error',
};

const GATEWAY_STATUSES = new Set([502, 503, 504]);
const BOOT_DEGRADE_GRACE_MS = 15000;

function classifySubError(err) {
  const status = err?.response?.status ?? null;
  if (status === 401) return { kind: 'AUTH_REQUIRED', status };
  if (status === 403) return { kind: 'PREMIUM_REQUIRED', status };
  if (status === 429) return { kind: 'RATE_LIMITED', status };
  if (GATEWAY_STATUSES.has(status)) return { kind: 'GATEWAY', status };
  if (!status) return { kind: 'NETWORK', status: null };
  if (status >= 500) return { kind: 'SERVER', status };
  return { kind: 'OTHER', status };
}

export const unwrapSubscriptionResponse = (responseData) => {
  // API client interceptor already unwraps the @api_contract envelope,
  // so responseData is the flat object: { tier, subscribed, has_access, ... }
  if (responseData && typeof responseData === 'object' && 'tier' in responseData) {
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
  const [coordState, dispatch] = useReducer(authCoordinatorReducer, coordinatorInitialState);

  // BroadcastChannel for cross-tab subscription sync
  const currentUserEmailRef = useRef(null);

  useEffect(() => {
    subscriptionSyncChannel = new BroadcastChannel('subscription-sync');

    const handleMessage = (event) => {
      const { type, email } = event.data;
      if (email !== currentUserEmailRef.current) return;

      if (type === 'SUBSCRIPTION_CHANGED') {
        const { subscription } = event.data;
        dispatch({ type: 'SUB_CACHE_LOAD', subscription });
      } else if (type === 'SUBSCRIPTION_CLEARED') {
        const normalizedEmail = normalizeEmail(email);
        if (normalizedEmail) {
          try {
            localStorage.removeItem(`${SUBSCRIPTION_CACHE_PREFIX}${normalizedEmail}`);
          } catch { /* ignore */ }
        }
        lastEnsureAttemptRef.current = { email: null, ts: 0 };
        currentUserEmailRef.current = null;
        dispatch({ type: 'SUB_FETCH_FAIL', errorKind: 'AUTH', error: new Error('Subscription cleared') });
      }
    };

    subscriptionSyncChannel.onmessage = handleMessage;

    return () => {
      if (subscriptionSyncChannel) {
        subscriptionSyncChannel.close();
        subscriptionSyncChannel = null;
      }
    };
  }, []);

  // Derived state from coordState
  const subscription = coordState.cachedSubscription ?? DEFAULT_SUBSCRIPTION;

  const status = (() => {
    switch (coordState.subPhase) {
      case 'resolved': return SubscriptionStatus.RESOLVED;
      case 'degraded': return SubscriptionStatus.DEGRADED;
      case 'loading': return SubscriptionStatus.LOADING;
      case 'pending':
      default: return SubscriptionStatus.PENDING;
    }
  })();

  const fetchError = coordState.subError;
  const hasCachedSubscription = coordState.tierSource === 'cache';

  // UI state
  const [showPricingModal, setShowPricingModal] = useState(false);
  const bootStartRef = useRef(Date.now());
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const hidePaywallTimeoutRef = useRef(null);
  const activeRequestRef = useRef({ requestId: null, email: null, type: null });
  const lastFetchSuccessRef = useRef(0);
  const cooldownUntilRef = useRef(0);
  const lastFetchAttemptRef = useRef({ email: null, ts: 0 });
  const MIN_FETCH_INTERVAL_MS = 2000;
  const lastEnsureAttemptRef = useRef({ email: null, ts: 0 });
  const ENSURE_DEBOUNCE_MS = 1000;
  const [upsellContext, setUpsellContext] = useState({ field: null, source: null, district: null });

  // Pending timeout fallback (15s)
  const PENDING_TIMEOUT_MS = 15000;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (status !== SubscriptionStatus.PENDING) return;

    const timeoutId = setTimeout(() => {
      if (statusRef.current !== SubscriptionStatus.PENDING) return;
      if (activeRequestRef.current.requestId !== null) return;
      if (Date.now() - lastFetchSuccessRef.current < 2000) return;

      console.warn('[Subscription] Pending timeout (15s) - resolving to free tier');
      logAuthEvent(AuthTimelineEvent.PENDING_TIMEOUT, {
        source: 'subscription',
        tierBefore: subscription.tier,
        tierAfter: 'free',
      });
      dispatch({ type: 'SUB_PENDING_TIMEOUT' });
    }, PENDING_TIMEOUT_MS);

    return () => clearTimeout(timeoutId);
  }, [status, subscription.tier]);

  /**
   * Fetch subscription from backend.
   * Always fetches from server (no bootstrap path).
   */
  const fetchSubscription = useCallback(async (email) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;

    currentUserEmailRef.current = normalizedEmail;

    if (activeRequestRef.current.type === 'fetch'
      && activeRequestRef.current.email === normalizedEmail) {
      return;
    }

    const now = Date.now();
    if (cooldownUntilRef.current > now) return;
    if (lastFetchAttemptRef.current.email === normalizedEmail
      && now - lastFetchAttemptRef.current.ts < MIN_FETCH_INTERVAL_MS) {
      return;
    }

    // Load cache first for fast display
    const cachedSub = getCachedSubscription(normalizedEmail);
    if (cachedSub) {
      dispatch({ type: 'SUB_CACHE_LOAD', subscription: cachedSub });
    }

    const requestId = startRequest();
    lastFetchAttemptRef.current = { email: normalizedEmail, ts: now };
    activeRequestRef.current = { requestId, email: normalizedEmail, type: 'fetch' };
    dispatch({ type: 'SUB_FETCH_START', requestId });

    try {
      const response = await apiClient.get('/auth/subscription', { signal: getSignal() });

      if (isStale(requestId)) return;
      if (currentUserEmailRef.current !== normalizedEmail) return;

      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        dispatch({ type: 'SUB_FETCH_OK', requestId, subscription: subData });
        cacheSubscription(subData, normalizedEmail);
        lastFetchSuccessRef.current = Date.now();
      } else {
        dispatch({
          type: 'SUB_FETCH_FAIL', requestId,
          error: new Error('Failed to parse subscription response'),
          errorKind: 'OTHER',
        });
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        dispatch({ type: 'SUB_FETCH_ABORT', requestId });
        return;
      }
      if (isStale(requestId)) return;

      const { kind } = classifySubError(err);

      if (kind === 'RATE_LIMITED') {
        const retryAfterHeader = Number(err.response?.headers?.['retry-after']);
        const retryAfterMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 15000;
        cooldownUntilRef.current = Date.now() + retryAfterMs;
      }

      if (kind === 'AUTH_REQUIRED') {
        dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: 'AUTH_REQUIRED' });
        return;
      }
      if (kind === 'PREMIUM_REQUIRED') {
        dispatch({ type: 'SUB_FETCH_OK', requestId, subscription: DEFAULT_SUBSCRIPTION });
        cacheSubscription(DEFAULT_SUBSCRIPTION, normalizedEmail);
        return;
      }
      if (kind === 'GATEWAY' || kind === 'NETWORK') {
        dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: kind });
        return;
      }
      if (kind === 'SERVER' && cachedSub && Date.now() - bootStartRef.current < BOOT_DEGRADE_GRACE_MS) {
        dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: 'GATEWAY' });
        return;
      }

      dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: kind });
    } finally {
      if (activeRequestRef.current.requestId === requestId) {
        activeRequestRef.current = { requestId: null, email: null, type: null };
      }
    }
  }, [startRequest, isStale, getSignal, dispatch]);

  const ensureSubscription = useCallback((email, options = {}) => {
    const { force = false, reason = 'auto' } = options;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return;

    const now = Date.now();
    if (!force
      && lastEnsureAttemptRef.current.email === normalizedEmail
      && now - lastEnsureAttemptRef.current.ts < ENSURE_DEBOUNCE_MS) {
      return;
    }

    const isSameUser = currentUserEmailRef.current === normalizedEmail;
    const isResolved = status === SubscriptionStatus.RESOLVED;
    const isLoading = status === SubscriptionStatus.LOADING;

    if (!force && isSameUser && (isResolved || isLoading)) return;

    lastEnsureAttemptRef.current = { email: normalizedEmail, ts: now };
    fetchSubscription(normalizedEmail);
  }, [fetchSubscription, status]);

  const clearSubscription = useCallback(() => {
    const email = currentUserEmailRef.current;
    lastEnsureAttemptRef.current = { email: null, ts: 0 };
    clearCachedSubscription(email);
    currentUserEmailRef.current = null;
  }, []);

  /**
   * Refresh subscription from backend (after payment).
   */
  const refreshSubscription = useCallback(async () => {
    const email = currentUserEmailRef.current;
    if (activeRequestRef.current.type === 'refresh' && activeRequestRef.current.email === email) return;

    const now = Date.now();
    if (cooldownUntilRef.current > now) return;

    const requestId = startRequest();
    activeRequestRef.current = { requestId, email, type: 'refresh' };
    if (status !== SubscriptionStatus.RESOLVED) {
      dispatch({ type: 'SUB_FETCH_START', requestId });
    }

    try {
      const response = await apiClient.get('/auth/subscription', { signal: getSignal() });
      if (isStale(requestId)) return;

      const subData = unwrapSubscriptionResponse(response.data);
      if (subData) {
        dispatch({ type: 'SUB_FETCH_OK', requestId, subscription: subData });
        cacheSubscription(subData, email);
        lastFetchSuccessRef.current = Date.now();
      } else {
        dispatch({
          type: 'SUB_FETCH_FAIL', requestId,
          error: new Error('Failed to parse refresh response'),
          errorKind: 'OTHER',
        });
      }
    } catch (err) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        dispatch({ type: 'SUB_FETCH_ABORT', requestId });
        return;
      }
      if (isStale(requestId)) return;

      const { kind } = classifySubError(err);

      if (kind === 'RATE_LIMITED') {
        const retryAfterHeader = Number(err.response?.headers?.['retry-after']);
        const retryAfterMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 : 15000;
        cooldownUntilRef.current = Date.now() + retryAfterMs;
      }
      if (kind === 'AUTH_REQUIRED') {
        dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: 'AUTH_REQUIRED' });
        return;
      }
      if (kind === 'PREMIUM_REQUIRED') {
        dispatch({ type: 'SUB_FETCH_OK', requestId, subscription: DEFAULT_SUBSCRIPTION });
        if (email) cacheSubscription(DEFAULT_SUBSCRIPTION, email);
        return;
      }
      if (kind === 'GATEWAY' || kind === 'NETWORK') {
        dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: kind });
        return;
      }
      if (kind === 'SERVER' && Date.now() - bootStartRef.current < BOOT_DEGRADE_GRACE_MS) {
        dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: 'GATEWAY' });
        return;
      }
      dispatch({ type: 'SUB_FETCH_FAIL', requestId, error: err, errorKind: kind });
    } finally {
      if (activeRequestRef.current.requestId === requestId) {
        activeRequestRef.current = { requestId: null, email: null, type: null };
      }
    }
  }, [startRequest, isStale, getSignal, status, dispatch]);

  const refresh = useCallback(async () => {
    await refreshSubscription();
  }, [refreshSubscription]);

  const clear = useCallback(() => {
    clearSubscription();
  }, [clearSubscription]);

  const ensure = useCallback((email, options) => {
    ensureSubscription(email, options);
  }, [ensureSubscription]);

  // ===== DERIVED STATE =====

  const isResolved = status === SubscriptionStatus.RESOLVED;
  const isError = status === SubscriptionStatus.ERROR;
  const isDegraded = status === SubscriptionStatus.DEGRADED;

  const isPremiumActive = useMemo(() => {
    if (subscription.tier !== 'premium') return false;
    if (!subscription.subscribed) return false;
    if (subscription.ends_at) {
      const endsAt = new Date(subscription.ends_at);
      if (endsAt < new Date()) return false;
    }
    return true;
  }, [subscription]);

  const isPremiumResolved = isResolved && isPremiumActive;
  const subscriptionReady = isResolved || isError || isDegraded;

  const tierSource = coordState.tierSource;
  const isTierKnown = deriveIsTierKnown(tierSource);
  const hasCachedPremium = deriveHasCachedPremium(tierSource, subscription, isPremiumActive);
  const canAccessPremium = deriveCanAccessPremium(isPremiumResolved, hasCachedPremium);

  const daysUntilExpiry = useMemo(() => {
    if (!isPremiumActive || !subscription.ends_at) return null;
    const endsAt = new Date(subscription.ends_at);
    const diff = endsAt.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [isPremiumActive, subscription.ends_at]);

  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 7;

  const statusPublic = useMemo(() => {
    switch (status) {
      case SubscriptionStatus.RESOLVED: return 'ready';
      case SubscriptionStatus.DEGRADED: return 'degraded';
      case SubscriptionStatus.ERROR: return 'error';
      default: return 'pending';
    }
  }, [status]);

  const tierPublic = isTierKnown ? subscription.tier : 'unknown';

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
    if (hidePaywallTimeoutRef.current) clearTimeout(hidePaywallTimeoutRef.current);
    hidePaywallTimeoutRef.current = setTimeout(() => {
      setUpsellContext({ field: null, source: null, district: null });
      hidePaywallTimeoutRef.current = null;
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (hidePaywallTimeoutRef.current) clearTimeout(hidePaywallTimeoutRef.current);
    };
  }, []);

  const value = useMemo(() => ({
    coordState,
    dispatch,
    tier: tierPublic,
    tierSource,
    status: statusPublic,
    canAccessPremium,
    expiry: {
      endsAt: subscription.ends_at,
      daysUntilExpiry,
      isExpiringSoon,
    },
    paywall: {
      isOpen: showPricingModal,
      open: showPaywall,
      close: hidePaywall,
      upsellContext,
    },
    actions: {
      refresh,
      clear,
      ensure,
    },
    debug: import.meta.env.DEV ? {
      subscription,
      status,
      fetchError,
      subscriptionReady,
      tierSource,
      hasCachedSubscription,
    } : undefined,
  }), [
    coordState,
    dispatch,
    tierPublic,
    tierSource,
    statusPublic,
    canAccessPremium,
    subscription.ends_at,
    daysUntilExpiry,
    isExpiringSoon,
    showPricingModal,
    showPaywall,
    hidePaywall,
    upsellContext,
    refresh,
    clear,
    ensure,
    subscription,
    status,
    fetchError,
    subscriptionReady,
    hasCachedSubscription,
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export default SubscriptionContext;
