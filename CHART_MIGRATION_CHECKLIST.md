# Chart Migration Checklist

## Purpose

This checklist ensures consistent migration of charts from raw API access to the adapter pattern.
Each chart should be migrated one-by-one following these steps.

---

## Pre-Migration Checklist

Before starting migration, verify:

- [ ] Backend contract smoke tests pass (`pytest tests/test_api_contract.py`)
- [ ] Frontend adapter tests pass (`npm run test:ci`)
- [ ] Build succeeds (`npm run build`)

---

## Per-Chart Migration Checklist

### 1. Data Fetching

- [ ] Replace `useStaleRequestGuard` with `useAbortableQuery`
- [ ] Remove manual `useState` for data, loading, error (hook provides these)
- [ ] Remove manual `useEffect` for fetching
- [ ] Remove `isInitialLoad.current` tracking
- [ ] Ensure `signal` is passed to API calls

### 2. Period Access

- [ ] Replace `row[timeGrouping] ?? row.quarter ?? row.month ?? row.year` with `getPeriod(row)`
- [ ] Use `getPeriodGrain(row)` if grain detection needed
- [ ] Use `hasValidPeriod(row)` to filter invalid rows

### 3. Field Access

- [ ] Use `getAggField(row, AggField.*)` for all metric fields
- [ ] Use `isSaleType.newSale()` / `isSaleType.resale()` for sale type checks
- [ ] Never access `row.sale_type` or `row.saleType` directly

### 4. Adapter Usage

- [ ] Create or use existing adapter function (e.g., `transformTimeSeries`)
- [ ] All transformation logic lives in adapter, not component
- [ ] Adapter returns exact shape chart expects
- [ ] Sorting handled by adapter (`sortByPeriod`)

### 5. Error Handling

- [ ] Empty data shows `<EmptyState />` component, NOT "Failed to load"
- [ ] Abort/cancel errors NEVER set error state
- [ ] Real errors show meaningful message

### 6. States

- [ ] `loading` state shows loading UI
- [ ] `error` state shows error UI
- [ ] `!loading && !error && data.length === 0` shows empty state
- [ ] Normal render when `data.length > 0`

### 7. Testing

- [ ] Build succeeds after migration
- [ ] Chart renders with mock data
- [ ] Year/Quarter/Month switching works
- [ ] Filter changes trigger refetch
- [ ] Rapid filter changes don't show error flash

---

## Chart Migration Status

| Chart | Status | Adapter Used | Notes |
|-------|--------|--------------|-------|
| TimeTrendChart | ✅ Done | `transformTimeSeries` | Reference implementation |
| MedianPsfTrendChart | ✅ Done | `transformTimeSeriesByRegion` | Uses region grouping |
| PriceCompressionChart | ✅ Done | `transformCompressionSeries` | Spread analysis w/ market signals |
| PriceDistributionChart | ✅ Done | `transformDistributionSeries` | Histogram w/ legacy format support |
| NewVsResaleChart | ✅ Done | `transformNewVsResaleSeries` | Pre-processed data normalization |
| GrowthDumbbellChart | ✅ Done | `transformGrowthDumbbellSeries` | District grouping w/ growth calc |
| TransactionDataTable | ✅ Done | `transformTransactionsList` | Paginated table w/ user controls |
| FloorLiquidityChart | ✅ Done | N/A (inline) | useAbortableQuery + QueryState |
| FloorPremiumByRegionChart | ✅ Done | N/A (inline) | useAbortableQuery + QueryState |
| FloorPremiumTrendChart | ✅ Done | N/A (inline) | useAbortableQuery + QueryState |
| FloorLiquidityHeatmap | ✅ Done | N/A (inline) | useAbortableQuery + QueryState |
| UnitSizeVsPriceChart | ✅ Done | N/A (inline) | useAbortableQuery + QueryState |
| HotProjectsTable | ✅ Done | N/A (inline) | useAbortableQuery + external filters |
| GLSDataTable | ✅ Done | N/A (inline) | useAbortableQuery + useDeferredFetch |
| UpcomingLaunchesTable | ✅ Done | N/A (inline) | useAbortableQuery + useDeferredFetch |
| MarketMomentumGrid | ✅ Done | N/A (inline) | useAbortableQuery + district grouping |
| TransactionDetailModal | ✅ Done | N/A (inline) | useAbortableQuery + pagination |
| VolumeByLocationChart | ❌ N/A | N/A | File doesn't exist in codebase |

