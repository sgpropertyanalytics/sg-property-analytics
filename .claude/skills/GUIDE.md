# Complete Guide: Responsive Dashboard Development with Claude Skills

## For Andy's Singapore Property Analytics Dashboard

---

## 1. Understanding Claude Skills

### What They Are
Claude Skills are markdown files (SKILL.md) with YAML frontmatter that guide Claude's behavior when working on specific tasks. They work in both:
- **Claude.ai** (web interface) - Upload as custom skills
- **Claude Code** (CLI) - Place in `.claude/skills/` directory

### How They Get Activated
Claude reads the `name` and `description` in the YAML frontmatter to decide when to use a skill. Good descriptions are critical.

### Your Skill Set for Dashboard Work

| Skill | Purpose | When It Activates |
|-------|---------|-------------------|
| `ui-freeze` | Protects existing charts/filters from breaking | Any edit to files with chart/filter code |
| `responsive-layout-system` | Desktop-first responsive patterns | Creating/modifying page layouts |
| `filter-ux-pattern` | Filter bar and drawer patterns | Working on filter components |
| `chart-container-contract` | Rules for chart wrappers | Wrapping charts in responsive containers |
| `responsive-dod` | Final verification checklist | Before marking any responsive work done |
| `frontend-design` (Anthropic's) | High-quality aesthetic design | Any frontend creation work |

---

## 2. Setup Instructions

### For Claude Code (CLI) - Recommended

```bash
# In your project root
mkdir -p .claude/skills

# Copy skill files
cp -r ~/skills/* .claude/skills/

# Your structure should look like:
# .claude/
# └── skills/
#     ├── ui-freeze/
#     │   └── SKILL.md
#     ├── responsive-layout-system/
#     │   └── SKILL.md
#     ├── filter-ux-pattern/
#     │   └── SKILL.md
#     ├── chart-container-contract/
#     │   └── SKILL.md
#     └── responsive-dod/
#         └── SKILL.md

# Also add Anthropic's frontend-design skill
# Via Claude Code plugin marketplace:
# claude code plugin add anthropics/skills/frontend-design
```

### For Claude.ai (Web Interface)

1. Go to claude.ai/settings/capabilities
2. Find "Skills" section
3. Click "Upload skill"
4. Upload each SKILL.md file as a ZIP (one folder per skill)

---

## 3. Workflow: How to Use These Skills

### Scenario A: Building a NEW Dashboard Page

**Prompt approach:**
```
I need to build a new analytics page for my Singapore condo dashboard. 
This page should show:
- 4 KPI cards at the top (total transactions, avg PSF, median price, YoY change)
- Filter bar with district, property type, bedroom, date range
- 2 main charts side by side (volume chart, price trend chart)
- 1 full-width distribution chart below

Use responsive-layout-system skill for layout patterns.
Use filter-ux-pattern skill for the filter bar.
Use chart-container-contract skill for chart wrappers.
Use frontend-design skill for aesthetic quality.

Target: Desktop-first, but presentable on tablet/mobile.
```

**What Claude will do:**
1. Read `frontend-design` skill → Choose distinctive aesthetic
2. Read `responsive-layout-system` → Apply desktop-first grid
3. Read `filter-ux-pattern` → Build proper filter bar + mobile drawer
4. Read `chart-container-contract` → Create proper ChartCard wrappers
5. Generate code following all patterns

---

### Scenario B: Making EXISTING Page Responsive

**Prompt approach:**
```
I have an existing dashboard page at `src/pages/MarketOverview.tsx`. 
It looks good on desktop but breaks on tablet/mobile.

Use ui-freeze skill to ensure charts don't break.
Use responsive-layout-system skill for layout fixes.
Use responsive-dod skill for final verification.

DO NOT modify:
- Any chart configuration or props
- Filter state logic
- API calls or data transformations

ONLY modify:
- Layout wrapper classes
- CSS for responsive behavior
- Container padding/margins
```

**What Claude will do:**
1. Read `ui-freeze` → Understand what NOT to touch
2. Read `responsive-layout-system` → Know the breakpoint strategy
3. Analyze existing code
4. Make ONLY wrapper-level changes
5. Provide verification checklist from `responsive-dod`

---

### Scenario C: Adding a New Chart to Existing Page

**Prompt approach:**
```
I want to add a new "Bedroom Distribution" pie chart to my existing 
MarketOverview page, between the volume chart and the full-width chart.

Use chart-container-contract skill for the wrapper.
Use ui-freeze skill to ensure I don't break existing charts.

The new chart should use the same ChartCard component pattern 
as existing charts on the page.
```

---

### Scenario D: Fixing a Specific Responsive Bug

**Prompt approach:**
```
On my dashboard, the filter dropdown menus are getting cut off 
on iPad (768px viewport). The dropdown opens but extends beyond 
the screen edge.

Use filter-ux-pattern skill for the fix approach.
Use ui-freeze skill to ensure I don't break filter logic.

Current code is in: src/components/filters/FilterDropdown.tsx
```

---

## 4. Key Principles to Remember

### The Golden Rules

1. **Desktop is PRIMARY** - Build for 1440px first, then adapt down
2. **Charts are PROTECTED** - Never change chart internals for responsiveness
3. **Wrappers are SAFE** - All responsive magic happens in containers
4. **Test at REAL widths** - 375px, 768px, 1024px, 1440px minimum
5. **URL = State** - Filters should persist in URL params

### The "Do Not Touch" List

```
❌ NEVER modify for responsiveness:
- Chart axis configurations
- Chart color schemes
- Tooltip logic/content
- Legend positioning (internal to chart)
- Data transformation functions
- Filter state management
- Cross-filter binding logic
- API call parameters
```

### The "Safe Zone" for Changes

```
✅ SAFE to modify for responsiveness:
- Grid column counts
- Container padding/margins
- Gap between elements
- Card wrapper styling
- Breakpoint-based visibility
- Navigation collapse behavior
- Filter panel open/close state
- Touch target sizes
```

---

## 5. Common Patterns Reference

### Responsive Grid (Desktop-First)
```tsx
<div className="
  grid gap-4
  grid-cols-1      // Mobile: 1 column
  md:grid-cols-2   // Tablet: 2 columns
  lg:grid-cols-4   // Desktop: 4 columns
">
```

### Filter Bar → Drawer Switch
```tsx
{/* Desktop: inline */}
<div className="hidden lg:flex gap-4">
  <FilterDropdown />
</div>

{/* Mobile: drawer */}
<div className="lg:hidden">
  <FilterDrawerTrigger />
</div>
```

### Chart Container
```tsx
<ChartCard title="Volume" minHeight={300}>
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      {/* Chart config stays fixed */}
    </BarChart>
  </ResponsiveContainer>
</ChartCard>
```

---

## 6. Triggering Skills in Conversation

### Explicit Activation
You can explicitly tell Claude to use specific skills:

```
"Use the ui-freeze skill when reviewing my code"
"Apply responsive-layout-system patterns to this component"
"Run through the responsive-dod checklist"
```

### Implicit Activation
Skills auto-activate based on their descriptions when you:
- Mention "responsive", "mobile", "tablet", "breakpoint"
- Ask about filters, filter bars, filter drawers
- Work with charts, visualizations, dashboards
- Request layout changes or grid modifications

---

## 7. Verification Before Shipping

### Minimum Test Viewports
1. **375px** (iPhone SE) - Mobile baseline
2. **768px** (iPad portrait) - Tablet baseline
3. **1024px** (iPad landscape) - Desktop baseline
4. **1440px** (MacBook) - Primary target

### Quick Browser Check
1. Open DevTools → Toggle device toolbar
2. Set to 375px width → Scroll through entire page
3. Set to 768px → Check filter bar, chart grid
4. Set to 1440px → Confirm desktop layout

### Before Every PR
- [ ] No new horizontal scrollbars
- [ ] All charts render at all sizes
- [ ] Filters accessible at all sizes
- [ ] Touch targets ≥ 44px on mobile
- [ ] No console errors about responsive behavior

---

## 8. Troubleshooting Common Issues

### "Charts overflow on mobile"
→ Check if chart has fixed width. Use `ResponsiveContainer` with 100% width.

### "Filter dropdowns cut off on tablet"
→ Add `dropdown-content` positioning logic. Consider flip to top when near bottom.

### "Layout jumps when resizing"
→ Use CSS `min-width` instead of `width` for flexible containers.

### "Sidebar disappears and no hamburger shows"
→ Ensure mobile nav trigger is `lg:hidden` not `hidden lg:block`.

---

## 9. Next Steps

1. **Upload skills** to your Claude Code project (`.claude/skills/`)
2. **Test** with a simple prompt asking to review your current dashboard
3. **Iterate** - Refine skill descriptions if they don't activate when expected
4. **Add custom rules** - Extend skills with your specific component names/patterns

---

## File Locations (for this guide)

```
/home/claude/skills/
├── ui-freeze/SKILL.md
├── responsive-layout-system/SKILL.md
├── filter-ux-pattern/SKILL.md
├── chart-container-contract/SKILL.md
├── responsive-dod/SKILL.md
└── GUIDE.md (this file)
```

Copy these to your project's `.claude/skills/` directory to use with Claude Code.
