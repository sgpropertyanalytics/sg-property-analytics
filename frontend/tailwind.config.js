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
          void: 'var(--color-void)',      // The void - nav background (denser than dark)
          surface: 'var(--color-void-surface)',   // Elevated surfaces on void
          edge: 'var(--color-void-edge)',      // Machined metal borders
          ink: 'var(--color-ink)',       // Pure black - headers, borders, emphasis
          dark: 'var(--color-void-surface)',      // Near-black - active states (inverted BG)
          mid: 'var(--color-ink-mid)',       // Medium gray - body text
          light: 'var(--color-ink-muted)',     // Light gray - secondary text, placeholders
          muted: 'var(--color-canvas-grid)',     // Border gray - structural lines
          canvas: 'var(--color-canvas)',    // Soft off-white background
        },
        // Status colors (Surgical use only)
        status: {
          live: 'var(--color-status-live)',      // Emerald - ONLY for live/active indicators
          negative: 'var(--color-status-negative)',  // Orange - negative deltas
          positive: 'var(--color-status-live)',  // Alias for consistency
        },
        // Brand palette (Institutional Print / Slate)
        brand: {
          navy: 'var(--color-brand-navy)',      // slate-900 - CCR, primary
          blue: 'var(--color-brand-blue)',      // slate-700 - RCR, secondary
          sky: 'var(--color-brand-sky)',       // slate-500 - OCR, tertiary
          sand: 'var(--color-brand-sand)',      // slate-200 - Backgrounds, accents
        },
        // Region aliases (Slate gradient: dark→light for CCR→OCR)
        region: {
          ccr: 'var(--color-region-ccr)',       // slate-900
          rcr: 'var(--color-region-rcr)',       // slate-700
          ocr: 'var(--color-region-ocr)',       // slate-500
        },
        // Supply palette (Slate progression - matches SUPPLY in colors.js)
        supply: {
          unsold: 'var(--color-supply-unsold)',    // Slate 900 - Heaviest (most urgent)
          upcoming: 'var(--color-supply-upcoming)',  // Slate 700 - Pipeline
          gls: 'var(--color-supply-gls)',       // Slate 500 - GLS sites
          total: 'var(--color-supply-total)',     // Slate 400 - Totals (lightest)
        },
        // Card backgrounds
        card: {
          DEFAULT: 'var(--color-card)',
          hover: 'var(--color-card-hover)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)'],
        data: ['var(--font-mono)'],
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      spacing: {
        0: 'var(--space-0)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
        20: 'var(--space-20)',
        24: 'var(--space-24)',
      },
      borderRadius: {
        none: 'var(--radius-none)',
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
      },
      maxWidth: {
        content: 'var(--size-container-max)',
      },
      zIndex: {
        base: 'var(--z-base)',
        nav: 'var(--z-nav)',
        overlay: 'var(--z-overlay)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
    },
  },
  plugins: [],
}
