---
description: Validate implementation against plan, verify success criteria, identify issues
---

# Validate Plan

You are tasked with validating that an implementation plan was correctly executed, verifying all success criteria and identifying any deviations or issues.

## Initial Setup

When invoked:

1. **Determine context** - Are you in an existing conversation or starting fresh?
   - If existing: Review what was implemented in this session
   - If fresh: Need to discover what was done through git and codebase analysis

2. **Locate the plan**:
   - If plan path provided, use it
   - Otherwise, check `docs/plans/` for recent plans
   - Or search recent commits for plan references

3. **Gather implementation evidence**:
   ```bash
   # Check recent commits
   git log --oneline -n 20

   # Run comprehensive checks
   pytest backend/tests/ -v
   cd frontend && npm run test && npm run lint && npm run typecheck
   ```

## Validation Process

### Step 1: Context Discovery

If starting fresh or need more context:

1. **Read the implementation plan** completely
2. **Identify what should have changed**:
   - List all files that should be modified
   - Note all success criteria (automated and manual)
   - Identify key functionality to verify

3. **Spawn parallel research tasks**:

   ```
   Task 1 - Verify Backend Changes:
   Check if backend changes match plan:
   1. Read modified service files
   2. Check route handlers
   3. Verify @api_contract schemas
   4. Check SQL queries in dashboard_service.py
   Return: File-by-file comparison of planned vs actual
   ```

   ```
   Task 2 - Verify Frontend Changes:
   Check if frontend changes match plan:
   1. Read modified components
   2. Check adapter transformations
   3. Verify filterStore.js changes
   4. Check useAppQuery usage
   Return: File-by-file comparison of planned vs actual
   ```

   ```
   Task 3 - Verify Test Coverage:
   Check if tests were added/modified as specified:
   1. Run backend tests: pytest backend/tests/ -v
   2. Run frontend tests: npm run test
   3. Check for new test files
   Return: Test status and any missing coverage
   ```

   ```
   Task 4 - Verify Contract Alignment:
   Check frontend↔backend contract alignment:
   1. Compare API params sent vs schema expected
   2. Check response shapes match adapters
   3. Run contract tests if they exist
   Return: Contract alignment status
   ```

### Step 2: Systematic Validation

For each phase in the plan:

1. **Check completion status**:
   - Look for checkmarks in the plan (- [x])
   - Verify the actual code matches claimed completion

2. **Run automated verification**:
   ```bash
   # Backend checks
   pytest backend/tests/ -v
   cd backend && python -m black --check .

   # Frontend checks
   cd frontend && npm run lint
   cd frontend && npm run typecheck
   cd frontend && npm run test

   # Contract checks (if applicable)
   pytest backend/tests/contracts/ -v
   ```

3. **Assess manual criteria**:
   - List what needs manual testing
   - Provide clear steps for user verification

4. **Think about edge cases**:
   - Were error conditions handled?
   - Are there missing validations?
   - Could the implementation break existing functionality?
   - Does this match patterns from REPO_MAP.md?

### Step 3: Generate Validation Report

```markdown
## Validation Report: [Plan Name]

### Implementation Status
✓ Phase 1: [Name] - Fully implemented
✓ Phase 2: [Name] - Fully implemented
⚠️ Phase 3: [Name] - Partially implemented (see issues)

### Automated Verification Results

**Backend:**
- ✓ pytest backend/tests/: X passed
- ✓ Black formatting: Clean
- ✓ Contract validation: All schemas valid

**Frontend:**
- ✓ npm run test: X passed
- ✓ npm run lint: No errors
- ✓ npm run typecheck: No type errors

### Code Review Findings

#### Matches Plan:
- [Change 1] correctly implements specification
- [Change 2] follows existing patterns (per REPO_MAP.md)

#### Deviations from Plan:
- `file:line` - [Deviation description]
- Reason: [If apparent]

#### Potential Issues:
- [Issue 1 with file:line reference]
- [Issue 2 with file:line reference]

### Pattern Compliance (REPO_MAP.md)

- ✓ Uses useAppQuery for data fetching (not custom hooks)
- ✓ Adapter only transforms shape (no business logic)
- ✓ Page decides sale_type (not component)
- ⚠️ [Any pattern violations]

### Historical Incident Check

Verified against known incidents:
- ✓ No silent param drops (checked normalize_params)
- ✓ No undeclared response fields (checked contracts)
- ✓ No CSV mutations (fs_guard protection)

### Manual Testing Required

1. **UI Verification**:
   - [ ] [Specific thing to check in UI]
   - [ ] [Another UI check]

2. **Integration Testing**:
   - [ ] [Cross-feature check]
   - [ ] [Performance check if applicable]

### Recommendations

1. **Before Merge**:
   - [Action item]
   - [Another action]

2. **Consider For Future**:
   - [Improvement suggestion]
   - [Tech debt to track]

### Summary

[Overall assessment: Ready for merge / Needs fixes / Blocked]
```

## Important Guidelines

1. **Be thorough but practical** - Focus on what matters
2. **Run all automated checks** - Don't skip verification commands
3. **Document everything** - Both successes and issues
4. **Think critically** - Does implementation truly solve the problem?
5. **Consider maintenance** - Will this be maintainable long-term?
6. **Check REPO_MAP.md** - Verify against known patterns and incidents

## Validation Checklist

Always verify:
- [ ] All phases marked complete are actually done
- [ ] Automated tests pass
- [ ] Code follows existing patterns (REPO_MAP.md Section 6)
- [ ] No pattern violations (REPO_MAP.md Section 7)
- [ ] No regressions introduced
- [ ] Error handling is robust
- [ ] No historical incident patterns repeated
- [ ] Manual test steps are clear

## Relationship to Other Commands

Recommended workflow:
1. `/create_plan` - Design the implementation
2. `/implement_plan` - Execute the implementation
3. `/validate_plan` - **You are here** - Verify correctness
4. Create PR with findings

The validation works best after implementation is complete, as it can analyze the full scope of changes.
