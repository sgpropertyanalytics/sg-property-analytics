/**
 * ResearchStackPreview - Navy Crystal Vertical Stack
 *
 * 3 dashboard cards stacked vertically like thick frosted dark glass.
 * Professional financial terminal aesthetic - NO rainbow colors.
 *
 * Glass Material:
 * - Background: slate-900/80 to slate-900/40 gradient
 * - Backdrop blur: xl (heavy frosted look)
 * - Border: white/10 (crisp edge)
 * - Ring: inset white/10 (top bevel)
 * - Shadow: deep soft separation
 *
 * Color Rule: Only teal/cyan in charts. Everything else is white/grey/slate.
 */

export default function ResearchStackPreview() {
  return (
    <div
      className="relative w-full h-[420px] flex items-end justify-center"
      style={{
        perspective: '2000px',
      }}
    >
      {/* Stack Container with perspective tilt */}
      <div
        className="relative w-[360px] group"
        style={{
          transform: 'rotateX(10deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* ===== CARD 3 (Back Layer): Liquidity Overview ===== */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-full rounded-[20px] overflow-hidden
                     bg-gradient-to-b from-slate-800/70 to-slate-800/50
                     backdrop-blur-xl
                     border border-white/10
                     ring-1 ring-inset ring-white/5
                     shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]
                     transition-transform duration-300 ease-out group-hover:-translate-y-1"
          style={{
            bottom: '192px',
            height: '200px',
            zIndex: 10,
            transform: 'translateX(-50%) scale(0.90)',
          }}
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Liquidity Overview</span>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            </div>
          </div>
          {/* Blurred bar chart silhouette */}
          <div className="p-4 opacity-60">
            <svg className="w-full h-[130px]" viewBox="0 0 320 120">
              <line x1="20" y1="105" x2="300" y2="105" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
              <rect x="35" y="75" width="28" height="30" fill="rgba(34,211,238,0.2)" rx="4" />
              <rect x="75" y="55" width="28" height="50" fill="rgba(34,211,238,0.25)" rx="4" />
              <rect x="115" y="35" width="28" height="70" fill="rgba(34,211,238,0.3)" rx="4" />
              <rect x="155" y="45" width="28" height="60" fill="rgba(34,211,238,0.25)" rx="4" />
              <rect x="195" y="25" width="28" height="80" fill="rgba(34,211,238,0.35)" rx="4" />
              <rect x="235" y="50" width="28" height="55" fill="rgba(34,211,238,0.25)" rx="4" />
              <rect x="275" y="70" width="28" height="35" fill="rgba(34,211,238,0.2)" rx="4" />
            </svg>
          </div>
        </div>

        {/* ===== CARD 2 (Middle Layer): Price Distribution ===== */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-full rounded-[20px] overflow-hidden
                     bg-gradient-to-b from-slate-800/80 to-slate-800/60
                     backdrop-blur-xl
                     border border-white/10
                     ring-1 ring-inset ring-white/5
                     shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]
                     transition-transform duration-300 ease-out group-hover:-translate-y-1"
          style={{
            bottom: '96px',
            height: '200px',
            zIndex: 20,
            transform: 'translateX(-50%) scale(0.95)',
          }}
        >
          {/* Header */}
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Price Distribution</span>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
              <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            </div>
          </div>
          {/* Histogram - teal only */}
          <div className="p-4">
            <svg className="w-full h-[130px]" viewBox="0 0 320 120">
              <line x1="20" y1="105" x2="300" y2="105" stroke="rgba(148,163,184,0.2)" strokeWidth="1" />
              {/* Histogram bars */}
              <rect x="30" y="90" width="26" height="15" fill="rgba(34,211,238,0.35)" rx="3" />
              <rect x="64" y="72" width="26" height="33" fill="rgba(34,211,238,0.45)" rx="3" />
              <rect x="98" y="50" width="26" height="55" fill="rgba(34,211,238,0.55)" rx="3" />
              <rect x="132" y="28" width="26" height="77" fill="rgba(34,211,238,0.7)" rx="3" />
              <rect x="166" y="18" width="26" height="87" fill="rgba(103,232,249,0.85)" rx="3" />
              <rect x="200" y="35" width="26" height="70" fill="rgba(34,211,238,0.6)" rx="3" />
              <rect x="234" y="58" width="26" height="47" fill="rgba(34,211,238,0.45)" rx="3" />
              <rect x="268" y="80" width="26" height="25" fill="rgba(34,211,238,0.3)" rx="3" />
              {/* Median line */}
              <line x1="179" y1="8" x2="179" y2="105" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.7" />
            </svg>
          </div>
        </div>

        {/* ===== CARD 1 (Front Hero): Market Pulse ===== */}
        <div
          className="relative w-full rounded-[20px] overflow-hidden
                     bg-gradient-to-b from-slate-900/90 to-slate-900/70
                     backdrop-blur-xl
                     border border-white/10
                     ring-1 ring-inset ring-white/10
                     shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)]
                     transition-transform duration-300 ease-out group-hover:-translate-y-1"
          style={{
            height: '220px',
            zIndex: 30,
          }}
        >
          {/* Preview Mode Pill */}
          <div className="absolute -top-3 left-5 z-40">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900/95 border border-white/20 rounded-full text-[10px] font-semibold text-slate-300 shadow-lg">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              Preview Mode
            </span>
          </div>

          {/* Header */}
          <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Market Pulse</h3>
              <p className="text-[11px] text-slate-500">Last 60 days · District-level data</p>
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-slate-600" />
              <div className="w-2 h-2 rounded-full bg-slate-500" />
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
          </div>

          {/* Body */}
          <div className="p-4">
            {/* KPI Tiles */}
            <div className="flex gap-2.5 mb-4">
              <div className="flex-1 bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Median PSF</div>
                <div className="text-lg font-bold text-white font-mono">$1,847</div>
              </div>
              <div className="flex-1 bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Volume</div>
                <div className="text-lg font-bold text-white font-mono">1,284</div>
              </div>
              <div className="flex-1 bg-slate-800/60 rounded-lg px-3 py-2.5 border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">Avg Days</div>
                <div className="text-lg font-bold text-cyan-400 font-mono">42</div>
              </div>
            </div>

            {/* Area Chart - Teal only */}
            <div className="relative h-[80px] bg-slate-800/30 rounded-lg border border-slate-700/30 overflow-hidden">
              {/* Subtle grid */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="25%" x2="100%" y2="25%" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
                <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
              </svg>
              {/* Chart */}
              <svg className="w-full h-full" viewBox="0 0 320 80" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="navyAreaFill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,60 Q40,55 80,57 T160,48 T240,38 T320,42 L320,80 L0,80 Z"
                  fill="url(#navyAreaFill)"
                />
                <path
                  d="M0,60 Q40,55 80,57 T160,48 T240,38 T320,42"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Data points */}
                <circle cx="80" cy="57" r="3.5" fill="#67e8f9" />
                <circle cx="160" cy="48" r="3.5" fill="#67e8f9" />
                <circle cx="240" cy="38" r="3.5" fill="#67e8f9" />
              </svg>
              {/* X-axis labels */}
              <div className="absolute bottom-1.5 left-3 right-3 flex justify-between text-[9px] text-slate-600">
                <span>Oct</span>
                <span>Nov</span>
                <span>Dec</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
