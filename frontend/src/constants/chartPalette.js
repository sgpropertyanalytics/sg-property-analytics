export const CHART_COLORS = {
  // Base colors (CSS variables)
  navy: 'var(--color-chart-1)',
  ocean: 'var(--color-chart-2)',
  navyDeep: 'var(--color-navy-deep)',
  sky: 'var(--color-sky)',
  textMuted: 'var(--color-text-muted-strong)',
  white: 'var(--color-white)',

  // Slate palette - solid colors
  slate100: 'var(--color-slate-100)',
  slate200: 'var(--color-slate-200)',
  slate300: 'var(--color-slate-300)',
  slate400: 'var(--color-slate-400)',
  slate500: 'var(--color-slate-500)',
  slate600: 'var(--color-slate-600)',
  slate700: 'var(--color-slate-700)',
  slate800: 'var(--color-slate-800)',
  slate900: 'var(--color-slate-900)',

  // Grid and axis colors
  gridLight: 'rgb(var(--color-slate-900-rgb) / 0.05)',
  gridDefault: 'rgb(var(--color-slate-500-rgb) / 0.2)',

  // Slate alpha variants
  slate500Alpha30: 'rgb(var(--color-chart-3-rgb) / 0.3)',
  slate500Alpha70: 'rgb(var(--color-chart-3-rgb) / 0.7)',
  slate700Alpha: (alpha) => `rgb(var(--color-chart-2-rgb) / ${alpha})`,
  slate700Alpha05: 'rgb(var(--color-slate-700-rgb) / 0.05)',
  slate700Alpha08: 'rgb(var(--color-slate-700-rgb) / 0.08)',
  slate700Alpha15: 'rgb(var(--color-slate-700-rgb) / 0.15)',

  // Navy alpha variants
  navyAlpha05: 'rgb(var(--color-chart-1-rgb) / 0.05)',
  navyAlpha90: 'rgb(var(--color-chart-1-rgb) / 0.9)',
  navyAlpha95: 'rgb(var(--color-chart-1-rgb) / 0.95)',

  // Navy deep alpha variants
  navyDeepAlpha04: 'rgb(var(--color-navy-deep-rgb) / 0.04)',
  navyDeepAlpha05: 'rgb(var(--color-navy-deep-rgb) / 0.05)',
  navyDeepAlpha08: 'rgb(var(--color-navy-deep-rgb) / 0.08)',
  navyDeepAlpha10: 'rgb(var(--color-navy-deep-rgb) / 0.1)',
  navyDeepAlpha20: 'rgb(var(--color-navy-deep-rgb) / 0.2)',
  navyDeepAlpha50: 'rgb(var(--color-navy-deep-rgb) / 0.5)',
  navyDeepAlpha80: 'rgb(var(--color-navy-deep-rgb) / 0.8)',
  navyDeepAlpha90: 'rgb(var(--color-navy-deep-rgb) / 0.9)',

  // Ocean alpha variants
  oceanAlpha10: 'rgb(var(--color-ocean-rgb) / 0.1)',
  oceanAlpha80: 'rgb(var(--color-ocean-rgb) / 0.8)',
  oceanAlpha100: 'rgb(var(--color-ocean-rgb) / 1)',

  // Sky alpha variants
  skyAlpha08: 'rgb(var(--color-sky-rgb) / 0.08)',
  skyAlpha15: 'rgb(var(--color-sky-rgb) / 0.15)',
  skyAlpha20: 'rgb(var(--color-sky-rgb) / 0.2)',
  skyAlpha30: 'rgb(var(--color-sky-rgb) / 0.3)',

  // Red/danger alpha variants
  redAlpha08: 'rgb(var(--color-red-rgb) / 0.08)',
  redAlpha12: 'rgb(var(--color-red-rgb) / 0.12)',
  redAlpha20: 'rgb(var(--color-red-rgb) / 0.2)',
  redAlpha25: 'rgb(var(--color-red-rgb) / 0.25)',

  // Emerald/success alpha variants
  emeraldAlpha08: 'rgb(var(--color-emerald-rgb) / 0.08)',
  emeraldAlpha12: 'rgb(var(--color-emerald-rgb) / 0.12)',
  emeraldAlpha20: 'rgb(var(--color-emerald-rgb) / 0.2)',

  // Orange/warning alpha variants
  orangeAlpha20: 'rgb(var(--color-orange-rgb) / 0.20)',

  // Yellow alpha variants
  yellowAlpha18: 'rgb(var(--color-yellow-rgb) / 0.18)',

  // Supply waterfall colors (browns)
  supplyUnsold: 'var(--color-supply-unsold)',
  supplyUpcoming: 'var(--color-supply-upcoming)',
  supplyGls: 'var(--color-supply-gls)',
};
