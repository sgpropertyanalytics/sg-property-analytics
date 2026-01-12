/**
 * ChartSkeleton - Structural Fidelity Loading States
 *
 * Design Philosophy: Clean, Consistent, No Animation
 * - Static structural lines only (no shimmer, no scan)
 * - Consistent background prevents white flash
 * - All types share same visual weight
 * - Matches chart.js axis/grid styling
 */

import React from 'react';

// --- DESIGN TOKENS (Consistent across all types) ---
const STROKE = '#E5E7EB'; // Gray-200 - matches chart grid lines
const BLOCK = '#F3F4F6';  // Gray-100 - text placeholders
const BG = '#FAFAFA';     // Very light grey - prevents white flash

// ============================================
// SHARED: Chart Frame (Axes + Grid)
// ============================================
function ChartAxes() {
  return (
    <>
      {/* Y-Axis */}
      <line x1="40" y1="15" x2="40" y2="180" stroke={STROKE} strokeWidth="1" />
      {/* X-Axis */}
      <line x1="40" y1="180" x2="390" y2="180" stroke={STROKE} strokeWidth="1" />
      {/* Horizontal grid lines */}
      <line x1="40" y1="60" x2="390" y2="60" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
      <line x1="40" y1="100" x2="390" y2="100" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
      <line x1="40" y1="140" x2="390" y2="140" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
      {/* Y-axis label placeholders */}
      <rect x="8" y="55" width="24" height="10" rx="2" fill={BLOCK} />
      <rect x="8" y="95" width="24" height="10" rx="2" fill={BLOCK} />
      <rect x="8" y="135" width="24" height="10" rx="2" fill={BLOCK} />
    </>
  );
}

// ============================================
// LINE CHART
// ============================================
function LineSkeleton() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none">
      <ChartAxes />
      {/* X-axis ticks */}
      {[100, 160, 220, 280, 340].map((x) => (
        <line key={x} x1={x} y1="180" x2={x} y2="186" stroke={STROKE} strokeWidth="1" />
      ))}
    </svg>
  );
}

// ============================================
// BAR CHART
// ============================================
function BarSkeleton() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none">
      <ChartAxes />
      {/* Bar slots */}
      {[60, 110, 160, 210, 260, 310, 360].map((x, i) => (
        <rect
          key={x}
          x={x}
          y={60 + (i % 3) * 30}
          width="28"
          height={120 - (i % 3) * 30}
          stroke={STROKE}
          strokeWidth="1"
          strokeDasharray="3 3"
          fill="none"
        />
      ))}
    </svg>
  );
}

// ============================================
// PIE CHART
// ============================================
function PieSkeleton() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none">
      {/* Outer circle */}
      <circle cx="140" cy="100" r="70" stroke={STROKE} strokeWidth="1" />
      {/* Sector lines */}
      <line x1="140" y1="100" x2="140" y2="30" stroke={STROKE} strokeWidth="1" />
      <line x1="140" y1="100" x2="200" y2="135" stroke={STROKE} strokeWidth="1" />
      <line x1="140" y1="100" x2="80" y2="135" stroke={STROKE} strokeWidth="1" />
      {/* Center hole */}
      <circle cx="140" cy="100" r="28" stroke={STROKE} strokeWidth="1" strokeDasharray="4 4" />
      {/* Legend */}
      <rect x="260" y="45" width="10" height="10" rx="2" fill={BLOCK} />
      <rect x="276" y="47" width="50" height="6" rx="1" fill={BLOCK} />
      <rect x="260" y="70" width="10" height="10" rx="2" fill={BLOCK} />
      <rect x="276" y="72" width="40" height="6" rx="1" fill={BLOCK} />
      <rect x="260" y="95" width="10" height="10" rx="2" fill={BLOCK} />
      <rect x="276" y="97" width="45" height="6" rx="1" fill={BLOCK} />
      <rect x="260" y="120" width="10" height="10" rx="2" fill={BLOCK} />
      <rect x="276" y="122" width="35" height="6" rx="1" fill={BLOCK} />
    </svg>
  );
}

