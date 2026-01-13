# Singapore Property Analyzer

Private condo analytics platform using URA transaction data. Resale-focused with New Launch comparison.

**Stack:** React + Vite + TanStack Query + Zustand | Flask + PostgreSQL

---

## Quick Reference

### Skills (On-Demand)
| Skill | When to Use |
|-------|-------------|
| `/sql-guardrails` | Writing SQL queries |
| `/contract-async-guardrails` | Frontend data fetching |
| `/dashboard-guardrails` | Modifying charts |
| `/backend-impact-guardrails` | **ANY backend change** |
| `/api-guardrails` | New endpoints, 404s |
| `/data-standards` | Enums, classifications |
| `/design-system` | UI components, colors |
| `/review` | **Pre-merge review** |
| `/learn-mistake` | Record incidents |

### Agents
| Agent | Trigger |
|-------|---------|
| `fullstack-consistency-reviewer` | Before merge |
| `risk-agent` | Bug/security review |
| `simplicity-reviewer` | Complexity check |

### Page Routes
| Route | Page | Scope |
|-------|------|-------|
| `/market-overview` | Market Overview | Resale ONLY |
| `/new-launch-market` | New Launch Market | New Sale + Resale |
| `/district-overview` | District Overview | All |
| `/supply-inventory` | Supply & Inventory | All |
| `/explore` | Explore | All |
| `/value-check` | Value Check | All |
| `/exit-risk` | Exit Risk | All |

