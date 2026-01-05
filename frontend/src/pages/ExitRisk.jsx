/**
 * Exit Risk Page - Comprehensive Project Exit Analysis
 *
 * Features:
 * - Searchable project dropdown for projects with resale transactions
 * - Property fundamentals (age, units, tenure)
 * - Historical Downside Protection (P25/P50/P75 price bands)
 * - Liquidity assessment (market turnover, recent turnover, risk badge)
 * - Resale activity metrics (transactions per 100 units)
 * - Gating warnings for special cases
 *
 * Liquidity Zones (transactions per 100 units):
 * - Low Liquidity (<5): harder to exit
 * - Healthy Liquidity (5-15): optimal for exit
 * - Elevated Turnover (>15): possible volatility
 *
 * PERFORMANCE: Chart.js components are lazy-loaded to reduce initial bundle size.
 */
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useAppQuery } from '../hooks';
import { getProjectNames, getProjectExitQueue, getProjectPriceBands, getProjectPriceGrowth, asArray } from '../api/client';
import ExitRiskDashboard from '../components/powerbi/ExitRiskDashboard';
import ProjectFundamentalsPanel from '../components/powerbi/ProjectFundamentalsPanel';
import ResaleMetricsCards from '../components/powerbi/ResaleMetricsCards';
import UnitPsfInput from '../components/powerbi/UnitPsfInput';
import { KeyInsightBox } from '../components/ui/KeyInsightBox';
import { ChartSkeleton } from '../components/common/ChartSkeleton';
import { FrostOverlay } from '../components/common/loading';
import { ErrorState } from '../components/common/ErrorState';
import { getQueryErrorMessage } from '../components/common/QueryState';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';
import {
  ProjectNamesField,
  getProjectNamesField,
  normalizeExitQueueResponse,
  PriceBandsField,
  getPriceBandsField,
} from '../schemas/apiContract';

// PERFORMANCE: Lazy-load Chart.js components (~170KB bundle reduction)
const PriceBandChart = lazy(() => import('../components/powerbi/PriceBandChart'));
const PriceGrowthChart = lazy(() => import('../components/powerbi/PriceGrowthChart'));
const FloorLiquidityHeatmap = lazy(() =>
  import('../components/powerbi/FloorLiquidityHeatmap').then(m => ({ default: m.FloorLiquidityHeatmap }))
);
const DistrictComparisonChart = lazy(() =>
  import('../components/powerbi/DistrictComparisonChart').then(m => ({ default: m.DistrictComparisonChart }))
);

