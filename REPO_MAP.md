# Repository Map

> Navigation guide for Claude Code, agents, and developers.
> **Rules live in CLAUDE.md** | **Navigation lives here**

---

## 1. Quick Navigation

| "I need to..." | Look at... |
|----------------|------------|
| Fix a chart bug | `frontend/src/components/powerbi/{ChartName}.jsx` |
| Add API endpoint | **DON'T.** Extend `/api/aggregate` with new `group_by` value |
| Change filter behavior | `frontend/src/context/PowerBIFilter/` |
| Fix data calculation | `backend/services/dashboard_service.py` |
| Add backend constant | `backend/constants.py` |
| Add frontend constant | `frontend/src/constants/index.js` |
| Add new enum value | `backend/api/contracts/contract_schema.py` + `frontend/src/schemas/apiContract/enums.js` |
| Validate API params | `backend/api/contracts/` (use `@api_contract` decorator) |
| Transform API response | `frontend/src/adapters/aggregate/` |
| Debug 500 error | Check server logs for `TypeError` in `strptime`/`int`/`float` |
| Understand a page | `frontend/src/pages/{PageName}.jsx` |

---

## 2. Architecture Layers

### Frontend Layers

| Layer | Purpose | Key Files | Copy This |
|-------|---------|-----------|-----------|
| **Pages** | Business logic, data scope, sale type decisions | `MacroOverview.jsx`, `PrimaryMarket.jsx`, `DistrictDeepDive.jsx` | `MacroOverview.jsx` |
| **Components** | Render props ONLY. No logic, no defaults, no state | `components/powerbi/*.jsx` | `TimeTrendChart.jsx` |
| **Hooks** | Data fetching via React Query | `hooks/useAppQuery.js` | `useAppQuery.js` |
| **Adapters** | Transform API → chart format | `adapters/aggregate/*.js` | `timeSeries.js` |
| **Context** | Global state (filters, auth, subscription) | `context/PowerBIFilter/`, `AuthContext.jsx` | - |
| **Constants** | Display strings, colors, enums | `constants/index.js`, `schemas/apiContract/enums.js` | - |

### Backend Layers

| Layer | Purpose | Key Files | Copy This |
|-------|---------|-----------|-----------|
| **Routes** | Parse params, validate, call service | `routes/analytics/aggregate.py` | `aggregate.py` |
| **Services** | SQL queries, business logic, caching | `services/dashboard_service.py` | `dashboard_service.py` |
| **Contracts** | Schema validation, `@api_contract` decorator | `api/contracts/contract_schema.py` | - |
| **Models** | SQLAlchemy ORM definitions | `models/transaction.py` | - |
| **Constants** | Districts, regions, mappings (SSOT) | `constants.py` | - |

### Layer Rules

```
Pages decide → Components render → Hooks fetch → Adapters transform
Routes parse → Services compute → DB executes
```

**Common Mistakes:**
- Component hardcodes `sale_type='resale'` → **WRONG.** Page passes `saleType` prop
- Route contains SQL → **WRONG.** Move to service
- Adapter has business logic → **WRONG.** Adapters only transform shape

---

## 3. Data Flow Chain

```
User adjusts filter (sidebar)
    │
    ▼
PowerBIFilterProvider updates state
    │
    ▼
usePowerBIFilters() → deriveActiveFilters()
    │
    ▼
buildApiParams() creates query params
    │
    ▼
useAppQuery() triggers fetch (React Query)
    │
    ▼
apiClient.get('/api/aggregate', { params })
    │
    ▼
@api_contract decorator validates params
    │
    ▼
dashboard_service.py executes SQL
    │
    ▼
Response: { data: [...], meta: { elapsedMs, cacheHit } }
    │
    ▼
Adapter transforms to chart format
    │
    ▼
Chart renders with new data
```

### Filter Flow Details

```
Sidebar slicer → ALL charts
Cross-filter   → ALL charts
Fact filter    → Transaction table ONLY
```

---

## 4. Critical Files

### Backend (10 files that matter)

