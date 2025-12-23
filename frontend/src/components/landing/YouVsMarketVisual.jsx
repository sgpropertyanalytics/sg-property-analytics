import { motion } from 'framer-motion';
import { TrendingDown, AlertTriangle } from 'lucide-react';

/**
 * "You vs Market" Hero Visual
 * Shows a price distribution with user position marker
 * Demonstrates the core value prop: "Are you overpaying?"
 */
export default function YouVsMarketVisual() {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
      className="w-full max-w-2xl mx-auto"
    >
      {/* Card container */}
      <div className="relative bg-white rounded-2xl shadow-2xl shadow-[#213448]/15 border border-[#94B4C1]/30 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-[#94B4C1]/20 bg-[#FDFBF7]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#94B4C1] uppercase tracking-wider font-semibold mb-1">
                Price Analysis
              </div>
              <div className="text-lg font-bold text-[#213448]">
                The Continuum, D15
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#94B4C1] uppercase tracking-wider font-semibold mb-1">
                Unit Type
              </div>
              <div className="text-sm font-medium text-[#547792]">
                3BR • 1,100 sqft
              </div>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="px-6 py-6">
          {/* Distribution bars */}
          <div className="flex items-end gap-1.5 h-32 mb-4">
            {distribution.map((bar, index) => {
              const height = (bar.count / maxCount) * 100;
              const isMedian = index === medianIndex;
              const isUser = index === userIndex;

              return (
                <div key={bar.psf} className="flex-1 flex flex-col items-center">
                  {/* User marker */}
                  {isUser && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1, duration: 0.5 }}
                      className="mb-2 flex flex-col items-center"
                    >
                      <div className="px-2 py-1 bg-[#213448] text-[#EAE0CF] text-[10px] font-bold rounded-md shadow-lg whitespace-nowrap">
                        YOU
                      </div>
                      <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[#213448]" />
                    </motion.div>
                  )}

                  {/* Bar */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.6, delay: 0.5 + index * 0.05 }}
                    className={`w-full rounded-t-sm ${
                      isUser
                        ? 'bg-gradient-to-t from-[#213448] to-[#547792]'
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
          <div className="flex gap-1.5 mb-6">
            {distribution.map((bar, index) => (
              <div key={bar.psf} className="flex-1 text-center">
                <span className={`text-[9px] ${
                  index === userIndex
                    ? 'text-[#213448] font-bold'
                    : index === medianIndex
                      ? 'text-[#547792] font-medium'
                      : 'text-[#94B4C1]'
                }`}>
                  {bar.label}
                </span>
              </div>
            ))}
          </div>

          {/* Median line label */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#547792]" />
              <span className="text-xs text-[#547792]">Market Median: $1,800 PSF</span>
            </div>
            <div className="flex items-center gap-1.5 ml-4">
              <div className="w-3 h-3 rounded-sm bg-[#213448]" />
              <span className="text-xs text-[#213448] font-medium">Your Unit: $1,950 PSF</span>
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
        <div className="px-6 py-3 bg-[#FDFBF7] border-t border-[#94B4C1]/20">
          <div className="flex items-center justify-between text-xs text-[#94B4C1]">
            <span>Based on 45 transactions (last 12 months)</span>
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
