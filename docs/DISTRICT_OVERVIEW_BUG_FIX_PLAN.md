# District Overview Page - Filter Audit Report

## Param Standards: Canonical vs Legacy

### Canonical (Modern Standard)
| Param | Format | Example | Used By |
|-------|--------|---------|---------|
| `timeframe` | M3, M6, Y1, Y3, Y5, all | `timeframe=M6` | `/api/aggregate`, Zustand filters |
| `bedroom` | comma-sep | `bedroom=2,3` | `/api/aggregate` |
| `segment` | CCR, RCR, OCR | `segment=CCR` | `/api/aggregate` |
| `sale_type` | new_sale, resale | `sale_type=resale` | `/api/aggregate` |

### Legacy (Deprecated - in `/insights/*`)
| Param | Format | Canonical Replacement |
|-------|--------|----------------------|
| `period` | 3m, 6m, 12m, 1y | `timeframe` (M3, M6, Y1) |
| `bed` | single value | `bedroom` |
| `age` | new, young, resale | `sale_type` |

### The Problem: Frontend Adapters
Map components have **legacy adapters** that convert canonical → deprecated:
```javascript
// DistrictLiquidityMap.jsx line 90-95
const adapted = {
  period: params.timeframe || 'Y1',  // ❌ Converts to legacy 'period'
  bed: params.bedroom || '',         // ❌ Converts to legacy 'bed'
  saleType: params.saleType,
};
```

---

## Executive Summary

**CRITICAL BUG FOUND:** Backend cache key mismatch causes filters to appear non-reactive.

### Is This a Migration Issue?

**YES.** Here's the migration gap:

