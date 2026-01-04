# Checklists

Run these before committing. If any box fails, stop and fix.

> **Note:** This content was extracted from CLAUDE.md Section 8 to keep the main file lean.

---

## Pre-Commit Checklist

- [ ] Can explain file in one sentence
- [ ] Used existing sources of truth (enums, constants)
- [ ] No duplicated logic
- [ ] Chart handles loading/empty/error/success
- [ ] Deletable without breaking unrelated features
- [ ] No premium data leaked to DOM
- [ ] ESLint disables scoped + justified

---

## New Chart Checklist

- [ ] Answers ONE question
- [ ] Pure chart + container split
- [ ] Uses `useAppQuery` + adapters
- [ ] Query key (deps array) includes ALL data-affecting state
- [ ] Accepts `saleType` as prop (never hardcodes)
- [ ] Lazy import syntax matches export style

---

## Data Correctness Checklist

- [ ] Invariants computed globally before filters (Two-Phase)
- [ ] Joins use stable keys (IDs), not display names
- [ ] Aggregations deterministic (`ORDER BY date, id`)
- [ ] No `MODE()` or unordered `array_agg()`
- [ ] One canonical param + response shape
- [ ] Contracts reflect runtime exactly
- [ ] Static SQL with param guards
- [ ] DB does set work; Python does orchestration
- [ ] No repeated implementations of business rules

---

## Problem-Solving Checklist

1. Fix the class of problem (check parallel code paths)
2. Invariant > conditional patch
3. No hidden side effects
4. Assume messier data in future
5. If unsure → ask

---

## Infrastructure Code Checklist (Library-First)

- [ ] Checked npm/PyPI for existing library solution
- [ ] Custom code is <50 lines (or has documented justification)
- [ ] Not recreating: data fetching, state management, forms, validation
- [ ] User explicitly approved custom infrastructure (if >50 lines)
- [ ] Added to tech debt tracker if temporary

---

## Backend Change Checklist

Before ANY backend change, trace the dependency chain and verify no charts break.

> **Ref:** `docs/BACKEND_CHART_DEPENDENCIES.md` | **Skill:** `/backend-impact-guardrails`

### The 4 Questions (Before Every Backend Change)

1. **API CONTRACT** — Response shape, field names, params unchanged?
2. **FRONTEND RENDERING** — All pages load without React errors?
3. **VISUAL CHARTS** — Charts display with data, no empty states?
4. **CHART LOGIC** — Adapters, transformations, calculations correct?

**If YES to breaking any → STOP. Fix before proceeding.**

### Impact Categories

| Category | Action | Example |
|----------|--------|---------|
| **BREAKING** | STOP. Migration plan required. | Removing data, renaming fields |
| **VALIDATION** | Manual verification required. | Changing aggregation logic |
| **SAFE** | Document and proceed. | Adding new optional fields |

### Critical Endpoints

| Endpoint | Risk | Charts Affected |
|----------|------|-----------------|
| `/api/aggregate` | CRITICAL | 10+ charts |
| `/api/kpi-summary-v2` | HIGH | All KPI cards |

### Manual Page Verification (ALL pages)

`/market-overview`, `/district-overview`, `/new-launch-market`, `/supply-inventory`, `/explore`, `/value-check`, `/exit-risk`

---

## Param Flow Integrity Checklist

Before merging param-related changes:

- [ ] Param is parsed to final form at entry point (not transformed in transit)
- [ ] All downstream code uses the SAME name for the concept
- [ ] Cache keys use the SAME resolved values as queries
- [ ] No layer modifies params after initial normalization
- [ ] Grep for param name returns ALL usages (no aliases)

---

## Simplicity Checklist (Before PR)

- [ ] Can explain the data flow in ONE sentence
- [ ] No helper function used only once
- [ ] No abstraction for <3 occurrences
- [ ] No layer that just renames fields
- [ ] No debounce on single-click actions (dropdowns, buttons)
- [ ] Using library features directly (not wrapped)
