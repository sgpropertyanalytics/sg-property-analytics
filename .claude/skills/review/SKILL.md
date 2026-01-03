---
name: review
description: Unified code review orchestrator. Runs pattern analysis, simplicity checks, contract validation, risk detection, and inline tests. Use when you want a comprehensive review before pushing or merging.
---

# Code Review Orchestrator

Comprehensive code review workflow that catches issues BEFORE pushing.

**Trigger:** `/review`, "review this", "check my changes"

---

## CRITICAL REQUIREMENTS

> **YOU MUST EXECUTE EVERY STEP BELOW. THIS IS NOT OPTIONAL.**
>
> 1. **USE THE TASK TOOL** to call agents in Steps 1-4
> 2. **USE THE BASH TOOL** to run tests in Step 5
> 3. **SHOW ACTUAL OUTPUT** from test commands (pass/fail counts)
> 4. **PRODUCE THE FINAL REPORT** in the exact format specified
>
> If you skip any step, the review is INCOMPLETE and INVALID.

---

## WORKFLOW DIAGRAM

```
USER INVOKES: "/review" or "review this" or "check my changes"
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 0: SCOPE DETECTION                                         │
│ Use Bash tool: git diff --name-only                             │
│ Output: frontend | backend | contracts | data | both            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: PATTERN ANALYSIS                                        │
│ Use Task tool: subagent_type="codebase-pattern-finder"          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: SIMPLICITY CHECK                                        │
│ Use Task tool: subagent_type="simplicity-reviewer"              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: CONTRACT & CONSISTENCY CHECK                            │
│ Use Task tool: subagent_type="fullstack-consistency-reviewer"   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: RISK DETECTION                                          │
│ Use Task tool: subagent_type="risk-agent"                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: RUN INLINE TESTS                                        │
│ Use Bash tool: pytest, npm run lint, npm run typecheck          │
│ MUST show actual test output with pass/fail counts              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 6: ITERATE ON FAILURES                                     │
│ Auto-fix lint/type errors, ask user for logic failures          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 7: FINAL REPORT                                            │
│ Pattern Match | Simplicity | Contracts | Risks | Tests          │
│ Verdict: READY TO PUSH or NEEDS WORK                            │
└─────────────────────────────────────────────────────────────────┘
```

---

# STEP 0: SCOPE DETECTION

**REQUIRED ACTION:** Use Bash tool to run these commands:

```bash
# Get changed files (committed)
git diff --name-only HEAD~1

# Get changed files (uncommitted)
git diff --name-only
git diff --name-only --cached
```

**REQUIRED OUTPUT:** Categorize the scope:

| Scope | Condition |
|-------|-----------|
| `frontend` | Only `frontend/**` files changed |
| `backend` | Only `backend/**` files changed |
| `contracts` | Any `api/contracts/**`, `generated/**`, or adapter files |
| `data` | Any `backend/data/**` or ETL scripts |
| `both` | Frontend + backend files changed |

**Store the scope** - you will use it in Step 5 to select the test tier.

---

# STEP 1: PATTERN ANALYSIS

**REQUIRED ACTION:** Use the Task tool with these EXACT parameters:

```
Tool: Task
subagent_type: "codebase-pattern-finder"
prompt: |
  Analyze the following changed files for pattern compliance:
  [LIST THE CHANGED FILES FROM STEP 0]

  1. Find 3+ sibling files in the same directory
  2. Run: git log -20 -- <changed_files>
  3. Extract common patterns from siblings
  4. Report any deviations from the majority pattern

  Output format:
  - Reference patterns found
  - Sibling examples
  - Deviations detected (if any)
```

**WAIT for agent to complete before proceeding to Step 2.**

---

# STEP 2: SIMPLICITY CHECK

**REQUIRED ACTION:** Use the Task tool with these EXACT parameters:

```
Tool: Task
subagent_type: "simplicity-reviewer"
prompt: |
  Review the following changed files for simplicity:
  [LIST THE CHANGED FILES FROM STEP 0]

  Check:
  1. Can this be done with fewer files?
  2. Can this be done with fewer lines?
  3. Is there a library solution? (Check CLAUDE.md §1.6)
  4. Does this match sibling patterns?
  5. Is this solving today's problem (not hypothetical future)?

  Output format:
  - Verdict: PASS | NEEDS SIMPLIFICATION | FLAGGED
  - Complexity: Lines, Files, Call depth
  - Simpler alternative (if found)
  - Library-First check: PASS | VIOLATION
  - Pattern match: ALIGNED | DIVERGENT
```

