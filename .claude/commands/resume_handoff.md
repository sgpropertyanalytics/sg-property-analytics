---
description: Resume work from handoff document with context analysis and validation
---

# Resume Handoff

You are tasked with resuming work from a handoff document through an interactive process. These handoffs contain critical context, learnings, and next steps from previous work sessions.

## Initial Response

When this command is invoked:

1. **If a handoff document path was provided**:
   - Immediately read the handoff document FULLY
   - Read any critical reference documents it mentions
   - Begin the analysis process
   - Then propose a course of action and confirm with user

2. **If no path provided**:
   ```
   I'll help you resume work from a handoff document.

   Let me find available handoffs:
   ```
   Then run: `ls -lt docs/handoffs/ | head -10`

   Present the list and ask which one to resume from.

## Process Steps

### Step 1: Read and Analyze Handoff

1. **Read handoff document completely**:
   - Use the Read tool WITHOUT limit/offset parameters
   - Extract all sections:
     - Task(s) and their statuses
     - Recent changes
     - Learnings
     - Artifacts
     - Action items and next steps
     - Blockers and open questions

2. **Read critical reference documents**:
   - Always read `REPO_MAP.md` for navigation context
   - Read any files listed in "Critical References"
   - Read files from "Learnings" section

3. **Spawn parallel verification tasks**:

   ```
   Task 1 - Verify Git State:
   Check if the codebase matches handoff expectations:
   1. Current branch vs handoff branch
   2. Recent commits since handoff
   3. Any uncommitted changes
   Return: Git state comparison
   ```

   ```
   Task 2 - Verify Recent Changes:
   Check if changes mentioned in handoff still exist:
   1. Read each file:line reference
   2. Verify the described changes are present
   3. Note any discrepancies
   Return: Change verification status
   ```

   ```
   Task 3 - Check Test Status:
   Run verification commands from handoff:
   1. pytest backend/tests/ -v (or specific tests)
   2. cd frontend && npm run test
   3. Note any failures
   Return: Test status
   ```

4. **Wait for ALL tasks to complete**

### Step 2: Present Analysis

```
I've analyzed the handoff from [date] on branch [branch]. Here's the current situation:

**Original Tasks:**
| Task | Handoff Status | Current Status |
|------|----------------|----------------|
| [Task 1] | [From handoff] | [Verified/Changed] |
| [Task 2] | [From handoff] | [Verified/Changed] |

**Key Learnings Validated:**
- [Learning 1] - [Still valid / Changed]
- [Learning 2] - [Still valid / Changed]

**Recent Changes Status:**
- `file:line` - [Present / Modified / Missing]
- `file:line` - [Present / Modified / Missing]

**Codebase Changes Since Handoff:**
- [X commits since handoff]
- [Notable changes that might affect work]

**Test Status:**
- Backend: [Pass/Fail with details]
- Frontend: [Pass/Fail with details]

**Recommended Next Actions:**
Based on the handoff's action items and current state:
1. [Most logical next step]
2. [Second priority action]
3. [Additional tasks if discovered]

**Potential Issues:**
- [Any conflicts or regressions found]
- [State mismatches to resolve]

Shall I proceed with [recommended action 1], or would you like to adjust the approach?
```

### Step 3: Create Action Plan

1. **Use TodoWrite to create task list**:
   - Convert action items from handoff into todos
   - Add any new tasks discovered during analysis
   - Prioritize based on dependencies and handoff guidance

2. **Present the plan**:
   ```
   I've created a task list based on the handoff:

   [Show todo list]

   Ready to begin with: [first task description]?
   ```

### Step 4: Begin Implementation

1. **Start with the first approved task**
2. **Reference learnings from handoff** throughout implementation
3. **Apply patterns and approaches documented**
4. **Update progress** as tasks are completed

## Guidelines

1. **Be Thorough in Analysis**:
   - Read the entire handoff document first
   - Verify ALL mentioned changes still exist
   - Check for any regressions or conflicts
   - Read all critical references

2. **Be Interactive**:
   - Present findings before starting work
   - Get buy-in on the approach
   - Allow for course corrections
   - Adapt based on current state vs handoff state

3. **Leverage Handoff Wisdom**:
   - Pay special attention to "Learnings" section
   - Apply documented patterns and approaches
   - Avoid repeating mistakes mentioned
   - Build on discovered solutions

4. **Track Continuity**:
   - Use TodoWrite to maintain task continuity
   - Reference the handoff document in commits
   - Document any deviations from original plan
   - Consider creating a new handoff when done

5. **Check Historical Context**:
   - Reference REPO_MAP.md Section 9 for related incidents
   - Avoid patterns that caused past bugs
   - Apply lessons from historical incidents

## Common Scenarios

### Scenario 1: Clean Continuation
- All changes from handoff are present
- No conflicts or regressions
- Clear next steps in action items
→ Proceed with recommended actions

### Scenario 2: Diverged Codebase
- Some changes missing or modified
- New related code added since handoff
- Need to reconcile differences
→ Adapt plan based on current state

### Scenario 3: Incomplete Handoff Work
- Tasks marked as "in_progress" in handoff
- Need to complete unfinished work first
→ Focus on completing before new work

### Scenario 4: Stale Handoff
- Significant time has passed
- Major refactoring has occurred
- Original approach may no longer apply
→ Re-evaluate strategy with user

## Example Flow

```
User: /resume_handoff docs/handoffs/2026-01-03_14-30-00_pydantic-migration.md