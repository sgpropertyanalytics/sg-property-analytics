import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import { getTransactionsList, getFilterOptions } from '../api/client';
import { DISTRICT_NAMES, isDistrictInRegion } from '../constants';
import DealCheckerContent from './powerbi/DealCheckerContent';
import { HotProjectsTable } from './powerbi/HotProjectsTable';
import { UpcomingLaunchesTable } from './powerbi/UpcomingLaunchesTable';
import { MobileTransactionCard } from './MobileTransactionCard';
import { ResultsSummaryBar } from './ResultsSummaryBar';

/**
 * ValueParityPanel - Budget-based property search tool with Deal Checker
 *
 * Two tabs:
 * 1. Budget Search - Find transactions within your budget
 * 2. Deal Checker - Compare your purchase to nearby transactions
 *
 * Features:
 * - Budget slider (required)
 * - Optional filters: Bedroom, Region, District, Tenure, Sale Type, Property Age
 * - Shows transactions where price <= budget
 * - Reuses same table structure as TransactionDataTable
 */
// Budget slider constants
const BUDGET_MIN = 500000;    // $0.5M
const BUDGET_MAX = 5000000;   // $5M
const BUDGET_STEP = 25000;    // $25K intervals

// Active trading range for gradient visualization
const ACTIVE_RANGE_MIN = 1500000;  // $1.5M
const ACTIVE_RANGE_MAX = 3500000;  // $3.5M

