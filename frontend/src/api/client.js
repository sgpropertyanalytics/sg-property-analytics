/**
 * API Client - Axios instance with Firebase Bearer token auth
 *
 * Canonical API base: '/api' for all environments.
 *
 * - Vite dev server proxies /api to the backend (see frontend/vite.config.js)
 * - Vercel rewrites /api to Render (see frontend/vercel.json)
 *
 * Override only if absolutely necessary via VITE_API_URL.
 */
import axios from 'axios';
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase';

// Determine API base URL (no environment branching)
const getApiBase = () => {
  // Allow override via environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return '/api';
};

const API_BASE = getApiBase();

// ===== Concurrent Request Limiter =====
// Limits the number of simultaneous API requests to prevent server overload
// When charts refetch after filter change, this spreads out the load
// Tuned from 4→8 to reduce "dashboard loads in waves" perception
// while still protecting 512MB backend memory constraint
const MAX_CONCURRENT_REQUESTS = 8;
let activeRequests = 0;
const requestQueue = [];

const processQueue = () => {
  while (requestQueue.length > 0 && activeRequests < MAX_CONCURRENT_REQUESTS) {
    const { execute, resolve, reject, signal } = requestQueue.shift();
    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      reject(err);
      continue;
    }
    activeRequests++;
    execute()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeRequests--;
        processQueue();
      });
  }
};

/**
 * Queue a request to limit concurrent API calls
 * High priority requests bypass the queue
 */
const queueRequest = (executeFn, options = {}) => {
  const { priority = 'normal', signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      const err = new Error('Request aborted');
      err.name = 'AbortError';
      reject(err);
      return;
    }
    if (priority === 'high' || activeRequests < MAX_CONCURRENT_REQUESTS) {
      // Execute immediately if high priority or under limit
      activeRequests++;
      executeFn()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRequests--;
          processQueue();
        });
    } else {
      // Add to queue
      requestQueue.push({ execute: executeFn, resolve, reject, signal });
    }
  });
};

// Create axios instance
// Timeout: 45s for initial cold-start requests (Render service spins down after 15 min idle)
// Most requests complete in <2s once server is warm
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 45000, // 45 seconds - generous for cold starts
  headers: {
    'Content-Type': 'application/json',
  },
});

// ===== Retry Configuration =====
// Centralized retry logic for all retryable errors
// PR2: Consolidates retry from useQuery into API client layer
// Optimized for Render cold-start recovery: 2 retries, short delays, < 4s total
const RETRY_CONFIG = {
  maxRetries: 2, // Total 3 tries (initial + 2 retries)
  baseDelay: 300, // 300ms base → 300ms, 900ms with exponential backoff
  retryableStatuses: [502, 503, 504], // Gateway errors only (not all 5xx)
  jitterMax: 100, // Add up to 100ms random jitter to prevent thundering herd
};

/**
 * Check if an error is retryable
 *
 * STRICT POLICY: Only retry 502/503/504 gateway errors.
 * - Timeout/network errors → Let AccessContext handle as DEGRADED
 * - 401/403 → Never retry (auth flow handles these)
 * - Other 5xx → Don't retry (server errors unlikely to self-resolve)
 *
 * @param {Error} error - Axios error
 * @param {Object} config - Axios request config
 * @returns {boolean}
 */
const isRetryableError = (error, config) => {
  // Never retry aborts
  if (error?.name === 'CanceledError' || error?.name === 'AbortError') {
    return false;
  }

  // Only retry idempotent methods (GET, HEAD) by default
  // Non-idempotent methods (POST, PUT, DELETE) can cause duplicate writes
  const method = (config?.method || 'get').toLowerCase();
  const isIdempotent = method === 'get' || method === 'head';
  if (!isIdempotent && !config?.__allowRetry) {
    return false;
  }

  // Never retry client errors (4xx) - 401/403 handled separately via events
  if (error?.response?.status >= 400 && error?.response?.status < 500) {
    return false;
  }

  // STRICT: Only retry gateway errors (502, 503, 504)
  // Timeout, network, and HTML errors are NOT retried here
  // They will be classified as DEGRADED by AccessContext to preserve cache
  if (RETRY_CONFIG.retryableStatuses.includes(error?.response?.status)) {
    return true;
  }

  return false;
};

/**
 * Retry interceptor - retries failed requests with exponential backoff
 *
 * Only retries idempotent methods (GET, HEAD) by default.
 * For non-idempotent methods, set config.__allowRetry = true to opt-in.
 *
 * Attaches retry state to config to track attempts across interceptor calls.
 */
