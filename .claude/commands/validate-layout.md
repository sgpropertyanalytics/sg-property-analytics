Validate UI layout, overflow, and responsiveness for dashboard components.

Arguments: $ARGUMENTS

> This command invokes the `ui-layout-validator` agent.

## Quick Reference

**Supported arguments:**
- `[file-path]` - Validate specific file or component
- `--recent` - Validate files changed in last 5 commits
- `--all` - Validate all dashboard components
- `--viewport=[width]` - Focus on specific viewport (e.g., `--viewport=375`)

## Examples

```bash
# Validate specific file
/validate-layout frontend/src/components/powerbi/VolumeChart.jsx

# Validate recent changes
/validate-layout --recent

# Validate all powerbi components
/validate-layout frontend/src/components/powerbi/

# Focus on mobile viewport
/validate-layout VolumeChart.jsx --viewport=375
```

## What It Validates

1. **Overflow Safety** - No horizontal scroll, min-w-0 on flex children
2. **Responsive Behavior** - Correct layout at 320px, 375px, 768px, 1024px, 1440px
3. **Container Constraints** - Chart wrappers, minHeight, responsive Chart.js options
4. **Visual Robustness** - Long labels, empty states, tooltip/legend containment

## Output

Returns a validation report with:
- Summary table (pass/warn/fail per category)
- Issues with severity (Blocker/Major/Minor)
- Fix confidence (Safe/Review/Risky)
- Suggested fixes with diff format

## See Also

- [CLAUDE.md](../CLAUDE.md) - System rules
- [dashboard-layout skill](../skills/dashboard-layout/SKILL.md) - Layout patterns
- [dashboard-design skill](../skills/dashboard-design/SKILL.md) - Design tokens
- [ui-layout-validator agent](../agents/ui-layout-validator.md) - Full validation rules
