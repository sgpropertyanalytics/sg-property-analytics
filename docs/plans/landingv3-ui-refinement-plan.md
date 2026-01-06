# LandingV3 UI/UX Refinement Plan

## Overview
Refine the LandingV3 terminal/Palantir aesthetic with senior UI/UX improvements: fix alignment/spacing issues, add medium-intensity glitch animations, integrate 4 real charts, and elevate the machine intelligence vibe while keeping the light (#fafafa) theme.

---

## Design Thinking (per frontend-design skill)

### Purpose
**What problem does this interface solve?**
Property buyers/investors need data-driven market intelligence to make informed decisions. The landing page must communicate: "This is serious analytical tooling, not a consumer app."

**Who uses it?**
Sophisticated property investors, analysts, agents who value data precision over flashy marketing.

### Tone: INTELLIGENCE TERMINAL / MACHINE PRECISION
**Chosen aesthetic direction:** Industrial/utilitarian meets luxury/refined

NOT brutalist chaos. NOT playful. This is:
- **Bloomberg Terminal** meets **Palantir Foundry**
- Cold precision with moments of life (emerald pulses)
- Information density that rewards attention
- "This tool knows more than you" energy

### Differentiation: What makes this UNFORGETTABLE?
1. **The typing terminal** - live command simulation creates tension
2. **The particle globe** - interactive, responds to cursor
3. **HUD corners + ruler ticks** - military/aerospace aesthetic
4. **Real charts with gated access** - shows capability, creates desire

### Typography Direction (CRITICAL - avoid generic)
**Current:** Inter (sans) - TOO GENERIC per frontend-design skill
**Proposed:**
- Display: **Geist** or **Satoshi** (modern, geometric, tech-forward)
- Mono: Keep **IBM Plex Mono** (excellent for terminal aesthetic)
- Alternative: **JetBrains Mono** for display numbers (engineering feel)

### Motion Philosophy
Focus on **HIGH-IMPACT MOMENTS**:
1. **Page load**: Orchestrated staggered reveal (hero → stats → charts)
2. **Scroll triggers**: Sections fade-in with subtle Y translation
3. **Hover states**: Subtle but surprising (scan line sweep)
4. **Live indicators**: Purposeful pulse (not constant animation)

---

## User Preferences
- **Theme:** Light (#fafafa) - keep current
- **Animations:** Medium with glitch effects
- **Accent Colors:** Explore monochrome-compatible combinations
- **Charts to integrate:** ALL FOUR
  - BeadsChart (Regional Bubbles)
  - GrowthDumbbellChart (District Growth)
  - MarketMomentumGrid (28 mini-charts)
  - TimeTrendChart (Volume trends)

---

## Critical Files
- `/Users/changyuesin/Desktop/sgpropertytrend/frontend/src/pages/LandingV3.jsx` (main file, ~1275 lines)
- `/Users/changyuesin/Desktop/sgpropertytrend/frontend/src/index.css` (animations)
- Charts to integrate:
  - `frontend/src/components/powerbi/BeadsChart.jsx`
  - `frontend/src/components/powerbi/GrowthDumbbellChart.jsx`
  - `frontend/src/components/powerbi/MarketMomentumGrid.jsx`
  - `frontend/src/components/powerbi/TimeTrendChart.jsx`

---

## Phase 1: Typography & Text Wrapping Fixes

### 1.1 Hero Headline Fix
**Problem:** "Market Intelligence" breaking across lines awkwardly

**Current (line 927-931):**
```jsx
<span className="block text-black">Singapore Condo</span>
<span className="block whitespace-nowrap text-black/30">Market Intelligence</span>
```

**Fix:**
- Add `min-w-max` or use CSS `white-space: nowrap` with responsive font scaling
- Reduce font size on smaller breakpoints to prevent overflow
- Consider: `text-4xl sm:text-5xl md:text-6xl xl:text-7xl` progression

### 1.2 Typography Hierarchy Enhancement (per frontend-design skill)

**CRITICAL:** The skill says to AVOID generic fonts like Inter. Current page uses Inter.

**Recommended Font Stack:**
```css
/* Display headlines - distinctive, geometric, tech-forward */
--font-display: "Geist", "Satoshi", system-ui;

/* Body/UI text - if keeping Inter, that's acceptable for body */
--font-sans: "Inter", system-ui;

/* Mono - keep IBM Plex Mono (excellent for terminal) */
--font-mono: "IBM Plex Mono", monospace;
```

**Font Loading (add to index.html or via @font-face):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
```

**Or use Fontsource (npm):**
```bash
npm install @fontsource/geist-sans
```

**Typography Refinements:**
- Headlines: `tracking-tighter` (negative letter-spacing for large text)
- Mono labels: `tracking-[0.18em]` (keep current wide tracking)
- Body: `tracking-normal`

---

## Phase 2: Spacing, Padding, Alignment Fixes

### 2.1 Inconsistent Gap Values
**Current issues:**
- Section padding varies: `py-14 md:py-18` vs `py-16 md:py-20`
- Grid gaps: `gap-3` vs `gap-4` vs `gap-8`

**Fix:** Establish spacing scale:
- Section spacing: `py-16 md:py-24` (consistent)
- Card gaps: `gap-4` (standard), `gap-6` (relaxed)
- Inner padding: `p-4` (cards), `p-6` (large cards)

### 2.2 Card Alignment
- Ensure all HUD corner ticks are consistent (already good)
- Align ruler tick marks consistently across all cards

### 2.3 Stats Grid
- Cards should have equal heights (add `h-full` or use grid auto-rows)
- Number alignment: ensure `tabular-nums` everywhere

---

## Phase 3: Color & Opacity Refinements

### 3.1 Current Palette
```
Canvas: #fafafa (off-white)
Ink: #000000 (black)
Emerald: emerald-500/600 (live indicators)
Alert: #FF5500 (negative deltas)
```

### 3.2 Monochrome-Compatible Accent System
Keeping the light theme, explore these accent combinations that work with black/white:

**Option A: Minimal Accent (Recommended)**
```
Primary:   Black #000000 (text, borders, emphasis)
Secondary: Gray gradients (#333 → #666 → #999 → #ccc)
Accent:    Emerald #10B981 (keep for live/online states)
Alert:     Orange #FF5500 (negative deltas)
Highlight: White with subtle shadow/glow
```

**Option B: Subtle Cyan Accent**
```
Primary:   Black #000000
Secondary: Gray gradients
Live:      Cyan #00D4FF (replaces emerald for "live" states)
Success:   Emerald #10B981
Alert:     Orange #FF5500
```

**Option C: Warm Accent (Bloomberg-ish)**
```
Primary:   Black #000000
Secondary: Gray gradients
Accent:    Amber #F59E0B (warm gold for highlights)
Live:      Emerald #10B981
Alert:     Red #EF4444
```

### 3.3 Recommended: Grayscale Depth with Emerald
Keep it monochrome but add **depth through grays**:
- Pure black (#000) - headlines, primary actions
- Dark gray (#333) - body text, secondary text
- Medium gray (#666) - tertiary text, borders
- Light gray (#ccc) - subtle borders, dividers
- Emerald - ONLY for live/active indicators (keep the "signal" special)

### 3.4 Glow Effects (Monochrome-compatible)
```css
/* White glow for emphasis on dark elements */
box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);

/* Black inner shadow for depth on light elements */
box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.05);

/* Emerald glow for live indicators */
box-shadow: 0 0 12px rgba(16, 185, 129, 0.4);
```

### 3.5 Opacity Refinements
- Text hierarchy: `text-black` → `text-black/70` → `text-black/50` → `text-black/30`
- Border hierarchy: `border-black/20` (prominent) → `border-black/10` (standard) → `border-black/05` (subtle)
- Card backgrounds: `bg-white/80` with subtle backdrop-blur for depth

---

## Phase 4: Creative Animations

### 4.1 New Animations to Add

**Glitch/Flicker Effect (for headlines):**
```css
@keyframes glitch {
  0%, 100% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(-2px, -2px); }
  60% { transform: translate(2px, 2px); }
  80% { transform: translate(2px, -2px); }
}
```

**Data Stream Animation (for numbers):**
```css
@keyframes dataStream {
  0% { opacity: 0.5; transform: translateY(4px); }
  50% { opacity: 1; transform: translateY(0); }
  100% { opacity: 0.5; transform: translateY(-4px); }
}
```

**Scan Line Sweep (for cards on hover):**
```css
@keyframes scanSweep {
  0% { top: -100%; }
  100% { top: 100%; }
}
```

**Pulse Ring (for live indicators):**
- Expand the existing ping animation with multiple rings

### 4.2 Scroll-Triggered Animations
- Cards fade-in and slide-up on scroll (staggered)
- Stats counters animate when in view (already have AnimatedNumber)
- Globe intensifies rotation on section hover

### 4.3 Micro-interactions
- Card hover: subtle border glow + slight lift
- Button hover: scan line sweep effect
- Input focus: cyan border glow

---

## Phase 5: Chart Integration (4 Charts)

### 5.1 New Section: "MARKET_INTELLIGENCE" (between STATS and CAPABILITIES)

**Layout - Desktop:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ MARKET_INTELLIGENCE // LIVE_FEED                          [PREVIEW_MODE]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ ┌─────────────────────────────┐ ┌─────────────────────────────────────┐ │
│ │ REGIONAL_PRICING            │ │ VOLUME_TREND                        │ │
│ │                             │ │                                     │ │
│ │   BeadsChart                │ │   TimeTrendChart                    │ │
│ │   (CCR/RCR/OCR bubbles)     │ │   (Line + Bar combo)                │ │
│ │                             │ │                                     │ │
│ └─────────────────────────────┘ └─────────────────────────────────────┘ │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ DISTRICT_GROWTH // PSF_DELTA                                        │ │
│ │                                                                     │ │
│ │   GrowthDumbbellChart (full width)                                  │ │
│ │   (28 districts with baseline → current PSF)                        │ │
│ │                                                                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ MOMENTUM_GRID // 28_DISTRICTS                          [ACCESS_REQ] │ │
│ │ ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐                                 │ │
│ │ │D01││D02││D03││D04││D05││D06││D07│ ...                              │ │
│ │ └───┘└───┘└───┘└───┘└───┘└───┘└───┘                                 │ │
│ │   MarketMomentumGrid (28 mini-charts, blurred for non-auth)         │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Chart Styling for Terminal Aesthetic

**Container Wrapper (apply to all charts):**
```jsx
<div className="relative border border-black/10 bg-[#fafafa]">
  {/* HUD corners */}
  <div className="absolute -top-px -left-px w-2 h-2 border-t-2 border-l-2 border-black" />
  <div className="absolute -bottom-px -right-px w-2 h-2 border-b-2 border-r-2 border-black" />
  {/* Ruler ticks */}
  <div className="absolute top-0 left-1/4 w-px h-1 bg-black/20" />
  <div className="absolute top-0 left-1/2 w-px h-1.5 bg-black/30" />
  <div className="absolute top-0 left-3/4 w-px h-1 bg-black/20" />
  {/* Header */}
  <div className="px-4 py-3 border-b border-black/05 flex items-center justify-between">
    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
      CHART_NAME
    </div>
    <div className="flex items-center gap-2">
      <LiveDot />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-600">LIVE</span>
    </div>
  </div>
  {/* Chart content */}
  <div className="p-4">
    <ChartComponent />
  </div>
