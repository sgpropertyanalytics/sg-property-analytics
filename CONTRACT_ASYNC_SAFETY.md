# Contract & Async Safety Rules (MANDATORY)

These rules exist to prevent silent data bugs, broken charts, and performance regressions.
All future code MUST comply.

---

## Table of Contents

1. [API Contract Rules](#1-api-contract-rules-strict)
2. [Adapter Pattern](#2-adapter-pattern-non-negotiable)
3. [API Contract Versioning](#3-api-contract-versioning)
4. [Async Data Fetching Rules](#4-async-data-fetching-rules-mandatory)
5. [Performance & Stability Guarantees](#5-performance--stability-guarantees)
6. [Enforcement Checklist](#6-enforcement-checklist-pr-blocker)
7. [Mental Model](#7-mental-model)

---

## 1. API Contract Rules (STRICT)

### 1.1 No Hardcoded Enums (Backend & Frontend)

#### FORBIDDEN

Comparing raw strings like:
- `'New Sale'`, `'Resale'`, `'Sub Sale'`
- `'Freehold'`, `'99-year'`, `'999-year'`
- `'month'`, `'quarter'`, `'year'`

#### Backend

Raw enum strings may ONLY appear in:
- `constants.py`
- `api_contract.py`
- test fixtures

All logic MUST use constants:

```python
from constants import SALE_TYPE_NEW, TENURE_99_YEAR
from schemas.api_contract import SaleType, Tenure

# For DB queries
sale_type_db = SaleType.to_db(SaleType.RESALE)
```

#### Frontend

Raw enum strings may ONLY appear in:
- `frontend/src/schemas/apiContract.js`
- adapter test data

Components MUST NOT compare strings directly.

```javascript
// REQUIRED
import { isSaleType, isTenure } from '@/schemas/apiContract';

if (isSaleType.newSale(saleType)) { ... }
if (isTenure.freehold(tenure)) { ... }
```

---

## 2. Adapter Pattern (NON-NEGOTIABLE)

### 2.1 Charts Never Touch Raw API Data

#### FORBIDDEN

```javascript
response.data.map(...)
row.quarter ?? row.month
if (row.sale_type === 'New Sale')
```

#### REQUIRED

All API responses MUST pass through an adapter. Components consume adapter output only.

```javascript
const { data } = useAbortableQuery(
  (signal) => fetchAggregate(params, { signal })
    .then(r => transformTimeSeries(r.data)),
  [filterKey]
);
```

### 2.2 Adapters Are the Frontend Contract

**Adapters:**
- Normalize v1 / v2 / v3 responses
- Coerce types
- Provide stable output shapes
- Handle missing fields gracefully

**Charts:**
- Assume adapter output is correct
- Never defensively code against API shapes

### 2.3 Adapter Location and Naming

```
frontend/src/adapters/
├── index.js              # Re-exports all adapters
├── aggregateAdapter.js   # transformTimeSeries, transformLocationData, etc.
├── transactionAdapter.js # transformTransactionList
└── __tests__/            # Adapter tests
```

### 2.4 Adapter Function Pattern

```javascript
// adapters/aggregateAdapter.js
import { assertKnownVersion } from '../schemas/apiContract';

export function transformTimeSeries(response) {
  // 1. Validate version
  assertKnownVersion(response.meta?.apiContractVersion);

  // 2. Normalize to stable shape
  return response.data.map(row => ({
    period: row.period || row.quarter || row.month || row.year,
    count: row.count ?? 0,
    medianPsf: row.medianPsf ?? row.median_psf ?? null,
    // ... other fields with fallbacks
  }));
}
```

---

## 3. API Contract Versioning

### 3.1 Contract Version Awareness

**Backend MUST emit:**

```python
{
    "meta": {
        "apiContractVersion": "v3"
    },
    "data": [...]
}
```

**Frontend MUST validate via:**

```javascript
assertKnownVersion(response.meta.apiContractVersion);
```

### 3.2 Unknown Version Handling

| Environment | Behavior |
|-------------|----------|
| Dev | Console.warn |
| CI | Fail test |
| Prod | Degrade gracefully, log to monitoring |

### 3.3 Version Upgrade Path

When adding a new API version:

1. Backend adds new version support
2. Update `KNOWN_VERSIONS` in `apiContract.js`
3. Update adapters to handle new shape
4. Add tests for new version
5. Deprecation warning for old version (if applicable)

---

## 4. Async Data Fetching Rules (MANDATORY)

### 4.1 No Raw useEffect + axios

#### FORBIDDEN

```javascript
useEffect(() => {
  fetch(...).then(setData)
}, [])
```

#### REQUIRED

All async data fetching MUST use:
- `useAbortableQuery` (preferred for simple cases)
- OR `useStaleRequestGuard` (advanced cases with complex dependencies)

### 4.2 Abort & Stale Handling

Every async fetch MUST:
1. Cancel in-flight requests on dependency change
2. Ignore `AbortError` / `CanceledError`
3. Prevent stale `setState`

```javascript
// Using useStaleRequestGuard
const { startRequest, isStale, getSignal } = useStaleRequestGuard();

useEffect(() => {
  const requestId = startRequest();
  const signal = getSignal();

  fetchData({ signal })
    .then(data => {
      if (isStale(requestId)) return;  // Prevent stale update
      setData(data);
    })
    .catch(err => {
      if (err.name === 'AbortError') return;  // Ignore abort
      if (isStale(requestId)) return;
      setError(err);
    });
}, [dependencies]);
```

### 4.3 AbortError Must Never Surface

No aborted request may:
- Set error state
- Trigger error UI
- Flash "Failed to load"

```javascript
// CORRECT error handling
.catch(err => {
  if (err.name === 'AbortError' || err.name === 'CanceledError') {
    return;  // Silently ignore
  }
  if (isStale(requestId)) return;
  setError(err);
});
```

### 4.4 useAbortableQuery Pattern (Preferred)

```javascript
import { useAbortableQuery } from '../hooks/useAbortableQuery';

function MyChart() {
  const { data, loading, error } = useAbortableQuery(
    (signal) => apiClient.get('/api/data', { signal })
      .then(r => transformTimeSeries(r.data)),
    [filterKey, dateRange]  // Dependencies
  );

  if (loading) return <Skeleton />;
  if (error) return <ErrorBoundary error={error} />;
  return <Chart data={data} />;
}
```

### 4.5 useStaleRequestGuard Pattern (Complex Cases)

Use when you need:
- Multiple sequential requests
- Conditional fetching
- Custom loading state management

```javascript
import { useStaleRequestGuard } from '../hooks/useStaleRequestGuard';

function ComplexChart() {
  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requestId = startRequest();
    const signal = getSignal();
    setLoading(true);

    Promise.all([
      fetchDataA({ signal }),
      fetchDataB({ signal })
    ])
      .then(([a, b]) => {
        if (isStale(requestId)) return;
        setData(combineData(a, b));
      })
      .finally(() => {
        if (!isStale(requestId)) {
          setLoading(false);
        }
      });
  }, [dependencies]);
}
```

---

## 5. Performance & Stability Guarantees

All code MUST guarantee:

### 5.1 No Unnecessary Refetches

- Rapid filter toggles do not refetch unnecessarily
- Filter changes debounce/throttle where appropriate
- Identical requests are deduped

### 5.2 No UI Flicker

Rapid tab switching does not cause:
- Error flashes
- Duplicate requests
- Stale data overwrites
- Loading spinner flicker

### 5.3 Idempotent Actions

- Double-click actions are idempotent
- Retrying a failed request doesn't cause duplicates
- Form submissions handle rapid clicks

### 5.4 Graceful Degradation

- Slow network doesn't break UI
- Partial data renders partial UI (not blank)
- Timeouts show meaningful messages

---

## 6. Enforcement Checklist (PR BLOCKER)

Before merging, ALL must be true:

```
[ ] No hardcoded enum strings outside contract files
[ ] All charts use adapters
[ ] All async fetches use abort/stale protection
[ ] API contract version validated
[ ] No component touches raw API response
[ ] scripts/audit-async-safety.sh passes
[ ] Guardrail tests pass (SQL + enums + adapters)
```

### Automated Checks

Run before every PR:

```bash
# Async safety audit
bash frontend/scripts/audit-async-safety.sh

# Enum string check (should return 0 matches outside allowed files)
grep -r "'New Sale'\|'Resale'\|'Sub Sale'" frontend/src/components/ || echo "PASS"

# Direct API access check
grep -r "response\.data\[" frontend/src/components/ || echo "PASS"
```

---

## 7. Mental Model

### The Layer Rule

```
Database → API Serializer → Contract → Adapter → Chart
```

If logic leaks across layers:
1. **STOP**
2. Add an adapter or contract helper instead
3. Never "just handle it inline"

### Example of Layer Violation

```javascript
// WRONG - Chart knows about API shape
function MyChart({ apiResponse }) {
  const data = apiResponse.data.map(row => ({
    value: row.median_psf || row.medianPsf  // Leaking API knowledge
  }));
}

// CORRECT - Chart only knows adapter output
function MyChart({ data }) {
  // data is already normalized by adapter
  return <Bar data={data} />;
}
```

### Decision Tree

When uncertain, default to:

1. **Adding a helper** (in `apiContract.js` or `constants/`)
2. **Adding an adapter** (in `adapters/`)
3. **Adding a test** (always)

Never:
- "Just handle it inline"
- "It's only one place"
- "I'll fix it later"

---

## Quick Reference Card

```
CONTRACT & ASYNC SAFETY CHECKLIST

[ ] Enums from apiContract.js only
[ ] API responses through adapters
[ ] useAbortableQuery OR useStaleRequestGuard
[ ] AbortError ignored (not shown as error)
[ ] Stale check before setState
[ ] API version validated
[ ] No response.data access in components
```

---

## Sign-Off Template

Before marking frontend work as complete:

```markdown
## Contract & Async Safety Sign-Off

### Change Summary
[Brief description]

### Contract Compliance
- [x] No hardcoded enum strings
- [x] Uses apiContract.js helpers
- [x] API response through adapter

### Async Safety
- [x] Uses useAbortableQuery OR useStaleRequestGuard
- [x] AbortError handled silently
- [x] No stale setState possible

### Testing
- [x] Rapid interaction test passes
- [x] audit-async-safety.sh passes
- [x] Adapter tests cover this data

Verified by: [name]
Date: [date]
```
