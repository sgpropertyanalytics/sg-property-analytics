# Auth Decision Framework

**Purpose:** Immutable guardrails for ALL AI work on auth/subscription state.
**Status:** LOCKED - Do not modify without explicit user approval.

---

## North Star: Determinism + Code Deletion

Primary objective: make auth/tier/subscription **predictable** by **deleting mutation points**, not adding cleverness.

### Success Metrics

| Metric | Direction | Measure |
|--------|-----------|---------|
| Mutation points | ↓ | setter count, "writers" |
| State owners | ↓ | single writer |
| Cross-domain coupling | explicit | small invariants |
| Scenario tests | pass | cold start / multi-tab / retry |

**If a proposal adds complexity without deleting writers, it's wrong directionally—even if it "fixes" a symptom.**

---

## Two-Level Decision Rule: Structural > Local

When there is a choice, prefer the change that:

1. **Reduces the number of writers** (mutation points)
2. **Makes transitions explicit** (state machine)
3. **Ties async results to requestIds** (sequencer)
4. **Prevents late overwrites** (monotonicity)
5. **Is smallest possible step** (migration slice)

This is the "3 invariants + 1 sequencer" framework.

---

## The Four Invariants

All AI suggestions **MUST** preserve these invariants:

### 1. Single-Writer
Auth/tier/subscription committed in **one place** (the reducer).

```
WRONG: 5 different functions calling setTier()
RIGHT: 5 different functions dispatching to 1 reducer
```

### 2. Sequencing
Every async completion is **request-scoped**.

```
WRONG: Response arrives, blindly updates state
RIGHT: Response carries requestId, rejected if stale
```

### 3. Monotonicity
Cannot downgrade from confirmed premium due to stale errors/timeouts.

```
WRONG: Timeout fires → tier = 'free' (even if server confirmed premium)
RIGHT: Timeout blocked by monotonicity guard if tier === 'premium'
```

### 4. Convergence
Boot must converge to a stable tier within N seconds (no oscillation).

```
WRONG: tier flips free→premium→free→premium...
RIGHT: tier settles to final value, stays there
```

**If a proposed fix violates ANY of these, it is wrong.**

---

## AI Evaluation Criteria

When proposing changes, optimize for:

1. **Deleting mutation points**
2. **Enforcing single-writer + request sequencing + monotonicity**

### Reject Any Fix That:
- Adds flags/guards/timeouts **without reducing the number of writers**
- Introduces new useState for auth-related state
- Creates parallel mutation paths
- Adds "defensive" checks that mask root cause

### Require Every Fix To:
- Map to an **observed failure mode**
- Add/extend a **deterministic scenario test**
- State which invariant it enforces
- Show mutation point count before/after

---

## Anti-Patterns (Auto-Reject)

| Pattern | Why It's Wrong |
|---------|----------------|
| `if (edge_case) { setState(...) }` | Adds writer without deleting one |
| New `useRef` to "track" state | Shadow state, not single-writer |
| `setTimeout` fallback without requestId | Stale closure can overwrite |
| "Just add a guard here" | Local patch, not structural fix |
| Retry logic outside reducer | Scattered mutation |

---

## Valid Patterns (Approved)

| Pattern | Why It's Right |
|---------|----------------|
| `dispatch({ type: 'X', requestId })` | Single writer, sequenced |
| Staleness check in reducer | Centralized guard |
| Monotonicity check in reducer | Centralized invariant |
| Delete useState, derive from reducer | Fewer writers |
| Scenario test for race condition | Prevents regression |

---

## Checklist for Every Change

Before proposing ANY auth/subscription change:

- [ ] Does this DELETE a mutation point? If no, why not?
- [ ] Does this enforce single-writer? Or add a parallel path?
- [ ] Is async completion request-scoped with requestId?
- [ ] Can this cause premium→free downgrade on stale data?
- [ ] Will boot converge to stable state? No oscillation?
- [ ] Is there a scenario test for this failure mode?
- [ ] What's the setter count before/after?

---

## Reference Files

| File | Purpose |
|------|---------|
| `frontend/src/context/authCoordinator.js` | The single writer (reducer) |
| `frontend/src/context/AuthContext.jsx` | Dispatcher, not writer |
| `frontend/src/context/__tests__/authRaceConditions.test.js` | Scenario tests |
| `docs/AUTH_STABILITY_AUDIT.md` | Historical context |
| `docs/plans/2026-01-14-auth-single-writer-framework.md` | Implementation plan |

---

## Version History

| Date | Change | Setter Count |
|------|--------|--------------|
| 2026-01-14 | Phase 0: Lint rules added | 126 |
| 2026-01-14 | Phase 1: user + initialized migrated | 115 |
| 2026-01-14 | Phase 2: tokenStatus migrated | 81 |
| 2026-01-14 | Phase 3: subscription migrated | 16 |

---

*This framework is the contract between AI and codebase. Violations are bugs.*
