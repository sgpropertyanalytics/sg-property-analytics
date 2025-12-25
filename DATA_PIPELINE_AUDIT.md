# Data Pipeline Audit Report

**Date:** 2025-12-25
**Auditor:** Senior Data/Backend Engineer
**Scope:** End-to-end data pipeline validation (upload → parse → normalize → DB write → query → API → frontend)

---

## A) Data Flow Map

### 1. Ingestion Layer (CSV → Staging)

```
rawdata/
├── New Sale/*.csv
└── Resale/*.csv
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ scripts/upload.py                                               │
│   • discover_csv_files() - Find all CSVs                       │
│   • create_staging_table() - Create transactions_staging       │
│   • insert_to_staging() - Process each CSV file                │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ services/data_loader.py::clean_csv_data()                      │
│                                                                 │
│ TRANSFORMATIONS:                                                │
│ 1. Property type filter (Condo/Apartment only, exclude EC/HDB) │
│ 2. parse_date_flexible() → transaction_date (YYYY-MM-DD)       │
│ 3. contract_date derivation (MMYY format)                      │
│ 4. District normalization (Postal District → D01 format)       │
│ 5. Price parsing (remove $, commas → float)                    │
│ 6. Nett price parsing (same as price)                          │
│ 7. Area parsing (remove commas → float)                        │
│ 8. PSF calculation (fallback: price / area_sqft)               │
│ 9. bedroom_count classification (three-tier logic)             │
│ 10. floor_level classification (floor_range → tier)            │
│ 11. sale_type assignment (from folder: 'New Sale' or 'Resale') │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ scripts/upload.py::insert_to_staging()                         │
│                                                                 │
│ ADDITIONAL TRANSFORMATIONS:                                     │
│ 1. _parse_lease_info() → lease_start_year, remaining_lease     │
│ 2. Required field validation (project_name, date, district,    │
│    price > 0, area_sqft > 0)                                   │
│ 3. Batch INSERT into transactions_staging (100 rows/batch)     │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ STAGING VALIDATION (scripts/upload.py)                         │
│                                                                 │
│ 1. remove_duplicates_staging()                                 │
│    Key: (project_name, transaction_date, price, area_sqft,     │
│          floor_range)                                          │
│                                                                 │
│ 2. filter_outliers_staging() [SOFT DELETE]                     │
│    Stage 1: En-bloc detection (area > 10,000 sqft)             │
│    Stage 2: Price IQR (5x multiplier) → is_outlier=true        │
│                                                                 │
│ 3. validate_staging()                                          │
│    - Row count >= 1000                                         │
│    - Null rate checks (project_name, price, area_sqft = 0%)   │
│    - Price range: $50K - $100M                                 │
│    - PSF range: $100 - $20K                                    │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ ATOMIC PUBLISH (scripts/upload.py::atomic_publish)             │
│                                                                 │
│ 1. DROP transactions_prev CASCADE                              │
│ 2. RENAME transactions → transactions_prev                     │
│ 3. RENAME transactions_staging → transactions                  │
│ 4. Recreate indexes                                            │
│ 5. Advisory lock for concurrency safety                        │
└────────────────────────────────────────────────────────────────┘
```

### 2. Query Layer (DB → API Response)

```
┌────────────────────────────────────────────────────────────────┐
│ routes/analytics.py::dashboard()                               │
│                                                                 │
│ FILTER PARSING:                                                 │
│ - district → list split by comma                               │
│ - bedroom → list of ints                                       │
│ - segment → uppercase (CCR, RCR, OCR)                         │
│ - date_from/date_to → YYYY-MM-DD                              │
│ - psf_min/max, size_min/max → float                           │
│ - tenure, sale_type, project → string                         │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ services/dashboard_service.py::get_dashboard_data()            │
│                                                                 │
│ QUERY BUILDING:                                                 │
│ 1. build_filter_conditions() → SQLAlchemy WHERE clauses       │
│    - Always excludes is_outlier=true                          │
│    - Segment → districts via get_districts_for_region()       │
│    - Tenure matching: 'freehold' → ILIKE or remaining_lease=999│
│    - Property age: leasehold only (excludes freehold)         │
│                                                                 │
│ PANEL QUERIES (SQL aggregation, no Pandas):                    │
│ - time_series: GROUP BY period, return avg_psf (NOT median)   │
│ - volume_by_location: GROUP BY location (region/district)     │
│ - price_histogram: PERCENTILE_CONT + bin calculation          │
│ - bedroom_mix: GROUP BY period + bedroom + sale_type          │
│ - summary: aggregate stats (count, avg, sum, min, max)        │
│                                                                 │
│ CACHING:                                                        │
│ - TTLCache: 5 min TTL, 500 max entries                        │
│ - Cache key: MD5 hash of normalized filters + panels          │
│ - Cache stampede prevention with per-key locks                │
└────────────────────────────────────────────────────────────────┘
```

