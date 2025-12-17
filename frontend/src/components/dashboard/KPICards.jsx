import { formatPrice } from '../../constants';

// Note: ArrowUp, ArrowDown, and cn were removed as change indicators
// are not currently calculated from real data. Re-add when backend
// provides YoY comparison endpoint.

export function KPICards({ marketStats, priceTrends, volumeData }) {
  // Extract metrics from props - show actual data, not placeholders
  const medianPrice = marketStats?.median_price;
  const psf = marketStats?.median_psf;
  const transactions = volumeData?.reduce((sum, d) => sum + (d.total_quantity || d.total || 0), 0);

  // TODO: Implement real YoY change calculations
  // This requires comparing current period data with same period last year
  // Backend endpoint needed: /api/market_stats_comparison?period=yoy
  const hasChangeData = false; // Set to true when backend provides change data

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Median Price */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Median Price</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {medianPrice ? formatPrice(medianPrice) : '-'}
        </div>
        <div className="text-sm text-gray-500">
          Current median
        </div>
      </div>

      {/* PSF */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Price Per Square Foot</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {psf ? `$${psf.toLocaleString()}` : '-'}
        </div>
        <div className="text-sm text-gray-500">
          Current median PSF
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Total Transactions</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {transactions ? transactions.toLocaleString() : '-'}
        </div>
        <div className="text-sm text-gray-500">
          Selected period
        </div>
      </div>

      {/* Data Summary */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Data Coverage</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {volumeData?.length || 0} Districts
        </div>
        <div className="text-sm text-gray-500">
          With transaction data
        </div>
      </div>
    </div>
  );
}

