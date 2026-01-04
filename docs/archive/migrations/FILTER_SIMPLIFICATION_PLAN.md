# Filter System Simplification Plan

## Executive Summary

The current filter system has **23 distinct layers** for what should be simple filter state. This document analyzes each layer, identifies redundancy, and proposes a simplified architecture that maintains functionality while reducing complexity by ~60%.

---

## Current Architecture: Layer-by-Layer Analysis

### Layer 1: Constants (constants.js)
```
INITIAL_FILTERS, INITIAL_DRILL_PATH, INITIAL_BREADCRUMBS,
INITIAL_FACT_FILTER, INITIAL_SELECTED_PROJECT, TIME_GROUP_BY
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Default values for state initialization |
| Necessary? | ✅ Yes - clean separation of defaults |
| Simplification | None needed |

---

### Layer 2: Filter State (PowerBIFilterProvider.jsx)

**Current state structure:**
```javascript
filters: {
  datePreset: 'Y1',           // ← Redundant with dateRange
  dateRange: { start, end },  // ← Redundant with datePreset
  districts: [],
  bedroomTypes: [],
  segments: [],
  saleType: null,
  psfRange: { min, max },
  sizeRange: { min, max },
  tenure: null,
  propertyAge: { min, max },
  propertyAgeBucket: null,
  project: null,
}
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Store user filter selections |
| Problem | `datePreset` + `dateRange` are mutually exclusive but stored separately |
| Simplification | **Merge into single `timeFilter` field** |

**Proposed:**
```javascript
filters: {
  timeFilter: { type: 'preset', value: 'Y1' },
  // OR
  timeFilter: { type: 'custom', start: '2024-01', end: '2024-06' },
  // ... rest unchanged
}
```

---

### Layer 3: Derived Active Filters (utils.js → deriveActiveFilters)

```javascript
activeFilters = deriveActiveFilters(filters, breadcrumbs, drillPath)
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Merge sidebar filters with drill-down breadcrumbs |
| Problem | Creates another copy of filter state |
| Necessary? | ⚠️ Partially - drill breadcrumbs need merging |
| Simplification | **Compute at usage site, not in provider** |

---

### Layer 4: Filter Key Generation (utils.js → generateFilterKey)

```javascript
filterKey = JSON.stringify({ datePreset, dateRange, districts, ... })
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Create stable cache/dependency key |
| Problem | Manual serialization is error-prone (led to the bug) |
| Necessary? | ❌ No - query library can do this automatically |
| Simplification | **Remove - let query key be the params object** |

---

### Layer 5: Debounced Filter Key (hooks.js → useDebouncedFilterKey)

```javascript
debouncedFilterKey = useDebouncedFilterKey(filterKey, 200)
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Prevent API spam when clicking multiple filters |
| Problem | Another layer of indirection |
| Necessary? | ✅ Yes, but at wrong layer |
| Simplification | **Move debouncing to query layer** |

---

### Layer 6: API Params Builder (utils.js → buildApiParamsFromState)

```javascript
params = buildApiParams({ group_by: 'month', metrics: 'count' })
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Convert filter state to API query params |
| Necessary? | ✅ Yes - clean separation |
| Simplification | **Keep but simplify input** |

---

### Layer 7: Split Contexts (3 contexts)

```javascript
FilterStateContext    // State values
FilterActionsContext  // Setter functions
FilterOptionsContext  // API metadata
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Reduce re-renders by splitting state/actions |
| Problem | Adds complexity, 4 different hooks to choose from |
| Necessary? | ⚠️ Premature optimization for most cases |
| Simplification | **Single context with useMemo** |

---

### Layer 8: Storage Layer (storage.js - 300+ lines)

```javascript
readFilterStorage(), writeFilterStorage(), getPageIdFromPathname(),
validatePageId(), checkStorageVersion(), markHydrated(), isHydrated()
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Page-namespaced sessionStorage persistence |
| Problem | Over-engineered for simple key-value storage |
| Necessary? | ⚠️ Partially - persistence is useful |
| Simplification | **Use zustand with persist middleware** |

---

### Layer 9: Query Hooks (4 layers!)

```
useQuery → useAbortableQuery → useGatedAbortableQuery
                    ↓
          useStaleRequestGuard
```

