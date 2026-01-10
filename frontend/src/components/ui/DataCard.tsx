import React from 'react';
import { HelpTooltip } from './HelpTooltip';

/**
 * DataCard - Full-Bleed Data Toolbar System
 *
 * Production-grade dashboard component template for ANY chart type.
 * Ensures strict vertical alignment across all cards in a grid.
 *
 * Slot Structure (fixed heights for pixel-perfect alignment):
 * - Header:  h-14 (56px) - Title + controls + (i) icon
 * - Toolbar: h-20 (80px) - Full-bleed gray band for stats OR legend
 * - Canvas:  flex-grow   - Chart content
 * - Footer:  auto        - Transaction count, context
 *
 * Usage:
 *   <DataCard>
 *     <DataCardHeader title="Price Distribution" controls={<Button />} />
 *     <DataCardToolbar>
 *       <ToolbarStat label="Median" value="$1.66M" />
 *       <ToolbarStat label="Q1-Q3" value="$1.2-2.3" />
 *     </DataCardToolbar>
 *     <DataCardCanvas>
 *       <Chart />
 *     </DataCardCanvas>
 *     <DataCardFooter>15,517 transactions</DataCardFooter>
 *   </DataCard>
 */

// ============================================
// DataCard - Main Container
// ============================================
interface DataCardProps {
  children: React.ReactNode;
  className?: string;
}

