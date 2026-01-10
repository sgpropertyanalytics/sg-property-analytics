import React from 'react';
import { HelpTooltip } from './HelpTooltip';

/**
 * DataCard - Universal Template with Status Deck
 *
 * Production-grade dashboard component template for ANY chart type.
 * IDE-style status bar pattern (like VS Code) at bottom.
 *
 * Slot Structure (fixed heights for pixel-perfect alignment):
 * - Layer 1: Header     h-14 (56px)  - Title + controls + (i) icon
 * - Layer 2: KPI Strip  h-20 (80px)  - Pure metrics (no color dots)
 * - Layer 3: Canvas     flex-grow    - Chart content
 * - Layer 4: StatusDeck h-10 (40px)  - Left: context | Center: legend | Right: data
 * - Layer 5: AI Drawer  hidden       - On-demand agent analysis
 *
 * Usage:
 *   <DataCard>
 *     <DataCardHeader title="Price Distribution" controls={<AgentButton />} />
 *     <DataCardToolbar>
 *       <ToolbarStat label="Median" value="$1.66M" />
 *       <ToolbarStat label="Q1-Q3" value="$1.2-2.3" />
 *     </DataCardToolbar>
 *     <DataCardCanvas>
 *       <Chart />
 *     </DataCardCanvas>
 *     <StatusDeck
 *       left={<StatusPeriod>60 Periods (Month)</StatusPeriod>}
 *       right={<><StatusCount count={15517} /><StatusBadge>Top 9% Hidden</StatusBadge></>}
 *     >
 *       <LegendLine label="CCR" color="#213448" />
 *       <LegendLine label="RCR" color="#547792" />
 *     </StatusDeck>
 *     <AgentFooter isOpen={isAgentOpen}>Analysis here</AgentFooter>
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
// ToolbarStat - Individual Stat Cell (Pure Metrics)
// ============================================
interface ToolbarStatProps {
  /** Stat label (uppercase, small) */
  label: string;
  /** Stat value (monospace, bold) */
  value: string | React.ReactNode;
  /** Optional subtext below value */
  subtext?: string;
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
      {/* Label row - pure metrics, no color dots */}
      <span
        className={`
          font-sans text-[10px] uppercase font-semibold tracking-wide mb-1
          ${highlight ? 'text-slate-600' : 'text-slate-400'}
        `.trim()}
      >
        {label}
      </span>
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
// DataCardCanvas - Flexible Chart Container
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
// StatusDeck - Fixed 40px Status Bar (Layer 4)
// IDE-style status bar with 3 zones: Left | Center Legend | Right
// ============================================
interface StatusDeckProps {
  /** Left zone: Technical context (e.g., "60 Periods (Month)") */
  left?: React.ReactNode;
  /** Center zone: Legend items */
  children?: React.ReactNode;
  /** Right zone: Data context (e.g., transaction count, badges) */
  right?: React.ReactNode;
  /** Additional className */
  className?: string;
}

export function StatusDeck({
  left,
  children,
  right,
  className = '',
}: StatusDeckProps) {
  return (
    <div
      className={`
        h-10 shrink-0
        border-t border-slate-200 bg-white
        flex items-center justify-between px-4
        z-10 relative
        ${className}
      `.trim()}
    >
      {/* Left Zone: Technical Context */}
      <div className="flex items-center gap-2 w-1/3">
        {left}
      </div>

      {/* Center Zone: Legend */}
      <div className="flex items-center justify-center gap-4 w-1/3">
        {children}
      </div>

      {/* Right Zone: Data Context */}
      <div className="flex items-center justify-end gap-2 w-1/3 text-right">
        {right}
      </div>
    </div>
  );
}

// ============================================
// StatusDeck Helper Components
// ============================================

/** Left zone: Period/view indicator with calendar icon */
export function StatusPeriod({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <span className="font-mono text-[9px] text-slate-400 uppercase tracking-tight">
        {children}
      </span>
    </div>
  );
}

/** Right zone: Transaction count */
export function StatusCount({ count, label = 'Txns' }: { count: number | string; label?: string }) {
  return (
    <span className="font-mono text-[9px] text-slate-500">
      <span className="font-bold text-slate-700">{typeof count === 'number' ? count.toLocaleString() : count}</span> {label}
    </span>
  );
}

/** Right zone: Warning/info badge (e.g., "Top 9% Hidden") */
export function StatusBadge({ children, variant = 'warning' }: { children: React.ReactNode; variant?: 'warning' | 'info' }) {
  const colors = variant === 'warning'
    ? 'text-orange-600 bg-orange-50 border-orange-100'
    : 'text-slate-600 bg-slate-50 border-slate-200';
  return (
    <span className={`font-mono text-[8px] ${colors} border px-1 rounded`}>
      {children}
    </span>
  );
}

// ============================================
// LegendLine - Single Legend Item with Line Swatch
// ============================================
interface LegendLineProps {
  /** Legend label */
  label: string;
  /** Line color (hex) */
  color: string;
  /** Line style */
  lineStyle?: 'solid' | 'dashed';
  /** Additional className */
  className?: string;
}

export function LegendLine({
  label,
  color,
  lineStyle = 'solid',
  className = '',
}: LegendLineProps) {
  return (
    <div
      className={`
        flex items-center gap-1.5
        cursor-pointer hover:opacity-75 transition-opacity
        ${className}
      `.trim()}
    >
      <div
        className="w-2.5 h-0.5"
        style={{
          backgroundColor: lineStyle === 'dashed' ? undefined : color,
          borderBottom: lineStyle === 'dashed' ? `2px dashed ${color}` : undefined,
        }}
      />
      <span className="font-mono text-[9px] font-bold text-slate-700 uppercase">
        {label}
      </span>
    </div>
  );
}

/** @deprecated Use StatusDeck instead */
export const DataCardLegendDock = StatusDeck;

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