### 3. Frontend Consumption

```
┌────────────────────────────────────────────────────────────────┐
│ frontend/src/api/client.js                                     │
│                                                                 │
│ - buildQueryString() → filters out null/undefined             │
│ - In-memory cache: 5 min TTL                                  │
│ - JWT token interceptor                                        │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ frontend/src/context/PowerBIFilterContext.jsx                  │
│                                                                 │
│ STATE MAPPING:                                                  │
│ - dateRange: { start, end } → date_from, date_to              │
│ - districts: [] → district (comma-separated)                  │
│ - bedroomTypes: [] → bedroom (comma-separated)                │
│ - segments: [] → segment (comma-separated)                    │
│ - saleType: string → sale_type                                │
│ - psfRange: { min, max } → psf_min, psf_max                  │
│ - sizeRange: { min, max } → size_min, size_max               │
│ - tenure: string → tenure                                      │
│ - propertyAge: { min, max } → property_age_min/max            │
│ - project: string → project                                    │
│                                                                 │
│ CROSS-FILTER BEHAVIOR:                                         │
│ - Categorical click → setCrossFilter → re-query               │
│ - Time click → setHighlight → acts as date filter             │
│ - Price range → factFilter (affects Transaction Table only)   │
└────────────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────────┐
│ Chart Components (e.g., TimeTrendChart.jsx)                    │
│                                                                 │
│ TRANSFORMS:                                                     │
│ - API response.data.time_series → Chart.js datasets           │
│ - labels: period values                                        │
│ - datasets: count (bar), avg_psf/median_psf (line)            │
└────────────────────────────────────────────────────────────────┘
```

---

## B) Findings

### CRITICAL (Will Corrupt Results)

#### B1. Median vs Average Mismatch (CRITICAL)
**File:** `backend/services/dashboard_service.py:467-476`
**Issue:** `median_psf` is returned as `avg_psf` (simple average), NOT actual median.

```python
# Line 472-473
'avg_psf': round(r.avg_psf, 2) if r.avg_psf else None,
'median_psf': round(r.avg_psf, 2) if r.avg_psf else None,  # Use avg as median approximation
```

**Impact:** Frontend displays "Median PSF" but receives average. This WILL mislead users when there are price outliers (luxury condos skew average up).

**Formula Inferred:**
- Returned: `AVG(psf)`
- Expected: `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf)`

**Severity:** 🔴 CRITICAL - Core metric is mislabeled.

---

#### B2. Summary Median Price Also Uses Average (CRITICAL)
**File:** `backend/services/dashboard_service.py:889-892`

```python
'avg_psf': round(r.avg_psf, 2) if r.avg_psf else None,
'median_psf': round(r.avg_psf, 2) if r.avg_psf else None,  # Approximation
'avg_price': round(r.avg_price, 0) if r.avg_price else None,
'median_price': round(r.avg_price, 0) if r.avg_price else None,  # Approximation
```

**Impact:** Both `median_psf` and `median_price` in summary are actually averages.

**Severity:** 🔴 CRITICAL - Same issue, affects KPI cards.

---

### HIGH (Will Mislead Metrics)

#### B3. Duplicate Detection Key Missing floor_range for Old Data
**File:** `backend/services/data_validation.py:232-260`

```python
# Line 243-252 (when floor_range exists)
GROUP BY project_name, transaction_date, price, area_sqft, COALESCE(floor_range, '')

# Line 254-260 (fallback when floor_range missing)
GROUP BY project_name, transaction_date, price, area_sqft
```

**Issue:** Fallback path (no `floor_range`) may incorrectly dedupe transactions where same project, date, price, area but different floors.

**Impact:** May lose legitimate different-floor transactions if `floor_range` column doesn't exist.

**Severity:** 🟠 HIGH - Could lose valid transactions during deduplication.

---

#### B4. IQR Outlier Detection Uses Different Multipliers in Different Files
**Files:**
- `scripts/upload.py:715` uses `IQR_MULTIPLIER = 5.0`
- `backend/services/data_validation.py:49` uses `1.5 * iqr`

```python
# upload.py:715
IQR_MULTIPLIER = 5.0  # Relaxed from 1.5x to include luxury condos

# data_validation.py:49
lower_bound = q1 - 1.5 * iqr
upper_bound = q3 + 1.5 * iqr
```

**Impact:** Inconsistent outlier detection. Upload uses 5x IQR, validation service uses 1.5x. If `run_all_validations()` is called separately, it would mark MORE outliers than upload.

**Severity:** 🟠 HIGH - Inconsistent outlier thresholds.

---

#### B5. Property Age Filter Excludes Freehold but Uses lease_start_year
**File:** `backend/services/dashboard_service.py:377-406`

