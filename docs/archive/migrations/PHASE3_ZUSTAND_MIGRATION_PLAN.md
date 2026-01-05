# Phase 3: Zustand Migration Plan

## ✅ MIGRATION COMPLETE

**Completed:** January 2026

### Migration Commits
| Phase | Commit | Description |
|-------|--------|-------------|
| 3.0 | `de9aacb` | Foundation - Zustand store created |
| 3.1 | `e188b45` | State Sync - Context → Zustand |
| 3.2 | `08a3a01` | Read Migration - Charts read from Zustand |
| 3.3 | `6ceebee` | Write Migration - Controls write to Zustand |
| 3.4 | `48adcc7` | Context Removal - PowerBIFilterProvider removed |
| 4.0 | `998ca84` | Dead Code Cleanup - 1024 lines deleted |

### Results
- **Lines deleted:** ~1,600 (PowerBIFilterProvider.jsx + FilterStoreDevTools.jsx)
- **Bundle reduction:** ~22KB
- **All tests passing:** 353/353

---

## Original Plan (Archived)

This document outlined the migration of filter state from React Context (`PowerBIFilterProvider`) to Zustand. This was a **high-risk refactoring** affecting **26+ files** across the codebase. The migration was broken into **5 sub-phases** with clear rollback points.

**Original scope:**
- Files to modify: 26+
- Lines of code affected: ~1,500
- Risk level: HIGH (central state management)
- Approach used: Incremental with feature flags

---

## Current Architecture Analysis

### What We're Replacing

```
PowerBIFilterProvider.jsx (600+ lines)
├── 9 state variables
├── 25 action functions
├── 4 React contexts (split for performance)
├── Page-namespaced sessionStorage persistence
├── Hydration logic
└── Route reset logic
```

### Consumer Breakdown (26+ files)

| Category | Count | Hook Used | Pattern |
|----------|-------|-----------|---------|
| Chart components | 15+ | `usePowerBIFilters()` | READ-ONLY |
| Filter controls | 3 | `usePowerBIFilters()` | READ + WRITE |
| Navigation | 2 | `usePowerBIFilters()` | READ + WRITE |
| Pages | 2 | Provider wrapper | ISOLATED |
| Hooks/Contexts | 3 | `useFilterState()` | READ-ONLY |
| App setup | 1 | Provider wrapper | ROOT |

### State Shape to Migrate

```javascript
// Core filter state (persisted)
filters: {
  timeFilter: { type: 'preset'|'custom', value?, start?, end? },
  districts: string[],
  bedroomTypes: number[],
  segments: string[],
  saleType: string | null,
  psfRange: { min: number|null, max: number|null },
  sizeRange: { min: number|null, max: number|null },
  tenure: string | null,
  propertyAge: { min: number|null, max: number|null },
  propertyAgeBucket: string | null,
  project: string | null,
}

// Transient state (resets on route change)
factFilter: { priceRange: { min, max } }
drillPath: { time: string, location: string }
breadcrumbs: { time: [], location: [] }
selectedProject: { name: string|null, district: string|null }

// View context (persisted separately)
timeGrouping: 'year' | 'quarter' | 'month'

// Meta state
filtersReady: boolean  // Hydration flag
pageId: string         // Route-derived namespace
```

---

## Risk Assessment

### HIGH RISK Areas
1. **Page-namespaced storage** - Each route has isolated filter state
2. **Hydration timing** - Charts must wait for `filtersReady` before fetching
3. **Route reset logic** - Transient state resets on navigation
4. **Split context optimization** - Actions context never re-renders
5. **26+ consumers** - Any breaking change cascades everywhere

### MEDIUM RISK Areas
1. **Derived state** (`activeFilters`, `filterKey`, `debouncedFilterKey`)
2. **buildApiParams function** - Used by all charts
3. **Drill navigation** - Complex breadcrumb/path logic

### LOW RISK Areas
1. **Filter setters** - Simple state updates
2. **Constants** - No change needed
3. **Utilities** - Pure functions, no change needed

---

## Migration Strategy: Incremental with Compatibility Layer

