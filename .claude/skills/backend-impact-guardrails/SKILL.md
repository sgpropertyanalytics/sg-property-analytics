---
name: backend-impact-guardrails
description: Backend change impact analysis guardrails. MANDATORY before ANY backend change that could affect data flow, API contracts, or data sources. Prevents silent breakage of frontend charts and KPIs by enforcing dependency analysis and impact validation. Use before AND after any backend data/API changes.
---

# Backend Impact Guardrails

> **Registry reference:** [BACKEND_CHART_DEPENDENCIES.md](../../../docs/BACKEND_CHART_DEPENDENCIES.md)
> **Validation agent:** `chart-impact-validator` (MANDATORY before merge)

---

## THE 4 QUESTIONS (Ask Before Every Backend Change)

```
┌─────────────────────────────────────────────────────────────┐
│  1. Does this break the API CONTRACT?                       │
│     → Response shape, field names, required params          │
│                                                             │
│  2. Does this break FRONTEND RENDERING?                     │
│     → Will pages load? Will components mount?               │
│                                                             │
│  3. Does this break VISUAL CHARTS?                          │
│     → Will charts display? Data present? No empty states?   │
│                                                             │
│  4. Does this break CHART LOGIC/CALCULATIONS?               │
│     → Adapters, transformations, aggregations, metrics      │
└─────────────────────────────────────────────────────────────┘

If YES to ANY → STOP. Fix before proceeding.
```

### Quick Validation for Each Question

| Question | How to Validate |
|----------|-----------------|
| 1. API Contract | Compare old vs new response shape. Check `@api_contract` decorator. |
| 2. Frontend Rendering | Load all 7 pages. Check console for errors. |
| 3. Visual Charts | Verify charts render with data, no "No data" states unexpectedly. |
| 4. Chart Logic | Check adapters in `frontend/src/adapters/`. Verify calculations match. |

---

## Purpose

Prevent backend changes from silently breaking frontend visualizations. This skill enforces systematic impact analysis before any backend modification.

---

## When This Activates (MANDATORY)

This skill is **MANDATORY** for:

- Modifying or removing data files (CSV, JSON in `backend/data/`)
- Changing SQL queries in services (`backend/services/*_service.py`)
- Modifying API endpoints (`backend/routes/*.py`)
- Changing database schema or models
- Modifying constants that affect data classification
- Refactoring data transformation logic
- Changing API response shapes or field names

---

## Part 1: Pre-Change Dependency Check

### MANDATORY: Identify Affected Endpoints

Before any backend change, run this checklist:

| Change Type | Files to Audit | Impact Scope |
|------------|---------------|--------------|
| Data file removal | `BACKEND_CHART_DEPENDENCIES.md` | All charts using related endpoints |
| Service function change | Grep for function imports in routes | Routes calling the function |
| Route handler change | Frontend grep for endpoint URL | All charts calling that endpoint |
| SQL query change | Services using that query | Endpoints using those services |
| Model/schema change | All services querying that model | Cascading to all dependent routes |

### Step 1: Data Source Impact Analysis

```bash
# Find all files that import or reference the data source
grep -rn "your_data_source" backend/

# Find all services that use the affected model/table
grep -rn "Transaction\|from transactions" backend/services/

# Check which routes use the affected service
grep -rn "from services.affected_service" backend/routes/
```

### Step 2: Endpoint Dependency Mapping

For each affected endpoint, consult `docs/BACKEND_CHART_DEPENDENCIES.md` to find:
1. Which frontend charts consume this endpoint
2. Which pages contain those charts
3. Which filters/parameters affect the data

### Step 3: Validate Contract Compatibility

For endpoints with `@api_contract` decorator:
1. Check if response schema will change
2. Verify field names remain consistent (v1/v2)
3. Confirm metric calculations stay the same

---

## Part 2: Impact Categories

### Category A: BREAKING (Blocks Merge)

**STOP. Do not proceed without migration plan.**

- Removing data that charts depend on
- Changing API response field names
- Removing endpoints without migration
- Changing metric calculation logic
- Removing columns used in GROUP BY or WHERE clauses

### Category B: REQUIRES VALIDATION (Manual Check)

**Proceed with caution. Manual verification required.**

- Adding new filters that change result sets
- Modifying date boundary logic
- Changing aggregation methods
- Altering outlier exclusion rules
- Adding new required parameters

### Category C: SAFE (Proceed with Caution)

**Low risk but still document.**

- Adding new endpoints (additive)
- Adding new optional response fields
- Performance optimizations (same output)
- Adding new data sources (additive)
- Adding new optional parameters

---

## Part 3: Validation Workflow

### Before Making Changes

1. **Identify the change scope**
   ```
   [ ] Data file (removal/modification)
   [ ] Service function (logic change)
   [ ] Route handler (API change)
   [ ] Model/schema (structure change)
   [ ] Constants (classification change)
   ```

2. **Map downstream dependencies**
   - Consult `docs/BACKEND_CHART_DEPENDENCIES.md`
   - Run dependency grep commands
   - List all affected charts by page

3. **Assess impact category**
   - Determine if BREAKING, VALIDATION, or SAFE
   - Document reasoning

4. **If BREAKING: STOP and propose migration plan**

### After Making Changes

1. **Run regression tests**
   ```bash
   cd backend && pytest tests/test_regression_snapshots.py -v
   ```

2. **Run dependency sync tests**
   ```bash
   cd backend && pytest tests/test_chart_dependencies.py -v
   ```

3. **Run API contract tests**
   ```bash
   cd backend && pytest tests/test_api_invariants.py -v
   ```

