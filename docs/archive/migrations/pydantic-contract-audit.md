# Pydantic Contract Migration Audit

> **Purpose:** Deep audit to ensure frontend-backend param alignment is complete, cache parity is maintained, and no silent validation failures exist.
> **Priority:** Stability, Reliability, Efficiency, Clean Code
> **Scope:** Backend validation layer + Frontend param usage

---

## Pre-Audit Context

### Current State (Phase 7 Complete)
- **10 endpoints** have Pydantic models (PRIMARY validation path)
- **20+ endpoints** still use legacy `normalize_params()` (FALLBACK only)
- **Feature flag:** `USE_PYDANTIC_VALIDATION=true` (default)
- **136 cache key parity tests** ensure old/new produce identical results

### Critical Files
| File | Purpose |
|------|---------|
| `backend/api/contracts/pydantic_models/` | Pydantic model definitions |
| `backend/api/contracts/schemas/` | Contract registrations |
| `backend/api/contracts/wrapper.py` | `@api_contract` decorator |
| `backend/api/contracts/normalize.py` | Legacy normalizer (fallback) |
| `backend/tests/test_cache_key_parity.py` | 136 parity tests |

---

## 1. Pydantic Model Coverage Audit

### 1.1 Endpoints WITH Pydantic (Verify Complete)

For each model below, audit alias coverage:

| Model | File | Endpoint |
|-------|------|----------|
| `AggregateParams` | `pydantic_models/aggregate.py:41` | `/api/aggregate` |
| `DashboardParams` | `pydantic_models/dashboard.py:27` | `/api/dashboard` |
| `FilterOptionsParams` | `pydantic_models/filter_options.py:24` | `/api/filter-options` |
| `KPISummaryParams` | `pydantic_models/kpi_summary.py:24` | `/api/kpi-summary-v2` |
| `KPISingleParams` | `pydantic_models/kpi_summary.py:80` | `/api/kpi-summary-v2/single` |
| `KPISummaryLegacyParams` | `pydantic_models/kpi_summary.py:121` | `/api/kpi-summary` |
| `PriceGrowthParams` | `pydantic_models/transactions.py:26` | `/api/transactions/price-growth` |
| `SegmentsParams` | `pydantic_models/transactions.py:135` | `/api/transactions/price-growth/segments` |
| `DistrictPsfParams` | `pydantic_models/insights.py:25` | `/insights/district-psf` |
| `DistrictLiquidityParams` | `pydantic_models/insights.py:82` | `/insights/district-liquidity` |

**For each model, verify these aliases exist:**

| Frontend Sends | Expected Alias | Alias Type |
|----------------|----------------|------------|
| `timeframe` | `timeframe` | Direct (no alias needed) |
| `bedroom` | `bedrooms` | `validation_alias='bedroom'` |
| `district` | `districts` | `validation_alias='district'` |
| `segment` | `segments` | `validation_alias='segment'` |
| `saleType` | `sale_type` | `alias='saleType'` |
| `dateFrom` | `date_from` | `alias='dateFrom'` |
| `dateTo` | `date_to` | `alias='dateTo'` |
| `groupBy` | `group_by` | `alias='groupBy'` |
| `psfMin` | `psf_min` | `alias='psfMin'` |
| `psfMax` | `psf_max` | `alias='psfMax'` |
| `sizeMin` | `size_min` | `alias='sizeMin'` |
| `sizeMax` | `size_max` | `alias='sizeMax'` |
| `skipCache` | `skip_cache` | `alias='skipCache'` |
| `timeGrain` | `time_grain` | `alias='timeGrain'` |
| `locationGrain` | `location_grain` | `alias='locationGrain'` |
| `histogramBins` | `histogram_bins` | `alias='histogramBins'` |
| `showFullRange` | `show_full_range` | `alias='showFullRange'` |

**Check command:**
```bash
grep -n "validation_alias\|alias=" backend/api/contracts/pydantic_models/*.py
```

### 1.2 Endpoints WITHOUT Pydantic (Gap Analysis)

These endpoints still use legacy `normalize_params()`. Prioritize for migration:

