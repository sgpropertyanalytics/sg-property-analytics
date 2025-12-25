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
import { getProjectNames, getProjectExitQueue, getProjectPriceBands } from '../api/client';
import ExitRiskDashboard from '../components/powerbi/ExitRiskDashboard';
import ProjectFundamentalsPanel from '../components/powerbi/ProjectFundamentalsPanel';
import ResaleMetricsCards from '../components/powerbi/ResaleMetricsCards';
import PriceBandChart from '../components/powerbi/PriceBandChart';
import UnitPsfInput from '../components/powerbi/UnitPsfInput';
import { KeyInsightBox } from '../components/ui/KeyInsightBox';

// Random project name generator for loading animation
const generateRandomProjectName = () => {
  const prefixes = ['The', 'One', 'Park', 'Sky', 'Marina', 'Royal', 'Grand', 'Vista', 'Parc', 'Haus'];
  const middles = ['Residences', 'View', 'Heights', 'Loft', 'Towers', 'Suites', 'Edge', 'Crest', 'Haven', 'Oasis'];
  const locations = ['@ Orchard', '@ Marina', '@ Sentosa', '@ Tampines', '@ Bishan', '@ Bedok', '@ Clementi', '@ Novena'];

  const style = Math.floor(Math.random() * 3);
  if (style === 0) {
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${middles[Math.floor(Math.random() * middles.length)]}`;
  } else if (style === 1) {
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]} ${middles[Math.floor(Math.random() * middles.length)]} ${locations[Math.floor(Math.random() * locations.length)]}`;
  } else {
    return `${prefixes[Math.floor(Math.random() * prefixes.length)]}${prefixes[Math.floor(Math.random() * prefixes.length)].toLowerCase()}`;
  }
};

export function ProjectDeepDiveContent() {
  // Project selection state
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Loading animation state
  const [loadingProjectName, setLoadingProjectName] = useState(() => generateRandomProjectName());

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
  const [unitPsf, setUnitPsf] = useState(null);

  // Load project options on mount
  useEffect(() => {
    const fetchProjects = async () => {
      setProjectOptionsLoading(true);
      try {
        const response = await getProjectNames();
        setProjectOptions(response.data.projects || []);
      } catch (err) {
        console.error('Failed to load project options:', err);
        setProjectOptions([]);
      } finally {
        setProjectOptionsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  // Load exit queue data when project is selected
  useEffect(() => {
    if (!selectedProject) {
      setExitQueueData(null);
      return;
    }

    const fetchExitQueue = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getProjectExitQueue(selectedProject.name);
        setExitQueueData(response.data);
      } catch (err) {
        console.error('Failed to load exit queue data:', err);
        setError(err.response?.data?.error || 'Failed to load project data');
        setExitQueueData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchExitQueue();
  }, [selectedProject]);

  // Load price bands data when project or unitPsf changes
  useEffect(() => {
    if (!selectedProject) {
      setPriceBandsData(null);
      setPriceBandsError(null);
      return;
    }

    const fetchPriceBands = async () => {
      setPriceBandsLoading(true);
      setPriceBandsError(null);
      try {
        const params = {};
        if (unitPsf) {
          params.unit_psf = unitPsf;
        }
        const response = await getProjectPriceBands(selectedProject.name, params);
        setPriceBandsData(response.data);
      } catch (err) {
        console.error('Failed to load price bands:', err);
        setPriceBandsError(err.response?.data?.error || 'Failed to load price bands');
        setPriceBandsData(null);
      } finally {
        setPriceBandsLoading(false);
      }
    };
    fetchPriceBands();
  }, [selectedProject, unitPsf]);

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

  // Animate loading project name
  useEffect(() => {
    if (!projectOptionsLoading) return;
    const interval = setInterval(() => {
      setLoadingProjectName(generateRandomProjectName());
    }, 150);
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

        {/* Project Selector */}
        <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6 mb-6">
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
                    ? (
                      <span className="flex items-center gap-2">
                        <span className="inline-block animate-pulse">{loadingProjectName}</span>
                        <span className="text-xs">loading...</span>
                      </span>
                    )
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
            <ProjectFundamentalsPanel loading={true} />
            <ExitRiskDashboard loading={true} />
            <ResaleMetricsCards loading={true} />
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

            {/* Property Fundamentals */}
            <ProjectFundamentalsPanel
              totalUnits={exitQueueData.fundamentals?.total_units}
              topYear={exitQueueData.fundamentals?.top_year}
              propertyAgeYears={exitQueueData.fundamentals?.property_age_years}
              ageSource={exitQueueData.fundamentals?.age_source}
              tenure={exitQueueData.fundamentals?.tenure}
              district={exitQueueData.fundamentals?.district}
              developer={exitQueueData.fundamentals?.developer}
              firstResaleDate={exitQueueData.fundamentals?.first_resale_date}
            />

            {/* Historical Downside Protection - Price Bands */}
            <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-[#213448] mb-1">
                  Downside Protection Analysis
                </h2>
                <p className="text-sm text-[#547792]">
                  See where your unit PSF sits relative to historical price floors
                </p>
              </div>

              {/* Unit PSF Input */}
              <div className="mb-4 max-w-xs">
                <UnitPsfInput
                  value={unitPsf}
                  onChange={setUnitPsf}
                  label="Your Unit PSF"
                  placeholder="e.g., 2500"
                />
              </div>

              {/* Price Band Chart */}
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
            </div>

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

                {/* Resale Metrics Cards */}
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
                />
              </>
            )}

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
