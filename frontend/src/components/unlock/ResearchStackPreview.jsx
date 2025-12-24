/**
 * ResearchStackPreview - Flat 2.5D Overlap Layout
 *
 * NO 3D transforms. Simple flat overlapping cards for stable alignment.
 * - Card 1 (Hero): Center, z-30, full opacity
 * - Card 2 (Back Left): Peeking top-left, z-20, 60% opacity
 * - Card 3 (Back Right): Peeking bottom-right, z-10, 40% opacity
 *
 * Glass Material: slate-900/800, backdrop-blur-xl, white/10 borders
 * Color Rule: Only teal/cyan in charts. Everything else is white/grey/slate.
 */

export default function ResearchStackPreview() {
  return (
    // ===== THE STAGE (Centering Container) =====
    <div className="relative w-[580px] h-[420px] flex items-center justify-center group">

      {/* ===== CARD 3 (Back Right): Price Distribution ===== */}
      <div
        className="absolute w-[440px] h-[280px] rounded-[20px] overflow-hidden
                   bg-gradient-to-b from-slate-800/90 to-slate-800/70
                   border border-white/[0.08]
                   shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          bottom: '-30px',
          right: '-30px',
          zIndex: 10,
          opacity: 0.4,
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">Price Distribution</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          </div>
        </div>
        {/* Bar chart */}
        <div className="p-5">
          <svg className="w-full h-[180px]" viewBox="0 0 380 160">
            <line x1="20" y1="145" x2="360" y2="145" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
            <rect x="30" y="125" width="30" height="20" fill="rgba(34,211,238,0.25)" rx="4" />
            <rect x="72" y="105" width="30" height="40" fill="rgba(34,211,238,0.35)" rx="4" />
            <rect x="114" y="75" width="30" height="70" fill="rgba(34,211,238,0.45)" rx="4" />
            <rect x="156" y="45" width="30" height="100" fill="rgba(34,211,238,0.6)" rx="4" />
            <rect x="198" y="25" width="30" height="120" fill="rgba(103,232,249,0.75)" rx="4" />
            <rect x="240" y="50" width="30" height="95" fill="rgba(34,211,238,0.55)" rx="4" />
            <rect x="282" y="80" width="30" height="65" fill="rgba(34,211,238,0.4)" rx="4" />
            <rect x="324" y="110" width="30" height="35" fill="rgba(34,211,238,0.3)" rx="4" />
          </svg>
        </div>
      </div>

      {/* ===== CARD 2 (Back Left): Liquidity Map ===== */}
      <div
        className="absolute w-[440px] h-[280px] rounded-[20px] overflow-hidden
                   bg-gradient-to-b from-slate-800/90 to-slate-800/70
                   border border-white/[0.08]
                   shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          top: '-30px',
          left: '-30px',
          zIndex: 20,
          opacity: 0.6,
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Liquidity Heatmap</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          </div>
        </div>
        {/* Heatmap */}
        <div className="p-5">
          <svg className="w-full h-[180px]" viewBox="0 0 380 160">
            <defs>
              <radialGradient id="flatHeat1" cx="25%" cy="40%" r="35%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="flatHeat2" cx="65%" cy="55%" r="30%">
                <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="flatHeat3" cx="80%" cy="30%" r="25%">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.6" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="flatHeat4" cx="45%" cy="75%" r="28%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect width="100%" height="100%" fill="rgba(15,23,42,0.3)" rx="8" />
            <ellipse cx="95" cy="64" rx="70" ry="50" fill="url(#flatHeat1)" />
            <ellipse cx="247" cy="88" rx="60" ry="45" fill="url(#flatHeat2)" />
            <ellipse cx="304" cy="48" rx="45" ry="35" fill="url(#flatHeat3)" />
            <ellipse cx="171" cy="120" rx="55" ry="40" fill="url(#flatHeat4)" />
          </svg>
        </div>
      </div>

      {/* ===== CARD 1 (Hero): Market Pulse ===== */}
      <div
        className="relative w-[480px] rounded-[20px] overflow-hidden
                   bg-gradient-to-b from-slate-900/95 to-slate-900/85
                   backdrop-blur-xl
                   border border-white/[0.12]
                   ring-1 ring-inset ring-white/[0.06]
                   shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{ zIndex: 30 }}
      >
        {/* Preview Mode Pill */}
        <div className="absolute -top-3 left-5 z-40">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-white/15 rounded-full text-[10px] font-semibold text-slate-300 shadow-lg">
            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
            Preview Mode
          </span>
        </div>

        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">Market Pulse</h3>
            <p className="text-xs text-slate-500">Last 60 days · District-level data</p>
          </div>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* KPI Tiles */}
          <div className="flex gap-3 mb-5">
            <div className="flex-1 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Median PSF</div>
              <div className="text-xl font-bold text-white font-mono">$1,847</div>
            </div>
            <div className="flex-1 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Volume</div>
              <div className="text-xl font-bold text-white font-mono">1,284</div>
            </div>
            <div className="flex-1 bg-slate-800/50 rounded-xl px-4 py-3 border border-slate-700/40">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Days</div>
              <div className="text-xl font-bold text-cyan-400 font-mono">42</div>
            </div>
          </div>

          {/* Area Chart */}
          <div className="relative h-[120px] bg-slate-800/30 rounded-xl border border-slate-700/30 overflow-hidden">
            {/* Grid lines */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <line x1="0" y1="25%" x2="100%" y2="25%" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
              <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
            </svg>
            {/* Chart */}
            <svg className="w-full h-full" viewBox="0 0 420 120" preserveAspectRatio="none">
              <defs>
                <linearGradient id="flatAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,90 Q52,82 105,85 T210,70 T315,55 T420,60 L420,120 L0,120 Z"
                fill="url(#flatAreaGrad)"
              />
              <path
                d="M0,90 Q52,82 105,85 T210,70 T315,55 T420,60"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Data points */}
              <circle cx="105" cy="85" r="4" fill="#67e8f9" />
              <circle cx="210" cy="70" r="4" fill="#67e8f9" />
              <circle cx="315" cy="55" r="4" fill="#67e8f9" />
            </svg>
            {/* X-axis labels */}
            <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[10px] text-slate-600">
              <span>Oct</span>
              <span>Nov</span>
              <span>Dec</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
