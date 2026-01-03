---
description: Create detailed implementation plans through interactive research and iteration
---

# Implementation Plan

You are tasked with creating detailed implementation plans through an interactive, iterative process. Be skeptical, thorough, and work collaboratively with the user to produce high-quality technical specifications.

## Initial Response

When this command is invoked:

1. **If a file path or description was provided**:
   - Skip the default message
   - Immediately read any provided files FULLY
   - Begin the research process

2. **If no parameters provided**:
   ```
   I'll help you create a detailed implementation plan.

   Please provide:
   1. The task description or feature request
   2. Any relevant context or constraints
   3. Links to related docs or previous implementations

   I'll analyze this and work with you to create a comprehensive plan.
   ```

## Process Steps

### Step 1: Context Gathering & Initial Analysis

1. **Read all mentioned files immediately and FULLY**:
   - Feature descriptions
   - Related documentation
   - Reference implementations
   - **IMPORTANT**: Use Read tool WITHOUT limit/offset parameters
   - **CRITICAL**: Read files yourself before spawning sub-tasks

2. **Always read these critical files**:
   - `REPO_MAP.md` - Navigation guide + historical incidents
   - Relevant pattern references from REPO_MAP.md Section 6

3. **Spawn initial research tasks**:

   ```
   Task 1 - Codebase Location:
   Use codebase-locator to find all files related to [feature]:
   1. Find relevant components
   2. Find related services/routes
   3. Find existing tests
   Return: File list with brief descriptions
   ```

   ```
   Task 2 - Pattern Analysis:
   Use codebase-pattern-finder to find similar implementations:
   1. How do existing features do this?
   2. What patterns are used?
   3. What can we model after?
   Return: Pattern examples with file:line references
   ```

   ```
   Task 3 - Historical Context:
   Use thoughts-locator to find related documentation:
   1. Check docs/ for relevant architecture docs
   2. Check REPO_MAP.md for related incidents
   3. Check .claude/skills/ for relevant guardrails
   Return: Relevant documentation list
   ```

4. **Wait for ALL sub-tasks to complete**

5. **Read all files identified by research tasks**

6. **Present informed understanding**:
   ```
   Based on my research, I understand we need to [accurate summary].

   I've found:
   - [Current implementation detail with file:line reference]
   - [Relevant pattern to follow]
   - [Potential complexity or constraint]

   Questions my research couldn't answer:
   - [Specific question requiring human judgment]
   - [Design preference that affects implementation]
   ```

### Step 2: Research & Discovery

After getting initial clarifications:

1. **If user corrects any misunderstanding**:
   - Spawn new research tasks to verify
   - Read the specific files they mention
   - Only proceed once verified

2. **Create a research todo list** using TodoWrite

3. **Present findings and design options**:
   ```
   Based on my research:

   **Current State:**
   - [Key discovery about existing code]
   - [Pattern or convention to follow]

   **Design Options:**
   1. [Option A] - [pros/cons]
   2. [Option B] - [pros/cons]

   **Open Questions:**
   - [Technical uncertainty]
   - [Design decision needed]

   Which approach aligns best with your vision?
   ```

### Step 3: Plan Structure Development

Once aligned on approach:

1. **Create initial plan outline**:
   ```
   Here's my proposed plan structure:

   ## Overview
   [1-2 sentence summary]

   ## Implementation Phases:
   1. [Phase name] - [what it accomplishes]
   2. [Phase name] - [what it accomplishes]
   3. [Phase name] - [what it accomplishes]

   Does this phasing make sense? Should I adjust?
   ```

2. **Get feedback on structure** before writing details

### Step 4: Detailed Plan Writing

After structure approval:

1. **Write the plan** to `docs/plans/YYYY-MM-DD-description.md`
   - Format: `YYYY-MM-DD-description.md`
   - Example: `2026-01-03-add-histogram-chart.md`

2. **Create docs/plans directory if needed**:
   ```bash
   mkdir -p docs/plans
   ```

3. **Use this template structure**:

```markdown
# [Feature/Task Name] Implementation Plan

## Overview

[Brief description of what we're implementing and why]

## Current State Analysis

[What exists now, what's missing, key constraints]

### Key Discoveries:
- [Finding with file:line reference]
- [Pattern to follow]
- [Constraint to work within]

## Desired End State

[Specification of the end state and how to verify it]

## What We're NOT Doing

[Explicitly list out-of-scope items to prevent scope creep]

## Implementation Approach

[High-level strategy and reasoning]

---

## Phase 1: [Descriptive Name]

### Overview
[What this phase accomplishes]

### Changes Required:

#### Backend Changes
**File**: `backend/path/to/file.py`
**Changes**: [Summary]

```python
# Specific code to add/modify
```

#### Frontend Changes
**File**: `frontend/src/path/to/file.jsx`
**Changes**: [Summary]

```jsx
// Specific code to add/modify
```

### Success Criteria:

#### Automated Verification:
- [ ] Backend tests pass: `pytest backend/tests/ -v`
- [ ] Frontend tests pass: `cd frontend && npm run test`
- [ ] Lint passes: `cd frontend && npm run lint`
- [ ] Type check passes: `cd frontend && npm run typecheck`

#### Manual Verification:
- [ ] [Specific UI behavior to verify]
- [ ] [Performance check if applicable]

**Pause Point**: After automated verification passes, pause for manual testing confirmation before proceeding to Phase 2.

---

## Phase 2: [Descriptive Name]

[Similar structure...]

---

## Testing Strategy

### Unit Tests:
- [What to test]
- [Key edge cases]

### Integration Tests:
- [End-to-end scenarios]

### Manual Testing Steps:
1. [Specific step]
2. [Another step]

## Pattern Compliance

Per REPO_MAP.md Section 6, copy these patterns:
- Chart component: `TimeTrendChart.jsx`
- Adapter: `timeSeries.js`
- Service: `dashboard_service.py:get_aggregated_data()`

## Historical Incident Check

Verified against REPO_MAP.md Section 9:
- [ ] No custom hook layers (use useAppQuery)
- [ ] No silent param drops (verify schema alignment)
- [ ] No undeclared response fields (check contracts)

## References

- Pattern reference: `[file:line]`
- Related documentation: `docs/[file].md`
- REPO_MAP.md sections consulted: [list]
```

### Step 5: Review and Iterate

1. **Present the draft plan location**:
   ```
   I've created the implementation plan at:
   `docs/plans/YYYY-MM-DD-description.md`

   Please review and let me know:
   - Are the phases properly scoped?
   - Are success criteria specific enough?
   - Any missing edge cases?
   ```

2. **Iterate based on feedback**

3. **Continue refining** until user is satisfied

## Important Guidelines

1. **Be Skeptical**:
   - Question vague requirements
   - Identify potential issues early
   - Ask "why" and "what about"
   - Don't assume - verify with code

2. **Be Interactive**:
   - Don't write the full plan in one shot
   - Get buy-in at each major step
   - Allow course corrections

3. **Be Thorough**:
   - Read all context files COMPLETELY
   - Research actual code patterns
   - Include specific file:line references
   - Write measurable success criteria

4. **Follow Existing Patterns**:
   - Always check REPO_MAP.md Section 6 for pattern references
   - Copy existing implementations exactly
   - Don't innovate unnecessarily

5. **Check Historical Incidents**:
   - Always consult REPO_MAP.md Section 9
   - Explicitly verify against known issues
   - Include incident check in plan

6. **No Open Questions in Final Plan**:
   - If you encounter open questions, STOP
   - Research or ask for clarification
   - Do NOT write plan with unresolved questions