const setupRetryInterceptor = (client) => {
  client.interceptors.response.use(
    (response) => response, // Pass through successful responses
    async (error) => {
      const config = error.config;

      // No config = can't retry
      if (!config) return Promise.reject(error);

      // Initialize retry state on first failure
      if (config.__retryCount === undefined) {
        config.__retryCount = 0;
      }

      // Check if we should retry
      if (isRetryableError(error, config) && config.__retryCount < RETRY_CONFIG.maxRetries) {
        config.__retryCount += 1;

        // Exponential backoff with jitter: 300ms, 900ms (3^n pattern)
        // Jitter prevents thundering herd when multiple clients retry simultaneously
        const exponentialDelay = RETRY_CONFIG.baseDelay * Math.pow(3, config.__retryCount - 1);
        const jitter = Math.floor(Math.random() * RETRY_CONFIG.jitterMax);
        const delay = exponentialDelay + jitter;

        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[API] Retry ${config.__retryCount}/${RETRY_CONFIG.maxRetries} after ${delay}ms:`,
            error.message,
            {
              retrySource: 'api_client',
              retryCount: config.__retryCount,
              maxRetries: RETRY_CONFIG.maxRetries,
              url: config.url,
              method: config.method,
            }
          );
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Check if aborted during delay
        if (config.signal?.aborted) {
          const abortError = new Error('Request aborted');
          abortError.name = 'AbortError';
          return Promise.reject(abortError);
        }

        // Retry the request
        return client.request(config);
      }

      // No more retries, reject with original error
      return Promise.reject(error);
    }
  );
};

// Install retry interceptor (guard against double-install in hot reload)
if (!apiClient.__retryInterceptorInstalled) {
  setupRetryInterceptor(apiClient);
  apiClient.__retryInterceptorInstalled = true;
}

// Request interceptor - attach Firebase Bearer token
async function getFirebaseIdToken({ forceRefresh = false } = {}) {
  if (!isFirebaseConfigured()) return null;

  try {
    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;
    if (!currentUser) return null;
    return await currentUser.getIdToken(forceRefresh);
  } catch {
    // Fallback for edge cases where app bootstrap races
    try {
      const { getAuth } = await import('firebase/auth');
      const currentUser = getAuth()?.currentUser;
      if (!currentUser) return null;
      return await currentUser.getIdToken(forceRefresh);
    } catch {
      return null;
    }
  }
}

apiClient.interceptors.request.use(async (config) => {
  const idToken = await getFirebaseIdToken();
  if (idToken) {
    config.headers.Authorization = `Bearer ${idToken}`;
  }
  return config;
});

/**
 * Normalize error to include user-friendly message.
 *
 * This centralizes error message mapping at the API boundary,
 * ensuring ALL errors have a `userMessage` property before
 * reaching components. Components can then simply render
 * `error.userMessage` without needing their own mapping logic.
 *
 * @param {Error} error - Axios error object
 * @returns {Error} - Same error with `userMessage` property added
 */
const normalizeError = (error) => {
  const status = error?.response?.status;

  if (status === 400) {
    // Backend returns { error: { message: "..." } } - extract message from object or use string directly
    const backendError = error?.response?.data?.error;
    error.userMessage = backendError?.message || backendError || 'Invalid request. Please adjust filters and try again.';
  } else if (status === 401) {
    error.userMessage = 'Session expired. Please sign in again.';
  } else if (status === 403) {
    error.userMessage = 'Access denied for this account.';
  } else if (status === 404) {
    error.userMessage = 'Resource not found. Please try again.';
  } else if (status === 429) {
    error.userMessage = 'Too many requests. Please wait a moment and try again.';
  } else if (status >= 500) {
    error.userMessage = 'Server error. Please try again in a moment.';
  } else if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    error.userMessage = 'Request timed out. Please retry.';
  } else if (error?.code === 'ERR_NETWORK' || !error?.response) {
    error.userMessage = 'Network error. Check your connection and retry.';
  } else if (error?.code === 'HTML_RESPONSE') {
    // Already set by unwrapEnvelope, but ensure it's present
    error.userMessage = error.userMessage || 'Server is warming up. Please wait a moment and try again.';
  } else if (error?.name === 'CanceledError' || error?.name === 'AbortError') {
    // Abort errors are expected control flow, not user-facing errors
    error.userMessage = null;
  } else {
    error.userMessage = 'Something went wrong. Please try again.';
  }

  return error;
};

/**
 * Unwrap api_contract envelope from backend response.
 *
 * Backend always returns: { data: {...}, meta: {...} }
 * This extracts the inner data so callers can use response.data.kpis
 * instead of response.data.data.kpis.
 *
 * @param {Object} body - The response body (axios response.data)
 * @returns {{ data: any, meta: any }} - Unwrapped data and meta
 * @throws {Error} If body is HTML (indicates proxy fallback/timeout)
 */
export function unwrapEnvelope(body) {
  // Detect HTML response (Vercel SPA fallback when Render times out)
  // This happens when the backend is cold starting and Vercel returns index.html
  if (typeof body === 'string' && (body.includes('<!DOCTYPE') || body.includes('<html'))) {
    console.warn('[API] Received HTML instead of JSON - backend may be cold starting');
    const error = new Error('Backend unavailable - received HTML instead of JSON. Please retry.');
    error.code = 'HTML_RESPONSE';
    error.userMessage = 'Server is warming up. Please wait a moment and try again.';
    throw error;
  }

  if (body && typeof body === 'object' && 'data' in body && typeof body.data === 'object') {
    return { data: body.data, meta: body.meta };
  }
  // No envelope, return as-is
  return { data: body, meta: undefined };
}

apiClient.interceptors.response.use(
  (response) => {
    // Unwrap api_contract envelope using helper
    const unwrapped = unwrapEnvelope(response.data);
    response.data = unwrapped.data;
    response.meta = unwrapped.meta;

    return response;
  },
  async (error) => {
    // One-time auth recovery: refresh Firebase token and retry once on 401.
    const status = error?.response?.status;
    const config = error?.config;
    if (status === 401 && config && !config.__authRetry && !config.signal?.aborted) {
      config.__authRetry = true;
      const refreshedToken = await getFirebaseIdToken({ forceRefresh: true });
      if (refreshedToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${refreshedToken}`;
        return apiClient.request(config);
      }
    }

    // Normalize error FIRST - adds userMessage for UI consumption
    normalizeError(error);
    // Note: 401s are handled by Firebase SDK auto-refresh (getIdToken in request interceptor)
    // Note: 403 = authenticated but forbidden by endpoint-level policy (not re-auth)
    return Promise.reject(error);
  }
);

