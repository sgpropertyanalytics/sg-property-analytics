# Chart Interpretation Reasoning Guide

## Cardinal Rule: No Citation, No Claim

**If a claim depends on policy, rates, or market news, you MUST include a citation. If no relevant source was provided in context, state that explicitly rather than making unsupported claims.**

Examples:
- WITH context: "ABSD for foreigners is 60% (IRAS, effective 27 Apr 2023)"
- WITHOUT context: "Policy rates apply but specific rates were not provided in context"
- NEVER: "ABSD is around 60%" (unsourced claim)

---

## General Principles

1. **Start with the data**: Describe what the chart shows before interpreting
2. **Acknowledge limitations**: Note sample size, time range, data gaps
3. **Provide context**: Compare to benchmarks, historical ranges, peer groups
4. **Avoid predictions**: Focus on what IS, not what WILL BE
5. **Cite sources**: Reference policy snippets, market context with dates
6. **No citation, no claim**: If external context wasn't provided, say so

---

## Time Series Charts

**Examples**: AbsolutePsfChart, TimeTrendChart

### What to look for:
- **Trend direction**: Rising, falling, or flat
- **Volatility**: Smooth vs choppy movement
- **Seasonality**: Q1/Q4 patterns (bonus season, school year)
- **Breakpoints**: Sudden changes (often policy-related)

### How to describe:
- "Over the [timeframe], [metric] has [direction] from [start] to [end]"
- "Notable [acceleration/deceleration] occurred in [period]"
- "Current level is [above/below] the [X]-month average"

---

## Distribution Charts

**Examples**: PriceDistributionChart

### What to look for:
- **Central tendency**: Where most transactions cluster
- **Spread**: Tight vs wide distribution
- **Skew**: Left-tail (bargains) vs right-tail (premiums)
- **Outliers**: Extreme values that may distort averages

### How to describe:
- "The median PSF of $X suggests..."
- "The interquartile range of $Y indicates [tight/wide] pricing"
- "The [left/right] skew suggests [buyer/seller] market dynamics"

---

## Comparison Charts

**Examples**: DistrictComparisonChart, NewVsResaleChart

### What to look for:
- **Relative positioning**: Which segment leads/lags
- **Spread changes**: Compression or divergence over time
- **Volume distribution**: Where activity concentrates

### How to describe:
- "CCR trades at [X]% premium to OCR, [above/below] historical average"
- "3BR units show [stronger/weaker] volume relative to 2BR"
- "The [narrowing/widening] spread suggests..."

---

## Beads Charts (Transaction Scatter)

**Examples**: BeadsChart

### What to look for:
- **Density clusters**: Where most transactions occur
- **Price bands**: Floor and ceiling patterns
- **Outliers**: Unusually high or low transactions
- **Time progression**: Recent vs older transactions

### How to describe:
- "Transactions cluster around $X PSF with floor at $Y"
- "Recent transactions (colored) show [higher/lower/similar] pricing"
- "The [bedroom] segment shows [tighter/wider] price dispersion"

---

## Heatmap Charts

**Examples**: BudgetActivityHeatmap, FloorLiquidityHeatmap

### What to look for:
- **Color intensity**: Darker = higher concentration/value
- **Cluster patterns**: Where activity concentrates
- **Anomalies**: Unexpected hot/cold cells
- **Row/column trends**: Consistent patterns across axes

### BudgetActivityHeatmap specifics:
- Each row sums to 100% (shows buyer preferences for that age band)
- Striped background = low sample size (<5 transactions)
- Suppressed cells (—) = privacy protection

### FloorLiquidityHeatmap specifics:
- Z-score normalization: +1.0+ = faster resale, -1.0- = slower resale
- Relative to project average, not absolute values
- Dashed cells = insufficient data (n<5)

### How to describe:
- "Activity concentrates in [segment], suggesting [buyer preference]"
- "[Floor level] shows [higher/lower] liquidity than average"
- "The [X,Y] cell stands out with [observation]"

---

## Dumbbell Charts

**Examples**: GrowthDumbbellChart

### What to look for:
- **Distance between dots**: Magnitude of change
- **Direction**: Growth (right movement) vs decline (left movement)
- **Color gradient**: Top performers (green) → bottom performers (amber)
- **Sorting**: Identify leaders and laggards

### How to describe:
- "D[X] shows the largest growth of [Y]%, moving from $[start] to $[end] PSF"
- "The bottom performers are concentrated in [region], suggesting..."
- "Spread between top and bottom is [X]%, indicating [market divergence/convergence]"

---

## Price Band Charts

**Examples**: PriceBandChart

### What to look for:
- **Band position**: P25-P50 (protected zone) vs P50-P75 (premium zone)
- **Band width**: Tight = consistent pricing, wide = variable pricing
- **Trend direction**: Rising/falling median over time
- **Unit position**: Where a specific unit sits relative to bands