| Contract | Location | Priority | Risk |
|----------|----------|----------|------|
| `charts/projects-by-district` | `schemas/charts.py:71` | MEDIUM | May silently drop params |
| `charts/price-projects-by-district` | `schemas/charts.py:126` | MEDIUM | |
| `charts/floor-liquidity-heatmap` | `schemas/charts.py:226` | MEDIUM | |
| `charts/psf-by-price-band` | `schemas/charts.py:303` | MEDIUM | |
| `charts/budget-heatmap` | `schemas/charts.py:406` | MEDIUM | |
| `trends/new-vs-resale` | `schemas/trends.py:107` | HIGH | Active chart |
| `projects/inventory` | `schemas/projects_analytics.py:65` | LOW | |
| `projects/price-bands` | `schemas/projects_analytics.py:130` | LOW | |
| `gls/all` | `schemas/gls.py:92` | LOW | |
| `gls/needs-review` | `schemas/gls.py:126` | LOW | |
| `deal-checker/multi-scope` | `schemas/deal_checker.py:79` | LOW | |

**Check command:**
```bash
grep -L "pydantic_model=" backend/api/contracts/schemas/*.py
```

---

## 2. Cache Key Parity Verification

### 2.1 Run Parity Tests
```bash
cd backend
pytest tests/test_cache_key_parity.py -v --tb=short
```

**Expected:** 136 tests pass (per test file header)

### 2.2 Parity Test Coverage Check

For each Pydantic model, verify tests exist:

| Model | Test Count | Location |
|-------|------------|----------|
| `AggregateParams` | 43 | `test_cache_key_parity.py:84-123` |
| `DashboardParams` | 18 | `test_cache_key_parity.py:138-157` |
| `FilterOptionsParams` | 8 | `test_cache_key_parity.py:126-135` |
| `KPISummaryParams` | 10 | `test_cache_key_parity.py:160-171` |
| `KPISingleParams` | 6 | `test_cache_key_parity.py:174-181` |
| `KPISummaryLegacyParams` | 6 | `test_cache_key_parity.py:184-191` |
| `PriceGrowthParams` | 12 | `test_cache_key_parity.py:194-207` |
| `SegmentsParams` | 6 | `test_cache_key_parity.py:210-217` |
| `DistrictPsfParams` | 10 | `test_cache_key_parity.py:220-231` |
| `DistrictLiquidityParams` | 10 | `test_cache_key_parity.py:234-245` |

**Gap check - tests for these edge cases:**
- [ ] Empty params → Y1 default timeframe
- [ ] Singular→plural conversion (`bedroom` → `bedrooms`)
- [ ] District normalization (`9` → `D09`, `d01` → `D01`)
- [ ] Date boundary exclusivity (`date_to` → `date_to_exclusive + 1 day`)
- [ ] Month alignment for timeframe
- [ ] Comma list splitting vs wrapping

---

## 3. Dead Adapter Code Search

### 3.1 Frontend Param Transformation Remnants

Search for any remaining renaming code (should find ONLY comments):

```bash
# Inline param renaming (OLD pattern)
grep -rn "period.*=.*timeframe\|bed.*=.*bedroom" frontend/src --include="*.jsx" --include="*.js"

# Legacy adapter imports
grep -rn "from.*adapter.*param\|import.*buildApiParams" frontend/src --include="*.jsx" --include="*.js"

# buildApiParams usage (should be comments only)
grep -rn "buildApiParams\|buildApiParamsFromState" frontend/src --include="*.jsx" --include="*.js"
```

**Expected:** All matches are in comments documenting the migration (e.g., "// Phase 4: Inline params - no buildApiParams abstraction")

### 3.2 Backend Legacy Code

Check if legacy normalize.py is only fallback:

```bash
# Should ONLY be called from wrapper.py fallback path
grep -rn "from.*normalize import\|normalize_params" backend/ --include="*.py" | grep -v test | grep -v __pycache__
```

**Expected matches:**
- `wrapper.py` - fallback path
- Test files

---

## 4. Type Coercion Verification

### 4.1 Custom Type Validators

Verify these custom types in `pydantic_models/types.py`:

| Type | Behavior | Used By |
|------|----------|---------|
| `CommaList` | `"a,b,c"` → `["a", "b", "c"]` | `group_by`, `metrics`, `panels` |
| `WrapList` | `"2,3"` → `["2,3"]` (NO split) | `bedrooms`, `segments` |
| `IntList` | `3` → `[3]` | `bedrooms` in PriceGrowthParams |
| `DistrictList` | `"9,d01"` → `["D09", "D01"]` | All `districts` fields |
| `CoercedDate` | `"2024-01-01"` → `date(2024, 1, 1)` | Date fields |
| `CoercedInt` | String to int | Numeric fields |
| `CoercedBool` | Truthy/falsy to bool | Boolean fields |