// ===== Helper Functions =====

/**
 * Normalize value to array - prevents "undefined.map()" crashes
 * Use at API boundary to normalize response arrays once.
 * @param {any} x - Value to normalize
 * @returns {Array} - Original array or empty array
 */
export const asArray = (x) => (Array.isArray(x) ? x : []);

/**
 * Build query string from params object, filtering out null/undefined values
 */
const buildQueryString = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  return query.toString();
};

// ===== API Response Cache =====
// Simple in-memory cache for instant drill navigation

const apiCache = new Map();
const inflightRequests = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL
const MAX_CACHE_ENTRIES = 200;

const evictOldestCacheEntry = () => {
  const oldestKey = apiCache.keys().next().value;
  if (oldestKey !== undefined) {
    apiCache.delete(oldestKey);
  }
};

/**
 * Get cached response or fetch fresh data
 * Uses request queue to limit concurrent API calls during cascade refetches
 * @param {string} cacheKey - Unique key for this request
 * @param {Function} fetchFn - Function that returns a promise for the API call
 * @param {Object} options - Cache options
 * @param {boolean} [options.forceRefresh] - Skip cache and fetch fresh
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @param {'high'|'normal'|'low'|'medium'} [options.priority] - Queue priority
 * @returns {Promise} - Cached or fresh response
 */
const cachedFetch = async (cacheKey, fetchFn, options = {}) => {
  const { forceRefresh = false, signal, priority = 'normal' } = options;

  // Check if already aborted before making request
  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Check cache first (unless force refresh)
  if (!forceRefresh && apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      // Return cached data immediately (no queue needed)
      return cached.data;
    }
    // Cache expired, remove it
    apiCache.delete(cacheKey);
  }

  // Reuse in-flight request for the same cache key
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey);
  }

  const pendingRequest = queueRequest(fetchFn, { priority, signal })
    .then((response) => {
      inflightRequests.delete(cacheKey);
      return response;
    })
    .catch((error) => {
      inflightRequests.delete(cacheKey);
      throw error;
    });

  inflightRequests.set(cacheKey, pendingRequest);

  // Queue the fetch to limit concurrent requests
  const response = await pendingRequest;

  // Don't cache if request was aborted
  if (signal?.aborted) {
    const err = new Error('Request aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Cache the response
  if (apiCache.size >= MAX_CACHE_ENTRIES) {
    evictOldestCacheEntry();
  }
  apiCache.set(cacheKey, {
    data: response,
    timestamp: Date.now()
  });

  return response;
};

// ===== Analytics API Functions =====

export const getHealth = () => apiClient.get('/health');
export const getAuthHealth = () => apiClient.get('/auth/health');

export const getMetadata = (options = {}) => {
  const cacheKey = 'metadata';
  const { skipCache, signal, priority } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get('/metadata', { signal }),
    { forceRefresh: skipCache, signal, priority }
  );
};