**WAIT for agent to complete.**

**IF FLAGGED:** Show the simpler alternative and ASK user before proceeding.

---

# STEP 3: CONTRACT & CONSISTENCY CHECK

**REQUIRED ACTION:** Use the Task tool with these EXACT parameters:

```
Tool: Task
subagent_type: "fullstack-consistency-reviewer"
prompt: |
  Check frontend↔backend contract alignment for:
  [LIST THE CHANGED FILES FROM STEP 0]

  Phase 0: Git state verification
  - Check uncommitted changes, file existence

  Phase 1: Contract consistency
  - Param names match (FE → BE)?
  - Response fields handled (BE → FE)?
  - Enum values match?
  - Adapters handle all fields?

  Phase 2: Chart impact (if backend changed)
  - What endpoints affected?
  - What charts consume them?
  - Risk level: HIGH | MEDIUM | LOW

  Output: Contract issues, impact assessment
```

**WAIT for agent to complete before proceeding to Step 4.**

---

# STEP 4: RISK DETECTION

**REQUIRED ACTION:** Use the Task tool with these EXACT parameters:

```
Tool: Task
subagent_type: "risk-agent"
prompt: |
  Perform critical code review on:
  [LIST THE CHANGED FILES FROM STEP 0]

  Check all 21 failure mode categories:
  1-14: Runtime bugs (null destructuring, race conditions, etc.)
  15: Line-by-line code quality
  16: Security scanning
  17: Lint integration
  18: Architectural review
  19: Performance implications
  20: Test coverage check
  21: Documentation quality

  Use evidence from git history: git log -20 -- <files>
  Apply reality check protocol.

  Output format:
  ### 🔴 MUST FIX (Blocking)
  ### 🟡 SHOULD FIX (Recommended)
  ### 💡 CONSIDER (Optional)
  ### ✅ LOOKS GOOD

  Verdict: APPROVE | REQUEST CHANGES | NEEDS DISCUSSION
```

**WAIT for agent to complete before proceeding to Step 5.**

---

# STEP 5: RUN INLINE TESTS

**REQUIRED ACTION:** Use Bash tool to execute tests based on scope from Step 0.

## Tier Selection Logic

| Scope from Step 0 | Run These Tiers |
|-------------------|-----------------|
| `frontend` only | Tier 1 + Tier 2 (frontend only) |
| `backend` only | Tier 1 + Tier 2 (backend only) |
| `contracts` touched | Tier 1 + Tier 2 + Tier 3 |
| `both` | Tier 1 + Tier 2 + Tier 3 |
| `data` changed | Tier 1 + Tier 2 + Tier 3 |
| Pre-merge | Tier 1 + Tier 2 + Tier 3 + Tier 4 |

---

## Tier 1: Quick Checks (ALWAYS RUN - ~30s)

**REQUIRED:** Use Bash tool to run:

```bash
# Frontend lint + typecheck
cd frontend && npm run lint && npm run typecheck
```

```bash
# Backend syntax check
python -m py_compile backend/routes/*.py backend/services/*.py
```

```bash
# Contract drift check
python backend/scripts/generate_contracts.py --check
```

**Record pass/fail for each command.**

---

## Tier 2: Core Tests (DEFAULT - ~3 min)

**REQUIRED:** Use Bash tool to run:

### Backend Tests (if backend changed):
```bash
cd backend && pytest tests/test_normalize.py tests/test_api_contract.py -v
```

```bash
cd backend && pytest tests/test_sql_guardrails.py tests/test_sql_safety.py -v
```

```bash
cd backend && pytest tests/test_property_age_bucket.py tests/test_param_coverage.py -v
```

### Frontend Tests (if frontend changed):
```bash
cd frontend && npm run test:ci
```

### Scripts:
```bash
python scripts/check_route_contract.py
```

```bash
python scripts/data_guard.py --ci
```

