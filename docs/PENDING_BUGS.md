# Pending Bugs

## BUG-001: BeadsChart "No data for selected filters"

**Status:** Under Investigation
**Reported:** Jan 4, 2026
**Environment:** Production (sgpropertytrend.com)
**Page:** Market Overview (`/market-overview`)

### Description

The BeadsChart (Volume-Weighted Median Price by Region & Bedroom) suddenly started showing "No data for selected filters" message. Previously, this issue only affected the PriceDistributionChart. Both charts share the same data fetching mechanism.

### Investigation Summary

#### Q1: Which commit caused this?

Most likely candidates:

| Commit | Date | Description |
|--------|------|-------------|
| `566fb71` | Jan 3 | Added memoization to Market Overview page |
| `a390220` | Dec 31 | Optimized beads chart query (later reverted) |
| `df557ba` | Dec 31 | Reverted beads chart optimization |
| `12619e4` | Dec 31 | Fixed useDeferredFetch visibility triggering |

#### Q2: Why does "No data" keep recurring?

Historical analysis shows **5 distinct root causes** that have been fixed multiple times:

1. **Missing `timeframe` field in API schema** - Frontend sends param, backend silently drops it
2. **HTML response from cold start** - Render timeout returns SPA HTML instead of JSON
3. **Visibility gating failure** - IntersectionObserver doesn't trigger, charts never fetch
4. **Defensive fallbacks mask errors** - `data?.data || data || []` hides actual issues
5. **Wrong data aggregation format** - Adapter expects different shape than API returns

**Pattern:** Each fix addresses one layer, but new code paths reintroduce issues.

### Data Flow

```
Filters → useDeferredFetch → useAppQuery → /api/dashboard
                                              ↓
BeadsChart ← sharedData ← dashboardPanels ← Response
                                              ↓
               transformBeadsChartSeries(rawData)
                                              ↓
                    datasets.length === 0 → "No data"
```

### Key Files

| File | Role |
|------|------|
| `frontend/src/pages/MacroOverview.jsx:162-178` | Dashboard panels fetch with visibility gating |
| `frontend/src/components/powerbi/BeadsChart.jsx` | Bead chart component |
| `frontend/src/hooks/useDeferredFetch.js` | Visibility-based fetch deferral |
| `frontend/src/adapters/aggregate/beadsChart.js` | API response transformer |
| `backend/services/beads_chart_service.py` | Backend SQL query |

### Debug Info Available

BeadsChart has debug logging at lines 82-95:
- `[BeadsChart] Raw API beads_chart data:`
- `[BeadsChart] Sample row:`
- `[BeadsChart] Transformed data:`

Check browser console when bug occurs.
