/**
 * API Client - Axios instance with JWT token interceptor
 *
 * Canonical API base: '/api' for all environments.
 *
 * - Vite dev server proxies /api to the backend (see frontend/vite.config.js)
 * - Vercel rewrites /api to Render (see frontend/vercel.json)
 *
 * Override only if absolutely necessary via VITE_API_URL.
 */
import axios from 'axios';

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
const MAX_CONCURRENT_REQUESTS = 4;
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
// Timeout: 45s for initial cold-start requests (Render free tier spins down after 15 min idle)
// Most requests complete in <2s once server is warm
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 45000, // 45 seconds - generous for cold starts
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Retry wrapper for requests that may hit cold start timeouts
 * Retries once with increased timeout on timeout errors
 */
const withRetry = async (requestFn, retries = 1) => {
  try {
    return await requestFn();
  } catch (error) {
    const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
    if (isTimeout && retries > 0) {
      console.warn('[API] Timeout, retrying... (cold start likely)');
      return withRetry(requestFn, retries - 1);
    }
    throw error;
  }
};

// Request interceptor - attach JWT token
apiClient.interceptors.request.use(
  (config) => {
    // Attach JWT token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
// Track consecutive 401 errors to detect genuine auth failure vs transient issues
let consecutive401Count = 0;
const MAX_401_BEFORE_CLEAR = 2; // Only clear token after 2 consecutive 401s on auth endpoints

apiClient.interceptors.response.use(
  (response) => {
    // Reset 401 counter on successful response
    consecutive401Count = 0;
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = error.config?.url || '';
      const isAuthEndpoint = requestUrl.includes('/auth/');

      if (isAuthEndpoint) {
        // 401 on auth endpoint - likely genuine token expiry
        consecutive401Count++;

        if (consecutive401Count >= MAX_401_BEFORE_CLEAR) {
          // Only clear token after multiple consecutive auth failures
          // This prevents clearing on transient network issues
          console.warn('[API] Multiple auth failures, clearing token');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          // Note: Do NOT clear subscription_cache here - let SubscriptionContext handle it
          // based on isAuthenticated state change
          consecutive401Count = 0;
        }
      }
      // For non-auth endpoints, DON'T clear token
      // The request may have raced with a token refresh, or be a transient issue
      // Let the specific component/context handle retry logic

      if (!error.message || error.message.includes('status code 401')) {
        error.message = 'Session expired. Please sign in again.';
      }
    } else {
      // Non-401 error - reset counter
      consecutive401Count = 0;
    }
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
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @param {AbortSignal} options.signal - AbortController signal for cancellation
 * @param {string} options.priority - 'high' bypasses queue, 'normal' queues when busy
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

export const getMetadata = () => apiClient.get('/metadata');

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
 * @param {boolean} options.skipCache - Skip cache and fetch fresh data
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
  const { skipCache, signal } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/dashboard?${queryString}`, { signal }),
    { forceRefresh: skipCache, signal }
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
 * @param {boolean} options.skipCache - Skip cache and fetch fresh
 * @param {AbortSignal} options.signal - AbortController signal for cancellation
 */
export const getAggregate = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `aggregate:${queryString}`;
  const { skipCache, signal } = options;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/aggregate?${queryString}`, { signal }),
    { forceRefresh: skipCache, signal }
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
 * @param {AbortSignal} options.signal - Abort signal for cancellation
 */
export const getKpiSummaryV2 = (params = {}, { signal } = {}) =>
  apiClient.get(`/kpi-summary-v2?${buildQueryString(params)}`, { signal });

// Legacy alias (deprecated) - use getKpiSummaryV2 instead
export const getKpiSummary = getKpiSummaryV2;

/**
 * Get available filter options based on current data
 */
export const getFilterOptions = () =>
  apiClient.get('/filter-options');

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
 * Used by AbsorptionChart on New Launch Market page
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
 * Uses retry logic for cold start scenarios
 * @returns {Promise<{projects: Array<{name, district, market_segment}>, count: number}>}
 */
export const getProjectNames = (options = {}) =>
  withRetry(() => apiClient.get('/projects/names', options));

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
export const getDealCheckerMultiScope = (params = {}) =>
  apiClient.get(`/deal-checker/multi-scope?${buildQueryString(params)}`);

// ===== Auth API Functions =====

export const deleteAccount = () => {
  return apiClient.delete('/auth/delete-account');
};

export const createPortalSession = (returnUrl) => {
  return apiClient.post('/payments/portal', { return_url: returnUrl });
};

export const __test__ = {
  queueRequest,
  processQueue,
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
 * @returns {Promise<{
 *   project_name: string,
 *   data_quality: {has_top_year, has_total_units, completeness, sample_window_months, warnings, unit_source, unit_confidence, unit_note},
 *   fundamentals: {total_units, top_year, property_age_years, age_source, tenure, district, developer, first_resale_date},
 *   resale_metrics: {total_resale_transactions, resales_12m, market_turnover_pct, recent_turnover_pct},
 *   risk_assessment: {market_turnover_zone, recent_turnover_zone, overall_risk, interpretation},
 *   gating_flags: {is_boutique, is_brand_new, is_ultra_luxury, is_thin_data, unit_type_mixed}
 * }>}
 */
export const getProjectExitQueue = (projectName, options = {}) =>
  apiClient.get(`/projects/${encodeURIComponent(projectName)}/exit-queue`, options);

/**
 * Get historical price bands (P25/P50/P75) for downside protection analysis
 * Returns percentile bands, floor trend, and verdict assessment
 * @param {string} projectName - The project name
 * @param {Object} params - Query parameters
 * @param {number} params.window_months - Analysis window (default 24, max 60)
 * @param {number} params.unit_psf - Optional user's unit PSF for verdict calculation
 * @returns {Promise<{
 *   project_name: string,
 *   data_source: 'project' | 'district_proxy' | 'segment_proxy',
 *   proxy_label: string | null,
 *   bands: Array<{month, count, p25, p50, p75, p25_s, p50_s, p75_s}>,
 *   latest: {month, p25_s, p50_s, p75_s} | null,
 *   trend: {floor_direction, floor_slope_pct, observation_months},
 *   verdict: {unit_psf, position, position_label, vs_floor_pct, badge, badge_label, explanation} | null,
 *   data_quality: {total_trades, months_with_data, is_valid, fallback_reason, window_months, smoothing}
 * }>}
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
 * @returns {Promise<{data: Array, pagination: Object, filters_applied: Object}>}
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
export const getSupplySummary = (params = {}, options = {}) =>
  apiClient.get(`/supply/summary?${buildQueryString(params)}`, { signal: options.signal });

export default apiClient;
