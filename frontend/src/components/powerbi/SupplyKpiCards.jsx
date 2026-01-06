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
 *
 * PERFORMANCE: Uses shared SupplyDataContext to eliminate duplicate API calls.
 * When useSharedContext=true (default), consumes data from SupplyDataProvider.
 */

import React from 'react';
import { useSupplyData } from '../../context/SupplyDataContext';
import { KPICardV2, KPICardV2Group } from '../ui';
import { SupplyField, getSupplyField } from '../../schemas/apiContract';

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
 * @param {boolean} [props.includeGls] - Whether to include GLS pipeline in the display (from context)
 * @param {number} [props.launchYear] - Year filter for upcoming launches (from context)
 */
export function SupplyKpiCards({
  // Props are kept for documentation but values come from shared context
  includeGls: _includeGls,
  launchYear: _launchYear,
}) {
  // Consume shared data from context (single fetch for all supply components)
  const { data, loading, error, includeGls, launchYear } = useSupplyData();

  // Extract totals from response
  const totals = getSupplyField(data, SupplyField.TOTALS) || {};
  const unsoldInventory = totals.unsoldInventory || 0;
  const upcomingLaunches = totals.upcomingLaunches || 0;
  const glsPipeline = totals.glsPipeline || 0;

  // Error state - show message
  if (error && !loading) {
    return (
      <div className="weapon-card p-4 text-center">
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
        transition="Developer stock"
        loading={loading}
      />

      {/* KPI 2: Upcoming Launches */}
      <KPICardV2
        title="Upcoming Launches"
        value={formatUnits(upcomingLaunches)}
        transition={`Targeting ${launchYear}`}
        loading={loading}
      />

      {/* KPI 3: GLS Pipeline */}
      <KPICardV2
        title="GLS Pipeline"
        value={includeGls ? formatUnits(glsPipeline) : '—'}
        transition={includeGls ? 'Open tenders' : 'GLS excluded'}
        loading={loading}
      />
    </KPICardV2Group>
  );
}

export default SupplyKpiCards;
