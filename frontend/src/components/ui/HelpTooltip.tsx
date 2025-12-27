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

interface HelpTooltipProps {
  content: string;
}

/**
 * HelpTooltip - Portal-based tooltip with auto-placement
 *
 * Uses Floating UI to:
 * - Render in portal (escapes overflow:hidden containers)
 * - Auto-flip when near edges
 * - Auto-shift to stay in viewport
 */
export function HelpTooltip({ content }: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ['bottom-end', 'top-start', 'top-end', 'right', 'left'] }),
      shift({ padding: 12 }),
    ],
  });

  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        className="w-3.5 h-3.5 flex items-center justify-center text-[9px] text-[#94B4C1] hover:text-[#547792] cursor-help transition-colors border border-[#94B4C1] rounded-full"
      >
        ?
      </span>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[9999] w-64 max-w-[calc(100vw-2rem)] p-3 bg-[#213448] text-white text-xs leading-relaxed rounded shadow-lg whitespace-pre-line"
          >
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export default HelpTooltip;
