/**
 * Supply KPI Cards - Key metrics for Supply & Inventory Insights
 *
 * Displays three equal-width KPI cards:
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
import { KPICard, KPICardSkeleton } from '../ui';

// Icons for each KPI card
const BuildingIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

const RocketIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
      d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
  </svg>
);

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

  // Loading state - show 3 skeleton cards
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </div>
    );
  }

  // Error state - show message
  if (error) {
    return (
      <div className="bg-white rounded-lg border border-[#94B4C1]/50 p-4 text-center">
        <p className="text-[#547792] text-sm">Unable to load supply metrics</p>
      </div>
    );
  }

  // Extract totals from response
  const totals = data?.totals || {};
  const unsoldInventory = totals.unsoldInventory || 0;
  const upcomingLaunches = totals.upcomingLaunches || 0;
  const glsPipeline = totals.glsPipeline || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* KPI 1: Unsold Inventory */}
      <KPICard
        title="Unsold Inventory"
        subtitle="New launch units"
        value={formatUnits(unsoldInventory)}
        icon={<BuildingIcon />}
      />

      {/* KPI 2: Upcoming Launches */}
      <KPICard
        title="Upcoming Launches"
        subtitle={`${launchYear} pipeline`}
        value={formatUnits(upcomingLaunches)}
        icon={<RocketIcon />}
      />

      {/* KPI 3: GLS Pipeline */}
      <KPICard
        title="GLS Pipeline"
        subtitle="Open tenders"
        value={includeGls ? formatUnits(glsPipeline) : '—'}
        icon={<GlobeIcon />}
        variant={includeGls ? 'default' : 'muted'}
      />
    </div>
  );
}

export default SupplyKpiCards;
