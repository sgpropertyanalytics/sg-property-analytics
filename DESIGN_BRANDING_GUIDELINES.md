# Design Branding Guidelines

## Singapore Property Intelligence Terminal

---

## 1. Design Archetype

**"Institutional Intelligence Console"** — A visual language borrowed from defense/intelligence systems, Bloomberg terminals, and Palantir's Foundry UI. This isn't a consumer SaaS landing page; it's a **command interface** that signals exclusivity and operational capability.

The archetype sits at the intersection of:
- **Trading terminal** (real-time data streams, monospace typography, tabular nums)
- **Defense HUD** (corner brackets, ruler ticks, crosshair cursors, "AUTH_REQUIRED")
- **Developer CLI** (command bar with `Ctrl+K`, terminal output with typewriter effect)

---

## 2. Visual & Emotional Vibe

**Primary emotion: Controlled Power**

The user should feel like they've just sat down at a workstation with access to classified information. Key emotional signals:

| Element | Emotional Signal |
|---------|------------------|
| `cursor-crosshair` on charts/globe | "Precision targeting" |
| HUD corner brackets (`border-t-2 border-l-2`) | "Locked coordinates" |
| `AUTH_REQUIRED`, `RESTRICTED ACCESS` | "Privileged clearance" |
| Emerald `LIVE` indicators | "Active surveillance" |
| Scanline overlay, noise texture | "CRT phosphor authenticity" |
| `DO NOT DISTRIBUTE` footer | "Confidential asset" |

The vibe is **cold competence** — not friendly, not playful, deliberately intimidating in a way that signals "this is serious machinery."

---

## 3. Color System Philosophy

**Monochrome + Signal Green** (Palette: `#fafafa` / `#000000` / `#10B981`)

| Color | Role | Psychological Effect |
|-------|------|---------------------|
| `#fafafa` (Canvas) | Background, negative space | "Sterile lab" neutrality |
| `#000000` (Ink) | Text, borders, CTAs | Authority, finality |
| `rgba(0,0,0,0.60)` | Secondary text | Hierarchical depth without color noise |
| `#10B981` (Emerald) | LIVE indicators, pulse dots | "System active" — the only color that means something |

**Why this works:**
- **No color competition** — when everything is grayscale, the emerald green screams "pay attention here"
- **Bloomberg DNA** — financial terminals use exactly this palette (dark text, light bg, green for "live")
- **Zero emotional distraction** — no blue for trust, no orange for urgency; the UI is deliberately emotionally neutral so the *data* carries the weight

---

## 4. Typography & Hierarchy Intent

| Element | Treatment | Intent |
|---------|-----------|--------|
| Headlines | `font-display`, `tracking-tighter`, `-0.05em` | Dense, compressed authority (think: classified document headers) |
| Labels | `font-mono`, `text-[10px]`, `tracking-[0.18em]`, `uppercase` | Military/technical nomenclature |
| Body | `text-sm`, `text-black/60`, `leading-relaxed` | Legible but recessive |
| Data | `tabular-nums`, `font-data` | Trading tape precision |

The **"10px uppercase monospace"** labeling system is the design's signature move — it appears on:
- Section eyebrows (`COVERAGE`, `SURVEILLANCE`)
- Card codes (`TX_COUNT`, `INTEGRITY`)
- Status indicators (`ONLINE`, `STREAMING`)

This creates a **military specification sheet** aesthetic where everything feels catalogued and classified.

---

## 5. Product Positioning Signal

| Signal | Interpretation |
|--------|----------------|
| "Request Access" (not "Sign Up Free") | Gatekept, exclusive |
| Command bar with autocomplete | Power user assumed |
| "Intelligence Terminal" branding | Not a "dashboard" — an operations center |
| `99.2% INTEGRITY`, `OUTLIER_GATED` | Institutional-grade data quality |
| Ghost Map with SVG district boundaries | Deep local expertise |

**Price positioning:** Premium / institutional. This design says "if you have to ask the price, you're not the target customer."

**Audience signal:** Quantitative property investors, fund analysts, sophisticated individual buyers — people who *want* complexity because it signals rigor.

---

## 6. Comparable References

| Reference | Borrowed Elements |
|-----------|-------------------|
| **Palantir Foundry** | Command bar, monochrome + accent color, "operational" language |
| **Bloomberg Terminal** | Data density, emerald signals, tabular typography |
| **Linear** | Corner brackets HUD, section dividers with decorative markers |
| **Stripe Radar** | Map visualization with pulsing activity dots |
| **Vercel Dashboard** | Monospace labels, minimal color palette |
| **SpaceX Mission Control UI** | Scan lines, crosshair cursors, "SYSTEM_ACTIVE" language |

---

## 7. Internal Style Names

1. **"Signal Intelligence Monochrome"** — Emphasizes the surveillance/intelligence aesthetic with strict color restraint

2. **"Terminal Noir"** — Captures the black-on-white severity with the typewriter/CLI heritage

