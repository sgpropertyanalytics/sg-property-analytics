---
name: contract-async-guardrails
description: Frontend contract and async safety guardrails. ALWAYS activate before writing or modifying ANY React components that fetch data, use API responses, or handle enums. Enforces adapter pattern, abort/stale handling, contract versioning, and enum safety. Use before AND after any frontend data-fetching changes.
---

# Contract & Async Safety Guardrails

> **Full documentation**: See [CONTRACT_ASYNC_SAFETY.md](../../../CONTRACT_ASYNC_SAFETY.md) for complete reference.

## Purpose

Prevent silent data bugs, stale state issues, and race conditions in React components. This skill acts as a guardrail for all frontend data operations.

---

## Part 1: Mandatory Checks Before Writing Frontend Code

### When This Activates

- Writing or modifying components that fetch data
- Creating or updating hooks that call APIs
- Handling API responses in components
- Using enum values (sale type, tenure, time period)
- Building new charts or data displays

### The "Must Do" Checklist

```
EVERY DATA-FETCHING COMPONENT MUST:

├── Async Safety
│   ├── Use useAbortableQuery OR useStaleRequestGuard
│   ├── Pass signal to ALL fetch calls
│   ├── Check isStale() before setState
│   └── Ignore AbortError/CanceledError
│
├── Adapter Pattern
│   ├── Pass API response through adapter
│   ├── Never access response.data directly in component
│   └── Use adapter output shape only
│
├── Enum Safety
│   ├── Import from schemas/apiContract.js
│   ├── Use isSaleType.newSale() not === 'New Sale'
│   └── No hardcoded enum strings
│
└── Contract Version
    └── Adapter calls assertKnownVersion()
```

---

## Part 2: Forbidden Patterns

### Immediately Reject Code That Contains:

```javascript
// FORBIDDEN: Raw useEffect + fetch
useEffect(() => {
  fetch(...).then(setData)
}, [])

// FORBIDDEN: Direct API response access
const data = response.data.map(...)

// FORBIDDEN: Hardcoded enum strings
if (row.sale_type === 'New Sale')
if (tenure === 'Freehold')

// FORBIDDEN: Missing abort handling
.catch(err => setError(err))  // AbortError will show as error!

// FORBIDDEN: Missing stale check
.then(data => setData(data))  // Could be stale!

// FORBIDDEN: Response shape assumptions
row.quarter ?? row.month  // API shape leaking into component
```

---

## Part 3: Correct Patterns

### Async Data Fetching (Simple Case)

```javascript
import { useAbortableQuery } from '../hooks/useAbortableQuery';
import { transformTimeSeries } from '../adapters/aggregateAdapter';

function MyChart({ filters }) {
  const filterKey = JSON.stringify(filters);

  const { data, loading, error } = useAbortableQuery(
    (signal) => apiClient.get('/api/aggregate', {
      params: filters,
      signal
    }).then(r => transformTimeSeries(r.data)),
    [filterKey]
  );

  if (loading) return <Skeleton />;
  if (error) return <ErrorBoundary error={error} />;
  return <Chart data={data} />;
}
```

### Async Data Fetching (Complex Case)

```javascript
import { useStaleRequestGuard } from '../hooks/useStaleRequestGuard';

function ComplexChart() {
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const requestId = startRequest();
    const signal = getSignal();
    setLoading(true);
    setError(null);

    fetchData({ signal })
      .then(response => {
        if (isStale(requestId)) return;
        setData(transformData(response.data));
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        if (err.name === 'CanceledError') return;
        if (isStale(requestId)) return;
        setError(err);
      })
      .finally(() => {
        if (!isStale(requestId)) {
          setLoading(false);
        }
      });
  }, [dependencies]);
}
```

### Enum Handling

```javascript
// CORRECT
import { SaleType, isSaleType, getTxnField } from '../schemas/apiContract';

// Checking type
const isNewSale = isSaleType.newSale(row.saleType);
const isResale = isSaleType.resale(row.saleType);

// Getting field value safely
const psf = getTxnField(row, 'psf');
```

---

## Part 4: Pre-Commit Validation

### Before Any Frontend Change, Verify:

1. **Async Pattern**: Uses `useAbortableQuery` or `useStaleRequestGuard`
2. **Signal Propagation**: All API calls receive `signal`
3. **Stale Check**: `isStale(requestId)` before `setState`
4. **AbortError**: Silently ignored, not shown as error
5. **Adapter Usage**: Response passes through adapter before component
6. **Enum Safety**: No hardcoded strings, uses `apiContract.js`
7. **Version Check**: Adapter validates API contract version

---

## Part 5: Common Mistakes Quick Reference

| Anti-Pattern | Symptom | Grep to Find | Fix |
|--------------|---------|--------------|-----|
| Raw useEffect + fetch | Race conditions, stale data | `grep -rn "useEffect.*fetch" frontend/src/` | Use `useAbortableQuery` |
| Missing signal prop | Requests continue after unmount | `grep -rn "\.get(\|\.post(" frontend/src/ \| grep -v signal` | Pass `{ signal }` to all fetches |
| AbortError shown as error | "Request aborted" toast on filter change | `grep -rn "setError(err)" frontend/src/` | Check `err.name === 'AbortError'` first |
| Direct response.data access | v1/v2 breaks on API change | `grep -rn "response\.data\[" frontend/src/` | Pass through adapter |
| Hardcoded enum strings | Filter mismatch | `grep -rn "'New Sale'\|'Resale'" frontend/src/components/` | Use `isSaleType.*()` |
| containerRef inside QueryState | Visibility fetch never triggers | `grep -rn "ref={containerRef}" frontend/src/ -A5 \| grep QueryState` | Move ref OUTSIDE QueryState |
| Missing query key state | Stale data on toggle | Compare `filterKey` to `useAbortableQuery` deps | Include ALL data-affecting state |

