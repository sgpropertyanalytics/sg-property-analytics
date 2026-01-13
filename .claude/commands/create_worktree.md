---
description: Create git worktree for parallel development on a feature
---

# Create Worktree

You are tasked with setting up a git worktree for parallel development. This allows working on multiple features simultaneously without stashing or switching branches.

## When to Use Worktrees

Use worktrees when:
- Working on a feature while another is in review
- Need to test something on main while mid-feature
- Want isolated environments for different tasks
- Debugging an issue without losing current work

## Process

### Step 1: Parse Input

When invoked with parameters like `branch-name` or `feature-description`:

1. **Extract worktree information**:
   - Branch name to create
   - Base branch (default: main)
   - Description for the worktree

2. **If no parameters provided**:
   ```
   I'll help you create a git worktree for parallel development.

   Please provide:
   - Feature/branch name (e.g., "add-histogram-chart")
   - Base branch (default: main)

   Example: `/create_worktree add-histogram-chart`
   ```

### Step 2: Determine Paths

```bash
# Get repo root
REPO_ROOT=$(git rev-parse --show-toplevel)
REPO_NAME=$(basename $REPO_ROOT)

# Worktree location
WORKTREE_PATH=~/worktrees/$REPO_NAME/[branch-name]
```

### Step 3: Create Worktree

1. **Verify clean state**:
   ```bash
   git status --porcelain
   ```
   If there are uncommitted changes, warn the user.

2. **Create the worktree**:
   ```bash
   # Ensure base is up to date
   git fetch origin main

   # Create worktree with new branch
   git worktree add -b [branch-name] ~/worktrees/sg-property-analyzer/[branch-name] origin/main
   ```

3. **Verify creation**:
   ```bash
   git worktree list
   ```

### Step 4: Setup Worktree Environment

```bash
cd ~/worktrees/sg-property-analyzer/[branch-name]

# Copy Claude settings if they exist
cp -r $REPO_ROOT/.claude/settings.local.json .claude/ 2>/dev/null || true

# CRITICAL: Copy .env files (not tracked by git)
# Root .env contains DATABASE_URL for backend
cp $REPO_ROOT/.env .env 2>/dev/null || echo "Warning: No root .env found"

# Frontend .env contains Firebase config for Google Sign-In
cp $REPO_ROOT/frontend/.env frontend/.env 2>/dev/null || echo "Warning: No frontend .env found"

# Install dependencies
cd frontend && npm install
cd ../backend && pip install -r requirements.txt
```

### Step 5: Present Summary

```markdown
## Worktree Created Successfully

**Location**: `~/worktrees/sg-property-analyzer/[branch-name]`
**Branch**: `[branch-name]`
**Based on**: `origin/main`

### Quick Start

```bash
# Navigate to worktree
cd ~/worktrees/sg-property-analyzer/[branch-name]

# Start backend (source .env for DATABASE_URL, DEBUG=True for localhost cookies)
cd backend && source ../.env && FLASK_DEBUG=True flask run --port 5002

# Start frontend (in separate terminal)
cd frontend && npm run dev -- --port 5174
```

### Working with This Worktree

**Open in new terminal/editor**:
```bash
code ~/worktrees/sg-property-analyzer/[branch-name]
# or
cd ~/worktrees/sg-property-analyzer/[branch-name] && claude
```

**Current worktrees**:
```bash
git worktree list
```

### Environment Files (Copied Automatically)

| File | Purpose |
|------|---------|
| `.env` | DATABASE_URL for backend |
| `frontend/.env` | Firebase config for Google Sign-In |

**Troubleshooting:**
- Sign-in greyed out → Missing `frontend/.env`
- Shows "free" tier → Missing `.env` (wrong database)
- 401 errors / "Session expired" → Start backend with `FLASK_DEBUG=True` (enables non-secure cookies for localhost)

### Port Configuration

To avoid conflicts with main development:
- Backend: Use port 5002 (main uses 5001)
- Frontend: Use port 5174 (main uses 5173)

### When Done

After merging or abandoning the feature:
```bash
# Remove worktree
git worktree remove ~/worktrees/sg-property-analyzer/[branch-name]

# Or force remove if needed
git worktree remove --force ~/worktrees/sg-property-analyzer/[branch-name]

# Clean up branch if merged
git branch -d [branch-name]
```

### Creating Handoff

If you need to hand off work in this worktree:
```bash
cd ~/worktrees/sg-property-analyzer/[branch-name]
# Use /create_handoff command
```
```

## Worktree Best Practices

1. **Use different ports** - Avoid conflicts with main development
2. **Keep worktrees focused** - One feature per worktree
3. **Clean up when done** - Remove merged worktrees
4. **Share .claude settings** - Copy local settings to worktree

## Managing Multiple Worktrees

```bash
# List all worktrees
git worktree list

# Remove a worktree
git worktree remove ~/worktrees/sg-property-analyzer/[name]

# Prune stale worktrees
git worktree prune
```

## Common Scenarios

### Scenario 1: Review PR While Working on Feature
```bash
# You're working on feature-a, need to review PR for feature-b
/create_worktree review-feature-b

# In new worktree, checkout the PR
gh pr checkout [PR-number]
```

### Scenario 2: Hotfix on Main
```bash
# Mid-feature, need to fix something on main
/create_worktree hotfix-[description]

# Fix, commit, push, then return to feature
```

### Scenario 3: Test Different Approaches
```bash
# Want to try two different implementations
/create_worktree approach-a
/create_worktree approach-b

# Develop both, compare, keep the better one
```

## Cleanup Commands

```bash
# See what worktrees exist
git worktree list

# Remove specific worktree
git worktree remove ~/worktrees/sg-property-analyzer/[name]

# Remove all worktrees (careful!)
git worktree list --porcelain | grep "^worktree" | cut -d' ' -f2 | xargs -I{} git worktree remove {}
```
