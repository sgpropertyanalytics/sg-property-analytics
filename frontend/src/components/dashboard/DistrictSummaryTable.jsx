import { useState } from 'react';
import { ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const OCEAN_BLUE = '#0ea5e9';
const DISTRICT_NAMES = {
  'D04': 'Harbourfront / Keppel / Telok Blangah',
  'D10': 'Tanglin / Bukit Timah / Holland',
  'D09': 'Orchard / Somerset / River Valley',
  'D11': 'Newton / Novena / Dunearn / Watten',
};

export function DistrictSummaryTable({ marketStatsByDistrict, onDistrictClick }) {
  if (!marketStatsByDistrict?.by_district) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-500">Loading district data...</div>
      </div>
    );
  }

  const districts = Object.entries(marketStatsByDistrict.by_district)
    .map(([district, stats]) => {
      const shortTerm = stats?.short_term || {};
      const median = shortTerm.median_price || 0;
      const p25 = shortTerm.p25_price || 0;
      const p75 = shortTerm.p75_price || 0;
      const trend = shortTerm.trend || 0; // Percentage change
      
      return {
        district,
        name: DISTRICT_NAMES[district] || district,
        p25,
        median,
        p75,
        trend,
      };
    })
    .filter(d => d.median > 0)
    .sort((a, b) => b.median - a.median);

  const formatPrice = (value) => {
    if (!value) return '-';
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">District</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">25th</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Median</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">75th</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Trend</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {districts.map(({ district, name, p25, median, p75, trend }) => (
              <tr
                key={district}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onDistrictClick?.(district)}
              >
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <ChevronRight className="w-3 h-3 text-gray-400" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">{district}</div>
                      <div className="text-xs text-gray-500 truncate max-w-[200px]">{name}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {formatPrice(p25)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900">
                  {formatPrice(median)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {formatPrice(p75)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-medium",
                    trend >= 0 ? "text-black" : "text-red-600"
                  )}>
                    {trend >= 0 ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : (
                      <ArrowDown className="w-3 h-3" />
                    )}
                    {Math.abs(trend).toFixed(1)}%
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

