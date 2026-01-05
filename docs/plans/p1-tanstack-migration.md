# P1 TanStack Query Migration Plan

## LIBRARY CHECK (CLAUDE.md Rule 5 & 11)

```
┌─────────────────────────────────────────────────────────────┐
│ LIBRARY CHECK (mandatory before ANY custom code)            │
├─────────────────────────────────────────────────────────────┤
│ Task: Replace useEffect+useState data fetching patterns     │
│                                                             │
│ npm search: @tanstack/react-query                           │
│ Found: @tanstack/react-query - 5M+/week - ~45KB             │
│                                                             │
│ Decision: [x] USE LIBRARY  [ ] CUSTOM CODE                  │
│ Reason: Already in use (useAppQuery wrapper). Migrate       │
│         remaining custom patterns to TanStack Query.        │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Migrate (Priority Order)

| # | File | Lines | Anti-Pattern | Complexity |
|---|------|-------|--------------|------------|
| 1 | DataContext.jsx | 131 | useEffect + useState | LOW |
| 2 | ProjectDetailPanel.jsx | ~300 | useEffect + requestIdRef | MEDIUM |
| 3 | DealCheckerContent.jsx | 901 | useEffect + inline useStaleRequestGuard | HIGH |
| 4 | ExitRisk.jsx | 800+ | 10+ useState + multiple useEffect chains | VERY HIGH |

---

## Migration 1: DataContext.jsx (LOW)

### Current Pattern (Anti-Pattern)
```jsx
const [filterOptions, setFilterOptions] = useState(INITIAL_FILTER_OPTIONS);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(null);

useEffect(() => {
  const fetchStaticData = async () => {
    // ... fetch logic
  };
  fetchStaticData();
}, []);
```

### Target Pattern (Rule 9)
```jsx
const { data: filterOptions, status, error } = useAppQuery(
  async (signal) => {
    const [filterOptionsRes, metadataRes] = await Promise.all([
      getFilterOptions({ signal, priority: 'high' }),
      getMetadata({ signal, priority: 'high' })
    ]);
    return {
      filterOptions: normalizeFilterOptions(filterOptionsRes.data),
      metadata: metadataRes.data
    };
  },
  ['staticData'],
  { chartName: 'DataContext', staleTime: Infinity } // Fetch once
);
```

### Changes Required
- Remove useState for filterOptions, apiMetadata, loading, error
- Replace useEffect with useAppQuery
- Use `staleTime: Infinity` for "fetch once" semantics
- Derive `isDataReady` from status

---

## Migration 2: ProjectDetailPanel.jsx (MEDIUM)

### Current Pattern (Anti-Pattern)
```jsx
const [trendData, setTrendData] = useState([]);
const [loading, setLoading] = useState(true);
const requestIdRef = useRef(0);
const abortControllerRef = useRef(null);

useEffect(() => {
  abortControllerRef.current?.abort();
  abortControllerRef.current = new AbortController();
  requestIdRef.current += 1;
  const requestId = requestIdRef.current;
  // ... manual stale request handling
}, [selectedProject]);
```

### Target Pattern (Rule 9)
```jsx
const { data: projectData, status, error, refetch } = useAppQuery(
  async (signal) => {
    const [trendRes, priceRes, inventoryRes] = await Promise.all([
      getAggregate(trendParams, { signal }),
      getAggregate(priceParams, { signal }),
      getProjectInventory(selectedProject.name, { signal })
    ]);
    return { trend: trendRes.data, price: priceRes.data, inventory: inventoryRes.data };
  },
  ['projectDetail', selectedProject?.name, filters],
  { chartName: 'ProjectDetailPanel', enabled: !!selectedProject?.name }
);
```

### Changes Required
- Remove all useState for data/loading/error
- Remove requestIdRef and abortControllerRef (TanStack handles this)
- Replace useEffect with useAppQuery
- Use `enabled: !!selectedProject?.name` for conditional fetch

---

## Migration 3: DealCheckerContent.jsx (HIGH)

### Current Pattern (Anti-Pattern)
```jsx
// Inline custom hook - ANTI-PATTERN (Rule 284-285)
function useStaleRequestGuard() { ... }

const [projectOptions, setProjectOptions] = useState([]);
const [result, setResult] = useState(null);
const [loading, setLoading] = useState(false);

// useEffect for initial data
useEffect(() => { loadProjects(); }, []);

