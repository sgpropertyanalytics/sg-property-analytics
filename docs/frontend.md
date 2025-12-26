# Frontend Reference

## Filter System

### FilterContext

All filter state lives in `FilterContext.jsx`:

```javascript
const filterState = {
  // Location
  regions: ['CCR', 'RCR', 'OCR'],
  districts: ['D01', 'D02', ...],

  // Property
  bedrooms: [2, 3, 4],
  propertyTypes: ['Condo', 'EC', 'Apt'],
  saleTypes: ['New Sale', 'Resale'],

  // Time
  dateRange: { from: '2020-01-01', to: '2024-12-31' },
  timeGrouping: 'quarter',  // year | quarter | month

  // Project (for deep-dive pages)
  highlightedProject: null,
  comparisonMode: false,
};
```

### Filter Key Generation

Charts use `filterKey` for cache/dependency tracking:

```javascript
const { filterKey } = useFilterContext();
// filterKey = "2,3,4|D09,D10|CCR,RCR|2020-2024"
```

### Building API Params

```javascript
import { buildApiParams } from '../contexts/FilterContext';

const params = buildApiParams({
  group_by: 'quarter,sale_type',
  metrics: 'count,median_psf',
}, { excludeHighlight: true });
```

---

## Adapter Pattern

### Rule: Charts Never Touch Raw API Data

**Forbidden:**
```javascript
response.data.map(...)
row.quarter ?? row.month
if (row.sale_type === 'New Sale')
```

**Required:**
```javascript
const transformed = transformTimeSeries(response.data);
```

### Adapter Structure

```
frontend/src/adapters/
├── index.js              # Re-exports
├── aggregateAdapter.js   # Time series, location, distribution
├── transactionAdapter.js # Transaction list
└── __tests__/
```

### Adapter Function Template

```javascript
export function transformTimeSeries(rawData, expectedGrain = null) {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformTimeSeries] Invalid input');
    return [];
  }

  return rawData
    .filter(row => hasValidPeriod(row))
    .map(row => ({
      period: getPeriod(row, expectedGrain),
      periodGrain: getPeriodGrain(row) || expectedGrain,
      count: getAggField(row, AggField.COUNT),
      medianPsf: getAggField(row, AggField.MEDIAN_PSF),
    }))
    .sort(sortByPeriod);
}
```

---

## Async Data Fetching

### useAbortableQuery (Preferred)

```javascript
import { useAbortableQuery } from '../hooks/useAbortableQuery';

function MyChart() {
  const { data, loading, error } = useAbortableQuery(
    async (signal) => {
      const response = await getAggregate(params, { signal });
      return transformTimeSeries(response.data);
    },
    [filterKey, timeGrouping],
    { initialData: [] }
  );

  if (loading) return <Skeleton />;
  if (error) return <ErrorBoundary error={error} />;
  return <Chart data={data} />;
}
```

### useStaleRequestGuard (Complex Cases)

For multiple sequential requests or custom loading state:

```javascript
import { useStaleRequestGuard } from '../hooks/useStaleRequestGuard';

function ComplexChart() {
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();

  useEffect(() => {
    const requestId = startRequest();
    const signal = getSignal();

    Promise.all([fetchA({ signal }), fetchB({ signal })])
      .then(([a, b]) => {
        if (isStale(requestId)) return;  // Prevent stale update
        setData(combineData(a, b));
      })
      .catch(err => {
        if (err.name === 'AbortError') return;  // Ignore abort
        if (isStale(requestId)) return;
        setError(err);
      });
  }, [dependencies]);
}
```

### AbortError Handling

**AbortError must NEVER surface as an error:**
```javascript
.catch(err => {
  if (err.name === 'AbortError' || err.name === 'CanceledError') {
    return;  // Silently ignore
  }
  setError(err);
});
```

---

## API Contract (Frontend)

### Enum Helpers

```javascript
import { isSaleType, isTenure, SaleType } from '@/schemas/apiContract';

// Type checks
if (isSaleType.newSale(saleType)) { ... }
if (isTenure.freehold(tenure)) { ... }

// Never compare raw strings
// WRONG: if (row.sale_type === 'New Sale')
```

### Field Access

