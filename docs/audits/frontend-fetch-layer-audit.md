# Frontend Fetch Layer Simplification Audit

> **Purpose:** Deep audit to verify all middleman code is removed, TanStack Query is used correctly, null safety is complete, and loading states are robust.
> **Priority:** Stability, Reliability, Efficiency, Clean Code
> **Scope:** Frontend hooks, components, and data fetching patterns

---

## Pre-Audit Context

### Migration Summary
| Before | After | Lines Deleted |
|--------|-------|---------------|
| 7 layers (Component → useDeferredFetch → buildApiParams → debouncedFilterKey → useAppQuery → adapter → backend) | 3 layers (Component → useAppQuery → backend) | ~250+ |

### Deleted Code
| Code | Lines | Replaced By |
|------|-------|-------------|
| `buildApiParamsFromState()` | ~50 | Inline params |
| `generateFilterKey()` | ~30 | TanStack queryKey array |
| `useDebouncedFilterKey` | 59 | TanStack staleTime |
| `useChartLoadingState` | 59 | TanStack isLoading/isError |
| `useRouteReset` | 50 | Dead code (unused) |
| Param adapters | various | Pydantic aliases |

### Critical Files
| File | Purpose |
|------|---------|
| `frontend/src/hooks/useAppQuery.js` | TanStack Query wrapper |
| `frontend/src/lib/queryClient.js` | Query client config + status derivation |
| `frontend/src/components/common/ChartFrame.jsx` | Status-based rendering |
| `frontend/src/stores/filterStore.js` | Zustand filter state |
| `frontend/src/context/PowerBIFilter/` | Utilities only (Provider removed) |

---

## 1. Deleted Code Verification

### 1.1 Completely Removed (Zero References Expected)

Run each command. **Expected: 0 matches** (or comments only)

```bash
# useChartLoadingState - MUST be fully removed
grep -rn "useChartLoadingState" frontend/src --include="*.jsx" --include="*.js"

# useDebouncedFilterKey - MUST be fully removed
grep -rn "useDebouncedFilterKey\|debouncedFilterKey" frontend/src --include="*.jsx" --include="*.js"

# generateFilterKey - MUST be fully removed
grep -rn "generateFilterKey" frontend/src --include="*.jsx" --include="*.js"

# buildApiParamsFromState - should only be in comments
grep -rn "buildApiParamsFromState" frontend/src --include="*.jsx" --include="*.js"

# Old query hooks - MUST be fully removed
grep -rn "useAbortableQuery\|useStaleRequestGuard\|useGatedAbortableQuery" frontend/src --include="*.jsx" --include="*.js"
```

**Audit table:**

| Pattern | Expected | Actual | Status |
|---------|----------|--------|--------|
| `useChartLoadingState` | 0 matches | ? | |
| `useDebouncedFilterKey` | 0 matches | ? | |
| `generateFilterKey` | 0 matches | ? | |
| `buildApiParamsFromState` | comments only | ? | |
| `useAbortableQuery` | 0 matches | ? | |
| `useStaleRequestGuard` | 0 matches | ? | |
| `useGatedAbortableQuery` | 0 matches | ? | |

### 1.2 Documented Tech Debt (Intentional - Do Not Delete Yet)

These patterns are **intentionally kept** per REPO_MAP.md §5:

| Pattern | Files | Purpose | Migration Plan |
|---------|-------|---------|----------------|
| `useDeferredFetch` | 6 files | Viewport lazy loading | React Query deferred queries |
| `filterKey` in useDeferredFetch | same 6 files | Visibility trigger | Part of above |

