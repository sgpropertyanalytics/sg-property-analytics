import React, { useState } from 'react';
import FloorLiquidityChart from '../components/powerbi/FloorLiquidityChart';
import FloorPremiumByRegionChart from '../components/powerbi/FloorPremiumByRegionChart';
import FloorPremiumTrendChart from '../components/powerbi/FloorPremiumTrendChart';
import FloorLiquidityHeatmap from '../components/powerbi/FloorLiquidityHeatmap';

/**
 * Floor Dispersion Page - Floor Level Analysis
 *
 * Features:
 * - Floor Liquidity-Adjusted Price Curve (hero chart)
 * - Institutional-grade analysis: Price x Liquidity x Floor
 * - Inline filters for bedroom and market segment
 */

// Bedroom options
const BEDROOM_OPTIONS = [
  { value: '', label: 'All Bedrooms' },
  { value: '1', label: '1 BR' },
  { value: '2', label: '2 BR' },
  { value: '3', label: '3 BR' },
  { value: '4', label: '4 BR' },
  { value: '5', label: '5+ BR' },
];

// Market segment options
const SEGMENT_OPTIONS = [
  { value: '', label: 'All Segments' },
  { value: 'CCR', label: 'CCR (Core Central)' },
  { value: 'RCR', label: 'RCR (Rest of Central)' },
  { value: 'OCR', label: 'OCR (Outside Central)' },
];

export function FloorDispersionContent() {
  const [bedroom, setBedroom] = useState('');
  const [segment, setSegment] = useState('');

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Floor Dispersion
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            How floor level affects condo prices in Singapore
          </p>
        </div>

        {/* Page Summary */}
        <div className="mb-6 p-4 bg-gradient-to-r from-[#213448]/5 via-white to-[#547792]/5 rounded-xl border border-[#94B4C1]/30">
          <h2 className="text-sm font-bold text-[#213448] mb-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            What This Page Shows
          </h2>
          <p className="text-sm text-[#547792] leading-relaxed">
            Analyze how <span className="font-semibold text-[#213448]">floor level affects price</span> in
            Singapore condos. Higher floors typically command a premium due to views and prestige, but the size of
            this premium <span className="font-semibold text-[#213448]">varies by market segment</span> (CCR/RCR/OCR)
            and <span className="font-semibold text-[#213448]">changes over time</span>.
            Use the filters to focus on specific bedroom types or market segments.
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

        {/* Section: Primary Analysis */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-[#213448] rounded"></div>
            <span className="text-sm font-semibold text-[#213448] uppercase tracking-wide">
              Primary Analysis
            </span>
          </div>
          <FloorLiquidityChart
            height={420}
            bedroom={bedroom || undefined}
            segment={segment || undefined}
          />
        </div>

        {/* Section: Detailed Breakdowns */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 bg-[#547792] rounded"></div>
          <span className="text-sm font-semibold text-[#547792] uppercase tracking-wide">
            Detailed Breakdowns
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Floor Premium by Region - Comparison Chart */}
          <FloorPremiumByRegionChart
            height={320}
            bedroom={bedroom || undefined}
          />

          {/* Floor Premium Trend Chart */}
          <FloorPremiumTrendChart
            height={320}
            bedroom={bedroom || undefined}
            segment={segment || undefined}
          />
        </div>

        {/* Section: Project-Level Detail */}
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-[#94B4C1] rounded"></div>
            <span className="text-sm font-semibold text-[#94B4C1] uppercase tracking-wide">
              Project-Level Detail
            </span>
          </div>
          <FloorLiquidityHeatmap
            bedroom={bedroom || undefined}
            segment={segment || undefined}
          />
        </div>
      </div>
    </div>
  );
}

export default FloorDispersionContent;
