import { motion } from 'framer-motion';
import { AlertTriangle, Activity } from 'lucide-react';

/**
 * "You vs Market" Hero Visual
 * Shows a price distribution with user position marker
 * Demonstrates the core value prop: "Are you overpaying?"
 */
export default function YouVsMarketVisual({ compact = false, fillHeight = false }) {
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

  const maxCount = Math.max(...distribution.map(d => d.count));
  const medianIndex = 3; // $1,800 is median
  const userIndex = 6; // User is at $1,950 (above median)
  const userPremium = 8; // 8% above median
  const transactionCount = 45;
  const isHighLiquidity = transactionCount >= 30;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className={`${compact ? "w-full" : "w-full max-w-2xl mx-auto"} ${fillHeight ? "h-full flex flex-col" : ""}`}
    >
      {/* Card container */}
      <div className={`relative bg-white rounded-2xl shadow-2xl shadow-[#213448]/20 border border-[#94B4C1]/30 overflow-hidden ${fillHeight ? "flex-1 flex flex-col" : ""}`}>

        {/* Header with Liquidity Badge */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-[#94B4C1]/20 bg-[#FDFBF7]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-[#94B4C1] uppercase tracking-wider font-semibold">
                  Price Analysis
                </span>
                {/* Liquidity Badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  isHighLiquidity
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  <Activity className="w-3 h-3" />
                  {isHighLiquidity ? 'High Liquidity' : 'Thin Market'}
                </span>
              </div>
              <div className="text-base sm:text-lg font-bold text-[#213448] truncate">
                The Continuum, D15
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-[10px] sm:text-xs text-[#94B4C1] uppercase tracking-wider font-semibold mb-1">
                Unit Type
              </div>
              <div className="text-xs sm:text-sm font-medium text-[#547792]">
                3BR • 1,100 sqft
              </div>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className={`px-4 sm:px-6 py-4 sm:py-6 ${fillHeight ? "flex-1 flex flex-col justify-center" : ""}`}>
          {/* Distribution bars */}
          <div className="flex items-end gap-2 h-36 mb-4">
            {distribution.map((bar, index) => {
              const heightPx = (bar.count / maxCount) * 128; // 128px max height
              const isMedian = index === medianIndex;
              const isUser = index === userIndex;

              return (
                <div key={bar.psf} className="flex-1 flex flex-col items-center justify-end h-full">
                  {/* User marker */}
                  {isUser && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1, duration: 0.5 }}
                      className="mb-1 flex flex-col items-center"
                    >
                      <div className="px-2 py-0.5 bg-[#213448] text-[#EAE0CF] text-[10px] font-bold rounded shadow-lg whitespace-nowrap">
                        YOU
                      </div>
                      <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#213448]" />
                    </motion.div>
                  )}

                  {/* Bar - use fixed pixel height for reliable animation */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: heightPx }}
                    transition={{ duration: 0.6, delay: 0.5 + index * 0.05 }}
                    className={`w-full rounded-t ${
                      isUser
                        ? 'bg-gradient-to-t from-[#213448] to-[#547792]'
                        : isMedian
                          ? 'bg-[#547792]'
                          : 'bg-[#94B4C1]/70'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels - show only key values */}
          <div className="flex justify-between mb-4 text-[10px] text-[#94B4C1]">
            <span>$1,650</span>
            <span className="text-[#547792] font-medium">$1,800 (median)</span>
            <span className="text-[#213448] font-bold">$1,950 (you)</span>
            <span>$2,000</span>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mb-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#94B4C1]/70" />
              <span className="text-[#94B4C1]">Other buyers</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#547792]" />
              <span className="text-[#547792]">Market median</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#213448]" />
              <span className="text-[#213448] font-medium">Your unit</span>
            </div>
          </div>

          {/* Verdict */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.2, duration: 0.4 }}
            className="p-4 rounded-xl bg-amber-50 border border-amber-200"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <div className="font-bold text-[#213448] mb-1">
                  Priced {userPremium}% Above Market
                </div>
                <div className="text-sm text-[#547792]">
                  Recent buyers in this project paid $1,800 PSF on average.
                  <span className="text-[#213448] font-medium"> Consider negotiating.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2 sm:py-3 bg-[#FDFBF7] border-t border-[#94B4C1]/20">
          <div className="flex items-center justify-between text-[10px] sm:text-xs text-[#94B4C1]">
            <span>Based on {transactionCount} transactions (last 12 months)</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live data
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
