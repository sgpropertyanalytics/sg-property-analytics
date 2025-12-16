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

// ===== Analytics API Functions =====

export const getHealth = () => apiClient.get('/health');

export const getResaleStats = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.segment) queryParams.append('segment', params.segment);
  if (params.start_date) queryParams.append('start_date', params.start_date);
  if (params.end_date) queryParams.append('end_date', params.end_date);
  return apiClient.get(`/resale_stats?${queryParams}`);
};

export const getPriceTrends = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.segment) queryParams.append('segment', params.segment);
  return apiClient.get(`/price_trends?${queryParams}`);
};

export const getTotalVolume = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.segment) queryParams.append('segment', params.segment);
  return apiClient.get(`/total_volume?${queryParams}`);
};

export const getAvgPsf = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.segment) queryParams.append('segment', params.segment);
  return apiClient.get(`/avg_psf?${queryParams}`);
};

export const getTransactions = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.bedroom) queryParams.append('bedroom', params.bedroom);
  if (params.segment) queryParams.append('segment', params.segment);
  if (params.limit) queryParams.append('limit', params.limit);
  if (params.start_date) queryParams.append('start_date', params.start_date);
  if (params.end_date) queryParams.append('end_date', params.end_date);
  return apiClient.get(`/transactions?${queryParams}`);
};

export const getDistricts = () => apiClient.get('/districts');

export const getSaleTypeTrends = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.segment) queryParams.append('segment', params.segment);
  return apiClient.get(`/sale_type_trends?${queryParams}`);
};

export const getPriceTrendsBySaleType = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.segment) queryParams.append('segment', params.segment);
  return apiClient.get(`/price_trends_by_sale_type?${queryParams}`);
};

export const getPriceTrendsByRegion = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  return apiClient.get(`/price_trends_by_region?${queryParams}`);
};

export const getPsfTrendsByRegion = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  return apiClient.get(`/psf_trends_by_region?${queryParams}`);
};

export const getMarketStats = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.segment) queryParams.append('segment', params.segment);
  return apiClient.get(`/market_stats?${queryParams}`);
};

export const getMarketStatsByDistrict = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.bedroom) queryParams.append('bedroom', params.bedroom);
  if (params.segment) queryParams.append('segment', params.segment);
  if (params.short_months) queryParams.append('short_months', params.short_months);
  if (params.long_months) queryParams.append('long_months', params.long_months);
  return apiClient.get(`/market_stats_by_district?${queryParams}`);
};

export const getProjectsByDistrict = (district, params = {}) => {
  const queryParams = new URLSearchParams();
  queryParams.append('district', district);
  if (params.bedroom) queryParams.append('bedroom', params.bedroom);
  return apiClient.get(`/projects_by_district?${queryParams}`);
};

export const getComparableValueAnalysis = (params = {}) => {
  const queryParams = new URLSearchParams();
  if (params.target_price) queryParams.append('target_price', params.target_price);
  if (params.band) queryParams.append('band', params.band);
  if (params.bedroom) queryParams.append('bedroom', params.bedroom);
  if (params.districts) queryParams.append('districts', params.districts);
  if (params.min_lease) queryParams.append('min_lease', params.min_lease);
  if (params.sale_type) queryParams.append('sale_type', params.sale_type);
  return apiClient.get(`/comparable_value_analysis?${queryParams}`);
};

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

