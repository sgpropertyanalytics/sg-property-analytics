/**
 * ResearchStackPreview - Flat 2.5D Overlap with High-Fidelity Geometrics
 *
 * NO blurry blobs. Sharp, crisp geometric data shapes.
 * - Heatmap: CSS Grid of colored squares (density map)
 * - Bar Chart: Clean vertical bars with outlier highlights
 * - Hero: Full Market Pulse dashboard
 *
 * Color Rule: Only teal/cyan in charts. Everything else is white/grey/slate.
 */

export default function ResearchStackPreview() {
  // Heatmap grid data - mix of intensities
  const heatmapCells = [
    'bg-slate-800', 'bg-teal-900', 'bg-teal-800', 'bg-teal-700', 'bg-teal-900', 'bg-slate-800',
    'bg-teal-900', 'bg-teal-700', 'bg-teal-500', 'bg-teal-600', 'bg-teal-800', 'bg-teal-900',
    'bg-teal-800', 'bg-teal-600', 'bg-teal-400', 'bg-teal-500', 'bg-teal-700', 'bg-slate-800',
    'bg-slate-800', 'bg-teal-800', 'bg-teal-600', 'bg-teal-700', 'bg-teal-900', 'bg-slate-800',
  ];

  // Bar chart heights (percentages) - some are outliers
  const barData = [
    { h: 25, highlight: false },
    { h: 45, highlight: false },
    { h: 65, highlight: false },
    { h: 85, highlight: true },  // outlier
    { h: 95, highlight: true },  // outlier
    { h: 75, highlight: false },
    { h: 55, highlight: false },
    { h: 40, highlight: true },  // outlier
    { h: 30, highlight: false },
    { h: 20, highlight: false },
  ];

  return (
    // ===== THE STAGE (Centering Container) =====
    <div className="relative w-[600px] h-[450px] flex items-center justify-center group">

      {/* ===== CARD 3 (Back Right): Bar Chart - Geometric ===== */}
      <div
        className="absolute w-[460px] h-[300px] rounded-[20px] overflow-hidden
                   bg-gradient-to-b from-slate-800 to-slate-900
                   border border-white/[0.10]
                   shadow-[0_25px_70px_-15px_rgba(0,0,0,0.6)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          bottom: '-50px',
          right: '-50px',
          zIndex: 10,
          opacity: 0.7,
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Volume Distribution</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500" />
          </div>
        </div>
        {/* Geometric Bar Chart */}
        <div className="p-5 h-[240px] flex flex-col">
          {/* Y-axis labels */}
          <div className="flex-1 flex items-end">
            <div className="flex items-end justify-between gap-2 w-full h-[180px] px-2">
              {barData.map((bar, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-t-sm transition-colors ${
                    bar.highlight ? 'bg-teal-400' : 'bg-teal-800'
                  }`}
                  style={{ height: `${bar.h}%` }}
                />
              ))}
            </div>
          </div>
          {/* X-axis line */}
          <div className="h-[1px] bg-slate-700 mt-2" />
        </div>
      </div>

      {/* ===== CARD 2 (Back Left): Heatmap Grid - Geometric ===== */}
      <div
        className="absolute w-[460px] h-[300px] rounded-[20px] overflow-hidden
                   bg-gradient-to-b from-slate-800 to-slate-900
                   border border-white/[0.10]
                   shadow-[0_25px_70px_-15px_rgba(0,0,0,0.6)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{
          top: '-50px',
          left: '-50px',
          zIndex: 20,
          opacity: 0.8,
        }}
      >
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-300">District Density Map</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
          </div>
        </div>
        {/* Geometric Heatmap Grid */}
        <div className="p-5">
          <div className="grid grid-cols-6 gap-1.5">
            {heatmapCells.map((color, i) => (
              <div
                key={i}
                className={`aspect-square rounded-sm ${color}`}
              />
            ))}
          </div>
          {/* Legend */}
          <div className="flex items-center justify-end gap-3 mt-4 text-[9px] text-slate-500">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-teal-400" />
              <span>High</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-teal-700" />
              <span>Med</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-slate-800" />
              <span>Low</span>
            </div>
          </div>
        </div>
      </div>

      {/* ===== CARD 1 (Hero): Market Pulse ===== */}
      <div
        className="relative w-[520px] rounded-[20px] overflow-hidden
                   bg-gradient-to-b from-slate-900/98 to-slate-900/95
                   backdrop-blur-xl
                   border border-white/[0.12]
                   ring-1 ring-inset ring-white/[0.06]
                   shadow-[0_35px_100px_-25px_rgba(0,0,0,0.8)]
                   transition-transform duration-300 ease-out
                   group-hover:-translate-y-1"
        style={{ zIndex: 30 }}
      >
        {/* Preview Mode Pill */}
        <div className="absolute -top-3 left-5 z-40">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-white/15 rounded-full text-[10px] font-semibold text-slate-300 shadow-lg">
            <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-pulse" />
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
            <div className="w-2.5 h-2.5 rounded-full bg-teal-400" />
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* KPI Tiles */}
          <div className="flex gap-3 mb-5">
            <div className="flex-1 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Median PSF</div>
              <div className="text-xl font-bold text-white font-mono">$1,847</div>
            </div>
            <div className="flex-1 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Volume</div>
              <div className="text-xl font-bold text-white font-mono">1,284</div>
            </div>
            <div className="flex-1 bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Avg Days</div>
              <div className="text-xl font-bold text-teal-400 font-mono">42</div>
            </div>
          </div>

          {/* Area Chart */}
          <div className="relative h-[130px] bg-slate-800/40 rounded-xl border border-slate-700/40 overflow-hidden">
            {/* Grid lines */}
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <line x1="0" y1="25%" x2="100%" y2="25%" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
              <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
              <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
            </svg>
            {/* Chart */}
            <svg className="w-full h-full" viewBox="0 0 460 130" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,100 Q57,90 115,93 T230,78 T345,60 T460,65 L460,130 L0,130 Z"
                fill="url(#heroAreaGrad)"
              />
              <path
                d="M0,100 Q57,90 115,93 T230,78 T345,60 T460,65"
                fill="none"
                stroke="#14b8a6"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              {/* Data points */}
              <circle cx="115" cy="93" r="4" fill="#2dd4bf" />
              <circle cx="230" cy="78" r="4" fill="#2dd4bf" />
              <circle cx="345" cy="60" r="4" fill="#2dd4bf" />
            </svg>
            {/* X-axis labels */}
            <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[10px] text-slate-500">
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
