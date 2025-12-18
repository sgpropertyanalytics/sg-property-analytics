---
name: dashboard-frontend-design
description: Create distinctive, professional frontend interfaces for data-heavy analytics dashboards. Use this skill when building or styling dashboard pages, analytics interfaces, data visualization layouts, or any UI that displays charts, tables, and metrics. Combines high design quality with data readability requirements. Avoids generic AI aesthetics while maintaining professional clarity suitable for financial/property analytics.
---

# Dashboard Frontend Design

This skill adapts Anthropic's frontend-design principles specifically for **data analytics dashboards**. It balances distinctive aesthetics with the functional requirements of data-heavy interfaces.

## Design Philosophy for Dashboards

### The Core Tension
- **Generic AI dashboards**: Boring, forgettable, purple gradients, Inter font
- **Over-designed dashboards**: Beautiful but hard to read, style over substance
- **Goal**: Distinctive AND functional. Memorable AND readable.

### Design Principles

1. **Data First, Style Second**
   - Numbers, charts, and metrics must be instantly scannable
   - Visual design supports comprehension, never competes with it
   - Hierarchy guides the eye: KPIs → Charts → Details

2. **Professional Distinctiveness**
   - Avoid generic SaaS aesthetic (purple/blue gradients, rounded everything)
   - Create a recognizable visual identity
   - But stay within "professional" bounds (no chaos, no brutalism)

3. **Refined, Not Flashy**
   - Subtle details that reward attention
   - Micro-interactions that feel polished, not distracting
   - Color accents that highlight, not overwhelm

## Aesthetic Directions (Choose One)

### Option A: "Dark Terminal" (Recommended for financial data)
```
Inspiration: Bloomberg Terminal, Trading interfaces
- Background: Near-black (#0a0a0a to #1a1a1a)
- Text: High contrast whites and grays
- Accents: Electric green (#00ff88), amber (#ffb800), or cyan (#00d4ff)
- Typography: Monospace for numbers, geometric sans for labels
- Feel: Dense, information-rich, professional
```

### Option B: "Light Editorial"
```
Inspiration: Financial Times, The Economist data viz
- Background: Warm off-white (#faf8f5)
- Text: Deep charcoal (#1a1a1a)
- Accents: Salmon/coral (#ff6b6b), navy (#1e3a5f), gold (#c9a227)
- Typography: Serif headlines, clean sans body
- Feel: Authoritative, sophisticated, print-inspired
```

### Option C: "Modern Minimal"
```
Inspiration: Linear, Vercel, Stripe dashboards
- Background: Pure white or subtle gray (#fafafa)
- Text: True black with gray hierarchy
- Accents: Single bold color (your brand color)
- Typography: Modern geometric sans (but NOT Inter/Roboto)
- Feel: Clean, spacious, contemporary
```

### Option D: "Warm Professional"
```
Inspiration: Notion, Airtable
- Background: Soft cream (#fffef5) or light warm gray
- Text: Warm dark brown (#2d2a26)
- Accents: Terracotta (#c65d3b), sage (#6b8e6b), warm gold
- Typography: Friendly rounded sans
- Feel: Approachable, warm, less clinical
```

## Typography Guidelines

### Font Pairing Strategy
```css
/* Display/Headlines: Distinctive, memorable */
--font-display: 'Outfit', 'Syne', 'Cabinet Grotesk', 'General Sans';

/* Body/UI: Highly readable, professional */
--font-body: 'DM Sans', 'Plus Jakarta Sans', 'Satoshi', 'Geist';

/* Data/Numbers: Tabular, monospace-like */
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', 'Fira Code';
```

### NEVER Use
- Inter (overused AI default)
- Roboto (Google generic)
- Arial/Helvetica (system defaults)
- Space Grotesk (becoming AI cliché)
- Poppins (overused in generic dashboards)

### Typography Scale
```css
/* Readable hierarchy for data interfaces */
--text-xs: 0.75rem;    /* 12px - fine print, timestamps */
--text-sm: 0.875rem;   /* 14px - secondary labels, table cells */
--text-base: 1rem;     /* 16px - body text, descriptions */
--text-lg: 1.125rem;   /* 18px - card titles, section headers */
--text-xl: 1.25rem;    /* 20px - page section titles */
--text-2xl: 1.5rem;    /* 24px - page titles */
--text-3xl: 2rem;      /* 32px - hero metrics/KPIs */
```

## Color System

### Building a Dashboard Palette
```css
:root {
  /* Base (background layers) */
  --bg-primary: #0f0f0f;      /* Main background */
  --bg-secondary: #1a1a1a;    /* Card backgrounds */
  --bg-tertiary: #252525;     /* Elevated elements */
  
  /* Text hierarchy */
  --text-primary: #ffffff;     /* Headlines, important numbers */
  --text-secondary: #a0a0a0;   /* Labels, descriptions */
  --text-muted: #666666;       /* Timestamps, fine print */
  
  /* Accent (pick ONE dominant) */
  --accent-primary: #00d4aa;   /* Main brand/action color */
  --accent-hover: #00f5c4;     /* Hover state */
  
  /* Semantic (for data) */
  --positive: #22c55e;         /* Up, good, success */
  --negative: #ef4444;         /* Down, bad, error */
  --neutral: #6b7280;          /* Unchanged, neutral */
  --warning: #f59e0b;          /* Caution, attention */
  
  /* Chart palette (harmonious, distinguishable) */
  --chart-1: #00d4aa;
  --chart-2: #6366f1;
  --chart-3: #f59e0b;
  --chart-4: #ec4899;
  --chart-5: #8b5cf6;
}
```

