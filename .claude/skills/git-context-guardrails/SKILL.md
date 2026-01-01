---
name: git-context-guardrails
description: Git history and context review guardrails. ALWAYS activate before planning ANY implementation task. Requires system architecture understanding, explicit findings report, and production-grade solutions only. No band-aid fixes.
---

# Git Context Guardrails

**Purpose**: Prevent implementation that ignores codebase history, introduces unnecessary new code, or uses band-aid fixes.

## Part 1: System Architecture Understanding (MANDATORY FIRST STEP)

**Before proposing ANY solution, understand the system-level architecture:**

### Step 0: Read Architecture Docs
```bash
# Read these FIRST
cat docs/architecture.md
cat docs/frontend.md
cat docs/backend.md
cat CLAUDE.md
```

### Step 0.1: Understand Existing Design
Answer these questions:
- How does data flow through the system for this feature type?
- What are the established layers (pages → components → utils → API)?
- How is this type of problem ALREADY solved in the codebase?

### Step 0.2: Confirm No New System Design Needed
**The architecture is SETTLED. You work WITHIN it, not redesign it.**

| If You're Tempted To... | Instead... |
|-------------------------|------------|
| Create a new state management approach | Use existing context/hooks pattern |
| Introduce a new data fetching pattern | Use `useAbortableQuery` + adapters |
| Design a new component architecture | Follow existing page → component → util flow |
| Add a new utility pattern | Extend existing utils or follow their pattern |
| Create a new API calling convention | Use `buildApiParams` + `apiClient` |

## Part 2: Context Gathering

### Step 1: Identify Target Files
Before ANY planning, determine which files will be affected:
- Files directly modified
- Files that import modified files
- Files in the same module/feature area

### Step 2: Git History Review
Run these commands for EACH target file area:

```bash
# Recent commits on target files
git log --oneline -20 -- <target_files>

# Detailed diffs for last 5 commits
git log -p -5 -- <target_files>

# Check for related branches/work
git log --all --oneline --grep="<feature_keyword>" -10
```

### Step 3: Search for Existing Solutions
Before proposing ANY new code:

```bash
# Find similar hooks
grep -r "use[A-Z]" frontend/src/hooks/ --include="*.js"

# Find similar utilities
grep -r "export function" frontend/src/utils/ --include="*.js"

# Find similar components
grep -r "export.*function\|export default" frontend/src/components/ --include="*.jsx"

# Find existing patterns for this type of feature
git log --oneline --all --grep="<similar_feature>" -20
```

### Step 4: Extract Context
From git history, identify:
- [ ] Recent architectural patterns applied
- [ ] Naming conventions used
- [ ] Ongoing migrations or refactors
- [ ] Related issues mentioned in commits
- [ ] Reasons for recent changes (the "why")
- [ ] Existing code that can be reused

## Part 3: Mandatory Findings Report

**BEFORE any implementation, you MUST output this report:**

```markdown
## Current Standards & Patterns Identified

### System Architecture Understanding
- Data flow: [How data flows for this feature type]
- Layer responsibilities: [Which layer owns what logic]
- Established pattern: [How similar features are implemented]
- Confirmed: NO new system design or architectural patterns needed

### Existing Code to Reuse
- [Hook: useXxx in hooks/useXxx.js - does Y]
- [Utility: buildApiParams in utils.js - handles Z]
- [Component: FilterPanel - can be extended for this]
- [Patterns that MUST be followed]

### Design System / Approach
- Architecture: [e.g., "Page owns logic, components are stateless"]
- Naming: [e.g., "camelCase for functions, PascalCase for components"]
- File org: [e.g., "hooks in /hooks, utils in /utils"]

### Standards from CLAUDE.md
- [Rule: Use SaleType enum, not string literals]
- [Rule: Use buildApiParams for all API calls]
- [Rule: Charts accept saleType as prop]

### Recent Changes That Inform This Task
- Commit abc123: "refactor: consolidated filters" - must use FilterContext
- Commit def456: "fix: added abort signals" - must include signal handling

### Production-Grade Validation
- [ ] Solution works long-term (2+ years, 10x scale)
- [ ] No band-aid fixes or special-casing
- [ ] Solves the CLASS of problem, not just this instance
- [ ] Another developer can understand and maintain this

### Standardization Validation
- Reference implementation: [e.g., "TimeTrendChart.jsx"]
- [ ] Matches the reference pattern exactly
- [ ] No deviation from sibling implementations
- [ ] Same hooks, same state handling, same structure
```

