import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

const STORAGE_KEY = 'theme';
const THEMES = {
  light: 'light',
  dark: 'dark',
};

function getInitialTheme() {
  if (typeof window === 'undefined') return THEMES.light;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === THEMES.dark || stored === THEMES.light) {
    return stored;
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? THEMES.dark : THEMES.light;
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === THEMES.dark ? THEMES.light : THEMES.dark));
  };

  const value = useMemo(() => ({ theme, toggleTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
      <button
        type="button"
        onClick={toggleTheme}
        className="fixed bottom-4 right-4 z-50 border border-mono-muted bg-mono-canvas px-3 py-2 text-xs font-mono uppercase tracking-[0.18em] text-mono-ink shadow-sm hover:bg-mono-muted/40"
        aria-label="Toggle theme"
      >
        {theme === THEMES.dark ? 'Light Mode' : 'Dark Mode'}
      </button>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
