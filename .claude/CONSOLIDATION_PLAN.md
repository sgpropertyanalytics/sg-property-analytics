# Claude Setup Consolidation Plan

## Current State
- `claude.md`: 984 lines (23 MUST/MANDATORY/FORBIDDEN rules)
- `REPO_MAP.md`: 632 lines
- 16 skills with 7,172 total lines
- 18 agents
- 10 commands
- **Est. token load per request: 25-30k**

## Target State
- `claude.md`: <300 lines (core principles only)
- `REPO_MAP.md`: <200 lines (navigation only)
- 5 consolidated skills (~2,000 lines total)
- 10 agents (merge similar ones)
- 7 commands (merge workflows)
- **Target token load: <8k**

---

## Step 1: Consolidate Skills (16 → 5)

### NEW: `backend-guardrails.md` (merge 4 skills)
Merge:
- `sql-guardrails` (400 lines)
- `input-boundary-guardrails` (614 lines)
- `backend-impact-guardrails` (398 lines)
- `api-guardrails` (373 lines)

Into: **Backend Guardrails** (~1,000 lines)
- Section 1: SQL Safety (`:param` bindings, dates, outlier exclusion)
- Section 2: Input Validation (boundary normalization, fail-fast)
- Section 3: Breaking Change Protocol (dependency chain, 4 questions)
- Section 4: API Design (endpoint standards, URL routing)

### NEW: `frontend-guardrails.md` (merge 3 skills)
Merge:
- `contract-async-guardrails` (466 lines)
- `dashboard-guardrails` (559 lines)
- `design-system` (714 lines)

Into: **Frontend Guardrails** (~1,200 lines)
- Section 1: Data Fetching (TanStack Query, adapters, contracts)
- Section 2: Chart Development (what NOT to touch, verification)
- Section 3: UI/UX Standards (colors, typography, components)

### KEEP AS-IS: (3 skills)
- `review` (1,372 lines) — orchestrator, needs to be comprehensive
- `codebase-architect` (284 lines) — domain knowledge
- `data-standards` (636 lines) — domain knowledge + enum integrity

### DELETE: (8 skills → merged above)
- ✅ `sql-guardrails`
- ✅ `input-boundary-guardrails`
- ✅ `backend-impact-guardrails`
- ✅ `api-guardrails`
- ✅ `contract-async-guardrails`
- ✅ `dashboard-guardrails`
- ✅ `design-system`
- ✅ `lazy-import-guardrails` (104 lines — move to frontend-guardrails)

### EVALUATE:
- `git-context-guardrails` (390 lines) — Is this just "read git history first"? Can be 50 lines in claude.md
- `library-check` (328 lines) — Move to claude.md Library-First section
- `simplicity-check` (155 lines) — Move to claude.md Anti-Over-Engineering section
- `sg-property-analyst` (220 lines) — Keep or merge into codebase-architect?
- `learn-mistake` (159 lines) — Keep (unique function)

---

## Step 2: Simplify `claude.md` (984 → 300 lines)

### REMOVE from claude.md (move to skills):
- [ ] Full SQL patterns → `backend-guardrails.md`
- [ ] Full async patterns → `frontend-guardrails.md`
- [ ] Full color palette → `frontend-guardrails.md`
- [ ] Detailed test commands → `review/SKILL.md` (already there)
- [ ] All examples (keep only 1 per concept)

### KEEP in claude.md:
- Core Invariants (layer responsibilities, SSOT, reuse-first)
- Engineering Principles (the 18 rules)
- Quick Reference table (skills/agents/routes)
- Param Flow Integrity (recent painful lesson)

### FORMAT CHANGE:
```md
# Rule Name

**Why:** One sentence origin story
**What:** One sentence requirement  
**Example:** Good vs Bad (2 lines each)
**Where:** Link to skill for details
```

---

## Step 3: Simplify `REPO_MAP.md` (632 → 200 lines)

**Current problem:** Mixes navigation + rules + patterns

**Solution:** ONLY navigation
- [ ] Quick Navigation table (keep)
- [ ] Architecture Layers (keep diagram, remove examples)
- [ ] Critical Files (keep)
- [ ] Historical Incidents (keep)
- [ ] REMOVE: Layer Rules (move to claude.md)
- [ ] REMOVE: Data Flow Chain (move to codebase-architect skill)
- [ ] REMOVE: Code Patterns (move to skills)

---

## Step 4: Consolidate Agents (18 → 10)

### Merge:
- `thoughts-locator` + `thoughts-analyzer` → `plan-analyzer` (one agent does both)
- `design-reviewer` + `simplicity-reviewer` → `design-simplicity-reviewer`
- `codebase-pattern-finder` + `fullstack-consistency-reviewer` → `pattern-consistency-reviewer`

### Keep:
- `risk-agent`
- `regression-snapshot-guard`
- `eli5-guardian`
- `ingestion-orchestrator`
- `etl-pipeline`
- `data-correctness-auditor`
- `design-system-enforcer`
- `responsive-layout-guard`

---

## Step 5: Consolidate Commands (10 → 7)

### Merge:
- `create_plan.md` + `iterate_plan.md` + `validate_plan.md` → `plan.md` (subcommands: create, iterate, validate)
- `create_handoff.md` + `resume_handoff.md` → `handoff.md` (subcommands: create, resume)

### Keep:
- `implement_plan.md`
- `debug.md`
- `local_review.md`
- `research_codebase.md`
- `create_worktree.md`

---

## Validation Checklist

After consolidation, test:
- [ ] `/review` still works (most important workflow)
- [ ] SQL guardrails trigger on SQL changes
- [ ] Frontend guardrails trigger on component changes
- [ ] Token usage reduced by 60%+ (measure with sample prompts)
- [ ] No functionality lost (all rules preserved, just reorganized)

---

## Rollback Plan

1. Git branch: `consolidate-claude-setup`
2. Keep old `.claude/` in `.claude.backup/`
3. Test for 1 week
4. If issues, revert branch
5. If successful, delete backup

---

## Estimated Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Token load per request | 25-30k | 8-10k | **66% reduction** |
| Time to load context | 3-5s | 1-2s | **60% faster** |
| Skills to check | 16 | 5 | **68% reduction** |
| Total instruction lines | 7,172 | ~2,500 | **65% reduction** |
| Duplication | High | Low | **80% reduction** |

**Productivity gain:** 2-3x from reduced token overhead + faster context loading + clearer mental model.

---

## Next Steps

1. [ ] Create git branch
2. [ ] Consolidate skills (Step 1)
3. [ ] Simplify claude.md (Step 2)
4. [ ] Simplify REPO_MAP.md (Step 3)
5. [ ] Test `/review` workflow
6. [ ] Measure token reduction
7. [ ] Iterate based on 1-week usage