### Key Docs
| What | Where |
|------|-------|
| File map, tech debt | [`REPO_MAP.md`](./REPO_MAP.md) |
| Historical incidents | [`REPO_MAP.md#9`](./REPO_MAP.md#9-historical-incidents-landmines) |

---

## Core Invariants (NON-NEGOTIABLE)

These 15 rules apply to EVERY task. Violation = bug.

### 1. KISS: Keep It Simple
Default to the simplest working solution. No unnecessary abstractions. No premature optimization. Clarity > cleverness. Correctness > elegance.

### 2. Understand Before Implementing
Read target files, check `git log -20 -- <file>`, find reference implementations. The architecture is SETTLED.

### 3. Layer Responsibilities
| Layer | Owns | NEVER Does |
|-------|------|------------|
| Pages | Business logic, sale type | - |
| Components | Rendering props | Logic, defaults, hardcoded values |
| Routes | Parsing, validation | SQL, business logic |
| Services | SQL, computation | Parsing strings |

### 4. Single Source of Truth
| What | Source | FORBIDDEN |
|------|--------|-----------|
| Sale types | `SaleType` enum | String literals |
| Districts | `constants.py` | Hardcoded mappings |
| API params | `contract_schema.py` | Undocumented fields |

### 5. Reuse-First

**Search before writing. Assume it exists until proven otherwise.**

#### Pre-Check (30 seconds):
```bash
grep -r "def.*" backend/
grep -r "" frontend/src/hooks/
```

#### Canonical Locations:
| Type | Check First |
|------|-------------|
| Utils | `backend/utils/` |
| Hooks | `frontend/src/hooks/` |
| Constants | `constants.py`, `schemas/` |
| Components | `frontend/src/components/` |

**Can't find in 2 min? Ask — don't recreate.**

### 6. Library-First

Before writing ANY infrastructure code (not just >50 lines):
- **Ask: "What's the native way to do this?"**
- **State: "I checked [library] and it [does/doesn't] handle this via [feature]"**

1. Check npm/PyPI for existing solution
2. Get explicit approval for custom code

| Use | NOT |
|-----|-----|
| TanStack Query | useEffect + fetch + useState |
| Zustand | Context >100 lines |
| react-hook-form + zod | Custom validation |

### 7. Data File Immutability
**NEVER** delete/modify CSVs in `backend/data/` or `scripts/data/`.

### 8. Outlier Exclusion
```sql
WHERE COALESCE(is_outlier, false) = false  -- EVERY query
```

### 9. SQL Rules
- `:param` bindings only (no f-strings)
- Python `date` objects (not strings)
- SQL in `services/`, not `routes/`

### 10. Frontend Async
```javascript
const { data, status } = useAppQuery(
  async (signal) => { /* fetch */ },
  [deps],
  { chartName: 'X', keepPreviousData: true }
);
```

### 11. Handle All UI States
```jsx
if (status === 'pending') return <Skeleton />;
if (status === 'error') return <ErrorState />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

### 12. Fix Root Cause, Not Symptoms — LIBRARY FIRST

**STOP before implementing ANY solution.** Ask IN ORDER:

1. **Does the library/framework already handle this?**
   - Pydantic, TanStack Query, Flask, Zustand — check their docs first
   - Example: Pydantic has `extra='allow'` + `model_extra` — don't write custom param detection

2. **Is there a config option instead of custom code?**
   - Most "features" are just config flags
   - Example: TanStack Query has `staleTime` — don't write custom debounce

3. **Does existing code in this repo solve it?**
   - Search first: `grep -r "similar_pattern" .`

4. **Only then: write minimal custom code**

**HARD STOP: Custom Code Gate (BLOCKING)**

Claude CANNOT propose custom code until this block is written:

```
┌─────────────────────────────────────────────────────────────┐
│ LIBRARY CHECK (mandatory before ANY custom code)            │
├─────────────────────────────────────────────────────────────┤
│ Task: [what I'm trying to solve]                            │
│                                                             │
│ npm search: [search terms used]                             │
│ Found: [library name] - [weekly downloads] - [bundle size]  │
│                                                             │
│ Decision: □ USE LIBRARY  □ CUSTOM CODE                      │
│ Reason: [specific justification]                            │
└─────────────────────────────────────────────────────────────┘
```

**Invalid Excuses for Custom Code:**

| Excuse | Why It's Wrong |
|--------|----------------|
| "Adds ~XKB dependency" | Irrelevant if <50KB |
| "Simple to write ourselves" | Simple to MAINTAIN? No. |
| "We already have similar code" | That code might be tech debt |
| "More control" | Libraries are battle-tested |
| "No external dependencies" | Dependencies are GOOD |

**Valid Reasons for Custom Code:**

| Reason | Example |
|--------|---------|
| Library doesn't exist | Truly novel requirement |
| Library is unmaintained | No updates in 2+ years, security issues |
| Library is massive | >100KB for a tiny feature |
| Project-specific domain logic | Business rules unique to this app |

### 13. One API Per Data Need

Design APIs around **data needs**, not pages or charts.

| Approach | When to Use |
|----------|-------------|
| One API per page | Almost never. Couples backend to frontend layout. |
| One API per chart | Sometimes overkill. What if 3 charts need same data? |
| **One API per data need** | ✅ Sweet spot. Reusable, focused, decoupled. |

**Example:** If 3 charts all need quarterly median PSF by district, create ONE `/api/aggregate` endpoint they all share — not 3 separate endpoints.

### 14. Check Both Sides Before Changing Contracts

When modifying code that sits between two layers (API contracts, adapters, schemas, serializers, type definitions), ALWAYS:

1. **Check both sides** — What does the upstream send? What does the downstream expect?
2. **State the current reality** — "Layer A sends X, Layer B expects Y, this file says Z"
3. **Propose direction** — Are we changing the contract to match reality, or adding a translation layer?
4. **Don't just fix one side** — Moving a mismatch is not fixing it

**Ask before proceeding if all three don't align.**

### 15. Field/API Changes Require Full Search

When removing, renaming, or changing any field:

1. Search for ALL usages across frontend and backend
2. Update all references, or
3. List breaking changes that need manual review

**Never remove a field without verifying zero usages or updating all consumers.**

---

## Hard Constraints

| Constraint | Limit |
|------------|-------|
| Memory | 512MB - SQL aggregation only |
| Queries | Paginated (never 100K+ rows) |
| Date bounds | Exclusive upper: `>= min AND < max` |

---

## Domain Quick Reference

### Bedroom Classification
```
Tier 1 (New ≥Jun'23): <580, <780, <1150, <1450, ≥1450 sqft
Tier 2 (New <Jun'23): <600, <850, <1200, <1500, ≥1500 sqft
Tier 3 (Resale):      <600, <950, <1350, <1650, ≥1650 sqft
```

### District → Region
```
CCR: D01, D02, D06, D07, D09, D10, D11
RCR: D03, D04, D05, D08, D12, D13, D14, D15, D20
OCR: D16-D19, D21-D28
```

### Design System — Blues + Warm Accents

**Philosophy:** Navy/Ocean/Sky blues with warm brown accents. Bloomberg Orange for CTAs.

**Source of Truth:** `frontend/src/constants/colors.js` (hex values, works with Chart.js)

| Palette | Token | Hex | Usage |
|---------|-------|-----|-------|
| **REGION** | CCR | `#213448` | Navy - Premium (darkest) |
| | RCR | `#547792` | Ocean - Mid-tier |
| | OCR | `#94B4C1` | Sky - Suburban (lightest) |
| **BEADS** | 1BR | `#EAE0CF` | Sand - lightest |
| | 2BR | `#94B4C1` | Sky |
| | 3BR | `#547792` | Ocean |
| | 4BR | `#213448` | Navy - darkest |
| | 5BR | `#78503C` | Brown accent |
| **INK** | primary | `#0F172A` | Headers, primary data |
| | mid | `#475569` | Body text |
| | muted | `#94A3B8` | Placeholders |
| **VOID** | base | `#0A0A0A` | Nav background |
| **SIGNAL** | accent | `#F97316` | CTAs, highlights |
| **DELTA** | positive | `#059669` | Gains |
| | negative | `#DC2626` | Losses |
| **SUPPLY** | unsold | `#6b4226` | Warm browns for waterfall |

**Note:** All chart colors are hex/rgba values in colors.js (Chart.js cannot resolve CSS variables).

---

## Verification

Run after code changes:

```bash
# Tier 1: Quick (always)
cd frontend && npm run lint && npm run typecheck

# Tier 2: Core (most changes)
cd backend && pytest tests/test_normalize.py tests/test_api_contract.py -v

# Tier 3: Full (pre-merge)
pytest tests/test_regression_snapshots.py -v
```

Use `/review` for comprehensive pre-merge review.

---

## Anti-Patterns (Auto-Reject)

| Pattern | Problem |
|---------|---------|
| `useEffect` + `fetch` + `useState` | Use TanStack Query |
| New hook >50 lines | Probably reinventing library |
| `if (specificEdgeCase)` hack | Fix root cause |
| `// TODO: fix later` | Fix now or don't merge |
| Context file >100 lines | Use Zustand |
| Hardcoded strings for enums | Use constants |
| "Create a minimal hook (~20 lines)" | Use the npm library instead |
| "Option B: Custom code, no dependency" | Dependency fear is outdated |
| Proposing custom code without LIBRARY CHECK | Auto-reject |

### Anti-Pattern: Accidental Complexity from Patch-Driven Design

Avoid fixing issues by layering additional conditional logic, retries, or guards
without re-establishing global invariants.

This codebase has previously suffered from:
- Accidental complexity
- Patch-driven architecture
- Implicit state machines
- Temporal coupling
- Shotgun surgery

Symptoms:
- Whack-a-mole bug fixing
- Non-deterministic behavior
- Increasing number of local safeguards
- Global behavior becoming harder to reason about

Correct response:
- Step back and re-establish structural invariants
- Make state transitions explicit
- Consolidate mutation points
- Prefer architectural fixes over local patches

Reviewer Instruction (MANDATORY):

Claude must NOT blindly apply patch fixes or band-aid solutions.

When Claude detects any of the symptoms above, or when a proposed fix:
- adds new conditionals, retries, guards, flags, or timeouts
- introduces additional mutation points for shared state
- fixes a local symptom without addressing a global invariant
- increases complexity or coupling across components

Claude MUST:
1. Pause local patching
2. Explicitly call out the risk of accidental complexity
3. Step back to analyze the system at a structural level
4. Propose a refactoring or architectural simplification that:
   - reduces the number of mutation points
   - makes implicit state transitions explicit
   - restores or enforces global invariants
   - simplifies reasoning across the entire system

Local patches are acceptable ONLY if:
- they reduce total complexity, or
- they are paired with a clear plan to consolidate and simplify afterward.

If a fix increases complexity without reducing mutation points,
Claude must reject it and propose a cleaner alternative.

---

## File Structure

```
backend/
├── services/            # Business logic + SQL
├── routes/              # Thin handlers (parse only)
├── constants.py         # District/region mappings
└── api/contracts/       # @api_contract decorator

frontend/src/
├── components/powerbi/  # Chart components
├── hooks/               # useAppQuery wrapper
├── stores/              # Zustand (filterStore.js)
├── adapters/            # API transformers
└── schemas/apiContract/ # Enums, types
```
