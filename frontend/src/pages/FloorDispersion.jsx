import React from 'react';
import { usePowerBIFilters } from '../context/PowerBIFilterContext';
import FloorLiquidityChart from '../components/powerbi/FloorLiquidityChart';

/**
 * Floor Dispersion Page - Floor Level Analysis
 *
 * Features:
 * - Floor Liquidity-Adjusted Price Curve (hero chart)
 * - Institutional-grade analysis: Price x Liquidity x Floor
 * - Statistical confidence indicators
 */
export function FloorDispersionContent() {
  const { filters, activeFilterCount } = usePowerBIFilters();

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
          {activeFilterCount > 0 && (
            <div className="mt-2 inline-flex items-center gap-2 bg-[#547792]/10 text-[#547792] px-3 py-1.5 rounded-lg text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <span>{activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active</span>
            </div>
          )}
        </div>

        {/* Floor Liquidity Chart - Hero Visualization */}
        <div className="mb-6">
          <FloorLiquidityChart height={420} />
        </div>

        {/* Future Charts Placeholder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#547792]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-[#213448]">Floor Premium by Region</h3>
                <p className="text-xs text-[#547792]">Coming soon</p>
              </div>
            </div>
            <div className="h-48 flex items-center justify-center bg-[#EAE0CF]/20 rounded-lg">
              <span className="text-[#94B4C1] text-sm">CCR vs RCR vs OCR comparison</span>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-[#94B4C1]/30 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#547792]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#547792]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-[#213448]">Floor Premium Trend</h3>
                <p className="text-xs text-[#547792]">Coming soon</p>
              </div>
            </div>
            <div className="h-48 flex items-center justify-center bg-[#EAE0CF]/20 rounded-lg">
              <span className="text-[#94B4C1] text-sm">Historical premium evolution</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FloorDispersionContent;
