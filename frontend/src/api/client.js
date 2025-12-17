/**
 * API Client - Axios instance with JWT token interceptor
 *
 * Uses Vite environment variable VITE_API_URL for base URL.
 * Falls back to localhost for development if not set.
 *
 * For production: Set VITE_API_URL=https://your-backend.railway.app/api
 * For local development: Leave unset or set to http://localhost:5000/api
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

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
 * Build query string from params object, only including defined values
 */
const buildQueryString = (params, allowedKeys) => {
  const queryParams = new URLSearchParams();
  allowedKeys.forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      queryParams.append(key, params[key]);
    }
  });
  return queryParams.toString();
};

// ===== Analytics API Functions =====

export const getHealth = () => apiClient.get('/health');

export const getDistricts = () => apiClient.get('/districts');

export const getPriceTrends = (params = {}) =>
  apiClient.get(`/price_trends?${buildQueryString(params, ['districts', 'segment'])}`);

export const getTotalVolume = (params = {}) =>
  apiClient.get(`/total_volume?${buildQueryString(params, ['districts', 'segment'])}`);

export const getSaleTypeTrends = (params = {}) =>
  apiClient.get(`/sale_type_trends?${buildQueryString(params, ['districts', 'segment'])}`);

export const getPriceTrendsBySaleType = (params = {}) =>
  apiClient.get(`/price_trends_by_sale_type?${buildQueryString(params, ['districts', 'segment'])}`);

export const getPriceTrendsByRegion = (params = {}) =>
  apiClient.get(`/price_trends_by_region?${buildQueryString(params, ['districts'])}`);

export const getPsfTrendsByRegion = (params = {}) =>
  apiClient.get(`/psf_trends_by_region?${buildQueryString(params, ['districts'])}`);

export const getMarketStatsByDistrict = (params = {}) =>
  apiClient.get(`/market_stats_by_district?${buildQueryString(params,
    ['districts', 'bedroom', 'segment', 'short_months', 'long_months'])}`);

export const getProjectsByDistrict = (district, params = {}) =>
  apiClient.get(`/projects_by_district?${buildQueryString(
    { district, ...params },
    ['district', 'bedroom', 'segment']
  )}`);

export const getPriceProjectsByDistrict = (district, params = {}) =>
  apiClient.get(`/price_projects_by_district?${buildQueryString(
    { district, ...params },
    ['district', 'bedroom', 'months', 'segment']
  )}`);

export const getComparableValueAnalysis = (params = {}) =>
  apiClient.get(`/comparable_value_analysis?${buildQueryString(params,
    ['target_price', 'band', 'bedroom', 'districts', 'min_lease', 'sale_type'])}`);

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