// Random project name generator for loading animation
const generateRandomProjectName = () => {
  const prefixes = ['The', 'One', 'Park', 'Sky', 'Marina', 'Royal', 'Grand', 'Vista', 'Parc', 'Haus'];
  const middles = ['Residences', 'View', 'Heights', 'Loft', 'Towers', 'Suites', 'Edge', 'Crest', 'Haven', 'Oasis'];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(prefixes)} ${pick(middles)}`;
};

const generateLoadingText = () => {
  return `Loading project ${generateRandomProjectName()}, project ${generateRandomProjectName()}, project ${generateRandomProjectName()}...`;
};

// sessionStorage keys for persistence
const STORAGE_KEY_PROJECT = 'exitRisk:selectedProject';
const STORAGE_KEY_UNIT_PSF = 'exitRisk:unitPsf';

const getStoredProject = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_PROJECT);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Validate required fields - prevents corrupted data from causing issues
    if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      sessionStorage.removeItem(STORAGE_KEY_PROJECT);
      return null;
    }
    return parsed;
  } catch {
    // Clear corrupted data
    sessionStorage.removeItem(STORAGE_KEY_PROJECT);
    return null;
  }
};

const getStoredUnitPsf = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY_UNIT_PSF);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export function ExitRiskContent() {
  // Project selection state
  const [selectedProject, setSelectedProject] = useState(() => getStoredProject());
  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Loading animation state
  const [loadingText, setLoadingText] = useState(() => generateLoadingText());

  // Unit PSF state (for downside protection input)
  const [unitPsf, setUnitPsf] = useState(() => getStoredUnitPsf());

  // Validate project has required name property
  const validProject = selectedProject && typeof selectedProject.name === 'string' && selectedProject.name.trim();

  // --- Query 1: Project options (fetch once) ---
  const { data: projectOptions = [], status: projectsStatus } = useAppQuery(
    async (signal) => {
      const response = await getProjectNames({ signal });
      return asArray(getProjectNamesField(response.data || {}, ProjectNamesField.PROJECTS));
    },
    ['exitRisk-projects'],
    { chartName: 'ExitRisk-projects', staleTime: Infinity }
  );
  const projectOptionsLoading = projectsStatus === 'pending';

  // --- Query 2: Exit queue + price growth (when project selected) ---
  const { data: projectData, status: projectDataStatus, error: projectDataError } = useAppQuery(
    async (signal) => {
      const [exitQueueRes, priceGrowthRes] = await Promise.allSettled([
        getProjectExitQueue(selectedProject.name, { signal }),
        getProjectPriceGrowth(selectedProject.name, { signal }),
      ]);

      // Process exitQueue result
      let exitQueueData = null;
      let exitQueueError = null;

      if (exitQueueRes.status === 'fulfilled') {
        exitQueueData = exitQueueRes.value.data;
      } else {
        const err = exitQueueRes.reason;
        if (err.response?.status === 404) {
          const errorData = err.response?.data;
          if (errorData?.data_quality?.completeness === 'no_resales') {
            // Project exists but no resales - treat as data
            exitQueueData = errorData;
          } else {
            // Project doesn't exist - throw to trigger error state
            throw new Error('Project not found. It may have been removed from the database.');
          }
        } else {
          exitQueueError = err.response?.data?.error || 'Failed to load project data';
        }
      }

      // Process priceGrowth result
      let priceGrowthData = null;
      let priceGrowthError = null;

      if (priceGrowthRes.status === 'fulfilled') {
        priceGrowthData = priceGrowthRes.value.data;
      } else {
        const err = priceGrowthRes.reason;
        if (err.response?.status === 404) {
          priceGrowthError = 'Price growth data coming soon';
        } else {
          priceGrowthError = err.response?.data?.error || 'Failed to load price growth data';
        }
      }

      // Return with embedded errors for partial success handling
      return { exitQueue: exitQueueData, exitQueueError, priceGrowth: priceGrowthData, priceGrowthError };
    },
    ['exitRisk-data', selectedProject?.name],
    { chartName: 'ExitRisk-data', enabled: !!validProject }
  );

  // Derive state from projectData query
  const loading = projectDataStatus === 'pending';
  const error = projectDataStatus === 'error' ? projectDataError?.message : projectData?.exitQueueError;
  const exitQueueData = projectData?.exitQueue ?? null;
  const priceGrowthData = projectData?.priceGrowth ?? null;
  const priceGrowthError = projectData?.priceGrowthError ?? null;
  const priceGrowthLoading = loading;

  // --- Query 3: Price bands (when project selected) ---
  const { data: priceBandsData = null, status: priceBandsStatus, error: priceBandsQueryError } = useAppQuery(
    async (signal) => {
      const params = unitPsf ? { unit_psf: unitPsf } : {};
      const response = await getProjectPriceBands(selectedProject.name, params, { signal });
      return response.data;
    },
    ['exitRisk-bands', selectedProject?.name, unitPsf],
    { chartName: 'ExitRisk-bands', enabled: !!validProject }
  );
  const priceBandsLoading = priceBandsStatus === 'pending';
  const priceBandsError = priceBandsQueryError?.response?.data?.error || (priceBandsQueryError ? 'Failed to load price bands' : null);

  const normalizedExitQueue = useMemo(
    () => normalizeExitQueueResponse(exitQueueData),
    [exitQueueData]
  );

  // Persist selectedProject to sessionStorage
  useEffect(() => {
    if (selectedProject) {
      sessionStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(selectedProject));
    } else {
      sessionStorage.removeItem(STORAGE_KEY_PROJECT);
    }
  }, [selectedProject]);

  // Persist unitPsf to sessionStorage
  useEffect(() => {
    if (unitPsf !== null) {
      sessionStorage.setItem(STORAGE_KEY_UNIT_PSF, JSON.stringify(unitPsf));
    } else {
      sessionStorage.removeItem(STORAGE_KEY_UNIT_PSF);
    }
  }, [unitPsf]);

  // Validate stored project exists (runs once when projects load)
  useEffect(() => {
    if (projectsStatus !== 'success' || !selectedProject) return;
    const exists = projectOptions.some(p => p.name === selectedProject.name);
    if (!exists) {
      setSelectedProject(null);
      sessionStorage.removeItem(STORAGE_KEY_PROJECT);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectsStatus, projectOptions]);

  // Handle "project not found" error by clearing selection
  useEffect(() => {
    if (projectDataError?.message === 'Project not found. It may have been removed from the database.') {
      setSelectedProject(null);
      sessionStorage.removeItem(STORAGE_KEY_PROJECT);
    }
  }, [projectDataError]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Animate loading text
  useEffect(() => {
    if (!projectOptionsLoading) return;
    const interval = setInterval(() => {
      setLoadingText(generateLoadingText());
    }, 500);
    return () => clearInterval(interval);
  }, [projectOptionsLoading]);

  // Filter projects based on search
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projectOptions;
    const search = projectSearch.toLowerCase();
    return projectOptions.filter(
      p => p.name.toLowerCase().includes(search) || p.district?.toLowerCase().includes(search)
    );
  }, [projectOptions, projectSearch]);

  const handleProjectSelect = (project) => {
    setSelectedProject(project);
    setProjectSearch('');
    setIsDropdownOpen(false);
  };

  const handleClearSelection = () => {
    // Clear UI state - TanStack Query handles data state via enabled: !!validProject
    setSelectedProject(null);
    setUnitPsf(null);
  };

  const renderGatingWarnings = () => {
    if (!normalizedExitQueue?.gatingFlags) return null;

    const flags = normalizedExitQueue.gatingFlags;
    /** @type {Array<{variant: 'default' | 'warning' | 'info' | 'positive', title: string, content: string}>} */
    const warnings = [];

    if (flags.isThinData) {
      warnings.push({
        variant: 'warning',
        title: 'Limited Data',
        content: 'Insufficient transaction data for reliable analysis. Interpret with caution.'
      });
    }

    if (flags.isBoutique) {
      warnings.push({
        variant: 'info',
        title: 'Boutique Development',
        content: `This is a smaller development with ${normalizedExitQueue.fundamentals?.totalUnits || 'few'} units. Small sample sizes may cause metrics to be less statistically reliable.`
      });
    }

    if (flags.isBrandNew) {
      warnings.push({
        variant: 'info',
        title: 'Recently Completed',
        content: 'This project achieved TOP recently. Resale patterns typically stabilize 3-5 years post-TOP.'
      });
    }

    if (flags.isUltraLuxury) {
      warnings.push({
        variant: 'info',
        title: 'Premium Development',
        content: 'This is a premium/luxury development where typical resale patterns may not apply.'
      });
    }

    if (flags.unitTypeMixed) {
      warnings.push({
        variant: 'default',
        title: 'Mixed Unit Types',
        content: 'Analysis combines all unit types (1BR-5BR). Interpretation may vary by unit size.'
      });
    }

    if (warnings.length === 0) return null;

    return (
      <div className="space-y-3">
        {warnings.map((w, i) => (
          <KeyInsightBox key={i} variant={w.variant} title={w.title} compact>
            {w.content}
          </KeyInsightBox>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-full bg-[#EAE0CF]/40">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Exit Risk Analysis
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Comprehensive exit queue and liquidity assessment for individual projects
          </p>
        </div>

        {/* Project Selector + Downside Protection Input */}
        <div className="bg-card rounded-xl border border-[#94B4C1]/30 mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left: Project Selector */}
            <div className="p-4 md:p-6">
              <label className="block text-sm font-medium text-[#213448] mb-2">
                Select a Project
              </label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  disabled={projectOptionsLoading}
                  className="w-full px-3 py-2.5 text-sm border border-[#94B4C1]/50 rounded-lg text-left bg-[#EAE0CF]/20 focus:outline-none focus:ring-2 focus:ring-[#547792] focus:border-transparent flex items-center justify-between min-w-0"
                >
                  <span className={selectedProject ? 'text-[#213448] truncate font-medium min-w-0' : 'text-[#94B4C1] min-w-0'}>
                    {selectedProject
                      ? `${selectedProject.name} (${selectedProject.district})`
                      : projectOptionsLoading
                        ? <span className="truncate">{loadingText}</span>
                        : 'Search for a project...'}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {selectedProject && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleClearSelection(); }}
                        className="p-1 hover:bg-[#94B4C1]/30 rounded"
                      >
                        <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <svg className={`w-4 h-4 text-[#547792] transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
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
                        <div className="px-3 py-4 text-sm text-[#94B4C1] text-center">
                          {projectOptionsLoading ? 'Loading...' : 'No projects found'}
                        </div>
                      ) : (
                        filteredProjects.slice(0, 100).map(p => (
                          <button
                            key={p.name}
                            type="button"
                            onClick={() => handleProjectSelect(p)}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-[#EAE0CF]/50 flex justify-between items-center min-w-0 ${
                              selectedProject?.name === p.name ? 'bg-[#EAE0CF]/30 text-[#213448] font-medium' : 'text-[#547792]'
                            }`}
                          >
                            <span className="truncate min-w-0">{p.name}</span>
                            <span className="text-xs text-[#94B4C1] ml-2 flex-shrink-0">{p.district}</span>
                          </button>
                        ))
                      )}
                      {filteredProjects.length > 100 && (
                        <div className="px-3 py-2 text-xs text-[#94B4C1] text-center border-t border-[#94B4C1]/30">
                          +{filteredProjects.length - 100} more projects
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {!projectOptionsLoading && projectOptions.length > 0 && (
                <p className="text-xs text-[#94B4C1] mt-2">
                  {projectOptions.length.toLocaleString()} projects available
                </p>
              )}
            </div>

            {/* Right: Downside Protection Input */}
            <div className="lg:border-l lg:border-[#94B4C1]/30 bg-[#547792]/[0.03] p-4 md:p-6">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-[#213448] mb-1">
                  Downside Protection Analysis
                </h2>
                <p className="text-xs text-[#547792]">
                  See where your unit PSF sits relative to historical price floors
                </p>
              </div>

              <UnitPsfInput
                value={unitPsf}
                onChange={setUnitPsf}
                disabled={!selectedProject}
              />

              {!selectedProject && (
                <p className="text-xs text-[#94B4C1] mt-2 italic">
                  Select a project first to analyze downside protection
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6">
            <ErrorState
              message={getQueryErrorMessage(error)}
              onRetry={() => setSelectedProject({ ...selectedProject })}
            />
          </div>
        )}

        {/* Empty State */}
        {!selectedProject && !loading && (
          <div className="bg-card rounded-xl border border-[#94B4C1]/30 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#EAE0CF]/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[#213448] mb-2">
              Select a Project to Analyze
            </h2>
            <p className="text-sm text-[#547792] max-w-md mx-auto">
              Search for any condominium project with resale transaction history to view liquidity assessment, turnover metrics, and downside protection analysis.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-4 lg:space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <ProjectFundamentalsPanel loading={true} compact />
              <ResaleMetricsCards loading={true} compact />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <div className="bg-card rounded-xl border border-[#94B4C1]/30 overflow-hidden">
                <FrostOverlay height={350} showSpinner showProgress />
              </div>
              <div className="bg-card rounded-xl border border-[#94B4C1]/30 overflow-hidden">
                <FrostOverlay height={400} showSpinner showProgress />
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <div className="bg-card rounded-xl border border-[#94B4C1]/30 overflow-hidden">
                <FrostOverlay height={400} showSpinner showProgress />
              </div>
              <ExitRiskDashboard loading={true} />
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && normalizedExitQueue && (
          <div className="space-y-6 animate-fade-in">
            {/* No Resales Warning */}
            {normalizedExitQueue.dataQuality?.completeness === 'no_resales' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-700 text-sm">
                  <strong>No resale transactions found</strong> for this project. Exit queue analysis is not available until resale transactions occur.
                </p>
              </div>
            )}

            {/* Charts Grid */}
            <div className="space-y-4 lg:space-y-6">
              {/* Row 1: KPI Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
                <ProjectFundamentalsPanel
                  totalUnits={normalizedExitQueue.fundamentals?.totalUnits}
                  topYear={normalizedExitQueue.fundamentals?.topYear}
                  propertyAgeYears={normalizedExitQueue.fundamentals?.propertyAgeYears}
                  ageSource={normalizedExitQueue.fundamentals?.ageSource}
                  firstResaleDate={normalizedExitQueue.fundamentals?.firstResaleDate}
                  compact
                />
                {normalizedExitQueue.resaleMetrics ? (
                  <ResaleMetricsCards
                    totalResaleTransactions={normalizedExitQueue.resaleMetrics?.totalResaleTransactions}
                    resales12m={normalizedExitQueue.resaleMetrics?.resales12m}
                    marketTurnoverPct={normalizedExitQueue.resaleMetrics?.marketTurnoverPct}
                    recentTurnoverPct={normalizedExitQueue.resaleMetrics?.recentTurnoverPct}
                    totalUnits={normalizedExitQueue.fundamentals?.totalUnits}
                    compact
                  />
                ) : (
                  <div className="bg-card rounded-xl border border-[#94B4C1]/30 p-6 flex flex-col">
                    <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-4">
                      Resale Activity Metrics
                    </h3>
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-sm text-[#94B4C1] text-center">
                        No resale data available yet
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Row 2: Price Growth + Floor Liquidity */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 lg:items-stretch">
                <ErrorBoundary name="Price Growth Chart" compact>
                  <Suspense fallback={<ChartSkeleton type="line" height={400} />}>
                    <PriceGrowthChart
                      data={priceGrowthData}
                      loading={priceGrowthLoading}
                      error={priceGrowthError}
                      projectName={selectedProject?.name}
                      district={selectedProject?.district}
                      height={400}
                    />
                  </Suspense>
                </ErrorBoundary>
                {normalizedExitQueue.resaleMetrics && (
                  <ErrorBoundary name="Floor Liquidity Heatmap" compact>
                    <Suspense fallback={<ChartSkeleton type="table" height={400} />}>
                      <FloorLiquidityHeatmap
                        district={selectedProject?.district}
                        highlightProject={selectedProject?.name}
                      />
                    </Suspense>
                  </ErrorBoundary>
                )}
              </div>

              {/* Row 3: Price Band + Exit Risk */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 items-stretch">
                <ErrorBoundary name="Price Band Chart" compact>
                  <Suspense fallback={<ChartSkeleton type="line" height={400} />}>
                    <PriceBandChart
                      bands={getPriceBandsField(priceBandsData, PriceBandsField.BANDS) || []}
                      latest={getPriceBandsField(priceBandsData, PriceBandsField.LATEST)}
                      trend={getPriceBandsField(priceBandsData, PriceBandsField.TREND)}
                      verdict={getPriceBandsField(priceBandsData, PriceBandsField.VERDICT)}
                      unitPsf={unitPsf}
                      dataSource={getPriceBandsField(priceBandsData, PriceBandsField.DATA_SOURCE)}
                      proxyLabel={getPriceBandsField(priceBandsData, PriceBandsField.PROXY_LABEL)}
                      dataQuality={getPriceBandsField(priceBandsData, PriceBandsField.DATA_QUALITY)}
                      totalResaleTransactions={normalizedExitQueue?.resaleMetrics?.totalResaleTransactions}
                      loading={priceBandsLoading}
                      error={priceBandsError}
                      projectName={selectedProject?.name}
                      height={400}
                    />
                  </Suspense>
                </ErrorBoundary>
                {normalizedExitQueue.resaleMetrics && (
                  <ExitRiskDashboard
                    marketTurnoverPct={normalizedExitQueue.resaleMetrics?.marketTurnoverPct}
                    recentTurnoverPct={normalizedExitQueue.resaleMetrics?.recentTurnoverPct}
                    marketTurnoverZone={normalizedExitQueue.riskAssessment?.marketTurnoverZone}
                    recentTurnoverZone={normalizedExitQueue.riskAssessment?.recentTurnoverZone}
                    overallRisk={normalizedExitQueue.riskAssessment?.overallRisk}
                    interpretation={normalizedExitQueue.riskAssessment?.interpretation}
                  />
                )}
              </div>

              {/* Row 4: District Comparison */}
              {selectedProject?.district && (
                <ErrorBoundary name="District Comparison Chart" compact>
                  <Suspense fallback={<ChartSkeleton type="bar" height={400} />}>
                    <DistrictComparisonChart
                      district={selectedProject.district}
                      selectedProject={selectedProject.name}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
            </div>

            {/* Gating Warnings */}
            {renderGatingWarnings()}

            {/* Data Quality Notes */}
            {normalizedExitQueue.dataQuality?.warnings?.length > 0 && (
              <div className="bg-[#EAE0CF]/30 rounded-xl p-4 border border-[#94B4C1]/30">
                <h4 className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-2">
                  Data Notes
                </h4>
                <ul className="text-xs text-[#547792] space-y-1">
                  {normalizedExitQueue.dataQuality.warnings.map((warning, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#94B4C1]">-</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
                {normalizedExitQueue.dataQuality.sampleWindowMonths > 0 && (
                  <p className="text-xs text-[#94B4C1] mt-2">
                    Data spans {normalizedExitQueue.dataQuality.sampleWindowMonths} months of resale history.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExitRisk() {
  return <ExitRiskContent />;
}
