---
description: Iterate on existing implementation plans with research and updates
---

# Iterate Plan

You are tasked with updating existing implementation plans based on user feedback. Be skeptical, thorough, and ensure changes are grounded in actual codebase reality.

## Initial Response

When this command is invoked:

1. **Parse the input to identify**:
   - Plan file path (e.g., `docs/plans/2026-01-03-feature.md`)
   - Requested changes/feedback

2. **Handle different input scenarios**:

   **If NO plan file provided**:
   ```
   I'll help you iterate on an existing implementation plan.

   Which plan would you like to update?
   ```
   Then run: `ls -lt docs/plans/ | head -10`

   **If plan file provided but NO feedback**:
   ```
   I've found the plan at [path]. What changes would you like to make?

   For example:
   - "Add a phase for error handling"
   - "Update success criteria to include performance tests"
   - "Adjust scope to exclude feature X"
   - "Split Phase 2 into two phases"
   ```

   **If BOTH plan file AND feedback provided**:
   - Proceed immediately to Step 1

## Process Steps

### Step 1: Read and Understand Current Plan

1. **Read the existing plan file COMPLETELY**:
   - Use Read tool WITHOUT limit/offset parameters
   - Understand current structure, phases, and scope
   - Note success criteria and implementation approach

2. **Read REPO_MAP.md** for context:
   - Pattern references (Section 6)
   - Anti-patterns (Section 7)
   - Historical incidents (Section 9)

3. **Understand the requested changes**:
   - Parse what the user wants to add/modify/remove
   - Identify if changes require codebase research
   - Determine scope of the update

### Step 2: Research If Needed

**Only spawn research tasks if changes require new technical understanding.**

If user's feedback requires understanding new code patterns:

1. **Create a research todo list** using TodoWrite

2. **Spawn parallel sub-tasks**:

   ```
   Task 1 - Code Investigation:
   Use codebase-locator/analyzer to understand [new area]:
   1. Find relevant files
   2. Understand current implementation
   3. Identify patterns to follow
   Return: Findings with file:line references
   ```

   ```
   Task 2 - Pattern Check:
   Use codebase-pattern-finder to find similar implementations:
   1. How is this done elsewhere?
   2. What can we model after?
   Return: Pattern examples
   ```

3. **Read any new files identified**

4. **Wait for ALL sub-tasks to complete**

### Step 3: Present Understanding and Approach

Before making changes, confirm understanding:

```
Based on your feedback, I understand you want to:
- [Change 1 with specific detail]
- [Change 2 with specific detail]

My research found:
- [Relevant code pattern or constraint]
- [Important discovery that affects the change]

I plan to update the plan by:
1. [Specific modification]
2. [Another modification]

Does this align with your intent?
```

Get user confirmation before proceeding.

### Step 4: Update the Plan

1. **Make focused, precise edits**:
   - Use Edit tool for surgical changes
   - Maintain existing structure unless explicitly changing
   - Keep all file:line references accurate
   - Update success criteria if needed

2. **Ensure consistency**:
   - New phases follow existing pattern
   - "What We're NOT Doing" section updated if scope changes
   - Historical incident checks still valid
   - Pattern references still accurate

3. **Preserve quality standards**:
   - Include specific file paths and line numbers
   - Write measurable success criteria
   - Distinguish automated vs manual verification
   - Keep language clear and actionable

### Step 5: Present Changes

```
I've updated the plan at `docs/plans/[filename].md`

Changes made:
- [Specific change 1]
- [Specific change 2]

The updated plan now:
- [Key improvement]
- [Another improvement]

Would you like any further adjustments?
```

## Guidelines

1. **Be Skeptical**:
   - Don't blindly accept problematic requests
   - Question vague feedback
   - Verify technical feasibility
   - Point out conflicts with existing phases

2. **Be Surgical**:
   - Make precise edits, not wholesale rewrites
   - Preserve good content that doesn't need changing
   - Only research what's necessary

3. **Be Thorough**:
   - Read entire existing plan before changes
   - Research if changes require new understanding
   - Ensure updated sections maintain quality

4. **Be Interactive**:
   - Confirm understanding before changes
   - Show what you plan to change
   - Allow course corrections

5. **Check Patterns**:
   - Verify updates still follow REPO_MAP.md Section 6
   - Ensure no new anti-patterns (Section 7)
   - Historical incidents still addressed (Section 9)

## Common Iteration Types

### Adding a Phase
- Insert new phase in logical order
- Follow existing phase structure exactly
- Add both automated and manual success criteria
- Update phase numbers if needed

### Modifying Scope
- Update "What We're NOT Doing" section
- Adjust affected phases
- Update success criteria
- Check if historical incident protections still apply

### Splitting a Phase
- Create two new phases from one
- Divide tasks logically
- Add pause point between new phases
- Maintain dependency order

### Adding Success Criteria
- Distinguish automated vs manual
- Be specific and measurable
- Use existing test commands as reference
- Add to appropriate phase

### Updating Code References
- Verify new references exist
- Use correct file:line format
- Update related implementation details
- Check pattern compliance

## Example Flows

**Scenario 1: User provides everything**
```
User: /iterate_plan docs/plans/2026-01-03-feature.md - add phase for error handling
Assistant: [Reads plan, researches error patterns, updates plan]
```

**Scenario 2: User provides just plan**
```
User: /iterate_plan docs/plans/2026-01-03-feature.md
Assistant: What changes would you like to make?
User: Split Phase 2 into backend and frontend phases
Assistant: [Proceeds with update]
```

**Scenario 3: No arguments**
```
User: /iterate_plan
Assistant: Which plan would you like to update? [Lists recent plans]
User: docs/plans/2026-01-03-feature.md
Assistant: What changes would you like to make?
```
