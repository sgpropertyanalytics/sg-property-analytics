/**
 * Supply KPI Cards - Key metrics for Supply & Inventory Insights
 *
 * Displays three equal-width KPI cards using KPICardV2:
 * 1. Unsold Inventory - Developer stock from launched projects (not yet sold)
 * 2. Upcoming Launches - Pre-launch projects by launch year
 * 3. GLS Pipeline - Open GLS tenders (unassigned sites)
 *
 * IMPORTANT: This component does NOT use usePowerBIFilters().
 * Per CLAUDE.md Card 13, Supply Insights page uses local state, not sidebar filters.
 * All filters are passed as props from the parent component.
 */

import React, { useMemo } from 'react';
import { useAbortableQuery } from '../../hooks';
import { getSupplySummary } from '../../api/client';
import { KPICardV2, KPICardV2Skeleton, KPICardV2Group } from '../ui';

/**
 * Format large numbers with commas and K/M suffixes for readability
 */
function formatUnits(value) {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';

  // Use locale string for comma formatting
  return value.toLocaleString('en-SG');
}

/**
 * Supply KPI Cards Component
 *
 * @param {Object} props
 * @param {boolean} props.includeGls - Whether to include GLS pipeline in the display
 * @param {number} props.launchYear - Year filter for upcoming launches
 */
export function SupplyKpiCards({
  includeGls = true,
  launchYear = 2026,
}) {
  // Build filter key for cache/refetch
  const filterKey = useMemo(() =>
    `kpi:${includeGls}:${launchYear}`,
    [includeGls, launchYear]
  );

  // Fetch supply summary data
  const { data, loading, error } = useAbortableQuery(
    async (signal) => {
      const response = await getSupplySummary(
        { includeGls, launchYear },
        { signal }
      );
      return response.data;
    },
    [filterKey]
  );

  // Extract totals from response
  const totals = data?.totals || {};
  const unsoldInventory = totals.unsoldInventory || 0;
  const upcomingLaunches = totals.upcomingLaunches || 0;
  const glsPipeline = totals.glsPipeline || 0;

  // Error state - show message
  if (error && !loading) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4 text-center">
        <p className="text-[#547792] text-sm">Unable to load supply metrics</p>
      </div>
    );
  }

  return (
    <KPICardV2Group columns={3}>
      {/* KPI 1: Unsold Inventory */}
      <KPICardV2
        title="Unsold Inventory"
        value={formatUnits(unsoldInventory)}
        trend={{ value: 0, direction: 'neutral', label: 'Developer stock' }}
        transition="From launched projects"
        loading={loading}
      />

      {/* KPI 2: Upcoming Launches */}
      <KPICardV2
        title="Upcoming Launches"
        value={formatUnits(upcomingLaunches)}
        trend={{ value: 0, direction: 'up', label: 'Pipeline' }}
        transition={`Targeting ${launchYear}`}
        loading={loading}
      />

      {/* KPI 3: GLS Pipeline */}
      <KPICardV2
        title="GLS Pipeline"
        value={includeGls ? formatUnits(glsPipeline) : '—'}
        trend={includeGls ? { value: 0, direction: 'neutral', label: 'Open tenders' } : undefined}
        transition={includeGls ? 'Government land sales' : 'GLS data excluded'}
        loading={loading}
      />
    </KPICardV2Group>
  );
}

export default SupplyKpiCards;
