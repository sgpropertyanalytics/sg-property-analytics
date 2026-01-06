import { motion } from 'framer-motion';
import { AlertTriangle, Activity } from 'lucide-react';

/**
 * "You vs Market" Hero Visual - Industrial / Technical Brutalism
 *
 * Redesigned as a technical spec sheet:
 * - Hard edges, no rounded corners
 * - Registration marks
 * - Stencil-style labels
 * - Warning box verdict
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

  // Industrial animation preset
  const industrialTransition = { duration: 0.15, ease: 'linear' };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={industrialTransition}
      className={`${compact ? "w-full" : "w-full max-w-2xl mx-auto"} ${fillHeight ? "h-full flex flex-col" : ""}`}
    >
      {/* Card container - Industrial spec sheet style */}
      <div className={`relative bg-[var(--color-paper)] border-2 border-[var(--color-ink)]/15 shadow-hard overflow-visible ${fillHeight ? "flex-1 flex flex-col" : ""}`}>

        {/* Registration marks */}
        <div className="absolute -top-[2px] -left-[2px] w-3 h-3 border-t border-l border-[var(--color-ink)]/30" />
        <div className="absolute -bottom-[2px] -right-[2px] w-3 h-3 border-b border-r border-[var(--color-ink)]/30" />

        {/* Floating Insight Annotation - desktop only */}
        <div className="absolute -right-4 top-10 bg-[var(--color-paper)] border-2 border-dashed border-[var(--color-vermillion)] p-3 max-w-[180px] z-20 hidden md:block shadow-hard-sm">
          <div className="font-brand text-[10px] font-bold text-[var(--color-vermillion)] mb-1 uppercase tracking-wider">
            CAUTION: GAP ANALYSIS
          </div>
          <p className="font-data-dense text-[10px] text-[var(--color-ink-light)] leading-tight">
            Is your unit priced above the district median? Check the gap here.
          </p>
        </div>

        {/* Header with Liquidity Badge */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b-2 border-[var(--color-ink)]/10 bg-[var(--color-paper-dark)]">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-brand text-[10px] text-[var(--color-ink-muted)] uppercase tracking-[0.15em] font-bold">
                  SPEC: PRICE ANALYSIS
                </span>
                {/* Liquidity Badge - Industrial style */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 font-brand text-[10px] font-bold uppercase tracking-wider border ${
                  isHighLiquidity
                    ? 'bg-[var(--color-olive)]/10 text-[var(--color-olive)] border-[var(--color-olive)]'
                    : 'bg-[var(--color-vermillion)]/10 text-[var(--color-vermillion)] border-[var(--color-vermillion)]'
                }`}>
                  <Activity className="w-3 h-3" />
                  {isHighLiquidity ? 'HIGH LIQ' : 'THIN MKT'}
                </span>
              </div>
              <div className="font-brand text-base sm:text-lg font-bold text-[var(--color-ink)] uppercase truncate">
                The Continuum, D15
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="font-brand text-[10px] text-[var(--color-ink-muted)] uppercase tracking-[0.15em] font-bold mb-1">
                UNIT TYPE
              </div>
              <div className="font-data-dense text-xs sm:text-sm text-[var(--color-ink-light)]">
                3BR / 1,100 SQFT
              </div>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className={`px-4 sm:px-6 py-4 sm:py-6 ${fillHeight ? "flex-1 flex flex-col justify-center" : ""}`}>
          {/* Distribution bars - Hard edges, no rounded corners */}
          <div className="flex items-end gap-2 h-36 mb-4">
            {distribution.map((bar, index) => {
              const heightPx = (bar.count / maxCount) * 128;
              const isMedian = index === medianIndex;
              const isUser = index === userIndex;

              return (
                <div key={bar.psf} className="flex-1 flex flex-col items-center justify-end h-full">
                  {/* User marker - Industrial style */}
                  {isUser && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3, ...industrialTransition }}
                      className="mb-1 flex flex-col items-center"
                    >
                      <div className="px-2 py-0.5 bg-[var(--color-vermillion)] text-[var(--color-paper)] font-brand text-[10px] font-bold uppercase shadow-hard-sm">
                        YOU
                      </div>
                      <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-[var(--color-vermillion)]" />
                    </motion.div>
                  )}

                  {/* Bar - Hard edges, no gradients */}
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: heightPx }}
                    transition={{ duration: 0.2, delay: 0.1 + index * 0.02 }}
                    className={`w-full ${
                      isUser
                        ? 'bg-[var(--color-vermillion)]'
                        : isMedian
                          ? 'bg-[var(--color-ink)]'
                          : 'bg-[var(--color-ink)]/30'
                    }`}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between mb-4 font-data-dense text-[10px] text-[var(--color-ink-muted)]">
            <span>$1,650</span>
            <span className="text-[var(--color-ink)] font-bold">$1,800 (MEDIAN)</span>
            <span className="text-[var(--color-vermillion)] font-bold">$1,950 (YOU)</span>
            <span>$2,000</span>
          </div>

          {/* Legend - Industrial style */}
          <div className="flex flex-wrap items-center gap-4 mb-4 font-brand text-[10px] uppercase tracking-wider">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[var(--color-ink)]/30" />
              <span className="text-[var(--color-ink-muted)]">Others</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[var(--color-ink)]" />
              <span className="text-[var(--color-ink-muted)]">Median</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 bg-[var(--color-vermillion)]" />
              <span className="text-[var(--color-ink)]">Your Unit</span>
            </div>
          </div>

          {/* Verdict - Warning box style */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, ...industrialTransition }}
            className="p-4 border-2 border-[var(--color-vermillion)] bg-[var(--color-vermillion)]/5"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 bg-[var(--color-vermillion)] text-[var(--color-paper)]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="font-brand font-bold text-[var(--color-ink)] uppercase">
                  CAUTION: PRICED {userPremium}% ABOVE MARKET
                </div>
                <div className="font-data-dense text-sm text-[var(--color-ink-light)] mt-1">
                  Recent buyers in this project paid $1,800 PSF on average.
                  <span className="font-bold text-[var(--color-ink)]"> CONSIDER NEGOTIATING.</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-2 sm:py-3 bg-[var(--color-paper-dark)] border-t-2 border-[var(--color-ink)]/10">
          <div className="flex items-center justify-between font-brand text-[10px] text-[var(--color-ink-muted)] uppercase tracking-wider">
            <span>BASED ON {transactionCount} TRANSACTIONS (12M)</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-[var(--color-olive)]" />
              LIVE DATA
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
