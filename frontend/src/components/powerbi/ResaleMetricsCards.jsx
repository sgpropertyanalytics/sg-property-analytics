/**
 * ResaleMetricsCards - Key resale activity metrics display
 *
 * Shows three cards:
 * - Resale Transactions (total count)
 * - Exit Pressure (12m activity %)
 * - Absorption Speed (median days between transactions)
 */

// Single metric card with optional trend indicator
function MetricCard({ label, value, subtext, color = 'default', isUnavailable = false }) {
  const colorClasses = {
    default: 'bg-[#EAE0CF]/30',
    green: 'bg-emerald-50 border border-emerald-200',
    yellow: 'bg-amber-50 border border-amber-200',
    red: 'bg-red-50 border border-red-200',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color]}`}>
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

// Skeleton loader
function ResaleMetricsSkeleton({ compact = false }) {
  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6 animate-pulse h-full">
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

// Get color based on pressure level
const getPressureColor = (pct) => {
  if (pct === null || pct === undefined) return 'default';
  if (pct < 5) return 'green';
  if (pct < 10) return 'yellow';
  return 'red';
};

// Get color for absorption speed (faster = better absorption)
const getAbsorptionColor = (days) => {
  if (days === null || days === undefined) return 'default';
  if (days <= 14) return 'green';   // Very fast absorption
  if (days <= 30) return 'yellow';  // Moderate
  return 'red';                      // Slow absorption
};

export default function ResaleMetricsCards({
  uniqueResaleUnitsTotal,
  uniqueResaleUnits12m,
  totalResaleTransactions,
  resaleMaturityPct,
  activeExitPressurePct,
  absorptionSpeedDays,
  transactionsPer100Units,
  resalesLast24m,
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
    const pctText = transactionsPer100Units !== null ? ` (${transactionsPer100Units} per 100 units)` : '';
    return {
      value: totalResaleTransactions.toLocaleString(),
      subtext: `Total resale transactions${pctText}`
    };
  };

  // Format active pressure display
  const formatPressure = () => {
    if (activeExitPressurePct === null || activeExitPressurePct === undefined) {
      if (uniqueResaleUnits12m !== null && uniqueResaleUnits12m !== undefined) {
        return {
          value: uniqueResaleUnits12m.toLocaleString(),
          subtext: 'Units resold in last 12 months',
          color: 'default'
        };
      }
      return { value: 'N/A', subtext: 'Percentage requires total units data', isUnavailable: true };
    }
    return {
      value: `${activeExitPressurePct}%`,
      subtext: `${uniqueResaleUnits12m} units in last 12 months`,
      color: getPressureColor(activeExitPressurePct)
    };
  };

  // Format absorption speed display
  const formatAbsorption = () => {
    // Gate: only show if enough recent activity
    if (resalesLast24m !== null && resalesLast24m !== undefined && resalesLast24m < 12) {
      return {
        value: 'Insufficient',
        subtext: 'Need 12+ resales in 24m to calculate',
        isUnavailable: true,
        color: 'default'
      };
    }

    if (absorptionSpeedDays === null || absorptionSpeedDays === undefined) {
      return { value: 'N/A', subtext: 'Data unavailable', isUnavailable: true };
    }

    // Format based on days
    let displayValue;
    if (absorptionSpeedDays < 1) {
      displayValue = '<1 day';
    } else if (absorptionSpeedDays >= 30) {
      const weeks = Math.round(absorptionSpeedDays / 7);
      displayValue = `~${weeks} week${weeks > 1 ? 's' : ''}`;
    } else {
      displayValue = `${Math.round(absorptionSpeedDays)} day${absorptionSpeedDays !== 1 ? 's' : ''}`;
    }

    return {
      value: displayValue,
      subtext: 'Median time between resales',
      color: getAbsorptionColor(absorptionSpeedDays)
    };
  };

  const transactionsData = formatResaleTransactions();
  const pressureData = formatPressure();
  const absorptionData = formatAbsorption();

  return (
    <div className="bg-white rounded-xl border border-[#94B4C1]/30 p-4 md:p-6 h-full flex flex-col">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[#213448] uppercase tracking-wide mb-3 md:mb-4">
        Resale Activity Metrics
      </h3>

      {/* Metrics Grid - responsive based on compact mode */}
      <div className={`grid gap-3 flex-1 ${compact ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 md:grid-cols-3'}`}>
        <MetricCard
          label="Resale Transactions"
          value={transactionsData.value}
          subtext={transactionsData.subtext}
          isUnavailable={transactionsData.isUnavailable}
        />
        <MetricCard
          label="Exit Pressure (12m)"
          value={pressureData.value}
          subtext={pressureData.subtext}
          color={pressureData.color}
          isUnavailable={pressureData.isUnavailable}
        />
        <MetricCard
          label="Absorption Speed"
          value={absorptionData.value}
          subtext={absorptionData.subtext}
          color={absorptionData.color}
          isUnavailable={absorptionData.isUnavailable}
        />
      </div>

      {/* Additional context if no total_units */}
      {!totalUnits && transactionsPer100Units !== null && (
        <div className="mt-3 md:mt-4 text-xs text-[#547792] bg-[#EAE0CF]/20 rounded-lg p-3">
          <strong>Note:</strong> Total units data not available.
          Showing {totalResaleTransactions} total resale transactions.
        </div>
      )}
    </div>
  );
}

