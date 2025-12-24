/**
 * ResearchStackPreview - Vertical 3-Layer Dashboard Preview
 *
 * A premium "research terminal" style preview showing 3 stacked dashboard cards.
 * Front card is sharp and readable, back cards are blurred silhouettes.
 *
 * Visual spec:
 * - Card 1 (front, z-30): 100% opacity, sharp
 * - Card 2 (middle, z-20): 70% opacity, blur 2-3px
 * - Card 3 (back, z-10): 40% opacity, blur 4-6px
 * - Vertical stack with slight offset
 * - Hover lifts all cards by 3px
 */

export default function ResearchStackPreview() {
  return (
    <div className="relative w-full flex items-center justify-center py-8">
      {/* Stack Container - hover lifts all cards */}
      <div className="relative group cursor-default">

        {/* ===== CARD 3 (Back): Liquidity Overview - Blurred Silhouette ===== */}
        <div
          className="absolute left-1/2 w-[340px] h-[200px] rounded-[20px] overflow-hidden transition-transform duration-300 ease-out group-hover:-translate-y-1"
          style={{
            transform: 'translateX(-50%) translateY(32px) translateX(4px)',
            zIndex: 10,
            opacity: 0.40,
            filter: 'blur(5px)',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Header silhouette */}
          <div className="px-5 py-3 border-b border-white/5">
            <div className="h-3 w-28 bg-slate-600/50 rounded" />
          </div>
          {/* Bar chart silhouette */}
          <div className="p-4 flex items-end justify-center gap-2 h-[150px]">
            <div className="w-6 h-12 bg-cyan-500/30 rounded-t" />
            <div className="w-6 h-20 bg-cyan-500/40 rounded-t" />
            <div className="w-6 h-16 bg-cyan-500/35 rounded-t" />
            <div className="w-6 h-24 bg-cyan-500/50 rounded-t" />
            <div className="w-6 h-28 bg-cyan-500/45 rounded-t" />
            <div className="w-6 h-18 bg-cyan-500/40 rounded-t" />
            <div className="w-6 h-14 bg-cyan-500/30 rounded-t" />
          </div>
        </div>

        {/* ===== CARD 2 (Middle): Price Distribution - Blurred ===== */}
        <div
          className="absolute left-1/2 w-[340px] h-[200px] rounded-[20px] overflow-hidden transition-transform duration-300 ease-out group-hover:-translate-y-1"
          style={{
            transform: 'translateX(-50%) translateY(16px) translateX(2px)',
            zIndex: 20,
            opacity: 0.70,
            filter: 'blur(2.5px)',
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Header silhouette */}
          <div className="px-5 py-3 border-b border-white/5">
            <div className="h-3 w-32 bg-slate-500/60 rounded" />
          </div>
          {/* Histogram silhouette */}
          <div className="p-4">
            <svg className="w-full h-[130px]" viewBox="0 0 300 120">
              <line x1="20" y1="105" x2="280" y2="105" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
              <rect x="30" y="90" width="24" height="15" fill="rgba(34,211,238,0.25)" rx="3" />
              <rect x="62" y="75" width="24" height="30" fill="rgba(34,211,238,0.35)" rx="3" />
              <rect x="94" y="55" width="24" height="50" fill="rgba(34,211,238,0.45)" rx="3" />
              <rect x="126" y="30" width="24" height="75" fill="rgba(34,211,238,0.55)" rx="3" />
              <rect x="158" y="20" width="24" height="85" fill="rgba(103,232,249,0.65)" rx="3" />
              <rect x="190" y="35" width="24" height="70" fill="rgba(34,211,238,0.50)" rx="3" />
              <rect x="222" y="60" width="24" height="45" fill="rgba(34,211,238,0.40)" rx="3" />
              <rect x="254" y="80" width="24" height="25" fill="rgba(34,211,238,0.30)" rx="3" />
            </svg>
          </div>
        </div>

        {/* ===== CARD 1 (Front): Market Pulse - Sharp & Readable ===== */}
        <div
          className="relative w-[340px] h-[200px] rounded-[20px] overflow-hidden transition-transform duration-300 ease-out group-hover:-translate-y-1"
          style={{
            zIndex: 30,
            background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 1) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255,255,255,0.05) inset',
          }}
        >
          {/* Preview Mode Pill */}
          <div className="absolute -top-3 left-5 z-40">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 border border-cyan-500/40 rounded-full text-[10px] font-semibold text-cyan-400 shadow-lg">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              Preview Mode
            </span>
          </div>

          {/* Card Header */}
          <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Market Pulse</h3>
              <p className="text-[11px] text-slate-500">Last 60 days · District-level data</p>
            </div>
            <div className="flex gap-1">
              <div className="w-2 h-2 rounded-full bg-slate-600" />
              <div className="w-2 h-2 rounded-full bg-cyan-500/70" />
              <div className="w-2 h-2 rounded-full bg-cyan-400" />
            </div>
          </div>

          {/* Card Body */}
          <div className="p-4">
            {/* KPI Tiles */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Median PSF</div>
                <div className="text-base font-bold text-white font-mono">$1,847</div>
              </div>
              <div className="flex-1 bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Volume</div>
                <div className="text-base font-bold text-white font-mono">1,284</div>
              </div>
              <div className="flex-1 bg-slate-800/70 rounded-lg px-3 py-2 border border-slate-700/50">
                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Avg Days</div>
                <div className="text-base font-bold text-cyan-400 font-mono">42</div>
              </div>
            </div>

            {/* Mini Line Chart */}
            <div className="relative h-[70px] bg-slate-800/30 rounded-lg border border-slate-700/30 overflow-hidden">
              {/* Grid lines */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <line x1="0" y1="25%" x2="100%" y2="25%" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
                <line x1="0" y1="75%" x2="100%" y2="75%" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
              </svg>
              {/* Chart line */}
              <svg className="w-full h-full" viewBox="0 0 300 70" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="areaFill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,55 Q30,50 60,52 T120,45 T180,38 T240,32 T300,35 L300,70 L0,70 Z"
                  fill="url(#areaFill)"
                />
                <path
                  d="M0,55 Q30,50 60,52 T120,45 T180,38 T240,32 T300,35"
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                {/* Data points */}
                <circle cx="60" cy="52" r="3" fill="#67e8f9" />
                <circle cx="120" cy="45" r="3" fill="#67e8f9" />
                <circle cx="180" cy="38" r="3" fill="#67e8f9" />
                <circle cx="240" cy="32" r="3" fill="#67e8f9" />
              </svg>
              {/* X-axis labels */}
              <div className="absolute bottom-1 left-2 right-2 flex justify-between text-[8px] text-slate-600">
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