**Test edge cases:**
```python
# Test file: backend/tests/test_pydantic_type_coercion.py (create if missing)

def test_comma_list_splits():
    assert CommaList.validate("a,b,c") == ["a", "b", "c"]

def test_wrap_list_does_not_split():
    assert WrapList.validate("2,3") == ["2,3"]  # NOT ["2", "3"]

def test_district_normalization():
    assert DistrictList.validate("9,d01,D15") == ["D09", "D01", "D15"]

def test_int_list_wraps_single():
    assert IntList.validate(3) == [3]
    assert IntList.validate("3") == [3]
```

---

## 5. Error Handling Verification

### 5.1 Validation Error Response Shape

Send invalid params and verify error response:

```bash
# Test invalid enum value
curl -X GET "http://localhost:5000/api/aggregate?sale_type=INVALID"
# Expected: 400 with clear message about valid values

# Test missing required param
curl -X GET "http://localhost:5000/api/aggregate?group_by="
# Expected: 400 with clear message

# Test type coercion failure
curl -X GET "http://localhost:5000/api/aggregate?psf_min=not_a_number"
# Expected: 400 with type error message
```

### 5.2 Error Response Contract

Verify error responses match expected shape:

```json
{
  "error": "Validation error",
  "details": [
    {
      "field": "sale_type",
      "message": "Invalid value 'INVALID'. Must be one of: new, resale, sub_sale"
    }
  ]
}
```

### 5.3 Frontend Error Display

Check that validation errors surface to UI:

```bash
grep -rn "error.*message\|getQueryErrorMessage" frontend/src --include="*.jsx"
```

---

## 6. Regression Prevention Checks

### 6.1 Silent Param Drop (Historical Incident)

Verify no params are silently dropped:

```python
# Test: backend/tests/test_no_silent_param_drop.py

def test_all_frontend_params_accepted():
    """Verify every param frontend sends is accepted by backend."""
    frontend_params = {
        'timeframe': 'Y1',
        'bedroom': '2,3',
        'district': 'D01,D02',
        'saleType': 'resale',
        'segment': 'CCR',
        'dateFrom': '2024-01-01',
        'dateTo': '2024-12-31',
        # ... all params frontend might send
    }

    result = AggregateParams(**frontend_params)
    # Verify no ValidationError raised
    # Verify values are normalized correctly
```

### 6.2 Cache Key Consistency

Verify identical inputs produce identical cache keys:

```python
def test_cache_key_deterministic():
    """Same inputs must produce same cache key."""
    params1 = AggregateParams(timeframe='Y1', bedroom='2,3')
    params2 = AggregateParams(timeframe='Y1', bedroom='2,3')

    key1 = build_json_cache_key('aggregate', params1.model_dump())
    key2 = build_json_cache_key('aggregate', params2.model_dump())

    assert key1 == key2
```

### 6.3 STRICT Mode Validation

Verify STRICT mode catches undeclared fields:

```bash
CONTRACT_MODE=strict pytest backend/tests/contracts/ -v
```

---

## 7. Deliverables Checklist

### Required Outputs

- [ ] **Alias Coverage Matrix** - Every model, every field, alias status (complete/missing)
- [ ] **Gap Analysis** - Endpoints without Pydantic models, prioritized
- [ ] **Dead Code List** - Any remaining adapter/transform code locations
- [ ] **Parity Test Results** - 136 tests pass/fail status
- [ ] **Type Coercion Tests** - Edge case coverage verification
- [ ] **Error Response Audit** - Validation errors surface correctly
- [ ] **Regression Test Status** - No silent param drops

### Action Items Template

| Priority | Issue | File | Fix |
|----------|-------|------|-----|
| P0 | Missing alias | `model.py:XX` | Add `validation_alias='...'` |
| P1 | No Pydantic model | `schema.py:XX` | Create model, register |
| P2 | Dead adapter code | `component.jsx:XX` | Delete block |
| P3 | Missing parity test | `test_cache_key_parity.py` | Add test case |

---

## 8. Success Criteria

**Audit passes if:**
1. ✅ All 10 Pydantic models have complete alias coverage
2. ✅ 136 cache key parity tests pass
3. ✅ Zero frontend param transformation code (except comments)
4. ✅ Validation errors return proper 400 responses
5. ✅ STRICT mode tests pass in CI
6. ✅ No silent param drops detected

**Red flags requiring immediate fix:**
- ❌ Frontend sends param X, backend rejects/ignores it
- ❌ Cache key differs between old/new normalization
- ❌ Validation error returns 500 instead of 400
- ❌ Undeclared response fields in STRICT mode
