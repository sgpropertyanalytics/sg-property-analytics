# API Endpoint Cleanup Plan

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total Endpoints** | 85 |
| **Actively Used** | 25 (29%) |
| **Orphaned/Unused** | 43 (51%) |
| **Intentionally Deprecated (410)** | 6 |
| **Internal/Admin Only** | 11 |
| **Lines to Remove** | ~1,549 |
| **Files Affected** | 8 |

---

## Phase 1: Safe Deletes (Zero Dependencies)

**Priority: HIGH | Risk: LOW | Estimated: ~969 lines**

### 1.1 Delete Entire Files

| File | Endpoints | Lines | Reason |
|------|-----------|-------|--------|
| `routes/analytics/precomputed.py` | 5 | 166 | All endpoints orphaned, replaced by `/aggregate` |
| `routes/analytics/trends.py` | 5 | 393 | All endpoints orphaned, zero frontend refs |
| `services/data_computation.py` | N/A | 210 | Removed (precomputed pipeline retired) |

### 1.2 Precomputed Endpoints (DELETE ALL)

```
/api/resale_stats          → Zero usage, replaced by /aggregate
/api/price_trends          → Zero usage, replaced by /aggregate
/api/total_volume          → Zero usage, replaced by /aggregate
/api/avg_psf               → Zero usage, replaced by /aggregate
/api/market_stats          → Zero usage, replaced by /aggregate
```

**Location:** `backend/routes/analytics/precomputed.py:22-163`

### 1.3 Trend Endpoints (DELETE ALL)

```
/api/price_trends_by_district    → Zero usage
/api/market_stats_by_district    → Zero usage
/api/sale_type_trends            → Zero usage
/api/price_trends_by_sale_type   → Zero usage
/api/price_trends_by_region      → Zero usage
```

**Location:** `backend/routes/analytics/trends.py:30-257`

### 1.4 Test Files to Delete

```
backend/tests/contracts/test_contract_precomputed.py
backend/tests/contracts/test_contract_trends.py
```

### 1.5 Schema Files to Delete

```
backend/api/contracts/schemas/precomputed.py (if exists)
backend/api/contracts/schemas/trends.py (if exists)
```

---

## Phase 2: Consolidation (Merge Similar Endpoints)

**Priority: MEDIUM | Risk: MEDIUM | Estimated: ~480 lines**

### 2.1 GLS Endpoint Consolidation

| Current | Status | Action |
|---------|--------|--------|
| `/gls/all` | KEEP | Single source of truth |
| `/gls/upcoming` | DELETE | Subset of /all (filter: status=launched) |
| `/gls/awarded` | DELETE | Subset of /all (filter: status=awarded) |
| `/gls/supply-pipeline` | DELETE | Aggregation can use /all |
| `/gls/price-floor` | DELETE | Unused stats endpoint |
| `/gls/stats` | DELETE | Unused stats endpoint |
| `/gls/tender/<id>` | DELETE | Detail view never used |

**Location:** `backend/routes/gls.py:39-140, 216-314, 624-685`
**Lines to Remove:** ~250

### 2.2 School-Related Consolidation

| Current | Status | Action |
|---------|--------|--------|
| `/projects/<name>/school-flag` | DELETE | Never used |
| `/projects/with-school` | DELETE | Never used |
| `/projects/locations` | KEEP | Contains all data |
| `/projects/school-flags` | DELETE | Batch lookup unused |
| `/schools` | DELETE | Never used |
| `/schools/<id>` | DELETE | Never used |

**Location:** `backend/routes/projects.py:38-365`
**Lines to Remove:** ~280

### 2.3 Upcoming Launches Consolidation

| Current | Status | Action |
|---------|--------|--------|
| `/upcoming-launches/all` | KEEP | Single source of truth |
| `/upcoming-launches/by-segment` | DELETE | Can filter /all |
| `/upcoming-launches/supply-pipeline` | DELETE | Can aggregate /all |
| `/upcoming-launches/project/<name>` | DELETE | Unused detail endpoint; rely on /all |
| `/upcoming-launches/stats` | DELETE | Can compute from /all |

**Location:** `backend/routes/upcoming_launches.py:149-458`
**Lines to Remove:** ~200

---

## Phase 3: Deprecation (Add 410 Before Removal)

**Priority: LOW | Risk: LOW**

These endpoints may have external consumers, so add 410 responses first:

### 3.1 Add 410 Stubs

| Endpoint | Replacement | Notes |
|----------|-------------|-------|
| `/deal-checker/nearby-transactions` | `/deal-checker/multi-scope` | Legacy implementation |
| `/insights/district-summary` | `/aggregate?group_by=district` | Use aggregate instead |
| `/aggregate-summary` | `/aggregate` | Duplicate functionality |

