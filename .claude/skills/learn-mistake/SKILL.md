---
name: learn-mistake
description: Record a mistake or bad recommendation to REPO_MAP.md Historical Incidents. Use when Claude's suggestion caused a bug, broke something, or was wrong. Creates persistent memory to avoid repeating the same mistake.
---

# Learn Mistake Skill

Captures mistakes and bad recommendations as Historical Incidents in `REPO_MAP.md §9`.

**Trigger:** `/learn-mistake`, "that was wrong", "add this to landmines", "remember this mistake"

---

## Purpose

When Claude makes a bad recommendation that:
- Breaks production
- Causes a bug
- Is architecturally wrong
- Violates a pattern that wasn't documented

This skill captures the lesson so it's never repeated.

---

## Workflow

### Step 1: Gather Information

Ask the user (if not already provided):

```
I'll record this mistake to prevent it from happening again.

Please provide:
1. **What did I recommend?** (the bad suggestion)
2. **What broke?** (the symptom/impact)
3. **Why was it wrong?** (root cause)
4. **What's the correct approach?** (the fix)
```

### Step 2: Format the Incident

Use this exact format to match existing incidents:

```markdown
### [Incident Name] ([Month] [Day], [Year])

**What happened:** [Claude recommended X, which caused Y]

**Impact:** [What broke, who was affected, how it manifested]

**Why it was wrong:** [Root cause - what was misunderstood or overlooked]

**Fix:** [What the correct approach is]

**Lesson:** [One-line takeaway that can be checked in future reviews]
```

### Step 3: Append to REPO_MAP.md

1. Read `REPO_MAP.md`
2. Find `## 9. Historical Incidents (Landmines)` section
3. Append new incident at the END of section (before next `##` or EOF)
4. Use Edit tool to insert

### Step 4: Update Risk-Agent Awareness

If the mistake relates to a specific failure mode, consider adding it to:
- `risk-agent.md` detection patterns
- `CLAUDE.md` relevant section
- Specific guardrail skill if applicable

### Step 5: Confirm

```markdown
## Mistake Recorded

**Added to:** `REPO_MAP.md §9 Historical Incidents`

**Title:** [Incident Name] ([Date])

**Lesson:** [The one-liner]

**Also updated:** [Any other files if applicable]

This mistake will now be checked by:
- `/review` workflow (risk-agent reads historical incidents)
- Future recommendations (context from REPO_MAP.md)
```

---

## Example

**User says:**
> "You told me to use `f-strings` for SQL and it caused SQL injection. Add this to landmines."

**Skill outputs:**

```markdown
### SQL F-String Incident (Jan 3, 2026)

**What happened:** Claude recommended using Python f-strings to build SQL queries for readability.

**Impact:** SQL injection vulnerability. User-controlled input could execute arbitrary SQL.

**Why it was wrong:** F-strings interpolate values directly into SQL string. Should use parameterized queries (`:param` bindings) which escape values.

**Fix:** Always use `:param` style bindings:
```python
# WRONG (vulnerable)
db.execute(f"SELECT * FROM users WHERE id = {user_id}")

# CORRECT (safe)
db.execute(text("SELECT * FROM users WHERE id = :id"), {"id": user_id})
```

**Lesson:** Never use f-strings for SQL. Always use `:param` bindings. This is already in CLAUDE.md §3.1 but was overlooked.
```

---

## Integration Points

| System | How It Uses This |
|--------|------------------|
| `/review` | risk-agent checks REPO_MAP.md §9 before approving |
| `risk-agent` | "Have I been wrong about this before?" check |
| `CLAUDE.md` | Referenced as historical context |
| Future sessions | Loaded as project context |

---

## Quick Reference

```
/learn-mistake

GATHER:
1. What did Claude recommend?
2. What broke?
3. Why was it wrong?
4. What's the fix?

FORMAT:
### [Name] ([Date])
**What happened:** ...
**Impact:** ...
**Why it was wrong:** ...
**Fix:** ...
**Lesson:** ...

APPEND TO:
REPO_MAP.md §9 Historical Incidents

CONFIRM:
Show what was added + where
```