```python
# Line 381
property_age_expr = extract('year', Transaction.transaction_date) - Transaction.lease_start_year

# Line 385-388 - Freehold excluded
is_leasehold = and_(
    ~Transaction.tenure.ilike('%freehold%'),
    or_(Transaction.remaining_lease.is_(None), Transaction.remaining_lease < 999),
    Transaction.lease_start_year.isnot(None)
)
```

**Issue:** For freehold properties, `lease_start_year` typically contains the land grant date (often 1800s), NOT the building TOP date. The code correctly excludes freehold, but the comment/documentation doesn't make this clear to users.

**Impact:** Users filtering by property age won't see freehold properties, which may confuse them.

**Severity:** 🟡 MEDIUM - Correct behavior but poor UX (silent exclusion).

---

#### B6. PSF Calculation Fallback May Produce Infinity/NaN
**File:** `backend/services/data_loader.py:311-314`

```python
psf_mask = (df['psf'] == '') | (df['psf'] == 'nan')
df.loc[psf_mask, 'psf'] = (df.loc[psf_mask, 'price'] / df.loc[psf_mask, 'area_sqft']).fillna(0)
df['psf'] = df['psf'].astype(float)
```

**Issue:** If `area_sqft = 0` (which passes earlier check since we check `> 0` after this), division by zero would occur. Although there's a filter for `area_sqft > 0` at line 328, the PSF calculation happens BEFORE this filter.

**Impact:** Potential division by zero before validation filter.

**Severity:** 🟡 MEDIUM - Edge case, likely filtered out later.

---

#### B7. Nett Price Defaults to 0.0 Instead of NULL
**File:** `backend/services/data_loader.py:279-287`

```python
df['nett_price'] = pd.to_numeric(
    df[nett_price_col]
    ...
    errors='coerce'
).fillna(0)
```

**Issue:** `fillna(0)` converts missing nett_price to 0.0 instead of NULL/None. This makes it impossible to distinguish "nett price not provided" from "nett price is $0".

**Impact:** Cannot filter for "transactions with nett price" vs "without nett price".

**Severity:** 🟡 MEDIUM - Data loss (null semantics).

---

#### B8. num_units Defaults to 1 Instead of NULL
**File:** `backend/services/data_loader.py:336-339`

```python
df['num_units'] = pd.to_numeric(
    ...
    errors='coerce'
).fillna(1).astype(int)
```

**Issue:** Missing `num_units` becomes 1, which is the most common value. This masks truly missing data.

**Impact:** Cannot distinguish single-unit transactions from bulk transactions with missing data.

**Severity:** 🟡 MEDIUM - Data loss (null semantics).

---

### MEDIUM (Edge Cases)

#### B9. Date Day Assignment Logic May Cause Incorrect Ordering
**File:** `backend/services/data_loader.py:211-229`

```python
# For the most recent month, use the last day of the month
# For older months, use the 1st day
def get_day(row):
    if int(row['parsed_year']) == max_year and int(row['parsed_month']) == max_month:
        return last_day
    else:
        return 1
```

**Issue:** Latest month transactions get last day (e.g., Oct 31), while older months get 1st day. This creates an artificial 30-day gap in date-based queries/charts.

**Example:** September 2024 → 2024-09-01, October 2024 → 2024-10-31

**Impact:** Time-series charts may show misleading gaps. Date-based filters may behave unexpectedly.

**Severity:** 🟡 MEDIUM - Visual anomaly in time charts.

---

#### B10. Bedroom Classification Thresholds Differ Between Files
**Files:**
- `backend/services/classifier.py:60-66` (SIMPLE_THRESHOLDS)
- `backend/constants.py:116-138` (classify_bedroom)

```python
# classifier.py SIMPLE_THRESHOLDS
1: 580,   # 1-Bedroom: < 580 sqft
2: 800,   # 2-Bedroom: 580 - 800 sqft

# constants.py classify_bedroom
if area_sqft < 580:
    return 1
elif area_sqft < 800:
    return 2
```

**Issue:** Two implementations of simple bedroom classification with same thresholds, but they could drift. `constants.py` has its own `classify_bedroom` that may not be used consistently.

**Impact:** Risk of threshold drift if one is updated without the other.

**Severity:** 🟡 MEDIUM - Code smell, potential future bug.

---

#### B11. Contract Date Format Inconsistency
**File:** `backend/services/data_loader.py:240`

```python
df['contract_date'] = df['transaction_date'].str[5:7] + df['transaction_date'].str[2:4]
```

**Issue:** Creates MMYY format (e.g., "1024" for October 2024), but column docstring says "MMYY format" while the actual format is month-first.

**Verification Needed:** Is "1024" October 2024 or October 1924? The format loses century information.

**Severity:** 🟡 MEDIUM - Potential Y2K-style bug for 2100+ dates.

---

#### B12. Tenure Matching Uses Remaining Lease = 999 for Freehold
**File:** `backend/services/dashboard_service.py:361-371`

