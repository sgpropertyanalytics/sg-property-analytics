/**
 * ChartSkeleton - Creative loading skeletons for different chart types
 *
 * Matches actual chart card structure:
 * - Header with title placeholder
 * - Chart area with type-specific skeleton
 * - Footer with data info placeholder
 *
 * Features shimmer animation (3.5s - slow, smooth):
 * - bar: Vertical bars of varying heights
 * - line: Wavy line pattern with area fill
 * - pie: Circular donut segments
 * - grid: Grid of cards (for heatmaps/grids)
 * - table: Table rows with columns
 * - map: Singapore outline with district markers
 */

// Shimmer styles are in index.css

export function ChartSkeleton({ type = 'default', height = 300, className = '' }) {
  const baseClass = `chart-skeleton bg-card rounded-lg border border-brand-sky/50 overflow-hidden ${className}`;

  switch (type) {
    case 'bar':
      return <BarSkeleton height={height} className={baseClass} />;
    case 'line':
      return <LineSkeleton height={height} className={baseClass} />;
    case 'pie':
      return <PieSkeleton height={height} className={baseClass} />;
    case 'grid':
      return <GridSkeleton height={height} className={baseClass} />;
    case 'table':
      return <TableSkeleton height={height} className={baseClass} />;
    case 'map':
      return <MapSkeleton height={height} className={baseClass} />;
    default:
      return <DefaultSkeleton height={height} className={baseClass} />;
  }
}

// Shared header skeleton
function SkeletonHeader({ hasSubtitle = true }) {
  return (
    <div className="px-4 py-3 border-b border-skeleton-border/25 shrink-0">
      <div className="skeleton-shimmer h-5 w-48 rounded" />
      {hasSubtitle && (
        <div className="skeleton-shimmer h-3 w-32 rounded mt-2" />
      )}
    </div>
  );
}

// Shared footer skeleton
function SkeletonFooter() {
  return (
    <div className="shrink-0 h-11 px-4 bg-skeleton-bg/40 border-t border-skeleton-border/30 flex items-center justify-between">
      <div className="skeleton-shimmer h-3 w-24 rounded" />
      <div className="skeleton-shimmer h-3 w-32 rounded" />
    </div>
  );
}

