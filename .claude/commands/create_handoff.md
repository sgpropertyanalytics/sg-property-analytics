---
description: Create handoff document for transferring work to another session
---

# Create Handoff

You are tasked with writing a handoff document to transfer your work to another agent session. Create a handoff that is thorough but concise - the goal is to compact and summarize context without losing key details.

## Process

### 1. Filepath & Metadata

Create your file under `docs/handoffs/YYYY-MM-DD_HH-MM-SS_description.md`:
- YYYY-MM-DD is today's date
- HH-MM-SS is the current time in 24-hour format
- description is a brief kebab-case description

Examples:
- `docs/handoffs/2026-01-03_14-30-00_pydantic-migration-phase4.md`
- `docs/handoffs/2026-01-03_14-30-00_kpi-performance-fix.md`

Create the directory if it doesn't exist:
```bash
mkdir -p docs/handoffs
```

### 2. Gather Context

Before writing, gather:
```bash
# Current git state
git branch --show-current
git log --oneline -5
git status

# Current date/time
date "+%Y-%m-%d %H:%M:%S %Z"
```

### 3. Write Handoff Document

Use this template:

```markdown
---
date: [Current date and time with timezone in ISO format]
branch: [Current branch name]
commit: [Current commit hash]
status: [in_progress | blocked | ready_for_review]
---

# Handoff: [Brief Description]

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| [Task 1] | ✅ Complete | [Brief note] |
| [Task 2] | 🔄 In Progress | [What remains] |
| [Task 3] | ⏳ Planned | [Dependencies] |

## Critical References

These documents MUST be read before continuing:
- `REPO_MAP.md` - Navigation guide + historical incidents
- [Other critical files for this specific task]

## Recent Changes

```
file:line - Description of change
```

Examples:
- `backend/services/dashboard_service.py:245` - Added new CTE for histogram
- `frontend/src/stores/filterStore.js:150` - Fixed datePreset migration

## Learnings

Important discoveries that should guide future work:

1. **[Learning Title]**
   - What: [What was discovered]
   - Why it matters: [Impact on implementation]
   - File reference: `path/to/file.py:line`

2. **[Another Learning]**
   - ...

## Artifacts

Files created or significantly modified:
- `path/to/new/file.ext` - [Purpose]
- `path/to/modified/file.ext` - [What changed]

## Action Items & Next Steps

Priority order for the next agent:

1. **[Highest Priority]**
   - [ ] Specific action to take
   - [ ] Another step
   - Blocked by: [Nothing | Specific blocker]

2. **[Next Priority]**
   - [ ] Action items
   - Depends on: [Previous task completion]

## Blockers & Open Questions

- **[Blocker/Question]**: [Details and what's needed to resolve]

## Context for Resume

Key things the next agent should know:
- [Important context that isn't obvious from code]
- [Gotchas or traps to avoid]
- [Relevant historical incidents from REPO_MAP.md]

## Commands to Run

```bash
# Verify current state
git status
pytest backend/tests/ -v -k "relevant_test"
cd frontend && npm run test

# Continue from here
[Specific commands to resume work]
```
```

### 4. Confirm and Present

After creating the handoff, respond:

```
Handoff created! Resume in a new session with:

/resume_handoff docs/handoffs/[filename].md

Key points for next session:
- [Most important thing to know]
- [Second most important]
- [Any blockers or dependencies]
```

## Guidelines

- **More information, not less** - This is the minimum; include more if needed
- **Be thorough and precise** - Include both high-level objectives and implementation details
- **Avoid large code blocks** - Use `file:line` references instead
- **Reference REPO_MAP.md incidents** - If your work relates to known issues
- **Include verification commands** - How to confirm the handoff state is correct

## When to Create Handoffs

Create a handoff when:
- Ending a long session with incomplete work
- Hitting a blocker that requires user input
- Completing a phase of multi-phase work
- Before context gets too large to continue effectively

## Example Handoff

```markdown
---
date: 2026-01-03T14:30:00-08:00
branch: pydantic-migration
commit: abc1234
status: in_progress
---

# Handoff: Pydantic Migration Phase 4

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Add endpoint models | ✅ Complete | All 12 endpoints done |
| Enable parallel validation | ✅ Complete | Running in WARN mode |
| Fix validation mismatches | 🔄 In Progress | 3 of 7 fixed |
| Switch to STRICT mode | ⏳ Planned | After all mismatches fixed |

## Critical References

- `REPO_MAP.md` Section 9 - "Just Replace It With Pydantic" incident
- `backend/api/contracts/contract_schema.py` - Existing validation
- `docs/pydantic-migration-plan.md` - Full migration plan

## Learnings

1. **Parallel validation reveals edge cases**
   - What: Pydantic is stricter about None vs missing fields
   - Why it matters: Some endpoints rely on None coercion
   - File reference: `backend/api/contracts/wrapper.py:89`

## Action Items & Next Steps

1. **Fix remaining validation mismatches**
   - [ ] `/api/aggregate` - metrics field type mismatch
   - [ ] `/api/kpi-summary-v2` - snake_case vs camelCase
   - [ ] `/api/projects/hot` - undefined variable bug
   - Blocked by: Nothing

2. **Enable STRICT mode in tests**
   - Depends on: All mismatches fixed
```