### Why NOT Big-Bang Migration
- 26+ consumers = high blast radius
- No automated test coverage for all paths
- Page-namespaced storage is complex
- Risk of "works locally, breaks in prod"

### Why Incremental
- Each sub-phase is independently deployable
- Rollback is trivial (remove feature flag)
- Can validate each phase before proceeding
- Maintains working app throughout

---

## Sub-Phase Breakdown

### Sub-Phase 3.0: Foundation (LOW RISK)
**Goal:** Add Zustand, create store, NO consumers yet

**Tasks:**
1. Install `zustand` package
2. Create `/frontend/src/stores/filterStore.js` with full state shape
3. Add persist middleware with page-namespaced storage
4. Export compatibility hooks that delegate to Context (unchanged behavior)
5. Add feature flag: `ENABLE_ZUSTAND_FILTERS`

**Files created:**
- `frontend/src/stores/filterStore.js` (~200 lines)
- `frontend/src/stores/index.js` (exports)

**Files modified:**
- `package.json` (add zustand)

**Rollback:** Delete new files, remove package

**Validation:**
- [x] Zustand DevTools show store state
- [x] Storage keys match existing pattern
- [x] No runtime errors
- [x] All existing tests pass

---

### Sub-Phase 3.1: State Synchronization (MEDIUM RISK)
**Goal:** Zustand store syncs WITH Context (dual-write)

**Tasks:**
1. In `PowerBIFilterProvider`, add effect to sync state TO Zustand
2. Zustand becomes "follower" - Context is still source of truth
3. Verify Zustand state mirrors Context exactly
4. Add DevTools comparison panel (dev only)

**Files modified:**
- `frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx` (~20 lines added)

**Rollback:** Remove sync effect

**Validation:**
- [x] Zustand DevTools show same state as Context
- [x] Filter changes reflect in both stores
- [x] No double-render issues
- [x] Performance unchanged (measure)

---

### Sub-Phase 3.2: Read Migration (MEDIUM RISK)
**Goal:** Chart components read from Zustand (Context still writes)

**Tasks:**
1. Create `useFilterStore` hook with same API as `usePowerBIFilters`
2. Add compatibility layer that reads from Zustand, writes to Context
3. Migrate READ-ONLY consumers (charts) to new hook
4. Keep filter controls on Context (still writes there)

**Consumer migration order (lowest risk first):**
1. `useChartLoadingState.js` - Internal hook
2. `AppReadyContext.jsx` - Reads `filtersReady` only
3. Chart components (one at a time):
   - `TimeTrendChart.jsx`
   - `PriceDistributionChart.jsx`
   - `BeadsChart.jsx`
   - ... (15+ charts)

**Files modified:**
- `frontend/src/stores/filterStore.js` (add compatibility hooks)
- 15+ chart components (change import)

**Rollback:** Revert imports to Context hooks

**Validation:**
- [x] Each migrated chart renders correctly
- [x] Filter changes propagate to charts
- [x] No visual regressions
- [x] Performance unchanged

---

### Sub-Phase 3.3: Write Migration (HIGH RISK)
**Goal:** Filter controls write to Zustand (Context becomes follower)

**Tasks:**
1. Flip source of truth: Zustand writes, Context syncs FROM Zustand
2. Migrate WRITE consumers to Zustand actions:
   - `PowerBIFilterSidebar.jsx`
   - `TimeGranularityToggle.jsx`
   - `DrillBreadcrumb.jsx`
   - `ProjectDetailPanel.jsx`
3. Verify bidirectional sync works
4. Context now only exists for unmigrated consumers

**Files modified:**
- `frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx` (reverse sync)
- 4 filter control components

**Rollback:** Flip sync direction back, revert control imports

**Validation:**
- [x] Filter sidebar changes reflect everywhere
- [x] Drill navigation works
- [x] Reset filters works
- [x] Storage persistence works
- [x] Page navigation loads correct filters

---

### Sub-Phase 3.4: Context Removal (HIGH RISK)
**Goal:** Remove PowerBIFilterProvider entirely

**Tasks:**
1. Migrate remaining Context consumers to Zustand
2. Remove Context provider from `App.jsx`
3. Remove `PowerBIFilterProvider.jsx` file
4. Update all imports to use Zustand hooks
5. Remove feature flag (Zustand is now default)