// Bar chart skeleton - varying height bars with axis
function BarSkeleton({ height, className }) {
  const barHeights = [55, 75, 40, 85, 50, 70, 45, 80, 60, 65, 48, 90];

  return (
    <div className={className} style={{ height }}>
      <SkeletonHeader />

      {/* Chart area */}
      <div className="flex-1 px-4 pb-3 relative" style={{ height: height - 100 }}>
        {/* Y-axis labels */}
        <div className="absolute left-4 top-2 bottom-8 w-10 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer h-2 w-8 rounded" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>

        {/* Bars area */}
        <div className="ml-12 h-full flex items-end justify-around gap-1 pb-6">
          {barHeights.map((h, i) => (
            <div
              key={i}
              className="skeleton-shimmer rounded-t flex-1 max-w-[32px]"
              style={{
                height: `${h}%`,
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>

        {/* X-axis line */}
        <div className="absolute bottom-3 left-12 right-4 h-px bg-skeleton-border/30" />

        {/* X-axis labels */}
        <div className="absolute bottom-0 left-12 right-4 flex justify-around">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-shimmer h-2 w-6 rounded" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>

      <SkeletonFooter />
    </div>
  );
}

// Line chart skeleton - wavy SVG line with gradient area
function LineSkeleton({ height, className }) {
  return (
    <div className={className} style={{ height }}>
      <SkeletonHeader />

      {/* Chart area */}
      <div className="flex-1 px-4 pb-3 relative" style={{ height: height - 100 }}>
        {/* Y-axis labels */}
        <div className="absolute left-0 top-2 bottom-8 w-12 flex flex-col justify-between">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton-shimmer h-2 w-10 rounded" style={{ animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>

        {/* SVG chart area */}
        <div className="ml-12 h-full">
          <svg className="w-full h-full" viewBox="0 0 400 180" preserveAspectRatio="none">
            {/* Horizontal grid lines */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1="0"
                y1={i * 45}
                x2="400"
                y2={i * 45}
                stroke="#d4d0c8"
                strokeOpacity="0.2"
                strokeDasharray="4 4"
              />
            ))}

            {/* Area under main line */}
            <path
              d="M 0 140 Q 40 120 80 125 T 160 100 T 240 85 T 320 70 T 400 55 L 400 180 L 0 180 Z"
              fill="url(#areaGradientSkeleton)"
              className="skeleton-area"
            />

            {/* Main trend line */}
            <path
              d="M 0 140 Q 40 120 80 125 T 160 100 T 240 85 T 320 70 T 400 55"
              fill="none"
              stroke="url(#lineGradientSkeleton)"
              strokeWidth="3"
              strokeLinecap="round"
              className="skeleton-line"
            />

            {/* Secondary line (like CCR/RCR/OCR) */}
            <path
              d="M 0 120 Q 50 110 100 115 T 200 95 T 300 80 T 400 70"
              fill="none"
              stroke="#d4d0c8"
              strokeWidth="2"
              strokeOpacity="0.35"
              strokeDasharray="6 3"
            />

            <defs>
              <linearGradient id="lineGradientSkeleton" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.35">
                  <animate attributeName="stop-opacity" values="0.2;0.5;0.2" dur="3.5s" repeatCount="indefinite" />
                </stop>
                <stop offset="50%" stopColor="#334155" stopOpacity="0.45">
                  <animate attributeName="stop-opacity" values="0.3;0.6;0.3" dur="3.5s" repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.35">
                  <animate attributeName="stop-opacity" values="0.2;0.5;0.2" dur="3.5s" repeatCount="indefinite" />
                </stop>
              </linearGradient>
              <linearGradient id="areaGradientSkeleton" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#94A3B8" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#94A3B8" stopOpacity="0.01" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <SkeletonFooter />
    </div>
  );
}

// Pie chart skeleton - donut chart with segments
function PieSkeleton({ height, className }) {
  const size = Math.min(height - 120, 180);

  return (
    <div className={className} style={{ height }}>
      <SkeletonHeader />

      {/* Chart area */}
      <div className="flex-1 flex items-center justify-center px-4 pb-3">
        <div className="flex items-center gap-8">
          {/* Donut chart */}
          <div
            className="skeleton-shimmer rounded-full relative"
            style={{ width: size, height: size }}
          >
            {/* Inner hole */}
            <div
              className="absolute rounded-full bg-white"
              style={{
                width: size * 0.55,
                height: size * 0.55,
                top: '22.5%',
                left: '22.5%'
              }}
            />
            {/* Segment dividers */}
            <svg className="absolute inset-0" viewBox="0 0 100 100">
              <line x1="50" y1="50" x2="50" y2="5" stroke="white" strokeWidth="3" />
              <line x1="50" y1="50" x2="90" y2="30" stroke="white" strokeWidth="3" />
              <line x1="50" y1="50" x2="85" y2="75" stroke="white" strokeWidth="3" />
              <line x1="50" y1="50" x2="15" y2="70" stroke="white" strokeWidth="3" />
            </svg>
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="skeleton-shimmer w-3 h-3 rounded" style={{ animationDelay: `${i * 0.2}s` }} />
                <div className="skeleton-shimmer h-3 w-16 rounded" style={{ animationDelay: `${i * 0.2}s` }} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <SkeletonFooter />
    </div>
  );
}

// Grid skeleton - for heatmaps and momentum grid
function GridSkeleton({ height, className }) {
  const rows = 4;
  const cols = 7;

  return (
    <div className={className} style={{ height }}>
      <SkeletonHeader hasSubtitle={true} />

      {/* Grid area */}
      <div className="flex-1 p-4" style={{ height: height - 100 }}>
        <div
          className="grid gap-2 h-full"
          style={{
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gridTemplateColumns: `repeat(${cols}, 1fr)`
          }}
        >
          {Array.from({ length: rows * cols }).map((_, i) => (
            <div
              key={i}
              className="skeleton-shimmer rounded border border-skeleton-border/15"
              style={{ animationDelay: `${(i % cols) * 0.12 + Math.floor(i / cols) * 0.08}s` }}
            />
          ))}
        </div>
      </div>

      <SkeletonFooter />
    </div>
  );
}

// Table skeleton - rows with varying column widths
function TableSkeleton({ height, className }) {
  const rows = 7;

  return (
    <div className={className} style={{ height }}>
      <SkeletonHeader />

      {/* Table area */}
      <div className="flex-1 overflow-hidden">
        {/* Table header */}
        <div className="flex gap-4 px-4 py-2.5 bg-skeleton-bg/30 border-b border-skeleton-border/25">
          <div className="skeleton-shimmer h-3.5 w-20 rounded" />
          <div className="skeleton-shimmer h-3.5 w-32 rounded flex-1" />
          <div className="skeleton-shimmer h-3.5 w-16 rounded" />
          <div className="skeleton-shimmer h-3.5 w-20 rounded" />
          <div className="skeleton-shimmer h-3.5 w-16 rounded" />
        </div>

        {/* Table rows */}
        <div className="px-4">
          {Array.from({ length: rows }).map((_, rowIdx) => (
            <div
              key={rowIdx}
              className="flex gap-4 py-2.5 border-b border-skeleton-border/12"
            >
              <div className="skeleton-shimmer h-3.5 w-20 rounded" style={{ animationDelay: `${rowIdx * 0.1}s` }} />
              <div className="skeleton-shimmer h-3.5 w-32 rounded flex-1" style={{ animationDelay: `${rowIdx * 0.1 + 0.05}s` }} />
              <div className="skeleton-shimmer h-3.5 w-16 rounded" style={{ animationDelay: `${rowIdx * 0.1 + 0.1}s` }} />
              <div className="skeleton-shimmer h-3.5 w-20 rounded" style={{ animationDelay: `${rowIdx * 0.1 + 0.15}s` }} />
              <div className="skeleton-shimmer h-3.5 w-16 rounded" style={{ animationDelay: `${rowIdx * 0.1 + 0.2}s` }} />
            </div>
          ))}
        </div>
      </div>

      <SkeletonFooter />
    </div>
  );
}

// Map skeleton - Singapore outline with district markers
function MapSkeleton({ height, className }) {
  return (
    <div className={className} style={{ height }}>
      {/* Map header with filter placeholders */}
      <div className="px-4 py-3 border-b border-skeleton-border/25 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <div className="skeleton-shimmer h-5 w-40 rounded" />
            <div className="skeleton-shimmer h-3 w-28 rounded mt-2" />
          </div>
          <div className="flex gap-2">
            <div className="skeleton-shimmer h-8 w-20 rounded" />
            <div className="skeleton-shimmer h-8 w-20 rounded" />
            <div className="skeleton-shimmer h-8 w-20 rounded" />
          </div>
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative bg-white" style={{ height: height - 100 }}>
        <svg
          className="w-full h-full p-6"
          viewBox="0 0 400 280"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Singapore island shape */}
          <path
            d="M 80 140
               Q 90 100 130 85
               Q 180 70 230 75
               Q 280 80 320 95
               Q 350 115 355 145
               Q 350 175 320 195
               Q 280 215 230 220
               Q 180 225 130 215
               Q 90 200 80 170
               Q 75 155 80 140"
            fill="url(#mapGradientSkeleton)"
            stroke="#d4d0c8"
            strokeWidth="1.5"
            className="skeleton-map-shape"
          />

          {/* District region outlines */}
          <path
            d="M 180 90 L 180 200 M 260 85 L 260 210"
            stroke="#d4d0c8"
            strokeWidth="1"
            strokeOpacity="0.25"
            strokeDasharray="4 4"
          />

          {/* District markers */}
          {[
            [120, 145], [150, 120], [180, 130], [210, 115],
            [240, 125], [270, 135], [300, 150], [150, 165],
            [200, 155], [250, 160], [290, 175], [180, 185]
          ].map(([x, y], i) => (
            <g key={i}>
              <circle
                cx={x}
                cy={y}
                r="14"
                className="skeleton-shimmer"
                style={{ animationDelay: `${i * 0.12}s` }}
              />
              <rect
                x={x - 6}
                y={y - 4}
                width="12"
                height="8"
                rx="2"
                fill="white"
                fillOpacity="0.6"
              />
            </g>
          ))}

          <defs>
            <linearGradient id="mapGradientSkeleton" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f0ebe3" stopOpacity="0.5">
                <animate attributeName="stop-opacity" values="0.3;0.6;0.3" dur="3.5s" repeatCount="indefinite" />
              </stop>
              <stop offset="50%" stopColor="#e8e2d8" stopOpacity="0.4">
                <animate attributeName="stop-opacity" values="0.25;0.5;0.25" dur="3.5s" repeatCount="indefinite" />
              </stop>
              <stop offset="100%" stopColor="#d4d0c8" stopOpacity="0.3">
                <animate attributeName="stop-opacity" values="0.15;0.4;0.15" dur="3.5s" repeatCount="indefinite" />
              </stop>
            </linearGradient>
          </defs>
        </svg>

        {/* Legend placeholder */}
        <div className="absolute bottom-4 right-4 bg-white/90 rounded-lg p-3 border border-skeleton-border/20">
          <div className="skeleton-shimmer h-3 w-16 rounded mb-2" />
          <div className="flex items-center gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="skeleton-shimmer h-3 w-6 rounded"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      </div>

      <SkeletonFooter />
    </div>
  );
}

// Default skeleton - simple card with content area
function DefaultSkeleton({ height, className }) {
  return (
    <div className={className} style={{ height }}>
      <SkeletonHeader />

      <div className="flex-1 p-4 flex items-center justify-center">
        <div className="skeleton-shimmer w-3/4 h-3/4 rounded-lg" />
      </div>

      <SkeletonFooter />
    </div>
  );
}

export default ChartSkeleton;
