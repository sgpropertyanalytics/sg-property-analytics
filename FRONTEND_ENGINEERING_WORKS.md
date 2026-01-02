# Front-end Engineering Works

## Architecture: Single Authority Pattern

| Domain | Authority | Responsibility |
|--------|-----------|----------------|
| **Fetch** | `useGatedAbortableQuery` | Status machine for async state |
| **UI** | `ChartFrame` with `status=…` | Single rendering contract |

---

## PR3: Status-only ChartFrame Migration

**Goal:** Eliminate legacy booleans (`loading`, `isFetching`, `isBootPending`) from chart components. Make `status` the only truth that drives loading/empty/error UI.

---

### Scope (Allowed Changes)

- [ ] Change hook destructuring to take `status`
- [ ] Pass `status` into `ChartFrame`
- [ ] Remove passing `loading`/`isFetching`/`isBootPending` into `ChartFrame`
- [ ] Keep `error` + `refetch` wiring intact

### Non-Scope (Forbidden)

- No chart logic changes (transforms, metrics, filters)
- No UI copy changes
- No new features
- No new hooks
- No refactors unrelated to status plumbing

---

## The Standard Pattern

Every chart should look like this:

```jsx
const { data, status, error, refetch } = useGatedAbortableQuery(queryFn, deps, options);

return (
  <ChartFrame
    status={status}
    error={error}
    onRetry={refetch}
    /* other chart props */
  >
    {/* chart content */}
  </ChartFrame>
);
```

---

## Critical Rule

> **Never pass both `status` AND legacy booleans to `ChartFrame`.**
>
> That's the "multiple truths" bug factory.

---

## Why This Solves the "Multiple Versions" Problem

1. **Components stop inventing their own loading rules**
2. **"Pending gap" / "No data flash" becomes impossible** to reintroduce per-chart
3. **When agents touch charts, there's one contract to follow**

---

## Acceptance Criteria (Manual Testing)

| Scenario | Expected Behavior |
|----------|-------------------|
| First load | No "No data" flash before data arrives |
| Filter change | Shows proper loading overlay (not empty state) |
| 401 error | Refresh → refetch → chart recovers without user refresh |
| Abort/cancel | No error toast/flash |

---

## Execution Strategy

### File-by-File Mechanical Changes

Each file follows this pattern:

```diff
- const { data, loading, isFetching, error, refetch } = useGatedAbortableQuery(…);
+ const { data, status, error, refetch } = useGatedAbortableQuery(…);

- <ChartFrame loading={loading} isFetching={isFetching} error={error}>
+ <ChartFrame status={status} error={error} onRetry={refetch}>
```

### Commit Strategy

- Commit in small batches (by folder/feature)
- Easy to revert if issues arise

### Prevention (Post-PR3)

Add lint rule that fails if any chart passes `loading=` or `isFetching=` into `ChartFrame`. Prevents backsliding.

---

## Files to Migrate

_TODO: List all chart components using legacy boolean pattern_

- [ ] `frontend/src/components/powerbi/*.jsx`
- [ ] `frontend/src/components/insights/*.jsx`
- [ ] Other chart components...