```python
if tenure_lower == 'freehold':
    conditions.append(or_(
        Transaction.tenure.ilike('%freehold%'),
        Transaction.remaining_lease == 999
    ))
```

**Issue:** 999-year leasehold properties (which exist in Singapore) would match "Freehold" filter since they also have `remaining_lease = 999`.

**Impact:** 999-year leasehold condos appear in "Freehold" filter results.

**Severity:** 🟡 MEDIUM - Incorrect filter behavior.

---

#### B13. Floor Level Classification Boundary Cases
**File:** `backend/services/classifier_extended.py:191-256`

```python
if low_floor <= 5:
    return "Low"
if low_floor <= 10:
    return "Mid-Low"
```

**Issue:** Floor 5 is "Low", Floor 6 is "Mid-Low". This means "01 to 05" is "Low" but "05 to 10" is "Low" (uses lower bound 5). Inconsistent for ranges spanning boundaries.

**Impact:** Floor range "05 to 10" classified as "Low" when it should arguably be split.

**Severity:** 🟢 LOW - Minor edge case.

---

### LOW (Cleanup)

#### B14. Hardcoded 99-Year Lease Calculation
**File:** `scripts/upload.py:317`

```python
remaining_lease = 99 - (current_year - year)
```

**Issue:** Assumes all leases are 99 years. Doesn't handle 999-year leases correctly.

**Severity:** 🟢 LOW - 999-year leases rare and effectively infinite.

---

#### B15. Silent Type Coercion in Safe Functions
**File:** `scripts/upload.py:279-296`

```python
def _safe_float(value, default=0.0) -> float:
    if pd.isna(value) or value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default
```

**Issue:** Silent coercion with default values. "invalid" becomes 0.0 without logging.

**Severity:** 🟢 LOW - Works as designed but could hide data issues.

---

#### B16. Naming Inconsistency: segment vs segments
**Files:**
- Backend: `segment` (singular) in some places, `segments` (plural) in others
- Frontend: `segments` (plural) in PowerBIFilterContext

```python
# dashboard_service.py:314-316
segments = filters.get('segments', [])
if not segments:
    single_segment = filters.get('segment')  # Backwards compat
```

**Impact:** Minor confusion but handled correctly.

**Severity:** 🟢 LOW - Naming inconsistency.

---

## C) Minimal Fixes

### Fix for B1 & B2: Add True Median Calculation (CRITICAL)

**File:** `backend/services/dashboard_service.py`

**Approach:** Use PostgreSQL `PERCENTILE_CONT` for true median. Replace in `query_time_series`:

```python
# BEFORE (line 452-458)
query = db.session.query(
    period_expr.label('period'),
    func.count(Transaction.id).label('count'),
    func.avg(Transaction.psf).label('avg_psf'),
    ...
)

# AFTER - Use raw SQL with PERCENTILE_CONT
# Option 1: Add a separate median query
median_sql = text("""
    SELECT period, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
    FROM (
        SELECT {period_expr} as period, psf FROM transactions
        WHERE {where_clause}
    ) t
    GROUP BY period
""")
```

**Minimal diff:** Add explicit comment that `median_psf` is approximation OR implement true median.

```diff
# backend/services/dashboard_service.py:472-473
-            'median_psf': round(r.avg_psf, 2) if r.avg_psf else None,  # Use avg as median approximation
+            'median_psf': round(r.avg_psf, 2) if r.avg_psf else None,  # WARNING: This is AVG, not true median (PERCENTILE_CONT)
```

---

### Fix for B4: Standardize IQR Multiplier

**File:** `backend/services/data_validation.py`

```diff
# Line 49 - Match upload.py's 5x multiplier
- lower_bound = q1 - 1.5 * iqr
- upper_bound = q3 + 1.5 * iqr
+ IQR_MULTIPLIER = 5.0  # Match upload.py - relaxed to include luxury condos
+ lower_bound = q1 - IQR_MULTIPLIER * iqr
+ upper_bound = q3 + IQR_MULTIPLIER * iqr
```

---

### Fix for B7 & B8: Use None Instead of Default Values

**File:** `backend/services/data_loader.py`

```diff
# Line 287 - nett_price
-.fillna(0)
+# Don't fillna - preserve NULL semantics

# Line 339 - num_units
-.fillna(1).astype(int)
+.astype('Int64')  # Nullable integer type, preserves NaN
```

---

### Fix for B12: Separate Freehold from 999-year Leasehold

**File:** `backend/services/dashboard_service.py`

```diff
# Line 361-371
if tenure_lower == 'freehold':
    conditions.append(or_(
        Transaction.tenure.ilike('%freehold%'),
-       Transaction.remaining_lease == 999
+       and_(
+           Transaction.remaining_lease == 999,
+           ~Transaction.tenure.ilike('%999%')  # Exclude 999-year leasehold
+       )
    ))
+elif tenure_lower in ['999-year', '999']:
+    conditions.append(Transaction.tenure.ilike('%999%'))
```