3. **"Analyst Operations Console"** — Positions it as institutional tooling, not consumer app

4. **"Phosphor Grid"** — References the emerald glow (phosphor CRT screens) + grid overlay system

5. **"White Ops"** — Military intelligence reference; "white" for the light theme, "ops" for operational

---

## 8. Design System DNA Summary

```
PALETTE:     Canvas #fafafa | Ink #000 | Signal #10B981
TYPOGRAPHY:  Display (tight) | Mono (spaced) | Data (tabular)
GEOMETRY:    HUD corners | Ruler ticks | 80px grid
MOTION:      Scan sweep | Heartbeat glow | Typewriter reveal
LANGUAGE:    AUTH_ | TX_ | SIGNAL_ | _REQUIRED
CURSOR:      Crosshair on data surfaces
```

This design is deliberately **anti-consumerist** — it doesn't try to be friendly, approachable, or fun. It positions the product as serious infrastructure for serious operators. That's the alpha.

---

## 9. Component Patterns

### Ghost Map (Laser-Cut Acrylic Concept)

**Philosophy:** Think of a laser-cut white acrylic sheet (the land) sitting on top of a very pale blue-grey surface (the sea).

| Layer | Color | Role |
|-------|-------|------|
| Sea (Container) | `#F8FAFC` (Slate-50) | Very pale blue-grey engineering surface |
| Land (SVG Fill) | `#FFFFFF` | Pure white "cutout" - positive space |
| Lines (SVG Stroke) | `#94A3B8` (Slate-400) | Technical grey hairlines |
| Lift (Filter) | `drop-shadow(0px 1px 2px rgba(148, 163, 184, 0.25))` | Physical elevation effect |

```jsx
// The Sea
backgroundColor: '#F8FAFC'

// The Land
fill: '#FFFFFF'
stroke: '#94A3B8'
strokeWidth: '0.5'
filter: 'drop-shadow(0px 1px 2px rgba(148, 163, 184, 0.25))'
```

### Data Packet Ticker

**Philosophy:** Structured data packets, not stream of consciousness. Every data point is self-contained.

**Format:** `[IDENTIFIER] CONTENT [VALUE] //`

```jsx
<span className="text-black/30">[</span>
<span className="text-black/60">{district}</span>
<span className="text-black/30">]</span>
<span className="mx-1.5">{project}</span>
<span className="text-black/30">[</span>
<span>{price}</span>
<span className="text-black/30">]</span>
<span className="mx-4 text-black/20">//</span>
```

**Example output:** `[D19] THE ORIE [$1.85M] // [D21] PINETREE HILL [$2.68M] //`

### HUD Corner Brackets
```jsx
<div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
<div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
```

### Ruler Tick Marks
```jsx
<div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
<div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
<div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
```

### Live Indicator
```jsx
<span className="relative inline-flex h-2 w-2">
  <span className="absolute inline-flex h-full w-full bg-emerald-500 opacity-70 animate-ping" />
  <span className="relative inline-flex h-2 w-2 bg-emerald-600 rounded-full" />
</span>
```

### Monospace Label
```jsx
<div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/60">
  LABEL_TEXT
</div>
```

### Card Container
```jsx
<div
  className="relative border border-black/10 bg-white/90 backdrop-blur-sm p-4 hover:border-black/20 transition-all hover:shadow-sm"
  style={{ boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)' }}
>
  {/* HUD corners */}
  {/* Ruler ticks */}
  {/* Content */}
</div>
```

---

## 10. Animation Library

| Animation | Purpose | Duration |
|-----------|---------|----------|
| `scan-line-hover` | Card hover feedback | 0.8s |
| `glitch-hover` | Headline interaction | 0.3s |
| `btn-scan-sweep` | Button hover shine | 0.5s |
| `heartbeat-glow` | System active indicator | 4s infinite |
| `animate-ticker` | Horizontal scroll feed | 30s linear infinite |
| `animate-ping` | Live dot pulse | Default Tailwind |

---

## 11. Language Guidelines

### DO Use
- `AUTH_REQUIRED`, `RESTRICTED ACCESS`
- `TX_COUNT`, `INTEGRITY`, `PIPELINE`
- `ONLINE`, `STREAMING`, `SYNC`
- `SIGNAL_FEED`, `SURVEILLANCE`
- Underscores in compound terms (`DATA_QUALITY`)

### DON'T Use
- Friendly/casual language ("Hey there!", "Get started")
- Emoji in UI elements
- Marketing superlatives ("Amazing", "Revolutionary")
- Consumer SaaS terminology ("Free trial", "No credit card")

---

## 12. Keywords / Brand Vocabulary

```
Palantir vibe | Bloomberg | Minimalistic | Clean | Neutral
Hacker vibes | Deep-data | Machine intelligence | Hedge fund
Raw power | Alpha | Sophisticated | Institutional
Command interface | Operations center | Intelligence terminal
Controlled power | Cold competence | Serious machinery
```