export function ValueParityPanel() {
  // Tab state
  const [activeTab, setActiveTab] = useState('budget'); // 'budget' | 'deal-checker'

  // Form state - budget as number for slider
  const [budget, setBudget] = useState(1500000); // Default $1.5M
  const [bedroom, setBedroom] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [tenure, setTenure] = useState('');
  const [saleType, setSaleType] = useState('');
  const [leaseAge, setLeaseAge] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Filter options from API
  const [filterOptions, setFilterOptions] = useState({
    districts: [],
    loading: true,
  });

  // Table state
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    totalRecords: 0,
    totalPages: 0,
  });
  const [sortConfig, setSortConfig] = useState({
    column: 'price',
    order: 'desc',
  });

  // Refs for scrolling to sections
  const resultsRef = useRef(null);
  const newLaunchesRef = useRef(null);
  const resaleRef = useRef(null);
  const resaleMarketRef = useRef(null);

  // Hot projects count (for section header badge)
  const [hotProjectsCount, setHotProjectsCount] = useState(0);

  // Step 4: Resale Market state (all resale transactions)
  const [resaleMarketData, setResaleMarketData] = useState([]);
  const [resaleMarketLoading, setResaleMarketLoading] = useState(false);
  const [resaleMarketPagination, setResaleMarketPagination] = useState({
    page: 1,
    limit: 10,
    totalRecords: 0,
    totalPages: 0,
  });

  // Mobile filter panel toggle
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Count active filters for badge
  const activeFilterCount = [bedroom, region, district, tenure, saleType, leaseAge].filter(Boolean).length;

  // Load filter options on mount
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await getFilterOptions();
        setFilterOptions({
          districts: response.data.districts || [],
          loading: false,
        });
      } catch (err) {
        console.error('Error loading filter options:', err);
        setFilterOptions(prev => ({ ...prev, loading: false }));
      }
    };
    loadFilterOptions();
  }, []);

  // Fetch transactions based on budget and filters
  const fetchTransactions = useCallback(async (page = 1, priceRange = null) => {
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const params = {
        page,
        limit: pagination.limit,
        sort_by: sortConfig.column,
        sort_order: sortConfig.order,
      };

      // Apply price range filter:
      // - If histogram bin is selected, use that range
      // - Otherwise, use budget ± $100K as the default filter
      if (priceRange) {
        params.price_min = priceRange.start;
        params.price_max = priceRange.end;
      } else if (budget) {
        params.price_min = budget - 100000;
        params.price_max = budget + 100000;
      }

      // Add optional filters
      if (bedroom) {
        params.bedroom = bedroom;
      }
      if (region) {
        params.segment = region;
      }
      if (district) {
        params.district = district;
      }
      if (tenure) {
        params.tenure = tenure;
      }
      // Step 3: Young Resale section always shows 4-9 years resale properties
      // Hardcode sale_type and lease_age regardless of user selection
      params.sale_type = 'Resale';
      params.lease_age = '4-9';

      const response = await getTransactionsList(params);
      setData(response.data.transactions || []);
      setPagination(prev => ({
        ...prev,
        page,
        totalRecords: response.data.pagination?.total_records || 0,
        totalPages: response.data.pagination?.total_pages || 0,
      }));
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [budget, bedroom, region, district, tenure, pagination.limit, sortConfig]);

  // Fetch resale market transactions (Step 4 - all resale, no age filter)
  const fetchResaleMarket = useCallback(async (page = 1) => {
    setResaleMarketLoading(true);

    try {
      const params = {
        page,
        limit: resaleMarketPagination.limit,
        sort_by: 'transaction_date',
        sort_order: 'desc',
        sale_type: 'Resale', // Only resale transactions
      };

      // Apply budget filter
      if (budget) {
        params.price_min = budget - 100000;
        params.price_max = budget + 100000;
      }

      // Add optional filters (same as main search, but NO lease_age filter)
      if (bedroom) params.bedroom = bedroom;
      if (region) params.segment = region;
      if (district) params.district = district;
      if (tenure) params.tenure = tenure;
      // Note: No leaseAge filter for resale market - shows ALL ages

      const response = await getTransactionsList(params);
      setResaleMarketData(response.data.transactions || []);
      setResaleMarketPagination(prev => ({
        ...prev,
        page,
        totalRecords: response.data.pagination?.total_records || 0,
        totalPages: response.data.pagination?.total_pages || 0,
      }));
    } catch (err) {
      console.error('Error fetching resale market:', err);
    } finally {
      setResaleMarketLoading(false);
    }
  }, [budget, bedroom, region, district, tenure, resaleMarketPagination.limit]);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    setResaleMarketPagination(prev => ({ ...prev, page: 1 }));
    fetchTransactions(1, null);
    fetchResaleMarket(1); // Also fetch resale market data

    // Scroll to results after a brief delay to allow DOM to update
    setTimeout(() => {
      newLaunchesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Handle resale market page change
  const handleResaleMarketPageChange = (newPage) => {
    if (newPage >= 1 && newPage <= resaleMarketPagination.totalPages) {
      fetchResaleMarket(newPage);
    }
  };

  // Handle sort
  const handleSort = (column) => {
    setSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Re-fetch when sort changes (if we have searched)
  useEffect(() => {
    if (hasSearched) {
      fetchTransactions(1, selectedPriceRange);
    }
    // Note: We intentionally only trigger on sortConfig changes, not on
    // fetchTransactions/selectedPriceRange changes (which would cause loops)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortConfig]);

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchTransactions(newPage, selectedPriceRange);
    }
  };

  // Format budget for display
  const formatBudgetDisplay = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Calculate slider percentage for visual position
  const sliderPercent = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;

  // Format date - show only month and year
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-SG', {
      year: 'numeric',
      month: 'short',
    });
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined) return '-';
    return `$${value.toLocaleString()}`;
  };

  // Format remaining lease
  const formatRemainingLease = (years) => {
    if (years === null || years === undefined) return '-';
    if (years >= 999) return 'Freehold';
    return `${years} yrs`;
  };

  // Sort indicator
  const SortIcon = ({ column }) => {
    if (sortConfig.column !== column) {
      return (
        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortConfig.order === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Column definitions
  const columns = [
    { key: 'transaction_date', label: 'Month', sortable: true, width: 'w-20' },
    { key: 'project_name', label: 'Project', sortable: true, width: 'w-48' },
    { key: 'district', label: 'District', sortable: true, width: 'w-16' },
    { key: 'bedroom_count', label: 'BR', sortable: true, width: 'w-12' },
    { key: 'area_sqft', label: 'Area (sqft)', sortable: true, width: 'w-24', align: 'right' },
    { key: 'price', label: 'Price', sortable: true, width: 'w-28', align: 'right' },
    { key: 'psf', label: 'PSF', sortable: true, width: 'w-20', align: 'right' },
    { key: 'sale_type', label: 'Type', sortable: true, width: 'w-20' },
    { key: 'remaining_lease', label: 'Remaining Lease', sortable: true, width: 'w-24' },
  ];

  // Filter districts by selected region - use centralized constants (SINGLE SOURCE OF TRUTH)
  const filteredDistricts = filterOptions.districts.filter(d => {
    if (!region) return true;
    return isDistrictInRegion(d, region);
  });

  // Tick marks at $500k intervals
  const tickMarks = [
    { value: 500000, label: '$0.5M', percent: 0 },
    { value: 1000000, label: '$1M', percent: ((1000000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 1500000, label: '$1.5M', percent: ((1500000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 2000000, label: '$2M', percent: ((2000000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 2500000, label: '$2.5M', percent: ((2500000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 3000000, label: '$3M', percent: ((3000000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 3500000, label: '$3.5M', percent: ((3500000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 4000000, label: '$4M', percent: ((4000000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 4500000, label: '$4.5M', percent: ((4500000 - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100 },
    { value: 5000000, label: '$5M', percent: 100 },
  ];

  // Calculate gradient for slider showing active trading range
  // $1.5M-$3.5M is most active (darker), fades towards both ends
  const activeStartPercent = ((ACTIVE_RANGE_MIN - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const activeEndPercent = ((ACTIVE_RANGE_MAX - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
  const sliderGradient = `linear-gradient(to right,
    #94B4C1 0%,
    #94B4C1 ${activeStartPercent * 0.5}%,
    #547792 ${activeStartPercent}%,
    #213448 ${(activeStartPercent + activeEndPercent) / 2}%,
    #547792 ${activeEndPercent}%,
    #94B4C1 ${activeEndPercent + (100 - activeEndPercent) * 0.5}%,
    #94B4C1 100%)`;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Tab Navigation - Segmented Toggle */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Explore Budget Tab */}
        <button
          onClick={() => setActiveTab('budget')}
          className={`relative p-6 rounded-xl border text-left transition-all duration-200 ease-in-out flex items-start gap-4 group ${
            activeTab === 'budget'
              ? 'bg-[#213448] border-[#213448] shadow-lg'
              : 'bg-white border-[#94B4C1]/50 hover:border-[#547792] hover:bg-[#EAE0CF]/10'
          }`}
        >
          <div className={`p-3 rounded-lg ${activeTab === 'budget' ? 'bg-white/10' : 'bg-[#EAE0CF]/30'}`}>
            <svg className={`w-6 h-6 ${activeTab === 'budget' ? 'text-[#EAE0CF]' : 'text-[#547792]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className={`font-bold text-lg mb-1 ${activeTab === 'budget' ? 'text-white' : 'text-[#213448]'}`}>
              Explore Budget
            </h3>
            <p className={`text-sm ${activeTab === 'budget' ? 'text-[#94B4C1]' : 'text-[#547792]'}`}>
              I am looking to buy a property
            </p>
          </div>
        </button>

        {/* Evaluate Deal Tab */}
        <button
          onClick={() => setActiveTab('deal-checker')}
          className={`relative p-6 rounded-xl border text-left transition-all duration-200 ease-in-out flex items-start gap-4 group ${
            activeTab === 'deal-checker'
              ? 'bg-[#213448] border-[#213448] shadow-lg'
              : 'bg-white border-[#94B4C1]/50 hover:border-[#547792] hover:bg-[#EAE0CF]/10'
          }`}
        >
          <div className={`p-3 rounded-lg ${activeTab === 'deal-checker' ? 'bg-white/10' : 'bg-[#EAE0CF]/30'}`}>
            <svg className={`w-6 h-6 ${activeTab === 'deal-checker' ? 'text-[#EAE0CF]' : 'text-[#547792]'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h3 className={`font-bold text-lg mb-1 ${activeTab === 'deal-checker' ? 'text-white' : 'text-[#213448]'}`}>
              Evaluate Deal
            </h3>
            <p className={`text-sm ${activeTab === 'deal-checker' ? 'text-[#94B4C1]' : 'text-[#547792]'}`}>
              I have a specific project in mind
            </p>
          </div>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'deal-checker' ? (
        <DealCheckerContent />
      ) : (
        <>
      {/* Input Panel */}
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
        <form onSubmit={handleSearch}>
          {/* 50/50 Two-column layout: Budget+Search (left) | Optional Filters (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2">

            {/* LEFT: Budget Slider + Search */}
            <div className="min-w-0 px-4 md:px-5 py-4 md:py-5 lg:pr-6">
              <p className="text-sm text-[#547792] mb-4">Target price (S$) - Show transactions within +/- $100K of this amount</p>
              {/* Slider with floating value */}
              <div className="relative mb-4 pt-8">
                {/* Floating budget value - clamped to stay within bounds */}
                {(() => {
                  const thumbPercent = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
                  // Clamp: left-align when <15%, right-align when >85%, center otherwise
                  const isNearLeft = thumbPercent < 15;
                  const isNearRight = thumbPercent > 85;
                  return (
                    <div
                      className={`absolute top-0 pointer-events-none ${
                        isNearLeft ? 'left-0' :
                        isNearRight ? 'right-0' :
                        'transform -translate-x-1/2'
                      }`}
                      style={!isNearLeft && !isNearRight ? { left: `${thumbPercent}%` } : undefined}
                    >
                      <span className="text-2xl font-semibold text-[#213448]">
                        {formatBudgetDisplay(budget)}
                      </span>
                    </div>
                  );
                })()}

                {/* Slider input - gradient shows active trading range ($1.5M-$3.5M darker) */}
                <input
                  type="range"
                  min={BUDGET_MIN}
                  max={BUDGET_MAX}
                  step={BUDGET_STEP}
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value))}
                  className="w-full h-2 rounded-lg appearance-none cursor-pointer slider-thumb mt-4"
                  style={{ background: sliderGradient }}
                />
                {/* Tick marks */}
                <div className="relative w-full h-5 mt-1">
                  {tickMarks.map((tick, index) => {
                    const isFirst = index === 0;
                    const isLast = index === tickMarks.length - 1;
                    return (
                      <span
                        key={tick.value}
                        className={`absolute text-xs text-[#547792] ${
                          isFirst ? 'left-0 text-left' :
                          isLast ? 'right-0 text-right' :
                          'transform -translate-x-1/2'
                        }`}
                        style={!isFirst && !isLast ? { left: `${tick.percent}%` } : undefined}
                      >
                        {tick.label}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Search Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 bg-[#213448] text-white text-sm font-medium rounded-md hover:bg-[#547792] focus:outline-none focus:ring-2 focus:ring-[#547792] focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Searching...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Search
                  </span>
                )}
              </button>
            </div>

            {/* RIGHT: Optional Filters - collapsible on mobile */}
            <div className="min-w-0 mt-6 lg:mt-0 lg:border-l lg:border-[#94B4C1]/30 bg-[#547792]/[0.03]">
              {/* Mobile: Collapsible toggle button */}
              <button
                type="button"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
                className="lg:hidden w-full flex items-center justify-between min-h-[48px] px-4 py-3 active:bg-[#EAE0CF]/50"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="text-sm font-medium text-[#213448]">Filters</span>
                </span>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <span className="px-2 py-0.5 bg-[#547792]/20 text-[#213448] text-xs rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                  <svg
                    className={`w-4 h-4 text-[#547792] transition-transform duration-200 ${filtersExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Desktop: Always visible / Mobile: Collapsible */}
              <div className={`${filtersExpanded ? 'block' : 'hidden'} lg:block px-4 md:px-5 py-4 md:py-5 w-full`}>
                <p className="hidden lg:block text-[10px] uppercase tracking-wide text-[#547792]/60 mb-3 font-medium">Optional filters</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Bedroom */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">Bedroom</label>
                    <select
                      value={bedroom}
                      onChange={(e) => setBedroom(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                    >
                      <option value="">All</option>
                      <option value="1">1BR</option>
                      <option value="2">2BR</option>
                      <option value="3">3BR</option>
                      <option value="4">4BR</option>
                      <option value="5">5BR+</option>
                    </select>
                  </div>

                  {/* Market Segment */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">Segment</label>
                    <select
                      value={region}
                      onChange={(e) => {
                        setRegion(e.target.value);
                        setDistrict('');
                      }}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                    >
                      <option value="">All</option>
                      <option value="CCR">CCR</option>
                      <option value="RCR">RCR</option>
                      <option value="OCR">OCR</option>
                    </select>
                  </div>

                  {/* District */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">District</label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                      disabled={filterOptions.loading}
                    >
                      <option value="">All</option>
                      {filteredDistricts.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Tenure */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">Tenure</label>
                    <select
                      value={tenure}
                      onChange={(e) => setTenure(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                    >
                      <option value="">All</option>
                      <option value="Freehold">Freehold</option>
                      <option value="99-year">99-year</option>
                      <option value="999-year">999-year</option>
                    </select>
                  </div>

                  {/* Sale Type */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">Sale Type</label>
                    <select
                      value={saleType}
                      onChange={(e) => setSaleType(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                    >
                      <option value="">All</option>
                      <option value="New Sale">New Sale</option>
                      <option value="Resale">Resale</option>
                    </select>
                  </div>

                  {/* Property Age */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">Property Age</label>
                    <select
                      value={leaseAge}
                      onChange={(e) => setLeaseAge(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                    >
                      <option value="">All</option>
                      <option value="0-5">New / Recently TOP (≤5 yrs)</option>
                      <option value="5-10">Young Resale (6-10 yrs)</option>
                      <option value="10-20">Mature (11-20 yrs)</option>
                      <option value="20+">Old (&gt;20 yrs)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Results Summary Bar - shows immediately with loading state */}
      {hasSearched && (
        <ResultsSummaryBar
          budget={budget}
          loading={loading || resaleMarketLoading}
          hotProjectsCount={hotProjectsCount}
          youngResaleCount={pagination.totalRecords}
          resaleMarketCount={resaleMarketPagination.totalRecords}
          onJumpToNewLaunches={() => newLaunchesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onJumpToYoungResale={() => resaleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          onJumpToResaleMarket={() => resaleMarketRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
      )}

      {/* ===== STEP 2A: UPCOMING NEW LAUNCHES (Not Yet Launched) ===== */}
      {hasSearched && (
        <div ref={newLaunchesRef} className="space-y-4">
          {/* Section Divider: Upcoming New Launches */}
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-3">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#94B4C1]/50" />
              <div className="flex items-center gap-2 px-5 py-2 bg-[#EAE0CF]/40 border border-[#94B4C1]/30 rounded-full">
                <span className="text-sm font-semibold text-[#213448] tracking-wide">Upcoming New Launches</span>
                <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#94B4C1]/50" />
            </div>
          </div>

          {/* Upcoming Launches Table with internal header */}
          <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center gap-3">
              <span className="text-xl">🏗️</span>
              <div>
                <h3 className="font-semibold text-[#213448]">Upcoming New Launches</h3>
                <p className="text-xs text-[#547792]">Projects expected to launch soon - not yet available for sale</p>
              </div>
            </div>
            <UpcomingLaunchesTable height={300} />
          </div>
        </div>
      )}

      {/* ===== STEP 2B: REMAINING NEW LAUNCHES (Already Launched, Unsold Inventory) ===== */}
      {hasSearched && (
        <div className="space-y-4">
          {/* Section Divider: Remaining New Launches */}
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-3">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#94B4C1]/50" />
              <div className="flex items-center gap-2 px-5 py-2 bg-[#EAE0CF]/40 border border-[#94B4C1]/30 rounded-full">
                <span className="text-sm font-semibold text-[#213448] tracking-wide">Remaining New Launches</span>
                <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#94B4C1]/50" />
            </div>
          </div>

          {/* Hot Projects Table with internal header */}
          <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center gap-3">
              <span className="text-xl">🏢</span>
              <div>
                <h3 className="font-semibold text-[#213448]">Remaining New Launches</h3>
                <p className="text-xs text-[#547792]">Already launched projects with unsold units within your budget</p>
              </div>
            </div>
            <HotProjectsTable
              height={300}
              showHeader={false}
              compact={true}
              filters={{
                priceMin: budget - 100000,
                priceMax: budget + 100000,
                bedroom: bedroom || null,
                region: region || null,
                district: district || null,
              }}
              onDataLoad={setHotProjectsCount}
            />
          </div>
        </div>
      )}

      {/* ===== STEP 3: YOUNG RESALE (4-9 YEARS) ===== */}
      {hasSearched && (
        <>
          {/* Flow Arrow: New Launches → Young Resale */}
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-3">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#94B4C1]/50" />
              <div className="flex items-center gap-2 px-5 py-2 bg-[#EAE0CF]/40 border border-[#94B4C1]/30 rounded-full">
                <span className="text-sm font-semibold text-[#213448] tracking-wide">Recently TOP Units / Young Resale</span>
                <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#94B4C1]/50" />
            </div>
          </div>

          {/* Results Table */}
          <div ref={resaleRef} className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden animate-fade-in">
            {/* Section Header: Young Resale */}
            <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center gap-3">
              <span className="text-xl">🏠</span>
              <div>
                <h3 className="font-semibold text-[#213448]">Young Resale (4-9 Years)</h3>
                <p className="text-xs text-[#547792]">
                  Recently TOP resale units ideal for immediate move-in
                  {!loading && pagination.totalRecords > 0 && (
                    <span className="ml-1">• <span className="font-semibold text-[#213448]">{pagination.totalRecords.toLocaleString()}</span> found</span>
                  )}
                </p>
              </div>
            </div>

          {/* Mobile Card View (visible on small screens) */}
          <div className="md:hidden overflow-auto p-3 space-y-2" style={{ maxHeight: 400 }}>
            {error ? (
              <div className="flex items-center justify-center h-40 text-red-500">
                Error: {error}
              </div>
            ) : loading ? (
              [...Array(5)].map((_, i) => (
                <div key={i} className="p-3 bg-white rounded-lg border border-[#94B4C1]/30 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
              ))
            ) : data.length === 0 ? (
              <div className="text-center py-8 text-[#547792] text-sm">
                No transactions found. Try adjusting your filters.
              </div>
            ) : (
              data.map((txn, idx) => (
                <MobileTransactionCard
                  key={txn.id || idx}
                  transaction={txn}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  formatRemainingLease={formatRemainingLease}
                />
              ))
            )}
          </div>

          {/* Desktop Table View (hidden on small screens) */}
          <div className="hidden md:block overflow-auto" style={{ maxHeight: 400 }}>
            {error ? (
              <div className="flex items-center justify-center h-40 text-red-500">
                Error: {error}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    {columns.map(col => (
                      <th
                        key={col.key}
                        className={`px-3 py-2 text-left font-medium text-slate-600 border-b border-slate-200 ${col.width} ${
                          col.sortable ? 'cursor-pointer hover:bg-slate-100 select-none' : ''
                        } ${col.align === 'right' ? 'text-right' : ''}`}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : ''}`}>
                          <span>{col.label}</span>
                          {col.sortable && <SortIcon column={col.key} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [...Array(pagination.limit)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        {columns.map(col => (
                          <td key={col.key} className="px-3 py-2 border-b border-slate-100">
                            <div className="h-4 bg-slate-200 rounded w-full"></div>
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : data.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                        No transactions found within +/- $100K of your budget. Try adjusting your target price or filters.
                      </td>
                    </tr>
                  ) : (
                    data.map((txn, idx) => (
                      <tr
                        key={txn.id || idx}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {formatDate(txn.transaction_date)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[200px]" title={txn.project_name || txn.project_name_masked}>
                          {txn.project_name || txn.project_name_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {txn.district || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-center">
                          {txn.bedroom_count || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {txn.area_sqft?.toLocaleString() || txn.area_sqft_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                          {txn.price ? formatCurrency(txn.price) : txn.price_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {txn.psf ? formatCurrency(txn.psf) : txn.psf_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100">
                          <span className={`px-1.5 py-0.5 text-xs rounded ${
                            txn.sale_type === 'New Sale'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {txn.sale_type === 'New Sale' ? 'New' : 'Resale'}
                          </span>
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {formatRemainingLease(txn.remaining_lease)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>

          {/* ===== STEP 4: RESALE MARKET ===== */}
          {/* Flow Arrow: Young Resale → Resale Market */}
          <div className="flex items-center justify-center py-3">
            <div className="flex items-center gap-3">
              <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#94B4C1]/50" />
              <div className="flex items-center gap-2 px-5 py-2 bg-[#EAE0CF]/40 border border-[#94B4C1]/30 rounded-full">
                <span className="text-sm font-semibold text-[#213448] tracking-wide">Resale Market</span>
                <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#94B4C1]/50" />
            </div>
          </div>

          {/* Resale Market Section */}
          <div ref={resaleMarketRef} className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center gap-3">
              <span className="text-xl">🏘️</span>
              <div>
                <h3 className="font-semibold text-[#213448]">Resale Market</h3>
                <p className="text-xs text-[#547792]">
                  All resale transactions regardless of property age
                  {!resaleMarketLoading && resaleMarketPagination.totalRecords > 0 && (
                    <span className="ml-1">• <span className="font-semibold text-[#213448]">{resaleMarketPagination.totalRecords.toLocaleString()}</span> found</span>
                  )}
                </p>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden overflow-auto p-3 space-y-2" style={{ maxHeight: 400 }}>
              {resaleMarketLoading ? (
                [...Array(3)].map((_, i) => (
                  <div key={i} className="p-3 bg-white rounded-lg border border-[#94B4C1]/30 animate-pulse">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                  </div>
                ))
              ) : resaleMarketData.length === 0 ? (
                <div className="text-center py-6 text-[#547792] text-sm">
                  No resale transactions found.
                </div>
              ) : (
                resaleMarketData.map((txn, idx) => (
                  <MobileTransactionCard
                    key={txn.id || idx}
                    transaction={txn}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    formatRemainingLease={formatRemainingLease}
                  />
                ))
              )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-auto" style={{ maxHeight: 400 }}>
              {resaleMarketLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="flex items-center gap-2 text-[#547792]">
                    <div className="w-4 h-4 border-2 border-[#547792] border-t-transparent rounded-full animate-spin" />
                    <span>Loading...</span>
                  </div>
                </div>
              ) : resaleMarketData.length === 0 ? (
                <div className="text-center py-8 text-[#547792] text-sm">
                  No resale transactions found within your budget.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 border-b">Date</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 border-b">Project</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 border-b">District</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-slate-600 border-b">BR</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 border-b">Sqft</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 border-b">Price</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 border-b">PSF</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 border-b">Remaining Lease</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resaleMarketData.map((txn, idx) => (
                      <tr key={txn.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {formatDate(txn.transaction_date)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[180px]" title={txn.project_name || txn.project_name_masked}>
                          {txn.project_name || txn.project_name_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {txn.district || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-center">
                          {txn.bedroom_count || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {txn.area_sqft?.toLocaleString() || txn.area_sqft_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                          {txn.price ? formatCurrency(txn.price) : txn.price_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {txn.psf ? formatCurrency(txn.psf) : txn.psf_masked || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {formatRemainingLease(txn.remaining_lease)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

          </div>
        </>
      )}

      {/* Initial state - before search */}
      {!hasSearched && (
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-8 text-center">
          <div className="max-w-md mx-auto">
            <svg className="w-16 h-16 mx-auto text-[#94B4C1] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="text-lg font-semibold text-[#213448] mb-2">Benchmark Transaction Prices</h3>
            <p className="text-sm text-[#547792]">
              Drag the budget slider above to set your target price ceiling and click Search to view realized transaction prices.
              Use the optional filters to narrow down by bedroom type, region, or district.
            </p>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default ValueParityPanel;
