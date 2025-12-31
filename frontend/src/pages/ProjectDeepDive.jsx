/**
 * Explore Page - Budget-based Property Search
 *
 * Features:
 * - Budget slider for target price
 * - Optional filters: Bedroom, Region, District, Tenure, Sale Type, Property Age
 * - Market activity heatmap by bedroom and property age
 * - Fair price range matrix
 * - Upcoming new launches
 * - Remaining new launches with unsold inventory
 */
import { useState, useRef } from 'react';
import { useData } from '../context/DataContext';
import { isDistrictInRegion, SALE_TYPE_OPTIONS, TENURE_OPTIONS, SaleType } from '../constants';
import { HotProjectsTable } from '../components/powerbi/HotProjectsTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { ResultsSummaryBar } from '../components/ResultsSummaryBar';
import { BudgetActivityHeatmap } from '../components/powerbi/BudgetActivityHeatmap';
import { PriceRangeMatrix } from '../components/powerbi/PriceRangeMatrix';
import { PageHeader } from '../components/ui';

// Budget slider constants
const BUDGET_MIN = 500000;    // $0.5M
const BUDGET_MAX = 5000000;   // $5M
const BUDGET_STEP = 25000;    // $25K intervals

// Active trading range for gradient visualization
const ACTIVE_RANGE_MIN = 1500000;  // $1.5M
const ACTIVE_RANGE_MAX = 3500000;  // $3.5M

export function ProjectDeepDiveContent() {
  // Get filter options from centralized DataContext (no duplicate API call)
  const { filterOptions: contextFilterOptions } = useData();

  // Form state
  const [budget, setBudget] = useState(1500000);
  const [bedroom, setBedroom] = useState('');
  const [region, setRegion] = useState('');
  const [district, setDistrict] = useState('');
  const [tenure, setTenure] = useState('');
  const [saleType, setSaleType] = useState('');
  const [leaseAge, setLeaseAge] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Loading state for search
  const [loading, setLoading] = useState(false);

  // Refs for scrolling
  const newLaunchesRef = useRef(null);

  // Hot projects count
  const [hotProjectsCount, setHotProjectsCount] = useState(0);

  // Mobile filter panel toggle
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Count active filters
  const activeFilterCount = [bedroom, region, district, tenure, saleType, leaseAge].filter(Boolean).length;

  // Derive filter options from context
  const filterOptions = {
    districts: contextFilterOptions?.districtsRaw || [],
    loading: contextFilterOptions?.loading ?? true,
  };

  // Handle search
  const handleSearch = (e) => {
    e.preventDefault();
    setLoading(true);
    setHasSearched(true);

    setTimeout(() => {
      setLoading(false);
      newLaunchesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Format budget for display
  const formatBudgetDisplay = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Filter districts by selected region
  const filteredDistricts = (filterOptions.districts || []).filter(d => {
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

  // Slider gradient
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
    <div className="min-h-full bg-[#EAE0CF]/40">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <PageHeader
            title="Explore"
            subtitle="Find properties within your budget and explore market activity"
          />
        </div>

        <div className="space-y-6 animate-fade-in">
          {/* Input Panel */}
          <div className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden">
            <form onSubmit={handleSearch}>
              <div className="grid grid-cols-1 lg:grid-cols-2">
                {/* LEFT: Budget Slider + Search */}
                <div className="min-w-0 px-4 md:px-5 py-4 md:py-5 lg:pr-6">
                  <p className="text-sm text-[#547792] mb-4">Target price (S$) - Show transactions within +/- $100K of this amount</p>

                  {/* Slider with floating value */}
                  <div className="relative mb-4 pt-8 max-w-full overflow-hidden">
                    {(() => {
                      const thumbPercent = ((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100;
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

                {/* RIGHT: Optional Filters */}
                <div className="min-w-0 mt-6 lg:mt-0 lg:border-l lg:border-[#94B4C1]/30 bg-[#547792]/[0.03]">
                  {/* Mobile: Collapsible toggle */}
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
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
                          <option value="5">5BR</option>
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
                          {TENURE_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
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
                          {SALE_TYPE_OPTIONS.filter(opt => opt.value !== SaleType.SUB_SALE).map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
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

          {/* Results Summary Bar */}
          {hasSearched && (
            <ResultsSummaryBar
              budget={budget}
              loading={loading}
              hotProjectsCount={hotProjectsCount}
              onJumpToNewLaunches={() => newLaunchesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            />
          )}

          {/* Market Activity Heatmap */}
          {hasSearched && (
            <BudgetActivityHeatmap
              budget={budget}
              bedroom={bedroom || null}
              region={region || null}
              district={district || null}
              tenure={tenure || null}
            />
          )}

          {/* Fair Price Range Matrix */}
          {hasSearched && (
            <PriceRangeMatrix
              budget={budget}
              tolerance={100000}
              region={region || null}
              district={district || null}
              tenure={tenure || null}
              monthsLookback={24}
            />
          )}

          {/* Upcoming New Launches */}
          {hasSearched && (
            <div ref={newLaunchesRef} className="space-y-4">
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

              <div className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#94B4C1]/30 flex items-center gap-3">
                  <span className="text-xl">🏗️</span>
                  <div>
                    <h3 className="font-semibold text-[#213448]">Upcoming New Launches</h3>
                    <p className="text-xs text-[#547792]">Projects expected to launch soon - not yet available for sale</p>
                  </div>
                </div>
                <UpcomingLaunchesTable height={300} showHeader={false} compact={true} />
              </div>
            </div>
          )}

          {/* Remaining New Launches */}
          {hasSearched && (
            <div className="space-y-4">
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

              <div className="bg-card rounded-lg border border-[#94B4C1]/50 overflow-hidden">
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
                  excludeSoldOut={true}
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

          {/* Initial state - before search */}
          {!hasSearched && (
            <div className="bg-card rounded-lg border border-[#94B4C1]/50 p-8 text-center">
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
      </div>
    </div>
  );
}

export default function ProjectDeepDive() {
  return <ProjectDeepDiveContent />;
}