---

## D) Test Plan

### D1. Unit Tests (per function)

#### Bedroom Classification Tests
```python
# tests/test_classifier.py
import pytest
from services.classifier import classify_bedroom, classify_bedroom_three_tier
import pandas as pd

class TestBedroomClassification:

    def test_simple_classification_boundaries(self):
        """Test boundary conditions for simple classifier"""
        assert classify_bedroom(579) == 1   # Just below 580
        assert classify_bedroom(580) == 2   # At boundary (should be 2)
        assert classify_bedroom(799) == 2   # Just below 800
        assert classify_bedroom(800) == 3   # At boundary

    def test_three_tier_post_harmonization(self):
        """Post-June 2023 New Sale should use TIER1 thresholds"""
        sale_date = pd.Timestamp('2023-07-01')
        assert classify_bedroom_three_tier(579, 'New Sale', sale_date) == 1
        assert classify_bedroom_three_tier(580, 'New Sale', sale_date) == 2
        assert classify_bedroom_three_tier(780, 'New Sale', sale_date) == 3

    def test_three_tier_pre_harmonization(self):
        """Pre-June 2023 New Sale should use TIER2 thresholds"""
        sale_date = pd.Timestamp('2023-05-01')
        assert classify_bedroom_three_tier(599, 'New Sale', sale_date) == 1
        assert classify_bedroom_three_tier(600, 'New Sale', sale_date) == 2

    def test_resale_uses_tier3(self):
        """Resale transactions always use TIER3 regardless of date"""
        sale_date = pd.Timestamp('2024-01-01')
        assert classify_bedroom_three_tier(599, 'Resale', sale_date) == 1
        assert classify_bedroom_three_tier(600, 'Resale', sale_date) == 2
        assert classify_bedroom_three_tier(950, 'Resale', sale_date) == 3
```

#### Floor Level Classification Tests
```python
# tests/test_classifier_extended.py
from services.classifier_extended import classify_floor_level

class TestFloorLevelClassification:

    def test_floor_boundaries(self):
        assert classify_floor_level("01 to 05") == "Low"
        assert classify_floor_level("06 to 10") == "Mid-Low"
        assert classify_floor_level("11 to 15") == "Mid"
        assert classify_floor_level("21 to 25") == "Mid-High"
        assert classify_floor_level("31 to 35") == "High"
        assert classify_floor_level("41 to 45") == "Luxury"

    def test_basement_handling(self):
        assert classify_floor_level("B1") == "Low"
        assert classify_floor_level("B2 to B1") == "Low"

    def test_null_handling(self):
        assert classify_floor_level(None) == "Unknown"
        assert classify_floor_level("") == "Unknown"
```

#### Date Parsing Tests
```python
# tests/test_data_loader.py
from services.data_loader import parse_date_flexible

class TestDateParsing:

    def test_abbreviated_month_year(self):
        assert parse_date_flexible("Dec-20") == (2020, 12)
        assert parse_date_flexible("Jan-99") == (2099, 1)  # Potential issue!

    def test_full_month_year(self):
        assert parse_date_flexible("October 2023") == (2023, 10)
        assert parse_date_flexible("Mar 2021") == (2021, 3)

    def test_iso_format(self):
        assert parse_date_flexible("2023-10-15") == (2023, 10)

    def test_null_handling(self):
        assert parse_date_flexible(None) == (None, None)
        assert parse_date_flexible("") == (None, None)
        assert parse_date_flexible("nan") == (None, None)
```

### D2. DB Constraints & Indexes

```sql
-- Verify existing constraints
SELECT
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_name = 'transactions';

-- Add missing NOT NULL constraints (if safe)
-- CAUTION: Run on staging first
ALTER TABLE transactions
    ALTER COLUMN project_name SET NOT NULL,
    ALTER COLUMN transaction_date SET NOT NULL,
    ALTER COLUMN price SET NOT NULL,
    ALTER COLUMN area_sqft SET NOT NULL,
    ALTER COLUMN psf SET NOT NULL,
    ALTER COLUMN district SET NOT NULL,
    ALTER COLUMN bedroom_count SET NOT NULL;

-- Add check constraints for valid ranges
ALTER TABLE transactions
    ADD CONSTRAINT check_price_positive CHECK (price > 0),
    ADD CONSTRAINT check_area_positive CHECK (area_sqft > 0),
    ADD CONSTRAINT check_psf_positive CHECK (psf > 0),
    ADD CONSTRAINT check_bedroom_valid CHECK (bedroom_count BETWEEN 1 AND 5);

-- Verify indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'transactions';

-- Required indexes for performance
CREATE INDEX IF NOT EXISTS ix_transactions_project_name ON transactions(project_name);
CREATE INDEX IF NOT EXISTS ix_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS ix_transactions_district ON transactions(district);
CREATE INDEX IF NOT EXISTS ix_transactions_bedroom_count ON transactions(bedroom_count);
CREATE INDEX IF NOT EXISTS ix_transactions_is_outlier ON transactions(is_outlier);
CREATE INDEX IF NOT EXISTS ix_transactions_floor_level ON transactions(floor_level);

-- Partial index for common query pattern (non-outliers only)
CREATE INDEX IF NOT EXISTS ix_transactions_active
    ON transactions(transaction_date, district, bedroom_count)
    WHERE is_outlier = false OR is_outlier IS NULL;
```

