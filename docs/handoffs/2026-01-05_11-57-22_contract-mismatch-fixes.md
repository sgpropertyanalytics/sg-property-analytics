---
date: 2026-01-05T11:57:22+08:00
branch: codexfix
commit: 0d0f28d
status: in_progress
---

# Handoff: Contract Mismatch Fixes

## Task(s)

| Task | Status | Notes |
|------|--------|-------|
| Fix KPI contract mismatch | ✅ Complete | Already fixed in prior commit (56510b1) |
| Fix charts contract mismatches | ✅ Complete | Added data_fields for projects_by_district, price_projects_by_district |
| Fix transactions contract mismatches | ✅ Complete | Added Pydantic response models with Field aliases |
| Fix dashboard meta casing | ⏳ Planned | serialize_dashboard_response() doesn't normalize snake_case → camelCase |
| Regenerate frontend apiContract.json | ⏳ Planned | After all backend fixes |

## Critical References

- `CLAUDE.md` - Core invariants, especially #13 "Check Both Sides Before Changing Contracts"
- `REPO_MAP.md` - File map and historical incidents
- `backend/api/contracts/contract_schema.py` - Existing serializers pattern (serialize_aggregate_response)

## Recent Changes

```
backend/api/contracts/pydantic_models/transactions.py:26-135 - Added PriceGrowthItem, PriceGrowthResponse, SegmentSummaryItem, SegmentSummaryResponse models
backend/api/contracts/schemas/charts.py:36-52 - Added data_fields for projects_by_district
backend/api/contracts/schemas/charts.py:69-89 - Added data_fields for price_projects_by_district
backend/api/contracts/schemas/transactions.py:27-69 - Updated PRICE_GROWTH_RESPONSE_SCHEMA with correct fields
backend/api/contracts/schemas/transactions.py:86-114 - Updated SEGMENTS_RESPONSE_SCHEMA with correct fields
backend/routes/analytics/transactions.py:98,114 - Use Pydantic response models for serialization
frontend/src/schemas/apiContract/transactionFields.js:38-50 - Updated TxnField constants (removed PRICE, added TXN_SEQUENCE)
```

## Learnings

1. **Pydantic Response Models with Field Aliases**
   - What: Used `Field(alias='camelCase', validation_alias='snake_case')` pattern
   - Why it matters: Backend uses Python snake_case, frontend expects JS camelCase, Pydantic bridges both
   - File reference: `backend/api/contracts/pydantic_models/transactions.py:41-52`

2. **Frontend TxnField.PRICE Was Unused**
   - What: The `price` field was in contract but never returned by `/transactions/price-growth` endpoint
   - Why it matters: This endpoint returns PSF growth metrics, not absolute prices
   - File reference: `frontend/src/components/powerbi/PriceGrowthChart.jsx` uses TxnField constants correctly

3. **Contract Schema vs Actual Response Pattern**
   - What: Many contracts had empty `data_fields={}` while routes returned structured objects
   - Why it matters: Contract validation can't detect drift without accurate field definitions
   - File reference: `backend/api/contracts/schemas/charts.py:36-41` (before fix)

## Artifacts

Files created or significantly modified:
- `backend/api/contracts/pydantic_models/transactions.py` - Added 4 new response models
- `backend/api/contracts/schemas/charts.py` - Fixed 2 contract schemas
- `backend/api/contracts/schemas/transactions.py` - Aligned 2 contract schemas
- `backend/routes/analytics/transactions.py` - Updated 2 routes to use Pydantic serialization
- `frontend/src/schemas/apiContract/transactionFields.js` - Updated field constants

## Action Items & Next Steps

1. **Fix Dashboard Meta Casing**
   - [ ] Add meta normalization to `serialize_dashboard_response()` in `contract_schema.py`
   - [ ] Match pattern from `serialize_aggregate_response()` lines 654-663
   - [ ] Fields to normalize: `cache_hit` → `cacheHit`, `filters_applied` → `filtersApplied`, `total_records_matched` → `totalRecordsMatched`
   - Blocked by: Nothing

2. **Regenerate Frontend Contract JSON**
   - [ ] Run contract generation script to update `frontend/src/generated/apiContract.json`
   - [ ] Verify frontend builds without warnings
   - Depends on: All backend contract fixes complete

3. **Verify End-to-End**
   - [ ] Test `/transactions/price-growth` returns camelCase
   - [ ] Test `/transactions/price-growth/segments` returns camelCase
   - [ ] Test PriceGrowthChart renders correctly in ExitRisk page

## Blockers & Open Questions

- **Frontend consuming snake_case directly?**: Need to verify if frontend was working before by accessing snake_case fields directly (e.g., `txn.project_name` instead of `txn.project`). If so, this fix is a breaking change that requires frontend update.

## Context for Resume

Key things the next agent should know:
- This worktree is at `~/worktrees/sgpropertytrend/pydantic` (branch: codexfix)
- The pattern for fixing contract mismatches is: Create Pydantic response model → Use in route → Update contract schema
- The original mismatch report identified 5 P1 issues; charts (2) and transactions (2) are fixed, dashboard (1) remains
- Frontend `TxnField` constants validate against `apiContract.json` at runtime in dev mode

## Commands to Run

```bash
# Navigate to worktree
cd ~/worktrees/sgpropertytrend/pydantic

# Verify current state
git status
git log --oneline -3

# Test Python imports
python -c "from api.contracts.pydantic_models.transactions import PriceGrowthResponse; print('OK')"

# Test serialization
python -c "
from api.contracts.pydantic_models.transactions import PriceGrowthItem
sample = {'id': 1, 'project_name': 'TEST', 'bedroom_count': 2, 'floor_level': 'Mid', 'transaction_date': '2024-01-01', 'psf': 1500, 'txn_sequence': 1, 'cumulative_growth_pct': None, 'incremental_growth_pct': None, 'days_since_prev': None, 'annualized_growth_pct': None}
print(PriceGrowthItem.model_validate(sample).model_dump(by_alias=True))
"

# Run backend tests (if DATABASE_URL configured)
cd backend && pytest tests/test_api_contract.py -v

# Frontend lint check
cd frontend && npm run lint
```