**Record pass/fail for each command.**

---

## Tier 3: Full Suite (COMPLEX CHANGES - ~8 min)

**REQUIRED when:** contracts touched, both FE+BE changed, data changed, or pre-merge.

**Use Bash tool to run:**

### Integration Tests:
```bash
cd backend && pytest tests/test_regression_snapshots.py -v
```

```bash
cd backend && pytest tests/test_api_invariants.py -v
```

```bash
cd backend && pytest tests/test_smoke_endpoints.py -v
```

```bash
cd backend && pytest tests/test_chart_dependencies.py -v
```

```bash
cd backend && pytest tests/test_kpi_guardrails.py -v
```

### E2E Smoke:
```bash
cd frontend && npm run build && npm run e2e:smoke
```

### Mock Validation:
```bash
python scripts/validate_e2e_mocks.py
```

**Record pass/fail for each command.**

---

## Tier 4: Full E2E Runtime (PRE-MERGE - ~10 min)

**REQUIRED when:** User explicitly requests, major UI changes, filter/state changes.

```bash
cd frontend && npm run e2e:full
```

---

## Complete Backend Test Inventory

All tests are in `backend/tests/`. Run based on what changed:

| Test File | When to Run |
|-----------|-------------|
| `test_normalize.py` | Always (Tier 2) |
| `test_api_contract.py` | Always (Tier 2) |
| `test_property_age_bucket.py` | Always (Tier 2) |
| `test_sql_guardrails.py` | Always (Tier 2) |
| `test_sql_safety.py` | Always (Tier 2) |
| `test_param_coverage.py` | Always (Tier 2) |
| `test_regression_snapshots.py` | Tier 3 |
| `test_api_invariants.py` | Tier 3 |
| `test_smoke_endpoints.py` | Tier 3 |
| `test_chart_dependencies.py` | Tier 3 |
| `test_kpi_guardrails.py` | Tier 3 |
| `test_etl_validation.py` | If data changed |
| `test_aggregate_median.py` | If aggregate changed |
| `test_filter_builder.py` | If filters changed |
| `test_timeframe_resolution.py` | If timeframe changed |
| `test_contract_timeframe_normalize.py` | If timeframe changed |
| `test_subscription_schema_guard.py` | If auth changed |
| `test_user_entitlements.py` | If auth changed |
| `test_csv_diff_detection.py` | If data changed |
| `test_districts_superset.py` | If districts changed |
| `test_supply_summary.py` | If supply changed |
| `test_exit_queue.py` | If exit queue changed |
| `test_price_bands.py` | If price bands changed |
| `test_resale_velocity_kpi.py` | If KPI changed |
| `test_new_launch_absorption.py` | If absorption changed |
| `test_compliance.py` | If compliance changed |
| `test_request_logging.py` | If logging changed |
| `test_cache_key.py` | If caching changed |
| `test_verification_service.py` | If verification changed |
| `test_insights_timeframe_integration.py` | If insights changed |
| `test_price_projects_by_district_query.py` | If district query changed |

---

# STEP 6: ITERATE ON FAILURES

**REQUIRED:** Handle failures based on type:

| Error Type | Action |
|------------|--------|
| **Lint errors** | Auto-fix with `npm run lint -- --fix`, retry up to 3x |
| **Type errors** | Auto-fix, retry up to 3x |
| **Unit test failures** | Report failure, explain cause, ASK user before fixing |
| **Integration test failures** | Report failure, explain cause, ASK user before fixing |
| **Contract drift** | Run `python backend/scripts/generate_contracts.py`, retry |

### Auto-Fix Commands:

```bash
# Lint auto-fix
cd frontend && npm run lint -- --fix
```

```bash
# Python format
python -m black backend/
```

```bash
# Regenerate contracts
python backend/scripts/generate_contracts.py
```

**After auto-fix:** Re-run the failed tests from Step 5.

**After 3 failed attempts:** Report to user and stop.

---

# STEP 7: FINAL REPORT

**REQUIRED:** Output this EXACT format:

