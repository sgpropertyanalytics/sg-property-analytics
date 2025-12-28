import { motion } from 'framer-motion';
import { AlertTriangle, Activity } from 'lucide-react';

/**
 * "You vs Market" Hero Visual - Editorial Style
 * Shows a price distribution with user position marker
 * Demonstrates the core value prop: "Are you overpaying?"
 */
export default function YouVsMarketVisual({ compact = false }) {
  // Simulated price distribution data (PSF values)
  const distribution = [
    { psf: 1650, count: 2, label: '$1,650' },
    { psf: 1700, count: 5, label: '$1,700' },
    { psf: 1750, count: 12, label: '$1,750' },
    { psf: 1800, count: 18, label: '$1,800' },
    { psf: 1850, count: 15, label: '$1,850' },
    { psf: 1900, count: 8, label: '$1,900' },
    { psf: 1950, count: 4, label: '$1,950' },
    { psf: 2000, count: 2, label: '$2,000' },
  ];

  const maxCount = Math.max(...distribution.map((d) => d.count));
  const medianIndex = 3; // $1,800 is median
  const userIndex = 6; // User is at $1,950 (above median)
  const userPremium = 8; // 8% above median
  const transactionCount = 45;
  const isHighLiquidity = transactionCount >= 30;

  return (
    <div className={`${compact ? 'w-full' : 'w-full max-w-2xl mx-auto'}`}>
      {/* Card container - Editorial style with subtle border */}
      <div className="relative bg-white rounded-xl border border-[#94B4C1]/30 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#94B4C1]/20 bg-[#FDFBF7]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="stat-label text-[10px]">Price Analysis</span>
                {/* Liquidity Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isHighLiquidity
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  {isHighLiquidity ? 'High Liquidity' : 'Thin Market'}
                </span>
              </div>
              <div className="font-display text-lg font-semibold text-[#213448]">
                The Continuum, D15
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="stat-label text-[10px] mb-1">Unit Type</div>
              <div className="text-sm font-medium text-[#547792]">
                3BR &bull; 1,100 sqft
              </div>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="px-5 py-5">
          {/* Distribution bars */}
          <div className="flex items-end gap-1.5 h-32 mb-3">
            {distribution.map((bar, index) => {
              const heightPx = (bar.count / maxCount) * 112;
              const isMedian = index === medianIndex;
              const isUser = index === userIndex;

              return (
                <div
                  key={bar.psf}
                  className="flex-1 flex flex-col items-center justify-end h-full"
                >
                  {/* User marker */}
                  {isUser && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8, duration: 0.4 }}
                      className="mb-1 flex flex-col items-center"
                    >
                      <div className="px-2 py-0.5 bg-[#213448] text-[#EAE0CF] text-[9px] font-bold rounded">
                        YOU
                      </div>
                      <div className="w-0 h-0 border-l-4 border-r-4 border-t-5 border-l-transparent border-r-transparent border-t-[#213448]" />
                    </motion.div>
                  )}

                  {/* Bar */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: heightPx }}
                    transition={{ duration: 0.5, delay: 0.3 + index * 0.04 }}
                    className={`w-full rounded-t transition-colors ${
                      isUser
                        ? 'bg-[#213448]'
                        : isMedian
                          ? 'bg-[#547792]'
                          : 'bg-[#94B4C1]/60'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between mb-4 text-[10px] text-[#547792]">
            <span>$1,650</span>
            <span className="font-medium">$1,800 (median)</span>
            <span className="text-[#213448] font-semibold">$1,950 (you)</span>
            <span>$2,000</span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#94B4C1]/60" />
              <span className="text-[#547792]">Other buyers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#547792]" />
              <span className="text-[#547792]">Market median</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm bg-[#213448]" />
              <span className="text-[#213448] font-medium">Your unit</span>
            </div>
          </div>

          {/* Verdict - Editorial style */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.4 }}
            className="p-4 rounded-lg bg-amber-50 border border-amber-200"
          >
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-md bg-amber-100">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <div className="font-display font-semibold text-[#213448] mb-0.5">
                  Priced {userPremium}% Above Market
                </div>
                <div className="text-sm text-[#547792] leading-relaxed">
                  Recent buyers paid $1,800 PSF on average.
                  <span className="text-[#213448] font-medium">
                    {' '}
                    Consider negotiating.
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#FDFBF7] border-t border-[#94B4C1]/20">
          <div className="flex items-center justify-between text-[10px] text-[#547792]">
            <span>Based on {transactionCount} transactions (12 months)</span>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live data
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
