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

  // Default icons per variant
  const defaultIcons = {
    default: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    positive: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  };

  const displayIcon = icon || defaultIcons[variant];

  // Compact mode uses smaller sizes for chart explanations
  const padding = compact ? 'px-3 py-2' : 'px-4 py-3';
  const iconSize = compact ? 'w-6 h-6' : 'w-8 h-8';
  const iconSvgSize = compact ? 'w-3.5 h-3.5' : 'w-5 h-5';
  const titleSize = compact ? 'text-xs' : 'text-sm';
  const contentSize = compact ? 'text-[11px]' : 'text-sm';
  const gap = compact ? 'gap-2' : 'gap-3';

  // Clone icon with correct size if it's a default icon
  const sizedIcon = displayIcon && React.cloneElement(displayIcon, {
    className: iconSvgSize
  });

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
