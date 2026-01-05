# Repository Map

> Navigation guide for Claude Code, agents, and developers.
> **Rules live in CLAUDE.md** | **Navigation lives here**

---

## 1. Quick Navigation

| "I need to..." | Look at... |
|----------------|------------|
| Fix a chart bug | `frontend/src/components/powerbi/{ChartName}.jsx` |
| Add API endpoint | **DON'T.** Extend `/api/aggregate` with new `group_by` value |
| Change filter behavior | `frontend/src/stores/filterStore.js` |
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
| **Hooks** | Data fetching via TanStack Query | `hooks/useAppQuery.js` | `useAppQuery.js` |
| **Adapters** | Transform API → chart format | `adapters/aggregate/*.js` | `timeSeries.js` |
| **Stores** | Zustand state (filters, etc.) | `stores/filterStore.js` | - |
| **Context** | Auth, subscription (NOT filters) | `AuthContext.jsx`, `SubscriptionContext.jsx` | - |
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
Zustand store (filterStore.js) updates state
    │
    ▼
useZustandFilters() → deriveActiveFilters()
    │
    ▼
buildApiParams() creates query params
    │
    ▼
useAppQuery() triggers fetch (TanStack Query)
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
| `stores/filterStore.js` | All filter state (Zustand) | HIGH - affects all pages |
| `hooks/useAppQuery.js` | TanStack Query wrapper | HIGH - all data fetching |
| `lib/queryClient.js` | TanStack Query configuration | MEDIUM |
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

The following were deleted after TanStack Query migration:
- ~~`useQuery.js`~~ → Replaced by `useAppQuery.js`
- ~~`useAbortableQuery.js`~~ → Replaced by `useAppQuery.js`
- ~~`useStaleRequestGuard.js`~~ → Replaced by `useAppQuery.js`
- ~~`useGatedAbortableQuery.js`~~ → Replaced by `useAppQuery.js`

**Current standard:** Use `useAppQuery()` for ALL data fetching.

### Phase 3 Complete - Zustand Migration (January 2026)

**Migration completed.** PowerBIFilterProvider has been removed.

| Component | Status |
|-----------|--------|
| `PowerBIFilterProvider.jsx` | **DELETED** (~600 lines) |
| `FilterStoreDevTools.jsx` | **DELETED** |
| `stores/filterStore.js` | **CURRENT** - Zustand store |

**Current standard:**
- Use `useZustandFilters()` for filter state (not `usePowerBIFilters`)
- Import from `../stores` not `../context/PowerBIFilter`

**What remains in `context/PowerBIFilter/`:**
- `constants.js` - Filter initial values, time levels
- `hooks.js` - `useFilterOptions`, `useDebouncedFilterKey`
- `storage.js` - Page-namespaced persistence utilities
- `utils.js` - Pure functions (`deriveActiveFilters`, etc.)

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
import { useZustandFilters } from '../stores';
import { useAppQuery } from '../hooks';
import { getAggregate } from '../api/analytics';
import { transformTimeSeries } from '../adapters';

