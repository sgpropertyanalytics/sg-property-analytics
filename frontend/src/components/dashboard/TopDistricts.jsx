import { cn } from '../../lib/utils';

const OCEAN_BLUE = '#0ea5e9';
const DISTRICT_NAMES = {
  'D10': 'Tanglin / Bukit Timah / Holland',
  'D09': 'Orchard / Somerset / River Valley',
  'D11': 'Newton / Novena / Dunearn / Watten',
  'D04': 'Harbourfront / Keppel / Telok Blangah',
};

export function TopDistricts({ marketStatsByDistrict }) {
  if (!marketStatsByDistrict?.by_district) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm font-medium text-gray-700 mb-3">Top Districts</div>
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  // Get top 3 districts by median price
  const districts = Object.entries(marketStatsByDistrict.by_district)
    .map(([district, stats]) => ({
      district,
      median: stats?.median_price || 0,
      name: DISTRICT_NAMES[district] || district,
    }))
    .sort((a, b) => b.median - a.median)
    .slice(0, 3);

  const maxPrice = Math.max(...districts.map(d => d.median), 1);

  const formatPrice = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-medium text-gray-700 mb-4">Top Districts</div>
      <div className="space-y-4">
        {districts.map(({ district, median, name }) => {
          const percentage = (median / maxPrice) * 100;
          return (
            <div key={district} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900">{district}:</span>
                <span className="font-semibold text-gray-900">{formatPrice(median)}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: OCEAN_BLUE,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

