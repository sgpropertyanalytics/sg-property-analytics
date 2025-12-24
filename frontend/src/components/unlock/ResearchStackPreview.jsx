/**
 * ResearchStackPreview - Premium Analytical Dashboard Preview
 *
 * Design Principles:
 * - Strong visual hierarchy: Hero card commands focus, background cards whisper "context exists"
 * - Project color palette: Deep Navy (#213448), Ocean Blue (#547792), Sky Blue (#94B4C1)
 * - Sharper geometry for institutional/analytical feel
 * - Subtle effects - reduced glow, minimal shadows
 */

export default function ResearchStackPreview() {
  // Heatmap grid data - desaturated for background card
  const heatmapCells = [
    'bg-[#213448]', 'bg-[#2a4560]', 'bg-[#325575]', 'bg-[#3d6588]', 'bg-[#2a4560]', 'bg-[#213448]',
    'bg-[#2a4560]', 'bg-[#3d6588]', 'bg-[#547792]', 'bg-[#4a6d88]', 'bg-[#325575]', 'bg-[#2a4560]',
    'bg-[#325575]', 'bg-[#4a6d88]', 'bg-[#6a8fa8]', 'bg-[#547792]', 'bg-[#3d6588]', 'bg-[#213448]',
    'bg-[#213448]', 'bg-[#325575]', 'bg-[#4a6d88]', 'bg-[#3d6588]', 'bg-[#2a4560]', 'bg-[#213448]',
  ];

  // Bar chart heights (percentages) - some are outliers
  const barData = [
    { h: 25, highlight: false },
    { h: 45, highlight: false },
    { h: 65, highlight: false },
    { h: 85, highlight: true },
    { h: 95, highlight: true },
    { h: 75, highlight: false },
    { h: 55, highlight: false },
    { h: 40, highlight: true },
    { h: 30, highlight: false },
    { h: 20, highlight: false },
  ];

  return (
    // ===== THE STAGE (Column-Anchored Container) =====
    <div className="relative w-[560px] h-[420px] flex items-center justify-center group">

      {/* ===== CARD 3 (Back Right): Bar Chart ===== */}
      {/* Quieted: 35% opacity, subtle blur, desaturated */}
      <div
        className="absolute w-[420px] h-[260px] rounded-[14px] overflow-hidden
                   bg-gradient-to-b from-[#1a2d3d] to-[#162535]
                   border border-[#94B4C1]/10
                   shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-0.5"
        style={{
          bottom: '-35px',
          right: '-35px',
          zIndex: 10,
          opacity: 0.35,
          filter: 'blur(1px)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-[#94B4C1]/70">Volume Distribution</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#547792]/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#94B4C1]/60" />
          </div>
        </div>
        {/* Bar Chart */}
        <div className="p-4 h-[200px] flex flex-col">
          <div className="flex-1 flex items-end">
            <div className="flex items-end justify-between gap-1.5 w-full h-[150px] px-2">
              {barData.map((bar, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm ${
                    bar.highlight ? 'bg-[#94B4C1]/80' : 'bg-[#547792]/50'
                  }`}
                  style={{ height: `${bar.h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="h-[1px] bg-[#547792]/30 mt-2" />
        </div>
      </div>

      {/* ===== CARD 2 (Back Left): Heatmap Grid ===== */}
      {/* Quieted: 40% opacity, subtle blur, desaturated */}
      <div
        className="absolute w-[420px] h-[260px] rounded-[14px] overflow-hidden
                   bg-gradient-to-b from-[#1a2d3d] to-[#162535]
                   border border-[#94B4C1]/10
                   shadow-[0_20px_50px_-15px_rgba(0,0,0,0.4)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-0.5"
        style={{
          top: '-35px',
          left: '-35px',
          zIndex: 20,
          opacity: 0.4,
          filter: 'blur(1px)',
        }}
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
          <span className="text-[11px] font-medium text-[#94B4C1]/70">District Density</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#547792]/50" />
            <div className="w-1.5 h-1.5 rounded-full bg-[#94B4C1]/60" />
          </div>
        </div>
        {/* Heatmap Grid */}
        <div className="p-4">
          <div className="grid grid-cols-6 gap-1">
            {heatmapCells.map((color, i) => (
              <div
                key={i}
                className={`aspect-square rounded-sm ${color}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ===== CARD 1 (Hero): Market Pulse ===== */}
      {/* Sharper geometry, faint outer stroke, reduced effects */}
      <div
        className="relative w-[480px] rounded-[16px] overflow-hidden
                   bg-gradient-to-b from-[#1a2d3d] to-[#162535]
                   backdrop-blur-lg
                   border border-[#94B4C1]/15
                   ring-1 ring-[#547792]/10
                   shadow-[0_25px_60px_-20px_rgba(33,52,72,0.6)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{ zIndex: 30 }}
      >
        {/* Preview Mode Badge - Subtle system indicator */}
        <div className="absolute -top-2.5 left-4 z-40">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#162535] border border-[#547792]/20 rounded-full text-[9px] font-medium text-[#94B4C1]/60">
            <span className="w-1 h-1 bg-[#94B4C1]/50 rounded-full animate-pulse" />
            Preview
          </span>
        </div>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#547792]/15 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white/95">Market Pulse</h3>
            <p className="text-[11px] text-[#94B4C1]/60">Last 60 days · District-level</p>
          </div>
          <div className="flex gap-1">
            <div className="w-2 h-2 rounded-full bg-[#547792]/40" />
            <div className="w-2 h-2 rounded-full bg-[#547792]/60" />
            <div className="w-2 h-2 rounded-full bg-[#94B4C1]/70" />
          </div>
        </div>

        {/* Body */}
        <div className="p-5">
          {/* KPI Tiles - Improved scanability */}
          <div className="flex gap-2.5 mb-4">
            <div className="flex-1 bg-[#213448]/50 rounded-lg px-3.5 py-2.5 border border-[#547792]/20">
              <div className="text-[9px] text-[#94B4C1]/70 uppercase tracking-wider mb-0.5">Median PSF</div>
              <div className="text-lg font-semibold text-white/90 font-mono">$1,847</div>
            </div>
            <div className="flex-1 bg-[#213448]/50 rounded-lg px-3.5 py-2.5 border border-[#547792]/20">
              <div className="text-[9px] text-[#94B4C1]/70 uppercase tracking-wider mb-0.5">Volume</div>
              <div className="text-lg font-semibold text-white/90 font-mono">1,284</div>
            </div>
            <div className="flex-1 bg-[#213448]/50 rounded-lg px-3.5 py-2.5 border border-[#547792]/20">
              <div className="text-[9px] text-[#94B4C1]/70 uppercase tracking-wider mb-0.5">Avg Days</div>
              <div className="text-lg font-semibold text-[#94B4C1] font-mono">42</div>
            </div>
          </div>

          {/* Area Chart - Reduced glow for analytical feel */}
          <div className="relative h-[115px] bg-[#213448]/30 rounded-lg border border-[#547792]/15 overflow-hidden">
            {/* Grid lines */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <line x1="0" y1="25%" x2="100%" y2="25%" stroke="rgba(148,180,193,0.06)" strokeWidth="1" />
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(148,180,193,0.06)" strokeWidth="1" />
              <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(148,180,193,0.06)" strokeWidth="1" />
            </svg>
            {/* Chart */}
            <svg className="w-full h-full" viewBox="0 0 420 115" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#94B4C1" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#94B4C1" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,90 Q52,82 105,85 T210,70 T315,55 T420,60 L420,115 L0,115 Z"
                fill="url(#heroAreaGrad)"
              />
              <path
                d="M0,90 Q52,82 105,85 T210,70 T315,55 T420,60"
                fill="none"
                stroke="#94B4C1"
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Data points */}
              <circle cx="105" cy="85" r="3" fill="#94B4C1" />
              <circle cx="210" cy="70" r="3" fill="#94B4C1" />
              <circle cx="315" cy="55" r="3" fill="#94B4C1" />
            </svg>
            {/* X-axis labels */}
            <div className="absolute bottom-1.5 left-3 right-3 flex justify-between text-[9px] text-[#547792]/70">
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