### Quick Audit Commands

```bash
# Find components with raw fetch/axios in useEffect
grep -rn "useEffect.*fetch\|axios" frontend/src/components/

# Find hardcoded enum strings
grep -rn "'New Sale'\|'Resale'\|'Freehold'" frontend/src/components/

# Find direct response.data access
grep -rn "response\.data\[" frontend/src/components/

# Find missing signal in API calls
grep -rn "getAggregate\|apiClient\.get" frontend/src/ | grep -v signal

# Find containerRef inside conditional rendering
grep -rn "ref={containerRef}" frontend/src/components/ -A10 | grep -E "QueryState|loading \?"

# Full async safety audit
bash frontend/scripts/audit-async-safety.sh
```

---

## Part 6: Testing Requirements

### Required Tests for Data-Fetching Changes

```javascript
// Adapter test: Handles v1 response
test('transformTimeSeries handles v1 response', () => {
  const v1Response = { data: [{ median_psf: 1500 }] };
  const result = transformTimeSeries(v1Response);
  expect(result[0].medianPsf).toBe(1500);
});

// Adapter test: Handles v2 response
test('transformTimeSeries handles v2 response', () => {
  const v2Response = { data: [{ medianPsf: 1500 }] };
  const result = transformTimeSeries(v2Response);
  expect(result[0].medianPsf).toBe(1500);
});

// E2E: Rapid interaction doesn't cause errors
test('rapid filter changes work', async ({ page }) => {
  await page.goto('/dashboard');
  // Rapidly toggle filters
  for (let i = 0; i < 5; i++) {
    await page.click('[data-testid="filter-toggle"]');
    await page.waitForTimeout(50);
  }
  // No error UI visible
  await expect(page.locator('.error-message')).not.toBeVisible();
});
```

---

## Part 7: Query Key Contract (State-Data Alignment)

### The Rule

**If a value changes the data, it MUST be in the query key.**

### Symptom of Violation

```
User toggles "Quarter" → "Month"
→ UI label updates to "Month"
→ Chart still shows quarterly data (stale!)
```

### Root Cause

```javascript
// BUG: filterKey missing timeGrouping
const { shouldFetch } = useDeferredFetch({
  filterKey: debouncedFilterKey,  // ❌ Missing timeGrouping!
});

const { data } = useAbortableQuery(
  (signal) => fetchData(timeGrouping, signal),
  [debouncedFilterKey, timeGrouping]  // ✅ Correct deps
);
```

### Fix

```javascript
// CORRECT: filterKey includes ALL data-affecting state
const { shouldFetch } = useDeferredFetch({
  filterKey: `${debouncedFilterKey}:${timeGrouping}`,  // ✅
});
```

### "Is It Data State?" Decision Tree

```
Does changing this value change what the API returns?
├── YES → Must be in query key / filterKey / deps
│   Examples: timeGrouping, dateRange, segment, bedroom, drillLevel
│
└── NO → UI-only state (exclude from query key)
    Examples: isExpanded, tooltipPosition, chartRef, isHovered
```

### View Context as Data State

```
WRONG MENTAL MODEL:
  "timeGrouping is just how we display the chart"

CORRECT MENTAL MODEL:
  timeGrouping=month → API returns 36 rows (monthly aggregates)
  timeGrouping=year  → API returns 3 rows (yearly aggregates)
  These are DIFFERENT DATASETS.
```

### Checklist for Deferred Fetch

```
[ ] filterKey includes ALL data-affecting state
[ ] useAbortableQuery deps match the concept in filterKey
[ ] enabled prop respects shouldFetch from useDeferredFetch
[ ] Label in header reflects current data, not just requested data
```

---

## Part 8: Visibility-Gated Fetching

**Rule:** Visibility-gated fetching requires a stable sentinel.

```
containerRef must be mounted unconditionally.
Skeleton/loading states render INSIDE the sentinel, not instead of it.
```

**Bug:**
```jsx
<QueryState loading={loading}>
  <div ref={containerRef}>...</div>  // NOT rendered during loading!
</QueryState>
```

**Fix:**
```jsx
<div ref={containerRef}>              // ALWAYS rendered
  <QueryState loading={loading}>
    <div>...</div>
  </QueryState>
</div>
```

**Symptom:** Chart loads initially but ignores filter changes (no error, just stale).

---

## Quick Reference Card

```
CONTRACT & ASYNC CHECKLIST

[ ] useAbortableQuery OR useStaleRequestGuard
[ ] signal passed to fetch/axios
[ ] isStale() check before setState
[ ] AbortError silently ignored
[ ] Response through adapter
[ ] Enum from apiContract.js
[ ] No hardcoded enum strings
[ ] assertKnownVersion() in adapter
[ ] Query key includes ALL data-affecting state (Card 18)
[ ] containerRef OUTSIDE conditional rendering (Part 8)
```

---

## Sign-Off Template

Before marking frontend work as complete:

```markdown
## Contract & Async Safety Sign-Off

### Change Summary
[Brief description]

### Async Safety
- [x] Uses abort-safe pattern
- [x] AbortError ignored
- [x] Stale check before setState
- [x] No loading flicker on rapid changes

### Contract Compliance
- [x] API response through adapter
- [x] Enums from apiContract.js
- [x] No hardcoded strings
- [x] Version check in adapter

### Testing
- [x] audit-async-safety.sh passes
- [x] Rapid interaction test passes

Verified by: [name]
Date: [date]
```