</div>
```

**Chart Color Overrides:**
```javascript
// Override chart colors to match terminal aesthetic
const TERMINAL_CHART_COLORS = {
  primary: '#000000',
  secondary: '#666666',
  tertiary: '#999999',
  accent: '#10B981',  // emerald for highlights
  grid: 'rgba(0, 0, 0, 0.05)',
  axis: 'rgba(0, 0, 0, 0.3)',
};
```

### 5.3 Chart-Specific Adaptations

**BeadsChart:**
- Keep bubble visualization
- Override colors: CCR=#000, RCR=#666, OCR=#999
- Simplify: hide legend, show on hover

**TimeTrendChart:**
- Bars: black with low opacity
- Line: black solid
- Remove excessive grid lines

**GrowthDumbbellChart:**
- Keep color gradient (green→amber)
- Simplify axis labels
- Reduce to top 10 districts for preview

**MarketMomentumGrid:**
- Show all 28 mini-charts
- Add blur overlay: "AUTHENTICATE FOR FULL ACCESS"
- Subtle fade-in animation on scroll

### 5.4 Access Gate Overlay
```jsx
<div className="absolute inset-0 backdrop-blur-sm bg-white/60 flex items-center justify-center">
  <div className="text-center">
    <Lock className="h-6 w-6 text-black/30 mx-auto" />
    <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black/40">
      AUTHENTICATE FOR FULL ACCESS
    </div>
    <button className="mt-3 px-4 py-2 bg-black text-white font-mono text-xs">
      Request Access
    </button>
  </div>