export function DataCard({ children, className = '' }: DataCardProps) {
  return (
    <div
      className={`
        bg-white border border-slate-300 rounded-sm
        shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)]
        flex flex-col overflow-hidden
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

// ============================================
// DataCardHeader - Fixed h-14 (56px)
// ============================================
interface DataCardHeaderProps {
  /** Chart title (uppercase, bold) */
  title: string;
  /** Optional subtitle below title */
  subtitle?: string;
  /** Methodology text shown via (i) tooltip */
  info?: string;
  /** Optional controls (toggles, buttons) on right side */
  controls?: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function DataCardHeader({
  title,
  subtitle,
  info,
  controls,
  className = '',
}: DataCardHeaderProps) {
  return (
    <div
      className={`
        h-14 px-6 shrink-0
        flex justify-between items-center
        border-b border-slate-200
        ${className}
      `.trim()}
    >
      {/* Left: Title + Subtitle + Info Icon */}
      <div className="flex items-center gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {info && (
          <HelpTooltip
            content={info}
            trigger="info"
            title="How to Interpret"
          />
        )}
      </div>

      {/* Right: Controls */}
      {controls && (
        <div className="flex items-center gap-2">
          {controls}
        </div>
      )}
    </div>
  );
}

// ============================================
// DataCardToolbar - Fixed h-20 (80px), Full-Bleed Gray
// ============================================
interface DataCardToolbarProps {
  children: React.ReactNode;
  /** Number of columns for stats grid (default: auto based on children) */
  columns?: number;
  /** Use dividers between cells (default: true for stats) */
  divided?: boolean;
  /** Blur for non-premium users */
  blur?: boolean;
  /** Additional className */
  className?: string;
}

export function DataCardToolbar({
  children,
  columns,
  divided = true,
  blur = false,
  className = '',
}: DataCardToolbarProps) {
  // Count children to determine grid columns if not specified
  const childCount = React.Children.count(children);
  const gridCols = columns || childCount || 1;

  return (
    <div
      className={`
        h-20 shrink-0
        bg-slate-50 border-b border-slate-200
        ${blur ? 'blur-sm grayscale-[40%]' : ''}
        ${className}
      `.trim()}
    >
      <div
        className={`
          h-full grid
          ${divided ? 'divide-x divide-slate-300' : ''}
        `.trim()}
        style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
      >
        {children}
      </div>
    </div>
  );
}

// ============================================
// ToolbarStat - Individual Stat Cell
// ============================================
interface ToolbarStatProps {
  /** Stat label (uppercase, small) */
  label: string;
  /** Stat value (monospace, bold) */
  value: string | React.ReactNode;
  /** Optional subtext below value */
  subtext?: string;
  /** Color indicator dot (hex color) */
  color?: string;
  /** Trend direction for subtext coloring */
  trend?: 'up' | 'down' | 'neutral';
  /** Highlight this cell (e.g., Mode) */
  highlight?: boolean;
  /** Additional className */
  className?: string;
}

export function ToolbarStat({
  label,
  value,
  subtext,
  color,
  trend,
  highlight = false,
  className = '',
}: ToolbarStatProps) {
  // Trend colors for subtext (matches DELTA palette in colors.js)
  const trendColor = trend === 'up'
    ? 'text-emerald-600'  // DELTA.positive #059669
    : trend === 'down'
    ? 'text-red-600'      // DELTA.negative #DC2626
    : 'text-slate-400';

  return (
    <div
      className={`
        flex flex-col justify-center px-4
        ${highlight ? 'bg-slate-100' : ''}
        ${className}
      `.trim()}
    >
      {/* Label row with optional color dot */}
      <div className="flex items-center gap-1.5 mb-1">
        {color && (
          <span
            className="w-2 h-2 rounded-sm shrink-0"
            style={{ backgroundColor: color }}
          />
        )}
        <span
          className={`
            font-sans text-[10px] uppercase font-semibold tracking-wide
            ${highlight ? 'text-slate-600' : 'text-slate-400'}
          `.trim()}
        >
          {label}
        </span>
      </div>
      {/* Mono for machine data */}
      <span
        className={`
          font-mono font-semibold tabular-nums
          ${highlight ? 'text-sm text-slate-900' : 'text-lg text-slate-800'}
        `.trim()}
      >
        {value}
      </span>
      {/* Optional subtext with trend color */}
      {subtext && (
        <span className={`font-sans text-[10px] mt-0.5 ${trendColor}`}>
          {subtext}
        </span>
      )}
    </div>
  );
}

// ============================================
// ToolbarLegend - Legend Items in Toolbar
// ============================================
interface ToolbarLegendProps {
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function ToolbarLegend({ children, className = '' }: ToolbarLegendProps) {
  return (
    <div
      className={`
        h-20 shrink-0
        bg-slate-50 border-b border-slate-200
        flex items-center px-6
        ${className}
      `.trim()}
    >
      <div className="flex flex-wrap gap-4">
        {children}
      </div>
    </div>
  );
}

// ============================================
// LegendDot - Single Legend Item with Dot
// ============================================
interface LegendDotProps {
  /** Legend label */
  label: string;
  /** Dot color (hex or Tailwind class) */
  color: string;
  /** Additional className */
  className?: string;
}

export function LegendDot({ label, color, className = '' }: LegendDotProps) {
  return (
    <div className={`flex items-center font-sans text-xs font-medium text-slate-600 ${className}`}>
      <span
        className="w-2.5 h-2.5 rounded-sm border border-slate-400 mr-2"
        style={{ backgroundColor: color }}
      />
      {label}
    </div>
  );
}

// ============================================
// DataCardCanvas - Flexible Chart Container (Tier 2 Unified)
// ============================================
interface DataCardCanvasProps {
  children: React.ReactNode;
  /** Minimum height for the canvas */
  minHeight?: number;
  /** Additional className */
  className?: string;
}

export function DataCardCanvas({
  children,
  minHeight = 300,
  className = '',
}: DataCardCanvasProps) {
  return (
    <div
      className={`flex-grow p-6 relative ${className}`}
      style={{ minHeight }}
    >
      {children}
    </div>
  );
}

// ============================================
// AgentButton - Trigger for AI Analysis
// ============================================
interface AgentButtonProps {
  /** Click handler */
  onClick?: () => void;
  /** Is agent running/active */
  isActive?: boolean;
  /** Additional className */
  className?: string;
}

export function AgentButton({
  onClick,
  isActive = false,
  className = '',
}: AgentButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group flex items-center gap-2 px-2 py-1
        border border-slate-300 hover:border-indigo-500
        bg-white transition-colors
        ${isActive ? 'border-indigo-500' : ''}
        ${className}
      `.trim()}
    >
      <div className={`w-2 h-2 rounded-full transition-colors ${isActive ? 'bg-indigo-500' : 'bg-slate-300 group-hover:bg-indigo-500'}`} />
      <span className={`text-[9px] font-mono font-bold uppercase transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-500 group-hover:text-indigo-600'}`}>
        {isActive ? 'Agent_Active' : 'Run_Agent'}
      </span>
    </button>
  );
}

