# Param Flow Integrity Refactor Plan
## Summary
Eliminate param identity drift bugs by adopting Pydantic for validation, standardizing on `timeframe` as the canonical name, and adding comprehensive param flow integrity tests.
**Key Principle: Don't delete anything until new code is proven identical to old code.**
**User Decisions:**
- Canonical name: `timeframe` (keep current)
- Validation: Adopt Pydantic (full migration)
- Compatibility: Breaking changes OK
- Scope: Full-stack
---
## Phase 1: Add Pydantic Foundation (No Deletions)
### 1.1 Add Pydantic Dependency
**Modify:** `/backend/requirements.txt`
```
pydantic>=2.5.0
```
### 1.2 Create Feature Flag
**Create:** `/backend/config/feature_flags.py`
```python
import os
USE_PYDANTIC_VALIDATION = os.getenv("USE_PYDANTIC_VALIDATION", "false").lower() == "true"
PYDANTIC_PARALLEL_MODE = os.getenv("PYDANTIC_PARALLEL_MODE", "true").lower() == "true"
```
### 1.3 Create Pydantic Base Models
**Create:** `/backend/api/contracts/pydantic_models/__init__.py`
**Create:** `/backend/api/contracts/pydantic_models/base.py`
```python
from pydantic import BaseModel, ConfigDict
class BaseParamsModel(BaseModel):
    model_config = ConfigDict(
        frozen=True,  # Immutable after normalization
        str_strip_whitespace=True,
        populate_by_name=True,
        extra='ignore',
    )
```
### 1.4 Create Shared Types & Validators
**Create:** `/backend/api/contracts/pydantic_models/types.py`
- `CommaList` - "a,b,c" → ["a", "b", "c"]
- `DistrictList` - "9,d01" → ["D09", "D01"]
- Date coercion validators
---
## Phase 2: Migrate ONE Endpoint with Parallel Validation
### 2.1 Create Aggregate Pydantic Model
**Create:** `/backend/api/contracts/pydantic_models/aggregate.py`
Key features:
- `model_validator(mode='after')` for timeframe → dates resolution
- Field aliases: `saleType` → `sale_type`, `dateFrom` → `date_from`
- Must produce IDENTICAL output to `normalize_params()`
### 2.2 Add Parallel Validation Mode to Wrapper
**Modify:** `/backend/api/contracts/wrapper.py`
```python
from config.feature_flags import USE_PYDANTIC_VALIDATION, PYDANTIC_PARALLEL_MODE
def api_contract(endpoint_name: str):
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            raw_params = _collect_raw_params()
            # ALWAYS run old validation (until migration complete)
            old_result = normalize_params(raw_params, contract.param_schema)
            # If Pydantic model exists, run it too
            if hasattr(contract, 'pydantic_model'):
                try:
                    pydantic_result = contract.pydantic_model(**raw_params).model_dump()
                    if PYDANTIC_PARALLEL_MODE:
                        # Compare results, log any differences
                        _compare_and_log(endpoint_name, old_result, pydantic_result)
                    if USE_PYDANTIC_VALIDATION:
                        g.normalized_params = pydantic_result
                    else:
                        g.normalized_params = old_result
                except Exception as e:
                    logger.error(f"Pydantic validation failed: {e}")
                    g.normalized_params = old_result  # Fallback to old
            else:
                g.normalized_params = old_result
            return fn(*args, **kwargs)
        return wrapper
    return decorator
```
### 2.3 Add Comparison Logger
**Create:** `/backend/api/contracts/pydantic_comparison.py`
```python
def _compare_and_log(endpoint: str, old: dict, new: dict) -> None:
    """Compare old and new normalization results, log differences."""
    differences = []
    all_keys = set(old.keys()) | set(new.keys())
    for key in all_keys:
        old_val = old.get(key)
        new_val = new.get(key)
        if old_val != new_val:
            differences.append({
                "key": key,
                "old": old_val,
                "new": new_val,
            })
    if differences:
        logger.warning(f"PYDANTIC_DIFF [{endpoint}]: {json.dumps(differences)}")
```
### 2.4 Smoke Test /aggregate
**Run after implementation:**
```bash
# With parallel mode (default) - logs differences but uses old result
PYDANTIC_PARALLEL_MODE=true pytest tests/contracts/test_endpoint_smoke.py -k aggregate -v
# Verify no differences logged
grep "PYDANTIC_DIFF" logs/app.log
```
---
## Phase 3: Cache Key Equality Tests
### 3.1 Create Cache Key Comparison Test
**Create:** `/backend/tests/test_cache_key_parity.py`
```python
"""
CRITICAL: Verify old and new validation produce identical cache keys.
This is the bug we're preventing.
"""
import pytest
from api.contracts.normalize import normalize_params
from api.contracts.pydantic_models.aggregate import AggregateParams
from api.contracts.schemas.aggregate import AGGREGATE_PARAM_SCHEMA
from utils.cache_key import build_json_cache_key
@pytest.mark.parametrize("raw_params", [
    {"timeframe": "M6"},
    {"timeframe": "Y1"},
    {"timeframe": "all"},
    {"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    {"timeframe": "M6", "district": "D01,D09"},
    {"saleType": "Resale", "bedroom": "2,3"},
    {},  # Empty params (should default to Y1)
])
def test_cache_key_identical_old_vs_new(raw_params):
    """Cache key from old normalize_params == cache key from Pydantic."""
    old_result = normalize_params(raw_params.copy(), AGGREGATE_PARAM_SCHEMA)
    new_result = AggregateParams(**raw_params.copy()).model_dump()
    old_cache_key = build_json_cache_key("aggregate", old_result)
    new_cache_key = build_json_cache_key("aggregate", new_result)
    assert old_cache_key == new_cache_key, (
        f"Cache key mismatch!\n"
        f"  Old: {old_cache_key}\n"
        f"  New: {new_cache_key}\n"
        f"  Params: {raw_params}"
    )
```
### 3.2 Run Cache Key Tests
```bash
pytest tests/test_cache_key_parity.py -v
# ALL MUST PASS before proceeding
```
---
## Phase 4: Migrate Remaining Endpoints (Keep Old Code)
For each endpoint, follow this pattern:
### 4.1 Create Pydantic Model
**Create:** `pydantic_models/{endpoint}.py`
### 4.2 Register in Contract
**Modify:** `/backend/api/contracts/schemas/{endpoint}.py`
Add `pydantic_model = {EndpointParams}` to contract
### 4.3 Add Cache Key Parity Test
**Modify:** `/backend/tests/test_cache_key_parity.py`
Add parametrized tests for endpoint
### 4.4 Run Smoke Test
```bash
PYDANTIC_PARALLEL_MODE=true pytest tests/contracts/test_endpoint_smoke.py -k {endpoint} -v
grep "PYDANTIC_DIFF" logs/app.log  # Should be empty
```
### Endpoints to Migrate
| Endpoint | Model File | Priority |
|----------|------------|----------|
| `/aggregate` | `aggregate.py` | Done in Phase 2 |
| `/kpi-summary-v2` | `kpi_summary.py` | High |
| `/dashboard` | `dashboard.py` | High |
| `/transactions/list` | `transactions.py` | High |
| `/filter-options` | `filter_options.py` | Medium |
| `/insights/*` | `insights.py` | Medium |
| Others | As needed | Low |
---
## Phase 5: Full Regression Pass
### 5.1 Run Complete Test Suite
```bash
# Backend
cd backend
pytest tests/ -v --tb=short
# Contract strict mode
CONTRACT_MODE=strict pytest tests/contracts/test_all_endpoints_strict.py -v
# Regression snapshots
pytest tests/test_regression_snapshots.py -v
```
### 5.2 Enable Pydantic for One Endpoint in Staging
```bash
# Staging only
USE_PYDANTIC_VALIDATION=true
PYDANTIC_PARALLEL_MODE=true  # Still log comparisons
```
### 5.3 Monitor for 24-48 Hours
- Check logs for `PYDANTIC_DIFF`
- Monitor error rates
- Verify all pages render correctly
---
## Phase 6: Enable Pydantic Globally (Still No Deletions)
### 6.1 Flip Feature Flag
```bash
# Production
USE_PYDANTIC_VALIDATION=true
PYDANTIC_PARALLEL_MODE=false  # Disable logging overhead
```
### 6.2 Monitor Production for 1 Week
- Error rates
- Cache hit rates
- Page load performance
---
## Phase 7: Delete Legacy Code (Only After Proven Stable)
**Prerequisites:**
- [ ] All cache key parity tests pass
- [ ] No PYDANTIC_DIFF logs in production for 1 week
- [ ] All regression tests pass
- [ ] Manual verification of all pages complete
### 7.1 Remove Legacy Timeframe Aliases
**Modify:** `/backend/constants.py`
- Remove `TIMEFRAME_LEGACY_MAP` entries
### 7.2 Remove `period` Fallback
**Modify:** `/backend/api/contracts/normalize.py`
- Remove `period` → `timeframe` aliasing
### 7.3 Delete Old Schema Files
**Delete:** `/backend/api/contracts/schemas/*.py` (18 files)
**Delete:** `/backend/api/contracts/registry.py`
**Delete:** `/backend/api/contracts/validate.py`
### 7.4 Remove Feature Flags
**Delete:** `/backend/config/feature_flags.py`
**Modify:** `/backend/api/contracts/wrapper.py` - Remove parallel validation logic
---
## Phase 8: Frontend Cleanup (Backend Must Be Stable First)
### 8.1 Remove Legacy Timeframe Aliases
**Modify:** `/frontend/src/constants/timeframes.js`
- Remove `LEGACY_MAP` entries
### 8.2 Remove Deprecated Store Actions
**Modify:** `/frontend/src/stores/filterStore.js`
- Remove `setDateRange`, `setDatePreset` aliases
### 8.3 Clean Up DealCheckerContent
**Modify:** `/frontend/src/components/powerbi/DealCheckerContent.jsx`
- Migrate to `useAppQuery`
### 8.4 Remove Duplicate Hook
**Delete:** `/frontend/src/hooks/useDebouncedFilterKey.js`
---
## Phase 9: Add Param Flow Integrity Tests
### 9.1 Backend Tests
**Create:** `/backend/tests/test_param_flow_integrity.py`
Test categories:
1. Resolution Consistency
2. Cache Key Integrity
3. Immutability
4. Name Canonicalization
5. Edge Cases
### 9.2 Frontend Tests
**Create:** `/frontend/src/context/PowerBIFilter/__tests__/paramFlowIntegrity.test.js`
---
## Critical Files Summary
### Phase 1-2: Create (No Deletions)
- `/backend/config/feature_flags.py`
- `/backend/api/contracts/pydantic_models/__init__.py`
- `/backend/api/contracts/pydantic_models/base.py`
- `/backend/api/contracts/pydantic_models/types.py`
- `/backend/api/contracts/pydantic_models/aggregate.py`
- `/backend/api/contracts/pydantic_comparison.py`
- `/backend/tests/test_cache_key_parity.py`
### Phase 4: Create (One per Endpoint)
- `/backend/api/contracts/pydantic_models/dashboard.py`
- `/backend/api/contracts/pydantic_models/kpi_summary.py`
- `/backend/api/contracts/pydantic_models/transactions.py`
- `/backend/api/contracts/pydantic_models/insights.py`
- `/backend/api/contracts/pydantic_models/filter_options.py`
### Phase 7: Delete (Only After Stable)
- `/backend/api/contracts/schemas/*.py` (18 files)
- `/backend/api/contracts/registry.py`
- `/backend/api/contracts/validate.py`
- `/backend/config/feature_flags.py`
### Phase 8: Frontend Changes
- `/frontend/src/constants/timeframes.js`
- `/frontend/src/stores/filterStore.js`
- `/frontend/src/components/powerbi/DealCheckerContent.jsx`
- `/frontend/src/hooks/useDebouncedFilterKey.js` (delete)
---
## Rollback Plan
### If Pydantic Migration Breaks Something:
**Immediate (< 5 min):**
```bash
# Flip feature flag back
USE_PYDANTIC_VALIDATION=false
# Old code still exists, works immediately
```
**Investigation:**
```bash
# Check comparison logs
grep "PYDANTIC_DIFF" logs/app.log | tail -100
# Find which params caused mismatch
```
**Fix:**
1. Fix Pydantic model to match old behavior
2. Add failing test case
3. Re-enable feature flag
---
## Verification Commands (Run After Each Phase)
```bash
# Phase 2: After /aggregate migration
pytest tests/test_cache_key_parity.py -v
pytest tests/contracts/test_endpoint_smoke.py -k aggregate -v
# Phase 4: After each endpoint
pytest tests/test_cache_key_parity.py -v
pytest tests/contracts/test_endpoint_smoke.py -v
# Phase 5: Full regression
pytest tests/ -v
cd frontend && npm run test:ci && npm run build
# Phase 7: After deletions
pytest tests/ -v
CONTRACT_MODE=strict pytest tests/contracts/ -v
# Phase 8: After frontend cleanup
npm run lint && npm run typecheck
npm run test:ci
npm run e2e:full
```
---
## Success Criteria (In Order)
1. [ ] Pydantic models produce identical output to old normalize_params
2. [ ] All cache key parity tests pass
3. [ ] Zero PYDANTIC_DIFF logs in parallel mode
4. [ ] All regression tests pass with Pydantic enabled
5. [ ] Production stable for 1 week with Pydantic
6. [ ] Legacy code deleted successfully
7. [ ] Frontend cleanup complete
8. [ ] Param flow integrity tests added
9. [ ] All pages manually verified