</div>
```

### 5.5 Data Strategy
- Use static preview data (no API calls on landing)
- Create `landingPreviewData.js` with curated sample data
- Data should be representative and visually interesting

---

## Phase 6: Additional UI Refinements

### 6.1 Nav Bar
- Add subtle backdrop blur on scroll
- Add progress indicator (thin line showing scroll position)

### 6.2 Command Bar
- Add emerald glow on focus (keep monochrome, emerald = "active")
- Add keyboard shortcut hints on hover

### 6.3 Globe Enhancement
- Add subtle glow/bloom effect
- Add connection lines that pulse (already has arcs)
- Add floating data labels that appear/disappear

### 6.4 Footer
- Add grid pattern continuation
- Add "system status" row with live indicators

---

## Phase 7: Spatial Composition (per frontend-design skill)

### 7.1 Grid-Breaking Elements
The skill emphasizes: "Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements."

**Specific improvements:**
- **Hero section**: Let globe slightly overflow its container (creates tension)
- **Stats cards**: Slight rotation on alternate cards (1-2deg) for visual interest
- **Chart section**: Overlap chart containers with negative margins
- **Diagonal accents**: Add diagonal line elements between sections

### 7.2 Asymmetry Opportunities
- Hero: 60/40 split instead of 50/50
- Stats: 3 large + 1 small card instead of 4 equal
- Charts: Varied heights (BeadsChart taller than TimeTrendChart)

### 7.3 Overlap & Layering
```jsx
// Example: Card overlapping into next section
<div className="relative -mb-8 z-10">
  <StatsCard />
