/**
 * API Client - Axios instance with JWT token interceptor
 *
 * Production (Vercel): Uses relative URL '/api' - Vercel proxy forwards to Render
 * Development (localhost): Uses 'http://localhost:5000/api'
 *
 * This eliminates CORS issues in production since all requests go through Vercel's proxy.
 * See frontend/vercel.json for the rewrite rule.
 */
import axios from 'axios';

// Determine API base URL
// Production: Use relative URL (Vercel proxy handles CORS)
// Development: Use localhost directly
const getApiBase = () => {
  // Allow override via environment variable
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Production (Vercel): Use relative URL - proxy handles forwarding to Render
  // This eliminates CORS issues completely
  if (import.meta.env.PROD || window.location.hostname !== 'localhost') {
    return '/api';
  }

  // Development: Direct to local Flask server
  return 'http://localhost:5000/api';
};

const API_BASE = getApiBase();

// Create axios instance
const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach JWT token from localStorage
apiClient.interceptors.request.use(
  (config) => {
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
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ===== Helper Functions =====

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
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Get cached response or fetch fresh data
 * @param {string} cacheKey - Unique key for this request
 * @param {Function} fetchFn - Function that returns a promise for the API call
 * @param {Object} options - Cache options
 * @param {boolean} options.forceRefresh - Skip cache and fetch fresh
 * @returns {Promise} - Cached or fresh response
 */
const cachedFetch = async (cacheKey, fetchFn, options = {}) => {
  const { forceRefresh = false } = options;

  // Check cache first (unless force refresh)
  if (!forceRefresh && apiCache.has(cacheKey)) {
    const cached = apiCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      // Return cached data immediately
      return cached.data;
    }
    // Cache expired, remove it
    apiCache.delete(cacheKey);
  }

  // Fetch fresh data
  const response = await fetchFn();

  // Cache the response
  apiCache.set(cacheKey, {
    data: response,
    timestamp: Date.now()
  });

  return response;
};

/**
 * Clear all cached data (useful when filters change significantly)
 */
export const clearApiCache = () => {
  apiCache.clear();
};

/**
 * Get cache stats for debugging
 */
export const getCacheStats = () => ({
  size: apiCache.size,
  keys: Array.from(apiCache.keys())
});

// ===== Analytics API Functions =====

export const getHealth = () => apiClient.get('/health');

export const getPriceTrends = (params = {}) =>
  apiClient.get(`/price_trends?${buildQueryString(params)}`);

export const getTotalVolume = (params = {}) =>
  apiClient.get(`/total_volume?${buildQueryString(params)}`);

export const getAvgPsf = (params = {}) =>
  apiClient.get(`/avg_psf?${buildQueryString(params)}`);

export const getDistricts = () => apiClient.get('/districts');

export const getSaleTypeTrends = (params = {}) =>
  apiClient.get(`/sale_type_trends?${buildQueryString(params)}`);

export const getPriceTrendsBySaleType = (params = {}) =>
  apiClient.get(`/price_trends_by_sale_type?${buildQueryString(params)}`);

export const getPriceTrendsByRegion = (params = {}) =>
  apiClient.get(`/price_trends_by_region?${buildQueryString(params)}`);

export const getPsfTrendsByRegion = (params = {}) =>
  apiClient.get(`/psf_trends_by_region?${buildQueryString(params)}`);

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
export const getNewVsResale = (params = {}) =>
  apiClient.get(`/new-vs-resale?${buildQueryString(params)}`);

export const getMarketStats = (params = {}) =>
  apiClient.get(`/market_stats?${buildQueryString(params)}`);

export const getMarketStatsByDistrict = (params = {}) =>
  apiClient.get(`/market_stats_by_district?${buildQueryString(params)}`);

export const getProjectsByDistrict = (district, params = {}) =>
  apiClient.get(`/projects_by_district?${buildQueryString({ district, ...params })}`);

export const getPriceProjectsByDistrict = (district, params = {}) =>
  apiClient.get(`/price_projects_by_district?${buildQueryString({ district, ...params })}`);

export const getComparableValueAnalysis = (params = {}) =>
  apiClient.get(`/comparable_value_analysis?${buildQueryString(params)}`);

// ===== PowerBI-style Aggregation API Functions =====

/**
 * Unified dashboard endpoint - returns all chart datasets in one response.
 *
 * This is the recommended endpoint for the Power BI-style dashboard.
 * Uses SQL CTEs for efficient aggregation without loading data into memory.
 *
 * @param {Object} params - Filter and option parameters
 * @param {string} params.district - Comma-separated districts (D01,D02,...)
 * @param {string} params.bedroom - Comma-separated bedroom counts (2,3,4)
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
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/dashboard?${queryString}`),
    { forceRefresh: options.skipCache }
  );
};

/**
 * Get dashboard cache statistics
 * @returns {Promise<{size: number, maxsize: number, ttl: number}>}
 */
export const getDashboardCacheStats = () => apiClient.get('/dashboard/cache');

/**
 * Clear dashboard cache
 * @returns {Promise<{status: string}>}
 */
export const clearDashboardCache = () => apiClient.delete('/dashboard/cache');

/**
 * Flexible aggregation endpoint for dynamic filtering
 * Uses caching for instant drill navigation
 * @param {Object} params - Query parameters
 * @param {string} params.group_by - Comma-separated dimensions (month, quarter, year, district, bedroom, sale_type, project, region)
 * @param {string} params.metrics - Comma-separated metrics (count, median_psf, avg_psf, total_value, median_price)
 * @param {string} params.district - Comma-separated districts (D01,D02,...)
 * @param {string} params.bedroom - Comma-separated bedroom counts (2,3,4)
 * @param {string} params.segment - CCR, RCR, OCR
 * @param {string} params.sale_type - New Sale, Resale
 * @param {string} params.date_from - YYYY-MM-DD
 * @param {string} params.date_to - YYYY-MM-DD
 * @param {number} params.psf_min - Minimum PSF
 * @param {number} params.psf_max - Maximum PSF
 * @param {number} params.size_min - Minimum sqft
 * @param {number} params.size_max - Maximum sqft
 * @param {string} params.tenure - Freehold, 99-year, 999-year
 * @param {Object} options - Cache options
 * @param {boolean} options.skipCache - Skip cache and fetch fresh
 */
export const getAggregate = (params = {}, options = {}) => {
  const queryString = buildQueryString(params);
  const cacheKey = `aggregate:${queryString}`;
  return cachedFetch(
    cacheKey,
    () => apiClient.get(`/aggregate?${queryString}`),
    { forceRefresh: options.skipCache }
  );
};

/**
 * Paginated transaction list for drill-through
 * @param {Object} params - Same filters as aggregate, plus pagination
 * @param {number} params.page - Page number (default 1)
 * @param {number} params.limit - Records per page (default 50, max 200)
 * @param {string} params.sort_by - Column to sort (default transaction_date)
 * @param {string} params.sort_order - asc or desc (default desc)
 */
export const getTransactionsList = (params = {}) =>
  apiClient.get(`/transactions/list?${buildQueryString(params)}`);

/**
 * Get available filter options based on current data
 */
export const getFilterOptions = () =>
  apiClient.get('/filter-options');

// ===== GLS (Government Land Sales) API Functions =====

/**
 * Get upcoming (launched) GLS tenders - SIGNAL data
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 * @param {number} params.limit - Max results (default 50)
 */
export const getGLSUpcoming = (params = {}) =>
  apiClient.get(`/gls/upcoming?${buildQueryString(params)}`);

/**
 * Get awarded GLS tenders - FACT data
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 * @param {number} params.limit - Max results (default 50)
 */
export const getGLSAwarded = (params = {}) =>
  apiClient.get(`/gls/awarded?${buildQueryString(params)}`);

/**
 * Get all GLS tenders (both launched and awarded)
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 * @param {string} params.status - 'launched' or 'awarded'
 * @param {number} params.limit - Max results (default 100)
 * @param {string} params.sort - Field to sort by
 * @param {string} params.order - asc or desc
 */
export const getGLSAll = (params = {}) =>
  apiClient.get(`/gls/all?${buildQueryString(params)}`);

/**
 * Get aggregate supply pipeline (upcoming tenders)
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 */
export const getGLSSupplyPipeline = (params = {}) =>
  apiClient.get(`/gls/supply-pipeline?${buildQueryString(params)}`);

/**
 * Get aggregate price floor data (awarded tenders)
 * @param {Object} params - Query parameters
 * @param {string} params.market_segment - CCR, RCR, or OCR
 */
export const getGLSPriceFloor = (params = {}) =>
  apiClient.get(`/gls/price-floor?${buildQueryString(params)}`);

/**
 * Get GLS statistics summary
 */
export const getGLSStats = () =>
  apiClient.get('/gls/stats');

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
export const getUpcomingLaunchesAll = (params = {}) =>
  apiClient.get(`/upcoming-launches/all?${buildQueryString(params)}`);

// Backward compatibility alias
export const getNewLaunchesAll = getUpcomingLaunchesAll;

/**
 * Get UPCOMING launches grouped by segment
 * @param {Object} params - Query parameters
 * @param {number} params.launch_year - Filter by launch year (default 2026)
 */
export const getUpcomingLaunchesBySegment = (params = {}) =>
  apiClient.get(`/upcoming-launches/by-segment?${buildQueryString(params)}`);

/**
 * Get UPCOMING launches supply pipeline
 * @param {Object} params - Query parameters
 * @param {number} params.launch_year - Filter by launch year (default 2026)
 * @param {string} params.market_segment - CCR, RCR, or OCR
 */
export const getUpcomingLaunchesSupplyPipeline = (params = {}) =>
  apiClient.get(`/upcoming-launches/supply-pipeline?${buildQueryString(params)}`);

/**
 * Get UPCOMING launches statistics summary
 */
export const getUpcomingLaunchesStats = () =>
  apiClient.get('/upcoming-launches/stats');

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
export const getHotProjects = (params = {}) =>
  apiClient.get(`/projects/hot?${buildQueryString(params)}`);

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
export const getProjectInventory = (projectName) =>
  apiClient.get(`/projects/${encodeURIComponent(projectName)}/inventory`);

/**
 * Trigger inventory sync for new projects (fetches from URA API)
 * Requires URA_API_ACCESS_KEY to be configured on the server
 * @returns {Promise<{status: string, synced: number, pending: number, errors: Array}>}
 */
export const syncInventory = () =>
  apiClient.post('/inventory/sync');

/**
 * Manually add inventory data for a project
 * @param {Object} data - Inventory data
 * @param {string} data.project_name - The project name
 * @param {number} data.total_units - Total units in the development
 * @param {string} data.source_url - Optional URL to source (PropertyGuru/EdgeProp)
 * @param {string} data.verified_by - Optional name of who verified this data
 * @returns {Promise<{status: string, message: string, data: Object}>}
 */
export const addManualInventory = (data) =>
  apiClient.post('/inventory/manual', data);

// ===== Deal Checker API Functions =====

/**
 * Get project names for dropdown selection
 * Only returns geocoded projects
 * @returns {Promise<{projects: Array<{name, district, market_segment}>, count: number}>}
 */
export const getProjectNames = () =>
  apiClient.get('/projects/names');

/**
 * Get nearby transactions for deal comparison
 * @param {Object} params - Query parameters
 * @param {string} params.project_name - Selected project name (required)
 * @param {number} params.bedroom - Bedroom count 1-5 (required)
 * @param {number} params.price - Buyer's price paid (required)
 * @param {number} params.sqft - Unit size in sqft (optional)
 * @param {number} params.radius_km - Search radius, default 1.0 (optional)
 * @returns {Promise<{
 *   project: {name, district, latitude, longitude},
 *   filters: {bedroom, radius_km, buyer_price},
 *   histogram: {bins: Array, total_count: number},
 *   percentile: {rank, transactions_below, transactions_above, interpretation},
 *   nearby_projects: Array<{project_name, latitude, longitude, distance_km, transaction_count}>
 * }>}
 */
export const getDealCheckerNearbyTransactions = (params = {}) =>
  apiClient.get(`/deal-checker/nearby-transactions?${buildQueryString(params)}`);

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

export const register = (email, password) => {
  return apiClient.post('/auth/register', { email, password });
};

export const login = (email, password) => {
  return apiClient.post('/auth/login', { email, password });
};

export const getCurrentUser = () => {
  return apiClient.get('/auth/me');
};

export default apiClient;

