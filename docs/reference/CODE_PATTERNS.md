# Code Patterns

Copy these patterns exactly. All new code must match these structures.

> **Note:** This content was extracted from CLAUDE.md Section 4 to keep the main file lean.

---

## Frontend Chart Pattern

```jsx
const { buildApiParams, debouncedFilterKey, timeGrouping } = useZustandFilters();

const { data, status, error } = useAppQuery(
  async (signal) => {
    const params = buildApiParams({ group_by: 'month' }, { excludeHighlight: true });
    const response = await getAggregate(params, { signal });
    return transformTimeSeries(response.data);
  },
  [debouncedFilterKey, timeGrouping],
  { chartName: 'MyChart', keepPreviousData: true }
);

if (status === 'pending') return <Skeleton />;
if (status === 'error') return <ErrorState error={error} />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

**Key Points:**
- Use `useAppQuery` (TanStack Query wrapper)
- Use `useZustandFilters()` for filter state
- Include ALL data-affecting state in deps array
- Handle all 4 states: pending, error, empty, success

---

## Backend Service Pattern

```python
def get_data(district: str = None, date_from: date = None):
    return db.session.execute(text("""
        SELECT district, COUNT(*) FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND (:district IS NULL OR district = :district)
        GROUP BY district
    """), {"district": district, "date_from": date_from}).fetchall()
```

**Key Points:**
- `:param` bindings only (no f-strings)
- Python `date` objects (not strings)
- Static SQL with NULL guards: `(:param IS NULL OR col = :param)`
- Always exclude outliers: `COALESCE(is_outlier, false) = false`

---

## Route Handler Pattern

```python
@app.route("/data")
def get_data():
    try:
        limit = to_int(request.args.get("limit"), default=100, field="limit")
        date_from = to_date(request.args.get("date_from"), field="date_from")
    except ValidationError as e:
        return validation_error_response(e)
    return service.get_data(limit=limit, date_from=date_from)
```

**Key Points:**
- Parse and validate at route level
- Use `to_int`, `to_date`, `to_list` from `utils/normalize.py`
- Return proper validation error responses
- Route calls service, never contains SQL

---

## API Contract Pattern

```python
@analytics_bp.route("/aggregate", methods=["GET"])
@api_contract("aggregate")  # Validates params + injects meta
def aggregate():
    params = g.normalized_params
    result = dashboard_service.get_aggregated_data(**params)
    return jsonify({"data": result})
```

**Endpoints:**
- `/api/aggregate` — Flexible GROUP BY (prefer this)
- `/api/transactions` — Paginated list
- `/api/filter-options` — Dropdown values

**Rule:** Need data? Extend `/api/aggregate`. Don't create new endpoints.

---

## Frontend Async Pattern

**Current Stack (Migration Complete):**
- **Data fetching:** `useAppQuery()` (TanStack Query wrapper)
- **Filter state:** `useZustandFilters()` (Zustand store)
- Signal passed automatically by TanStack Query
- Response through adapter (never `response.data` directly)

**Query Keys:** Include ALL data-affecting state in deps array.
```js
[debouncedFilterKey, timeGrouping, saleType]  // All state that affects data
```

**Visibility-Gated Fetching:** `containerRef` must be outside QueryState.
```jsx
<div ref={containerRef}>
  <QueryState loading={loading}>...</QueryState>
</div>
```

---

## SQL & Date Patterns

**SQL Rules:**
- `:param` bindings only (no f-strings, no `%(param)s`)
- Python `date` objects (not strings)
- SQL in `services/`, not `routes/`
- Static SQL with NULL guards: `(:param IS NULL OR col = :param)`

**Date Bounds (exclusive upper):**
```sql
WHERE transaction_date >= :min_date AND transaction_date < :max_date_exclusive
```

**URA Data = Month-Level:**
All transactions dated to 1st of month. Use "last 3 months" not "last 90 days".

```python
# KPI date bounds
current_min = date(max_date.year, max_date.month - 2, 1)  # 3 months back
```

---

## Filters & Params Pattern

| Scope | Applies To |
|-------|------------|
| Sidebar slicers | ALL charts |
| Cross-filters | ALL charts |
| Fact filters | Transaction table ONLY |

- `buildApiParams()` for ALL API calls
- Time X-axis → `excludeHighlight: true`
- `useZustandFilters()` for filter state access

---

## UI States Pattern

Every async hook returns `{ data, loading, error }`. Handle ALL THREE:
```jsx
if (loading) return <Skeleton />;
if (error) return <ErrorState />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

---

## Library-First Pattern

### Frontend Libraries (MANDATORY)

| Category | Use This | NOT Custom Code |
|----------|----------|-----------------|
| Data fetching | `@tanstack/react-query` | `useEffect` + `fetch` + `useState` |
| State management | `zustand` | Large Context files (>100 lines) |
| Forms | `react-hook-form` | Manual form state |
| Validation | `zod` | Custom validation functions |
| Date/time | `date-fns` | Custom date utils |
| Charts | `chart.js` (already used) | Custom canvas rendering |
| HTTP client | `axios` (already used) | Raw `fetch` wrappers |

### Backend Libraries (MANDATORY)

| Category | Use This | NOT Custom Code |
|----------|----------|-----------------|
| Validation | `pydantic` or `marshmallow` | Custom validation decorators |
| Date handling | `python-dateutil` | Custom date parsing |
| Background jobs | `celery` or `rq` | Custom queue implementations |
| Caching | `flask-caching` | Custom cache wrappers |
| Rate limiting | `flask-limiter` | Custom rate limit logic |

### Tech Debt Resolved (Migration Complete)

These files have been **deleted** after successful migration:

| Deleted File | Replaced By |
|--------------|-------------|
| ~~`useQuery.js`~~ | `useAppQuery.js` (TanStack Query wrapper) |
| ~~`useAbortableQuery.js`~~ | `useAppQuery.js` |
| ~~`useStaleRequestGuard.js`~~ | `useAppQuery.js` |
| ~~`useGatedAbortableQuery.js`~~ | `useAppQuery.js` |
| ~~`generateFilterKey()`~~ | TanStack Query auto-generates cache keys |
| ~~`PowerBIFilterContext.jsx`~~ | `stores/filterStore.js` (Zustand) |

**Current standard:** Use `useAppQuery()` for data fetching, `useZustandFilters()` for filter state.

### Exceptions (Custom Code Allowed)

Custom code is acceptable ONLY for:
1. **Domain-specific logic** - Business rules unique to SG property (bedroom classification, district mapping)
2. **Thin adapters** - API response transformers (<30 lines each)
3. **UI components** - React components (not state/data infrastructure)
4. **Configuration** - Constants, enums, config files

### Red Flags (Auto-Reject)

| Pattern | Problem |
|---------|---------|
| New file in `/hooks` >50 lines | Probably reinventing a library |
| `useEffect` + `fetch` + `useState` combo | Use React Query |
| Manual `AbortController` | Use React Query |
| Manual `requestIdRef` for stale detection | Use React Query |
| `JSON.stringify` for cache keys | Use React Query |
| Context file >100 lines | Consider Zustand |
| Custom form validation | Use react-hook-form + zod |