```markdown
## Review Complete

**Scope:** [frontend | backend | both | contracts | data]
**Files Changed:** [count]
**Commits Reviewed:** [list]

---

### Summary

| Check | Result | Details |
|-------|--------|---------|
| Pattern Match | ✅ ALIGNED / ⚠️ DIVERGENT | [from Step 1] |
| Simplicity | ✅ PASS / ⚠️ NEEDS REVIEW | [from Step 2] |
| Contracts | ✅ ALIGNED / ❌ DRIFT | [from Step 3] |
| Risks | ✅ NONE / ⚠️ MEDIUM / ❌ HIGH | [from Step 4] |
| Tests | ✅ ALL PASS / ❌ X FAILURES | [from Step 5] |

---

### Test Results

**Tier 1 (Quick):**
- [ ] Lint: PASS/FAIL
- [ ] Typecheck: PASS/FAIL
- [ ] Syntax: PASS/FAIL
- [ ] Contract drift: PASS/FAIL

**Tier 2 (Core):**
- [ ] test_normalize.py: X passed
- [ ] test_api_contract.py: X passed
- [ ] ... [list all tests run]

**Tier 3 (Full):** [if run]
- [ ] test_regression_snapshots.py: X passed
- [ ] ... [list all tests run]

---

### Findings

#### From Pattern Analysis (Step 1):
[Summary from codebase-pattern-finder]

#### From Simplicity Check (Step 2):
[Summary from simplicity-reviewer]

#### From Contract Check (Step 3):
[Summary from fullstack-consistency-reviewer]

#### From Risk Detection (Step 4):
[Summary from risk-agent]

---

### Verdict

**[READY TO PUSH]** or **[NEEDS WORK]**

[If NEEDS WORK, list specific items to address with file:line references]
```

---

# AGENT/TOOL CALL SUMMARY

| Step | Tool | subagent_type | Purpose |
|------|------|---------------|---------|
| 0 | Bash | - | `git diff` scope detection |
| 1 | Task | `codebase-pattern-finder` | Find sibling patterns |
| 2 | Task | `simplicity-reviewer` | Proactive simplicity check |
| 3 | Task | `fullstack-consistency-reviewer` | Contract validation |
| 4 | Task | `risk-agent` | Bug detection (21 modes) |
| 5 | Bash | - | pytest, npm run lint/typecheck |
| 6 | Bash | - | Auto-fix commands |
| 7 | - | - | Generate report text |

---

# CI COVERAGE

This workflow covers ALL blocking CI checks:

| CI Check | In Review | Tier | Command |
|----------|-----------|------|---------|
| Contract Guard | ✅ | 1 | `generate_contracts.py --check` |
| Frontend Import Guard | ✅ | 1 | `npm run typecheck` |
| SQL Safety | ✅ | 2 | `test_sql_safety.py` + `test_sql_guardrails.py` |
| Data Guard | ✅ | 2 | `data_guard.py --ci` |
| Route Contract | ✅ | 2 | `check_route_contract.py` |
| Unit Tests | ✅ | 2 | Multiple test files |
| Lint + Typecheck | ✅ | 1 | `npm run lint && typecheck` |
| Frontend Build | ✅ | 3 | `npm run build` |
| Smoke Tests | ✅ | 3 | `test_smoke_endpoints.py` |
| Integration Tests | ✅ | 3 | `test_regression_snapshots.py` |
| E2E Smoke | ✅ | 3 | `npm run e2e:smoke` |
| E2E Full | ✅ | 4 | `npm run e2e:full` |
| Mock Validation | ✅ | 3 | `validate_e2e_mocks.py` |

**Coverage: 13/13 blocking checks (100%)**

---

# CHECKLIST FOR CLAUDE

Before marking review complete, verify:

- [ ] Step 0: Ran `git diff` and determined scope
- [ ] Step 1: Called `codebase-pattern-finder` agent via Task tool
- [ ] Step 2: Called `simplicity-reviewer` agent via Task tool
- [ ] Step 3: Called `fullstack-consistency-reviewer` agent via Task tool
- [ ] Step 4: Called `risk-agent` agent via Task tool
- [ ] Step 5: Ran pytest/npm commands via Bash tool based on tier
- [ ] Step 6: Auto-fixed any lint/type errors, asked user for logic failures
- [ ] Step 7: Produced final report in exact format with verdict

**If any box is unchecked, the review is INCOMPLETE.**