// ============================================
// MAP
// ============================================
function MapSkeleton() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none">
      {/* Border */}
      <rect x="1" y="1" width="398" height="198" stroke={STROKE} strokeWidth="1" />
      {/* Dot grid pattern */}
      <defs>
        <pattern id="mapDots" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill={STROKE} />
        </pattern>
      </defs>
      <rect x="1" y="1" width="398" height="198" fill="url(#mapDots)" />
      {/* Crosshairs */}
      <line x1="200" y1="1" x2="200" y2="199" stroke={STROKE} strokeWidth="1" strokeDasharray="6 6" opacity="0.6" />
      <line x1="1" y1="100" x2="399" y2="100" stroke={STROKE} strokeWidth="1" strokeDasharray="6 6" opacity="0.6" />
    </svg>
  );
}

// ============================================
// BEAD CHART (Timeline)
// ============================================
function BeadSkeleton() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none">
      {/* Tracks */}
      {[45, 85, 125, 165].map((y) => (
        <g key={y}>
          <rect x="5" y={y - 5} width="28" height="10" rx="2" fill={BLOCK} />
          <line x1="40" y1={y} x2="395" y2={y} stroke={STROKE} strokeWidth="1" />
          {/* Ticks */}
          {[40, 140, 240, 340, 395].map((x) => (
            <line key={x} x1={x} y1={y - 4} x2={x} y2={y + 4} stroke={STROKE} strokeWidth="1" />
          ))}
        </g>
      ))}
    </svg>
  );
}

// ============================================
// GRID (Heatmap)
// ============================================
function GridSkeleton() {
  return (
    <svg viewBox="0 0 400 200" className="w-full h-full" fill="none">
      {/* Row labels */}
      {[30, 70, 110, 150].map((y) => (
        <rect key={y} x="5" y={y} width="28" height="10" rx="2" fill={BLOCK} />
      ))}
      {/* Grid cells */}
      {[0, 1, 2, 3].map((row) =>
        [0, 1, 2, 3, 4, 5, 6].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={42 + col * 50}
            y={20 + row * 42}
            width="46"
            height="38"
            stroke={STROKE}
            strokeWidth="1"
            fill="none"
          />
        ))
      )}
    </svg>
  );
}

// ============================================
// TABLE
// ============================================
function TableSkeleton() {
  return (
    <div className="w-full h-full flex flex-col border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="h-10 bg-gray-50 border-b border-gray-200 flex items-center px-4 gap-6 shrink-0">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-3 w-24 bg-gray-200 rounded" />
        <div className="h-3 flex-1 bg-gray-100 rounded" />
      </div>
      {/* Rows */}
      <div className="flex-1 flex flex-col">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex-1 border-b border-gray-100 flex items-center px-4 gap-6 last:border-0">
            <div className="h-2 w-16 bg-gray-100 rounded" />
            <div className="h-2 w-24 bg-gray-100 rounded" />
            <div className="h-2 flex-1 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================
export function ChartSkeleton({ type = 'default', skeleton, height = 300, className = '' }) {
  const skeletonType = type || skeleton || 'default';

  const SkeletonMap = {
    line: LineSkeleton,
    bar: BarSkeleton,
    histogram: BarSkeleton,
    pie: PieSkeleton,
    bead: BeadSkeleton,
    map: MapSkeleton,
    grid: GridSkeleton,
    table: TableSkeleton,
    default: LineSkeleton,
  };

  const SkeletonComponent = SkeletonMap[skeletonType] || LineSkeleton;

  return (
    <div
      className={`w-full ${className}`}
      style={{
        height,
        minHeight: 150,
        backgroundColor: BG, // Prevents white flash
      }}
      role="status"
      aria-label="Loading"
    >
      <SkeletonComponent />
    </div>
  );
}

export default ChartSkeleton;
