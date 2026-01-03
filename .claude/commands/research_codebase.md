---
description: Document codebase as-is with parallel research agents
---

# Research Codebase

You are tasked with conducting comprehensive research across the codebase to answer user questions by spawning parallel sub-agents and synthesizing findings.

## CRITICAL: Document, Don't Critique

Your job is to document the codebase AS-IS:
- DO NOT suggest improvements or changes unless explicitly asked
- DO NOT critique the implementation or identify problems
- DO NOT recommend refactoring or optimization
- ONLY describe what exists, where it exists, and how it works
- You are creating a technical map of the existing system

## Initial Response

When this command is invoked:
```
I'm ready to research the codebase. Please provide your research question or area of interest, and I'll analyze it thoroughly by exploring relevant components and connections.

Example questions:
- "How does the filter system work?"
- "Where are KPI calculations performed?"
- "What's the data flow for chart rendering?"
```

Then wait for the user's research query.

## Process Steps

### Step 1: Read Critical Context First

Before any research:
1. **Read REPO_MAP.md** - Navigation guide for the codebase
2. **Read any files the user specifically mentions**
3. Use Read tool WITHOUT limit/offset to read entire files

### Step 2: Decompose the Research Question

- Break down the query into composable research areas
- Identify specific components, patterns, or concepts to investigate
- Create a research plan using TodoWrite
- Consider which directories and files are relevant

### Step 3: Spawn Parallel Research Tasks

Create multiple Task agents to research different aspects:

**For codebase research:**
```
Task 1 - Location Search:
Use codebase-locator to find files related to [topic]:
1. Find relevant components/services
2. Identify key directories
3. List related files
Return: File list with brief descriptions
```

```
Task 2 - Implementation Analysis:
Use codebase-analyzer to understand how [specific component] works:
1. Trace data flow
2. Identify key functions
3. Document patterns used
Return: Implementation details with file:line references
```

```
Task 3 - Pattern Discovery:
Use codebase-pattern-finder to find similar implementations:
1. How is this done elsewhere?
2. What conventions are followed?
Return: Pattern examples with file:line references
```

**For documentation search:**
```
Task 4 - Documentation Search:
Use thoughts-locator to find related documentation:
1. Check docs/ directory
2. Check REPO_MAP.md for relevant sections
3. Check .claude/skills/ for guardrails
Return: Relevant documentation list
```

### Step 4: Wait and Synthesize

- **WAIT for ALL sub-agent tasks to complete**
- Compile findings from all agents
- Connect findings across different components
- Include specific file paths and line numbers

### Step 5: Generate Research Report

Structure the output as:

```markdown
# Research: [User's Question]

**Date**: [Current date]
**Branch**: [Current branch]

## Summary

[High-level answer to the user's question - 2-3 paragraphs]

## Detailed Findings

### [Component/Area 1]

**Location**: `path/to/files/`

**Key Files**:
- `file1.py:123` - [What it does]
- `file2.jsx:45` - [What it does]

**How It Works**:
[Description of implementation]

**Data Flow**:
```
[Input] → [Process] → [Output]
```

### [Component/Area 2]

[Similar structure...]

## Code References

| File | Lines | Purpose |
|------|-------|---------|
| `path/to/file.py` | 100-150 | [Description] |
| `path/to/file.jsx` | 45-80 | [Description] |

## Architecture Patterns

[Patterns observed in the codebase relevant to this topic]

Per REPO_MAP.md:
- [Relevant pattern reference]
- [Another pattern reference]

## Related Documentation

- `REPO_MAP.md` Section [X] - [Topic]
- `docs/[file].md` - [Relevance]
- `.claude/skills/[skill]/` - [Guardrails]

## How Components Connect

```
[Diagram or description of how pieces fit together]
```

## Open Questions

[Any areas that weren't fully resolved or need clarification]
```

### Step 6: Offer Follow-up

```
Is there anything specific you'd like me to explore further? I can:
- Dive deeper into [specific component]
- Trace [specific data flow]
- Find more examples of [pattern]
```

## Important Guidelines

1. **Documentation Only**:
   - Describe what exists
   - Never evaluate or critique
   - Skip recommendations unless asked

2. **Be Thorough**:
   - Use parallel agents for efficiency
   - Read files completely
   - Include specific file:line references

3. **Use Project Knowledge**:
   - Always reference REPO_MAP.md
   - Know the architecture layers (Section 2)
   - Know critical files (Section 4)
   - Know patterns to follow (Section 6)

4. **Synthesize Effectively**:
   - Wait for all agents to complete
   - Connect findings across components
   - Present a coherent picture

## Project-Specific Context

When researching this codebase, know that:

**Backend Structure**:
- Routes in `backend/routes/`
- Services in `backend/services/`
- Contracts in `backend/api/contracts/`
- Main SQL logic in `dashboard_service.py`

**Frontend Structure**:
- Pages in `frontend/src/pages/`
- Components in `frontend/src/components/powerbi/`
- Adapters in `frontend/src/adapters/`
- State in `frontend/src/stores/filterStore.js`
- Data fetching in `frontend/src/hooks/useAppQuery.js`

**Key Patterns**:
- @api_contract decorator for API validation
- useAppQuery for all data fetching
- Zustand filterStore for filter state
- Adapters only transform shape, no logic

## Example Research Flow

```
User: /research_codebase
Assistant: I'm ready to research the codebase. What would you like to know?

User: How does the time granularity toggle work?
Assistant: [Spawns parallel research tasks]
           [Waits for completion]
           [Presents synthesized findings with file:line references]
```
