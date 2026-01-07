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
        // Brand palette (Charts/Regions)
        brand: {
          navy: '#213448',      // CCR, primary
          blue: '#547792',      // RCR, secondary
          sky: '#94B4C1',       // OCR, tertiary
          sand: '#EAE0CF',      // Backgrounds, accents
        },
        // Region aliases
        region: {
          ccr: '#213448',
          rcr: '#547792',
          ocr: '#94B4C1',
        },
        // Supply palette (For supply/inventory charts)
        supply: {
          unsold: '#6b4226',    // Muted chocolate brown
          upcoming: '#9c6644',  // Muted terracotta
          gls: '#c4a77d',       // Muted camel/tan
          total: '#e8dcc8',     // Warm cream
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

