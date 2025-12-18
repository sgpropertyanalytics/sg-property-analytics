---
name: responsive-dod
description: Definition of Done checklist for responsive dashboard work. Use as the final verification step after completing any layout, styling, or responsive changes to analytics dashboards. Ensures no regressions across all target viewports before code is considered complete. Run this checklist before submitting any PR or marking work as done.
---

# Responsive Definition of Done (DoD)

## Purpose
This checklist defines what "done" means for responsive dashboard work. No change is complete until ALL applicable items pass.

## The Checklist

### 1. Desktop Verification (1440px+) — PRIMARY TARGET

#### Layout
- [ ] All charts visible in intended grid arrangement
- [ ] Sidebar fully expanded with text labels visible
- [ ] Filter bar displays in single/intended row arrangement
- [ ] KPI cards display in 4-column (or intended) layout
- [ ] No unnecessary horizontal scrolling on page
- [ ] Adequate whitespace between sections

#### Charts
- [ ] All chart containers render at expected size
- [ ] X-axis labels fully readable (no truncation/overlap)
- [ ] Y-axis labels fully readable
- [ ] Legends visible and complete
- [ ] Tooltips appear on hover
- [ ] Interactive elements (click, hover) function correctly

#### Data Tables (if applicable)
- [ ] All columns visible
- [ ] Headers aligned with content
- [ ] Row hover states work
- [ ] Sorting/pagination functions

---

### 2. Small Desktop / Large Tablet (1024px - 1439px)

#### Layout
- [ ] Grid adjusts appropriately (e.g., 4-col → 3-col if needed)
- [ ] Sidebar may be narrower but still functional
- [ ] Filter bar wraps gracefully if needed
- [ ] No content hidden without alternative

#### Charts
- [ ] Charts resize proportionally
- [ ] No chart overflow beyond containers
- [ ] Labels still readable
- [ ] Tooltips position correctly (not off-screen)

---

### 3. Tablet (768px - 1023px)

#### Layout
- [ ] Grid stacks to 2 columns (or 1 where appropriate)
- [ ] Sidebar collapsed OR replaced with icon-only navigation
- [ ] Filters accessible via drawer/panel (not blocking content)
- [ ] KPIs display in 2x2 grid or 2-column layout
- [ ] Primary navigation accessible

#### Charts
- [ ] Charts maintain minimum readable size
- [ ] No horizontal overflow in chart containers
- [ ] Touch interactions work (tap instead of hover)
- [ ] Legends may simplify but remain useful

#### Data Tables
- [ ] Horizontal scroll enabled if needed
- [ ] OR card/list view alternative provided
- [ ] Critical columns visible without scroll

---

### 4. Mobile (320px - 767px)

#### Layout
- [ ] Single column layout
- [ ] Hamburger menu for navigation
- [ ] Filters in bottom sheet or drawer
- [ ] KPIs in 2-column grid (2 per row)
- [ ] Clear visual hierarchy maintained
- [ ] No content "hidden forever" (always accessible somehow)

#### Charts
- [ ] Charts readable (may be simplified)
- [ ] Touch targets ≥ 44px × 44px
- [ ] Swipe gestures don't conflict with page scroll
- [ ] Alternative views provided if chart is too complex

#### Data Tables
- [ ] Card view OR horizontal scroll
- [ ] Row actions accessible
- [ ] Key data visible without interaction

#### Touch & Interaction
- [ ] All buttons/links minimum 44px touch target
- [ ] Form inputs have adequate size
- [ ] Dropdowns open without being cut off
- [ ] Modal/drawer close buttons easily tappable
- [ ] No hover-only interactions (provide tap alternative)

---

### 5. Edge Cases & Specific Viewports

Test at these specific widths for common device coverage:

| Width | Device Example | Priority |
|-------|----------------|----------|
| 320px | iPhone SE (old) | Medium |
| 375px | iPhone SE (new), small Android | High |
| 390px | iPhone 14 | High |
| 414px | iPhone Plus models | Medium |
| 768px | iPad portrait | High |
| 1024px | iPad landscape | High |
| 1280px | MacBook 13" | High |
| 1440px | MacBook 15" | High |
| 1920px | Desktop HD | High |
| 2560px | 4K/Ultrawide (if supported) | Low |

---

### 6. Cross-Cutting Concerns

#### Performance
- [ ] No layout shifts after initial render
- [ ] No jank during resize
- [ ] Charts don't re-fetch data on resize
- [ ] Smooth transitions when collapsing/expanding

#### Accessibility
- [ ] Focus indicators visible at all sizes
- [ ] Skip links functional
- [ ] Screen reader announces filter changes
- [ ] Reduced motion respected if set

#### Browser Support
- [ ] Chrome (latest)
- [ ] Safari (latest, including iOS)
- [ ] Firefox (latest)
- [ ] Edge (latest)

#### State Preservation
- [ ] Filters persist across viewport changes
- [ ] Scroll position maintained on resize
- [ ] Modal/drawer state doesn't break on resize
- [ ] URL reflects current filter state

---

### 7. Non-Regression Verification

After ANY change to existing dashboard code:

- [ ] Run through all chart types that exist in the dashboard
- [ ] Verify at minimum: 1440px, 768px, 375px viewports
- [ ] Check that no new horizontal scrollbars appeared
- [ ] Check that no content became cropped
- [ ] Check that all interactive features still work
- [ ] Check filter → chart binding still functions

---

## Quick Verification Commands

### Browser DevTools Responsive Mode

1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M)
3. Test at: 375px → 768px → 1024px → 1440px

### Automated Viewport Testing (Playwright example)

```typescript
// Simple viewport regression test
const viewports = [
  { width: 375, height: 667, name: 'mobile' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 1440, height: 900, name: 'desktop' },
];

for (const vp of viewports) {
  test(`Dashboard renders correctly at ${vp.name}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/dashboard');
    
    // No horizontal scroll
    const hasHScroll = await page.evaluate(() => 
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHScroll).toBe(false);
    
    // Charts visible
    await expect(page.locator('.chart-card')).toBeVisible();
    
    // Screenshot comparison (optional)
    await expect(page).toHaveScreenshot(`dashboard-${vp.name}.png`);
  });
}
```

---

## Sign-Off

Before marking work as complete, confirm:

```markdown
### Responsive DoD Sign-Off

- [ ] Desktop (1440px): VERIFIED
- [ ] Tablet (768px): VERIFIED  
- [ ] Mobile (375px): VERIFIED
- [ ] No regressions to existing functionality
- [ ] All applicable checklist items pass

Verified by: [name]
Date: [date]
```

---

## When DoD Fails

If any item fails:

1. **Document** the specific failure (viewport, component, symptom)
2. **Prioritize** based on user impact
3. **Fix** before merging (or create follow-up ticket if agreed)
4. **Re-verify** after fix

**Critical failures** (must fix before merge):
- Horizontal overflow on any viewport
- Charts not rendering
- Filters non-functional
- Navigation broken

**Non-critical** (can create follow-up ticket):
- Minor alignment issues
- Suboptimal spacing
- Performance optimizations
