import { useDebugMode } from '../../context/DebugContext';

/**
 * DebugModeIndicator - Floating indicator when debug mode is active
 *
 * Shows in bottom-left corner when debug mode is enabled.
 * Click to toggle off.
 */
export function DebugModeIndicator() {
  const { debugMode, toggleDebugMode } = useDebugMode();

  if (!debugMode) return null;

  return (
    <button
      onClick={toggleDebugMode}
      className="fixed bottom-4 left-4 z-debug flex items-center gap-2 px-3 py-2 bg-black/90 text-green-400 text-xs font-mono rounded-lg shadow-lg border border-green-500/50 hover:bg-black transition-colors"
      title="Click to disable debug mode (or press Ctrl+Shift+D)"
    >
      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      <span>DEBUG MODE</span>
      <span className="text-green-600 text-[10px]">Ctrl+Shift+D</span>
    </button>
  );
}

export default DebugModeIndicator;