**Implementation proposals without this report are INVALID.**

## Part 4: Reuse-First Rule

**NEVER write new code when existing solutions exist.**

### Before Writing New Code, Ask:

| Question | If YES |
|----------|--------|
| Does this logic exist elsewhere? | Import and use it |
| Can existing code be extended? | Extend, don't recreate |
| Is there a shared utility? | Use the utility |
| Is there an established pattern? | Follow that pattern exactly |

## Part 5: Production-Grade Only (No Band-Aids)

**Every solution MUST be long-term, scalable, consistent, and maintainable.**

### FORBIDDEN: Band-Aid Fixes

| Band-Aid (FORBIDDEN) | Production-Grade (REQUIRED) |
|----------------------|----------------------------|
| `if (specificEdgeCase)` hack | Fix the root cause |
| Hardcoded values for "just this case" | Use constants/config |
| Duplicating code "to be safe" | Reuse existing solution |
| Quick workaround that "works for now" | Proper architectural solution |
| Special-casing instead of generalizing | Extend existing patterns |
| `// TODO: fix later` | Fix it now or don't merge |

### Ask Yourself:
- Would I be embarrassed if a senior engineer reviewed this?
- Does this solve the CLASS of problem or just THIS instance?
- Will this create tech debt?

**If any answer is concerning → redesign the solution.**

## Part 6: Standardization Rule

**All charts, components, and logic MUST follow the same standardized patterns.**

### The Uniformity Principle

| Element | Must Match |
|---------|------------|
| **Charts** | Same structure, hooks, state handling, error/loading patterns |
| **Data fetching** | `useAbortableQuery` + `buildApiParams` + adapters |
| **State management** | Context patterns (e.g., `PowerBIFilterContext`) |
| **Component structure** | Page → Container → Pure Component |

### Find the Reference First

```bash
# Find similar implementations
ls frontend/src/components/powerbi/

# Pick ONE as canonical reference
cat frontend/src/components/powerbi/TimeTrendChart.jsx

# Your implementation MUST match this exactly
```

### FORBIDDEN Deviations

- Chart A uses one pattern, Chart B uses different pattern
- Component X fetches data differently than Component Y
- "Creative" solutions that differ from established patterns
- One-off implementations that don't match siblings

### Deviation Requires Explicit Approval

1. Document WHY standard pattern doesn't work
2. Get explicit user approval before deviating
3. Consider updating the standard instead

**Default: Match existing patterns exactly. No creativity. No variation.**

## Part 7: Forbidden Patterns

### Starting Without System Architecture Understanding
```
User: "Add a new feature"
Assistant: "I'll create a new state management system..."  <- INVALID

# REQUIRED:
Assistant: "Let me first understand the system architecture...
[Reads docs, understands existing patterns]
The established pattern uses PowerBIFilterContext for state.
I will use that, not create new state management."
```

### Starting Without Findings Report
```
User: "Add a new filter"
Assistant: "I'll add a new filter component..."  <- INVALID

# REQUIRED:
Assistant: "Let me first review the codebase and provide my findings report..."
[Outputs Mandatory Findings Report]
"Based on my findings, here's my implementation plan..."
```

### Introducing New System Design
```
# Existing: useAbortableQuery + adapters for data fetching
# Your code: Creates new fetch pattern <- WRONG
# Correct: Use useAbortableQuery + adapters
```

