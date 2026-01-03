---
description: Implement technical plans from docs/plans/ with verification
---

# Implement Plan

You are tasked with implementing an approved technical plan from `docs/plans/`. These plans contain phases with specific changes and success criteria.

## Getting Started

When given a plan path:
1. Read the plan completely and check for existing checkmarks (- [x])
2. Read `REPO_MAP.md` for navigation and pattern references
3. Read all files mentioned in the plan FULLY
4. Create a todo list to track your progress
5. Start implementing if you understand what needs to be done

If no plan path provided:
```
I'll help you implement a plan.

Available plans:
```
Then run: `ls -lt docs/plans/ | head -10`

## Implementation Philosophy

Plans are carefully designed, but reality can be messy. Your job is to:
- Follow the plan's intent while adapting to what you find
- Implement each phase fully before moving to the next
- Verify your work makes sense in the broader codebase context
- Update checkboxes in the plan as you complete sections

## Following Patterns

**CRITICAL**: Before implementing, always check REPO_MAP.md Section 6 for pattern references:

| Task | Copy This Pattern |
|------|-------------------|
| New chart | `TimeTrendChart.jsx` |
| New adapter | `timeSeries.js` |
| New service function | `dashboard_service.py:get_aggregated_data()` |
| New route | `routes/analytics/aggregate.py` |
| New page | `MacroOverview.jsx` |

**The Golden Rule** (REPO_MAP.md Section 7):
> When in doubt: find similar code, copy the pattern exactly, change only what's necessary.

## When Things Don't Match

If you encounter a mismatch between plan and reality:

1. **STOP and think** about why the plan can't be followed
2. **Present the issue clearly**:
   ```
   Issue in Phase [N]:
   Expected: [what the plan says]
   Found: [actual situation]
   Why this matters: [explanation]

   Options:
   A. [Adaptation approach]
   B. [Alternative approach]

   How should I proceed?
   ```

## Verification Approach

After implementing each phase:

1. **Run automated verification**:
   ```bash
   # Backend
   pytest backend/tests/ -v
   cd backend && python -m black --check .

   # Frontend
   cd frontend && npm run lint
   cd frontend && npm run typecheck
   cd frontend && npm run test
   ```

2. **Fix any issues before proceeding**

3. **Update plan checkboxes** using Edit tool

4. **Pause for manual verification**:
   ```
   Phase [N] Complete - Ready for Manual Verification

   Automated verification passed:
   - ✓ Backend tests: X passed
   - ✓ Frontend lint: Clean
   - ✓ Frontend typecheck: Clean
   - ✓ Frontend tests: X passed

   Please perform manual verification:
   - [ ] [Manual step from plan]
   - [ ] [Another manual step]

   Let me know when complete so I can proceed to Phase [N+1].
   ```

## Historical Incident Check

Before implementing, verify the plan avoids known issues (REPO_MAP.md Section 9):

- [ ] **Layer-Upon-Layer**: Not creating custom hooks when useAppQuery/Zustand work
- [ ] **Silent Param Drop**: Frontend params match backend schema
- [ ] **Undeclared Response Fields**: API response matches contract
- [ ] **CSV Deletion**: Not mutating any data files
- [ ] **Boot Deadlock**: Abort handling resets state properly

If the plan violates any of these, STOP and discuss.

## Implementation Checklist

For each phase:

1. [ ] Read all files that will be modified
2. [ ] Understand existing patterns in those files
3. [ ] Make changes following plan specifications
4. [ ] Run automated verification
5. [ ] Update plan checkboxes
6. [ ] Wait for manual verification (unless told to continue)

## If You Get Stuck

When something isn't working as expected:

1. First, make sure you've read and understood all relevant code
2. Consider if the codebase has evolved since the plan was written
3. Check if a similar feature exists that you can model after
4. Present the mismatch clearly and ask for guidance

Use sub-tasks sparingly - mainly for targeted debugging or exploring unfamiliar territory.

## Resuming Work

If the plan has existing checkmarks:
- Trust that completed work is done
- Pick up from the first unchecked item
- Verify previous work only if something seems off

## Example Flow

```
User: /implement_plan docs/plans/2026-01-03-add-histogram-chart.md