### How to describe:
- "The project trades in a [tight/wide] band of $[X] to $[Y] PSF"
- "Current median is [above/below] the [X]-quarter trend"
- "Units priced below P50 have historical floor support"
- "Premium above P75 carries [higher/lower] resale risk"

---

## Price Compression Charts

**Examples**: PriceCompressionChart

### What to look for:
- **Spread direction**: Narrowing (compression) vs widening (fragmentation)
- **CCR-RCR vs RCR-OCR**: Which segment spread is moving
- **Compression score**: 0-100 scale (100 = tight market)
- **Crossovers**: Lines approaching or crossing (rare anomaly)

### How to describe:
- "The CCR-RCR spread has [compressed/widened] from [X]% to [Y]%"
- "Compression score of [X] indicates [tight/normal/wide] market conditions"
- "OCR is [catching up to/falling behind] RCR, suggesting..."

---

## Waterfall Charts

**Examples**: SupplyWaterfallChart

### What to look for:
- **Cumulative flow**: How supply adds up across stages
- **Stage proportions**: Which stage dominates pipeline
- **Regional differences**: Where supply concentrates
- **GLS impact**: Future supply from government land sales

### How to describe:
- "Total effective supply of [X] units, with [Y]% from unsold inventory"
- "[Region] accounts for [X]% of upcoming launches"
- "GLS pipeline adds [X] potential units, representing [Y]% increase"

---

## Oscillator Charts

**Examples**: MarketValueOscillator

### What to look for:
- **Zone position**: Overvalued (>+1σ), fair value (±1σ), undervalued (<-1σ)
- **Trend direction**: Moving toward or away from fair value
- **Divergence**: CCR vs RCR relative positioning
- **Historical context**: Current position vs past extremes

### How to describe:
- "The [segment] is currently [X]σ [above/below] historical average"
- "Market is in [overvalued/fair value/undervalued] territory"
- "Divergence of [X]σ between CCR and RCR suggests [opportunity/risk]"

---

## Timeline Charts

**Examples**: NewLaunchTimelineChart

### What to look for:
- **Volume bars**: Units launched per period
- **Absorption line**: Percentage sold in launch month
- **Inverse relationship**: High supply + low absorption = oversupply
- **Seasonal patterns**: Launch timing preferences

### How to describe:
- "[X] units launched with [Y]% launch-month absorption"
- "Absorption rate of [X]% is [above/below] the [Y]-year average"
- "[Strong/weak] demand relative to supply suggests [buyer/seller] market"

---

## Matrix/Grid Charts

**Examples**: PriceRangeMatrix, MarketMomentumGrid

### What to look for:
- **Cell patterns**: Consistent vs variable across dimensions
- **Outlier cells**: Significantly different from neighbors
- **Axis trends**: Progression along rows or columns
- **User position**: Where input falls within ranges

### PriceRangeMatrix specifics:
- Each cell shows fair price range (P25-P75) for bedroom × age combination
- Green zone (P25-P50) = floor support
- Red zone (P50-P75) = premium territory

### MarketMomentumGrid specifics:
- 28 mini sparklines, one per district
- Background bars = volume, line = median PSF
- % badge = total growth from first to last quarter
- Independent Y-axis (not cross-district comparable)

### How to describe:
- "Fair range for [bedroom] in [age band] is $[X] to $[Y] PSF"
- "D[X] shows [positive/negative] momentum with [Y]% growth"
- "[X] of 28 districts show positive momentum"

---

## Growth Charts

**Examples**: PriceGrowthChart

### What to look for:
- **Project vs district**: Outperformance or underperformance
- **Cumulative growth**: Total appreciation since first transaction
- **Trend consistency**: Steady vs volatile growth path
- **Recent momentum**: Acceleration or deceleration

### How to describe:
- "Project has appreciated [X]% since [date], [above/below] district average of [Y]%"
- "Recent quarters show [accelerating/decelerating] growth"
- "Outperformance of [X]% vs district suggests [premium resilience/catch-up potential]"

---

## Data Quality Considerations

Always note when:
- Sample size is small (<30 transactions)
- Time range is limited
- Data may be incomplete (recent months)
- Outliers significantly affect statistics
- Cells are suppressed or show insufficient data

Example: "Based on [N] transactions over [period]. Note: [limitation]."

---

## Connecting to Context

When policy or market context is provided:
- Reference specific snippets with dates
- Explain mechanism (how policy affects metric)
- Avoid speculation beyond provided context

Example: "Following the [policy change] in [date], the data shows [observation]. This aligns with [expected mechanism]."

When no relevant context is provided:
- State observation without causal claims
- Note that external factors may apply
- Do not invent policy or market explanations