</div>
<section className="pt-16 bg-black/[0.02]">
  {/* Next section starts behind the card */}
</section>
```

---

## Phase 8: Backgrounds & Visual Details (per frontend-design skill)

### 8.1 Current Visual Layers (keep and enhance)
- ✅ Crosshatch grid (80px)
- ✅ Scanline overlay
- ✅ Noise texture (fractal SVG)

### 8.2 New Visual Enhancements

**Gradient Mesh (subtle, corner accent):**
```css
.hero-section::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  height: 50%;
  background: radial-gradient(
    ellipse at top right,
    rgba(0, 0, 0, 0.02) 0%,
    transparent 70%
  );
  pointer-events: none;
}
```

**Grain Overlay Enhancement:**
```css
.grain-overlay {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='grain'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23grain)'/%3E%3C/svg%3E");
  opacity: 0.03;
  mix-blend-mode: multiply;
}
```

**Decorative Borders (section dividers):**
```jsx
// Between sections - technical/aerospace feel
<div className="relative h-px bg-black/10">
  <div className="absolute left-1/4 -top-1 w-2 h-2 border border-black/20 bg-[#fafafa]" />
  <div className="absolute left-1/2 -top-1.5 w-3 h-3 border border-black/30 bg-[#fafafa]" />
  <div className="absolute left-3/4 -top-1 w-2 h-2 border border-black/20 bg-[#fafafa]" />
