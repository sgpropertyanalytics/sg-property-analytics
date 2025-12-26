# Compliance Review Report (STRICT AUDIT)

**Date:** 2025-12-26
**Reviewer:** Compliance Audit System
**Policy Document:** LEGAL_COMPLIANCE.md (v1.1, December 2024)
**Reference:** URA Terms & Conditions
**Audit Mode:** STRICT (Backend-only evaluation, UI restrictions NOT sufficient)

---

## Summary: NO-GO (CRITICAL)

The platform has **CRITICAL COMPLIANCE VIOLATIONS** at the backend API level. UI restrictions (blur, premium gates) are NOT sufficient to meet compliance requirements. The backend exposes transaction-level data that can be used to reconstruct URA REALIS records.

### Core Violation
> The API returns individual transaction records with enough identifying fields (date + district + bedroom + floor level + sale type) to reconstruct URA data - even when "sensitive" fields are masked.

---

## Compliance Checklist (Backend-Only Evaluation)

### Data Source Compliance (Section 11.1)

| Check | Requirement | Status | Backend Evidence | Risk Level |
|-------|-------------|--------|------------------|------------|
| Data is aggregated or derived | All API responses must be aggregated | **FAIL** | `serialize_transaction()` returns individual records | CRITICAL |
| No raw URA tables stored | No transaction-level API access | **FAIL** | `/api/transactions/list` returns rows | CRITICAL |
| No transaction-level records exposed | Individual deals not returned | **FAIL** | API returns up to 10,000 individual records per request | CRITICAL |
| Data cannot be reconstructed | Cannot rebuild URA format | **FAIL** | Date+District+Bedroom+Floor+Type = identifiable | CRITICAL |
| Data not downloadable | No bulk access | **FAIL** | Pagination allows full dataset extraction | HIGH |

### API Endpoint Compliance (Backend Responses Only)

| Endpoint | Returns Individual Records? | Reconstruction Risk | Status |
|----------|----------------------------|---------------------|--------|
| `/api/transactions/list` | YES - up to 10,000 rows per request | HIGH - all identifying fields | **CRITICAL FAIL** |
| `/api/dashboard?panels=*` | NO - aggregated data only | LOW | **PASS** |
| `/api/aggregate` | NO - grouped aggregates | LOW | **PASS** |
| `/api/kpi-summary` | NO - summary metrics | LOW | **PASS** |
| `/api/projects/hot` | NO - project aggregates | LOW | **PASS** |
| `/api/deal-checker/multi-scope` | PARTIAL - histogram bins | MEDIUM | **CONDITIONAL** |
| `/api/gls/*` | N/A - public government data | N/A | **PASS** |

### Transaction Serialization Analysis

#### FAIL: `serialize_transaction()` (api_contract.py:223-276)
**Returns for premium users:**
```python
{
    'projectName': 'ACTUAL PROJECT NAME',  # IDENTIFYING
    'district': 'D09',                      # IDENTIFYING
    'bedroomCount': 3,                      # IDENTIFYING
    'transactionDate': '2024-05-15',        # IDENTIFYING
    'price': 2150000,                       # EXACT VALUE
    'areaSqft': 1200,                       # EXACT VALUE
    'psf': 1792,                            # EXACT VALUE
    'saleType': 'resale',                   # IDENTIFYING
    'tenure': '99_year',                    # IDENTIFYING
    'floorLevel': 'high',                   # IDENTIFYING
    'streetName': 'STREET NAME',            # HIGHLY IDENTIFYING
    'floorRange': '16-20',                  # HIGHLY IDENTIFYING
}
```
**Verdict:** This response contains ALL fields needed to identify and reconstruct URA REALIS records.