/**
 * Get New Sale vs Young Resale (4-9 years age) comparison
 * RESPECTS GLOBAL FILTERS from sidebar (district, bedroom, segment, date range).
 * Only drill level (timeGrain) is visual-local.
 * @param {Object} params - Query parameters
 * @param {string} params.district - comma-separated districts from sidebar
 * @param {string} params.bedroom - comma-separated bedroom counts from sidebar
 * @param {string} params.segment - CCR, RCR, OCR from sidebar
 * @param {string} params.timeGrain - year, quarter, month (visual-local drill)
 * @returns {Promise<{chartData: Array, summary: Object, appliedFilters: Object}>}
 */
export const getNewVsResale = (params = {}, options = {}) =>
  apiClient.get(`/new-vs-resale?${buildQueryString(params)}`, { signal: options.signal });

// ===== PowerBI-style Aggregation API Functions =====

/**
 * Unified dashboard endpoint - returns all chart datasets in one response.
 *
 * This is the recommended endpoint for the Power BI-style dashboard.
 * Uses SQL CTEs for efficient aggregation without loading data into memory.
 *
 * @param {Object} params - Filter and option parameters
 * @param {string} params.district - Comma-separated districts (D01,D02,...)
 * @param {string} params.bedroom - Comma-separated bedroom counts (1,2,3,4,5)
 * @param {string} params.segment - CCR, RCR, OCR
 * @param {string} params.sale_type - New Sale, Resale
 * @param {string} params.date_from - YYYY-MM-DD
 * @param {string} params.date_to - YYYY-MM-DD
 * @param {number} params.psf_min - Minimum PSF
 * @param {number} params.psf_max - Maximum PSF
 * @param {number} params.size_min - Minimum sqft
 * @param {number} params.size_max - Maximum sqft
 * @param {string} params.tenure - Freehold, 99-year, 999-year
 * @param {string} params.project - Project name filter (partial match)
 * @param {string} params.panels - Comma-separated panels to return
 *        (time_series, volume_by_location, price_histogram, bedroom_mix, summary)
 * @param {string} params.time_grain - year, quarter, month (default: month)
 * @param {string} params.location_grain - region, district, project (default: region)
 * @param {number} params.histogram_bins - Number of bins for price histogram (default: 20, max: 50)
 * @param {Object} options - Request options
 * @param {boolean} [options.skipCache] - Skip cache and fetch fresh data
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @param {'high'|'normal'|'low'|'medium'} [options.priority] - Request priority for queue bypass
 *
 * @returns {Promise<{
 *   data: {
 *     time_series: Array,
 *     volume_by_location: Array,
 *     price_histogram: Array,
 *     bedroom_mix: Array,
 *     summary: Object
 *   },
 *   meta: {
 *     cache_hit: boolean,
 *     elapsed_ms: number,
 *     filters_applied: Object,
 *     total_records_matched: number
 *   }
 * }>}
 *
 * @example
 * // Get all panels with default options
 * const dashboard = await getDashboard({ district: 'D09,D10', bedroom: '2,3,4' });
 *
 * // Get specific panels
 * const dashboard = await getDashboard({
 *   segment: 'CCR',
 *   panels: 'time_series,summary',
 *   time_grain: 'quarter'
 * });
 */
