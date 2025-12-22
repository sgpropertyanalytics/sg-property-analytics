import React, { useState, useCallback, useEffect, useRef } from 'react';
import { getTransactionsList, getFilterOptions } from '../api/client';
import { DISTRICT_NAMES, isDistrictInRegion } from '../constants';
import { PriceDistributionHeroChart } from './PriceDistributionHeroChart';

/**
 * ValueParityPanel - Budget-based property search tool
 *
 * Features:
 * - Budget slider (required)
 * - Optional filters: Bedroom, Region, District, Tenure, Sale Type, Lease Age
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

  // Chart data state - holds all transactions for histogram
  // We fetch up to 2000 transactions for the chart to ensure good distribution
  const [chartTransactions, setChartTransactions] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const chartFetchAbortRef = useRef(null);

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
  const fetchTransactions = useCallback(async (page = 1) => {
    if (!budget || budget <= 0) {
      setError('Please select a valid budget');
      return;
    }

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      // +/- $100k range around the target budget
      const priceRangeBuffer = 100000;
      const params = {
        page,
        limit: pagination.limit,
        sort_by: sortConfig.column,
        sort_order: sortConfig.order,
        price_min: Math.max(0, budget - priceRangeBuffer),
        price_max: budget + priceRangeBuffer,
      };

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
      if (saleType) {
        params.sale_type = saleType;
      }
      if (leaseAge) {
        params.lease_age = leaseAge;
      }

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
  }, [budget, bedroom, region, district, tenure, saleType, leaseAge, pagination.limit, sortConfig]);

  // Fetch all transactions for chart histogram (separate from paginated table)
  // This fetches up to 2000 transactions to ensure a representative distribution
  const fetchChartData = useCallback(async () => {
    if (!budget || budget <= 0) return;

    // Cancel any pending chart fetch
    if (chartFetchAbortRef.current) {
      chartFetchAbortRef.current.abort();
    }
    chartFetchAbortRef.current = new AbortController();

    setChartLoading(true);

    try {
      const priceRangeBuffer = 100000;
      const params = {
        page: 1,
        limit: 2000, // Fetch up to 2000 transactions for histogram
        sort_by: 'price',
        sort_order: 'asc',
        price_min: Math.max(0, budget - priceRangeBuffer),
        price_max: budget + priceRangeBuffer,
      };

      // Add optional filters (same as table)
      if (bedroom) params.bedroom = bedroom;
      if (region) params.segment = region;
      if (district) params.district = district;
      if (tenure) params.tenure = tenure;
      if (saleType) params.sale_type = saleType;
      if (leaseAge) params.lease_age = leaseAge;

      const response = await getTransactionsList(params);
      setChartTransactions(response.data.transactions || []);
    } catch (err) {
      // Ignore abort errors
      if (err.name !== 'AbortError') {
        console.error('Error fetching chart data:', err);
      }
    } finally {
      setChartLoading(false);
    }
  }, [budget, bedroom, region, district, tenure, saleType, leaseAge]);

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchTransactions(1);
    fetchChartData(); // Also fetch data for the histogram chart
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
    if (hasSearched && budget) {
      fetchTransactions(1);
    }
  }, [sortConfig]);

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.totalPages) {
      fetchTransactions(newPage);
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
    { key: 'tenure', label: 'Tenure', sortable: true, width: 'w-24' },
    { key: 'remaining_lease', label: 'Lease', sortable: true, width: 'w-20' },
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

            {/* RIGHT: Optional Filters - grey zone extends to card edges */}
            <div className="min-w-0 mt-6 lg:mt-0 lg:border-l lg:border-[#94B4C1]/30 bg-[#547792]/[0.03] flex items-center">
              <div className="px-4 md:px-5 py-4 md:py-5 w-full">
                <p className="text-[10px] uppercase tracking-wide text-[#547792]/60 mb-2 font-medium">Optional filters</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {/* Bedroom */}
                  <div>
                    <label className="block text-[10px] font-medium text-[#547792] mb-0.5">Bedroom</label>
                    <select
                      value={bedroom}
                      onChange={(e) => setBedroom(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
                    >
                      <option value="">All</option>
                      <option value="1">1B</option>
                      <option value="2">2B</option>
                      <option value="3">3B</option>
                      <option value="4">4B+</option>
                    </select>
                  </div>

                  {/* Region */}
                  <div>
                    <label className="block text-[10px] font-medium text-[#547792] mb-0.5">Region</label>
                    <select
                      value={region}
                      onChange={(e) => {
                        setRegion(e.target.value);
                        setDistrict('');
                      }}
                      className="w-full px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
                    >
                      <option value="">All</option>
                      <option value="CCR">CCR</option>
                      <option value="RCR">RCR</option>
                      <option value="OCR">OCR</option>
                    </select>
                  </div>

                  {/* District */}
                  <div>
                    <label className="block text-[10px] font-medium text-[#547792] mb-0.5">District</label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
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
                    <label className="block text-[10px] font-medium text-[#547792] mb-0.5">Tenure</label>
                    <select
                      value={tenure}
                      onChange={(e) => setTenure(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
                    >
                      <option value="">All</option>
                      <option value="Freehold">Freehold</option>
                      <option value="99-year">99-year</option>
                      <option value="999-year">999-year</option>
                    </select>
                  </div>

                  {/* Sale Type */}
                  <div>
                    <label className="block text-[10px] font-medium text-[#547792] mb-0.5">Sale Type</label>
                    <select
                      value={saleType}
                      onChange={(e) => setSaleType(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
                    >
                      <option value="">All</option>
                      <option value="New Sale">New Sale</option>
                      <option value="Resale">Resale</option>
                    </select>
                  </div>

                  {/* Lease Age */}
                  <div>
                    <label className="block text-[10px] font-medium text-[#547792] mb-0.5">Lease Age</label>
                    <select
                      value={leaseAge}
                      onChange={(e) => setLeaseAge(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-white"
                    >
                      <option value="">All</option>
                      <option value="0-5">0-5 years</option>
                      <option value="5-10">5-10 years</option>
                      <option value="10-20">10-20 years</option>
                      <option value="20+">20+ years</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Results Table */}
      {hasSearched && (
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-[#213448]">Benchmark realized transaction prices across your target budget</h3>
              <p className="text-xs text-[#547792]">
                {loading ? 'Loading...' : (
                  <>
                    <span className="font-semibold text-[#213448]">{pagination.totalRecords.toLocaleString()}</span>
                    {' '}transactions within +/- $100K of {formatBudgetDisplay(budget)}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={pagination.limit}
                onChange={(e) => {
                  setPagination(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }));
                  if (hasSearched) {
                    setTimeout(() => fetchTransactions(1), 0);
                  }
                }}
                className="text-xs border border-[#94B4C1] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#547792] text-[#213448]"
              >
                <option value={10}>10 rows</option>
                <option value={25}>25 rows</option>
                <option value={50}>50 rows</option>
                <option value={100}>100 rows</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-auto" style={{ maxHeight: 500 }}>
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
                        <td className="px-3 py-2 border-b border-slate-100 font-medium text-slate-800 truncate max-w-[200px]" title={txn.project_name}>
                          {txn.project_name || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600">
                          {txn.district || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-center">
                          {txn.bedroom_count || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {txn.area_sqft?.toLocaleString() || '-'}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-800 font-medium text-right">
                          {formatCurrency(txn.price)}
                        </td>
                        <td className="px-3 py-2 border-b border-slate-100 text-slate-600 text-right">
                          {formatCurrency(txn.psf)}
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
                          {txn.tenure || '-'}
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

          {/* Pagination Footer */}
          {data.length > 0 && (
            <div className="px-4 py-3 border-t border-[#94B4C1]/30 bg-[#EAE0CF]/30 flex items-center justify-between">
              <div className="text-xs text-[#547792]">
                {!loading && data.length > 0 && (
                  <>
                    Showing {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.totalRecords)} of {pagination.totalRecords.toLocaleString()}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(1); }}
                  disabled={pagination.page === 1 || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="First page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(pagination.page - 1); }}
                  disabled={pagination.page === 1 || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <span className="px-3 py-1 text-sm text-[#213448]">
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(pagination.page + 1); }}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); handlePageChange(pagination.totalPages); }}
                  disabled={pagination.page >= pagination.totalPages || loading}
                  className="p-1.5 rounded border border-[#94B4C1] text-[#547792] hover:bg-[#94B4C1]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Last page"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price Distribution Hero Chart - shows where buyer's price falls in the distribution */}
      {hasSearched && (
        <PriceDistributionHeroChart
          buyerPrice={budget}
          transactions={chartTransactions}
          loading={chartLoading}
          height={280}
        />
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
    </div>
  );
}

export default ValueParityPanel;