// ============================================
// AgentFooter - Expandable AI Analysis Footer
// ============================================
interface AgentFooterProps {
  /** Whether footer is visible */
  isOpen: boolean;
  /** Agent log/analysis content */
  children: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function AgentFooter({
  isOpen,
  children,
  className = '',
}: AgentFooterProps) {
  if (!isOpen) return null;

  return (
    <div className={`border-t border-indigo-100 bg-indigo-50/30 p-3 ${className}`}>
      <p className="font-mono text-[10px] text-indigo-900 leading-relaxed">
        <span className="font-bold">&gt; AGENT_LOG:</span> {children}
      </p>
    </div>
  );
}

// ============================================
// DataRailItem - Legacy (kept for backward compatibility)
// ============================================
interface DataRailItemProps {
  /** Series label */
  label: string;
  /** Dot/line color (hex) */
  color: string;
  /** Current value (e.g., "$2,222") */
  value?: string;
  /** Change text (e.g., "+2.4%") */
  change?: string;
  /** Trend direction for change color */
  trend?: 'up' | 'down' | 'neutral';
  /** Additional className */
  className?: string;
}

export function DataRailItem({
  label,
  color,
  value,
  change,
  trend,
  className = '',
}: DataRailItemProps) {
  const changeColor = trend === 'up'
    ? 'text-emerald-600'
    : trend === 'down'
    ? 'text-red-600'
    : 'text-slate-400';

  return (
    <div className={`p-3 border-b border-slate-50 hover:bg-slate-50 cursor-default flex flex-col gap-1 ${className}`}>
      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-mono text-[10px] font-bold text-slate-700">{label}</span>
      </div>
      {(value || change) && (
        <span className="font-mono text-[10px] text-slate-400 ml-4">
          {value}{change && <span className={changeColor}> ({change})</span>}
        </span>
      )}
    </div>
  );
}

// Legacy alias for backward compatibility
export const FloatingLegendItem = DataRailItem;

// ============================================
// DataCardFooter - Bottom Context Bar
// ============================================
interface DataCardFooterProps {
  children: React.ReactNode;
  /** Right-aligned secondary text */
  secondary?: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function DataCardFooter({
  children,
  secondary,
  className = '',
}: DataCardFooterProps) {
  return (
    <div
      className={`
        bg-slate-50/50 border-t border-slate-200
        px-6 py-3 shrink-0
        flex justify-between items-center
        ${className}
      `.trim()}
    >
      {/* Sans for human context, numbers inherit mono from parent if needed */}
      <p className="font-sans text-xs text-slate-500">{children}</p>
      {secondary && (
        <p className="font-mono text-[10px] text-slate-400 uppercase tracking-tight">
          {secondary}
        </p>
      )}
    </div>
  );
}

// ============================================
// Legacy Exports (for backward compatibility)
// ============================================

/** @deprecated Use DataCardToolbar instead */
export const DataCardInsightStrip = DataCardToolbar;

/** @deprecated Use ToolbarLegend with LegendDot instead */
export function ChartLegendOverlay({
  children,
  position = 'top-left',
  className = '',
}: {
  children: React.ReactNode;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}) {
  const positionClasses = {
    'top-left': 'top-2 left-2',
    'top-right': 'top-2 right-2',
    'bottom-left': 'bottom-2 left-2',
    'bottom-right': 'bottom-2 right-2',
  };

  return (
    <div
      className={`
        absolute ${positionClasses[position]} z-10
        flex flex-wrap gap-x-4 gap-y-1
        text-xs text-slate-600
        bg-white/80 backdrop-blur-sm rounded px-2 py-1
        ${className}
      `.trim()}
    >
      {children}
    </div>
  );
}

/** @deprecated Use LegendDot instead */
export function LegendItem({
  label,
  color,
  lineStyle = 'solid',
  shape = 'line',
}: {
  label: string;
  color: string;
  lineStyle?: 'solid' | 'dashed';
  shape?: 'line' | 'circle' | 'square';
}) {
  return (
    <div className="flex items-center gap-1.5">
      {shape === 'line' && (
        <svg width="20" height="8" className="shrink-0">
          <line
            x1="0"
            y1="4"
            x2="20"
            y2="4"
            stroke={color}
            strokeWidth={2}
            strokeDasharray={lineStyle === 'dashed' ? '4 2' : undefined}
          />
        </svg>
      )}
      {shape === 'circle' && (
        <svg width="10" height="10" className="shrink-0">
          <circle cx="5" cy="5" r="4" fill={color} />
        </svg>
      )}
      {shape === 'square' && (
        <svg width="10" height="10" className="shrink-0">
          <rect x="1" y="1" width="8" height="8" fill={color} />
        </svg>
      )}
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

export default DataCard;