export const getDashboard = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `dashboard:${queryString}`;
  const { skipCache, signal, priority } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/dashboard?${queryString}`, { signal }),
    { forceRefresh: skipCache, signal, priority }
  );
};

/**
 * Flexible aggregation endpoint for dynamic filtering
 * Uses caching for instant drill navigation
 * @param {Object} params - Query parameters
 * @param {string} params.group_by - Comma-separated dimensions (month, quarter, year, district, bedroom, sale_type, project, region)
 * @param {string} params.metrics - Comma-separated metrics (count, median_psf, avg_psf, total_value, median_price)
 * @param {string} params.district - Comma-separated districts (D01,D02,...)
 * @param {string} params.bedroom - Comma-separated bedroom counts (1,2,3,4,5)
 * @param {string} params.segment - CCR, RCR, OCR
 * @param {string} params.sale_type - New Sale, Resale
 * @param {string} params.date_from - YYYY-MM-DD
 * @param {string} params.date_to - YYYY-MM-DD
 * @param {number} params.psf_min - Minimum PSF
 * @param {number} params.psf_max - Maximum PSF
 * @param {number} params.size_min - Minimum sqft
 * @param {number} params.size_max - Maximum sqft
 * @param {string} params.tenure - Freehold, 99-year, 999-year
 * @param {Object} options - Cache and request options
 * @param {boolean} [options.skipCache] - Skip cache and fetch fresh
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @param {'high'|'normal'|'low'} [options.priority] - Request priority for queue bypass
 */
export const getAggregate = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `aggregate:${queryString}`;
  const { skipCache, signal, priority } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/aggregate?${queryString}`, { signal }),
    { forceRefresh: skipCache, signal, priority }
  );
};

/**
 * Get district growth data - median PSF growth % per district
 * Compares earliest quarter to latest quarter.
 * Used by GrowthDumbbellChart on District Deep Dive page.
 *
 * @param {Object} params - Query parameters
 * @param {string} [params.sale_type] - Sale type filter (new_sale, resale, sub_sale)
 * @param {string} [params.bedroom] - Comma-separated bedroom counts
 * @param {string} [params.district] - Comma-separated districts
 * @param {Object} options - Request options
 * @param {AbortSignal} [options.signal] - AbortController signal for cancellation
 * @returns {Promise<{
 *   data: Array<{district, startQuarter, endQuarter, startPsf, endPsf, growthPercent}>,
 *   meta: {startQuarter, endQuarter, excludedDistricts, elapsedMs}
 * }>}
 */
export const getDistrictGrowth = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `district-growth:${queryString}`;
  const { skipCache, signal, priority } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/district-growth?${queryString}`, { signal }),
    { forceRefresh: skipCache, signal, priority }
  );
};

/**
 * Get KPI summary using registry-based endpoint
 * Returns array of KPIResult objects with consistent shape.
 * @param {Object} params - Filter parameters
 * @param {string} params.district - Comma-separated districts
 * @param {string} params.bedroom - Comma-separated bedroom counts
 * @param {string} params.segment - CCR, RCR, OCR
 * @param {Object} options - Request options
 * @param {AbortSignal} [options.signal] - Abort signal for cancellation
 * @param {'high'|'normal'|'low'|'medium'} [options.priority] - Queue priority
 */
export const getKpiSummaryV2 = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `kpi-summary-v2:${queryString}`;
  const { signal, priority = 'high' } = options; // Default high priority - KPIs are above the fold
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/kpi-summary-v2?${queryString}`, { signal }),
    { signal, priority }
  );
};

// Legacy alias (deprecated) - use getKpiSummaryV2 instead
export const getKpiSummary = getKpiSummaryV2;

/**
 * Get available filter options based on current data
 */
export const getFilterOptions = (options = {}) => {
  const cacheKey = 'filter-options';
  const { skipCache, signal, priority } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get('/filter-options', { signal }),
    { forceRefresh: skipCache, signal, priority }
  );
};

/**
 * Get new launch timeline - projects launched per period with unit counts
 * Used by NewLaunchTimelineChart on New Launch Market page
 * @param {Object} params - Query parameters
 * @param {string} params.time_grain - year, quarter, month (default: quarter)
 * @param {string} params.district - Comma-separated districts (D01,D02,...)
 * @param {string} params.segment - CCR, RCR, OCR
 * @param {string} params.bedroom - Comma-separated bedroom counts
 * @param {string} params.date_from - YYYY-MM-DD (inclusive)
 * @param {string} params.date_to - YYYY-MM-DD (inclusive, converted to exclusive on backend)
 * @param {Object} options - Request options
 * @param {AbortSignal} options.signal - AbortController signal for cancellation
 * @returns {Promise<{
 *   data: Array<{periodStart: string, projectCount: number, totalUnits: number}>,
 *   meta: {requestId: string, elapsedMs: number, apiVersion: string}
 * }>}
 */
