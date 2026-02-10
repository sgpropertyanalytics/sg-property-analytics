import React from 'react';
import { HelpTooltip } from './HelpTooltip';

/**
 * DataCard - Universal Template with Two Layout Modes
 *
 * Production-grade dashboard component template for ANY chart type.
 *
 * ═══════════════════════════════════════════════════════════════════
 * LAYOUT MODE 1: FOOTERLESS STANDARD (Recommended)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 3-layer structure that maximizes chart area:
 * - Layer 1: Header (High Density)  h-14 - Title + Metadata + Controls
 * - Layer 2: KPI Strip              h-20 - Pure metrics
 * - Layer 3: Canvas + FloatingLegend     - Chart with legend in safe zone
 *
 * Key Engineering: The FloatingLegend sits in a Y-axis buffer zone.
 * Configure chart's Y-axis with 20% buffer to create the "safe zone":
 *
 *   scales: {
 *     y: {
 *       max: dataMax => dataMax * 1.2,  // Creates invisible air gap
 *     }
 *   }
 *
 * Usage (Footerless):
 *   <DataCard>
 *     <DataCardHeader
 *       title="Price Distribution"
 *       subtitle="District 10 • Freehold"
 *       metadata={
 *         <div className="flex items-center gap-4">
 *           <HeaderMetaBadge count={15517} />
 *           <span className="text-slate-400">2021 - 2024</span>
 *         </div>
 *       }
 *     />
 *     <DataCardToolbar>
 *       <ToolbarStat label="Median" value="$1.66M" />
 *     </DataCardToolbar>
 *     <DataCardCanvas>
 *       <FloatingLegend>
 *         <LegendDot label="CCR" color="#213448" />
 *         <LegendDot label="RCR" color="#547792" />
 *       </FloatingLegend>
 *       <Chart options={{ scales: { y: { max: d => d * 1.2 } } }} />
 *     </DataCardCanvas>
 *   </DataCard>
 *
 * ═══════════════════════════════════════════════════════════════════
 * LAYOUT MODE 2: STATUS DECK (Legacy)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 5-layer structure with IDE-style status bar:
 * - Layer 1: Header     h-14 (56px)  - Title + controls + (i) icon
 * - Layer 2: KPI Strip  h-20 (80px)  - Pure metrics (no color dots)
 * - Layer 3: Canvas     flex-grow    - Chart content
 * - Layer 4: StatusDeck h-10 (40px)  - Left: context | Center: legend | Right: data
 * - Layer 5: AI Drawer  hidden       - On-demand agent analysis
 *
 * Usage (StatusDeck):
 *   <DataCard>
 *     <DataCardHeader title="Price Distribution" controls={<AgentButton />} />
 *     <DataCardToolbar>
 *       <ToolbarStat label="Median" value="$1.66M" />
 *     </DataCardToolbar>
 *     <DataCardCanvas>
 *       <Chart />
 *     </DataCardCanvas>
 *     <StatusDeck
 *       left={<StatusPeriod>60 Periods (Month)</StatusPeriod>}
 *       right={<><StatusCount count={15517} /><StatusBadge>Top 9% Hidden</StatusBadge></>}
 *     >
 *       <LegendLine label="CCR" color="#213448" />
 *     </StatusDeck>
 *   </DataCard>
 */

// ============================================
// DataCard - Main Container
// ============================================
interface DataCardProps {
  children: React.ReactNode;
  /**
   * Layout variant:
   * - "standalone": Full card styling (bg, border, shadow) - for use outside sections
   * - "embedded": No container chrome - integrates seamlessly into parent section
   */
  variant?: 'standalone' | 'embedded';
  className?: string;
}