#### FAIL: `serialize_transaction_teaser()` (api_contract.py:279-337)
**Returns for free users (masked mode):**
```python
{
    'projectName': None,                    # Masked
    'projectNameMasked': 'D09 Condo',       # Vague
    'district': 'D09',                      # STILL VISIBLE - IDENTIFYING
    'bedroomCount': 3,                      # STILL VISIBLE - IDENTIFYING
    'transactionDate': '2024-05-15',        # STILL VISIBLE - IDENTIFYING
    'price': None,                          # Masked
    'priceMasked': '$2M - $3M',             # Range only
    'saleType': 'resale',                   # STILL VISIBLE - IDENTIFYING
    'tenure': '99_year',                    # STILL VISIBLE - IDENTIFYING
    'floorLevel': 'high',                   # STILL VISIBLE - IDENTIFYING
}
```
**Verdict:** Even masked responses expose date + district + bedroom + floor + type combination. A user could cross-reference with URA REALIS to identify specific transactions.

### Reconstruction Attack Vector

An attacker with URA REALIS access could:
1. Call `/api/transactions/list?district=D09&bedroom=3&date_from=2024-05-01&date_to=2024-05-31`
2. Receive individual transaction records (even masked)
3. Match each record to URA REALIS using: date + district + bedroom + floor level
4. Since there are limited 3BR resales in D09 each month, exact price becomes identifiable

**This is a direct violation of:**
- Section 4: "Users are not permitted to extract, reconstruct, or redistribute data"
- Section 6: "All data is processed to prevent reconstruction of individual sales records"

---

## Critical Backend Violations

### 1. CRITICAL: Transaction List Endpoint
**File:** `backend/routes/analytics.py:1693-1924`
**Endpoint:** `GET /api/transactions/list`
**Parameters:** page, limit (up to 10,000), filters
**Response:** Individual transaction records with full or masked data

**Risk:**
- Allows extraction of ALL transactions via pagination
- Even masked responses contain identifying fields
- No rate limiting observed
- Premium users get exact values

**Compliance Violation:**
- Section 5: "Individual transaction records | Raw data reproduction"
- Section 11.1: "No transaction-level records exposed"

### 2. CRITICAL: Full Transaction Serializer
**File:** `backend/schemas/api_contract.py:223-276`
**Function:** `serialize_transaction()`

**Risk:** Returns ALL transaction fields to premium users including:
- Exact project name, price, PSF, area
- Street name, floor range (highly identifying)
- This data CAN be copied/exported by premium users

**Compliance Violation:**
- Section 7: "Never store raw URA tables in user-accessible format"
- Section 7: "Never expose transaction rows directly"

### 3. HIGH: Teaser Serializer Still Identifies Transactions
**File:** `backend/schemas/api_contract.py:279-337`
**Function:** `serialize_transaction_teaser()`

**Risk:** Even "masked" data retains:
- Exact transaction date (ISO format)
- District, bedroom, floor level, sale type
- This combination is often unique enough to identify transactions

**Compliance Violation:**
- Section 6: "Aggregation ensures no single transaction is identifiable"
- The teaser data DOES NOT ensure anonymity

### 4. HIGH: No Limit on Data Extraction
**File:** `backend/routes/analytics.py:1729-1731`
```python
# No max limit - allow fetching all records for accurate histogram analysis
page = int(request.args.get("page", 1))
limit = int(request.args.get("limit", 50))  # Can go up to 10,000
```

**Risk:** A script could extract the entire transaction database through repeated API calls.

### 5. MEDIUM: K-Anonymity Threshold Too Low
**File:** `backend/utils/subscription.py:200-202`
```python
K_ANONYMITY_THRESHOLD = 10
```

**Risk:** 10 records may not provide sufficient anonymity when combined with external knowledge (URA REALIS access).

---

## Top 5 Backend-Focused Fixes

### Fix 1: Remove Transaction List Endpoint (IMMEDIATE)
```python
# backend/routes/analytics.py
@analytics_bp.route("/transactions/list", methods=["GET"])
def transactions_list():
    """DEPRECATED: Returns 403 for compliance."""
    return jsonify({
        "error": "Transaction-level data access has been deprecated for compliance.",
        "code": "ENDPOINT_DEPRECATED",
        "alternative": "Use /api/aggregate or /api/dashboard for market insights"
    }), 403
```

