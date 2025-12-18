---
name: chart-container-contract
description: Contract for building responsive chart containers that adapt to different screen sizes without modifying chart internals. Use when wrapping Recharts, Chart.js, D3, Plotly, or any visualization library in a responsive layout. Defines the boundary between layout code (modifiable) and chart code (protected). Essential companion to ui-freeze skill.
---

# Chart Container Contract

## The Core Contract

```
┌─────────────────────────────────────────────────────────────────┐
│ LAYOUT LAYER (You control this)                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Card/Panel wrapper                                          │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Title, controls, metadata                               │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ CHART CONTAINER (The boundary)                          │ │ │
│ │ │ ┌─────────────────────────────────────────────────────┐ │ │ │
│ │ │ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │ │ │
│ │ │ │ ░░░░░░░░░ CHART INTERNALS (DO NOT TOUCH) ░░░░░░░░░░ │ │ │ │
│ │ │ │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │ │ │
│ │ │ └─────────────────────────────────────────────────────┘ │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**The Rule:** All responsive behavior happens OUTSIDE the chart container boundary. The chart itself should receive a stable container and handle its own internal responsiveness (or not).

## Standard Chart Card Component

```tsx
// components/ChartCard.tsx
import { ReactNode } from 'react';

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  
  // Layout controls (SAFE to change responsively)
  className?: string;
  minHeight?: number;       // Default: 300
  aspectRatio?: string;     // e.g., "16/9", "4/3", "1/1"
  
  // Optional header actions
  actions?: ReactNode;
  
  // Loading/Error states
  isLoading?: boolean;
  error?: string | null;
}

export function ChartCard({
  title,
  subtitle,
  children,
  className = '',
  minHeight = 300,
  aspectRatio,
  actions,
  isLoading,
  error,
}: ChartCardProps) {
  return (
    <div className={`
      bg-white rounded-lg border shadow-sm
      flex flex-col
      ${className}
    `}>
      {/* Card Header - SAFE to style responsively */}
      <div className="
        flex items-start justify-between
        p-3 md:p-4 lg:p-5
        border-b
      ">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm md:text-base">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs md:text-sm text-gray-500 mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      
      {/* Chart Container - THE BOUNDARY */}
      <div 
        className="
          flex-1
          p-3 md:p-4 lg:p-5
          overflow-hidden  /* Critical: prevents chart overflow */
        "
        style={{
          minHeight: `${minHeight}px`,
          ...(aspectRatio && { aspectRatio }),
        }}
      >
        {isLoading ? (
          <ChartLoadingState />
        ) : error ? (
          <ChartErrorState message={error} />
        ) : (
          /* CHART GOES HERE - DO NOT MODIFY WHAT'S INSIDE */
          children
        )}
      </div>
    </div>
  );
}

function ChartLoadingState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="animate-pulse flex flex-col items-center gap-2">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading chart...</span>
      </div>
    </div>
  );
}

function ChartErrorState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}
```

## Usage Patterns by Chart Library

### Recharts
```tsx
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

// ✅ CORRECT: ResponsiveContainer handles internal responsiveness
<ChartCard title="Transaction Volume" minHeight={350}>
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <XAxis dataKey="month" />
      <YAxis />
      <Tooltip />
      <Bar dataKey="count" fill="#3b82f6" />
    </BarChart>
  </ResponsiveContainer>
</ChartCard>

// ❌ WRONG: Hardcoded dimensions inside chart
<ChartCard title="Transaction Volume">
  <BarChart data={data} width={800} height={400}>
    {/* This will overflow on smaller screens */}
  </BarChart>
</ChartCard>
```

### Chart.js (via react-chartjs-2)
```tsx
import { Bar } from 'react-chartjs-2';

// ✅ CORRECT: Let Chart.js handle its own responsiveness
<ChartCard title="Price Distribution" minHeight={300}>
  <Bar 
    data={chartData} 
    options={{
      responsive: true,           // Chart.js handles resize
      maintainAspectRatio: false, // Fill container height
      // ... other options (DON'T change these responsively)
    }}
  />
</ChartCard>
```

### Plotly
```tsx
import Plot from 'react-plotly.js';

// ✅ CORRECT: Plotly config for responsiveness
<ChartCard title="Market Heatmap" minHeight={400}>
  <Plot
    data={plotData}
    layout={{
      autosize: true,  // Plotly handles resize
      margin: { l: 50, r: 30, t: 30, b: 50 },
      // ... other layout (DON'T change these responsively)
    }}
    config={{ responsive: true }}
    style={{ width: '100%', height: '100%' }}
  />
</ChartCard>
```

### D3.js
```tsx
// For D3, the pattern is different - use a ref and resize observer