// Manual fetch on form submit
const handleCheck = async (e) => {
  const requestId = startRequest();
  const signal = getSignal();
  // ... manual fetch
};
```

### Target Pattern (Rule 9)
```jsx
// Project options - fetch once
const { data: projectOptions = [] } = useAppQuery(
  async (signal) => {
    const response = await getProjectNames({ signal });
    return getProjectNamesField(response.data, ProjectNamesField.PROJECTS) || [];
  },
  ['projectNames'],
  { chartName: 'DealChecker-projects', staleTime: Infinity }
);

// Deal check - manual trigger (not auto-fetch)
const [dealParams, setDealParams] = useState(null);
const { data: result, status, error, refetch } = useAppQuery(
  async (signal) => {
    if (!dealParams) return null;
    const response = await getDealCheckerMultiScope(dealParams, { signal });
    return response.data;
  },
  ['dealCheck', dealParams],
  { chartName: 'DealChecker-result', enabled: !!dealParams }
);

// Form submit just sets params, query auto-runs
const handleCheck = (e) => {
  e.preventDefault();
  setDealParams({ project_name: projectName, bedroom, price: priceNum });
};
```

### Changes Required
- DELETE inline useStaleRequestGuard (TanStack handles abort)
- Remove useState for projectOptions, result, loading, error
- Two separate useAppQuery calls (projects + deal check)
- Form submit sets params, triggering query via `enabled`

---

## Migration 4: ExitRisk.jsx (VERY HIGH)

### Current Pattern (Anti-Pattern)
```jsx
// 10+ useState calls
const [projectOptions, setProjectOptions] = useState([]);
const [projectOptionsLoading, setProjectOptionsLoading] = useState(true);
const [exitQueueData, setExitQueueData] = useState(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
const [priceBandsData, setPriceBandsData] = useState(null);
const [priceBandsLoading, setPriceBandsLoading] = useState(false);
const [priceBandsError, setPriceBandsError] = useState(null);
const [priceGrowthData, setPriceGrowthData] = useState(null);
const [priceGrowthLoading, setPriceGrowthLoading] = useState(false);
const [priceGrowthError, setPriceGrowthError] = useState(null);

// Multiple useEffect chains
useEffect(() => { fetchProjects(); }, []);
useEffect(() => { fetchProjectData(); }, [selectedProject]);
useEffect(() => { fetchPriceBands(); }, [selectedProject, unitPsf]);
```

### Target Pattern (Rule 9)
```jsx
// 1. Project options (fetch once)
const { data: projectOptions = [], status: projectsStatus } = useAppQuery(
  async (signal) => { /* ... */ },
  ['exitRisk-projects'],
  { chartName: 'ExitRisk-projects', staleTime: Infinity }
);

// 2. Exit queue + price growth (when project selected)
const { data: exitData, status: exitStatus } = useAppQuery(
  async (signal) => {
    const [exitRes, growthRes] = await Promise.all([
      getProjectExitQueue(selectedProject.name, { signal }),
      getProjectPriceGrowth({ project_exact: selectedProject.name }, { signal })
    ]);
    return { exitQueue: exitRes.data, priceGrowth: growthRes.data };
  },
  ['exitRisk-data', selectedProject?.name],
  { chartName: 'ExitRisk-data', enabled: !!selectedProject?.name }
);

// 3. Price bands (when project + unitPsf set)
const { data: priceBands, status: bandsStatus } = useAppQuery(
  async (signal) => { /* ... */ },
  ['exitRisk-bands', selectedProject?.name, unitPsf],
  { chartName: 'ExitRisk-bands', enabled: !!selectedProject?.name && unitPsf != null }
);
```

### Changes Required
- Remove ALL useState for data/loading/error (10+ removals)
- Remove ALL useEffect for data fetching (3+ removals)
- 3 separate useAppQuery calls with proper `enabled` conditions
- Keep useState only for UI state (selectedProject, unitPsf, dropdown)
- Derive loading/error from status

---

## Verification Checklist (CLAUDE.md)

After each migration:
- [ ] `npm run lint` - 0 errors
- [ ] `npm run typecheck` - passes
- [ ] No `useEffect` + `fetch` pattern remaining
- [ ] No custom abort/stale request handling
- [ ] Uses `useAppQuery` with proper query key
- [ ] Handles all UI states (Rule 10)

---

## Execution Order

1. **DataContext.jsx** - Lowest risk, isolated
2. **ProjectDetailPanel.jsx** - Medium complexity, good test case
3. **DealCheckerContent.jsx** - Complex but standalone
4. **ExitRisk.jsx** - Most complex, do last

Commit after each file migration.