### D3. Reconciliation Queries

```sql
-- 1. Before/After Upload Counts
-- Run before upload
SELECT 'BEFORE' as stage, COUNT(*) as total_count FROM transactions;

-- Run after upload
SELECT 'AFTER' as stage, COUNT(*) as total_count FROM transactions;

-- 2. Outlier Detection Verification
SELECT
    is_outlier,
    COUNT(*) as count,
    AVG(price) as avg_price,
    MIN(price) as min_price,
    MAX(price) as max_price
FROM transactions
GROUP BY is_outlier;

-- 3. District Distribution Check
SELECT
    district,
    COUNT(*) as count,
    AVG(psf) as avg_psf
FROM transactions
WHERE is_outlier = false OR is_outlier IS NULL
GROUP BY district
ORDER BY district;

-- 4. Sale Type Distribution
SELECT
    sale_type,
    COUNT(*) as count,
    SUM(price) as total_value
FROM transactions
WHERE is_outlier = false OR is_outlier IS NULL
GROUP BY sale_type;

-- 5. Null/Missing Data Audit
SELECT
    'project_name' as column_name, COUNT(*) as null_count FROM transactions WHERE project_name IS NULL
UNION ALL SELECT 'street_name', COUNT(*) FROM transactions WHERE street_name IS NULL
UNION ALL SELECT 'floor_range', COUNT(*) FROM transactions WHERE floor_range IS NULL
UNION ALL SELECT 'floor_level', COUNT(*) FROM transactions WHERE floor_level IS NULL
UNION ALL SELECT 'nett_price', COUNT(*) FROM transactions WHERE nett_price IS NULL
UNION ALL SELECT 'market_segment', COUNT(*) FROM transactions WHERE market_segment IS NULL
UNION ALL SELECT 'num_units', COUNT(*) FROM transactions WHERE num_units IS NULL;

-- 6. Median vs Average Comparison (for B1/B2 validation)
SELECT
    'Overall' as scope,
    AVG(psf) as average_psf,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as true_median_psf,
    ABS(AVG(psf) - PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf)) as difference
FROM transactions
WHERE is_outlier = false OR is_outlier IS NULL;

-- 7. Bedroom Distribution by Classification
SELECT
    bedroom_count,
    COUNT(*) as count,
    AVG(area_sqft) as avg_area,
    MIN(area_sqft) as min_area,
    MAX(area_sqft) as max_area
FROM transactions
WHERE is_outlier = false OR is_outlier IS NULL
GROUP BY bedroom_count
ORDER BY bedroom_count;

-- 8. Duplicate Detection (should be 0 after dedup)
SELECT
    project_name,
    transaction_date,
    price,
    area_sqft,
    COALESCE(floor_range, '') as floor_range,
    COUNT(*) as duplicate_count
FROM transactions
GROUP BY project_name, transaction_date, price, area_sqft, COALESCE(floor_range, '')
HAVING COUNT(*) > 1
LIMIT 20;

-- 9. Date Range Verification
SELECT
    MIN(transaction_date) as earliest_date,
    MAX(transaction_date) as latest_date,
    COUNT(DISTINCT DATE_TRUNC('month', transaction_date)) as distinct_months
FROM transactions
WHERE is_outlier = false OR is_outlier IS NULL;

-- 10. PSF Sanity Check (outliers that weren't caught)
SELECT *
FROM transactions
WHERE psf < 100 OR psf > 20000
  AND (is_outlier = false OR is_outlier IS NULL)
LIMIT 20;
```

### D4. Sentinel Rows & Expected Outputs

