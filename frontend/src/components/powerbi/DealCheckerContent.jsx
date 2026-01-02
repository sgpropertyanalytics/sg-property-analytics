/**
 * DealCheckerContent - Check if a buyer got a good deal
 *
 * Allows users to:
 * 1. Select their project (searchable dropdown)
 * 2. Enter bedroom type, sqft, and price paid
 * 3. Compare across three scopes: Same Project, 1km radius, 2km radius
 * 4. See map with both radius circles
 * 5. Get percentile rank showing how their deal compares
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getProjectNames, getDealCheckerMultiScope } from '../../api/client';
import { PriceDistributionHeroChart } from '../PriceDistributionHeroChart';
import DealCheckerMap from './DealCheckerMap';
import ScopeSummaryCards from './ScopeSummaryCards';
import {
  DealCheckerField,
  ProjectNamesField,
  getDealCheckerField,
  getProjectNamesField,
} from '../../schemas/apiContract';
import { getPercentile } from '../../utils/statistics';

/**
 * Inline stale request guard (previously useStaleRequestGuard hook)
 * Simple abort/stale request protection for deal checker fetches.
 */
function useStaleRequestGuard() {
  const requestIdRef = React.useRef(0);
  const abortControllerRef = React.useRef(null);

  const startRequest = React.useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  const isStale = React.useCallback((requestId) => {
    return requestId !== requestIdRef.current;
  }, []);

  const getSignal = React.useCallback(() => {
    return abortControllerRef.current?.signal;
  }, []);

  return { startRequest, isStale, getSignal };
}

// K-anonymity threshold for project-level data (min 15 for privacy)
const K_PROJECT_THRESHOLD = 15;

// Age band helpers - imported from centralized constants (SINGLE SOURCE OF TRUTH)
import { getAgeBandLabel } from '../../constants';

// Format number with commas
const formatNumber = (value) => {
  if (value === null || value === undefined) return '';
  return value.toLocaleString();
};

// Parse formatted number back to number
const parseFormattedNumber = (str) => {
  if (!str) return '';
  return str.replace(/[^0-9]/g, '');
};

// Scope labels for display
const SCOPE_LABELS = {
  same_project: 'Same Development',
  radius_1km: 'Within 1km Radius',
  radius_2km: 'Within 2km Radius'
};

// Volume gradient colors (matching Insights Map - red/hot to yellow/mild)
// Using higher opacity for better visibility
const VOLUME_COLORS = {
  hot: 'rgba(239, 68, 68, 0.25)',    // Red - Top tier (>90th percentile)
  warm: 'rgba(249, 115, 22, 0.20)',   // Orange - High tier (70-90th percentile)
  mild: 'rgba(250, 204, 21, 0.18)',   // Yellow - Medium tier (40-70th percentile)
  cool: 'rgba(148, 180, 193, 0.12)', // Sky blue - Low tier (<40th percentile)
};

// Calculate volume percentile thresholds from project data
function calculateVolumeThresholds(projects) {
  const volumes = projects
    .filter(p => p.transaction_count > 0)
    .map(p => p.transaction_count)
    .sort((a, b) => a - b);

  if (volumes.length === 0) {
    return { p40: 0, p70: 0, p90: 0 };
  }

  return {
    p40: getPercentile(volumes, 40),
    p70: getPercentile(volumes, 70),
    p90: getPercentile(volumes, 90),
  };
}

// Get volume tier color for a project
function getVolumeColor(txCount, thresholds) {
  if (!txCount || txCount === 0) return 'transparent';
  if (txCount >= thresholds.p90) return VOLUME_COLORS.hot;
  if (txCount >= thresholds.p70) return VOLUME_COLORS.warm;
  if (txCount >= thresholds.p40) return VOLUME_COLORS.mild;
  return VOLUME_COLORS.cool;
}

// Get volume tier label for a project (for K-anonymity: show label instead of prices when Obs < K)
function getVolumeLabel(txCount, thresholds) {
  if (!txCount || txCount === 0) return null;
  if (txCount >= thresholds.p90) return { label: 'High', style: 'bg-red-100 text-red-700' };
  if (txCount >= thresholds.p70) return { label: 'Med-High', style: 'bg-orange-100 text-orange-700' };
  if (txCount >= thresholds.p40) return { label: 'Medium', style: 'bg-yellow-100 text-yellow-700' };
  return { label: 'Low', style: 'bg-slate-100 text-slate-600' };
}

