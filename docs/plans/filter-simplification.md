# Filter Architecture Simplification Plan

> **Status:** Planning
> **Created:** 2026-01-04
> **Origin:** Over-engineering discovered in District Overview filter flow

## Problem Statement

The filter-to-API flow has 7 layers when 3 would suffice:

```
CURRENT (7 layers):
User clicks filter
    ↓ (1) Zustand store
    ↓ (2) getActiveFilters()
    ↓ (3) getFilterKey() + JSON.stringify
    ↓ (4) debouncedFilterKey (300ms delay)
    ↓ (5) useAppQuery deps trigger
    ↓ (6) buildApiParams() abstraction
    ↓ (7) adapter (timeframe → period rename)
    ↓ Backend

TARGET (3 layers):
User clicks filter
    ↓ Zustand store
    ↓ useQuery with inline params
    ↓ Backend
```

## What We're Deleting

### Functions to Remove

| Function | Location | Reason |
|----------|----------|--------|
| `generateFilterKey()` | `context/PowerBIFilter/utils.js` | TanStack Query does this |
| `deriveActiveFilters()` | `context/PowerBIFilter/utils.js` | Rarely used breadcrumb feature |
| `buildApiParamsFromState()` | `context/PowerBIFilter/utils.js` | 3 lines inline instead |
| `useDebouncedFilterKey()` | `context/PowerBIFilter/hooks.js` | Dropdowns don't need debounce |

### Store Methods to Simplify

| Method | Current | After |
|--------|---------|-------|
| `getFilterKey()` | Calls `generateFilterKey()` | Remove (use queryKey directly) |
| `getActiveFilters()` | Calls `deriveActiveFilters()` | Return `filters` directly |
| `buildApiParams()` | 50+ line function | Remove (inline in components) |

## What We're Keeping

| Keep | Reason |
|------|--------|
| Zustand store | Good for shared state |
| `useAppQuery()` wrapper | Handles visibility gating, error boundaries |
| Filter state shape | Works fine |
| SessionStorage persistence | Good UX |

## Migration Steps

### Phase 1: Backend Alignment (Remove Adapter Need)

**Goal:** Backend accepts same param names as frontend

```python
# Before: Backend expects different names
period = params.get('period')  # Frontend sends 'timeframe'
bed = params.get('bed')         # Frontend sends 'bedroom'

# After: Backend accepts frontend names directly
timeframe = params.get('timeframe')
bedroom = params.get('bedroom')
```

**Files to update:**
- `backend/routes/insights.py` - Accept `timeframe` instead of `period`
- `backend/api/contracts/schemas/insights.py` - Update param schemas
- `backend/api/contracts/pydantic_models/insights.py` - Update models

### Phase 2: Simplify Component Usage

**Goal:** Components use inline params, not abstractions

```jsx
// Before (complex)
const { buildApiParams, debouncedFilterKey } = useZustandFilters();
const params = buildApiParams({ sale_type: saleType });
const adapted = { period: params.timeframe || 'Y1', bed: params.bedroom || '' };
const { data } = useAppQuery(fn, [debouncedFilterKey, saleType, 'key'], options);

// After (simple)
const { filters } = useFilters();
const { data } = useQuery({
  queryKey: ['district-liquidity', filters.timeframe, filters.bedroom, saleType],
  queryFn: ({ signal }) =>
    api.get('/insights/district-liquidity', {
      params: {
        timeframe: filters.timeframe?.value || 'Y1',
        bedroom: filters.bedroomTypes?.join(',') || '',
        saleType
      },
      signal
    })
});
```

**Files to update:**
- `frontend/src/components/insights/DistrictLiquidityMap/DistrictLiquidityMap.jsx`
- `frontend/src/components/insights/MarketStrategyMap.jsx`
- `frontend/src/components/powerbi/MarketMomentumGrid.jsx`
- (All other chart components using filters)

### Phase 3: Simplify Zustand Store

**Goal:** Remove unnecessary methods

```javascript
// Before: Complex store
const store = {
  filters: {...},
  getActiveFilters: () => deriveActiveFilters(...),
  getFilterKey: () => generateFilterKey(...),
  buildApiParams: (additionalParams, options) => {...},
  // ... 50+ methods
};

// After: Simple store
const store = {
  filters: {...},
  setTimeframe: (value) => set({ filters: { ...get().filters, timeFilter: value } }),
  setBedroom: (value) => set({ filters: { ...get().filters, bedroomTypes: value } }),
  // ... only setters, no getters/builders
};
```

**Files to update:**
- `frontend/src/stores/filterStore.js`

### Phase 4: Delete Dead Code

**Files to delete or gut:**
- Remove `generateFilterKey()` from `context/PowerBIFilter/utils.js`
- Remove `deriveActiveFilters()` from `context/PowerBIFilter/utils.js`
- Remove `buildApiParamsFromState()` from `context/PowerBIFilter/utils.js`
- Remove `useDebouncedFilterKey()` from `context/PowerBIFilter/hooks.js`
- Simplify `useZustandFilters()` hook

## Debounce Strategy

**Problem:** Current code debounces ALL filter changes, but dropdowns don't need it.

**Solution:** Only debounce text inputs (search boxes, if any)

| Filter Type | Debounce? |
|-------------|-----------|
| Timeframe dropdown | NO - single click |
| Bedroom dropdown | NO - single click |
| District dropdown | NO - single click |
| Search box (if added) | YES - continuous typing |
| Slider (if added) | YES - continuous drag |

## Testing Strategy

### Before Migration
```bash
# Capture current behavior
npm run test:e2e -- --grep "District Overview"
# Save screenshots for visual comparison
```

### During Migration
```bash
# After each phase, verify no regressions
npm run test:ci
npm run build
```

### After Migration
```bash
# Full test suite
npm run test:e2e:full
# Verify filter changes trigger API calls (check Network tab)
```

## Success Criteria

1. **Line count:** Remove 200+ lines of abstraction code
2. **Flow simplicity:** 3 layers max (User → Store → Query → API)
3. **Debuggability:** Can trace filter→API in one file
4. **No debounce on dropdowns:** Immediate response on click
5. **All tests pass:** No regressions

## Rollback Plan

If migration causes issues:
1. Revert to commit before migration
2. Document what went wrong in REPO_MAP.md
3. Try smaller incremental changes

## Timeline

| Phase | Scope | Risk |
|-------|-------|------|
| Phase 1 | Backend param alignment | LOW - backwards compatible |
| Phase 2 | Component simplification | MEDIUM - one page at a time |
| Phase 3 | Store simplification | MEDIUM - affects all pages |
| Phase 4 | Dead code deletion | LOW - just cleanup |

**Recommendation:** Do Phase 1 first, then Phase 2 for District Overview only, verify it works, then expand.

---

## Appendix: Historical 23-Layer Analysis

> Preserved from earlier analysis (Jan 2026) showing full complexity before simplification.

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
```

### Comparison: 23 Layers → 3 Layers

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Files | 6 | 2 | 67% |
| Lines of code | ~1,200 | ~250 | 79% |
| State layers | 5 | 1 | 80% |
| Context providers | 4 | 0 | 100% |
| Custom hooks | 8 | 1 | 88% |
