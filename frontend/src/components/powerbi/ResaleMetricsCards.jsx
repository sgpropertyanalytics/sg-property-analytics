/**
 * ResaleMetricsCards - Key resale activity metrics display
 *
 * Shows three cards:
 * - Resale Transactions (total count)
 * - Market Turnover (total transactions per 100 units)
 * - Recent Turnover (12m transactions per 100 units)
 *
 * Turnover values displayed as "X per 100 units" (NEVER with % symbol)
 */
import { FrostOverlay } from '../common/loading';

// Liquidity zone colors (institutional, muted palette)
const _LIQUIDITY_COLORS = {
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

// Single metric card with optional trend indicator
function MetricCard({ label, value, subtext, zone = 'default', isUnavailable = false }) {
  const colorClasses = {
    default: 'bg-[#EAE0CF]/30',
    low: 'bg-amber-50 border border-amber-200',
    healthy: 'bg-emerald-50 border border-emerald-200',
    high: 'bg-red-50 border border-red-200',
    unknown: 'bg-[#EAE0CF]/30',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[zone] || colorClasses.default}`}>
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

// Loading state with frost overlay
function ResaleMetricsSkeleton() {
  return (
    <div className="weapon-card overflow-hidden">
      <FrostOverlay height={180} showSpinner showProgress />
    </div>
  );
}

/**
 * @param {{
 *  totalResaleTransactions?: number | null,
 *  resales12m?: number | null,
 *  marketTurnoverPct?: number | null,
 *  recentTurnoverPct?: number | null,
 *  totalUnits?: number | null,
 *  loading?: boolean,
 *  compact?: boolean,
 * }} props
 */
export default function ResaleMetricsCards({
  totalResaleTransactions,
  resales12m,
  marketTurnoverPct,
  recentTurnoverPct,
  totalUnits,
  loading = false,
  compact = false, // When true, adjusts layout for 50/50 split
}) {
  if (loading) {
    return <ResaleMetricsSkeleton compact={compact} />;
  }

  // Format total resale transactions display
  const formatResaleTransactions = () => {
    if (totalResaleTransactions === null || totalResaleTransactions === undefined) {
      return { value: 'N/A', subtext: 'Data unavailable', isUnavailable: true };
    }
    return {
      value: totalResaleTransactions.toLocaleString(),
      subtext: 'Total resale transactions'
    };
  };

  // Format market turnover display (total transactions per 100 units)
  const formatMarketTurnover = () => {
    if (marketTurnoverPct === null || marketTurnoverPct === undefined) {
      return {
        value: 'N/A',
        subtext: 'Requires total units data',
        isUnavailable: true,
        zone: 'unknown'
      };
    }
    const zone = getLiquidityZone(marketTurnoverPct);
    return {
      value: `${marketTurnoverPct}`,
      subtext: `per 100 units • ${getZoneLabel(zone)}`,
      zone
    };
  };

  // Format recent turnover display (12m transactions per 100 units)
  const formatRecentTurnover = () => {
    if (recentTurnoverPct === null || recentTurnoverPct === undefined) {
      if (resales12m !== null && resales12m !== undefined) {
        return {
          value: resales12m.toLocaleString(),
          subtext: 'Transactions in last 12 months',
          zone: 'default'
        };
      }
      return {
        value: 'N/A',
        subtext: 'Requires total units data',
        isUnavailable: true,
        zone: 'unknown'
      };
    }
    const zone = getLiquidityZone(recentTurnoverPct);
    return {
      value: `${recentTurnoverPct}`,
      subtext: `per 100 units (last 12m) • ${getZoneLabel(zone)}`,
      zone
    };
  };

  const transactionsData = formatResaleTransactions();
  const marketTurnoverData = formatMarketTurnover();
  const recentTurnoverData = formatRecentTurnover();

  return (
    <div className="weapon-card p-4 md:p-6">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-3 md:mb-4">
        Resale Activity Metrics
      </h3>

      {/* Metrics Grid - responsive based on compact mode */}
      <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
        <MetricCard
          label="Resale Transactions"
          value={transactionsData.value}
          subtext={transactionsData.subtext}
          isUnavailable={transactionsData.isUnavailable}
        />
        <MetricCard
          label="Market Turnover"
          value={marketTurnoverData.value}
          subtext={marketTurnoverData.subtext}
          zone={marketTurnoverData.zone}
          isUnavailable={marketTurnoverData.isUnavailable}
        />
        <MetricCard
          label="Recent Turnover (12M)"
          value={recentTurnoverData.value}
          subtext={recentTurnoverData.subtext}
          zone={recentTurnoverData.zone}
          isUnavailable={recentTurnoverData.isUnavailable}
        />
      </div>

      {/* Additional context if no total_units */}
      {!totalUnits && totalResaleTransactions !== null && (
        <div className="mt-3 md:mt-4 text-xs text-[#547792] bg-[#EAE0CF]/20 rounded-lg p-3">
          <strong>Note:</strong> Total units data not available for turnover calculation.
          Showing {totalResaleTransactions?.toLocaleString()} total resale transactions.
        </div>
      )}
    </div>
  );
}
