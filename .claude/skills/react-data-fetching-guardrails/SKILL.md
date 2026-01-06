---
name: react-data-fetching-guardrails
description: Frontend contract and async safety guardrails. ALWAYS activate before writing or modifying ANY React components that fetch data, use API responses, or handle enums. Enforces adapter pattern, TanStack Query usage, contract versioning, and enum safety. Use before AND after any frontend data-fetching changes.
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

├── Async Safety (via TanStack Query)
│   ├── Use useAppQuery() for all data fetching
│   ├── TanStack Query handles abort/stale automatically
│   ├── Include ALL data-affecting state in deps array
│   └── No manual AbortController or stale detection needed
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
// FORBIDDEN: Raw useEffect + fetch (use useAppQuery instead)
useEffect(() => {
  fetch(...).then(setData)
}, [])

// FORBIDDEN: Manual AbortController (TanStack Query handles this)
const controller = new AbortController();
useEffect(() => {
  return () => controller.abort();
}, [])

// FORBIDDEN: Manual stale request tracking
const requestIdRef = useRef(0);
requestIdRef.current++;

// FORBIDDEN: Direct API response access
const data = response.data.map(...)

// FORBIDDEN: Hardcoded enum strings
if (row.sale_type === 'New Sale')
if (tenure === 'Freehold')

// FORBIDDEN: Response shape assumptions
row.quarter ?? row.month  // API shape leaking into component
```

---

## Part 3: Correct Patterns

### Data Fetching with useAppQuery

```javascript
import { useZustandFilters } from '../stores';
import { useAppQuery } from '../hooks/useAppQuery';
import { getAggregate } from '../api/analytics';
import { transformTimeSeries } from '../adapters/aggregate/timeSeries';

function MyChart({ saleType = null }) {
  const { buildApiParams, debouncedFilterKey, timeGrouping } = useZustandFilters();

  const { data, status, error } = useAppQuery(
    async (signal) => {
      const params = buildApiParams({
        group_by: 'month',
        ...(saleType && { sale_type: saleType })
      });
      const response = await getAggregate(params, { signal });
      return transformTimeSeries(response.data);  // Always use adapter
    },
    [debouncedFilterKey, timeGrouping, saleType],  // ALL data-affecting state
    { chartName: 'MyChart', keepPreviousData: true }
  );

  if (status === 'pending') return <Skeleton />;
  if (status === 'error') return <ErrorState error={error} />;
  if (!data?.length) return <EmptyState />;
  return <Chart data={data} />;
}
```

### Key Points About useAppQuery

- **Automatic abort handling**: TanStack Query cancels in-flight requests on unmount or dependency change
- **Automatic stale detection**: Query keys determine data freshness
- **No manual cleanup needed**: No `AbortController`, no `requestIdRef`, no `isStale()` checks
- **Signal passed automatically**: The `signal` parameter in the fetch function enables abort

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

1. **Async Pattern**: Uses `useAppQuery()` (NOT raw useEffect + fetch)
2. **Deps Array**: Includes ALL data-affecting state (filters, timeGrouping, saleType, etc.)
3. **Adapter Usage**: Response passes through adapter before component
4. **Enum Safety**: No hardcoded strings, uses `apiContract.js`
5. **Version Check**: Adapter validates API contract version

---

## Part 4b: Contract is a Boundary, Not a Decoration

### The Problem

Contracts exist but don't reflect runtime reality:
- Schema says `List[str]`, service expects comma-separated `str`
- Schema documents `filtersApplied`, backend doesn't produce it
- Schema says camelCase, adapter outputs snake_case

**Smell:** Contract file exists but tests pass even when schema is wrong.

### The Rule

**Contract schemas must match exact runtime behavior.**

| ❌ Contract Drift | ✅ Contract Truth |
|------------------|------------------|
| Schema says `List[str]`, service expects `str` | Types match exactly at runtime |
| Schema documents fields backend doesn't produce | Only document what's actually returned |
| Schema says camelCase, adapter emits snake_case | End-to-end shape consistency |
| Contract allows `null`, code crashes on `null` | Nullability matches actual behavior |

### Enforcement Pattern

```javascript
// adapters/aggregateAdapter.js

// 1. Assert version for breaking changes
function assertKnownVersion(response) {
  const version = response.meta?.apiVersion || 'v1';
  if (!['v1', 'v2'].includes(version)) {
    console.warn(`Unknown API version: ${version}`);
  }
}

// 2. Validate shape matches contract
function validateResponseShape(data, expectedFields) {
  const missing = expectedFields.filter(f => !(f in data));
  if (missing.length > 0) {
    console.error(`Contract violation: missing fields ${missing}`);
  }
}

// 3. Transform with explicit field mapping
export function transformTimeSeries(response) {
  assertKnownVersion(response);

  return response.data.map(row => ({
    // Explicit mapping - no silent field access
    medianPsf: row.medianPsf ?? row.median_psf,
    period: row.period,
    count: row.count,
  }));
}
```

### Single Source of Truth for Meaning

**Rule:** Define parameter meaning and response meaning ONCE, enforce everywhere.

```
┌─────────────────────────────────────────────────────────────────┐
│  Contract Schema (schemas/apiContract.js)                        │
│  - Defines: what params mean, what response contains            │
│  - Enforces: validation, type checking                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    Route Handler      Adapter        Component
    (validates)     (transforms)      (consumes)

