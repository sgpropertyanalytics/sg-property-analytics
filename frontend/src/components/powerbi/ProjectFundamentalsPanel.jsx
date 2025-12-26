/**
 * ProjectFundamentalsPanel - Property fundamentals stats display
 *
 * Shows key project metrics in a card grid:
 * - Property Age (from TOP year or first resale)
 * - Total Units
 * - First Resale Date
 * - District/Tenure
 */

import { TenureLabels, Tenure } from '../../schemas/apiContract';

// Single stat card component
function StatCard({ label, value, subtext, isUnavailable = false }) {
  return (
    <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
      <p className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-xl font-semibold ${isUnavailable ? 'text-[#94B4C1]' : 'text-[#213448]'}`}>
        {value}
      </p>
      {subtext && (
        <p className="text-xs text-[#547792] mt-1">
          {subtext}
        </p>
      )}
    </div>
  );
}

// Skeleton loader
function ProjectFundamentalsSkeleton({ compact = false }) {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6 animate-pulse h-full">
      <div className="h-4 bg-[#94B4C1]/30 rounded w-1/2 mb-4" />
      <div className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-[#94B4C1]/20 rounded-lg p-3 md:p-4">
            <div className="h-3 bg-[#94B4C1]/30 rounded w-1/2 mb-2" />
            <div className="h-5 md:h-6 bg-[#94B4C1]/30 rounded w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProjectFundamentalsPanel({
  totalUnits,
  topYear,
  propertyAgeYears,
  ageSource,
  tenure,
  district,
  developer,
  firstResaleDate,
  loading = false,
  compact = false, // When true, uses 2-col grid (for 50/50 split layout)
}) {
  if (loading) {
    return <ProjectFundamentalsSkeleton compact={compact} />;
  }

  // Format property age display
  const formatAge = () => {
    if (propertyAgeYears === null || propertyAgeYears === undefined) {
      if (ageSource === 'not_topped_yet') {
        return { value: 'Pre-TOP', subtext: `Expected ${topYear}` };
      }
      return { value: 'N/A', subtext: 'Age unavailable', isUnavailable: true };
    }
    if (propertyAgeYears === 0) {
      return { value: '<1 year', subtext: ageSource === 'top_date' ? `TOP ${topYear}` : 'From first resale' };
    }
    return {
      value: `${propertyAgeYears} year${propertyAgeYears > 1 ? 's' : ''}`,
      subtext: ageSource === 'top_date' ? `TOP ${topYear}` : 'From first resale'
    };
  };

  // Format first resale date
  const formatFirstResale = () => {
    if (!firstResaleDate) {
      return { value: 'N/A', subtext: 'No resales recorded', isUnavailable: true };
    }
    const date = new Date(firstResaleDate);
    const formatted = date.toLocaleDateString('en-SG', { year: 'numeric', month: 'short' });
    return { value: formatted, subtext: 'First resale transaction' };
  };

  // Format total units
  const formatUnits = () => {
    if (!totalUnits) {
      return { value: 'N/A', subtext: 'Data not available', isUnavailable: true };
    }
    return { value: totalUnits.toLocaleString(), subtext: 'Total units in development' };
  };

  // Format tenure
  const formatTenure = () => {
    if (!tenure) {
      return { value: district || 'N/A', subtext: 'District', isUnavailable: !district };
    }
    // Extract key info from tenure string (e.g., "99 yrs lease commencing from 2022")
    const freeholdLabel = TenureLabels[Tenure.FREEHOLD];
    if (tenure.includes(freeholdLabel)) {
      return { value: freeholdLabel, subtext: district || '' };
    }
    const match = tenure.match(/(\d+)\s*yrs?\s*lease/i);
    if (match) {
      return { value: `${match[1]}-year`, subtext: district || '' };
    }
    return { value: tenure.substring(0, 15) + (tenure.length > 15 ? '...' : ''), subtext: district || '' };
  };

  const ageData = formatAge();
  const firstResaleData = formatFirstResale();
  const unitsData = formatUnits();
  const tenureData = formatTenure();

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6 h-full flex flex-col">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-3 md:mb-4">
        Property Fundamentals
      </h3>

      {/* Stats Grid - 2-col always in compact mode, responsive otherwise */}
      <div className={`grid gap-3 flex-1 ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4'}`}>
        <StatCard
          label="Property Age"
          value={ageData.value}
          subtext={ageData.subtext}
          isUnavailable={ageData.isUnavailable}
        />
        <StatCard
          label="Total Units"
          value={unitsData.value}
          subtext={unitsData.subtext}
          isUnavailable={unitsData.isUnavailable}
        />
        <StatCard
          label="First Resale"
          value={firstResaleData.value}
          subtext={firstResaleData.subtext}
          isUnavailable={firstResaleData.isUnavailable}
        />
        <StatCard
          label="Tenure"
          value={tenureData.value}
          subtext={tenureData.subtext}
          isUnavailable={tenureData.isUnavailable}
        />
      </div>

      {/* Developer info if available */}
      {developer && (
        <div className="mt-3 md:mt-4 text-xs text-[#547792]">
          <span className="font-medium">Developer:</span> {developer}
        </div>
      )}
    </div>
  );
}