export const getNewLaunchTimeline = (params = {}, options = {}) =>
  apiClient.get(`/new-launch-timeline?${buildQueryString(params)}`, { signal: options.signal });

/**
 * Get new launch absorption rates - projects launched per period with avg launch-month absorption
 * Used by NewLaunchTimelineChart on New Launch Market page
 */
export const getNewLaunchAbsorption = (params = {}, options = {}) =>
  apiClient.get(`/new-launch-absorption?${buildQueryString(params)}`, { signal: options.signal });

/**
 * Get market activity heatmap by bedroom and property age
 * Used by ValueParityPanel's Explore Budget tab
 *
 * Shows % distribution of transactions within budget range, grouped by:
 * - Bedroom type (1BR, 2BR, 3BR, 4BR, 5+BR)
 * - Property age band (New Sale, Recently TOP, Young Resale, etc.)
 *
 * @param {Object} params - Query parameters
 * @param {number} params.budget - Target budget in SGD (required)
 * @param {number} [params.tolerance=100000] - Price tolerance (+/-)
 * @param {number} [params.bedroom] - Optional bedroom filter (1-5)
 * @param {string} [params.segment] - Market segment (CCR/RCR/OCR)
 * @param {string} [params.district] - District code (D01-D28)
 * @param {string} [params.tenure] - Tenure type
 * @param {Object} [options] - Request options
 * @param {AbortSignal} [options.signal] - AbortController signal
 */
export const getBudgetHeatmap = (params = {}, options = {}) =>
  apiClient.get(`/budget-heatmap?${buildQueryString(params)}`, { signal: options.signal });

/**
 * Floor liquidity heatmap - shows which floor zones resell faster by project
 * Uses Z-score normalization within each project for fair comparison
 * @param {Object} params - Query parameters
 * @param {number} params.window_months - 6, 12, or 24 (default: 12)
 * @param {string} params.segment - CCR, RCR, or OCR
 * @param {string} params.district - Comma-separated districts
 * @param {string} params.bedroom - Comma-separated bedroom counts
 * @param {number} params.min_transactions - Minimum per project (default: 10)
 * @param {number} params.limit - Max projects (default: 30, max: 50)
 * @returns {Promise<{
 *   data: {
 *     projects: Array<{project_name, district, total_transactions, floor_zones}>,
 *     floor_zone_order: string[]
 *   },
 *   meta: {window_months, filters_applied, total_projects, projects_returned}
 * }>}
 */
