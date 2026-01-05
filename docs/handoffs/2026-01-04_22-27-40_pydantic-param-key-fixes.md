---
date: 2026-01-04T22:27:40+08:00
branch: runbooks
commit: 29b1be7
status: ready_for_review
---

# Handoff: Pydantic Param Key Mismatches Fixed

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Fix to_list() 500 errors | ✅ Complete | Now handles both string and list input |
| Fix KPI filter key mismatches | ✅ Complete | district→districts, etc. |
| Fix trends segment filter | ✅ Complete | segment→segments |
| Standardize plural naming convention | ✅ Complete | All models/routes aligned |

## Critical References

- `REPO_MAP.md` Section 9 - "Silent Param Drop" incident (Jan 2, 2026)
- `backend/utils/normalize.py` - Centralized input normalization
- `backend/api/contracts/pydantic_models/` - All Pydantic param models

## Recent Changes

```
backend/utils/normalize.py:277-342 - to_list() now accepts Union[str, list]
backend/routes/analytics/kpi_v2.py:89-101,162-173 - Use plural param keys
backend/routes/analytics/trends.py:60-62 - Use segments (plural)
backend/routes/analytics/charts.py:295-314 - Use plural param keys
backend/routes/projects.py:76-80 - Use segments (plural)
backend/routes/upcoming_launches.py:63-69 - Use plural param keys
backend/api/contracts/pydantic_models/charts.py:71-74 - segment→segments
backend/api/contracts/pydantic_models/trends.py:56-59 - segment→segments
backend/api/contracts/pydantic_models/projects.py:30-33 - segment→segments
backend/api/contracts/pydantic_models/upcoming_launches.py:20-28 - district→districts, market_segment→segments
```

## Learnings

1. **Pydantic validation_alias creates key mismatch potential**
   - What: `validation_alias='district'` accepts singular input but stores as `districts`
   - Why it matters: Routes must read the FIELD NAME not the alias
   - Pattern: `params.get('districts')` not `params.get('district')`

2. **to_list() must handle both string and list**
   - What: Pydantic WrapList wraps input in list without splitting CSV
   - Why it matters: `to_list(["2,3"])` was crashing with AttributeError
   - Fix: Check `isinstance(value, list)` before calling `.split()`

3. **Canonical naming convention established**
   - What: Always use plural names (districts, bedrooms, segments)
   - Why it matters: Eliminates key mismatch bugs permanently
   - Pattern: `WrapList = Field(validation_alias='singular')`

## Artifacts

Files modified:
- `backend/utils/normalize.py` - Added list input handling to to_list()
- `backend/routes/analytics/kpi_v2.py` - Fixed param key reads
- `backend/routes/analytics/trends.py` - Fixed segment key
- `backend/routes/analytics/charts.py` - Fixed multiple param keys
- `backend/routes/projects.py` - Fixed segment key
- `backend/routes/upcoming_launches.py` - Fixed param keys
- `backend/api/contracts/pydantic_models/charts.py` - segment→segments
- `backend/api/contracts/pydantic_models/trends.py` - segment→segments
- `backend/api/contracts/pydantic_models/projects.py` - segment→segments
- `backend/api/contracts/pydantic_models/upcoming_launches.py` - Pluralized fields

## Action Items & Next Steps

1. **Merge to main**
   - [ ] Create PR from runbooks → main
   - [ ] Run full test suite
   - Blocked by: Nothing - ready for review

2. **Document the convention** (optional)
   - [ ] Add naming convention to CLAUDE.md or docs/backend.md
   - Pattern: Plural field names + validation_alias for singular input

## Blockers & Open Questions

None - all P0/P1 issues resolved.

## Context for Resume

Key things the next agent should know:

- **The root cause was dual-path input**: Frontend sends singular params via query string OR JSON body. Pydantic normalizes to plural field names. Routes were reading the wrong keys.

- **Convention is now: Always Plural**
  ```python
  # Model:
  segments: WrapList = Field(validation_alias='segment')

  # Route:
  segments = params.get('segments')  # Always plural
  ```

- **to_list() is defensive**: It handles strings, lists, lists containing CSV strings, whitespace, empty strings. This matches the old `_expand_csv_list` behavior that was lost during consolidation.

- **Some endpoints intentionally use singular**: `BudgetHeatmapParams.bedroom` is a single int, not a list. These are correct as singular.

## Commands to Run

```bash
# Verify current state
cd /Users/changyuesin/Desktop/sgpropertytrend
git status
git log --oneline -5

# Run tests
cd backend && pytest tests/test_normalize.py tests/test_api_contract.py -v

# Test the fixed endpoints manually
curl "http://localhost:5001/api/kpi-summary-v2?district=D09&bedroom=2"
curl "http://localhost:5001/api/new-vs-resale?segment=CCR"
```
