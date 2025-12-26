import React, { useState } from 'react';
import FloorLiquidityChart from '../components/powerbi/FloorLiquidityChart';
import FloorPremiumByRegionChart from '../components/powerbi/FloorPremiumByRegionChart';
import FloorPremiumTrendChart from '../components/powerbi/FloorPremiumTrendChart';
import FloorLiquidityHeatmap from '../components/powerbi/FloorLiquidityHeatmap';
import { ErrorBoundary, ChartWatermark } from '../components/ui';
// Desktop-first chart height with mobile guardrail
import { useChartHeight, MOBILE_CAPS } from '../hooks';
import { BEDROOM_FILTER_OPTIONS_EMPTY, SEGMENT_FILTER_OPTIONS } from '../constants';

/**
 * Floor Dispersion Page - Floor Level Analysis
 *
 * Features:
 * - Floor Liquidity-Adjusted Price Curve (hero chart)
 * - Institutional-grade analysis: Price x Liquidity x Floor
 * - Inline filters for bedroom and market segment
 */

// Use centralized filter options
const BEDROOM_OPTIONS = BEDROOM_FILTER_OPTIONS_EMPTY;
const SEGMENT_OPTIONS = SEGMENT_FILTER_OPTIONS;

export function FloorDispersionContent() {
  const [bedroom, setBedroom] = useState('');
  const [segment, setSegment] = useState('');

  // Desktop-first chart heights with mobile guardrails
  const heroChartHeight = useChartHeight(420, MOBILE_CAPS.tall);          // 420px desktop, max 320px mobile
  const secondaryChartHeight = useChartHeight(320, MOBILE_CAPS.standard); // 320px desktop, max 300px mobile

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Floor Dispersion
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Institutional-grade floor level analysis — where price meets liquidity
          </p>
        </div>

        {/* Inline Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Bedroom Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#547792]">Bedroom:</label>
            <select
              value={bedroom}
              onChange={(e) => setBedroom(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[#94B4C1]/50 rounded-lg bg-white text-[#213448] focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792]"
            >
              {BEDROOM_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Segment Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-[#547792]">Segment:</label>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="px-3 py-1.5 text-sm border border-[#94B4C1]/50 rounded-lg bg-white text-[#213448] focus:outline-none focus:ring-2 focus:ring-[#547792]/30 focus:border-[#547792]"
            >
              {SEGMENT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Reset Filters */}
          {(bedroom || segment) && (
            <button
              onClick={() => { setBedroom(''); setSegment(''); }}
              className="px-3 py-1.5 text-sm text-[#547792] hover:text-[#213448] hover:bg-[#EAE0CF]/50 rounded-lg transition-colors"
            >
              Reset Filters
            </button>
          )}

          {/* Active Filter Indicator */}
          {(bedroom || segment) && (
            <div className="ml-auto flex items-center gap-2 text-xs text-[#547792]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>
                {[
                  bedroom && BEDROOM_OPTIONS.find(o => o.value === bedroom)?.label,
                  segment && SEGMENT_OPTIONS.find(o => o.value === segment)?.label,
                ].filter(Boolean).join(' + ')}
              </span>
            </div>
          )}
        </div>

        {/* Floor Liquidity Chart - Hero Visualization */}
        <div className="mb-6">
          <ErrorBoundary name="Floor Liquidity Chart" compact>
            <ChartWatermark>
              <FloorLiquidityChart
                height={heroChartHeight}
                bedroom={bedroom || undefined}
                segment={segment || undefined}
              />
            </ChartWatermark>
          </ErrorBoundary>
        </div>

        {/* Secondary Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Floor Premium by Region - Comparison Chart */}
          <ErrorBoundary name="Floor Premium by Region" compact>
            <ChartWatermark>
              <FloorPremiumByRegionChart
                height={secondaryChartHeight}
                bedroom={bedroom || undefined}
              />
            </ChartWatermark>
          </ErrorBoundary>

          {/* Floor Premium Trend Chart */}
          <ErrorBoundary name="Floor Premium Trend" compact>
            <ChartWatermark>
              <FloorPremiumTrendChart
                height={secondaryChartHeight}
                bedroom={bedroom || undefined}
                segment={segment || undefined}
              />
            </ChartWatermark>
          </ErrorBoundary>
        </div>

        {/* Liquidity Heatmap - Full tower view */}
        <div className="mt-6">
          <ErrorBoundary name="Liquidity Heatmap" compact>
            <ChartWatermark>
              <FloorLiquidityHeatmap
                bedroom={bedroom || undefined}
                segment={segment || undefined}
              />
            </ChartWatermark>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default FloorDispersionContent;
