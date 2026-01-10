import { useState } from 'react';
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
  /** Custom trigger element. Defaults to "?" icon */
  trigger?: 'question' | 'info';
  /** Optional title shown in tooltip */
  title?: string;
}

/**
 * HelpTooltip - Portal-based tooltip with auto-placement
 *
 * Uses Floating UI to:
 * - Render in portal (escapes overflow:hidden containers)
 * - Auto-flip when near edges
 * - Auto-shift to stay in viewport
 *
 * Trigger variants:
 * - 'question' (default): "?" icon for help text
 * - 'info': "i" icon for methodology/interpretation
 */
export function HelpTooltip({ content, trigger = 'question', title }: HelpTooltipProps) {
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

  // Trigger styles based on variant
  const triggerStyles = trigger === 'info'
    ? 'w-5 h-5 flex items-center justify-center text-[10px] font-mono font-bold bg-slate-200/80 text-slate-500 hover:bg-slate-300/80 hover:text-slate-600 cursor-help transition-colors rounded-full'
    : 'w-3.5 h-3.5 flex items-center justify-center text-[9px] text-[#64748B] hover:text-[#334155] cursor-help transition-colors border border-[#64748B] rounded-full';

  const triggerContent = trigger === 'info' ? 'i' : '?';

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps()}
        className={triggerStyles}
        aria-label={trigger === 'info' ? 'Show methodology' : 'Help'}
      >
        {triggerContent}
      </span>
      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            {...getFloatingProps()}
            className="w-72 max-w-[calc(100vw-2rem)] p-3 text-xs leading-relaxed rounded shadow-lg whitespace-pre-line"
            style={{
              ...floatingStyles,
              zIndex: 9999,
              backgroundColor: '#213448',
              color: '#ffffff'
            }}
          >
            {title && (
              <div className="font-semibold mb-1.5" style={{ color: '#94B4C1' }}>
                {title}
              </div>
            )}
            {content}
          </div>
        </FloatingPortal>
      )}
    </>
  );
}

export default HelpTooltip;
