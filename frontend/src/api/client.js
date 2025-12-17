/**
 * API Client - Axios instance with JWT token interceptor
 * 
 * Uses Vite environment variable VITE_API_URL for base URL.
 * Falls back to production URL in production, localhost for development.
 * 
 * For production: Set VITE_API_URL=https://sg-property-analyzer.onrender.com/api
 * For local development: Leave unset or set to http://localhost:5000/api
 */
import axios from 'axios';

// Determine API base URL
// Priority: 1. VITE_API_URL env var, 2. Production URL if in production, 3. Localhost for dev
const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Check if we're in production (Vercel)
  if (import.meta.env.PROD || window.location.hostname !== 'localhost') {
    return 'https://sg-property-analyzer.onrender.com/api';
  }
  
  // Default to localhost for development
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
 * Flexible aggregation endpoint for dynamic filtering
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
 */
export const getAggregate = (params = {}) =>
  apiClient.get(`/aggregate?${buildQueryString(params)}`);

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

