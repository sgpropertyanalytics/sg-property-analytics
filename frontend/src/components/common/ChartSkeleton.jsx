/**
 * ChartSkeleton - Creative loading skeletons for different chart types
 *
 * Features shimmer animation with chart-type-aware shapes:
 * - bar: Vertical bars of varying heights
 * - line: Wavy line pattern
 * - pie: Circular segments
 * - grid: Grid of cards (for heatmaps/grids)
 * - table: Table rows
 * - default: Simple rounded rectangle
 */

// Shimmer styles are in index.css

export function ChartSkeleton({ type = 'default', height = 300, className = '' }) {
  const baseClass = `chart-skeleton ${className}`;

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

// Bar chart skeleton - varying height bars
function BarSkeleton({ height, className }) {
  const barHeights = [65, 85, 45, 90, 55, 75, 40, 80, 60, 70, 50, 95];

  return (
    <div className={`${className} rounded-lg overflow-hidden`} style={{ height }}>
      <div className="h-full flex items-end justify-around gap-2 p-4 pb-8">
        {barHeights.map((h, i) => (
          <div
            key={i}
            className="skeleton-shimmer rounded-t flex-1 max-w-[40px]"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      {/* X-axis line */}
      <div className="absolute bottom-6 left-4 right-4 h-px bg-[#94B4C1]/30" />
    </div>
  );
}

// Line chart skeleton - wavy SVG line
function LineSkeleton({ height, className }) {
  return (
    <div className={`${className} rounded-lg overflow-hidden relative`} style={{ height }}>
      <svg
        className="w-full h-full p-4"
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
      >
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={i}
            x1="0"
            y1={i * 50}
            x2="400"
            y2={i * 50}
            stroke="#94B4C1"
            strokeOpacity="0.2"
            strokeDasharray="4 4"
          />
        ))}
        {/* Shimmer line path */}
        <path
          className="skeleton-line-shimmer"
          d="M 0 150 Q 50 120 100 130 T 200 100 T 300 80 T 400 60"
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* Area under line */}
        <path
          d="M 0 150 Q 50 120 100 130 T 200 100 T 300 80 T 400 60 L 400 200 L 0 200 Z"
          fill="url(#areaGradient)"
          opacity="0.3"
        />
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#94B4C1" stopOpacity="0.4">
              <animate attributeName="stop-opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="#547792" stopOpacity="0.6">
              <animate attributeName="stop-opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#94B4C1" stopOpacity="0.4">
              <animate attributeName="stop-opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#547792" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#547792" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// Pie chart skeleton - circular segments
function PieSkeleton({ height, className }) {
  const size = Math.min(height - 40, 200);

  return (
    <div className={`${className} rounded-lg flex items-center justify-center`} style={{ height }}>
      <div
        className="skeleton-shimmer rounded-full relative"
        style={{ width: size, height: size }}
      >
        {/* Inner circle for donut effect */}
        <div
          className="absolute inset-0 m-auto rounded-full bg-white"
          style={{ width: size * 0.5, height: size * 0.5, top: '25%', left: '25%' }}
        />
        {/* Segment lines */}
        <svg className="absolute inset-0" viewBox="0 0 100 100">
          <line x1="50" y1="50" x2="50" y2="0" stroke="white" strokeWidth="2" />
          <line x1="50" y1="50" x2="93" y2="25" stroke="white" strokeWidth="2" />
          <line x1="50" y1="50" x2="93" y2="75" stroke="white" strokeWidth="2" />
          <line x1="50" y1="50" x2="7" y2="75" stroke="white" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

// Grid skeleton - for heatmaps and grid layouts
function GridSkeleton({ height, className }) {
  const rows = 4;
  const cols = 6;

  return (
    <div className={`${className} rounded-lg p-4`} style={{ height }}>
      <div className="grid gap-2 h-full" style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {Array.from({ length: rows * cols }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer rounded"
            style={{ animationDelay: `${(i % cols) * 0.1}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// Table skeleton - rows with columns
function TableSkeleton({ height, className }) {
  const rows = 6;

  return (
    <div className={`${className} rounded-lg overflow-hidden`} style={{ height }}>
      {/* Header */}
      <div className="flex gap-3 p-3 bg-[#EAE0CF]/20 border-b border-[#94B4C1]/30">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="skeleton-shimmer h-4 rounded flex-1"
            style={{ maxWidth: i === 1 ? '80px' : i === 2 ? '150px' : '100px' }}
          />
        ))}
      </div>
      {/* Rows */}
      <div className="p-2 space-y-2">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex gap-3 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="skeleton-shimmer h-4 rounded flex-1"
                style={{
                  maxWidth: i === 1 ? '80px' : i === 2 ? '150px' : '100px',
                  animationDelay: `${rowIdx * 0.1}s`
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Map skeleton - for geographic visualizations
function MapSkeleton({ height, className }) {
  return (
    <div className={`${className} rounded-lg overflow-hidden relative`} style={{ height }}>
      {/* Map outline shape */}
      <svg className="w-full h-full p-4" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
        {/* Singapore-ish shape */}
        <path
          className="skeleton-shimmer-path"
          d="M 100 150 Q 120 100 180 90 Q 250 85 300 100 Q 340 120 350 160 Q 340 200 300 220 Q 250 235 180 230 Q 120 220 100 180 Q 90 165 100 150"
          fill="url(#mapGradient)"
          stroke="#94B4C1"
          strokeWidth="2"
        />
        {/* District markers */}
        {[[150, 140], [200, 120], [250, 130], [180, 170], [220, 180], [280, 160]].map(([x, y], i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="12"
            className="skeleton-shimmer"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
        <defs>
          <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EAE0CF" stopOpacity="0.5">
              <animate attributeName="stop-opacity" values="0.3;0.6;0.3" dur="2s" repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="#94B4C1" stopOpacity="0.3">
              <animate attributeName="stop-opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
            </stop>
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

// Default skeleton - simple rectangle
function DefaultSkeleton({ height, className }) {
  return (
    <div className={`${className} rounded-lg overflow-hidden p-4`} style={{ height }}>
      <div className="skeleton-shimmer w-full h-full rounded-lg" />
    </div>
  );
}

export default ChartSkeleton;