**Files deleted:**
- `frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx`
- `frontend/src/context/PowerBIFilter/hooks.js` (most of it)

**Files modified:**
- `frontend/src/App.jsx` (remove provider)
- `frontend/src/context/PowerBIFilter/index.js` (update exports)
- 26+ consumer files (final import cleanup)

**Rollback:** Restore deleted files from git, re-add provider

**Validation:**
- [x] Full E2E test pass
- [x] All pages load correctly
- [x] Filter persistence works across refresh
- [x] Page-namespaced isolation works
- [x] No console errors

---

## Zustand Store Design

### Proposed Store Structure

```javascript
// frontend/src/stores/filterStore.js
import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

// Page-namespaced storage adapter
const createPageStorage = (pageId) => ({
  getItem: (name) => {
    const key = `powerbi:${pageId}:${name}`;
    return sessionStorage.getItem(key);
  },
  setItem: (name, value) => {
    const key = `powerbi:${pageId}:${name}`;
    sessionStorage.setItem(key, value);
  },
  removeItem: (name) => {
    const key = `powerbi:${pageId}:${name}`;
    sessionStorage.removeItem(key);
  },
});

export const createFilterStore = (pageId) => create(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        // === STATE ===
        filters: INITIAL_FILTERS,
        factFilter: INITIAL_FACT_FILTER,
        drillPath: INITIAL_DRILL_PATH,
        breadcrumbs: INITIAL_BREADCRUMBS,
        selectedProject: INITIAL_SELECTED_PROJECT,
        timeGrouping: 'quarter',
        filtersReady: false,
        pageId,

        // === DERIVED STATE (computed on access) ===
        get activeFilters() {
          return deriveActiveFilters(get().filters, get().breadcrumbs, get().drillPath);
        },
        get activeFilterCount() {
          return countActiveFilters(get().filters);
        },
        get filterKey() {
          return generateFilterKey(get().activeFilters, get().factFilter);
        },

        // === ACTIONS ===
        setTimeFilter: (timeFilter) => set((state) => {
          state.filters.timeFilter = timeFilter;
        }),
        setTimePreset: (value) => set((state) => {
          state.filters.timeFilter = { type: 'preset', value };
        }),
        setTimeRange: (start, end) => set((state) => {
          state.filters.timeFilter = { type: 'custom', start, end };
        }),
        // ... 22 more actions (same as current)

        // === LIFECYCLE ===
        hydrate: () => set({ filtersReady: true }),
        resetFilters: () => set((state) => {
          state.filters = INITIAL_FILTERS;
        }),
        resetTransient: () => set((state) => {
          state.factFilter = INITIAL_FACT_FILTER;
          state.drillPath = INITIAL_DRILL_PATH;
          state.breadcrumbs = INITIAL_BREADCRUMBS;
          state.selectedProject = INITIAL_SELECTED_PROJECT;
        }),
      })),
      {
        name: 'filters',
        storage: createPageStorage(pageId),
        partialize: (state) => ({
          filters: state.filters,
          timeGrouping: state.timeGrouping,
        }),
      }
    )
  )
);
```

### Hook API (Backward Compatible)

```javascript
// Compatibility hooks - same API as Context hooks
export function useFilterStore() {
  const pageId = usePageId(); // From router
  const store = useStore(pageId);
  return store;
}

// Split hooks for performance (same as Context pattern)
export function useFilterState() {
  const store = useFilterStore();
  return {
    filters: store.filters,
    activeFilters: store.activeFilters,
    filterKey: store.filterKey,
    // ... state only
  };
}

export function useFilterActions() {
  const store = useFilterStore();
  return {
    setTimeFilter: store.setTimeFilter,
    setDistricts: store.setDistricts,
    // ... actions only
  };
}
```

---

## Page-Namespaced Storage Strategy

### Current Pattern (to preserve)
```
sessionStorage keys:
├── powerbi:market_overview:filters
├── powerbi:market_overview:timeGrouping
├── powerbi:market_overview:_version
├── powerbi:district_overview:filters
├── powerbi:district_overview:timeGrouping
└── powerbi:project_detail:filters  (shared for all /projects/:name)
```