| File | Purpose | Risk |
|------|---------|------|
| `services/dashboard_service.py` | Main SQL aggregation, CTEs, caching | HIGH - affects all charts |
| `api/contracts/contract_schema.py` | Enums, field mappings, API shapes | HIGH - breaking changes |
| `constants.py` | Districts→Regions, bedroom thresholds | HIGH - SSOT |
| `routes/analytics/aggregate.py` | Main endpoint, param validation | MEDIUM |
| `routes/analytics/kpi_v2.py` | KPI cards endpoint | MEDIUM |
| `services/classifier.py` | Bedroom classification logic | MEDIUM |
| `routes/insights.py` | **v1 endpoints - NO CONTRACT VALIDATION** | HIGH RISK |
| `api/contracts/wrapper.py` | `@api_contract` decorator | LOW |
| `utils/normalize.py` | `to_int`, `to_date`, `to_list` helpers | LOW |
| `models/transaction.py` | Transaction ORM model | LOW |

### Frontend (10 files that matter)

| File | Purpose | Risk |
|------|---------|------|
| `context/PowerBIFilter/PowerBIFilterProvider.jsx` | All filter state | HIGH - affects all pages |
| `hooks/useAppQuery.js` | React Query wrapper | HIGH - all data fetching |
| `components/powerbi/TimeTrendChart.jsx` | **Reference chart pattern** | REFERENCE |
| `adapters/aggregate/timeSeries.js` | **Reference adapter pattern** | REFERENCE |
| `adapters/aggregate/index.js` | Adapter exports | MEDIUM |
| `constants/index.js` | Regions, colors, bedroom order | MEDIUM |
| `schemas/apiContract/enums.js` | SaleType, Tenure enums | MEDIUM |
| `api/client.js` | Axios instance, retry logic | MEDIUM |
| `pages/MacroOverview.jsx` | **Reference page pattern** | REFERENCE |
| `App.jsx` | Router, layout, providers | LOW |

---

## 5. Tech Debt Zones

### Phase 2 Complete - Legacy Hooks Removed

The following were deleted after React Query migration:
- ~~`useQuery.js`~~ → Replaced by `useAppQuery.js`
- ~~`useAbortableQuery.js`~~ → Replaced by `useAppQuery.js`
- ~~`useStaleRequestGuard.js`~~ → Replaced by `useAppQuery.js`
- ~~`useGatedAbortableQuery.js`~~ → Replaced by `useAppQuery.js`

**Current standard:** Use `useAppQuery()` for ALL data fetching.

### Phase 3 Pending - Zustand Migration

**Still tech debt (scheduled for replacement):**
```
frontend/src/context/PowerBIFilter/PowerBIFilterProvider.jsx  (300+ lines)
```
→ Will be replaced by Zustand store. **Do NOT extend this file with new features.**

### V1 Endpoints (HIGH RISK - No Contract Validation)

```
/insights/district-psf        → No @api_contract, breaks silently
/insights/district-liquidity  → No @api_contract, breaks silently
```
→ These should migrate to `/api/aggregate`. **Do NOT add features to these.**

### Deprecated Routes

```
backend/routes/analytics/deprecated.py  → Contains removed endpoints
```

---

## 6. Pattern References

| Task | Copy This File Exactly |
|------|------------------------|
| New chart component | `components/powerbi/TimeTrendChart.jsx` |
| New adapter | `adapters/aggregate/timeSeries.js` |
| New service function | `services/dashboard_service.py:get_aggregated_data()` |
| New route handler | `routes/analytics/aggregate.py` |
| New page | `pages/MacroOverview.jsx` |
| Add enum value | `api/contracts/contract_schema.py` + `schemas/apiContract/enums.js` |

### Chart Component Template

```jsx
function MyChartBase({ height = 300, saleType = null }) {
  const { buildApiParams, debouncedFilterKey } = usePowerBIFilters();

  const { data, status, error } = useAppQuery(
    async (signal) => {
      const params = buildApiParams({
        group_by: 'month',
        ...(saleType && { sale_type: saleType })
      });
      const response = await getAggregate(params, { signal });
      return transformTimeSeries(response.data);  // Always use adapter
    },
    [debouncedFilterKey, saleType],
    { chartName: 'MyChart' }
  );

  if (status === 'pending') return <Skeleton />;
  if (status === 'error') return <ErrorState error={error} />;
  if (!data?.length) return <EmptyState />;
  return <Chart data={data} />;
}
```

---

## 7. Anti-Patterns (Simplicity Anchors)

### Bug Fixes