export function DataCard({ children, variant = 'standalone', className = '' }: DataCardProps) {
  // Embedded variant removes container chrome for "blueprint" integration
  // Chart axes align directly with parent section's grid
  const containerStyles = variant === 'embedded'
    ? 'flex flex-col'
    : 'bg-white border border-slate-300 rounded-sm shadow-[2px_2px_0px_0px_rgba(0,0,0,0.05)] flex flex-col overflow-hidden';

  return (
    <div className={`${containerStyles} ${className}`.trim()}>
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
  /** Logic/methodology text shown in grey inset below title */
  logic?: string;
  /** Methodology text shown in hover tooltip (i) icon */
  info?: string;
  /** Optional controls (toggles, buttons) on right side */
  controls?: React.ReactNode;
  /** Metadata displayed on far right (e.g., transaction count) */
  metadata?: React.ReactNode;
  /** @deprecated No longer used */
  anchored?: boolean;
  /** Additional className */
  className?: string;
}

export function DataCardHeader({
  title,
  logic,
  info,
  controls,
  metadata,
  anchored: _anchored = false, // deprecated
  className = '',
}: DataCardHeaderProps) {
  return (
    <div className={`flex flex-col w-full shrink-0 border-b border-slate-200 ${className}`.trim()}>

      {/* 1. Title Row */}
      <div className="flex items-center h-10 px-6 bg-white">
        {/* Accent Anchor */}
        <div className="w-1.5 h-5 bg-slate-800 mr-3 shrink-0" />

        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
          {title}
        </h3>

        {/* Info Tooltip */}
        {info && (
          <span className="ml-2">
            <HelpTooltip content={info} trigger="info" />
          </span>
        )}

        {/* Spacer */}
        <div className="flex-grow" />

        {/* Controls + Metadata */}
        {(controls || metadata) && (
          <div className="flex items-center gap-4 shrink-0">
            {controls}
            {metadata && (
              <div className="font-mono text-[10px] text-slate-500 tabular-nums">
                {metadata}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Logic Inset - unified grey panel */}
      {logic && (
        <div className="w-full bg-slate-50 px-6 py-2 border-t border-slate-100 flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold text-emerald-600 select-none">
            {'>_'}
          </span>
          <p className="font-mono text-[10px] text-slate-500 uppercase tracking-tight">
            {logic}
          </p>
        </div>
      )}

    </div>
  );
}

// ============================================
// DataCardDescription - System Logic Strip
// ============================================
/**
 * DataCardDescription - Terminal-style logic strip below header.
 *
 * Creates a "System Logic Strip" aesthetic:
 * - bg-slate-50 differentiates from white content area
 * - font-mono uppercase = "System" voice, not "Human" voice
 * - >_ prompt mimics terminal/computed logic
 * - border-y creates distinct "track" for data
 *
 * Usage:
 *   <DataCard>
 *     <DataCardHeader title="Chart Title" />
 *     <DataCardDescription>
 *       IF: NARROWING → CATCH_UP | IF: WIDENING → OUTPERFORM
 *     </DataCardDescription>
 *     <DataCardCanvas>...</DataCardCanvas>
 *   </DataCard>
 */
interface DataCardDescriptionProps {
  /** Logic/description text */
  children?: React.ReactNode;
  /** Additional className */
  className?: string;
  /** Style variant: 'console' (default) or 'default' */
  variant?: 'default' | 'console';
}

export function DataCardDescription({
  children,
  className = '',
  variant = 'console',
}: DataCardDescriptionProps) {
  if (!children) return null;

  return (
    <div
      className={`
        h-6 px-6 shrink-0
        flex
        ${className}
      `.trim()}
    >
      {/* 1. The Tree Connector */}
      {variant === 'console' && (
        <div className="w-1.5 flex justify-center shrink-0">
          {/* Vertical line from header */}
          <div className="w-px bg-slate-300 h-full" />
        </div>
      )}

      {/* 2. The Elbow + Content */}
      <div className="relative flex items-center pl-3">
        {/* Horizontal dash (the elbow) */}
        {variant === 'console' && (
          <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300" />
        )}

        {/* Terminal Prompt + Logic Text */}
        <div className="flex items-center gap-2 ml-1">
          {variant === 'console' && (
            <span className="font-mono text-[10px] font-bold text-emerald-600 select-none">
              {'>_'}
            </span>
          )}
          <p className={`
            text-[10px] leading-none tracking-wide truncate
            ${variant === 'console' ? 'font-mono uppercase text-slate-500' : 'text-xs text-slate-500'}
          `}>
            {children}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// HeaderMetaBadge - Styled metadata badge for header
// ============================================
/**
 * HeaderMetaBadge - Compact metadata badge for high-density header.
 *
 * Use in DataCardHeader's metadata prop for transaction counts, etc.
 *
 * Usage:
 *   <DataCardHeader
 *     title="Price Distribution"
 *     metadata={
 *       <div className="flex items-center gap-4">
 *         <HeaderMetaBadge count={15517} />
 *         <span className="text-slate-400">2021 - 2024</span>
 *       </div>
 *     }
 *   />
 */
interface HeaderMetaBadgeProps {
  /** Transaction/data count */
  count: number;
  /** Label after count (default: none, just "N = X") */
  label?: string;
  /** Show green indicator dot (default: true) */
  showIndicator?: boolean;
  /** Additional className */
  className?: string;
}

export function HeaderMetaBadge({
  count,
  label,
  showIndicator = true,
  className = '',
}: HeaderMetaBadgeProps) {
  return (
    <div
      className={`
        flex items-center gap-1.5
        bg-slate-50 px-2 py-1 rounded
        border border-slate-100
        font-mono text-[10px] text-slate-500
        ${className}
      `.trim()}
    >
      {showIndicator && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      )}
      <span>
        {label ? (
          <>
            <span className="font-bold text-slate-700">{count.toLocaleString()}</span> {label}
          </>
        ) : (
          <>N = {count.toLocaleString()}</>
        )}
      </span>
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
  /** Blur for non-authenticated users */
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
  /** Cinema mode: minimal horizontal padding for panoramic aspect ratio */
  cinema?: boolean;
  /** Additional className */
  className?: string;
}

export function DataCardCanvas({
  children,
  minHeight = 300,
  cinema = false,
  className = '',
}: DataCardCanvasProps) {
  // Cinema mode: tight horizontal padding for edge-to-edge chart
  // Standard mode: p-6 for comfortable spacing
  const paddingClass = cinema ? 'px-2 py-4' : 'p-6';

  return (
    <div
      className={`flex-grow ${paddingClass} relative ${className}`}
      style={{ minHeight }}
    >
      {children}
    </div>
  );
}

// ============================================
// FloatingLegend - Legend in Chart's Safe Zone
// ============================================
/**
 * FloatingLegend - Floating legend positioned in the chart's Y-axis buffer zone.
 *
 * IMPORTANT: To prevent legend overlapping data, you MUST configure the chart's
 * Y-axis with a 20% buffer:
 *
 *   scales: {
 *     y: {
 *       max: dataMax => dataMax * 1.2,  // 20% buffer creates the "safe zone"
 *     }
 *   }
 *
 * This creates invisible "air gap" at top of chart where no data can reach.
 *
 * Usage:
 *   <DataCardCanvas>
 *     <FloatingLegend>
 *       <LegendDot label="CCR" color="#213448" />
 *       <LegendDot label="RCR" color="#547792" />
 *     </FloatingLegend>
 *     <Chart options={{ scales: { y: { max: dataMax => dataMax * 1.2 } } }} />
 *   </DataCardCanvas>
 */
interface FloatingLegendProps {
  children: React.ReactNode;
  /** Position: 'top-center' (default), 'top-left', 'top-right' */
  position?: 'top-center' | 'top-left' | 'top-right';
  /** Additional className */
  className?: string;
}

export function FloatingLegend({
  children,
  position = 'top-center',
  className = '',
}: FloatingLegendProps) {
  const positionClasses = {
    'top-center': 'top-2 left-1/2 -translate-x-1/2',
    'top-left': 'top-2 left-4',
    'top-right': 'top-2 right-4',
  };

  return (
    <div
      className={`
        absolute ${positionClasses[position]} z-10
        flex items-center gap-4
        bg-white/80 backdrop-blur-sm
        px-3 py-1.5 rounded-full
        border border-slate-100 shadow-sm
        ${className}
      `.trim()}
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
  /** Agent log/analysis content (static fallback or streamed response) */
  children?: React.ReactNode;
  /** Whether AI is currently streaming response */
  isStreaming?: boolean;
  /** Error message if AI interpretation failed */
  error?: string | null;
  /** Version metadata from AI service */
  versions?: {
    snapshot_version?: string;
    data_watermark?: string;
  } | null;
  /** Whether response was served from cache */
  isCached?: boolean;
  /** Additional className */
  className?: string;
}

export function AgentFooter({
  isOpen,
  children,
  isStreaming = false,
  error = null,
  versions = null,
  isCached = false,
  className = '',
}: AgentFooterProps) {
  if (!isOpen) return null;

  // Error state
  if (error) {
    return (
      <div className={`border-t border-red-200 bg-red-50/50 p-3 ${className}`}>
        <p className="font-mono text-[10px] text-red-700 leading-relaxed">
          <span className="font-bold">&gt; AGENT_ERROR:</span> {error}
        </p>
      </div>
    );
  }

  // Streaming state (no content yet)
  if (isStreaming && !children) {
    return (
      <div className={`border-t border-indigo-100 bg-indigo-50/30 p-3 ${className}`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          <p className="font-mono text-[10px] text-indigo-700">
            <span className="font-bold">&gt; AGENT_THINKING</span>
            <span className="animate-pulse">...</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`border-t border-indigo-100 bg-indigo-50/30 p-3 ${className}`}>
      {/* Freshness metadata */}
      {versions && (
        <div className="flex items-center gap-3 mb-2 text-[9px] font-mono text-indigo-400">
          {versions.data_watermark && (
            <span>Data through: {versions.data_watermark}</span>
          )}
          {isCached && (
            <span className="px-1 py-0.5 bg-indigo-100 rounded text-indigo-500">
              cached
            </span>
          )}
        </div>
      )}
      {/* Response content */}
      <div className="font-mono text-[10px] text-indigo-900 leading-relaxed whitespace-pre-wrap">
        <span className="font-bold">&gt; AGENT_LOG:</span>{' '}
        {children}
        {isStreaming && (
          <span className="inline-block w-1.5 h-3 ml-0.5 bg-indigo-500 animate-pulse" />
        )}
      </div>
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