### Band-Aid Fix
```
# Problem: Chart shows wrong data for district D01
# Band-aid: if (district === 'D01') { specialLogic() } <- WRONG
# Correct: Fix the root cause in data flow
```

### Creating New When Existing Exists
```
# Existing: buildApiParams handles all API parameter construction
# Your code: Creates new param builder <- WRONG
# Correct: Use or extend buildApiParams
```

### Deviating From Sibling Implementations
```
# Existing charts: All use useAbortableQuery + buildApiParams + ChartSlot
# Your chart: Uses different hooks/structure <- WRONG
# Correct: Match the exact pattern of existing charts

# Find reference:
ls frontend/src/components/powerbi/
cat frontend/src/components/powerbi/TimeTrendChart.jsx
# Match this EXACTLY
```

## Part 8: Correct Patterns

### Full Context-First Flow
```
Assistant: "Before implementing, let me understand the system and gather context:

[Reads architecture docs]
[Runs git log, searches for existing code]

## Current Standards & Patterns Identified

### System Architecture Understanding
- Data flow: Page → usePowerBIFilters → buildApiParams → API → adapter → chart
- Layer responsibilities: Page owns business logic, components are stateless
- Established pattern: All filters go through PowerBIFilterContext
- Confirmed: NO new system design needed - will use existing patterns

### Existing Code to Reuse
- useAbortableQuery in hooks/ - handles API calls with abort signals
- buildApiParams in utils.js - constructs API parameters
- PowerBIFilterContext - manages all filter state

### Design System / Approach
- Architecture: Page owns business logic via props
- All charts accept saleType as prop, never hardcode
- Filter changes flow through PowerBIFilterContext

### Standards from CLAUDE.md
- Use SaleType enum from schemas/apiContract
- Use buildApiParams for all API calls
- Charts handle 4 states: loading, error, empty, success

### Recent Changes That Inform This Task
- Commit 8f62aef: 'feat(perf): Add per-chart timing' - timing pattern to follow
- Commit b4507b1: 'fix(filters): Send timeframe ID' - filter param pattern

### Production-Grade Validation
- [x] Solution works long-term (uses established patterns)
- [x] No band-aid fixes (extends existing utilities)
- [x] Solves the CLASS of problem (reusable approach)
- [x] Another developer can understand (follows documented patterns)

Based on these findings, I'll implement by:
1. Reusing useAbortableQuery for data fetching
2. Using buildApiParams to construct params
3. Following the existing PowerBIFilterContext pattern
4. No new system design - working within established architecture
..."
```

## Checklist Before Proceeding to Implementation

**System Architecture:**
- [ ] Read architecture docs (architecture.md, frontend.md, backend.md)
- [ ] Understand how this feature type is already implemented
- [ ] Confirmed NO new system design or patterns needed

**Context Gathering:**
- [ ] Ran git log for affected file areas
- [ ] Searched for existing hooks/utils/components to reuse

**Mandatory Findings Report:**
- [ ] Output the complete findings report
- [ ] Documented system architecture understanding
- [ ] Listed all existing code to reuse
- [ ] Identified design system/approach
- [ ] Listed relevant CLAUDE.md standards
- [ ] Referenced recent commits that inform this task

**Reuse-First Validation:**
- [ ] Confirmed NO new code where existing solutions work
- [ ] Confirmed plan follows established patterns

**Production-Grade Validation:**
- [ ] Solution works long-term (2+ years, 10x scale)
- [ ] No band-aid fixes or special-casing
- [ ] Solves the CLASS of problem, not just this instance
- [ ] Another developer can understand and maintain this

**Standardization Validation:**
- [ ] Identified reference implementation (existing similar chart/component)
- [ ] Matches the reference pattern exactly
- [ ] No deviation from sibling implementations
- [ ] Same hooks, same state handling, same structure as siblings