| If you're doing this... | STOP. Do this instead. |
|-------------------------|------------------------|
| Adding a wrapper hook to fix a bug | Fix the bug directly in the source |
| Creating a new context for one component | Pass props or use existing context |
| Adding `if (specificEdgeCase)` hack | Fix the root cause |
| Fix is >20 lines | Question if you're solving the right problem |

### Refactoring

| If you're doing this... | STOP. Do this instead. |
|-------------------------|------------------------|
| Creating a "better" abstraction | Match existing patterns exactly |
| Improving code while fixing a bug | Just fix the bug |
| Adding types/docs to unchanged code | Only touch what you're changing |
| Generalizing for future needs | Solve today's problem only |

### New Features

| If you're doing this... | STOP. Do this instead. |
|-------------------------|------------------------|
| Creating new endpoint | Extend `/api/aggregate` with new `group_by` |
| Writing custom hook >50 lines | Check if library exists (React Query, Zustand) |
| Building new state management | Use existing PowerBIFilterContext (or wait for Zustand) |
| Writing 3 similar lines of code | That's fine. Don't abstract yet. |

### The Golden Rule

> **When in doubt: find similar code, copy the pattern exactly, change only what's necessary.**

---

## 8. Directory Tree (Annotated)

```
sgpropertytrend/
├── CLAUDE.md              # Rules (non-negotiable)
├── REPO_MAP.md            # Navigation (this file)
│
├── backend/
│   ├── app.py             # Flask entry point
│   ├── constants.py       # Districts, regions (SSOT)
│   ├── api/
│   │   └── contracts/     # @api_contract, schemas
│   ├── routes/
│   │   ├── analytics/     # Main endpoints
│   │   │   ├── aggregate.py   # THE endpoint
│   │   │   └── kpi_v2.py      # KPI cards
│   │   └── insights.py    # v1 (HIGH RISK)
│   ├── services/
│   │   ├── dashboard_service.py  # Main SQL
│   │   └── classifier.py         # Bedroom logic
│   └── models/            # SQLAlchemy ORM
│
├── frontend/
│   └── src/
│       ├── pages/         # Business logic lives here
│       ├── components/
│       │   └── powerbi/   # Chart components
│       ├── hooks/
│       │   └── useAppQuery.js    # Data fetching
│       ├── adapters/
│       │   └── aggregate/        # Response transforms
│       ├── context/
│       │   └── PowerBIFilter/    # Filter state (tech debt)
│       ├── constants/     # Frontend constants
│       └── schemas/
│           └── apiContract/      # Enums
│
├── docs/                  # Architecture docs
│   ├── architecture.md
│   ├── backend.md
│   ├── frontend.md
│   └── BACKEND_CHART_DEPENDENCIES.md
│
└── .claude/
    ├── skills/            # Guardrail skills
    └── agents/            # Specialized agents
```

---

## 9. Historical Incidents (Landmines)

These incidents shaped the current architecture. Learn from them.

### CSV Deletion Incident (Dec 30, 2025)

**What happened:** Claude Code had a `cleanup_resale_projects()` function that deleted rows from `new_launch_units.csv` during runtime.

**Impact:** Broke Resale Velocity KPI - data silently disappeared.

**Fix:** Created `backend/utils/fs_guard.py` - runtime guard that makes CSV deletion IMPOSSIBLE.

**Protection now:**
```
backend/data/       → IMMUTABLE (writes blocked)
scripts/data/       → IMMUTABLE (writes blocked)
backend/data/generated/ → OK to write
```

**If you try to delete a CSV, you'll see:**
```
FS_GUARD VIOLATION: BLOCKED DELETE
Path: /backend/data/new_launch_units.csv
Reason: This file is in a protected data directory.
```

### Layer-Upon-Layer Incident (Dec 25, 2025)

**What happened:** Instead of using React Query and Zustand, custom hooks kept getting added to "fix" issues:

```
useQuery.js           → "We need query state management"
useAbortableQuery.js  → "We need abort handling" (layer 2)
useStaleRequestGuard.js → "We need stale detection" (layer 3)
useGatedAbortableQuery.js → "We need visibility gating" (layer 4)
generateFilterKey()   → "We need cache keys" (layer 5)
```

**Result:** 400+ lines of custom infrastructure. Then `datePreset` was forgotten in `generateFilterKey()` → stale data bug.

