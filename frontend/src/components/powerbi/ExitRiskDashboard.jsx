/**
 * ExitRiskDashboard - Two-axis exit queue risk visualization
 *
 * Displays:
 * - Resale Market Maturity bar (0-100%, zones: Red 0-15%, Yellow 15-40%, Green 40%+)
 * - Recent Exit Pressure bar (0-20%+, zones: Green 0-5%, Yellow 5-10%, Red 10%+)
 * - Exit Risk Assessment badge (Low / Moderate / Elevated)
 * - Interpretation text from backend
 */

// Color constants from project palette
const COLORS = {
  green: '#10B981',   // emerald-500 - good
  yellow: '#F59E0B',  // amber-500 - moderate
  red: '#EF4444',     // red-500 - bad/warning
  navy: '#213448',    // deep navy - primary text
  ocean: '#547792',   // ocean blue - secondary text
  sand: '#EAE0CF',    // sand - backgrounds
  sky: '#94B4C1',     // sky blue - borders
};

// Get color for maturity zone (high = good)
const getMaturityColor = (pct) => {
  if (pct === null || pct === undefined) return COLORS.sky;
  if (pct >= 40) return COLORS.green;
  if (pct >= 15) return COLORS.yellow;
  return COLORS.red;
};

// Get color for pressure zone (low = good)
const getPressureColor = (pct) => {
  if (pct === null || pct === undefined) return COLORS.sky;
  if (pct < 5) return COLORS.green;
  if (pct < 10) return COLORS.yellow;
  return COLORS.red;
};

// Get color for overall risk badge
const getRiskBadgeStyles = (risk) => {
  switch (risk) {
    case 'low':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        border: 'border-emerald-300',
        label: 'LOW RISK'
      };
    case 'elevated':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        border: 'border-red-300',
        label: 'ELEVATED RISK'
      };
    default:
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        border: 'border-amber-300',
        label: 'MODERATE RISK'
      };
  }
};

// Progress bar component with color zones
function RiskProgressBar({ label, value, maxValue = 100, zones, getColor, suffix = '%' }) {
  const percentage = value !== null ? Math.min((value / maxValue) * 100, 100) : 0;
  const color = getColor(value);
  const displayValue = value !== null ? `${value}${suffix}` : 'N/A';

  return (
    <div className="mb-6">
      {/* Label and value */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[#547792]">
          {label}
        </span>
        <span
          className="text-sm font-semibold"
          style={{ color }}
        >
          {displayValue}
        </span>
      </div>

      {/* Progress bar container */}
      <div className="relative h-4 bg-[#EAE0CF]/50 rounded-full overflow-hidden">
        {/* Filled portion */}
        <div
          className="absolute top-0 left-0 h-full rounded-full transition-all duration-500"
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Zone markers */}
      <div className="flex justify-between mt-1 text-[10px] text-[#94B4C1]">
        {zones.map((zone, i) => (
          <span key={i} className="flex flex-col items-center">
            <span>{zone.label}</span>
            <span className="text-[9px]">({zone.range})</span>
          </span>
        ))}
      </div>
    </div>
  );
}


// Skeleton loader for loading state
function ExitRiskDashboardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-6 animate-pulse">
      <div className="h-4 bg-[#94B4C1]/30 rounded w-1/3 mb-6" />

      {/* Maturity bar skeleton */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <div className="h-3 bg-[#94B4C1]/30 rounded w-1/4" />
          <div className="h-3 bg-[#94B4C1]/30 rounded w-16" />
        </div>
        <div className="h-4 bg-[#94B4C1]/30 rounded-full" />
      </div>

      {/* Pressure bar skeleton */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <div className="h-3 bg-[#94B4C1]/30 rounded w-1/4" />
          <div className="h-3 bg-[#94B4C1]/30 rounded w-16" />
        </div>
        <div className="h-4 bg-[#94B4C1]/30 rounded-full" />
      </div>

      {/* Badge skeleton */}
      <div className="flex justify-center mb-4">
        <div className="h-8 bg-[#94B4C1]/30 rounded-full w-32" />
      </div>

      {/* Interpretation skeleton */}
      <div className="h-16 bg-[#94B4C1]/30 rounded" />
    </div>
  );
}

export default function ExitRiskDashboard({
  maturityPct,
  pressurePct,
  maturityZone: _maturityZone,
  pressureZone: _pressureZone,
  overallRisk,
  interpretation,
  loading = false,
}) {
  if (loading) {
    return <ExitRiskDashboardSkeleton />;
  }

  const riskBadge = getRiskBadgeStyles(overallRisk);

  // Zone definitions for labels
  const maturityZones = [
    { label: 'Early', range: '0-15%' },
    { label: 'Developing', range: '15-40%' },
    { label: 'Proven', range: '40%+' },
  ];

  const pressureZones = [
    { label: 'Low', range: '0-5%' },
    { label: 'Moderate', range: '5-10%' },
    { label: 'High', range: '10%+' },
  ];

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-6">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-6">
        Exit Queue Risk Assessment
      </h3>

      {/* Maturity Bar */}
      <RiskProgressBar
        label="Resale Market Maturity"
        value={maturityPct}
        maxValue={100}
        zones={maturityZones}
        getColor={getMaturityColor}
      />

      {/* Pressure Bar */}
      <RiskProgressBar
        label="Recent Exit Pressure (12 months)"
        value={pressurePct}
        maxValue={20}  // Scale to 20% max for better visualization
        zones={pressureZones}
        getColor={getPressureColor}
      />

      {/* Risk Badge */}
      <div className="flex justify-center my-6">
        <div
          className={`px-6 py-2 rounded-full border ${riskBadge.bg} ${riskBadge.border} ${riskBadge.text} font-semibold text-sm uppercase tracking-wide`}
        >
          {riskBadge.label}
        </div>
      </div>

      {/* Interpretation */}
      {interpretation && (
        <div className="bg-[#EAE0CF]/30 rounded-lg p-4 text-sm text-[#213448] leading-relaxed">
          {interpretation}
        </div>
      )}
    </div>
  );
}

