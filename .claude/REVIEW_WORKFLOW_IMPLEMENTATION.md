# Review Workflow Implementation Summary

**Date:** January 3, 2026
**Branch:** `reviewworkflow`
**Plan File:** `/Users/changyuesin/.claude/plans/melodic-toasting-garden.md`

---

## Goal

Migrate CI regression suite INTO Claude's inline workflow so Claude catches and fixes issues BEFORE pushing. GitHub CI becomes a safety net, not the primary feedback loop.

**Before:** Claude writes → Push → CI fails → Back to Claude → Repeat
**After:** Claude writes → `/review` runs tests → Fixes → Push (CI is backup)

---

## What Was Implemented

### 1. `/review` Orchestrator Skill (`.claude/skills/review/SKILL.md`)

Complete 7-step workflow that MUST be executed:

| Step | Tool | Agent/Command | Purpose |
|------|------|---------------|---------|
| 0 | Bash | `git diff` | Scope detection (frontend/backend/contracts/both) |
| 1 | Task | `codebase-pattern-finder` | Find sibling patterns, git history |
| 2 | Task | `simplicity-reviewer` | DRY check, Library-First check |
| 3 | Task | `fullstack-consistency-reviewer` | Contract validation, chart impact |
| 4 | Task | `risk-agent` | 21 failure modes, CodeRabbit-style review |
| 5 | Bash | pytest/npm commands | Execute tiered tests |
| 6 | Bash | Auto-fix commands | Iterate on failures |
| 7 | - | Final report | Verdict: READY TO PUSH or NEEDS WORK |

**Key fix:** Previous version described workflow but didn't enforce execution. Rewritten with explicit REQUIRED ACTION for each step.

### 2. `simplicity-reviewer` Agent (`.claude/agents/simplicity-reviewer.md`)

Proactive DRY enforcement with 12 checks:
- Single Source of Truth violations
- One Canonical Representation
- No Duplicate Business Logic
- Data-Driven over branching
- Library-First violations (CLAUDE.md §1.6)
- Schema ↔ Serializer parity
- Contract version centrality
- Filter semantics unification

### 3. Enhanced `risk-agent` (`.claude/agents/risk-agent.md`)

Upgraded from 10 to 21 failure modes (CodeRabbit-style):
- Modes 1-10: Runtime bugs (original - null data, loading race, abort/stale, filter corruption, chart disappears, logic drift, API breaks, grain mismatch, missing imports, MapLibre)
- Mode 11: Library-First violations (CLAUDE.md §1.6)
- Mode 12: SQL Injection patterns (f-string SQL detection)
- Mode 13: Outlier exclusion missing (COALESCE check)
- Mode 14: Date bounds inconsistency (exclusive upper bound)
- Mode 15: Line-by-line code quality (senior engineer review)
- Mode 16: Security scanning (secrets, auth, SQL injection)
- Mode 17: Lint integration (ESLint, Flake8, TypeScript errors)
- Mode 18: Architectural review (layer violations, DRY, coupling)
- Mode 19: Performance implications (N+1, O(n²), memoization)
- Mode 20: Test coverage check (missing test files)
- Mode 21: Documentation quality (docstrings, JSDoc)

Output format: 🔴 MUST FIX | 🟡 SHOULD FIX | 💡 CONSIDER | ✅ LOOKS GOOD

**Added:** Complete CodeRabbit output format with summary table and verdict (APPROVE/REQUEST CHANGES/NEEDS DISCUSSION)

### 4. Enhanced `codebase-pattern-finder` (`.claude/agents/codebase-pattern-finder.md`)

Added:
- Git history awareness (`git log -20 -- <files>`)
- Multi-sibling comparison (3+ siblings)
- Library-First pattern awareness

### 5. Merged Skills

| New Skill | Merged From |
|-----------|-------------|
| `api-guardrails` | `api-endpoint-guardrails` + `api-url-guardrails` |
| `design-system` | `dashboard-design` + `dashboard-layout` + `frontend-design` + `validate-layout` |
| `data-standards` | Original + `enum-integrity-guardrails` |

### 6. `/learn-mistake` Skill (`.claude/skills/learn-mistake/SKILL.md`)

Captures Claude's mistakes for persistent memory:
1. User reports: "that was wrong because X"
2. Skill formats as Historical Incident
3. Appends to `REPO_MAP.md §9`
4. Future `/review` checks these via risk-agent

### 7. PostToolUse Hooks (`.claude/settings.json`)

Auto-format on every write/edit:
```json
{
  "hooks": {
    "PostToolUse": [
      {"matcher": "Edit|Write", "command": "ESLint --fix for .js/.jsx/.ts/.tsx"},
      {"matcher": "Edit|Write", "command": "Black for .py"}
    ]
  }
}
```

### 8. CLAUDE.md Section 11: VERIFICATION

Added tiered test commands:
- Tier 1: Quick checks (~30s) - lint, typecheck, syntax
- Tier 2: Core tests (~3min) - unit tests, route contract, data guard
- Tier 3: Full suite (~8min) - regression, integration, E2E smoke
- Tier 4: Full E2E (~10min) - pre-merge performance suite

### 9. Simplified GitHub CI (`.github/workflows/regression.yml`)

**Before:** 14 jobs (628 lines)
**After:** 4 jobs (239 lines)

