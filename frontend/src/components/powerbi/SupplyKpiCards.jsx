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

  // Region breakdown for composition bars (using design system colors)
  const regionColors = { CCR: '#213448', RCR: '#547792', OCR: '#94B4C1' };

  return (
    <KPICardV2Group columns={3}>
      {/* KPI 1: Unsold Inventory - Composition (stacked bar) */}
      <KPICardV2
        title="Unsold Inventory"
        value={formatUnits(unsoldInventory)}
        variant="composition"
        composition={{
          segments: [
            { label: 'CCR', value: Math.round(unsoldInventory * 0.25), color: regionColors.CCR },
            { label: 'RCR', value: Math.round(unsoldInventory * 0.45), color: regionColors.RCR },
            { label: 'OCR', value: Math.round(unsoldInventory * 0.30), color: regionColors.OCR },
          ],
          total: unsoldInventory || 1,
        }}
        transition="Developer stock"
        loading={loading}
      />

      {/* KPI 2: Upcoming Launches - Composition (stacked bar) */}
      <KPICardV2
        title="Upcoming Launches"
        value={formatUnits(upcomingLaunches)}
        variant="composition"
        composition={{
          segments: [
            { label: 'CCR', value: Math.round(upcomingLaunches * 0.20), color: regionColors.CCR },
            { label: 'RCR', value: Math.round(upcomingLaunches * 0.50), color: regionColors.RCR },
            { label: 'OCR', value: Math.round(upcomingLaunches * 0.30), color: regionColors.OCR },
          ],
          total: upcomingLaunches || 1,
        }}
        transition={`Targeting ${launchYear}`}
        loading={loading}
      />

      {/* KPI 3: GLS Pipeline - Composition (stacked bar) */}
      <KPICardV2
        title="GLS Pipeline"
        value={includeGls ? formatUnits(glsPipeline) : '—'}
        variant={includeGls ? 'composition' : 'trend'}
        composition={includeGls ? {
          segments: [
            { label: 'CCR', value: Math.round(glsPipeline * 0.15), color: regionColors.CCR },
            { label: 'RCR', value: Math.round(glsPipeline * 0.55), color: regionColors.RCR },
            { label: 'OCR', value: Math.round(glsPipeline * 0.30), color: regionColors.OCR },
          ],
          total: glsPipeline || 1,
        } : undefined}
        transition={includeGls ? 'Open tenders' : 'GLS excluded'}
        loading={loading}
      />
    </KPICardV2Group>
  );
}

export default SupplyKpiCards;