// Random project name generator for loading animation
const generateRandomProjectName = () => {
  const prefixes = ['The', 'One', 'Park', 'Sky', 'Marina', 'Royal', 'Grand', 'Vista', 'Parc', 'Haus'];
  const middles = ['Residences', 'View', 'Heights', 'Loft', 'Towers', 'Suites', 'Edge', 'Crest', 'Haven', 'Oasis'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(prefixes)} ${pick(middles)}`;
};

// Generate loading text with 3 random project names
const generateLoadingText = () => {
  return `Loading project ${generateRandomProjectName()}, project ${generateRandomProjectName()}, project ${generateRandomProjectName()}...`;
};

export default function DealCheckerContent() {
  // Form state
  const [projectName, setProjectName] = useState('');
  const [bedroom, setBedroom] = useState('');
  const [sqft, setSqft] = useState('');
  const [price, setPrice] = useState('');

  // Project dropdown state
  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Data state
  const [projectOptions, setProjectOptions] = useState([]);
  const [projectOptionsLoading, setProjectOptionsLoading] = useState(true);
  const [loadingText, setLoadingText] = useState(() => generateLoadingText());
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Scope selection state
  const [activeScope, setActiveScope] = useState('radius_1km');

  // Stale request protection - prevents old responses from overwriting new ones
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  // Sort config for nearby projects table
  const [projectsSortConfig, setProjectsSortConfig] = useState({
    column: 'distance_km',
    order: 'asc',
  });

  // Load project names for dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await getProjectNames();
        // Envelope already unwrapped by interceptor - use response.data directly
        const responseData = response.data || {};
        const projects = getProjectNamesField(responseData, ProjectNamesField.PROJECTS) || [];
        setProjectOptions(projects);
      } catch (err) {
        console.error('Failed to load project names:', err);
      } finally {
        setProjectOptionsLoading(false);
      }
    };
    loadProjects();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Animate loading text with random project names
  useEffect(() => {
    if (!projectOptionsLoading) return;
    const interval = setInterval(() => {
      setLoadingText(generateLoadingText());
    }, 500);
    return () => clearInterval(interval);
  }, [projectOptionsLoading]);

  // Filter projects by search term
  const filteredProjects = projectOptions.filter(p =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    p.district?.toLowerCase().includes(projectSearch.toLowerCase())
  );

  // Handle project selection
  const handleProjectSelect = (project) => {
    setProjectName(project.name);
    setProjectSearch('');
    setIsDropdownOpen(false);
  };

  // Handle form submission
  const handleCheck = async (e) => {
    e.preventDefault();

    if (!projectName || !bedroom || !price) {
      setError('Please fill in Project, Bedroom, and Price fields');
      return;
    }

    const priceNum = parseFloat(parseFormattedNumber(price));
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Please enter a valid price');
      return;
    }

    // Start new request and get ID for stale check
    const requestId = startRequest();
    const signal = getSignal();

    setLoading(true);
    setError(null);

    try {
      const params = {
        project_name: projectName,
        bedroom: bedroom,
        price: priceNum
      };

      const sqftNum = parseFloat(parseFormattedNumber(sqft));
      if (!isNaN(sqftNum) && sqftNum > 0) {
        params.sqft = sqftNum;
      }

      const response = await getDealCheckerMultiScope(params, { signal });

      // Guard: Don't update state if a newer request started
      if (isStale(requestId)) return;

      const responseData = response.data || {};
      const project = getDealCheckerField(responseData, DealCheckerField.PROJECT) || {};
      const filters = getDealCheckerField(responseData, DealCheckerField.FILTERS) || {};
      const scopes = getDealCheckerField(responseData, DealCheckerField.SCOPES) || {};
      const mapData = getDealCheckerField(responseData, DealCheckerField.MAP_DATA) || {};
      const meta = getDealCheckerField(responseData, DealCheckerField.META) || {};

      setResult({
        project,
        filters,
        scopes,
        map_data: mapData,
        meta,
      });
      // Default to 1km scope, or same_project if it has more data
      if (scopes?.same_project?.transaction_count > 10) {
        setActiveScope('same_project');
      } else {
        setActiveScope('radius_1km');
      }
    } catch (err) {
      // Ignore abort errors (intentional cancellation)
      if (err.name === 'CanceledError' || err.name === 'AbortError') {
        return;
      }
      // Guard: Check stale after error too
      if (isStale(requestId)) return;

      setError(err.response?.data?.error || 'Failed to check deal');
      setResult(null);
    } finally {
      // Only clear loading if not stale
      if (!isStale(requestId)) {
        setLoading(false);
      }
    }
  };

  // Handle price input formatting
  const handlePriceChange = (e) => {
    const raw = parseFormattedNumber(e.target.value);
    if (raw === '') {
      setPrice('');
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setPrice(formatNumber(num));
    }
  };

  // Handle sqft input formatting
  const handleSqftChange = (e) => {
    const raw = parseFormattedNumber(e.target.value);
    if (raw === '') {
      setSqft('');
      return;
    }
    const num = parseInt(raw, 10);
    if (!isNaN(num)) {
      setSqft(formatNumber(num));
    }
  };

  // Get histogram bins directly from backend (no re-binning needed)
  const getHistogramBins = () => {
    const scope = result?.scopes?.[activeScope];
    return scope?.histogram?.bins || [];
  };

  // Get all nearby projects for the table (combine 1km and 2km)
  // Only show projects with >= K_PROJECT_THRESHOLD transactions (usable price data)
  const nearbyProjects = useMemo(() => {
    if (!result?.map_data) return [];
    const projects_1km = result.map_data.projects_1km || [];
    const projects_2km = result.map_data.projects_2km || [];
    const allProjects = [...projects_1km, ...projects_2km];
    // Only include projects with enough transactions to show price data
    return allProjects.filter(p => (p.transaction_count || 0) >= K_PROJECT_THRESHOLD);
  }, [result?.map_data]);

  // Calculate volume thresholds for gradient coloring
  const volumeThresholds = useMemo(() => {
    return calculateVolumeThresholds(nearbyProjects);
  }, [nearbyProjects]);

  // Handle sort for nearby projects table
  const handleProjectsSort = (column) => {
    setProjectsSortConfig(prev => ({
      column,
      order: prev.column === column && prev.order === 'asc' ? 'desc' : 'asc',
    }));
  };

  // Sort nearby projects data
  const sortedNearbyProjects = useMemo(() => {
    return [...nearbyProjects].sort((a, b) => {
      const col = projectsSortConfig.column;
      let aVal = a[col];
      let bVal = b[col];

      // Handle null/undefined
      if (aVal === null || aVal === undefined) aVal = projectsSortConfig.order === 'asc' ? Infinity : -Infinity;
      if (bVal === null || bVal === undefined) bVal = projectsSortConfig.order === 'asc' ? Infinity : -Infinity;

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return projectsSortConfig.order === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Numeric comparison
      return projectsSortConfig.order === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [nearbyProjects, projectsSortConfig]);

  // Sort indicator component
  const SortIcon = ({ column }) => {
    if (projectsSortConfig.column !== column) {
      return (
        <svg className="w-3 h-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return projectsSortConfig.order === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  // Get selected project info for display
  const selectedProjectInfo = projectOptions.find(p => p.name === projectName);

  return (
    <div className="space-y-6">
      {/* Input Form Card - Consistent with Affordability tab */}
      {/* IMPORTANT: Do NOT add overflow-hidden here - it clips the project dropdown */}
      <div className="bg-card rounded-lg border border-[#94B4C1]/50">
        <div className="px-4 py-3 border-b border-[#94B4C1]/30">
          <h3 className="font-semibold text-[#213448]">Check Your Deal</h3>
          <p className="text-xs text-[#547792] mt-0.5">
            Enter your property details to see how your price compares
          </p>
        </div>

        <form onSubmit={handleCheck}>
          {/* Two-column layout matching Explore Budget tab */}
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* LEFT: Project Selector + Check Deal Button */}
            <div className="min-w-0 px-4 md:px-5 py-4 md:py-5 lg:pr-6" ref={dropdownRef}>
              <label className="block text-xs font-medium text-[#547792] mb-1">
                Select your Project <span className="text-red-500">*</span>
              </label>
              <div className="relative mb-4">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  disabled={projectOptionsLoading}
                  className="w-full px-3 py-2.5 text-sm border border-[#94B4C1]/50 rounded text-left bg-[#EAE0CF]/20 focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent flex items-center justify-between"
                >
                  <span className={projectName ? 'text-[#213448] truncate font-medium' : 'text-[#94B4C1]'}>
                    {projectName
                      ? `${projectName}${selectedProjectInfo?.district ? ` (${selectedProjectInfo.district})` : ''}`
                      : projectOptionsLoading
                        ? <span className="truncate">{loadingText}</span>
                        : 'Search projects...'}
                  </span>
                  <svg className={`w-4 h-4 text-[#547792] transition-transform flex-shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Panel */}
                {isDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-[#94B4C1]/50 rounded-lg shadow-lg max-h-80 overflow-hidden">
                    <div className="p-2 border-b border-[#94B4C1]/30">
                      <input
                        type="text"
                        placeholder="Type to search..."
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        className="w-full px-3 py-2 border border-[#94B4C1]/50 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#547792] text-[#213448]"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredProjects.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-[#94B4C1] text-center">No projects found</div>
                      ) : (
                        filteredProjects.slice(0, 100).map(p => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => handleProjectSelect(p)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-[#EAE0CF]/50 flex justify-between items-center ${
                              projectName === p.name ? 'bg-[#EAE0CF]/30 text-[#213448] font-medium' : 'text-[#547792]'
                            }`}
                          >
                            <span className="truncate">{p.name}</span>
                            <span className="text-xs text-[#94B4C1] ml-2 flex-shrink-0">{p.district}</span>
                          </button>
                        ))
                      )}
                      {filteredProjects.length > 100 && (
                        <div className="px-3 py-2 text-xs text-[#94B4C1] text-center border-t border-[#94B4C1]/30">
                          +{filteredProjects.length - 100} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {projectOptionsLoading && (
                  <div className="absolute right-8 top-1/2 transform -translate-y-1/2">
                    <svg className="w-4 h-4 animate-spin text-[#547792]" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Check Deal Button */}
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
                    Checking...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Check Deal
                  </span>
                )}
              </button>
            </div>

            {/* RIGHT: Optional Filters with shaded background */}
            <div className="min-w-0 mt-6 lg:mt-0 lg:border-l lg:border-[#94B4C1]/30 bg-[#547792]/[0.03]">
              <div className="px-4 md:px-5 py-4 md:py-5 w-full">
                <p className="text-[10px] uppercase tracking-wide text-[#547792]/60 mb-3 font-medium">Property Details</p>
                <div className="grid grid-cols-3 gap-3">
                  {/* Bedroom */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">
                      Bedroom <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={bedroom}
                      onChange={(e) => setBedroom(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20"
                    >
                      <option value="">All</option>
                      <option value="1">1 BR</option>
                      <option value="2">2 BR</option>
                      <option value="3">3 BR</option>
                      <option value="4">4 BR</option>
                      <option value="5">5+ BR</option>
                    </select>
                  </div>

                  {/* Unit Size */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">
                      Size (sqft)
                    </label>
                    <input
                      type="text"
                      value={sqft}
                      onChange={handleSqftChange}
                      placeholder="1,200"
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20 placeholder-[#94B4C1]"
                    />
                  </div>

                  {/* Price */}
                  <div>
                    <label className="block text-xs font-medium text-[#547792] mb-1">
                      Price ($) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={price}
                      onChange={handlePriceChange}
                      placeholder="2,500,000"
                      className="w-full px-3 py-2 text-sm border border-[#94B4C1]/50 rounded focus:outline-none focus:ring-1 focus:ring-[#547792] focus:border-transparent text-[#213448] bg-[#EAE0CF]/20 placeholder-[#94B4C1]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="mx-4 mb-4 text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>
          )}
        </form>
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Scope Summary Cards */}
          <ScopeSummaryCards
            scopes={result.scopes}
            activeScope={activeScope}
            onScopeClick={setActiveScope}
            bedroom={bedroom}
          />

          {/* Histogram with Scope Toggle */}
          <PriceDistributionHeroChart
            buyerPrice={result.filters.buyer_price}
            precomputedBins={getHistogramBins()}
            precomputedPercentile={result.scopes?.[activeScope]?.percentile}
            loading={false}
            height={280}
            activeFilters={{
              bedroom: bedroom,
              scope: SCOPE_LABELS[activeScope],
            }}
            scopeToggle={{
              activeScope,
              onScopeChange: setActiveScope,
              transactionCount: result.scopes?.[activeScope]?.transaction_count || 0,
            }}
          />

          {/* Map - Full Width (similar to District Deep Dive) */}
          <div className="bg-card rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
            <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-[#94B4C1]/30">
              <h3 className="text-base sm:text-lg font-bold text-[#213448]">Nearby Projects Map</h3>
              <p className="text-[10px] sm:text-xs text-[#547792]">
                {bedroom}BR transactions • Only projects with {K_PROJECT_THRESHOLD}+ observations shown
              </p>
            </div>
            <div className="relative h-[50vh] min-h-[400px] md:h-[55vh] md:min-h-[450px]">
              <DealCheckerMap
                centerProject={result.project}
                projects1km={(result.map_data?.projects_1km || []).filter(p => (p.transaction_count || 0) >= K_PROJECT_THRESHOLD)}
                projects2km={(result.map_data?.projects_2km || []).filter(p => (p.transaction_count || 0) >= K_PROJECT_THRESHOLD)}
              />
            </div>
          </div>

          {/* Nearby Projects Table - Full Width Below Map */}
          <div className="bg-card rounded-xl border border-[#94B4C1]/50 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#94B4C1]/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-[#213448]">Projects Within 2km</h3>
                    <p className="text-xs text-[#547792]">
                      {bedroom}BR transactions • Only projects with {K_PROJECT_THRESHOLD}+ observations shown
                    </p>
                  </div>
                  {/* Volume gradient legend */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-[#547792] uppercase tracking-wide">Volume</span>
                    <div
                      className="h-2 w-16 rounded-sm"
                      style={{
                        background: 'linear-gradient(to right, #EF4444, #F97316, #FACC15, #94B4C1)',
                      }}
                    />
                    <div className="flex gap-2 text-[8px] text-[#547792]">
                      <span>High</span>
                      <span>Low</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Mobile Card View */}
              <div className="md:hidden p-3 space-y-2 overflow-y-auto" style={{ maxHeight: 350 }}>
                {sortedNearbyProjects.length === 0 ? (
                  <div className="text-center py-6 text-slate-500">No nearby projects found</div>
                ) : (
                  sortedNearbyProjects.map((p) => {
                    const isUserProject = p.project_name === result.project.name;
                    const isWithin1km = p.distance_km <= 1.0;
                    const volumeColor = getVolumeColor(p.transaction_count, volumeThresholds);
                    const isSuppressed = (p.transaction_count || 0) < K_PROJECT_THRESHOLD;
                    const volumeLabel = getVolumeLabel(p.transaction_count, volumeThresholds);

                    return (
                      <div
                        key={p.project_name}
                        className={`p-3 rounded-lg border border-[#94B4C1]/30 ${!isWithin1km ? 'opacity-70' : ''}`}
                        style={{ backgroundColor: isUserProject ? 'rgba(33, 52, 72, 0.05)' : volumeColor }}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-[#213448] truncate">
                              {p.project_name}
                              {isUserProject && <span className="ml-1 text-xs text-[#547792]">(yours)</span>}
                            </div>
                            <div className="text-xs text-[#94B4C1]">{p.district}</div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-sm font-medium text-[#213448]">
                              {p.distance_km === 0 ? '-' : `${(p.distance_km * 1000).toFixed(0)}m`}
                            </div>
                          </div>
                        </div>
                        {/* Row 1: BR, Age, Obs */}
                        <div className="flex items-center gap-3 mt-2 text-xs text-[#547792]">
                          <span>{p.bedroom || '-'}BR</span>
                          <span>
                            Age: {getAgeBandLabel(p.median_age, { isFreehold: p.is_freehold })}
                          </span>
                          <span>{(p.transaction_count || 0).toLocaleString()} obs</span>
                        </div>
                        {/* Row 2: Sqft or Volume label */}
                        <div className="flex justify-between items-center mt-1 text-xs text-[#547792]">
                          <span>{p.median_sqft?.toLocaleString() || '-'} sqft</span>
                          {isSuppressed ? (
                            volumeLabel && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${volumeLabel.style}`}>
                                {volumeLabel.label} volume
                              </span>
                            )
                          ) : (
                            <span>{p.median_sqft?.toLocaleString() || '-'} sqft</span>
                          )}
                        </div>
                        {/* Row 2: P25 / Median / P75 - only show if Obs >= K */}
                        {!isSuppressed && (
                          <div className="flex justify-between mt-1 text-xs">
                            <span className="text-[#94B4C1]">
                              P25: ${p.p25_price ? (p.p25_price / 1000000).toFixed(2) : '-'}M
                            </span>
                            <span className="font-medium text-[#213448]">
                              ${p.median_price ? (p.median_price / 1000000).toFixed(2) : '-'}M
                            </span>
                            <span className="text-[#94B4C1]">
                              P75: ${p.p75_price ? (p.p75_price / 1000000).toFixed(2) : '-'}M
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto max-w-full" style={{ maxHeight: 350 }}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th
                        className="px-3 py-2 text-left font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('project_name')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Project</span>
                          <SortIcon column="project_name" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-right font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('distance_km')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Dist</span>
                          <SortIcon column="distance_km" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-center font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('bedroom')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>BR</span>
                          <SortIcon column="bedroom" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-center font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('median_age')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Age</span>
                          <SortIcon column="median_age" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-right font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('transaction_count')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Obs</span>
                          <SortIcon column="transaction_count" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-right font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('median_sqft')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Sqft</span>
                          <SortIcon column="median_sqft" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-right font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('p25_price')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>P25</span>
                          <SortIcon column="p25_price" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-right font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('median_price')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Median</span>
                          <SortIcon column="median_price" />
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-right font-medium text-slate-600 border-b cursor-pointer hover:bg-slate-100 select-none"
                        onClick={() => handleProjectsSort('p75_price')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>P75</span>
                          <SortIcon column="p75_price" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedNearbyProjects.map((p) => {
                      const isUserProject = p.project_name === result.project.name;
                      const isWithin1km = p.distance_km <= 1.0;
                      const volumeColor = getVolumeColor(p.transaction_count, volumeThresholds);
                      const isSuppressed = (p.transaction_count || 0) < K_PROJECT_THRESHOLD;
                      const volumeLabel = getVolumeLabel(p.transaction_count, volumeThresholds);
                      return (
                        <tr
                          key={p.project_name}
                          style={{
                            backgroundColor: isUserProject ? 'rgba(33, 52, 72, 0.05)' : volumeColor,
                          }}
                          className={`${!isUserProject ? 'hover:brightness-95' : ''} ${!isWithin1km ? 'opacity-70' : ''} transition-all`}
                        >
                          <td className="px-3 py-2 border-b border-slate-100">
                            <span className="font-medium text-[#213448]">{p.project_name}</span>
                            {isUserProject && (
                              <span className="ml-2 text-xs text-[#547792]">(yours)</span>
                            )}
                            <div className="text-xs text-[#94B4C1]">{p.district}</div>
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 whitespace-nowrap">
                            {p.distance_km === 0 ? '-' : `${(p.distance_km * 1000).toFixed(0)}m`}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-600">
                            {p.bedroom || '-'}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-center text-slate-600">
                            {getAgeBandLabel(p.median_age, { isFreehold: p.is_freehold })}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 font-medium">
                            {(p.transaction_count || 0).toLocaleString()}
                          </td>
                          {isSuppressed ? (
                            /* When Obs < K: show volume label spanning price columns */
                            <td colSpan={4} className="px-3 py-2 border-b border-slate-100 text-center">
                              {volumeLabel && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${volumeLabel.style}`}>
                                  {volumeLabel.label} volume
                                </span>
                              )}
                            </td>
                          ) : (
                            /* When Obs >= K: show all price data */
                            <>
                              <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600">
                                {p.median_sqft?.toLocaleString() || '-'}
                              </td>
                              <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 whitespace-nowrap">
                                ${p.p25_price ? (p.p25_price / 1000000).toFixed(2) : '-'}M
                              </td>
                              <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 whitespace-nowrap font-medium">
                                ${p.median_price ? (p.median_price / 1000000).toFixed(2) : '-'}M
                              </td>
                              <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 whitespace-nowrap">
                                ${p.p75_price ? (p.p75_price / 1000000).toFixed(2) : '-'}M
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                    {sortedNearbyProjects.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                          No nearby projects found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </>
      )}

      {/* Initial state */}
      {!result && !loading && (
        <div className="bg-card rounded-lg border border-[#94B4C1]/50 p-8 text-center">
          <div className="max-w-md mx-auto">
            <svg className="w-16 h-16 mx-auto text-[#94B4C1] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h3 className="text-lg font-semibold text-[#213448] mb-2">Check Your Property Deal</h3>
            <p className="text-sm text-[#547792]">
              Select your project, bedroom type, and price paid to see how your purchase compares
              to similar transactions in the same project and within 1-2km radius.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
