---
description: Debug issues by investigating logs, application state, and git history
---

# Debug

You are tasked with helping debug issues during manual testing or implementation. This command allows you to investigate problems by examining logs, application state, and git history without editing files.

## Initial Response

When invoked WITH a context file:
```
I'll help debug issues with [file name]. Let me understand the current state.

What specific problem are you encountering?
- What were you trying to test/implement?
- What went wrong?
- Any error messages?

I'll investigate the logs, database, and git state to help figure out what's happening.
```

When invoked WITHOUT parameters:
```
I'll help debug your current issue.

Please describe what's going wrong:
- What are you working on?
- What specific problem occurred?
- When did it last work?

I can investigate logs, database state, and recent changes to help identify the issue.
```

## Environment Information

You have access to these key locations and tools:

**Backend Logs**:
- Flask development logs (if running locally)
- Check `backend/logs/` if it exists
- Render deployment logs (via Render dashboard)

**Database**:
- PostgreSQL database (check `DATABASE_URL` env var)
- Can query via Flask shell: `flask shell`
- Check migrations: `flask db history`

**Frontend State**:
- Browser DevTools console for React errors
- TanStack Query DevTools for cache state
- Zustand store inspection via React DevTools

**Git State**:
- Check current branch, recent commits, uncommitted changes
- Important for understanding what changed recently

## Process Steps

### Step 1: Understand the Problem

After the user describes the issue:

1. **Read any provided context** (plan or ticket file):
   - Understand what they're implementing/testing
   - Note which component/endpoint is involved
   - Identify expected vs actual behavior

2. **Quick state check**:
   - Current git branch and recent commits
   - Any uncommitted changes
   - When the issue started occurring

### Step 2: Investigate the Issue

Spawn parallel Task agents for efficient investigation:

```
Task 1 - Check Recent Code Changes:
Analyze what changed recently:
1. Check git status and current branch
2. Look at recent commits: git log --oneline -10
3. Check uncommitted changes: git diff
4. Look for changes to relevant files
Return: Git state and recent modifications
```

```
Task 2 - Backend Investigation:
Check backend for issues:
1. Look for recent errors in routes/services
2. Check @api_contract schemas for validation issues
3. Review dashboard_service.py for SQL issues
4. Check for missing/incorrect params in normalize.py
Return: Backend findings with file:line references
```

```
Task 3 - Frontend Investigation:
Check frontend for issues:
1. Look at the component in question (components/powerbi/)
2. Check the adapter (adapters/aggregate/)
3. Review filterStore.js for state issues
4. Check useAppQuery usage for data fetching bugs
Return: Frontend findings with file:line references
```

```
Task 4 - Cross-Layer Check:
Verify frontend↔backend alignment:
1. Check if frontend params match backend schema
2. Verify API response matches adapter expectations
3. Look for silent param drops (historical incident)
4. Check contract_schema.py for enum mismatches
Return: Integration layer findings
```

### Step 3: Present Findings

Based on the investigation, present a focused debug report:

```markdown
## Debug Report

### What's Wrong
[Clear statement of the issue based on evidence]

### Evidence Found

**From Git**:
- [Recent changes that might be related]
- [Modified files]

**From Backend** (`backend/`):
- [Error/issue with file:line reference]
- [Pattern or anomaly found]

**From Frontend** (`frontend/src/`):
- [React/state issue found]
- [Data flow problem]

**Cross-Layer Issues**:
- [Frontend↔Backend mismatch if any]
- [Contract validation issues]

### Root Cause
[Most likely explanation based on evidence]

### Next Steps

1. **Try This First**:
   ```bash
   [Specific command or action]
   ```

2. **If That Doesn't Work**:
   - Check browser console for React errors (F12)
   - Run backend tests: `pytest backend/tests/ -v`
   - Run frontend tests: `npm run test`
   - Check contract validation: `pytest backend/tests/contracts/ -v`

### Historical Context
Check if this matches known incidents:
- Silent Param Drop (Jan 2) - params not reaching backend
- Boot Deadlock (Jan 1) - spinner stuck forever
- Undeclared Response Fields (Jan 3) - contract mismatch

Would you like me to investigate something specific further?
```

## Important Notes

- **Focus on what's broken** - This is for debugging specific issues
- **Always require problem description** - Can't debug without knowing what's wrong
- **Read files completely** - No limit/offset when reading context
- **Check REPO_MAP.md** - Historical incidents might explain the issue
- **Reference critical files**:
  - `backend/services/dashboard_service.py` - Main SQL logic
  - `backend/api/contracts/contract_schema.py` - API schemas
  - `frontend/src/stores/filterStore.js` - Filter state
  - `frontend/src/hooks/useAppQuery.js` - Data fetching
- **No file editing** - Pure investigation only

## Quick Reference

**Backend Checks**:
```bash
# Run all backend tests
pytest backend/tests/ -v

# Run contract tests specifically
pytest backend/tests/contracts/ -v

# Check for type errors
cd backend && python -m mypy routes/ services/
```

**Frontend Checks**:
```bash
# Run frontend tests
cd frontend && npm run test

# Type check
cd frontend && npm run typecheck

# Lint check
cd frontend && npm run lint
```

**Git State**:
```bash
git status
git log --oneline -10
git diff
```

Remember: This command helps you investigate without burning context on file exploration. Reference REPO_MAP.md section 9 for historical incidents that might explain recurring issues.