### Color Anti-Patterns
```css
/* ❌ AVOID: Generic AI palette */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* ❌ AVOID: Rainbow soup (too many competing colors) */
--color-1: red; --color-2: blue; --color-3: green; --color-4: yellow;

/* ❌ AVOID: Low contrast (accessibility failure) */
color: #888888; background: #999999;

/* ✅ DO: Intentional, limited palette with clear hierarchy */
```

## Component Styling

### Cards (Dashboard panels)
```css
.dashboard-card {
  /* Subtle elevation, not heavy shadows */
  background: var(--bg-secondary);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px; /* Consistent, not excessive */
  
  /* Subtle depth */
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.1),
    0 4px 12px rgba(0, 0, 0, 0.05);
}

/* ❌ AVOID: Over-rounded, heavy shadows */
.bad-card {
  border-radius: 24px;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
}
```

### KPI/Metric Display
```css
.kpi-value {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: 600;
  font-variant-numeric: tabular-nums; /* Aligned numbers */
  letter-spacing: -0.02em; /* Tighten large numbers */
}

.kpi-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.kpi-trend {
  font-size: var(--text-sm);
  font-weight: 500;
}
.kpi-trend.positive { color: var(--positive); }
.kpi-trend.negative { color: var(--negative); }
```

### Data Tables
```css
.data-table {
  font-variant-numeric: tabular-nums;
  
  th {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--bg-tertiary);
  }
  
  td {
    font-size: var(--text-sm);
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  
  tr:hover {
    background: rgba(255, 255, 255, 0.02);
  }
}
```

## Motion & Interactions

### Appropriate for Dashboards
```css
/* Subtle hover transitions */
.card {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* Number counting animation (on load) */
@keyframes countUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Staggered card entrance */
.dashboard-card {
  animation: fadeInUp 0.4s ease backwards;
}
.dashboard-card:nth-child(1) { animation-delay: 0.1s; }
.dashboard-card:nth-child(2) { animation-delay: 0.15s; }
.dashboard-card:nth-child(3) { animation-delay: 0.2s; }
```

### Avoid in Dashboards
```css
/* ❌ Distracting continuous animations */
@keyframes pulse { ... }
.always-pulsing { animation: pulse 2s infinite; }

/* ❌ Slow, blocking transitions */
.card { transition: all 0.8s ease; }

/* ❌ Excessive movement */
.card:hover { transform: scale(1.1) rotate(2deg); }
```

## Layout Considerations

### Grid Structure
```css
/* Dashboard-appropriate grid */
.dashboard-grid {
  display: grid;
  gap: 1.5rem;
  
  /* Responsive columns */
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* Intentional sizing for charts */
.chart-large { grid-column: span 2; }
.chart-full { grid-column: 1 / -1; }
```

### Visual Hierarchy
```
┌─────────────────────────────────────────────────────────────┐
│ HEADER: Logo, nav, user menu                    [Minimal]   │
├─────────────────────────────────────────────────────────────┤
│ KPI ROW: 3-4 key metrics at a glance            [Prominent] │
├─────────────────────────────────────────────────────────────┤
│ FILTER BAR: Current filters, date range         [Accessible]│
├───────────────────────────────┬─────────────────────────────┤
│ PRIMARY CHART                 │ SECONDARY CHART             │
│ (Most important data viz)     │ (Supporting context)        │
│                               │                             │
├───────────────────────────────┴─────────────────────────────┤
│ DETAIL TABLE or ADDITIONAL CHARTS                           │
│ (Deep-dive data, less prominent)                            │
└─────────────────────────────────────────────────────────────┘
```

## Integration with Other Skills

This skill focuses on **visual design decisions**. Pair with:

| Skill | Responsibility |
|-------|----------------|
| `responsive-layout-system` | Breakpoints, container sizing |
| `chart-container-contract` | Chart wrapper patterns |
| `filter-ux-pattern` | Filter interactions |
| `ui-freeze` | Protecting existing code |

### Example Combined Prompt
```
Build a market overview dashboard page.

Use dashboard-frontend-design for:
- Overall aesthetic direction (Dark Terminal style)
- Color palette and typography choices
- Card styling and visual polish
- Micro-interactions and animations

Use responsive-layout-system for:
- Grid structure at different breakpoints
- Mobile/tablet adaptations

Use chart-container-contract for:
- Wrapping Recharts components
- Maintaining chart responsiveness
```

## Quality Checklist

Before finalizing any dashboard design:

- [ ] Typography is distinctive but highly readable
- [ ] Color palette is cohesive (not rainbow soup)
- [ ] Numbers use tabular figures and are easily scannable
- [ ] Visual hierarchy guides the eye correctly
- [ ] Cards have subtle, consistent styling
- [ ] Interactions are snappy, not distracting
- [ ] Empty states and loading states are designed
- [ ] Accessibility: contrast ratios pass WCAG AA
- [ ] No generic AI aesthetics (purple gradients, Inter font)
- [ ] Design has a recognizable identity/personality
