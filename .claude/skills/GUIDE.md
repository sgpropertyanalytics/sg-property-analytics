# Dashboard Development Skills Guide

## For Singapore Property Analytics Dashboard

---

## Overview

Three consolidated skills for responsive, platform-agnostic dashboard development:

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `dashboard-layout` | Responsive containers, grids, charts, overflow prevention | Creating/modifying layouts |
| `dashboard-design` | Colors, typography, filters, components, touch interactions | Styling and UI components |
| `dashboard-guardrails` | Protection rules + verification checklists | Before AND after any changes |

---

## Quick Start

### In Claude Code CLI

Skills are automatically available in `.claude/skills/` directory.

### Invoking Skills

```
# Explicit invocation
"Use dashboard-layout skill for the grid structure"
"Apply dashboard-design patterns to this filter"
"Run dashboard-guardrails checklist before I merge"

# Skills auto-activate when you mention:
- "responsive", "mobile", "tablet", "breakpoint"
- "filters", "filter bar", "drawer"
- "charts", "dashboard", "layout"
```

---

## The Three Skills

### 1. dashboard-layout

**Covers:**
- Breakpoint strategy (desktop-first)
- Multi-platform support (desktop, laptop, tablet, iPad, iPhone, Android)
- Device-specific considerations (safe areas, orientation, virtual keyboard)
- Overflow prevention (CRITICAL)
- Page containers and grids
- Chart container contract (wrapper approach)
- Responsive component patterns (tables, nav, KPI cards)

**Use when:**
- Creating new dashboard pages
- Making existing pages responsive
- Wrapping charts in responsive containers
- Fixing overflow issues

### 2. dashboard-design

**Covers:**
- Color palette (project-specific)
- Typography (fonts, scale)
- Component styling (buttons, cards, tables)
- Filter UX patterns (desktop bar, mobile drawer)
- Touch interactions (44px targets, active states)
- Motion and animations
- Empty/loading/error states
- Accessibility

**Use when:**
- Styling dashboard components
- Building filter panels
- Ensuring touch-friendly interactions
- Applying consistent visual design

### 3. dashboard-guardrails

**Covers:**
- UI Freeze: What NOT to touch (chart internals, filter logic)
- Safe Zone: What you CAN modify (wrappers, layout)
- Definition of "breaking" changes
- Multi-platform verification checklists
- Required output format for changes
- Emergency recovery procedures

**Use when:**
- BEFORE modifying any existing dashboard code
- AFTER completing changes (for verification)
- When touching files with charts or filters

---

## Workflow Examples

### Scenario A: New Dashboard Page

```
I need to build a new analytics page with:
- 4 KPI cards at top
- Filter bar with district, bedroom, date
- 2 charts side by side
- Full-width table below

Use dashboard-layout for the grid structure.
Use dashboard-design for styling and filter patterns.
Use dashboard-guardrails to verify across platforms.
```

### Scenario B: Making Existing Page Responsive

```
My dashboard at src/pages/Overview.tsx breaks on mobile.

Use dashboard-guardrails to understand what NOT to touch.
Use dashboard-layout for responsive fixes.
Run the verification checklist when done.

DO NOT modify chart internals or filter logic.
```

### Scenario C: Adding New Filter

```
Add a "sale type" filter to the existing filter bar.

Use dashboard-design for the filter component pattern.
Use dashboard-guardrails to ensure I don't break existing filters.
Make sure it works on both desktop (bar) and mobile (drawer).
```

---

## Core Principles

### 1. Desktop is PRIMARY
Build for 1440px+ first, then adapt down.

### 2. Charts are PROTECTED
Never change chart internals for responsiveness. Use wrappers.

### 3. Touch Targets are MANDATORY
Minimum 44px on all interactive elements.

### 4. No Hover-Only Interactions
Always provide `active:` states for touch devices.

### 5. Verify Across Platforms
Desktop (1440px), Tablet (768px), Mobile (375px) minimum.

---

## Quick Reference

### Safe to Change
- Grid column counts
- Container padding/margins
- Card wrapper styling
- Breakpoint-based visibility
- Touch target sizes

### NEVER Change
- Chart axis configurations
- Filter state logic
- Data transformations
- Tooltip content
- Click handler logic

---

## Verification Checklist (Summary)

Before marking any work complete:

```markdown
### Sign-Off

#### UI Freeze Compliance
- [ ] No chart internals modified
- [ ] No filter logic modified
- [ ] Only wrapper changes made

#### Platform Verification
- [ ] Desktop (1440px): Working
- [ ] Tablet (768px): Working
- [ ] Mobile (375px): Working
- [ ] No horizontal overflow
- [ ] Touch targets ≥ 44px
```

---

## File Structure

```
.claude/skills/
├── GUIDE.md                      # This file
├── dashboard-layout/SKILL.md     # Layout & responsiveness
├── dashboard-design/SKILL.md     # Styling & components
└── dashboard-guardrails/SKILL.md # Protection & verification
```