```
┌─────────────────────────────────────────────────────────────────────┐
│  MIGRATION PATH                                                      │
├─────────────────────────────────────────────────────────────────────┤
│  1. Zustand filters use 'timeframe' (canonical)                      │
│     filterStore.buildApiParams() → { timeframe: 'M6', ... }          │
│                                                                       │
│  2. Map components have LEGACY ADAPTERS that convert to 'period'     │
│     // Adapt param names for this endpoint (timeframe→period)        │
│     { period: params.timeframe || 'Y1' }  // ← Converts M6→period    │
│                                                                       │
│  3. Backend normalization uses 'period' to compute dates correctly   │
│     tf_id = params.get('period')  // 'M6'                            │
│     date_from = resolve_timeframe(tf_id)  // Correct dates ✓         │
│     # BUT NEVER SETS: params['timeframe'] = tf_id  ← THE BUG         │
│                                                                       │
│  4. Cache key reads 'timeframe' which is undefined → defaults 'Y1'   │
│     cache_params = { 'timeframe': params.get('timeframe', 'Y1') }    │
│     // Cache key: "timeframe=Y1" even when actual filter is M6!      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why Market Overview works but District Overview doesn't:**
- Market Overview charts use `/api/aggregate` → cache key uses `date_from`/`date_to_exclusive` (correctly resolved)
- District Overview maps use `/insights/*` → cache key uses `params['timeframe']` (never set by normalization)

### Affected vs Working Endpoints

| Endpoint | Caching | Cache Key Uses | Working? |
|----------|---------|----------------|----------|
| `/api/aggregate` | ✅ Yes | `date_from`, `date_to_exclusive` | ✅ Correct |
| `/insights/district-psf` | ❌ No caching | N/A | ✅ Correct (no cache) |
| `/insights/district-liquidity` | ✅ Yes | `params['timeframe']` | ❌ **BROKEN** |

### Root Cause

```python
# backend/routes/insights.py line 425-428
cache_params = {
    'timeframe': params.get('timeframe', 'Y1'),  # ← Always 'Y1' (default)!
    'bed': params.get('bed', 'all'),
    'sale_type': params.get('sale_type', 'all'),
}
```

**The bug:**
- Frontend sends: `{ period: 'M6', bed: '2', saleType: 'Resale' }`
- Backend `_normalize_timeframe()` uses `period` to compute dates, but does NOT copy it to `params['timeframe']`
- Cache key: `"timeframe=Y1&bed=2&sale_type=Resale"` (wrong! should be M6)
- Returns STALE cached data for Y1 regardless of actual time filter

### Secondary Issue

**Region filter visual highlighting** - Maps should dim non-selected regions when CCR/RCR/OCR is selected (not implemented, lower priority)

---

## Component Filter Analysis

| Component | Time Filter | Bedroom | Region Visual | Sale Type | Status |
|-----------|-------------|---------|---------------|-----------|--------|
| **DistrictLiquidityMap** | ❌ Cache bug | ❌ Cache bug | ❌ Missing | ✅ Working | **FIX CACHE** |
| **MarketStrategyMap** | ❌ Cache bug | ❌ Cache bug | ❌ Missing | ✅ Working | **FIX CACHE** |
| **MarketMomentumGrid** | ✅ Working | ✅ Working | ✅ Data filter | ✅ Working | **OK** |
| **GrowthDumbbellChart** | ❌ Intentional | ✅ Working | ❌ N/A | ✅ Working | **By design** |

**Note:** The `/insights/*` endpoints have a cache key bug. `/api/aggregate` endpoints work correctly.

---

## Implementation Plan

### User-Requested Approach: Remove Old, Map to New

Instead of patching the normalization layer, remove the legacy adapters from frontend and send canonical params directly.

---

### Step 1: Frontend - Remove Legacy Adapters

**Files to modify:**
- `frontend/src/components/insights/DistrictLiquidityMap/DistrictLiquidityMap.jsx`
- `frontend/src/components/insights/MarketStrategyMap.jsx`

**Current (legacy adapter):**
```javascript
// DistrictLiquidityMap.jsx line 90-95
const adapted = {
  period: params.timeframe || 'Y1',  // ❌ Legacy
  bed: params.bedroom || '',         // ❌ Legacy
  saleType: params.saleType,
};
return apiClient.get('/insights/district-liquidity', { params: adapted, signal });
```

**New (canonical params):**
```javascript
// Send canonical params directly (same as /api/aggregate)
const adapted = {
  timeframe: params.timeframe || 'Y1',  // ✅ Canonical
  bedroom: params.bedroom || '',         // ✅ Canonical (if backend supports)
  sale_type: params.saleType,            // ✅ Canonical
};
return apiClient.get('/insights/district-liquidity', { params: adapted, signal });
```

---

### Step 2: Backend - Ensure Canonical Params Are Supported

**File:** `backend/api/contracts/schemas/insights.py`

**Current contract (line 111-145):**
- ✅ `timeframe` is already supported (canonical)
- ❌ `bed` is used, not `bedroom`
- ✅ `sale_type` is supported

**Changes needed:**
1. Add `bedroom` as alias for `bed` (or add as new field)
2. Mark `bed` as deprecated

```python
DISTRICT_LIQUIDITY_PARAM_SCHEMA = ParamSchema(
    fields={
        "timeframe": FieldSpec(...),  # Already canonical ✓
        "bedroom": FieldSpec(         # ← ADD: canonical param
            name="bedroom",
            type=str,
            default="all",
            allowed_values=["all", "1", "2", "3", "4", "5"],
            description="Bedroom filter (canonical)"
        ),
        "bed": FieldSpec(             # Mark as deprecated
            name="bed",
            ...
            description="[DEPRECATED] Use 'bedroom' instead"
        ),
        "sale_type": FieldSpec(...),  # Already canonical ✓
    },
    aliases={
        "saleType": "sale_type",
        "bed": "bedroom",  # ← ADD: alias old to new
    }
)
```

---

### Step 3: Backend - Fix Normalization to Set `params['timeframe']`

**File:** `backend/api/contracts/normalize.py` (line 226)

Even with canonical params, we need this fix to ensure cache key works:

```python
# After resolving timeframe to dates, copy back to params
params['timeframe'] = tf_id  # ← ADD THIS LINE
```

**Why:** Cache key still reads `params.get('timeframe', 'Y1')`. If frontend sends `timeframe` directly, this param will be in the raw request args but normalization might not preserve it after date resolution.

---

### Step 4: Verify Both Endpoints

Apply same changes to:
- `/insights/district-liquidity` (DistrictLiquidityMap)
- `/insights/district-psf` (MarketStrategyMap)

---

### Fix 2: Add Region Filter Visual Highlighting to Maps (Lower Priority)

When user selects a region (CCR/RCR/OCR) in FilterBar:
- Maps continue to fetch and display ALL 28 districts
- Selected region's districts are visually highlighted
- Non-selected districts are dimmed (reduced opacity/grayscale)

---

## Summary

| Priority | Item | Current State | Action |
|----------|------|---------------|--------|
| **P0** | Remove legacy adapters | Frontend sends `period`/`bed` | Send `timeframe`/`bedroom` |
| **P0** | Backend canonical params | Uses `bed` not `bedroom` | Add `bedroom` alias |
| **P0** | Normalization bug | `params['timeframe']` not set | Add line to copy back |
| **P2** | Region filter (visual) | ❌ Not implemented | Add highlighting (future) |

---

## Files to Modify (In Order)

| Step | File | Change |
|------|------|--------|
| 1 | `backend/api/contracts/schemas/insights.py` | Add `bedroom` field + alias `bed→bedroom` |
| 2 | `backend/api/contracts/normalize.py` | Add `params['timeframe'] = tf_id` after line 226 |
| 3 | `frontend/.../DistrictLiquidityMap.jsx` | Change `period→timeframe`, `bed→bedroom` |
| 4 | `frontend/.../MarketStrategyMap.jsx` | Same changes |

---

## Verification Steps After Fix

```bash
# 1. Run existing tests
cd backend && pytest tests/contracts/test_endpoint_smoke.py -v

# 2. Manual verification
# - Go to /district-overview page
# - Change time filter from Y1 to M6
# - Map data should update (check turnover %, tx counts)
# - Change bedroom filter to 2BR only
# - Map data should update to show only 2BR stats

# 3. Check cache is working correctly
# - Make same filter change twice
# - Second request should hit cache (check elapsed_ms in response meta)
```