</div>
```

**Custom Cursor (optional, for chart areas):**
```css
.chart-area {
  cursor: crosshair;
}
.interactive-element {
  cursor: url('data:image/svg+xml,...'), pointer;
}
```

### 8.3 Layered Transparencies
- Cards: `bg-white/90 backdrop-blur-sm` for subtle depth
- Overlays: Multiple opacity layers create visual richness
- Chart containers: Slight transparency to show grid through

---

## Implementation Order

### Step 1: Typography Foundation
- [ ] Install Geist font (npm or Google Fonts)
- [ ] Update CSS variables for font-display
- [ ] Apply Geist to headlines, keep Inter for body
- [ ] Fix hero headline "Market Intelligence" wrapping
- [ ] Add `tracking-tighter` to large headlines

### Step 2: Spacing & Layout Standardization
- [ ] Standardize section padding (py-16 md:py-24)
- [ ] Standardize card gaps (gap-4)
- [ ] Add `tabular-nums` everywhere needed
- [ ] Ensure card heights are consistent

### Step 3: Colors & Depth
- [ ] Refine text opacity hierarchy
- [ ] Add grayscale depth (#333, #666, #999)
- [ ] Add emerald glow to live indicators
- [ ] Add subtle inner shadows to cards
- [ ] Add backdrop-blur to cards (`bg-white/90 backdrop-blur-sm`)

### Step 4: Visual Layers & Backgrounds
- [ ] Add gradient mesh to hero section
- [ ] Enhance grain overlay texture
- [ ] Add decorative section dividers (aerospace style)
- [ ] Add custom crosshair cursor to chart areas

### Step 5: Spatial Composition
- [ ] Adjust hero to 60/40 asymmetric split
- [ ] Let globe overflow container slightly
- [ ] Add subtle rotation to alternate stats cards
- [ ] Create overlap between sections (negative margins)

### Step 6: Glitch Animations
- [ ] Add glitch keyframes to index.css
- [ ] Apply glitch to section titles on hover
- [ ] Add scan line sweep to cards on hover
- [ ] Add scroll-triggered fade-in (staggered)

### Step 7: Chart Section Structure
- [ ] Create "MARKET_INTELLIGENCE" section
- [ ] Create `landingPreviewData.js` with static data
- [ ] Create `TerminalChartWrapper` component

### Step 8: Chart Integration
- [ ] Adapt BeadsChart with terminal colors
- [ ] Adapt TimeTrendChart with terminal colors
- [ ] Adapt GrowthDumbbellChart (top 10 districts)
- [ ] Adapt MarketMomentumGrid with blur overlay

### Step 9: Micro-interactions & Polish
- [ ] Nav blur on scroll + progress indicator
- [ ] Command bar emerald glow on focus
- [ ] Button scan line sweep on hover
- [ ] Card lift + glow on hover

### Step 10: Responsive & Testing
- [ ] Test all breakpoints (375px, 768px, 1024px, 1440px)
- [ ] Ensure no horizontal scroll
- [ ] Check animation performance (60fps)
- [ ] Verify chart responsiveness
- [ ] Test reduced-motion preference

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `LandingV3.jsx` | Modify | Main landing page |
| `index.css` | Modify | Add glitch animations |
| `landingPreviewData.js` | Create | Static chart data |
| `TerminalChartWrapper.jsx` | Create | Reusable chart container |

---

## Success Criteria

### Typography & Layout
- [ ] Geist font loaded and applied to headlines
- [ ] "Market Intelligence" stays on one line across all breakpoints
- [ ] Consistent spacing throughout (py-16 md:py-24 sections, gap-4 cards)
- [ ] All numbers use tabular-nums

### Visual Design (per frontend-design skill)
- [ ] Grayscale depth visible (#333, #666, #999 text hierarchy)
- [ ] Emerald glow on live indicators
- [ ] Gradient mesh visible in hero section
- [ ] Decorative section dividers (aerospace style)
- [ ] Cards have backdrop-blur and inner shadows

### Spatial Composition
- [ ] Hero uses 60/40 asymmetric split (not 50/50)
- [ ] Globe slightly overflows container
- [ ] Visible overlap between at least one section pair
- [ ] Crosshair cursor on chart areas

### Animations
- [ ] Glitch effects on section titles (hover)
- [ ] Scan line sweep on card hover
- [ ] Scroll-triggered fade-in (staggered timing)
- [ ] Page load orchestration (hero → stats → charts)

### Charts
- [ ] 4 real charts integrated with preview data
- [ ] Charts use terminal color scheme (black/gray/emerald)
- [ ] MarketMomentumGrid shows blur overlay for access gate
- [ ] All charts wrapped in TerminalChartWrapper

### Performance & Responsiveness
- [ ] No horizontal scroll at any breakpoint
- [ ] Animations run at 60fps
- [ ] Reduced-motion preference respected
- [ ] Works on: 375px, 768px, 1024px, 1440px