```sql
-- Create sentinel rows table for regression testing
CREATE TABLE IF NOT EXISTS test_sentinel_transactions (
    id SERIAL PRIMARY KEY,
    test_case VARCHAR(100),
    expected_bedroom_count INT,
    expected_floor_level VARCHAR(20),
    expected_district VARCHAR(10),
    project_name VARCHAR(255),
    area_sqft FLOAT,
    floor_range VARCHAR(50),
    sale_type VARCHAR(50),
    transaction_date DATE,
    price FLOAT
);

-- Insert sentinel test cases
INSERT INTO test_sentinel_transactions
    (test_case, expected_bedroom_count, expected_floor_level, expected_district,
     project_name, area_sqft, floor_range, sale_type, transaction_date, price)
VALUES
    -- Bedroom classification edge cases
    ('1BR boundary (579 sqft)', 1, 'Low', 'D09', 'TEST_SENTINEL_A', 579, '01 to 05', 'Resale', '2024-01-01', 500000),
    ('2BR boundary (580 sqft)', 2, 'Low', 'D09', 'TEST_SENTINEL_B', 580, '01 to 05', 'Resale', '2024-01-01', 600000),
    ('Post-harmonization 2BR', 2, 'Mid', 'D10', 'TEST_SENTINEL_C', 600, '11 to 15', 'New Sale', '2023-07-15', 800000),
    ('Pre-harmonization 2BR', 2, 'High', 'D11', 'TEST_SENTINEL_D', 700, '31 to 35', 'New Sale', '2023-05-01', 900000),

    -- Floor level edge cases
    ('Low floor (05)', 3, 'Low', 'D15', 'TEST_SENTINEL_E', 1000, '05 to 05', 'Resale', '2024-01-01', 1200000),
    ('Mid-Low floor (06)', 3, 'Mid-Low', 'D15', 'TEST_SENTINEL_F', 1000, '06 to 10', 'Resale', '2024-01-01', 1250000),
    ('Luxury floor (45)', 4, 'Luxury', 'D01', 'TEST_SENTINEL_G', 1400, '41 to 45', 'New Sale', '2024-01-01', 5000000),

    -- District/Segment mapping
    ('CCR district D09', 3, 'Mid', 'D09', 'TEST_SENTINEL_H', 1100, '11 to 15', 'Resale', '2024-01-01', 2000000),
    ('RCR district D15', 3, 'Mid', 'D15', 'TEST_SENTINEL_I', 1100, '11 to 15', 'Resale', '2024-01-01', 1500000),
    ('OCR district D22', 3, 'Mid', 'D22', 'TEST_SENTINEL_J', 1100, '11 to 15', 'Resale', '2024-01-01', 1000000);

-- Validation query after each upload
SELECT
    st.test_case,
    t.bedroom_count = st.expected_bedroom_count as bedroom_correct,
    t.floor_level = st.expected_floor_level as floor_correct,
    t.district = st.expected_district as district_correct,
    CASE
        WHEN t.id IS NULL THEN 'MISSING'
        WHEN t.bedroom_count = st.expected_bedroom_count
             AND t.floor_level = st.expected_floor_level
             AND t.district = st.expected_district
        THEN 'PASS'
        ELSE 'FAIL'
    END as status,
    t.bedroom_count as actual_bedroom,
    t.floor_level as actual_floor_level
FROM test_sentinel_transactions st
LEFT JOIN transactions t
    ON t.project_name = st.project_name
    AND t.transaction_date = st.transaction_date
ORDER BY st.id;
```

### D5. API Response Validation Tests

```python
# tests/test_api_analytics.py
import pytest
from app import create_app

@pytest.fixture
def client():
    app = create_app()
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

class TestDashboardAPI:

    def test_dashboard_returns_all_panels(self, client):
        """Dashboard should return all requested panels"""
        response = client.get('/api/dashboard?panels=time_series,summary,volume_by_location')
        assert response.status_code == 200
        data = response.get_json()

        assert 'data' in data
        assert 'time_series' in data['data']
        assert 'summary' in data['data']
        assert 'volume_by_location' in data['data']

    def test_district_filter_format(self, client):
        """District filter should accept comma-separated values"""
        response = client.get('/api/dashboard?district=D09,D10&panels=summary')
        assert response.status_code == 200
        data = response.get_json()

        # Verify filter was applied
        assert data['meta']['filters_applied']['districts'] == ['D09', 'D10']

    def test_segment_mapping(self, client):
        """Segment filter should map to correct districts"""
        response = client.get('/api/dashboard?segment=CCR&panels=summary')
        assert response.status_code == 200

        # CCR should include D01, D02, D06, D07, D09, D10, D11

    def test_median_vs_average_documented(self, client):
        """Verify median_psf field includes documentation about approximation"""
        response = client.get('/api/dashboard?panels=time_series')
        data = response.get_json()

        # Note: Currently median_psf = avg_psf (see Finding B1)
        # This test documents current behavior
        if data['data']['time_series']:
            first_period = data['data']['time_series'][0]
            assert 'avg_psf' in first_period
            assert 'median_psf' in first_period

    def test_cache_metadata(self, client):
        """Response should include cache hit metadata"""
        # First request - cache miss
        response1 = client.get('/api/dashboard?district=D09&panels=summary')
        data1 = response1.get_json()
        assert data1['meta']['cache_hit'] == False

        # Second request - cache hit
        response2 = client.get('/api/dashboard?district=D09&panels=summary')
        data2 = response2.get_json()
        assert data2['meta']['cache_hit'] == True
```

