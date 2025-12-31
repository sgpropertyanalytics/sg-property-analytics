import { createContext, useContext, useState, useEffect, useCallback } from 'react';

/**
 * DebugContext - Global debug mode for API call diagnostics
 *
 * Toggle via:
 * - Keyboard: Ctrl+Shift+D (or Cmd+Shift+D on Mac)
 * - URL: ?debug=1
 * - Console: window.__DEBUG_MODE__ = true
 *
 * When enabled, charts show overlay with:
 * - Endpoint called
 * - Params sent
 * - Record count
 * - Warnings from backend
 * - Request ID for tracing
 */

const DebugContext = createContext({
  debugMode: false,
  toggleDebugMode: () => {},
  registerDebugInfo: () => {},
  getDebugInfo: () => null,
});

export function DebugProvider({ children }) {
  const [debugMode, setDebugMode] = useState(() => {
    // Check URL param on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('debug') === '1') return true;
      // Check global flag
      if (window.__DEBUG_MODE__) return true;
    }
    return false;
  });

  // Store debug info by component ID
  const [debugRegistry, setDebugRegistry] = useState({});

  const toggleDebugMode = useCallback(() => {
    setDebugMode(prev => {
      const next = !prev;
      // Sync to global for console access
      if (typeof window !== 'undefined') {
        window.__DEBUG_MODE__ = next;
      }
      console.log(`[Debug] Mode ${next ? 'ENABLED' : 'DISABLED'} - Press Ctrl+Shift+D to toggle`);
      return next;
    });
  }, []);

  // Register debug info for a component
  const registerDebugInfo = useCallback((componentId, info) => {
    setDebugRegistry(prev => ({
      ...prev,
      [componentId]: {
        ...info,
        timestamp: Date.now(),
      },
    }));
  }, []);

  // Get debug info for a component
  const getDebugInfo = useCallback((componentId) => {
    return debugRegistry[componentId] || null;
  }, [debugRegistry]);

  // Keyboard shortcut: Ctrl+Shift+D (Cmd+Shift+D on Mac)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        toggleDebugMode();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleDebugMode]);

  // Expose toggle on window for console access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__toggleDebugMode__ = toggleDebugMode;
      window.__DEBUG_MODE__ = debugMode;
    }
  }, [toggleDebugMode, debugMode]);

  return (
    <DebugContext.Provider value={{
      debugMode,
      toggleDebugMode,
      registerDebugInfo,
      getDebugInfo,
    }}>
      {children}
    </DebugContext.Provider>
  );
}

export function useDebugMode() {
  const context = useContext(DebugContext);
  if (!context) {
    // Return safe defaults if used outside provider
    return { debugMode: false, toggleDebugMode: () => {}, registerDebugInfo: () => {}, getDebugInfo: () => null };
  }
  return context;
}

export default DebugContext;
