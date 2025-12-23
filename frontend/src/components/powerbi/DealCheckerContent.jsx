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

// Format price for display
const formatPrice = (value) => {
  if (value === null || value === undefined) return '-';
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `$${millions.toFixed(2)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
};

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

  const getPercentile = (arr, p) => {
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

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
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Scope selection state
  const [activeScope, setActiveScope] = useState('radius_1km');

  // Load project names for dropdown
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await getProjectNames();
        setProjectOptions(response.data.projects || []);
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

      const response = await getDealCheckerMultiScope(params);
      setResult(response.data);
      // Default to 1km scope, or same_project if it has more data
      if (response.data.scopes?.same_project?.transaction_count > 10) {
        setActiveScope('same_project');
      } else {
        setActiveScope('radius_1km');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to check deal');
      setResult(null);
    } finally {
      setLoading(false);
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
  const nearbyProjects = useMemo(() => {
    if (!result?.map_data) return [];
    const projects_1km = result.map_data.projects_1km || [];
    const projects_2km = result.map_data.projects_2km || [];
    return [...projects_1km, ...projects_2km];
  }, [result?.map_data]);

  // Calculate volume thresholds for gradient coloring
  const volumeThresholds = useMemo(() => {
    return calculateVolumeThresholds(nearbyProjects);
  }, [nearbyProjects]);

  // Get selected project info for display
  const selectedProjectInfo = projectOptions.find(p => p.name === projectName);

  return (
    <div className="space-y-6">
      {/* Input Form Card - Consistent with Affordability tab */}
      {/* IMPORTANT: Do NOT add overflow-hidden here - it clips the project dropdown */}
      <div className="bg-white rounded-lg border border-[#94B4C1]/50">
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

          {/* Map and Nearby Projects Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Map */}
            <div className="bg-white rounded-lg border border-[#94B4C1]/50">
              <div className="px-4 py-3 border-b border-[#94B4C1]/30">
                <h3 className="font-semibold text-[#213448]">Nearby Projects</h3>
                <p className="text-xs text-[#547792]">
                  {result.meta?.projects_in_1km || 0} within 1km, {(result.meta?.projects_in_2km || 0) - (result.meta?.projects_in_1km || 0)} in 1-2km ring
                </p>
              </div>
              <div style={{ height: 350 }}>
                <DealCheckerMap
                  centerProject={result.project}
                  projects1km={result.map_data?.projects_1km || []}
                  projects2km={result.map_data?.projects_2km || []}
                />
              </div>
            </div>

            {/* Nearby Projects Table */}
            <div className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#94B4C1]/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-[#213448]">Projects Within 2km</h3>
                    <p className="text-xs text-[#547792]">
                      Sorted by distance from {result.project.name} • {bedroom}BR median values
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
              <div className="overflow-x-auto" style={{ maxHeight: 350 }}>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-600 border-b">Project</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">Dist</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">Transactions</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">Median Price</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">Sqft</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nearbyProjects.map((p, idx) => {
                      const isUserProject = p.project_name === result.project.name;
                      const isWithin1km = p.distance_km <= 1.0;
                      const volumeColor = getVolumeColor(p.transaction_count, volumeThresholds);
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
                          <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 font-medium">
                            {p.transaction_count || 0}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600 whitespace-nowrap">
                            {p.median_price ? `$${(p.median_price / 1000000).toFixed(2)}M` : '-'}
                          </td>
                          <td className="px-3 py-2 border-b border-slate-100 text-right text-slate-600">
                            {p.median_sqft ? p.median_sqft.toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                    {nearbyProjects.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                          No nearby projects found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Initial state */}
      {!result && !loading && (
        <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-8 text-center">
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
