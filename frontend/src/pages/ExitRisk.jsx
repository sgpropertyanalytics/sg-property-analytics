/**
 * Exit Risk Page - Liquidity Assessment Tool
 *
 * Focused page for analyzing project liquidity and exit risk.
 * Shows market turnover, recent turnover, and overall risk assessment.
 *
 * Features:
 * - Searchable project dropdown
 * - Liquidity assessment dashboard
 * - Risk interpretation from backend
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { getProjectNames, getProjectExitQueue } from '../api/client';
import ExitRiskDashboard from '../components/powerbi/ExitRiskDashboard';
import ProjectFundamentalsPanel from '../components/powerbi/ProjectFundamentalsPanel';
import { PageHeader } from '../components/ui';

// Session storage key for persisting selection
const STORAGE_KEY = 'exitRisk_selectedProject';

// Get stored project from sessionStorage
const getStoredProject = () => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
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

  // Data state
  const [projectOptions, setProjectOptions] = useState([]);
  const [projectOptionsLoading, setProjectOptionsLoading] = useState(true);
  const [exitQueueData, setExitQueueData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Persist selection to sessionStorage
  useEffect(() => {
    if (selectedProject) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProject));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedProject]);

  // Load project options on mount
  useEffect(() => {
    const controller = new AbortController();

    const fetchProjects = async () => {
      setProjectOptionsLoading(true);
      try {
        const response = await getProjectNames({ signal: controller.signal });
        const projects = response.data.projects || [];
        setProjectOptions(projects);

        // Validate stored project exists
        if (selectedProject) {
          const exists = projects.some(p => p.name === selectedProject.name);
          if (!exists) {
            setSelectedProject(null);
            sessionStorage.removeItem(STORAGE_KEY);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch exit queue data when project changes
  useEffect(() => {
    if (!selectedProject) {
      setExitQueueData(null);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
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
        setError(err.response?.data?.error || 'Failed to load liquidity data');
        setExitQueueData(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, [selectedProject]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter projects based on search
  const filteredProjects = useMemo(() => {
    if (!projectSearch.trim()) return projectOptions;
    const search = projectSearch.toLowerCase();
    return projectOptions.filter(p =>
      p.name.toLowerCase().includes(search) ||
      p.district?.toLowerCase().includes(search) ||
      p.market_segment?.toLowerCase().includes(search)
    );
  }, [projectOptions, projectSearch]);

  // Handle project selection
  const handleSelectProject = (project) => {
    setSelectedProject(project);
    setProjectSearch('');
    setIsDropdownOpen(false);
  };

  return (
    <div className="min-h-full bg-[#EAE0CF]/40">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <PageHeader
            title="Exit Risk Assessment"
            subtitle="Analyze liquidity and exit risk for any project with resale history"
          />
        </div>

        {/* Project Selector */}
        <div className="mb-6" ref={dropdownRef}>
          <label className="block text-sm font-medium text-[#213448] mb-2">
            Select Project
          </label>
          <div className="relative">
            <input
              type="text"
              value={isDropdownOpen ? projectSearch : (selectedProject?.name || '')}
              onChange={(e) => {
                setProjectSearch(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder={projectOptionsLoading ? 'Loading projects...' : 'Search for a project...'}
              disabled={projectOptionsLoading}
              className="w-full md:w-96 px-4 py-3 border border-[#94B4C1] rounded-lg
                         focus:ring-2 focus:ring-[#547792] focus:border-[#547792]
                         bg-white text-[#213448] placeholder-[#94B4C1]
                         disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
            {selectedProject && !isDropdownOpen && (
              <button
                onClick={() => {
                  setSelectedProject(null);
                  setProjectSearch('');
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94B4C1] hover:text-[#547792]"
              >
                ✕
              </button>
            )}

            {/* Dropdown */}
            {isDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full md:w-96 bg-white border border-[#94B4C1] rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredProjects.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[#94B4C1]">
                    {projectSearch ? 'No projects found' : 'Start typing to search...'}
                  </div>
                ) : (
                  filteredProjects.slice(0, 50).map((project) => (
                    <button
                      key={project.name}
                      onClick={() => handleSelectProject(project)}
                      className="w-full px-4 py-3 text-left hover:bg-[#EAE0CF]/50 border-b border-[#EAE0CF] last:border-b-0"
                    >
                      <div className="font-medium text-[#213448]">{project.name}</div>
                      <div className="text-xs text-[#547792]">
                        {project.district} • {project.market_segment}
                      </div>
                    </button>
                  ))
                )}
                {filteredProjects.length > 50 && (
                  <div className="px-4 py-2 text-xs text-[#94B4C1] bg-gray-50">
                    Showing first 50 results. Type more to narrow down.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Empty State */}
        {!selectedProject && !loading && (
          <div className="bg-card rounded-xl border border-[#94B4C1]/30 p-8 text-center">
            <div className="text-4xl mb-4">🚪</div>
            <h3 className="text-lg font-semibold text-[#213448] mb-2">
              Select a Project to Analyze
            </h3>
            <p className="text-[#547792] text-sm max-w-md mx-auto">
              Choose a project from the dropdown above to view its liquidity assessment
              and exit risk profile based on historical resale activity.
            </p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 animate-fade-in">
            <ProjectFundamentalsPanel loading={true} compact />
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
                  <strong>No resale transactions found</strong> for this project.
                  Exit risk analysis requires resale transaction history.
                </p>
              </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              {/* Project Fundamentals */}
              <ProjectFundamentalsPanel
                topYear={exitQueueData.fundamentals?.top_year}
                totalUnits={exitQueueData.fundamentals?.total_units}
                tenure={exitQueueData.fundamentals?.tenure}
                district={selectedProject?.district}
                marketSegment={selectedProject?.market_segment}
                compact
              />

              {/* Exit Risk Dashboard */}
              {exitQueueData.resale_metrics && (
                <ExitRiskDashboard
                  marketTurnoverPct={exitQueueData.resale_metrics?.market_turnover_pct}
                  recentTurnoverPct={exitQueueData.resale_metrics?.recent_turnover_pct}
                  marketTurnoverZone={exitQueueData.risk_assessment?.market_turnover_zone}
                  recentTurnoverZone={exitQueueData.risk_assessment?.recent_turnover_zone}
                  overallRisk={exitQueueData.risk_assessment?.overall_risk}
                  interpretation={exitQueueData.risk_assessment?.interpretation}
                />
              )}
            </div>

            {/* Resale Metrics Summary */}
            {exitQueueData.resale_metrics && (
              <div className="bg-card rounded-xl border border-[#94B4C1]/30 p-6">
                <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-4">
                  Resale Activity Summary
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-[#EAE0CF]/30 rounded-lg">
                    <div className="text-2xl font-bold text-[#213448]">
                      {exitQueueData.resale_metrics.total_resale_transactions?.toLocaleString() || '—'}
                    </div>
                    <div className="text-xs text-[#547792] mt-1">Total Resales</div>
                  </div>
                  <div className="text-center p-3 bg-[#EAE0CF]/30 rounded-lg">
                    <div className="text-2xl font-bold text-[#213448]">
                      {exitQueueData.resale_metrics.resales_12m?.toLocaleString() || '—'}
                    </div>
                    <div className="text-xs text-[#547792] mt-1">Last 12 Months</div>
                  </div>
                  <div className="text-center p-3 bg-[#EAE0CF]/30 rounded-lg">
                    <div className="text-2xl font-bold text-[#213448]">
                      {exitQueueData.fundamentals?.total_units?.toLocaleString() || '—'}
                    </div>
                    <div className="text-xs text-[#547792] mt-1">Total Units</div>
                  </div>
                  <div className="text-center p-3 bg-[#EAE0CF]/30 rounded-lg">
                    <div className="text-2xl font-bold text-[#213448]">
                      {exitQueueData.fundamentals?.top_year || '—'}
                    </div>
                    <div className="text-xs text-[#547792] mt-1">TOP Year</div>
                  </div>
                </div>
              </div>
            )}

            {/* Gating Flags (if any) */}
            {exitQueueData.gating_flags && Object.values(exitQueueData.gating_flags).some(v => v) && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">Data Considerations</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  {exitQueueData.gating_flags.is_boutique && (
                    <li>• Boutique development (&lt;50 units) - limited sample size</li>
                  )}
                  {exitQueueData.gating_flags.is_brand_new && (
                    <li>• Recently TOP (&lt;3 years) - limited resale history</li>
                  )}
                  {exitQueueData.gating_flags.is_ultra_luxury && (
                    <li>• Ultra-luxury segment - unique market dynamics</li>
                  )}
                  {exitQueueData.gating_flags.is_thin_data && (
                    <li>• Limited transaction data - interpret with caution</li>
                  )}
                </ul>
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