**The irony:** React Query does ALL of this in 5 lines:
```js
const { data } = useQuery({
  queryKey: ['aggregate', filters],  // Auto cache key from object
  queryFn: ({ signal }) => fetch(url, { signal }),  // Auto abort
  staleTime: 30000,  // Auto stale detection
  enabled: isVisible  // Auto visibility gating
});
```

**Impact:** Stale data shown to users, race conditions, 400+ lines to maintain.

**Fix:** Migrated to React Query via `useAppQuery.js`.

**Lesson:**
- React Query solves: data fetching, caching, abort, stale detection, retries
- Zustand solves: global state (replacing large Context files)
- **If you're writing >50 lines of infrastructure, STOP and find a library**

### Silent Param Drop Incident (Jan 2, 2026)

**What happened:** Frontend added `timeframe` param to `buildApiParamsFromState()`. Backend schema didn't have `timeframe` field. `normalize_params()` silently dropped unknown params.

**Result:** Time filter selections were completely ignored. Charts always showed default Y1 data.

**Why wasn't it detected?**
- Frontend tests verified `buildApiParamsFromState()` outputs correctly (isolation)
- Backend tests only checked some fields existed (additive-only)
- **No cross-layer test** verified frontend→backend param acceptance

**Fix:** Added `test_frontend_backend_alignment.py` that lists ALL params frontend sends and verifies backend schemas accept each one.

**Lesson:** Test the integration boundary, not just each layer in isolation.

### Subscription Caching Incident (Dec 30, 2025)

**What happened:** When `/auth/subscription` API failed (network error, server timeout), code set subscription to 'free' AND cached it to localStorage.

**Result:** Premium users permanently downgraded to free tier from temporary API failures.

**Why wasn't it detected?** Happy path tests passed. No tests for API failure scenarios.

**Fix:** On API failure, keep existing cached subscription. Only update cache on SUCCESSFUL response.

**Lesson:** Test failure modes, not just success paths.

### Endpoint Drift Incident (Dec 31, 2025)

**What happened:** `/districts` endpoint was removed from backend. Frontend still called it. Silent 404s.

**Why wasn't it detected?** No test verified frontend-expected endpoints exist in backend.

**Fix:** Added `scripts/check_route_contract.py` + CI job that fails if frontend expects endpoints backend lacks.

**Lesson:** Contract tests must be bidirectional (frontend↔backend).

### Boot Deadlock Incident (Jan 1, 2026)

**What happened:** Abort handling in custom hooks didn't reset `inFlight` state. Queries stuck in 'refreshing' forever. "Updating..." spinner never went away.

**Why wasn't it detected?** Only tested complete request flows, not abort edge cases.

**Fix:** Reset state on abort with multiple guards (mountedRef, activeRequestIdRef, isStale check).

**Lesson:** Async code needs abort/cancel/timeout tests, not just success tests.

### Summary: The Over-Engineering Trap

Most incidents above share a pattern: **solving problems that don't exist yet.**

| Over-Engineering | What Actually Happened |
|------------------|------------------------|
| "Let's build custom query infrastructure" | 400+ lines, cache key bug, React Query does it in 5 |
| "Let's clean up old data automatically" | Deleted production data, broke KPIs |
| "Let's add another layer to handle edge cases" | Created new edge cases, boot deadlock |

**The Rule:**
> Don't optimize, abstract, or "improve" unless there's a **clear, immediate problem** with **measurable benefit**.

**Before adding complexity, ask:**
1. Is there a bug RIGHT NOW? (not hypothetical)
2. Does a library already solve this?
3. Can I fix this in <20 lines without new abstractions?
4. Will this make the next developer's life easier or harder?

**If unsure → don't do it. Ship the simple version.**

---

## Quick Reference Links

- **Rules & Invariants**: [CLAUDE.md](./CLAUDE.md)
- **Backend Chart Dependencies**: [docs/BACKEND_CHART_DEPENDENCIES.md](./docs/BACKEND_CHART_DEPENDENCIES.md)
- **Library-First Reference**: [docs/LIBRARY_FIRST_REFERENCE.md](./docs/LIBRARY_FIRST_REFERENCE.md)
- **Architecture Overview**: [docs/architecture.md](./docs/architecture.md)