```javascript
import { getAggField, AggField, getPeriod } from '@/schemas/apiContract';

// Access aggregate fields
const count = getAggField(row, AggField.COUNT);
const medianPsf = getAggField(row, AggField.MEDIAN_PSF);

// Access period
const period = getPeriod(row);  // handles quarter/month/year
```

### Version Validation

```javascript
import { assertKnownVersion } from '@/schemas/apiContract';

// In adapter
export function transformData(response) {
  assertKnownVersion(response.meta?.apiContractVersion);
  // ...
}
```

---

## Component Patterns

### Chart Component Structure

```javascript
function MyChart() {
  // 1. Get filter context
  const { filterKey, timeGrouping, buildApiParams } = useFilterContext();
  const debouncedFilterKey = useDebounce(filterKey, 150);

  // 2. Fetch data with adapter
  const { data, loading, error } = useAbortableQuery(
    async (signal) => {
      const params = buildApiParams({ group_by: 'quarter' });
      const response = await getAggregate(params, { signal });
      return transformTimeSeries(response.data);
    },
    [debouncedFilterKey, timeGrouping]
  );

  // 3. Render states
  if (loading) return <ChartSkeleton />;
  if (error) return <ChartError error={error} />;
  if (!data?.length) return <EmptyState />;

  // 4. Render chart
  return <Bar data={chartData} options={chartOptions} />;
}
```

### Premium Gating

```javascript
import { useSubscription, FeatureGate } from '@/hooks/useSubscription';

function PremiumFeature() {
  return (
    <FeatureGate feature="project_details">
      <ProjectDetails />
    </FeatureGate>
  );
}
```

---

## State Patterns

### Debouncing Filter Changes

```javascript
const debouncedFilterKey = useDebounce(filterKey, 150);

useAbortableQuery(fetcher, [debouncedFilterKey]);
```

### Preventing Flash of Error

```javascript
// Empty data shows EmptyState, not "Failed to load"
if (!loading && !error && data.length === 0) {
  return <EmptyState />;
}
```

### Rapid Interaction Safety

All charts must handle:
- Rapid filter toggles (no duplicate requests)
- Tab switching (no error flashes)
- AbortController cancellation

---

## Performance Guarantees

### Requirements

1. **No unnecessary refetches** - Identical requests are deduped
2. **No UI flicker** - Loading states are stable
3. **Idempotent actions** - Double-click safe

### Checklist Before PR

- [ ] Uses `useAbortableQuery` or `useStaleRequestGuard`
- [ ] AbortError handled silently
- [ ] Stale check before setState
- [ ] Empty data shows EmptyState
- [ ] Debounced filter changes

---

## Chart Migration Checklist

When adding or modifying charts:

### Data Fetching
- [ ] Use `useAbortableQuery`
- [ ] Remove manual `useState` for data/loading/error
- [ ] Pass `signal` to API calls

### Period Access
- [ ] Use `getPeriod(row)` not `row.quarter ?? row.month`
- [ ] Use `getPeriodGrain(row)` if grain detection needed

### Field Access
- [ ] Use `getAggField(row, AggField.*)` for metrics
- [ ] Use `isSaleType.newSale()` for type checks
- [ ] Never access `row.sale_type` directly

### Adapter Usage
- [ ] All transformation in adapter, not component
- [ ] Adapter returns exact shape chart expects
- [ ] Sorting handled by adapter

### Testing
- [ ] Build succeeds
- [ ] Year/Quarter/Month switching works
- [ ] Rapid filter changes don't flash errors

---

## File Organization

```
frontend/src/
├── adapters/
│   ├── aggregateAdapter.js    # transformTimeSeries, etc.
│   └── transactionAdapter.js  # transformTransactionList
├── api/
│   └── client.js              # API client with auth
├── components/
│   ├── powerbi/               # Dashboard charts
│   ├── ui/                    # Shared components
│   └── insights/              # Analysis views
├── contexts/
│   ├── FilterContext.jsx      # Filter state
│   └── AuthContext.jsx        # Firebase auth
├── hooks/
│   ├── useAbortableQuery.js   # Async fetching
│   ├── useStaleRequestGuard.js
│   └── useSubscription.js     # Premium gating
├── schemas/
│   └── apiContract.js         # Contract types, helpers
└── constants/
    └── index.js               # Shared constants
```

---

*Last updated: December 2024*