function MyChartBase({ height = 300, saleType = null }) {
  const { buildApiParams, debouncedFilterKey } = useZustandFilters();

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
    { chartName: 'MyChart', keepPreviousData: true }
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
| Writing custom hook >50 lines | Check if library exists (TanStack Query, Zustand) |
| Building new state management | Use existing Zustand store (`filterStore.js`) |
| Writing 3 similar lines of code | That's fine. Don't abstract yet. |

### The Golden Rule

> **When in doubt: find similar code, copy the pattern exactly, change only what's necessary.**

---

## 8. Directory Tree (Annotated)

```
sg-property-analyzer/
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
│   ├── models/            # SQLAlchemy ORM
│   └── tests/
│       ├── contracts/     # Contract validation tests
│       └── snapshots/     # Regression snapshots
│
├── frontend/
│   └── src/
│       ├── pages/         # Business logic lives here
│       ├── components/
│       │   └── powerbi/   # Chart components
│       ├── stores/        # Zustand state (NEW)
│       │   └── filterStore.js   # Filter state
│       ├── hooks/
│       │   └── useAppQuery.js   # TanStack Query wrapper
│       ├── lib/
│       │   └── queryClient.js   # TanStack Query config
│       ├── adapters/
│       │   └── aggregate/       # Response transforms
│       ├── context/
│       │   ├── AuthContext.jsx        # Auth
│       │   ├── SubscriptionContext.jsx # Subscription
│       │   └── PowerBIFilter/   # Utilities only (Provider removed)
│       ├── constants/     # Frontend constants
│       └── schemas/
│           └── apiContract/     # Enums
│
├── .github/
│   └── workflows/
│       ├── claude.yml     # Claude Code PR review (3-stage)
│       └── regression.yml # CI/CD pipeline
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

**The irony:** TanStack Query does ALL of this in 5 lines:
```js
const { data } = useQuery({
  queryKey: ['aggregate', filters],  // Auto cache key from object
  queryFn: ({ signal }) => fetch(url, { signal }),  // Auto abort
  staleTime: 30000,  // Auto stale detection
  enabled: isVisible  // Auto visibility gating
});
```

**Impact:** Stale data shown to users, race conditions, 400+ lines to maintain.

**Fix:** Migrated to TanStack Query via `useAppQuery.js`. Then migrated filter state to Zustand via `filterStore.js`.

**Current state (January 2026):**
- TanStack Query: All data fetching via `useAppQuery()`
- Zustand: All filter state via `useZustandFilters()`
- ~1600 lines of legacy code deleted

**Lesson:**
- TanStack Query solves: data fetching, caching, abort, stale detection, retries
- Zustand solves: global state (replaced 600+ line Context file)
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

### Undeclared Response Fields Incident (Jan 3, 2026)

**What happened:** `/api/auth/subscription` was returning `_debug_user_id` and `_debug_email` fields not declared in the schema. The `@api_contract` decorator logged warnings but tests didn't fail.

**Result:** Frontend received unexpected fields. In STRICT mode, this would break validation. Production ran WARN mode which just logged.

**Why wasn't it detected?**
- Tests ran in WARN mode (default), not STRICT mode
- Contract tests verified schema DEFINES fields, not that responses MATCH schemas
- No test hit actual endpoints with STRICT validation

**Fix:** Added `test_all_endpoints_strict.py` that runs ALL contracted endpoints with `CONTRACT_MODE=strict`. Undeclared fields cause test failures.

**Immediate findings:** The test caught 5 violations:
- `auth/subscription`: `_debug_user_id`, `_debug_email` undeclared
- `aggregate`: `group_by`, `metrics`, `subscription` undeclared in meta
- `kpi-summary-v2`: snake_case vs camelCase mismatch
- `upcoming-launches/all`: `filters_applied`, `last_checked` undeclared
- `projects/hot`: NameError bug (`district_param` undefined)

**Lesson:** STRICT mode validation must run in CI, not just WARN mode.

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

### "Just Replace It With Pydantic" Incident

**What happened:** Claude saw 374 lines of `to_int()`, `to_date()`, `to_list()` in `normalize.py` and recommended replacing it with Pydantic.

**The mistake:** Claude didn't read the full validation stack:
- `contract_schema.py` (1,660 lines) - DB↔API enum mappings
- `@api_contract` decorator (290 lines) - WARN/STRICT modes
- Registry pattern - schema versioning

**Why Claude got it wrong:**
1. Pattern-matched "custom validation" → "should use library"
2. Applied library-first rule **blindly** without checking if existing solution was good
3. Didn't understand the full system before recommending changes
4. Assumed "custom = bad" when actually "custom = battle-tested production system"

**The lesson:**
> "Just because you CAN replace code with a library doesn't mean you SHOULD."

**Before recommending a rewrite, Claude must:**
1. Read the FULL system, not just one file
2. Understand WHY it was built this way
3. Ask about actual pain points (don't assume)
4. Check if it's already battle-tested in production

### TanStack initialData Success State Incident (Jan 4, 2026)

**What happened:** BeadsChart and NewLaunchTimelineChart showed "No data for selected filters" flash on page load, then eventually loaded.

**Root cause:** When `useAppQuery` receives `initialData: {}`, TanStack Query immediately returns `isSuccess: true` with empty data. The `deriveQueryStatus()` function didn't check if a fetch had ever completed (`dataUpdatedAt === 0`), so it returned `SUCCESS` status for queries that had only initialData.

**Result:** ChartFrame received `status='success'` + `empty=true` → showed "No data" instead of skeleton.

**Why wasn't it detected?**
- Tests didn't cover the edge case where `isSuccess=true` but `dataUpdatedAt=0`
- The flash was brief (hundreds of milliseconds), easy to miss during manual testing
- Other charts using `initialData: null` worked correctly

**Fix:**
1. Changed `initialData: {}` to `initialData: null` in `MacroOverview.jsx`
2. Added edge case in `deriveQueryStatus()`:
   ```js
   if (isSuccess && !hasData && queryResult.dataUpdatedAt === 0) {
     return QueryStatus.LOADING;
   }
   ```

**Lesson:** When using TanStack Query with `initialData`, always use `null` instead of empty objects/arrays. Empty objects make TanStack think the query "succeeded" before any fetch happens.

### Filter Architecture Over-Engineering Incident (Jan 4, 2026)

**What happened:** The filter-to-API flow grew to 7 layers when 3 would suffice:

```
User clicks filter
    ↓ (1) Zustand store
    ↓ (2) getActiveFilters()
    ↓ (3) getFilterKey() + JSON.stringify
    ↓ (4) debouncedFilterKey (300ms delay)
    ↓ (5) useAppQuery deps trigger
    ↓ (6) buildApiParams() abstraction
    ↓ (7) adapter (timeframe → period rename)
    ↓ Backend
```

**Why Claude built it this way:**
1. **Premature abstraction**: "We might need custom cache keys" → `generateFilterKey()` (TanStack Query already does this)
2. **Wrong debounce scope**: Applied debounce to ALL filters, but dropdowns don't need debounce
3. **Adapter for naming mismatch**: Frontend says `timeframe`, backend says `period` → adapter to rename
4. **Library distrust**: Built `buildApiParams()` instead of trusting inline params
5. **Each layer "fixed" a perceived problem**: Each added "just in case" without proving necessity

**What it should be:**
```
User clicks filter
    ↓ Zustand store
    ↓ useQuery with inline params
    ↓ Backend
```

**Specific over-engineering:**

| Abstraction | Why It Was Built | Why It's Unnecessary |
|-------------|------------------|---------------------|
| `generateFilterKey()` | "Custom cache keys" | TanStack Query hashes `queryKey` array automatically |
| `debouncedFilterKey` | "Prevent API spam" | Dropdowns are single-click, not continuous input |
| `buildApiParams()` | "Centralize param building" | Could be 3 lines inline |
| `deriveActiveFilters()` | "Breadcrumb overrides" | Rarely used, adds complexity |
| Adapter layer | "Rename timeframe→period" | Backend should accept same param names |

**Result:**
- 7 layers to pass a filter value
- useDeferredFetch bug from optimization complexity
- Explaining the flow requires a diagram (red flag)
- Debugging requires tracing through 5 files

**The simpler version:**
```jsx
const { timeframe, bedroom } = useFilters();

const { data } = useQuery({
  queryKey: ['district-liquidity', timeframe, bedroom, saleType],
  queryFn: ({ signal }) =>
    api.get('/insights/district-liquidity', {
      params: { period: timeframe, bed: bedroom, saleType },
      signal
    })
});
```

**Lesson: The "Why Did Claude Do This?" Analysis**

Claude tends to over-engineer when:
1. **Pattern matching without context**: Sees "filter state" → applies enterprise patterns
2. **Defensive coding**: "What if we need X later?" → Builds for hypotheticals
3. **Library distrust**: "Let me wrap this library in case we need to swap it"
4. **Abstraction addiction**: "This 3-line pattern appears twice → extract helper"

**Prevention: Questions Claude Must Ask Before Adding Abstraction**

1. **"Is there a bug RIGHT NOW?"** (not hypothetical)
   - If no → don't add the layer

2. **"Does the library already handle this?"**
   - TanStack Query: caching, keys, abort, stale, retries
   - Zustand: state, persistence, subscriptions

3. **"Can I delete this layer and still work?"**
   - If yes → delete it

4. **"Would a new developer understand this in 5 minutes?"**
   - If no → too complex

5. **"Am I adding a layer to rename 3 fields?"**
   - If yes → fix the naming mismatch at source instead

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

### CLAUDE.md Not Activated Incident (Jan 5, 2026)

**What happened:** When investigating `useDeferredFetch`, Claude recommended Option B (create custom `useInView` hook, ~20 lines) as the default solution instead of Option A (`react-intersection-observer` library).

**Impact:** Violated CLAUDE.md rules 5 (Library-First) and 11 (Fix Root Cause - LIBRARY FIRST). Would have created unnecessary custom code when a battle-tested library exists.

**Why it was wrong:** Claude treated CLAUDE.md as "background info read once" rather than a **mandatory pre-flight checklist** to verify against before every recommendation. The pattern:
1. See problem (useDeferredFetch complexity)
2. Jump to analyzing solutions based on default training
3. Default training says "20 lines of custom code is simple/fine"
4. Present options without checking: "Wait, what does CLAUDE.md say about this?"

**Fix:** Before recommending ANY code approach, Claude must:
1. Re-read relevant CLAUDE.md rules (especially 5 and 11 for new code)
2. Explicitly state: "Library alternative: [X]. Using it because [reason]" OR "Custom code necessary because [specific reason library can't do this]"
3. Default to library solutions; custom code requires justification

**Lesson:** CLAUDE.md is a **mandatory pre-flight checklist**, not optional background reading. Every recommendation must be verified against it BEFORE presenting options.

---

## Quick Reference Links

- **Rules & Invariants**: [CLAUDE.md](./CLAUDE.md)