| Aspect | Assessment |
|--------|------------|
| Purpose | Data fetching with abort, stale protection, app-ready gating |
| Problem | 400+ lines of custom query logic |
| Necessary? | ❌ No - TanStack Query does this better |
| Simplification | **Replace with @tanstack/react-query** |

---

## The Core Problems

### Problem 1: Manual Cache Key Generation
```javascript
// CURRENT: Must remember to include every filter field
generateFilterKey = (activeFilters) => JSON.stringify({
  datePreset: ...,  // Easy to forget!
  dateRange: ...,
  // ... 12 more fields
})

// BETTER: Query key IS the params
useQuery({
  queryKey: ['aggregate', params],  // Automatic!
  queryFn: () => getAggregate(params)
})
```

### Problem 2: Dual Time Representation
```javascript
// CURRENT: Two fields that must be kept in sync
datePreset: 'Y1'                      // Set when clicking presets
dateRange: { start: null, end: null }  // Cleared when using presets

// BETTER: Single discriminated union
timeFilter: { type: 'preset', value: 'Y1' }
// OR
timeFilter: { type: 'custom', start: '2024-01', end: '2024-06' }
```

### Problem 3: Debouncing at Wrong Layer
```javascript
// CURRENT: Debounce in provider, pass key to charts
const debouncedFilterKey = useDebouncedFilterKey(filterKey)
// Chart: deps = [debouncedFilterKey]

// BETTER: Debounce at query layer
useQuery({
  queryKey: ['aggregate', params],
  staleTime: 200,  // Built-in "debounce" via cache
})
```

### Problem 4: Reinventing React Query
```javascript
// CURRENT: 400 lines of custom query logic
useQuery.js - status machine, abort handling, stale guards
useAbortableQuery.js - deprecated wrapper
useGatedAbortableQuery.js - app-ready gating
useStaleRequestGuard.js - stale request protection

// BETTER: Use battle-tested library
import { useQuery } from '@tanstack/react-query'
```

---

## Proposed Simplified Architecture

### New File Structure
```
frontend/src/
├── context/
│   └── FilterContext.jsx       # Single file, ~150 lines
├── hooks/
│   └── useFilters.js           # Simple hook, ~30 lines
└── lib/
    └── queryClient.js          # TanStack Query setup
```

### New FilterContext.jsx (~150 lines)
```javascript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Single store with persistence
export const useFilterStore = create(
  persist(
    (set) => ({
      // Unified time filter
      timeFilter: { type: 'preset', value: 'Y1' },
      setTimeFilter: (filter) => set({ timeFilter: filter }),

      // Other filters (unchanged)
      districts: [],
      bedroomTypes: [],
      segments: [],
      // ... setters

      // Reset
      reset: () => set(INITIAL_STATE),
    }),
    {
      name: 'filters',
      partialize: (state) => ({
        timeFilter: state.timeFilter,
        districts: state.districts,
        // ... only persist what's needed
      }),
    }
  )
)

// Simple params builder
export function buildParams(filters, overrides = {}) {
  const params = { ...overrides }

  // Time filter
  if (filters.timeFilter.type === 'preset') {
    params.timeframe = filters.timeFilter.value
  } else {
    params.dateFrom = filters.timeFilter.start
    params.dateTo = filters.timeFilter.end
  }

  // Other filters
  if (filters.districts.length) params.district = filters.districts.join(',')
  if (filters.bedroomTypes.length) params.bedroom = filters.bedroomTypes.join(',')
  // ...

  return params
}
```

### New Chart Pattern (~20 lines per chart)
```javascript
import { useQuery } from '@tanstack/react-query'
import { useFilterStore, buildParams } from '../context/FilterContext'

function TimeTrendChart({ saleType }) {
  // Get filters from store (no context needed)
  const filters = useFilterStore()

  // Build params (this IS your cache key)
  const params = buildParams(filters, {
    group_by: 'month',
    metrics: 'count,total_value',
    sale_type: saleType,
  })

  // TanStack Query handles everything
  const { data, status, refetch } = useQuery({
    queryKey: ['aggregate', params],
    queryFn: ({ signal }) => getAggregate(params, { signal }),
    staleTime: 30_000,      // Cache for 30s
    keepPreviousData: true, // Show old data while fetching
  })

  return <ChartFrame status={status}>...</ChartFrame>
}
```