### Zustand Implementation
```javascript
// Store factory - creates store per pageId
const storeCache = new Map();

export function getFilterStore(pageId) {
  if (!storeCache.has(pageId)) {
    storeCache.set(pageId, createFilterStore(pageId));
  }
  return storeCache.get(pageId);
}

// Hook that selects store based on current route
export function useFilterStore() {
  const location = useLocation();
  const pageId = getPageIdFromPathname(location.pathname);
  return getFilterStore(pageId);
}
```

### Route Change Handling
```javascript
// useRouteReset equivalent in Zustand
function useRouteResetEffect() {
  const location = useLocation();
  const prevPathRef = useRef(location.pathname);
  const store = useFilterStore();

  useEffect(() => {
    if (prevPathRef.current !== location.pathname) {
      prevPathRef.current = location.pathname;
      store.resetTransient(); // Reset drill, breadcrumbs, selectedProject
    }
  }, [location.pathname, store]);
}
```

---

## Derived State: Computed vs Memoized

### Option A: Zustand Computed (Recommended)
```javascript
// Computed on every access - simple but may recalculate
get activeFilters() {
  return deriveActiveFilters(this.filters, this.breadcrumbs, this.drillPath);
}
```

### Option B: Subscribed Selectors
```javascript
// Memoized selector - more complex but cached
const useActiveFilters = () => useFilterStore(
  (state) => deriveActiveFilters(state.filters, state.breadcrumbs, state.drillPath),
  shallow
);
```

### Recommendation
Start with Option A for simplicity. Profile performance. If derived state calculations become a bottleneck (unlikely), switch to Option B.

---

## Debounced Filter Key Strategy

### Current Implementation
```javascript
// In PowerBIFilterProvider
const filterKey = generateFilterKey(activeFilters, factFilter);
const debouncedFilterKey = useDebouncedFilterKey(filterKey, 200);
```

### Zustand Implementation Options

**Option 1: Keep as Hook (Recommended for Phase 3)**
```javascript
// Consumer continues using useDebouncedFilterKey
function ChartComponent() {
  const { filterKey } = useFilterStore();
  const debouncedFilterKey = useDebouncedFilterKey(filterKey, 200);
}
```

**Option 2: Move to Store (Phase 4 cleanup)**
```javascript
// Store manages debounced state internally
const store = create((set, get) => ({
  filterKey: '',
  debouncedFilterKey: '',
  // Internal debounce subscription
}));
```

### Recommendation
Keep `useDebouncedFilterKey` as separate hook for Phase 3. Evaluate removal in Phase 4 when considering if `staleTime` is sufficient.

---

## Testing Strategy

### Unit Tests (per sub-phase) ✅
- [x] Zustand store actions work correctly
- [x] Derived state computes correctly
- [x] Storage persistence works
- [x] Page namespacing works

### Integration Tests ✅
- [x] Filter changes propagate to all charts
- [x] Drill navigation works end-to-end
- [x] Reset filters clears everything
- [x] Page navigation loads correct filters

### E2E Tests ✅
- [x] Market Overview filters work
- [x] Primary Market filters isolated
- [x] Filter persistence across refresh
- [x] Multi-tab isolation (sessionStorage)

### Performance Tests ✅
- [x] No render regression (React DevTools Profiler)
- [x] No memory leaks (store cache cleanup)
- [x] Storage read/write timing unchanged

---

## Rollback Plan

### Per Sub-Phase Rollback
Each sub-phase can be rolled back independently:

| Phase | Rollback Action | Time |
|-------|-----------------|------|
| 3.0 | Delete store files, `npm remove zustand` | 5 min |
| 3.1 | Remove sync effect from Provider | 5 min |
| 3.2 | Revert chart imports to Context | 30 min |
| 3.3 | Flip sync direction, revert control imports | 30 min |
| 3.4 | `git revert` to restore Provider | 5 min |

### Full Rollback
If migration fails after Phase 3.4:
```bash
git revert HEAD~N  # Revert all migration commits
npm install        # Restore dependencies
```

---

## Success Criteria

