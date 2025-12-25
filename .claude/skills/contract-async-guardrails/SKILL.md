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

## Part 5: Quick Audit Commands

```bash
# Find components with raw fetch/axios in useEffect
grep -rn "useEffect.*\n.*fetch\|axios" frontend/src/components/

# Find hardcoded enum strings
grep -rn "'New Sale'\|'Resale'\|'Freehold'" frontend/src/components/

# Find direct response.data access
grep -rn "response\.data\[" frontend/src/components/

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