---

## Comparison: Before vs After

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Files | 6 | 2 | 67% |
| Lines of code | ~1,200 | ~250 | 79% |
| State layers | 5 | 1 | 80% |
| Context providers | 4 | 0 | 100% |
| Custom hooks | 8 | 1 | 88% |
| Manual cache keys | Yes | No | ✅ |
| Bug surface area | High | Low | ✅ |

---

## Migration Path

### Phase 1: Quick Wins (Low Risk)
1. ✅ Fix `datePreset` in `generateFilterKey` (DONE)
2. Unify `datePreset` + `dateRange` into `timeFilter`
3. Remove `useDebouncedFilterKey` - debounce via staleTime

### Phase 2: Query Layer (Medium Risk)
1. Add `@tanstack/react-query` to project
2. Migrate one chart (TimeTrendChart) as proof of concept
3. Remove custom `useQuery` after all charts migrated

### Phase 3: State Layer (Higher Risk)
1. Add `zustand` with persist middleware
2. Migrate filter state from Context to Zustand
3. Remove PowerBIFilterProvider after migration complete

### Phase 4: Cleanup
1. Delete unused files (hooks.js, storage.js, utils.js parts)
2. Update imports across codebase
3. Remove legacy context exports

---

## Trade-offs

### What We Lose
- Split contexts for render optimization (rarely needed)
- Custom query timing instrumentation (can add back if needed)
- Full control over query lifecycle

### What We Gain
- 80% less code to maintain
- Automatic cache key generation (no more bugs)
- Battle-tested query caching and deduplication
- DevTools for debugging queries (TanStack Query DevTools)
- Single source of truth for time filters
- Simpler mental model

---

## Recommendation

**Start with Phase 1** - it's low risk and provides immediate benefit:
1. The `datePreset` fix is already done
2. Unifying `datePreset`/`dateRange` into `timeFilter` is isolated
3. These changes don't require new dependencies

After Phase 1 proves stable, proceed with Phase 2 (TanStack Query) which provides the biggest simplification benefit.

---

## Appendix: Current Layer Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT FILTER SYSTEM                        │
│                    (23 Layers Deep)                             │
└─────────────────────────────────────────────────────────────────┘

CONSTANTS (Layer 1)
  └─ INITIAL_FILTERS, INITIAL_DRILL_PATH, etc.

STATE MANAGEMENT (Layers 2-7)
  ├─ filters state (datePreset + dateRange = redundant)
  ├─ factFilter state
  ├─ drillPath state
  ├─ breadcrumbs state
  ├─ selectedProject state
  └─ timeGrouping state

DERIVED STATE (Layers 8-11)
  ├─ deriveActiveFilters(filters, breadcrumbs, drillPath)
  ├─ countActiveFilters(filters)
  ├─ generateFilterKey(activeFilters, factFilter)
  └─ useDebouncedFilterKey(filterKey)

CONTEXTS (Layers 12-15)
  ├─ FilterStateContext
  ├─ FilterActionsContext
  ├─ FilterOptionsContext
  └─ PowerBIFilterContext (legacy combined)

HOOKS (Layers 16-19)
  ├─ usePowerBIFilters()
  ├─ useFilterState()
  ├─ useFilterActions()
  └─ useFilterOptionsContext()

STORAGE (Layers 20-21)
  ├─ Page ID resolution
  └─ sessionStorage read/write/version/hydration

QUERY LAYER (Layers 22-23)
  ├─ useQuery → useAbortableQuery → useGatedAbortableQuery
  └─ useStaleRequestGuard

API BOUNDARY
  └─ buildApiParamsFromState()

┌─────────────────────────────────────────────────────────────────┐
│                    PROPOSED SIMPLE SYSTEM                       │
│                    (5 Layers)                                   │
└─────────────────────────────────────────────────────────────────┘

STORE (Layer 1)
  └─ useFilterStore (Zustand with persist)

PARAMS (Layer 2)
  └─ buildParams(filters, overrides)

QUERY (Layer 3)
  └─ useQuery from @tanstack/react-query

COMPONENTS (Layers 4-5)
  ├─ FilterBar (reads/writes store)
  └─ Charts (use params as query key)
```
