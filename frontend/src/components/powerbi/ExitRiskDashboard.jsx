/**
 * ExitRiskDashboard - Liquidity zone risk visualization
 *
 * Displays:
 * - Market Turnover bar (transactions per 100 units)
 * - Recent Turnover bar (12m transactions per 100 units)
 * - Liquidity Assessment badge (Low Risk / Moderate Risk / Elevated Risk)
 * - Interpretation text from backend
 *
 * Liquidity Zones (transactions per 100 units):
 * - Low Liquidity (<5): Soft amber - harder to exit
 * - Healthy Liquidity (5-15): Muted green - optimal for exit
 * - Elevated Turnover (>15): Muted red - possible volatility
 *
 * IMPORTANT: Values displayed as "X per 100 units" (NEVER with % symbol)
 */

// Institutional color palette for liquidity zones
const LIQUIDITY_COLORS = {
  low: '#F59E0B',      // Soft amber - Low Liquidity
  healthy: '#10B981',  // Muted green - Healthy Liquidity (optimal)
  high: '#EF4444',     // Muted red - Elevated Turnover
  unknown: '#94B4C1',  // Sky blue - Unknown
};

// Get liquidity zone from turnover value
const getLiquidityZone = (turnover) => {
  if (turnover === null || turnover === undefined) return 'unknown';
  if (turnover < 5) return 'low';
  if (turnover <= 15) return 'healthy';
  return 'high';
};

// Get color for turnover value based on liquidity zone
const getTurnoverColor = (turnover) => {
  const zone = getLiquidityZone(turnover);
  return LIQUIDITY_COLORS[zone] || LIQUIDITY_COLORS.unknown;
};

// Get zone label for display
const getZoneLabel = (zone) => {
  const labels = {
    low: 'Low Liquidity',
    healthy: 'Healthy Liquidity',
    high: 'Elevated Turnover',
    unknown: 'Insufficient Data',
  };
  return labels[zone] || 'Unknown';
};

// Get styles for overall risk badge
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

// Turnover bar component with liquidity zone coloring
function TurnoverBar({ label, value, maxValue = 30 }) {
  const zone = getLiquidityZone(value);
  const color = getTurnoverColor(value);
  const percentage = value !== null && value !== undefined
    ? Math.min((value / maxValue) * 100, 100)
    : 0;
  const displayValue = value !== null && value !== undefined
    ? `${value} per 100 units`
    : 'N/A';
  const zoneLabel = getZoneLabel(zone);

  return (
    <div className="mb-6">
      {/* Label and value */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[#547792]">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-semibold"
            style={{ color }}
          >
            {displayValue}
          </span>
        </div>
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

      {/* Zone indicator */}
      <div className="flex justify-between mt-1">
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded"
          style={{ color, backgroundColor: `${color}20` }}
        >
          {zoneLabel}
        </span>
        <div className="flex gap-4 text-[9px] text-[#94B4C1]">
          <span>&lt;5: Low</span>
          <span>5-15: Healthy</span>
          <span>&gt;15: Elevated</span>
        </div>
      </div>
    </div>
  );
}


// Skeleton loader for loading state
function ExitRiskDashboardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-6 animate-pulse">
      <div className="h-4 bg-[#94B4C1]/30 rounded w-1/3 mb-6" />

      {/* Market turnover bar skeleton */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <div className="h-3 bg-[#94B4C1]/30 rounded w-1/4" />
          <div className="h-3 bg-[#94B4C1]/30 rounded w-24" />
        </div>
        <div className="h-4 bg-[#94B4C1]/30 rounded-full" />
      </div>

      {/* Recent turnover bar skeleton */}
      <div className="mb-6">
        <div className="flex justify-between mb-2">
          <div className="h-3 bg-[#94B4C1]/30 rounded w-1/4" />
          <div className="h-3 bg-[#94B4C1]/30 rounded w-24" />
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
  marketTurnoverPct,
  recentTurnoverPct,
  marketTurnoverZone: _marketTurnoverZone, // Can derive from value, but accept for consistency
  recentTurnoverZone: _recentTurnoverZone,
  overallRisk,
  interpretation,
  loading = false,
}) {
  if (loading) {
    return <ExitRiskDashboardSkeleton />;
  }

  const riskBadge = getRiskBadgeStyles(overallRisk);

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-6">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-6">
        Liquidity Assessment
      </h3>

      {/* Market Turnover Bar */}
      <TurnoverBar
        label="Market Turnover"
        value={marketTurnoverPct}
        maxValue={30}  // Scale to 30 for better visualization
      />

      {/* Recent Turnover Bar */}
      <TurnoverBar
        label="Recent Turnover (12M)"
        value={recentTurnoverPct}
        maxValue={20}  // Scale to 20 for recent (typically lower)
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

      {/* Helper note */}
      <div className="mt-4 text-[10px] text-[#94B4C1] text-center">
        Turnover = resale transactions per 100 units. Green zone (5-15) indicates optimal liquidity.
      </div>
    </div>
  );
}