**Files using useDeferredFetch (document, don't delete):**
```bash
grep -l "useDeferredFetch" frontend/src --include="*.jsx" -r
```

Expected files:
- `MacroOverview.jsx` - Below-fold charts
- `PriceCompressionChart.jsx`
- `AbsolutePsfChart.jsx`
- `MarketValueOscillator.jsx`
- `GLSDataTable.jsx`
- `UpcomingLaunchesTable.jsx`

---

## 2. Orphaned Files Check

### 2.1 Files That Should Be Deleted

```bash
# Check if old hook files exist
ls -la frontend/src/hooks/useChartLoadingState.js 2>/dev/null && echo "DELETE THIS"
ls -la frontend/src/hooks/useDebouncedFilterKey.js 2>/dev/null && echo "DELETE THIS"
ls -la frontend/src/hooks/useAbortableQuery.js 2>/dev/null && echo "DELETE THIS"
ls -la frontend/src/hooks/useStaleRequestGuard.js 2>/dev/null && echo "DELETE THIS"
ls -la frontend/src/hooks/useGatedAbortableQuery.js 2>/dev/null && echo "DELETE THIS"

# Check for old context exports
grep -n "export.*generateFilterKey\|export.*buildApiParams" frontend/src/context/PowerBIFilter/*.js
```

### 2.2 Dead Exports in Remaining Files

Check `frontend/src/context/PowerBIFilter/` for unused exports:

```bash
# Find exports
grep -n "^export" frontend/src/context/PowerBIFilter/utils.js
grep -n "^export" frontend/src/context/PowerBIFilter/hooks.js

# For each export, verify it's imported somewhere
# Example: grep -rn "from.*PowerBIFilter.*import.*functionName" frontend/src
```

---

## 3. QueryKey Pattern Audit

### 3.1 GOOD Patterns (Verify All Use This)

```javascript
// Inline array with explicit dependencies
queryKey: ['chart-name', timeframe, bedroom, districts, saleType]

// Auto-wrapped by useAppQuery
useAppQuery(fn, ['chart-name', param1, param2], options)
// Internal: ['appQuery', 'chart-name', param1, param2]
```

### 3.2 BAD Patterns (Find and Fix)

```bash
# String filterKey in queryKey (OLD - should not exist)
grep -rn "queryKey.*filterKey" frontend/src --include="*.jsx" --include="*.js"

# JSON.stringify in queryKey (unnecessary)
grep -rn "queryKey.*JSON.stringify" frontend/src --include="*.jsx" --include="*.js"

# Single string queryKey (anti-pattern)
grep -rn "queryKey:\s*\['\w+'\]" frontend/src --include="*.jsx" --include="*.js"
```

**Expected:** 0 matches for bad patterns (except in useDeferredFetch which uses filterKey intentionally for visibility triggers, NOT query keys)

### 3.3 QueryKey Consistency Check

List all queryKey arrays and verify naming consistency:

```bash
grep -rn "queryKey.*\[" frontend/src/components --include="*.jsx" | head -50
grep -rn "queryKey.*\[" frontend/src/pages --include="*.jsx" | head -50
```

**Naming convention verification:**
- [ ] Chart keys use kebab-case: `'time-trend'`, `'new-vs-resale'`
- [ ] Keys include all reactive dependencies
- [ ] No duplicate key names for different queries

---

## 4. initialData Audit

### 4.1 Find All initialData Usage

```bash
grep -rn "initialData" frontend/src --include="*.jsx" --include="*.js"
```

### 4.2 Verify Correct Values

**CORRECT:** `initialData: null`
**WRONG:** `initialData: {}`, `initialData: []`

| File | Current Value | Status |
|------|---------------|--------|
| (fill from grep) | | |

**Why `null` is correct (per REPO_MAP.md Historical Incidents):**
- `initialData: {}` makes TanStack return `isSuccess: true` immediately
- This causes "No data" flash before real data loads
- `null` keeps query in loading state until fetch completes

### 4.3 Edge Case in queryClient.js

Verify this protection exists in `lib/queryClient.js`:

```javascript
// Lines ~152-154
if (isSuccess && !hasData && queryResult.dataUpdatedAt === 0) {
  return QueryStatus.LOADING;  // Prevent "No data" flash
}
```

---

## 5. Null Safety Audit

### 5.1 Find Unsafe Data Access

For every file using `initialData: null`, check for unsafe access:

```bash
# Find potential null access issues
grep -rn "\.find(\|\.map(\|\.filter(\|\.forEach(\|\.length\|\.reduce(" frontend/src/pages --include="*.jsx"
grep -rn "\.find(\|\.map(\|\.filter(\|\.forEach(\|\.length\|\.reduce(" frontend/src/components/powerbi --include="*.jsx"
```

### 5.2 Required Patterns

**SAFE patterns:**
```javascript
// Optional chaining
data?.items?.find(x => x.id === id)
kpis.items?.find(k => k.id === id)

// Nullish coalescing with defaults
const items = data?.items ?? []
const { chartData = [], summary = {} } = data ?? {}

// Array.isArray guard
const safeData = Array.isArray(data) ? data : []

// Explicit null check
if (!data) return null
```

**UNSAFE patterns (find and fix):**
```javascript
// Direct access without optional chaining
data.items.find(x => x.id === id)  // ❌ Crashes if data.items is null

// .map() without guard
data.map(x => x.value)  // ❌ Crashes if data is null

// .length without guard
if (data.length === 0)  // ❌ Crashes if data is null
```

### 5.3 Cross-Reference Check

For each component using `useAppQuery`:
1. Find `initialData: null` usage
2. Find all `data` property access
3. Verify each access has null safety

```bash
# Example for one file
grep -A 20 "useAppQuery" frontend/src/components/powerbi/TimeTrendChart.jsx | grep "data\."
```

---

## 6. Loading State Handling Audit

### 6.1 Status-Based Rendering (Verify Correct Pattern)

**CORRECT pattern:**
```javascript
<ChartFrame
  status={status}           // From useAppQuery
  error={error}
  empty={!hasData || data.length === 0}
  skeleton="bar"
  onRetry={refetch}
>
  {/* chart content */}
</ChartFrame>
```

**WRONG patterns:**
```javascript
// Masking errors as "no data" (CRITICAL BUG)
if (!data || data.length === 0) return <NoData />  // ❌ Hides errors

// Not passing error
<ChartFrame status={status} empty={!data}>  // ❌ Missing error prop

// Manual loading check instead of status
if (isLoading) return <Skeleton />  // ⚠️ Should use ChartFrame
```

### 6.2 Find Anti-Patterns

```bash
# Find components that might mask errors
grep -rn "!data.*return.*NoData\|!data.*return.*Empty" frontend/src --include="*.jsx"

# Find ChartFrame without error prop
grep -B5 -A5 "<ChartFrame" frontend/src --include="*.jsx" | grep -A5 "status=" | grep -v "error="

# Find manual loading checks outside ChartFrame
grep -rn "isLoading.*return.*Skeleton\|isPending.*return.*Skeleton" frontend/src/pages --include="*.jsx"
```

### 6.3 Status State Machine Verification

Verify `deriveQueryStatus()` in `lib/queryClient.js` handles all states:

| TanStack State | Derived Status | UI Behavior |
|----------------|----------------|-------------|
| `isPending && isFetching` | LOADING | Show skeleton |
| `isError` | ERROR | Show error + retry |
| `!isPending && isFetching && hasData` | REFRESHING | Blur + indicator |
| `isFetching && !hasData` | LOADING | Show skeleton |
| `isSuccess && hasData` | SUCCESS | Show chart |
| `isSuccess && !hasData` | SUCCESS | Show "No data" |
| `isSuccess && !hasData && dataUpdatedAt === 0` | LOADING | Show skeleton (edge case) |
| `!enabled` | IDLE | Show placeholder |

### 6.4 Boot Pending Handling

Verify ChartFrame handles boot pending:

```javascript
// ChartFrame.jsx ~lines 52-64
const { appReady } = useAppReadyOptional() ?? {};
const isBootPending = prop_isBootPending ?? !appReady;

if (isBootPending) {
  return <ChartSkeleton type={skeleton} height={height} />;
}
```

---

## 7. Shared Data Pattern Audit

### 7.1 Parent-Child Data Sharing

Verify shared data pattern in MacroOverview:

```bash
grep -n "sharedData\|sharedStatus\|sharedRawData" frontend/src/pages/MacroOverview.jsx
```

**Expected pattern:**
```javascript
// Parent fetches once
const { data: compressionRaw, status: compressionStatus } = useAppQuery(...)

// Children receive shared data
<PriceCompressionChart sharedData={compressionData} sharedStatus={compressionStatus} />
<AbsolutePsfChart sharedData={compressionData} sharedStatus={compressionStatus} />
<MarketValueOscillator sharedRawData={compressionRaw} sharedStatus={compressionStatus} />
```

### 7.2 Child Component Fallback

Verify children can fetch independently if shared data unavailable:

```javascript
// In PriceCompressionChart.jsx
const useSharedData = sharedData != null;

const { data, status } = useAppQuery(
  fetchFn,
  queryKey,
  { enabled: shouldFetch && !useSharedData }  // Skip if shared
);

const resolvedData = useSharedData ? sharedData : data;
const resolvedStatus = useSharedData ? sharedStatus : status;
```

---

## 8. Test Coverage Audit

### 8.1 Deleted Hook Tests (Should Also Be Deleted)

```bash
# Find test files for deleted hooks
find frontend/src -name "*.test.js" -exec grep -l "useChartLoadingState\|useDebouncedFilterKey\|generateFilterKey" {} \;
```

**Expected:** 0 matches (tests should be deleted with hooks)

### 8.2 New Pattern Tests (Should Exist)

Verify tests exist for:
- [ ] `useAppQuery` - loading, error, success states
- [ ] `deriveQueryStatus` - all state transitions
- [ ] `ChartFrame` - status-based rendering
- [ ] Null safety - components handle null data

```bash
ls frontend/src/hooks/__tests__/
ls frontend/src/lib/__tests__/
ls frontend/src/components/common/__tests__/
```

### 8.3 Integration Tests

Verify filter→query→render flow:

```bash
grep -l "useAppQuery\|ChartFrame" frontend/src/**/__tests__/*.test.js 2>/dev/null
```

---

## 9. Performance Verification

### 9.1 Stale Time Configuration

Verify in `lib/queryClient.js`:

```javascript
staleTime: 30_000,        // 30s - acts as debounce
gcTime: 5 * 60_000,       // 5min - cache retention
refetchOnWindowFocus: false,
refetchOnReconnect: true,
```

### 9.2 No Redundant Requests

Check DevTools Network tab:
- [ ] Filter change triggers ONE request (not multiple)
- [ ] Back navigation uses cache (no request)
- [ ] Rapid filter changes debounce correctly

### 9.3 Query Deduplication

Verify TanStack deduplicates identical queries:
- [ ] Same queryKey = shared request
- [ ] Parallel components don't duplicate

---

## 10. Regression Prevention Checks

### 10.1 Boot Deadlock Prevention (Historical Incident)

Verify abort handling in useAppQuery:

```javascript
// useAppQuery.js - should have abort guards
const mountedRef = useRef(true);
const activeRequestIdRef = useRef(0);

// On unmount
useEffect(() => {
  return () => { mountedRef.current = false; };
}, []);
```

### 10.2 "No Data" Flash Prevention (Historical Incident)

Verify initialData edge case is handled:

```bash
grep -n "dataUpdatedAt.*===.*0" frontend/src/lib/queryClient.js
```

### 10.3 Layer Count Verification

Current implementation should have max 3 layers:
1. Component (decides params)
2. useAppQuery (fetches data)
3. Backend (processes request)

Check for layer creep:
```bash
# Should NOT find new abstraction layers
grep -rn "use.*Fetch.*Query\|use.*Data.*Loader" frontend/src/hooks --include="*.js"
```

---

## 11. Deliverables Checklist

### Required Outputs

- [ ] **Dead Code Report** - All remaining references to deleted patterns
- [ ] **Orphaned Files** - Hook files that should be deleted
- [ ] **QueryKey Audit** - List of all queryKeys, pattern compliance
- [ ] **initialData Audit** - Files using wrong initial values
- [ ] **Null Safety Gaps** - Unsafe data access locations
- [ ] **Loading State Issues** - Components masking errors as "no data"
- [ ] **Dead Exports** - Unused exports in remaining files
- [ ] **Test Gaps** - Missing or outdated tests
- [ ] **Performance Check** - No redundant requests

### Action Items Template

| Priority | Issue | File:Line | Fix |
|----------|-------|-----------|-----|
| P0 | Null safety crash | `Chart.jsx:XX` | Add `?.` |
| P0 | Error masked as no data | `Page.jsx:XX` | Use ChartFrame |
| P1 | Wrong initialData | `Component.jsx:XX` | Change `{}` → `null` |
| P2 | Dead code | `hooks/old.js` | Delete file |
| P3 | Missing test | `__tests__/` | Add test |

---

## 12. Success Criteria

**Audit passes if:**
1. ✅ Zero references to deleted hooks (except comments)
2. ✅ All queryKeys use inline array pattern
3. ✅ All initialData uses `null` (not `{}` or `[]`)
4. ✅ All data access has null safety (`?.`, `??`, guards)
5. ✅ All ChartFrame usages pass `status` and `error`
6. ✅ No components mask errors as "no data"
7. ✅ All tests pass
8. ✅ No redundant API requests

**Red flags requiring immediate fix:**
- ❌ Component crashes on null data
- ❌ Error state shows "No data" instead of error message
- ❌ Active reference to deleted hook
- ❌ QueryKey uses string instead of array
- ❌ Boot pending not handled (infinite spinner)