---

## API Contract Version Safety

| Version | Status | Description |
|---------|--------|-------------|
| v1 | ⚠️ Deprecated | Legacy snake_case fields - sunset 2026-04-01 |
| v2 | ✅ Supported | camelCase fields + enum normalization |
| v3 | ✅ Current | Stabilization release - version flag for deprecation safety |

**Version Safety Features:**
- Backend emits `apiContractVersion: "v3"` in all response meta
- Frontend `assertKnownVersion()` validates received version
- Unknown versions warn in dev mode but never throw (graceful degradation)
- Adapter `KNOWN_VERSIONS` derived from central `SUPPORTED_API_CONTRACT_VERSIONS`

---

## Adapter Function Template

```javascript
/**
 * Transform raw API data for [ChartName].
 *
 * @param {Array} rawData - Raw data from /api/aggregate
 * @param {string} expectedGrain - Expected time grain
 * @returns {Array} Chart-ready data
 */
export const transform[ChartName]Data = (rawData, expectedGrain = null) => {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transform[ChartName]Data] Invalid input', rawData);
    return [];
  }

  const grouped = {};

  rawData.forEach((row) => {
    const period = getPeriod(row, expectedGrain);
    if (period === null) return; // Skip invalid rows

    if (!grouped[period]) {
      grouped[period] = {
        period,
        periodGrain: getPeriodGrain(row) || expectedGrain,
        // ... initialize fields
      };
    }

    // ... accumulate/transform data
  });

  return sortByPeriod(Object.values(grouped));
};
```

---

## useAbortableQuery Usage Template

```javascript
const { data, loading, error } = useAbortableQuery(
  async (signal) => {
    const params = buildApiParams({
      group_by: `${TIME_GROUP_BY[timeGrouping]},sale_type`,
      metrics: 'count,total_value'
    }, { excludeHighlight: true });

    const response = await getAggregate(params, { signal });
    const rawData = response.data?.data || [];

    // Debug logging (dev only)
    logFetchDebug('ChartName', {
      endpoint: '/api/aggregate',
      timeGrain: timeGrouping,
      response: response.data,
      rowCount: rawData.length,
    });

    // Use adapter for transformation
    return transformChartData(rawData, timeGrouping);
  },
  [debouncedFilterKey, timeGrouping],
  { initialData: [] }
);
```

---

## Verification Steps

After migrating a chart:

1. **Build Check**: `npm run build` succeeds
2. **Visual Check**: Chart renders correctly with real data
3. **Filter Test**: Change sidebar filters, data updates
4. **Time Grain Test**: Switch Year → Quarter → Month rapidly
5. **Empty State Test**: Apply filters that return no data
6. **Error Recovery**: API returns 500, then recovers

---

## Common Pitfalls

### 1. Forgetting to remove old state

```javascript
// ❌ DON'T: Keep old state alongside useAbortableQuery
const [data, setData] = useState([]);
const { data: queryData } = useAbortableQuery(...);

// ✅ DO: Use only what the hook provides
const { data, loading, error } = useAbortableQuery(...);
```

### 2. Not passing signal to API

```javascript
// ❌ DON'T: Forget signal
const response = await getAggregate(params);

// ✅ DO: Always pass signal
const response = await getAggregate(params, { signal });
```

### 3. Inline transformation instead of adapter

```javascript
// ❌ DON'T: Transform inside component
const transformed = rawData.map(row => ({ ... })).filter(...);

// ✅ DO: Use adapter
const transformed = transformTimeSeries(rawData, timeGrain);
```

### 4. Direct field access

```javascript
// ❌ DON'T: Direct access
const count = row.count;
const period = row.quarter || row.month;

// ✅ DO: Use helpers
const count = getAggField(row, AggField.COUNT);
const period = getPeriod(row);
```