export const getFloorLiquidityHeatmap = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `floor_liquidity_heatmap:${queryString}`;
  const { skipCache, signal } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/floor-liquidity-heatmap?${queryString}`, { signal }),
    { forceRefresh: skipCache, signal }
  );
};

// ===== Insights API Functions =====

/**
 * Get district PSF data for choropleth map visualization
 * @param {Object} params - Query parameters
 * @param {string} params.period - Time period (e.g., '12m', 'all')
 * @param {number} params.bed - Bedroom count (1-5, or null for all)
 * @param {string} params.sale_type - 'resale' or 'new_sale'
 * @param {Object} options - Request options
 * @param {AbortSignal} options.signal - AbortController signal
 * @returns {Promise<{districts: Array, meta: Object}>}
 */
export const getDistrictPsf = (params = {}, options = {}) =>
  apiClient.get(`/insights/district-psf?${buildQueryString(params)}`, { signal: options.signal });

/**
 * Get district liquidity data for choropleth map visualization
 * @param {Object} params - Query parameters
 * @param {string} params.period - Time period (e.g., '12m', 'all')
 * @param {number} params.bed - Bedroom count (1-5, or null for all)
 * @param {string} params.saleType - 'resale' or 'new_sale'
 * @param {Object} options - Request options
 * @param {AbortSignal} options.signal - AbortController signal
 * @returns {Promise<{districts: Array, meta: Object}>}
 */
export const getDistrictLiquidity = (params = {}, options = {}) =>
  apiClient.get(`/insights/district-liquidity?${buildQueryString(params)}`, { signal: options.signal });

// ===== GLS (Government Land Sales) API Functions =====

/**
 * Get all GLS tenders (both launched and awarded)
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 * @param {string} params.status - 'launched' or 'awarded'
 * @param {number} params.limit - Max results (default 100)
 * @param {string} params.sort - Field to sort by
 * @param {string} params.order - asc or desc
 */
export const getGLSAll = (params = {}, options = {}) =>
  apiClient.get(`/gls/all?${buildQueryString(params)}`, { signal: options.signal });

// ===== UPCOMING Launches API Functions =====
// These endpoints are for projects that have NOT YET LAUNCHED (pre-sale info)
// Data source: EdgeProp, PropNex, ERA scraping
// Endpoint: /api/upcoming-launches/*

/**
 * Get all UPCOMING launch projects (pre-launch, not yet selling)
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 * @param {string} params.district - Filter by district (e.g. D09)
 * @param {number} params.launch_year - Filter by launch year (default 2026)
 * @param {boolean} params.needs_review - Filter by review status
 * @param {number} params.limit - Max results (default 100)
 * @param {string} params.sort - Field to sort by
 * @param {string} params.order - asc or desc
 */
export const getUpcomingLaunchesAll = (params = {}, options = {}) =>
  apiClient.get(`/upcoming-launches/all?${buildQueryString(params)}`, { signal: options.signal });

// ===== ACTIVE New Sales API Functions =====
// These endpoints are for projects that have ALREADY LAUNCHED and are selling
// Data source: transactions (sale_type='New Sale') + project_inventory (URA API)

/**
 * Get ACTIVE new sales projects with sales progress (already launched)
 * - units_sold: deterministic count from transactions
 * - total_units: from project_inventory (URA API)
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 * @param {string} params.district - Comma-separated districts (D01,D02,...)
 */
export const getHotProjects = (params = {}, options = {}) =>
  apiClient.get(`/projects/hot?${buildQueryString(params)}`, { signal: options.signal });

// ===== Project Inventory API Functions =====

/**
 * Get inventory data for a specific project (unsold units calculation)
 * @param {string} projectName - The project name
 * @returns {Promise<{
 *   project_name: string,
 *   total_units: number|null,
 *   cumulative_new_sales: number,
 *   cumulative_resales: number,
 *   estimated_unsold: number|null,
 *   data_source: string,
 *   confidence: string,
 *   disclaimer: string
 * }>}
 */
export const getProjectInventory = (projectName, options = {}) =>
  apiClient.get(`/projects/${encodeURIComponent(projectName)}/inventory`, { signal: options.signal });

// ===== Deal Checker API Functions =====

/**
 * Get project names for dropdown selection
 * Only returns geocoded projects
 * Retry handled automatically by API client interceptor for GET requests
 * @returns {Promise<{data: {projects: Array<{name, district, market_segment}>, count: number}}>}
 */
export const getProjectNames = (options = {}) => {
  return apiClient.get('/projects/names', options);
};

/**
 * Get multi-scope comparison for deal checker
 * Returns data for three scopes: same project, 1km radius, 2km radius
 * @param {Object} params - Query parameters
 * @param {string} params.project_name - Selected project name (required)
 * @param {number} params.bedroom - Bedroom count 1-5 (required)
 * @param {number} params.price - Buyer's price paid (required)
 * @param {number} params.sqft - Unit size in sqft (optional)
 * @returns {Promise<{
 *   project: {name, district, market_segment, latitude, longitude},
 *   filters: {bedroom, buyer_price, buyer_sqft},
 *   scopes: {
 *     same_project: {histogram, percentile, median_psf, transaction_count},
 *     radius_1km: {histogram, percentile, median_psf, transaction_count},
 *     radius_2km: {histogram, percentile, median_psf, transaction_count}
 *   },
 *   map_data: {
 *     center: {lat, lng},
 *     projects_1km: Array,
 *     projects_2km: Array
 *   }
 * }>}
 */
export const getDealCheckerMultiScope = (params = {}, options = {}) =>
  apiClient.get(`/deal-checker/multi-scope?${buildQueryString(params)}`, { signal: options.signal });

// ===== Auth API Functions =====

export const deleteAccount = () => {
  return apiClient.delete('/auth/delete-account');
};

export const __test__ = {
  queueRequest,
  processQueue,
  isRetryableError,
  apiCache,
  addCacheEntry(key, value) {
    if (apiCache.size >= MAX_CACHE_ENTRIES) {
      evictOldestCacheEntry();
    }
    apiCache.set(key, { data: value, timestamp: Date.now() });
  },
  getMaxCacheEntries() {
    return MAX_CACHE_ENTRIES;
  },
  resetQueueState() {
    requestQueue.length = 0;
    activeRequests = 0;
    apiCache.clear();
  },
  setActiveRequests(value) {
    activeRequests = value;
  },
  getActiveRequests() {
    return activeRequests;
  },
};

// ===== Exit Queue Risk API Functions =====

/**
 * Get liquidity assessment and turnover metrics for a specific project
 *
 * Liquidity Zones (transactions per 100 units):
 * - Low Liquidity (<5): harder to exit
 * - Healthy Liquidity (5-15): optimal for exit
 * - Elevated Turnover (>15): possible volatility
 *
 * @param {string} projectName - The project name
 * @returns {Promise<{data: {
 *   project_name: string,
 *   data_quality: {has_top_year, has_total_units, completeness, sample_window_months, warnings, unit_source, unit_confidence, unit_note},
 *   fundamentals: {total_units, top_year, property_age_years, age_source, tenure, district, developer, first_resale_date},
 *   resale_metrics: {total_resale_transactions, resales_12m, market_turnover_pct, recent_turnover_pct},
 *   risk_assessment: {market_turnover_zone, recent_turnover_zone, overall_risk, interpretation},
 *   gating_flags: {is_boutique, is_brand_new, is_ultra_luxury, is_thin_data, unit_type_mixed}
 * }}>}
 */
export const getProjectExitQueue = (projectName, options = {}) =>
  apiClient.get(`/projects/${encodeURIComponent(projectName)}/exit-queue`, options);

/**
 * Get historical price bands (P25/P50/P75) for downside protection analysis
 * Returns percentile bands, floor trend, and verdict assessment
 * @param {string} projectName - The project name
 * @param {Object} params - Query parameters
 * @param {number} [params.window_months] - Analysis window (default 24, max 60)
 * @param {number} [params.unit_psf] - Optional user's unit PSF for verdict calculation
 * @returns {Promise<{data: {
 *   project_name: string,
 *   data_source: 'project' | 'district_proxy' | 'segment_proxy',
 *   proxy_label: string | null,
 *   bands: Array<{month, count, p25, p50, p75, p25_s, p50_s, p75_s}>,
 *   latest: {month, p25_s, p50_s, p75_s} | null,
 *   trend: {floor_direction, floor_slope_pct, observation_months},
 *   verdict: {unit_psf, position, position_label, vs_floor_pct, badge, badge_label, explanation} | null,
 *   data_quality: {total_trades, months_with_data, is_valid, fallback_reason, window_months, smoothing}
 * }}>}
 */
export const getProjectPriceBands = (projectName, params = {}, options = {}) =>
  apiClient.get(`/projects/${encodeURIComponent(projectName)}/price-bands?${buildQueryString(params)}`, options);

/**
 * Get transaction-level price growth data for a project
 * Returns historical transactions with growth metrics:
 * - cumulative_growth_pct: Growth from first transaction in segment
 * - incremental_growth_pct: Growth from previous transaction
 * - annualized_growth_pct: Annualized rate
 * @param {string} projectName - Project name (exact match)
 * @param {Object} params - Query parameters
 * @param {number} params.per_page - Records per page (default 500, max 500)
 * @param {number} params.bedroom - Filter by bedroom count
 * @returns {Promise<{data: {data: Array, pagination: Object, filters_applied: Object}}>}
 */
export const getProjectPriceGrowth = (projectName, options = {}) =>
  apiClient.get(`/transactions/price-growth?project=${encodeURIComponent(projectName)}&per_page=500`, options);

// ===== Supply Pipeline API Functions =====

/**
 * Get aggregated supply pipeline data for waterfall visualization
 *
 * Returns supply data from three mutually exclusive sources:
 * - Unsold Inventory: Developer stock from launched projects
 * - Upcoming Launches: Pre-launch projects by year
 * - GLS Pipeline: Open GLS tenders (unassigned sites)
 *
 * @param {Object} params - Query parameters
 * @param {boolean} [params.includeGls=true] - Include GLS pipeline in totals
 * @param {number} [params.launchYear=2026] - Year filter for upcoming launches
 * @param {Object} [options] - Request options
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<{
 *   byRegion: {
 *     CCR: {unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply, components},
 *     RCR: {...},
 *     OCR: {...}
 *   },
 *   byDistrict: {D01: {...}, ...},
 *   totals: {unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply},
 *   meta: {launchYear, includeGls, computedAs, asOfDate, warnings}
 * }>}
 */
export const getSupplySummary = async (params = {}, options = {}) => {
  const response = await apiClient.get(
    `/supply/summary?${buildQueryString(params)}`,
    { signal: options.signal }
  );
  return response.data;
};

export default apiClient;
