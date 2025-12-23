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

## PageSummaryBox

"What This Page Shows" explanatory box for page headers. Helps users understand
what the page is about and what insights they can gain.

```tsx
import { PageSummaryBox } from '../components/ui';

// Basic usage
<PageSummaryBox>
  Analyze how <span className="font-semibold text-[#213448]">floor level affects price</span> in
  Singapore condos. Higher floors typically command a premium due to views and prestige.
</PageSummaryBox>

// Custom title
<PageSummaryBox title="About This Analysis">
  This dashboard shows market trends across all districts...
</PageSummaryBox>
```

## KeyInsightBox

Plain English insight summaries for individual charts. Use inside chart cards
to explain what the data means in simple terms.

```tsx
import { KeyInsightBox } from '../components/ui';

// Basic usage (inside a chart component)
<KeyInsightBox title="Key Takeaway">
  Higher floors typically cost{' '}
  <span className="font-bold text-[#213448]">~2.5% more</span>{' '}
  per level. The <span className="font-bold text-[#213448]">Mid</span> floor
  range has the most sales, making prices there most reliable.
</KeyInsightBox>

// Compact mode - smaller text for chart explanations (chart is main visual)
<KeyInsightBox title="How to Interpret this Chart" variant="info" compact>
  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
    <div><span className="font-semibold text-[#213448]">Median</span> — The typical price.</div>
    <div><span className="font-semibold text-[#213448]">IQR</span> — Price spread in the market.</div>
  </div>
</KeyInsightBox>

// Variants: 'default' | 'positive' | 'warning' | 'info'
<KeyInsightBox title="Trend Alert" variant="positive">
  Floor premiums are increasing - high-floor units are becoming more valuable.
</KeyInsightBox>

<KeyInsightBox title="Caution" variant="warning">
  Limited data available. Results may be less reliable.
</KeyInsightBox>
```

## SectionHeader

Visual section dividers with accent bars. Use to create hierarchy between
chart sections on a page.

```tsx
import { SectionHeader } from '../components/ui';

// Colors: 'navy' | 'blue' | 'light'
<SectionHeader color="navy">Primary Analysis</SectionHeader>
<HeroChart />

<SectionHeader color="blue">Detailed Breakdowns</SectionHeader>
<SecondaryCharts />

<SectionHeader color="light">Project-Level Detail</SectionHeader>
<DetailTable />
```

## SampleSizeWarning

Warning banner for low sample sizes. Automatically hides when sample is sufficient.

```tsx
import { SampleSizeWarning } from '../components/ui';

// Shows warning if count < threshold (default 50)
<SampleSizeWarning count={totalTransactions} threshold={100} />

// Compact inline mode
<SampleSizeWarning count={15} compact />
```

## Other Patterns

For charts, tables, and layout patterns, use Tailwind CSS classes directly.
See `.claude/skills/` for design system documentation:
- `dashboard-design/SKILL.md` - Color palette, component styling
- `dashboard-layout/SKILL.md` - Responsive breakpoints, grid patterns
- `dashboard-guardrails/SKILL.md` - What not to modify