| Job | When | Purpose |
|-----|------|---------|
| `safety-net` | PR/push | Quick integration test backup |
| `frontend-smoke` | PR/push | Build check |
| `frontend-perf` | Nightly | Full E2E performance |
| `security-audit` | Nightly | Dependency vulnerabilities |

---

## Test Coverage Verification

### Backend Tests (31 files in `backend/tests/`)
✅ All covered in `/review` skill

### Root Tests (10 files in `tests/`)
✅ All covered in `/review` skill

### E2E Tests (11 files)
✅ All covered via `npm run e2e:full`

### CI Scripts (3 files)
✅ All covered: `check_route_contract.py`, `data_guard.py`, `validate_e2e_mocks.py`

---

## Commits on `reviewworkflow` Branch

```
0873783 fix(review): Rewrite skill to enforce all 7 steps from plan
8f1c0c7 refactor(ci): Simplify to Stage 2 Safety Net
8792aea fix(review): Correct test paths and add comprehensive test coverage
9590a57 feat: Add /learn-mistake skill
cc53391 feat: Implement inline code review + test verification system
```

---

## Files Created

```
.claude/skills/review/SKILL.md                 - Review orchestrator (563 lines)
.claude/skills/learn-mistake/SKILL.md          - Mistake capture skill
.claude/skills/api-guardrails/SKILL.md         - Merged API skill
.claude/skills/design-system/SKILL.md          - Merged design skill
.claude/agents/simplicity-reviewer.md          - DRY enforcement agent
.claude/settings.json                          - PostToolUse hooks
```

## Files Modified

```
.claude/agents/risk-agent.md                   - Added modes 11-21 (CodeRabbit-style review)
.claude/agents/codebase-pattern-finder.md      - Added git history + multi-sibling
.claude/agents/fullstack-consistency-reviewer.md - Added Phase 4 (inline verification)
.claude/skills/data-standards/SKILL.md         - Absorbed enum-integrity
claude.md                                      - Added Section 11: VERIFICATION
.github/workflows/regression.yml               - Simplified to 4 jobs
```

## Files Deleted

```
.claude/skills/api-endpoint-guardrails/        - Merged into api-guardrails
.claude/skills/api-url-guardrails/             - Merged into api-guardrails
.claude/skills/dashboard-design/               - Merged into design-system
.claude/skills/dashboard-layout/               - Merged into design-system
.claude/skills/frontend-design/                - Merged into design-system
.claude/commands/validate-layout.md            - Merged into design-system
.claude/skills/enum-integrity-guardrails/      - Merged into data-standards
```

---

## How to Use `/review`

1. Make code changes
2. Run `/review` in Claude Code (terminal or webapp)
3. Claude will:
   - Call 4 agents (pattern-finder, simplicity-reviewer, consistency-reviewer, risk-agent)
   - Execute tests (pytest, npm run lint/typecheck)
   - Show actual pass/fail output
   - Produce final report with verdict
4. If READY TO PUSH → commit and push
5. If NEEDS WORK → fix issues, re-run `/review`

---

## Known Issue Fixed

**Problem:** When `/review` was first tested, Claude did code analysis but didn't actually run tests.

**Root Cause:** Skill file described workflow but didn't enforce tool usage.

**Fix:** Rewritten with:
- CRITICAL REQUIREMENTS section
- Explicit "REQUIRED ACTION: Use [Tool] to run..."
- Checklist at bottom for Claude to verify completion
- Exact prompts for each agent call

---

## Gaps Filled (Jan 3, 2026 - Afternoon Session)

After reviewing the original 45-minute planning session, these gaps were identified and filled:

### 1. risk-agent modes 11-21 (ADDED)
- **Mode 11:** Library-First violations detection
- **Mode 12:** SQL Injection patterns (f-string SQL)
- **Mode 13:** Outlier exclusion missing
- **Mode 14:** Date bounds inconsistency
- **Mode 15-21:** CodeRabbit-style review modes (line-by-line quality, security, lint, architecture, performance, test coverage, documentation)

### 2. CodeRabbit Output Format (ADDED)
- Full output structure with 🔴 MUST FIX | 🟡 SHOULD FIX | 💡 CONSIDER | ✅ LOOKS GOOD
- Summary table with metrics
- Verdict: APPROVE | REQUEST CHANGES | NEEDS DISCUSSION

### 3. fullstack-consistency-reviewer Phase 4 (ADDED)
- Inline verification phase integrated with /review workflow
- Contract verification tests (route contract, drift check, API contract, alignment)
- Regression snapshot tests (when backend changed)
- Iteration loop for failures
- Updated Conditional Phase Execution table with Phase 4 column

### 4. Test Paths Verified
- All test paths in /review skill verified to match actual file locations
- Tests run from `cd backend && pytest tests/...` correctly find files in `backend/tests/`

---

## Next Steps (Future Work)

1. Test `/review` workflow end-to-end
2. Monitor for cases where Claude skips steps
3. Add more specific test file selection based on changed files
4. Consider adding `/review --quick` for Tier 1+2 only
5. Consider adding `/review --full` for all tiers including Tier 4

---

## Related Documentation

- Plan: `/Users/changyuesin/.claude/plans/melodic-toasting-garden.md`
- CLAUDE.md Section 11: VERIFICATION
- REPO_MAP.md §9: Historical Incidents
- docs/LIBRARY_FIRST_REFERENCE.md
