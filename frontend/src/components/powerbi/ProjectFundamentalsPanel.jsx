/**
 * ProjectFundamentalsPanel - Property fundamentals stats display
 *
 * Shows 3 key project metrics in a card grid (mirrors ResaleMetricsCards):
 * - Property Age (from TOP year or first resale)
 * - Total Units
 * - First Resale Date
 */

// Single stat card component - matches MetricCard in ResaleMetricsCards
function StatCard({ label, value, subtext, isUnavailable = false }) {
  return (
    <div className="bg-[#EAE0CF]/30 rounded-lg p-4">
      <p className="text-xs font-medium text-[#547792] uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-2xl font-semibold ${isUnavailable ? 'text-[#94B4C1]' : 'text-[#213448]'}`}>
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

// Skeleton loader - matches ResaleMetricsSkeleton layout
function ProjectFundamentalsSkeleton({ compact = false }) {
  return (
    <div className="bg-card rounded-xl border border-[#94B4C1]/30 p-4 md:p-6 animate-pulse">
      <div className="h-4 bg-[#94B4C1]/30 rounded w-1/2 mb-4" />
      <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-[#94B4C1]/20 rounded-lg p-3 md:p-4">
            <div className="h-3 bg-[#94B4C1]/30 rounded w-1/2 mb-2" />
            <div className="h-6 md:h-8 bg-[#94B4C1]/30 rounded w-2/3 mb-1" />
            <div className="h-3 bg-[#94B4C1]/30 rounded w-3/4" />
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
  firstResaleDate,
  loading = false,
  compact = false, // When true, uses 3-col grid (mirrors ResaleMetricsCards)
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

  const ageData = formatAge();
  const firstResaleData = formatFirstResale();
  const unitsData = formatUnits();

  return (
    <div className="bg-card rounded-xl border border-[#94B4C1]/30 p-4 md:p-6">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-3 md:mb-4">
        Property Fundamentals
      </h3>

      {/* Stats Grid - 3 cards matching ResaleMetricsCards layout */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
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
      </div>
    </div>
  );
}