4. **Manually verify ALL affected pages**
   - `/market-overview`
   - `/district-overview`
   - `/new-launch-market`
   - `/supply-inventory`
   - `/explore`
   - `/value-check`
   - `/exit-risk`

---

## Part 4: Required Output Format

For EVERY backend change affecting data flow:

```markdown
### Backend Impact Assessment

**Change:** [Description of the change]
**Category:** [BREAKING | VALIDATION | SAFE]
**Affected Files:** [List of modified files]

#### Dependency Chain
```
Data Source: [name]
    ↓
Service(s): [list]
    ↓
Route(s): [list]
    ↓
Endpoint(s): [list]
    ↓
Chart(s): [list]
    ↓
Page(s): [list]
```

#### Affected Endpoints
| Endpoint | Contract Version | Status |
|----------|-----------------|--------|
| `/api/aggregate` | v2 | [Unchanged/Modified/Removed] |

#### Affected Charts
| Page | Chart | Endpoint | Impact | Verified |
|------|-------|----------|--------|----------|
| MacroOverview | TimeTrendChart | /api/aggregate | [Impact] | [ ] |
| DistrictOverview | GrowthDumbbellChart | /api/aggregate | [Impact] | [ ] |

#### Verification Checklist
- [ ] Regression tests pass
- [ ] Dependency sync tests pass
- [ ] API contract tests pass
- [ ] All affected pages manually verified:
  - [ ] /market-overview
  - [ ] /district-overview
  - [ ] /new-launch-market
  - [ ] /supply-inventory
- [ ] No console errors on affected pages
- [ ] BACKEND_CHART_DEPENDENCIES.md updated (if applicable)
```

---

## Part 5: Quick Reference - Dependency Chains

### Chain 1: Transaction Data (Most Critical)

```
transactions table (PostgreSQL)
    ↓
dashboard_service.py (aggregations)
    ↓
├── /api/aggregate → TimeTrendChart, GrowthDumbbellChart, etc.
├── /api/kpi-summary-v2 → KPI Cards (MacroOverview)
├── /insights/district-psf → MarketStrategyMap (DistrictOverview)
└── /insights/district-liquidity → DistrictLiquidityMap (DistrictOverview)
```

**Removing transaction data = BREAKING for ALL analytics**

### Chain 2: Supply/Launch Data

```
upcoming_launches.csv / new_launch_units.csv
    ↓
supply_service.py
    ↓
/api/supply-metrics → SupplyWaterfallChart (SupplyInsights)
```

### Chain 3: Project Metadata

```
projects table
    ↓
project_service.py
    ↓
/api/projects/* → ProjectDetailPanel, FloorLiquidityHeatmap
```

---

## Part 6: Common Patterns - Quick Audit Commands

```bash
# Find all frontend files using a specific endpoint
grep -rn "'/api/aggregate'" frontend/src/ | head -20

# Find all charts using a specific adapter
grep -rn "transform.*Series" frontend/src/components/

# Find all pages importing a specific chart
grep -rn "import.*GrowthDumbbell" frontend/src/pages/

# List all routes in backend
grep -rn "@.*_bp.route" backend/routes/ | grep -v "__pycache__"

# Find service functions used by a route
grep -rn "from services" backend/routes/analytics.py

# Check what consumes a specific service function
grep -rn "get_aggregated_data" backend/routes/
```

---

## Part 7: The Resale Data Rule (Incident Prevention)

**The incident that created this guardrail:**

A commit removed resale CSV data without checking impact. Result:
- KPI card measuring annualized resale velocity broke
- DistrictOverview charts broke silently
- No validation was run before merge

**The dependency chain that was ignored:**

```
Resale CSV data (REMOVED)
    ↓
transactions table (sale_type = 'Resale')
    ↓
dashboard_service.py aggregations
    ↓
/api/aggregate, /api/kpi-summary-v2
    ↓
TimeTrendChart, KPI Cards, etc.
    ↓
MacroOverview page = BROKEN
```

**The rule now:**

Before removing ANY data:
1. Check `BACKEND_CHART_DEPENDENCIES.md`
2. List every chart that will break
3. If ANY chart breaks → STOP
4. Create migration plan FIRST
5. Get explicit approval

---

## Part 8: Sign-Off Template

Before approving any backend PR:

```markdown
## Backend Change Sign-Off

### Change Summary
[What was changed and why]

### Impact Category
[ ] SAFE - No charts affected
[ ] VALIDATION - Charts verified manually
[ ] BREAKING - Migration plan approved

### Dependency Analysis
- Data sources affected: [list]
- Endpoints affected: [list]
- Charts affected: [list]
- Pages affected: [list]

### Verification
- [ ] Regression tests pass
- [ ] Dependency sync tests pass
- [ ] API contract tests pass
- [ ] Manual page verification complete:
  - [ ] /market-overview
  - [ ] /district-overview
  - [ ] /new-launch-market
  - [ ] /supply-inventory
  - [ ] /explore
  - [ ] /value-check
  - [ ] /exit-risk
- [ ] No console errors
- [ ] BACKEND_CHART_DEPENDENCIES.md updated

Validated by: [name]
Date: [date]
```

---

## Mental Model

```
Before ANY backend change:

1. WHAT am I touching? (data/service/route/model)
2. WHO depends on it? (check registry)
3. WILL anything break? (trace dependency chain)
4. HOW do I verify? (run tests + manual check)
5. DID I document it? (impact assessment)

If unsure at ANY step → STOP and ask.
```
