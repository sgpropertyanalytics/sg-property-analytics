import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const OCEAN_BLUE = '#0ea5e9';

export function KPICards({ marketStats, priceTrends, volumeData }) {
  // Calculate metrics from data
  const medianPrice = marketStats?.median_price || 2410000;
  const priceChange = 3.2; // This would come from actual data comparison
  const psf = marketStats?.median_psf || 1823;
  const psfChange = 1.8;
  const transactions = volumeData?.reduce((sum, d) => sum + (d.total || 0), 0) || 1847;
  const txnChange = -12;
  const yoyChange = 5.2;

  const formatPrice = (value) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Median Price */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Median Price</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {formatPrice(medianPrice)} Median
        </div>
        <div className={cn(
          "flex items-center gap-1 text-sm font-medium",
          priceChange >= 0 ? "text-black" : "text-red-600"
        )}>
          {priceChange >= 0 ? (
            <ArrowUp className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )}
          {Math.abs(priceChange)}%
        </div>
      </div>

      {/* PSF */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Price Per Square Foot</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          ${psf.toLocaleString()} PSF
        </div>
        <div className={cn(
          "flex items-center gap-1 text-sm font-medium",
          psfChange >= 0 ? "text-black" : "text-red-600"
        )}>
          {psfChange >= 0 ? (
            <ArrowUp className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )}
          {Math.abs(psfChange)}%
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Transactions</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          {transactions.toLocaleString()} Txns
        </div>
        <div className={cn(
          "flex items-center gap-1 text-sm font-medium",
          txnChange >= 0 ? "text-black" : "text-red-600"
        )}>
          {txnChange >= 0 ? (
            <ArrowUp className="w-4 h-4" />
          ) : (
            <ArrowDown className="w-4 h-4" />
          )}
          {Math.abs(txnChange)}%
        </div>
      </div>

      {/* Year-over-Year */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="text-sm text-gray-600 mb-1">Year-over-Year</div>
        <div className="text-2xl font-bold text-gray-900 mb-2">
          +{yoyChange}% vs LY
        </div>
        <div className="text-sm text-gray-500">
          Compared to last year
        </div>
      </div>
    </div>
  );
}