### Functional ✅
- [x] All 26+ consumers work identically to before
- [x] Filter persistence works per-page
- [x] Hydration timing prevents double-fetch
- [x] Route reset clears transient state
- [x] No console errors or warnings

### Performance ✅
- [x] No render count regression
- [x] No memory leaks
- [x] Storage I/O unchanged
- [x] First paint time unchanged

### Code Quality ✅
- [x] ~60% reduction in filter state code (~1600 lines deleted)
- [x] No Context providers for filters
- [x] DevTools integration works
- [ ] TypeScript types (future enhancement)

---

## Dependencies

### Required Packages
```json
{
  "zustand": "^4.5.0",
  "immer": "^10.0.0"  // Optional, for immutable updates
}
```

### Peer Dependencies
- React 18+ (already met)
- React Router 6+ (already met)

---

## Timeline Considerations

**NOT providing time estimates** per project guidelines. Sub-phases are ordered by dependency and risk:

1. **3.0 Foundation** - Must complete first, lowest risk
2. **3.1 Sync** - Requires 3.0, validates approach
3. **3.2 Read Migration** - Requires 3.1, parallelizable across charts
4. **3.3 Write Migration** - Requires 3.2, highest risk
5. **3.4 Cleanup** - Requires 3.3, final step

Each sub-phase should be deployed and validated before proceeding to next.

---

## Open Questions

1. **Store per page vs single store with pageId selector?**
   - Current plan: Store factory (Map cache)
   - Alternative: Single store with `pageId` in state

2. **Keep `useDebouncedFilterKey` or rely on React Query `staleTime`?**
   - Current plan: Keep hook for Phase 3
   - Evaluate removal in Phase 4

3. **TypeScript migration alongside Zustand?**
   - Current plan: No, separate concern
   - Could add types in Phase 4

4. **Remove split context pattern or preserve in Zustand?**
   - Current plan: Preserve via selector hooks
   - Simpler alternative: Single `useFilterStore()` hook

---

## Appendix: File Change Summary

### New Files
- `frontend/src/stores/filterStore.js`
- `frontend/src/stores/index.js`

### Modified Files (26+)
- `package.json`
- `frontend/src/App.jsx`
- `frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx`
- `frontend/src/context/PowerBIFilter/index.js`
- `frontend/src/context/AppReadyContext.jsx`
- `frontend/src/hooks/useChartLoadingState.js`
- `frontend/src/pages/MacroOverview.jsx`
- `frontend/src/pages/PrimaryMarket.jsx`
- `frontend/src/components/powerbi/PowerBIFilterSidebar.jsx`
- `frontend/src/components/powerbi/FilterBar.jsx`
- `frontend/src/components/powerbi/TimeGranularityToggle.jsx`
- `frontend/src/components/powerbi/DrillBreadcrumb.jsx`
- `frontend/src/components/powerbi/ProjectDetailPanel.jsx`
- `frontend/src/components/powerbi/TimeTrendChart.jsx`
- `frontend/src/components/powerbi/PriceDistributionChart.jsx`
- `frontend/src/components/powerbi/BeadsChart.jsx`
- `frontend/src/components/powerbi/NewVsResaleChart.jsx`
- `frontend/src/components/powerbi/PriceCompressionChart.jsx`
- ... (10+ more chart components)

### Deleted Files (Phase 3.4)
- `frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx` (600+ lines)
- Parts of `frontend/src/context/PowerBIFilter/hooks.js`

---

## Completion Notes

**Migration completed successfully.** All phases executed without rollback.

### What Remains in PowerBIFilter/
The following pure utilities are kept (used by `filterStore.js`):
- `constants.js` - TIME_GROUP_BY, INITIAL_FILTERS
- `hooks.js` - useFilterOptions, useDebouncedFilterKey
- `storage.js` - Page-namespaced persistence utilities
- `utils.js` - Pure functions (deriveActiveFilters, etc.)

### Open Questions Resolved
1. **Store per page vs single store?** → Store factory (Map cache) worked well
2. **Keep useDebouncedFilterKey?** → Yes, kept for consistency
3. **TypeScript migration?** → Deferred to future enhancement
4. **Split context pattern?** → Preserved via selector hooks (useZustandFilterState, useZustandFilterActions)
