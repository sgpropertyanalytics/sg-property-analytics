/**
 * Project Deep Dive Page - Comprehensive Project Analysis
 *
 * Features:
 * - Searchable project dropdown for projects with resale transactions
 * - Property fundamentals (age, units, tenure)
 * - Historical Downside Protection (P25/P50/P75 price bands)
 * - Exit queue risk assessment (maturity, pressure, risk badge)
 * - Resale activity metrics
 * - Gating warnings for special cases
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { getProjectNames, getProjectExitQueue, getProjectPriceBands, getProjectPriceGrowth } from '../api/client';
import ExitRiskDashboard from '../components/powerbi/ExitRiskDashboard';
import ProjectFundamentalsPanel from '../components/powerbi/ProjectFundamentalsPanel';
import ResaleMetricsCards from '../components/powerbi/ResaleMetricsCards';
import PriceBandChart from '../components/powerbi/PriceBandChart';
import PriceGrowthChart from '../components/powerbi/PriceGrowthChart';
import UnitPsfInput from '../components/powerbi/UnitPsfInput';
import { KeyInsightBox } from '../components/ui/KeyInsightBox';
import { FloorLiquidityHeatmap } from '../components/powerbi/FloorLiquidityHeatmap';

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

// localStorage keys for persistence
const STORAGE_KEY_PROJECT = 'projectDeepDive:selectedProject';
const STORAGE_KEY_UNIT_PSF = 'projectDeepDive:unitPsf';

// Helper to safely read from localStorage
const getStoredProject = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_PROJECT);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const getStoredUnitPsf = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_UNIT_PSF);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

export function ProjectDeepDiveContent() {
  // Project selection state - initialize from localStorage
  const [selectedProject, setSelectedProject] = useState(() => getStoredProject());
  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Loading animation state
  const [loadingText, setLoadingText] = useState(() => generateLoadingText());

  // Data state
  const [projectOptions, setProjectOptions] = useState([]);
  const [projectOptionsLoading, setProjectOptionsLoading] = useState(true);
  const [exitQueueData, setExitQueueData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Price bands state
  const [priceBandsData, setPriceBandsData] = useState(null);
  const [priceBandsLoading, setPriceBandsLoading] = useState(false);
  const [priceBandsError, setPriceBandsError] = useState(null);
  const [unitPsf, setUnitPsf] = useState(() => getStoredUnitPsf());

  // Persist selectedProject to localStorage
  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem(STORAGE_KEY_PROJECT, JSON.stringify(selectedProject));
    } else {
      localStorage.removeItem(STORAGE_KEY_PROJECT);
    }
  }, [selectedProject]);

  // Persist unitPsf to localStorage
  useEffect(() => {
    if (unitPsf !== null) {
      localStorage.setItem(STORAGE_KEY_UNIT_PSF, JSON.stringify(unitPsf));
    } else {
      localStorage.removeItem(STORAGE_KEY_UNIT_PSF);
    }
  }, [unitPsf]);

  // Price growth state
  const [priceGrowthData, setPriceGrowthData] = useState(null);
  const [priceGrowthLoading, setPriceGrowthLoading] = useState(false);
  const [priceGrowthError, setPriceGrowthError] = useState(null);

  // Load project options on mount and validate stored project
  useEffect(() => {
    const controller = new AbortController();

    const fetchProjects = async () => {
      setProjectOptionsLoading(true);
      try {
        const response = await getProjectNames({ signal: controller.signal });
        const projects = response.data.projects || [];
        setProjectOptions(projects);

        // Validate stored project exists in the list
        if (selectedProject) {
          const exists = projects.some(p => p.name === selectedProject.name);
          if (!exists) {
            console.warn('Stored project no longer exists, clearing selection');
            setSelectedProject(null);
            localStorage.removeItem(STORAGE_KEY_PROJECT);
          }
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        console.error('Failed to load project options:', err);
        setProjectOptions([]);
      } finally {
        if (!controller.signal.aborted) {
          setProjectOptionsLoading(false);
        }
      }
    };
    fetchProjects();

    return () => controller.abort();
  }, []);

  // Load exit queue data when project is selected
  useEffect(() => {
    if (!selectedProject) {
      setExitQueueData(null);
      return;
    }

    const controller = new AbortController();

    const fetchExitQueue = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getProjectExitQueue(selectedProject.name, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setExitQueueData(response.data);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        console.error('Failed to load exit queue data:', err);
        setError(err.response?.data?.error || 'Failed to load project data');
        setExitQueueData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };
    fetchExitQueue();

    return () => controller.abort();
  }, [selectedProject]);

  // Load price bands data when project or unitPsf changes
  useEffect(() => {
    if (!selectedProject) {
      setPriceBandsData(null);
      setPriceBandsError(null);
      return;
    }

    const controller = new AbortController();

    const fetchPriceBands = async () => {
      setPriceBandsLoading(true);
      setPriceBandsError(null);
      try {
        const params = {};
        if (unitPsf) {
          params.unit_psf = unitPsf;
        }
        const response = await getProjectPriceBands(selectedProject.name, params, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setPriceBandsData(response.data);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        console.error('Failed to load price bands:', err);
        setPriceBandsError(err.response?.data?.error || 'Failed to load price bands');
        setPriceBandsData(null);
      } finally {
        if (!controller.signal.aborted) {
          setPriceBandsLoading(false);
        }
      }
    };
    fetchPriceBands();

    return () => controller.abort();
  }, [selectedProject, unitPsf]);

  // Load price growth data when project is selected
  useEffect(() => {
    if (!selectedProject) {
      setPriceGrowthData(null);
      setPriceGrowthError(null);
      return;
    }

    const controller = new AbortController();

    const fetchPriceGrowth = async () => {
      setPriceGrowthLoading(true);
      setPriceGrowthError(null);
      try {
        const response = await getProjectPriceGrowth(selectedProject.name, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setPriceGrowthData(response.data);
        }
      } catch (err) {
        if (err.name === 'AbortError' || err.name === 'CanceledError') return;
        // Handle 404 (endpoint not deployed) vs other errors
        if (err.response?.status === 404) {
          setPriceGrowthError('Price growth data coming soon');
        } else {
          setPriceGrowthError(err.response?.data?.error || 'Failed to load price growth data');
        }
        setPriceGrowthData(null);
      } finally {
        if (!controller.signal.aborted) {
          setPriceGrowthLoading(false);
        }
      }
    };
    fetchPriceGrowth();

    return () => controller.abort();
  }, [selectedProject]);

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

  // Animate loading text with random project names
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

  // Handle project selection
  const handleProjectSelect = (project) => {
    setSelectedProject(project);
    setProjectSearch('');
    setIsDropdownOpen(false);
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedProject(null);
    setExitQueueData(null);
    setError(null);
    setPriceBandsData(null);
    setPriceBandsError(null);
    setUnitPsf(null);
    setPriceGrowthData(null);
    setPriceGrowthError(null);
  };

  // Render gating warnings
  const renderGatingWarnings = () => {
    if (!exitQueueData?.gating_flags) return null;

    const flags = exitQueueData.gating_flags;
    const warnings = [];

    if (flags.is_thin_data) {
      warnings.push({
        variant: 'warning',
        title: 'Limited Data',
        content: 'Insufficient transaction data for reliable analysis. Interpret with caution.'
      });
    }

    if (flags.is_boutique) {
      warnings.push({
        variant: 'info',
        title: 'Boutique Development',
        content: `This is a smaller development with ${exitQueueData.fundamentals?.total_units || 'few'} units. Small sample sizes may cause metrics to be less statistically reliable.`
      });
    }

    if (flags.is_brand_new) {
      warnings.push({
        variant: 'info',
        title: 'Recently Completed',
        content: 'This project achieved TOP recently. Resale patterns typically stabilize 3-5 years post-TOP.'
      });
    }

    if (flags.is_ultra_luxury) {
      warnings.push({
        variant: 'info',
        title: 'Premium Development',
        content: 'This is a premium/luxury development where typical resale patterns may not apply. Ultra-luxury properties often have lower turnover.'
      });
    }

    if (flags.unit_type_mixed) {
      warnings.push({
        variant: 'default',
        title: 'Mixed Unit Types',
        content: 'Analysis combines all unit types (1BR-5BR+). Interpretation may vary by unit size.'
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
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Project Deep Dive
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Exit queue risk analysis for individual projects
          </p>
        </div>

        {/* Project Selector + Downside Protection Input - Single Card with 50/50 Split */}
        <div className="bg-white rounded-xl border border-[#94B4C1]/30 overflow-hidden mb-6">
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
                  className="w-full px-3 py-2.5 text-sm border border-[#94B4C1]/50 rounded-lg text-left bg-[#EAE0CF]/20 focus:outline-none focus:ring-2 focus:ring-[#547792] focus:border-transparent flex items-center justify-between"
                >
                  <span className={selectedProject ? 'text-[#213448] truncate font-medium' : 'text-[#94B4C1]'}>
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
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-[#EAE0CF]/50 flex justify-between items-center ${
                              selectedProject?.name === p.name ? 'bg-[#EAE0CF]/30 text-[#213448] font-medium' : 'text-[#547792]'
                            }`}
                          >
                            <span className="truncate">{p.name}</span>
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

              {/* Project count info */}
              {!projectOptionsLoading && projectOptions.length > 0 && (
                <p className="text-xs text-[#94B4C1] mt-2">
                  {projectOptions.length.toLocaleString()} projects available
                </p>
              )}
            </div>

            {/* Right: Downside Protection Input - Grey background with left border */}
            <div className="lg:border-l lg:border-[#94B4C1]/30 bg-[#547792]/[0.03] p-4 md:p-6">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-[#213448] mb-1">
                  Downside Protection Analysis
                </h2>
                <p className="text-xs text-[#547792]">
                  See where your unit PSF sits relative to historical price floors
                </p>
              </div>

              {/* Unit PSF Input */}
              <UnitPsfInput
                value={unitPsf}
                onChange={setUnitPsf}
                label="Your Unit PSF"
                placeholder="e.g., 2500"
                disabled={!selectedProject}
              />

              {/* Helper when no project selected */}
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm">
              <strong>Error:</strong> {error}
            </p>
            <button
              onClick={() => setSelectedProject({ ...selectedProject })}
              className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!selectedProject && !loading && (
          <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#EAE0CF]/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[#213448] mb-2">
              Select a Project to Analyze
            </h2>
            <p className="text-sm text-[#547792] max-w-md mx-auto">
              Search for any condominium project with resale transaction history to view exit queue risk analysis, market maturity, and resale pressure metrics.
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-6 animate-fade-in">
            {/* 50/50 Split Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <ProjectFundamentalsPanel loading={true} compact />
              <ResaleMetricsCards loading={true} compact />
            </div>
            <ExitRiskDashboard loading={true} />
          </div>
        )}

        {/* Results */}
        {!loading && exitQueueData && (
          <div className="space-y-6 animate-fade-in">
            {/* No Resales Warning */}
            {exitQueueData.data_quality?.completeness === 'no_resales' && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-amber-700 text-sm">
                  <strong>No resale transactions found</strong> for this project. Exit queue analysis is not available until resale transactions occur.
                </p>
              </div>
            )}

            {/* Property Fundamentals + Resale Metrics - 50/50 Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              {/* Left: Property Fundamentals */}
              <ProjectFundamentalsPanel
                totalUnits={exitQueueData.fundamentals?.total_units}
                topYear={exitQueueData.fundamentals?.top_year}
                propertyAgeYears={exitQueueData.fundamentals?.property_age_years}
                ageSource={exitQueueData.fundamentals?.age_source}
                tenure={exitQueueData.fundamentals?.tenure}
                district={exitQueueData.fundamentals?.district}
                developer={exitQueueData.fundamentals?.developer}
                firstResaleDate={exitQueueData.fundamentals?.first_resale_date}
                compact
              />

              {/* Right: Resale Activity Metrics (only if resale data exists) */}
              {exitQueueData.resale_metrics ? (
                <ResaleMetricsCards
                  uniqueResaleUnitsTotal={exitQueueData.resale_metrics?.unique_resale_units_total}
                  uniqueResaleUnits12m={exitQueueData.resale_metrics?.unique_resale_units_12m}
                  totalResaleTransactions={exitQueueData.resale_metrics?.total_resale_transactions}
                  resaleMaturityPct={exitQueueData.resale_metrics?.resale_maturity_pct}
                  activeExitPressurePct={exitQueueData.resale_metrics?.active_exit_pressure_pct}
                  absorptionSpeedDays={exitQueueData.resale_metrics?.absorption_speed_days}
                  transactionsPer100Units={exitQueueData.resale_metrics?.transactions_per_100_units}
                  resalesLast24m={exitQueueData.resale_metrics?.resales_last_24m}
                  totalUnits={exitQueueData.fundamentals?.total_units}
                  compact
                />
              ) : (
                <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-6 flex flex-col">
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

            {/* Historical Price Bands Chart */}
            <PriceBandChart
                bands={priceBandsData?.bands || []}
                latest={priceBandsData?.latest}
                trend={priceBandsData?.trend}
                verdict={priceBandsData?.verdict}
                unitPsf={unitPsf}
                dataSource={priceBandsData?.data_source}
                proxyLabel={priceBandsData?.proxy_label}
                dataQuality={priceBandsData?.data_quality}
                loading={priceBandsLoading}
                error={priceBandsError}
                projectName={selectedProject?.name}
                height={450}
              />

            {/* Exit Risk Dashboard (only if resale data exists) */}
            {exitQueueData.resale_metrics && (
              <>
                <ExitRiskDashboard
                  maturityPct={exitQueueData.resale_metrics?.resale_maturity_pct}
                  pressurePct={exitQueueData.resale_metrics?.active_exit_pressure_pct}
                  maturityZone={exitQueueData.risk_assessment?.maturity_zone}
                  pressureZone={exitQueueData.risk_assessment?.pressure_zone}
                  overallRisk={exitQueueData.risk_assessment?.overall_risk}
                  interpretation={exitQueueData.risk_assessment?.interpretation}
                />

                {/* Floor Liquidity - Which Floors Resell Faster (district-scoped) */}
                <FloorLiquidityHeatmap
                  district={selectedProject?.district}
                  highlightProject={selectedProject?.name}
                />
              </>
            )}

            {/* Price Growth Analysis */}
            <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[#213448] mb-1">
                  Price Growth Analysis
                </h2>
                <p className="text-sm text-[#547792]">
                  Historical PSF trend and cumulative growth for this project
                </p>
              </div>
              <PriceGrowthChart
                data={priceGrowthData}
                loading={priceGrowthLoading}
                error={priceGrowthError}
                projectName={selectedProject?.name}
                district={selectedProject?.district}
                height={400}
              />
            </div>

            {/* Gating Warnings */}
            {renderGatingWarnings()}

            {/* Data Quality Notes */}
            {exitQueueData.data_quality?.warnings?.length > 0 && (
              <div className="bg-[#EAE0CF]/30 rounded-xl p-4 border border-[#94B4C1]/30">
                <h4 className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-2">
                  Data Notes
                </h4>
                <ul className="text-xs text-[#547792] space-y-1">
                  {exitQueueData.data_quality.warnings.map((warning, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-[#94B4C1]">-</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
                {exitQueueData.data_quality.sample_window_months > 0 && (
                  <p className="text-xs text-[#94B4C1] mt-2">
                    Data spans {exitQueueData.data_quality.sample_window_months} months of resale history.
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

export default ProjectDeepDiveContent;
