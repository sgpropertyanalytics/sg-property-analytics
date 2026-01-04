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
| Frontend patterns | [`docs/frontend.md`](./docs/frontend.md) |
| Backend patterns | [`docs/backend.md`](./docs/backend.md) |
| Architecture | [`docs/architecture.md`](./docs/architecture.md) |
| Engineering principles | [`docs/ENGINEERING_PRINCIPLES.md`](./docs/ENGINEERING_PRINCIPLES.md) |
| Code patterns | [`docs/CODE_PATTERNS.md`](./docs/CODE_PATTERNS.md) |
| Testing guide | [`docs/TESTING.md`](./docs/TESTING.md) |
| Checklists | [`docs/CHECKLISTS.md`](./docs/CHECKLISTS.md) |

---

## Core Invariants (NON-NEGOTIABLE)

These 11 rules apply to EVERY task. Violation = bug.

### 1. Understand Before Implementing
Read target files, check `git log -20 -- <file>`, find reference implementations. The architecture is SETTLED.

### 2. Layer Responsibilities
| Layer | Owns | NEVER Does |
|-------|------|------------|
| Pages | Business logic, sale type | - |
| Components | Rendering props | Logic, defaults, hardcoded values |
| Routes | Parsing, validation | SQL, business logic |
| Services | SQL, computation | Parsing strings |

### 3. Single Source of Truth
| What | Source | FORBIDDEN |
|------|--------|-----------|
| Sale types | `SaleType` enum | String literals |
| Districts | `constants.py` | Hardcoded mappings |
| API params | `contract_schema.py` | Undocumented fields |

### 4. Reuse-First
NEVER introduce new patterns. Copy existing exactly.
- Charts: `TimeTrendChart.jsx`
- Routes: `backend/routes/analytics/aggregate.py`
- Services: `backend/services/dashboard_service.py`

### 5. Library-First
Before writing >50 lines of infrastructure:
1. Check npm/PyPI for existing solution
2. Get explicit approval for custom code

| Use | NOT |
|-----|-----|
| TanStack Query | useEffect + fetch + useState |
| Zustand | Context >100 lines |
| react-hook-form + zod | Custom validation |

### 6. Data File Immutability
**NEVER** delete/modify CSVs in `backend/data/` or `scripts/data/`.

### 7. Outlier Exclusion
```sql
WHERE COALESCE(is_outlier, false) = false  -- EVERY query
```

### 8. SQL Rules
- `:param` bindings only (no f-strings)
- Python `date` objects (not strings)
- SQL in `services/`, not `routes/`

### 9. Frontend Async
```javascript
const { data, status } = useAppQuery(
  async (signal) => { /* fetch */ },
  [deps],
  { chartName: 'X', keepPreviousData: true }
);
```

### 10. Handle All UI States
```jsx
if (status === 'pending') return <Skeleton />;
if (status === 'error') return <ErrorState />;
if (!data?.length) return <EmptyState />;
return <Chart data={data} />;
```

### 11. Fix Root Cause, Not Symptoms
**STOP before fixing ANY bug.** Don't blindly patch. Don't add layers.

Ask these questions FIRST:
1. **Band-aid or long-term fix?** — If band-aid, find root cause instead
2. **Am I adding complexity?** — New middleware, wrapper, helper = RED FLAG
3. **Does a library already solve this?** — Check before writing custom code
4. **Does existing code handle this?** — Search repo for patterns first
5. **Should I redesign the flow?** — Sometimes the architecture is wrong

**Priority:** Clean, simple, efficient code that is **aligned and consistent** with existing patterns.

> If you're adding a layer to fix a bug, you're probably creating two bugs.
> If unsure whether it's a proper fix → **ASK, don't guess.**

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

### Colors
```
Navy: #213448 | Blue: #547792 | Sky: #94B4C1 | Sand: #EAE0CF
CCR: Navy | RCR: Blue | OCR: Sky
```

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

See [`docs/TESTING.md`](./docs/TESTING.md) for full testing guide.

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
