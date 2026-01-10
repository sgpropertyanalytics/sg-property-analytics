import React, { useState } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  useHover,
  useFocus,
  useInteractions,
  useRole,
  useDismiss,
  FloatingPortal,
} from '@floating-ui/react';

/**
 * KeyInsightBox - Plain English summary for chart insights
 *
 * Used to display key takeaways in a prominent, scannable format
 * that helps users understand what the data means.
 *
 * @param {{
 *  icon?: import('react').ReactNode,
 *  title?: string,
 *  children?: import('react').ReactNode,
 *  variant?: 'default' | 'positive' | 'warning' | 'info',
 *  compact?: boolean,
 *  className?: string,
 *  tooltip?: string | null,
 * }} props
 */
export function KeyInsightBox({
  icon = null,
  title = 'Key Takeaway',
  children,
  variant = 'default',
  compact = false,
  className = '',
  tooltip = null,
}) {
  const variants = {
    default: 'bg-gradient-to-r from-[#0F172A]/5 to-[#334155]/5',  // slate-900 to slate-700
    positive: 'bg-gradient-to-r from-green-50 to-emerald-50',
    warning: 'bg-gradient-to-r from-amber-50 to-yellow-50',
    info: 'bg-brand-sand/30',
  };

  const iconColors = {
    default: 'bg-brand-blue/20 text-brand-blue',
    positive: 'bg-green-100 text-green-600',
    warning: 'bg-amber-100 text-amber-600',
    info: 'bg-brand-sky/30 text-brand-blue',
  };

  // Standardized [i] icon for all variants (3-Layer Card System)
  // Clean, minimal info icon that signals "methodology/context available"
  const infoIcon = (
    <span className="font-mono font-bold text-current select-none" style={{ fontSize: 'inherit' }}>
      i
    </span>
  );

  // All variants use the same [i] icon for consistency
  const defaultIcons = {
    default: infoIcon,
    positive: infoIcon,
    warning: infoIcon,
    info: infoIcon,
  };

  const displayIcon = icon || defaultIcons[variant];

  // Compact mode uses smaller sizes for chart explanations
  const padding = compact ? 'px-3 py-2' : 'px-4 py-3';
  const iconSize = compact ? 'w-5 h-5 text-xs' : 'w-6 h-6 text-sm';
  const titleSize = compact ? 'text-xs' : 'text-sm';
  const contentSize = compact ? 'text-[11px]' : 'text-sm';
  const gap = compact ? 'gap-2' : 'gap-3';

  // Use displayIcon directly (no cloning needed for text-based icon)
  const sizedIcon = displayIcon;

  // Tooltip state and floating UI setup
  const [isTooltipOpen, setIsTooltipOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open: isTooltipOpen,
    onOpenChange: setIsTooltipOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ['bottom-end', 'top-start', 'top-end', 'right'] }),
      shift({ padding: 12 }),
    ],
  });

  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role]);

  return (
    <div className={`${padding} ${variants[variant]} border-b border-brand-sky/30 ${className}`}>
      <div className={`flex items-start ${gap}`}>
        {tooltip ? (
          <>
            <div
              ref={refs.setReference}
              {...getReferenceProps()}
              className={`${iconSize} rounded-full flex items-center justify-center flex-shrink-0 ${iconColors[variant]} cursor-help transition-opacity hover:opacity-80`}
            >
              {sizedIcon}
            </div>
            {isTooltipOpen && (
              <FloatingPortal>
                <div
                  ref={refs.setFloating}
                  style={floatingStyles}
                  {...getFloatingProps()}
                  className="z-toast w-72 max-w-[calc(100vw-2rem)] p-3 bg-brand-navy text-white text-xs leading-relaxed rounded shadow-lg whitespace-pre-line"
                >
                  {tooltip}
                </div>
              </FloatingPortal>
            )}
          </>
        ) : (
          <div className={`${iconSize} rounded-full flex items-center justify-center flex-shrink-0 ${iconColors[variant]}`}>
            {sizedIcon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-semibold text-brand-navy ${titleSize} mb-0.5`}>{title}</h4>
          )}
          <div className={`${contentSize} text-brand-blue leading-relaxed`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

export default KeyInsightBox;