### 3.2 Template for 410 Response

```python
@analytics_bp.route("/deprecated-endpoint", methods=["GET"])
def deprecated_endpoint():
    """Deprecated: Use /new-endpoint instead."""
    return jsonify({
        "error": "Endpoint deprecated",
        "code": "ENDPOINT_DEPRECATED",
        "replacement": "/api/new-endpoint",
        "deprecatedAt": "2025-01-15",
        "removalDate": "2025-02-15"
    }), 410
```

---

## Phase 4: Admin Endpoints (Keep But Reorganize)

These are internal/operational - keep but document:

### GLS Admin
```
POST /api/gls/scrape           → Manual scrape trigger
POST /api/gls/reset            → Reset GLS data
POST /api/gls/cron-refresh     → Scheduled refresh
POST /api/gls/trigger-refresh  → Manual refresh
GET  /api/gls/needs-review     → Admin review queue
GET  /api/gls/refresh-status   → Refresh status check
```

### Upcoming Launches Admin
```
POST /api/upcoming-launches/reset        → Reset data
GET  /api/upcoming-launches/needs-review → Admin review queue
```

### Other Admin
```
POST /api/admin/filter-outliers    → Outlier filtering
POST /api/admin/update-metadata    → Metadata updates
GET  /api/debug/data-status        → Debug status
POST /api/projects/compute-school-flags → Compute flags
GET  /api/dashboard/cache          → Cache management
```

---

## Implementation Checklist

### Phase 1 Tasks

- [ ] Delete `backend/routes/analytics/precomputed.py`
- [ ] Delete `backend/routes/analytics/trends.py`
- [x] Delete `backend/services/data_computation.py`
- [ ] Update `backend/routes/analytics/__init__.py` (remove imports)
- [ ] Delete `backend/tests/contracts/test_contract_precomputed.py`
- [ ] Delete `backend/tests/contracts/test_contract_trends.py`
- [ ] Update `backend/api/contracts/schemas/__init__.py` (remove imports)
- [ ] Run full test suite
- [ ] Update API documentation

### Phase 2 Tasks

- [ ] Remove GLS subset endpoints from `backend/routes/gls.py`
- [ ] Remove school endpoints from `backend/routes/projects.py`
- [ ] Remove upcoming launches subset endpoints
- [ ] Update contract schemas
- [ ] Update tests
- [ ] Run full test suite

### Phase 3 Tasks

- [ ] Add 410 stubs for external-risk endpoints
- [ ] Monitor logs for 30 days
- [ ] Remove stubs after deprecation period

---

## Risk Mitigation

### Before Deletion
1. **Add request logging** to candidate endpoints for 1 week
2. **Search external docs/integrations** for any references
3. **Check analytics** for any API call patterns

### After Deletion
1. **Monitor error logs** for 404s on deleted paths
2. **Keep 410 stubs** for high-risk endpoints for 30 days
3. **Document removals** in CHANGELOG.md

---

## Impact Summary

| Category | Before | After | Removed |
|----------|--------|-------|---------|
| Total Endpoints | 85 | ~55 | 30 |
| Route Files | 22 | 19 | 3 |
| Lines of Code | ~8,000 | ~6,450 | ~1,550 |
| Test Files | 16 | 14 | 2 |

---

## Endpoints Confirmed USED (Do Not Touch)

```
✓ /api/health
✓ /api/districts
✓ /api/aggregate
✓ /api/dashboard
✓ /api/new-vs-resale
✓ /api/kpi-summary-v2
✓ /api/filter-options
✓ /api/budget-heatmap
✓ /api/floor-liquidity-heatmap
✓ /api/transactions/price-growth
✓ /api/gls/all
✓ /api/upcoming-launches/all
✓ /api/projects/hot
✓ /api/projects/names
✓ /api/projects/<name>/inventory
✓ /api/projects/<name>/price-bands
✓ /api/projects/<name>/exit-queue
✓ /api/deal-checker/multi-scope
✓ /api/supply/summary
✓ /api/insights/district-psf
✓ /api/insights/district-liquidity
✓ /api/auth/firebase-sync
✓ /api/auth/subscription
✓ /api/auth/delete-account
✓ /api/payments/create-checkout
✓ /api/payments/portal
```

---

## Endpoints Already Deprecated (410) - Keep Forever

```
✗ /api/transactions        → URA compliance
✗ /api/transactions/list   → URA compliance
✗ /api/comparable_value_analysis → URA compliance
✗ /api/scatter-sample      → URA compliance
✗ /api/kpi-summary         → Replaced by v2
```
