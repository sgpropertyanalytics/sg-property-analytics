# Simplicity Check Skill

Anti-over-engineering guardrail. Invoke BEFORE adding new abstractions, hooks, helpers, or layers.

## Trigger

Invoke this skill when:
- Creating a new file in `/hooks`
- Creating a helper function
- Adding a wrapper around a library
- Adding a new "layer" to data flow
- Seeing duplicate code and wanting to extract

## The 5 Questions

Before proceeding, answer each question:

### 1. Is there a bug RIGHT NOW?

```
[ ] YES - There is a specific bug I'm fixing
[ ] NO - I'm adding this "in case" or "for future"
```

**If NO → STOP. Don't add the abstraction.**

### 2. Does the library already handle this?

Check if these libraries already solve the problem:

| Need | Library Solution |
|------|-----------------|
| Cache keys | TanStack Query `queryKey` array |
| Abort handling | TanStack Query automatic abort |
| Stale detection | TanStack Query `staleTime` |
| Request deduplication | TanStack Query automatic |
| Global state | Zustand store |
| Form validation | react-hook-form + zod |

```
[ ] Checked - Library doesn't handle this
[ ] Library handles it - I will use the library directly
```

### 3. Can I delete this layer and still work?

Try removing the proposed abstraction mentally:

```
WITHOUT the abstraction, would the code:
[ ] Break completely
[ ] Work but be slightly less elegant
[ ] Work exactly the same
```

**If "work exactly the same" or "slightly less elegant" → Don't add it.**

### 4. Would a new developer understand this in 5 minutes?

```
[ ] YES - The code is self-explanatory
[ ] NO - It requires reading multiple files or a diagram
```

**If NO → Too complex. Simplify.**

### 5. Am I adding a layer to rename fields?

```
// Are you doing this?
const adapted = {
  period: params.timeframe,  // just renaming
  bed: params.bedroom,       // just renaming
};

[ ] YES - I'm just renaming fields
[ ] NO - There's actual transformation logic
```

**If YES → Fix the naming at the source (backend or frontend) instead.**

## The Diagram Test

Can you explain the data flow in ONE sentence?

```
GOOD: "Filter state goes to useQuery which calls the API"
BAD: "Filter state goes to deriveActiveFilters which goes to generateFilterKey which goes to debounce which goes to useAppQuery which calls buildApiParams which..."
```

## Red Flags Checklist

Before adding code, verify NONE of these apply:

- [ ] New file in `/hooks` that's >50 lines
- [ ] `JSON.stringify()` for cache keys (TanStack does this)
- [ ] Custom debounce for dropdown/button clicks
- [ ] Wrapper around a library "in case we swap later"
- [ ] Helper function used only once
- [ ] Abstraction for <3 occurrences of pattern

## Decision

After answering all questions:

```
[ ] PROCEED - All checks passed, abstraction is justified
[ ] STOP - One or more checks failed, use simpler approach
```

## Examples

### BAD: Adding generateFilterKey()

```javascript
// Someone added this:
export function generateFilterKey(filters) {
  return JSON.stringify({
    timeFilter: filters.timeFilter,
    districts: filters.districts,
    // ...
  });
}

// Why it's bad:
// TanStack Query already does this with queryKey: ['key', filters]
```

### BAD: Wrapping useQuery

```javascript
// Someone added this:
export function useAppQuery(fn, deps, options) {
  // 100 lines of "improvements"
}

// Why it's bad:
// TanStack Query is battle-tested, wrapping it adds bugs
```

### GOOD: Direct library usage

```javascript
// Just use the library directly:
const { data } = useQuery({
  queryKey: ['district-liquidity', timeframe, bedroom],
  queryFn: ({ signal }) => api.get('/endpoint', { params, signal })
});
```

## Reference

See full incident documentation:
- [REPO_MAP.md - Filter Architecture Over-Engineering Incident](../../../REPO_MAP.md#filter-architecture-over-engineering-incident-jan-4-2026)
- [CLAUDE.md - Anti-Over-Engineering Principle](../../../CLAUDE.md#17-anti-over-engineering-principle-mandatory)