---

## E) Naming/Dimension Standard

### Canonical Column Names (DB ↔ API ↔ Frontend)

| CSV Column | DB Column | API Response Key | Frontend State Key | Notes |
|------------|-----------|------------------|-------------------|-------|
| Project Name | `project_name` | `project_name` | (in response) | Required |
| Street Name | `street_name` | `street_name` | (in response) | NEW |
| Property Type | `property_type` | `property_type` | (in response) | |
| Postal District | `district` | `district` | `districts[]` | Normalized to D01-D28 |
| Market Segment | `market_segment` | `market_segment` | `segments[]` | CCR/RCR/OCR |
| Tenure | `tenure` | `tenure` | `tenure` | Raw text |
| Type of Sale | `sale_type` | `sale_type` | `saleType` | camelCase in frontend |
| Number of Units | `num_units` | `num_units` | (in response) | NEW |
| Nett Price($) | `nett_price` | `nett_price` | (in response) | NEW |
| Transacted Price ($) | `price` | `price` | (in response) | Required |
| Area (SQFT) | `area_sqft` | `area_sqft` | `sizeRange` | Filter uses range |
| Type of Area | `type_of_area` | `type_of_area` | (in response) | Strata/Land |
| Unit Price ($ PSF) | `psf` | `psf` | `psfRange` | Filter uses range |
| Sale Date | `transaction_date` | `transaction_date` | `dateRange` | YYYY-MM-DD |
| Floor Level | `floor_range` | `floor_range` | (in response) | Raw: "01 to 05" |
| (computed) | `floor_level` | `floor_level` | (in response) | Tier: Low/Mid/High |
| (computed) | `bedroom_count` | `bedroom_count` | `bedroomTypes[]` | 1-5 |
| (computed) | `contract_date` | `contract_date` | (in response) | MMYY format |
| (computed) | `lease_start_year` | `lease_start_year` | (in response) | Year integer |
| (computed) | `remaining_lease` | `remaining_lease` | (in response) | Years integer |
| (flag) | `is_outlier` | `is_outlier` | (excluded) | Soft delete |

### Filter Parameter Naming

| Frontend Context Key | API Query Param | Notes |
|---------------------|-----------------|-------|
| `dateRange.start` | `date_from` | YYYY-MM-DD |
| `dateRange.end` | `date_to` | YYYY-MM-DD |
| `districts[]` | `district` | Comma-separated: D01,D02,D09 |
| `segments[]` | `segment` | Comma-separated: CCR,RCR,OCR |
| `bedroomTypes[]` | `bedroom` | Comma-separated: 1,2,3,4,5 |
| `saleType` | `sale_type` | 'New Sale' or 'Resale' |
| `psfRange.min` | `psf_min` | Float |
| `psfRange.max` | `psf_max` | Float |
| `sizeRange.min` | `size_min` | Float (sqft) |
| `sizeRange.max` | `size_max` | Float (sqft) |
| `tenure` | `tenure` | 'Freehold', '99-year', '999-year' |
| `propertyAge.min` | `property_age_min` | Integer (years) |
| `propertyAge.max` | `property_age_max` | Integer (years) |
| `project` | `project` | Partial match search |
| (drill-through) | `project_exact` | Exact match |

### Dashboard Options

| Frontend Prop | API Query Param | Valid Values | Default |
|---------------|-----------------|--------------|---------|
| `timeGrouping` | `time_grain` | year, quarter, month | month |
| `locationGrain` | `location_grain` | region, district, project | region |
| (histogram) | `histogram_bins` | 1-50 | 20 |
| (panels) | `panels` | time_series, volume_by_location, price_histogram, bedroom_mix, sale_type_breakdown, summary | all |

### District to Region Mapping (SINGLE SOURCE OF TRUTH: `backend/constants.py`)

| Region | Districts |
|--------|-----------|
| CCR | D01, D02, D06, D07, D09, D10, D11 |
| RCR | D03, D04, D05, D08, D12, D13, D14, D15, D20 |
| OCR | D16, D17, D18, D19, D21, D22, D23, D24, D25, D26, D27, D28 |

---

## Summary

| Severity | Count | Key Issues |
|----------|-------|------------|
| 🔴 CRITICAL | 2 | Median labeled as Average (B1, B2) |
| 🟠 HIGH | 2 | IQR multiplier inconsistency (B4), Duplicate key missing floor (B3) |
| 🟡 MEDIUM | 8 | Null semantics, Date day logic, Tenure filter, etc. |
| 🟢 LOW | 4 | Naming, hardcoded values, silent coercion |

**Recommended Priority:**
1. Fix B1 & B2 (median labeling) - either rename to "Average" or implement true median
2. Standardize IQR multiplier (B4)
3. Fix tenure filter for 999-year (B12)
4. Add DB constraints (D2)
5. Implement sentinel row testing (D4)
