# UI Components - Usage Guide

Standardized responsive components for the Singapore Property Analytics Dashboard.

## KPICard

Responsive stat/metric cards for displaying key performance indicators.

```tsx
import { KPICard, KPICardGroup } from '../components/ui';

// Basic usage
<KPICard
  title="Total Transactions"
  value="12,345"
/>

// With all features
<KPICard
  title="Total Quantum"
  subtitle="past 30 days"
  value="$2.3B"
  loading={false}
  icon={<DollarIcon />}
  trend={{ value: 5.2, direction: 'up', label: 'vs last month' }}
  variant="highlighted"  // 'default' | 'highlighted' | 'muted'
  onClick={() => handleClick()}
/>

// Grid layout
<KPICardGroup columns={4}>
  <KPICard title="New Sales" value="1,234" />
  <KPICard title="Resales" value="5,678" />
  <KPICard title="Avg PSF" value="$1,850" />
  <KPICard title="YoY Change" value="+12%" />
</KPICardGroup>
```

## Other Patterns

For charts, tables, and layout patterns, use Tailwind CSS classes directly.
See `.claude/skills/` for design system documentation:
- `dashboard-design/SKILL.md` - Color palette, component styling
- `dashboard-layout/SKILL.md` - Responsive breakpoints, grid patterns
- `dashboard-guardrails/SKILL.md` - What not to modify
