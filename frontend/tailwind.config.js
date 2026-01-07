/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Monochromatic base (Primary for Weapon Aesthetic)
        mono: {
          void: '#0A0A0A',      // The void - nav background (denser than dark)
          surface: '#1A1A1A',   // Elevated surfaces on void
          edge: '#333333',      // Machined metal borders
          ink: '#000000',       // Pure black - headers, borders, emphasis
          dark: '#171717',      // Near-black - active states (inverted BG)
          mid: '#525252',       // Medium gray - body text
          light: '#A3A3A3',     // Light gray - secondary text, placeholders
          muted: '#E5E7EB',     // Border gray - structural lines
          canvas: '#FAFAFA',    // Soft off-white background
        },
        // Status colors (Surgical use only)
        status: {
          live: '#10B981',      // Emerald - ONLY for live/active indicators
          negative: '#FF5500',  // Orange - negative deltas
          positive: '#10B981',  // Alias for consistency
        },
        // Brand palette (Institutional Print / Slate)
        brand: {
          navy: '#0F172A',      // slate-900 - CCR, primary
          blue: '#334155',      // slate-700 - RCR, secondary
          sky: '#64748B',       // slate-500 - OCR, tertiary
          sand: '#E5E7EB',      // slate-200 - Backgrounds, accents
        },
        // Region aliases (Slate gradient: dark→light for CCR→OCR)
        region: {
          ccr: '#0F172A',       // slate-900
          rcr: '#334155',       // slate-700
          ocr: '#64748B',       // slate-500
        },
        // Supply palette (Slate progression - matches SUPPLY in colors.js)
        supply: {
          unsold: '#0F172A',    // Slate 900 - Heaviest (most urgent)
          upcoming: '#334155',  // Slate 700 - Pipeline
          gls: '#64748B',       // Slate 500 - GLS sites
          total: '#94A3B8',     // Slate 400 - Totals (lightest)
        },
        // Card backgrounds
        card: {
          DEFAULT: '#FFFCF5',
          hover: '#FFF9F0',
        },
      },
      fontFamily: {
        display: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
        data: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}