function D3ChartWrapper({ data }: { data: DataPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // D3 creates/updates chart based on container size
    const { width, height } = containerRef.current.getBoundingClientRect();
    
    // D3 rendering logic here...
    const svg = d3.select(containerRef.current)
      .selectAll('svg')
      .data([null])
      .join('svg')
      .attr('width', width)
      .attr('height', height);
    
    // ... rest of D3 code
  }, [data]);
  
  // Use ResizeObserver for responsive updates
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver(() => {
      // Re-render chart on resize
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  return <div ref={containerRef} className="w-full h-full" />;
}

// Usage
<ChartCard title="Custom D3 Visualization" minHeight={350}>
  <D3ChartWrapper data={data} />
</ChartCard>
```

## Grid Layout Patterns

### Two-column chart grid
```tsx
<div className="
  grid gap-4 md:gap-6
  grid-cols-1 lg:grid-cols-2
">
  <ChartCard title="Volume Over Time">
    {/* Chart 1 */}
  </ChartCard>
  <ChartCard title="Price Trends">
    {/* Chart 2 */}
  </ChartCard>
</div>
```

### Mixed-size chart grid
```tsx
<div className="
  grid gap-4 md:gap-6
  grid-cols-1 lg:grid-cols-3
">
  {/* Large chart spanning 2 columns on desktop */}
  <div className="lg:col-span-2">
    <ChartCard title="Main Analysis" minHeight={400}>
      {/* Chart */}
    </ChartCard>
  </div>
  
  {/* Sidebar chart */}
  <ChartCard title="Summary" minHeight={400}>
    {/* Chart */}
  </ChartCard>
  
  {/* Full-width chart below */}
  <div className="lg:col-span-3">
    <ChartCard title="Detailed Breakdown" minHeight={300}>
      {/* Chart */}
    </ChartCard>
  </div>
</div>
```

### Masonry-style (variable heights)
```tsx
// Use CSS columns for masonry effect
<div className="
  columns-1 md:columns-2 lg:columns-3
  gap-4 md:gap-6
  [&>*]:mb-4 [&>*]:break-inside-avoid
">
  <ChartCard title="Chart 1" minHeight={250}>...</ChartCard>
  <ChartCard title="Chart 2" minHeight={350}>...</ChartCard>
  <ChartCard title="Chart 3" minHeight={200}>...</ChartCard>
  {/* Charts will flow into columns */}
</div>
```

## Height Management Strategies

### Fixed minimum height (recommended for most charts)
```tsx
<ChartCard minHeight={300}>
  {/* Chart will be at least 300px tall */}
</ChartCard>
```

### Aspect ratio (for specific visualizations)
```tsx
<ChartCard aspectRatio="16/9">
  {/* Maintains 16:9 ratio regardless of width */}
</ChartCard>

<ChartCard aspectRatio="1/1">
  {/* Square chart - good for pie/donut */}
</ChartCard>
```

### Fill available space (dashboard layouts)
```tsx
// Parent must have defined height
<div className="h-[calc(100vh-200px)] flex flex-col gap-4">
  <ChartCard className="flex-1" minHeight={0}>
    {/* Fills remaining space, no minimum */}
  </ChartCard>
</div>
```

## What NEVER Goes in ChartCard Props

```tsx
// ❌ DON'T pass chart configuration through ChartCard
<ChartCard 
  showLegend={false}        // ❌ This belongs in chart options
  tickCount={5}             // ❌ This belongs in chart options
  colorScheme="blue"        // ❌ This belongs in chart options
  tooltipFormat="$,.0f"     // ❌ This belongs in chart options
>

// ✅ DO keep chart config inside the chart
<ChartCard title="Revenue">
  <MyChart 
    data={data}
    showLegend={false}      // ✅ Chart controls its own config
    tickCount={5}
    colorScheme="blue"
  />
</ChartCard>
```

## Handling Very Small Screens (< 375px)

For extremely narrow viewports, consider:

```tsx
<ChartCard 
  title="Transaction Volume"
  minHeight={250}  // Reduce minimum on very small screens
  className="
    min-h-[250px]
    xs:min-h-[300px]  // xs = 375px+ in custom Tailwind config
  "
>
  {/* Chart with simplified view for small screens */}
</ChartCard>
```

Or provide an alternative view:
```tsx
function ResponsiveChartSection({ data }: Props) {
  const { width } = useWindowSize();
  
  // Very small screens: show summary table instead
  if (width < 375) {
    return <DataSummaryTable data={data} />;
  }
  
  // Normal: show chart
  return (
    <ChartCard title="Analysis">
      <Chart data={data} />
    </ChartCard>
  );
}
```

## Overflow Protection

The container MUST prevent chart overflow:

```css
/* Essential overflow handling */
.chart-container {
  overflow: hidden;  /* Clips any overflow */
  position: relative; /* For absolute positioned tooltips */
}

/* Alternative: allow horizontal scroll for data-dense charts */
.chart-container-scrollable {
  overflow-x: auto;
  overflow-y: hidden;
}
```

## Testing the Contract

Before completing any chart-related change:

- [ ] Chart renders correctly at 1920px width
- [ ] Chart renders correctly at 1440px width
- [ ] Chart renders correctly at 1024px width
- [ ] Chart renders correctly at 768px width
- [ ] Chart renders correctly at 375px width
- [ ] No horizontal scrollbar appears on page (unless intentional)
- [ ] Tooltips appear within viewport bounds
- [ ] Legends are readable at all sizes
- [ ] Interactive elements remain clickable
- [ ] Loading state displays correctly
- [ ] Error state displays correctly