### Fix 2: Remove Identifying Fields from Teaser Response
```python
# backend/schemas/api_contract.py:279-337
def serialize_transaction_teaser(txn, include_deprecated: bool = True) -> Dict[str, Any]:
    """COMPLIANCE: Remove identifying fields entirely, not just mask them."""
    result = {
        TransactionFields.ID: txn.id,  # Internal ID only
        # Remove: district, transactionDate, bedroomCount, floorLevel
        # Only return aggregated/bucketed values
        'priceRange': _mask_price(txn.price),
        'areaRange': _mask_area(txn.area_sqft),
        'psfRange': _mask_psf(txn.psf),
        'saleType': SaleType.from_db(txn.sale_type),
    }
    # DO NOT include: district, transactionDate, bedroomCount, floorLevel
    return result
```

### Fix 3: Aggregate Before Returning (Alternative to Fix 1)
Instead of returning individual transactions, return only aggregated summaries:
```python
# Instead of returning transaction list, return:
{
    "summary": {
        "count": 150,
        "median_price": 2500000,
        "median_psf": 1850,
        "price_range": {"min": 1800000, "max": 4500000}
    },
    "distribution": [
        {"price_band": "$1M-2M", "count": 45},
        {"price_band": "$2M-3M", "count": 78},
        {"price_band": "$3M+", "count": 27}
    ]
}
```

### Fix 4: Increase K-Anonymity Threshold
```python
# backend/utils/subscription.py
K_ANONYMITY_THRESHOLD = 50  # Increase from 10 to 50
```

### Fix 5: Add Rate Limiting and Audit Logging
```python
# Add to analytics.py
from flask_limiter import Limiter

@analytics_bp.route("/transactions/list", methods=["GET"])
@limiter.limit("10 per minute")  # Prevent bulk extraction
def transactions_list():
    # Log all access for audit trail
    logger.info(f"Transaction access: user={get_user_id()}, params={request.args}")
    ...
```

---

## Verification Criteria (For GO Status)

To achieve GO status, the following MUST be true about ALL API responses:

| Criterion | Verification Method |
|-----------|---------------------|
| No endpoint returns individual transaction records | Audit all routes in `backend/routes/` |
| No response contains exact transaction date + district + bedroom combination | Review all serializers |
| K-anonymity of at least 50 enforced | Check threshold in subscription.py |
| Bulk extraction prevented | Rate limiting on all data endpoints |
| Audit logging enabled | All data access logged |

---

## Final Verdict

### Decision Matrix

| Criteria | Status |
|----------|--------|
| Backend returns aggregated data only | **FAIL** |
| No API endpoint returns transaction rows | **FAIL** |
| Cannot reconstruct individual transactions | **FAIL** |
| Premium users cannot extract raw data | **FAIL** |
| Free users cannot identify transactions | **FAIL** |

### Overall Status: **NO-GO (CRITICAL)**

The platform CANNOT be deployed until:

1. `/api/transactions/list` endpoint is removed or returns only aggregated data
2. All transaction serializers are modified to remove identifying field combinations
3. K-anonymity threshold increased to at least 50
4. Rate limiting implemented on all data endpoints
5. Full audit logging enabled for compliance trail

### Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| URA compliance audit | HIGH | CRITICAL - License revocation | Remove transaction endpoints |
| Data extraction by scrapers | HIGH | HIGH - Redistribution | Rate limiting, auth required |
| Reconstruction attacks | MEDIUM | HIGH - Identifies transactions | Remove identifying fields |

---

*Report generated by Compliance Audit System*
*Audit mode: STRICT (Backend responses only, UI restrictions not considered)*
*Policy version: LEGAL_COMPLIANCE.md v1.1*