All three reference the SAME contract definition.
```

### Canonical Shapes End-to-End

Pick ONE canonical shape and enforce consistency:

```
Request params   →   Normalized params   →   Response keys
  snake_case     →      snake_case       →    camelCase (v2)

Frontend sends: { date_from: '2024-01-01', bedroom: '2,3' }
Backend emits:  { medianPsf: 1500, count: 42 }
Adapter maps:   response → { medianPsf, count }
Component uses: data.medianPsf (never data.median_psf)
```

### Checklist

```
[ ] Contract schema exists for endpoint
[ ] Schema types match runtime behavior
[ ] Schema only documents fields that are actually returned
[ ] Adapter calls assertKnownVersion()
[ ] Adapter does explicit field mapping (no silent access)
[ ] Component only uses adapter output shape
```

---

## Part 5: Common Mistakes Quick Reference

| Anti-Pattern | Symptom | Grep to Find | Fix |
|--------------|---------|--------------|-----|
| Raw useEffect + fetch | Race conditions, stale data | `grep -rn "useEffect.*fetch" frontend/src/` | Use `useAppQuery` |
| Manual AbortController | Unnecessary complexity | `grep -rn "new AbortController" frontend/src/` | TanStack Query handles abort |
| Direct response.data access | v1/v2 breaks on API change | `grep -rn "response\.data\[" frontend/src/` | Pass through adapter |
| Hardcoded enum strings | Filter mismatch | `grep -rn "'New Sale'\|'Resale'" frontend/src/components/` | Use `isSaleType.*()` |
| containerRef inside QueryState | Visibility fetch never triggers | `grep -rn "ref={containerRef}" frontend/src/ -A5 \| grep QueryState` | Move ref OUTSIDE QueryState |
| Missing deps array state | Stale data on toggle | Compare filter state usage to deps array | Include ALL data-affecting state |

### Quick Audit Commands

```bash
# Find components with raw fetch/axios in useEffect
grep -rn "useEffect.*fetch\|axios" frontend/src/components/

# Find hardcoded enum strings
grep -rn "'New Sale'\|'Resale'\|'Freehold'" frontend/src/components/

# Find direct response.data access
grep -rn "response\.data\[" frontend/src/components/

# Find manual AbortController (should use TanStack Query instead)
grep -rn "new AbortController()" frontend/src/

# Find containerRef inside conditional rendering
grep -rn "ref={containerRef}" frontend/src/components/ -A10 | grep -E "QueryState|loading \?"
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

**If a value changes the data, it MUST be in the deps array.**

### Symptom of Violation

```
User toggles "Quarter" → "Month"
→ UI label updates to "Month"
→ Chart still shows quarterly data (stale!)
```

### Root Cause

```javascript
// BUG: deps array missing timeGrouping
const { data } = useAppQuery(
  (signal) => fetchData(timeGrouping, signal),
  [debouncedFilterKey]  // ❌ Missing timeGrouping!
);
```

### Fix

```javascript
// CORRECT: deps array includes ALL data-affecting state
const { data } = useAppQuery(
  (signal) => fetchData(timeGrouping, signal),
  [debouncedFilterKey, timeGrouping]  // ✅
);
```

### "Is It Data State?" Decision Tree

```
Does changing this value change what the API returns?
├── YES → Must be in deps array
│   Examples: timeGrouping, dateRange, segment, bedroom, drillLevel, saleType
│
└── NO → UI-only state (exclude from deps)
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

### Checklist for useAppQuery

```
[ ] Deps array includes ALL data-affecting state
[ ] saleType prop included in deps if used
[ ] timeGrouping included in deps if used
[ ] Filter key derived from useZustandFilters() in deps
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

[ ] useAppQuery() for data fetching
[ ] Deps array includes ALL data-affecting state
[ ] Response passed through adapter
[ ] Enum from apiContract.js
[ ] No hardcoded enum strings
[ ] assertKnownVersion() in adapter
[ ] containerRef OUTSIDE conditional rendering
[ ] No raw useEffect + fetch patterns
[ ] No manual AbortController
```

---

## Sign-Off Template

Before marking frontend work as complete:

```markdown
## Contract & Async Safety Sign-Off

### Change Summary
[Brief description]

### Async Safety
- [x] Uses useAppQuery pattern
- [x] Deps array includes all data-affecting state
- [x] No raw useEffect + fetch
- [x] No manual AbortController

### Contract Compliance
- [x] API response through adapter
- [x] Enums from apiContract.js
- [x] No hardcoded strings
- [x] Version check in adapter

### Testing
- [x] Audit commands pass (Part 5)
- [x] Rapid interaction test passes

Verified by: [name]
Date: [date]
```
