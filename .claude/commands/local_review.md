---
description: Set up local environment for reviewing a PR branch
---

# Local Review

You are tasked with setting up a local review environment for a PR branch. This involves fetching the branch, checking out, and running verification.

## Process

### Step 1: Parse Input

When invoked with a parameter like `username:branch-name` or just `branch-name`:

1. **Extract branch information**:
   - If format is `username:branch-name`: Remote fork review
   - If format is just `branch-name`: Same repo branch review
   - If PR number provided (`#123`): Fetch PR branch

2. **If no parameter provided**:
   ```
   I'll help you set up a local review environment.

   Please provide one of:
   - Branch name: `feature-branch`
   - PR number: `#123`
   - Fork branch: `username:branch-name`

   Example: `/local_review claude/fix-chart-reload-toggle-TAmFG`
   ```

### Step 2: Fetch and Checkout

**For same-repo branch:**
```bash
git fetch origin
git checkout -b review/[branch-name] origin/[branch-name]
```

**For PR number:**
```bash
gh pr checkout [PR-number]
```

**For fork branch:**
```bash
git remote add [username] https://github.com/[username]/sg-property-analyzer.git 2>/dev/null || true
git fetch [username]
git checkout -b review/[branch-name] [username]/[branch-name]
```

### Step 3: Understand the Changes

1. **Get PR/branch context**:
   ```bash
   # What changed?
   git log --oneline main..[branch] | head -20
   git diff --stat main..[branch]

   # If PR exists
   gh pr view [PR-number] --json title,body,files
   ```

2. **Spawn parallel analysis tasks**:

   ```
   Task 1 - Analyze Backend Changes:
   Review changes in backend/:
   1. Check modified routes and services
   2. Verify @api_contract usage
   3. Look for SQL changes in dashboard_service.py
   4. Check for pattern compliance
   Return: Summary of backend changes with concerns
   ```

   ```
   Task 2 - Analyze Frontend Changes:
   Review changes in frontend/src/:
   1. Check modified components
   2. Verify adapter patterns
   3. Check filterStore.js changes
   4. Look for useAppQuery usage
   Return: Summary of frontend changes with concerns
   ```

   ```
   Task 3 - Check Test Coverage:
   Review test changes:
   1. Were tests added/modified?
   2. Do tests cover the changes?
   3. Any test removals?
   Return: Test coverage assessment
   ```

### Step 4: Run Verification

```bash
# Install dependencies if needed
cd frontend && npm install
cd ../backend && pip install -r requirements.txt

# Run all checks
pytest backend/tests/ -v
cd frontend && npm run lint && npm run typecheck && npm run test
```

### Step 5: Present Review Summary

```markdown
## Local Review: [Branch/PR Name]

### Overview
- **Branch**: [branch-name]
- **Commits**: [X commits]
- **Files Changed**: [Y files]

### Changes Summary

**Backend Changes:**
- [File 1]: [What changed]
- [File 2]: [What changed]

**Frontend Changes:**
- [File 1]: [What changed]
- [File 2]: [What changed]

### Verification Results

**Automated Checks:**
- Backend tests: [Pass/Fail]
- Frontend lint: [Pass/Fail]
- Frontend typecheck: [Pass/Fail]
- Frontend tests: [Pass/Fail]

### Pattern Compliance (REPO_MAP.md)

- [✓/⚠️] Follows chart component pattern
- [✓/⚠️] Adapter only transforms shape
- [✓/⚠️] Page decides business logic
- [✓/⚠️] Uses useAppQuery correctly

### Potential Concerns

1. **[Concern Category]**
   - File: `path/to/file.ext:line`
   - Issue: [Description]
   - Suggestion: [How to fix]

### Historical Incident Check

Checked against REPO_MAP.md Section 9:
- [✓/⚠️] No silent param drops
- [✓/⚠️] No custom hook layers
- [✓/⚠️] No undeclared response fields

### Manual Testing Needed

- [ ] [Specific thing to test]
- [ ] [Another test step]

### Review Decision

- [ ] **Approve** - Ready to merge
- [ ] **Request Changes** - See concerns above
- [ ] **Comment** - Questions/discussion needed

### Commands for Testing

```bash
# Start backend
cd backend && flask run --port 5001

# Start frontend
cd frontend && npm run dev

# Run specific tests
pytest backend/tests/test_[relevant].py -v
```
```

## Guidelines

1. **Always fetch latest** - Ensure you have current code
2. **Run all checks** - Don't skip verification
3. **Check patterns** - Reference REPO_MAP.md Section 6 & 7
4. **Look for incidents** - Check Section 9 for known issues
5. **Be constructive** - Provide actionable feedback

## Quick Commands

```bash
# See what changed
git diff main..HEAD --stat

# See specific file changes
git diff main..HEAD -- path/to/file

# Run backend tests for specific area
pytest backend/tests/ -v -k "aggregate"

# Run frontend tests for specific component
cd frontend && npm run test -- --grep "TimeTrendChart"
```

## Cleanup

After review is complete:
```bash
# Return to main branch
git checkout main

# Delete review branch
git branch -D review/[branch-name]

# Remove fork remote if added
git remote remove [username]
```
