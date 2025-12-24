/**
 * ResearchStackPreview - Navy Crystal Vertical Stack
 *
 * Uses "Stage Container" strategy for perfect centering:
 * - Stage div with explicit dimensions contains all cards
 * - Cards positioned with bottom-X + left-1/2 + -translate-x-1/2
 * - All positions relative to Stage, not screen edge
 *
 * Glass Material: slate-900/800 gradients, backdrop-blur-xl, white/10 borders
 * Color Rule: Only teal/cyan in charts. Everything else is white/grey/slate.
 */

export default function ResearchStackPreview() {
  return (
    // ===== THE STAGE (Centering Container) =====
    <div className="relative w-[420px] h-[380px] group cursor-default">

      {/* ===== CARD 3 (Back Layer): Liquidity Overview ===== */}
      <div
        className="absolute left-1/2 w-[340px] h-[180px] rounded-[18px] overflow-hidden
                   bg-gradient-to-b from-slate-800/60 to-slate-800/40
                   backdrop-blur-xl
                   border border-white/[0.08]
                   ring-1 ring-inset ring-white/[0.03]
                   shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]
                   transition-all duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          bottom: '170px',
          zIndex: 10,
          transform: 'translateX(-50%) scale(0.82)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-500">Liquidity Overview</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
          </div>
        </div>
        {/* Bar chart silhouette */}
        <div className="p-3 opacity-50">
          <svg className="w-full h-[110px]" viewBox="0 0 300 100">
            <line x1="15" y1="90" x2="285" y2="90" stroke="rgba(148,163,184,0.1)" strokeWidth="1" />
            <rect x="25" y="65" width="24" height="25" fill="rgba(34,211,238,0.2)" rx="3" />
            <rect x="58" y="48" width="24" height="42" fill="rgba(34,211,238,0.25)" rx="3" />
            <rect x="91" y="32" width="24" height="58" fill="rgba(34,211,238,0.3)" rx="3" />
            <rect x="124" y="40" width="24" height="50" fill="rgba(34,211,238,0.25)" rx="3" />
            <rect x="157" y="22" width="24" height="68" fill="rgba(34,211,238,0.35)" rx="3" />
            <rect x="190" y="38" width="24" height="52" fill="rgba(34,211,238,0.25)" rx="3" />
            <rect x="223" y="55" width="24" height="35" fill="rgba(34,211,238,0.2)" rx="3" />
            <rect x="256" y="68" width="24" height="22" fill="rgba(34,211,238,0.15)" rx="3" />
          </svg>
        </div>
      </div>

      {/* ===== CARD 2 (Middle Layer): Price Distribution ===== */}
      <div
        className="absolute left-1/2 w-[340px] h-[180px] rounded-[18px] overflow-hidden
                   bg-gradient-to-b from-slate-800/75 to-slate-800/55
                   backdrop-blur-xl
                   border border-white/[0.10]
                   ring-1 ring-inset ring-white/[0.05]
                   shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)]
                   transition-all duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          bottom: '95px',
          zIndex: 20,
          transform: 'translateX(-50%) scale(0.91)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-slate-400">Price Distribution</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          </div>
        </div>
        {/* Histogram - teal only */}
        <div className="p-3">
          <svg className="w-full h-[115px]" viewBox="0 0 300 105">
            <line x1="15" y1="95" x2="285" y2="95" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
            <rect x="22" y="82" width="24" height="13" fill="rgba(34,211,238,0.3)" rx="3" />
            <rect x="52" y="68" width="24" height="27" fill="rgba(34,211,238,0.4)" rx="3" />
            <rect x="82" y="48" width="24" height="47" fill="rgba(34,211,238,0.5)" rx="3" />
            <rect x="112" y="28" width="24" height="67" fill="rgba(34,211,238,0.65)" rx="3" />
            <rect x="142" y="15" width="24" height="80" fill="rgba(103,232,249,0.8)" rx="3" />
            <rect x="172" y="32" width="24" height="63" fill="rgba(34,211,238,0.55)" rx="3" />
            <rect x="202" y="52" width="24" height="43" fill="rgba(34,211,238,0.4)" rx="3" />
            <rect x="232" y="72" width="24" height="23" fill="rgba(34,211,238,0.3)" rx="3" />
            <rect x="262" y="85" width="24" height="10" fill="rgba(34,211,238,0.2)" rx="3" />
            {/* Median line */}
            <line x1="154" y1="5" x2="154" y2="95" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6" />
          </svg>
        </div>
      </div>

      {/* ===== CARD 1 (Front Hero): Market Pulse ===== */}
      <div
        className="absolute left-1/2 w-[340px] rounded-[18px] overflow-hidden
                   bg-gradient-to-b from-slate-900/95 to-slate-900/80
                   backdrop-blur-xl
                   border border-white/[0.12]
                   ring-1 ring-inset ring-white/[0.08]
                   shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)]
                   transition-all duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          bottom: '0',
          zIndex: 30,
          transform: 'translateX(-50%)',
        }}
      >
        {/* Preview Mode Pill */}
        <div className="absolute -top-3 left-4 z-40">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-white/15 rounded-full text-[10px] font-semibold text-slate-300 shadow-lg">
            <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
            Preview Mode
          </span>
        </div>

        {/* Header */}
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Market Pulse</h3>
            <p className="text-[10px] text-slate-500">Last 60 days · District-level data</p>
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
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/40">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Median PSF</div>
              <div className="text-base font-bold text-white font-mono">$1,847</div>
            </div>
            <div className="flex-1 bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/40">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Volume</div>
              <div className="text-base font-bold text-white font-mono">1,284</div>
            </div>
            <div className="flex-1 bg-slate-800/50 rounded-lg px-2.5 py-2 border border-slate-700/40">
              <div className="text-[8px] text-slate-500 uppercase tracking-wider mb-0.5">Avg Days</div>
              <div className="text-base font-bold text-cyan-400 font-mono">42</div>
            </div>
          </div>

          {/* Area Chart - Teal only */}
          <div className="relative h-[72px] bg-slate-800/25 rounded-lg border border-slate-700/25 overflow-hidden">
            {/* Subtle grid */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <line x1="0" y1="33%" x2="100%" y2="33%" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
              <line x1="0" y1="66%" x2="100%" y2="66%" stroke="rgba(148,163,184,0.05)" strokeWidth="1" />
            </svg>
            {/* Chart */}
            <svg className="w-full h-full" viewBox="0 0 300 72" preserveAspectRatio="none">
              <defs>
                <linearGradient id="areaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,55 Q37,50 75,52 T150,42 T225,32 T300,36 L300,72 L0,72 Z"
                fill="url(#areaGrad)"
              />
              <path
                d="M0,55 Q37,50 75,52 T150,42 T225,32 T300,36"
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Data points */}
              <circle cx="75" cy="52" r="3" fill="#67e8f9" />
              <circle cx="150" cy="42" r="3" fill="#67e8f9" />
              <circle cx="225" cy="32" r="3" fill="#67e8f9" />
            </svg>
            {/* X-axis labels */}
            <div className="absolute bottom-1 left-2.5 right-2.5 flex justify-between text-[8px] text-slate-600">
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
