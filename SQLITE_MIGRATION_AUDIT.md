# SQLite to PostgreSQL Migration Audit

## Executive Summary

This audit identifies all legacy SQLite dependencies that need to be migrated to PostgreSQL/SQLAlchemy. The codebase has been partially migrated, but several critical functions still use `sqlite3` directly instead of SQLAlchemy.

---

## Issues Found

### 1. **Direct SQLite3 Imports and Connections**

#### Issue #1: `backend/services/data_processor.py` - Line 11
**Current Code:**
```python
import sqlite3
```

**Impact:** Unnecessary import that should be removed once all SQLite usage is eliminated.

---

#### Issue #2: `backend/services/data_processor.py` - Line 20
**Current Code:**
```python
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'condo_master.db')
MASTER_TABLE = "transactions"  # Use SQLAlchemy transactions table (not legacy master_transactions)
```

**Impact:** Hardcoded SQLite file path that won't work on Render (ephemeral filesystem).

**Recommended Fix:**
```python
# Remove DB_PATH - use SQLAlchemy instead
# MASTER_TABLE can stay as a constant for reference
MASTER_TABLE = "transactions"
```

---

#### Issue #3: `backend/services/data_processor.py` - Lines 224-245
**Function:** `get_filtered_transactions()` - Fallback path when `GLOBAL_DF` is None

**Current Code:**
```python
# Fallback to database (for backward compatibility)
conn = sqlite3.connect(DB_PATH)

# Build SQL query with WHERE clauses for better performance
query = f"SELECT * FROM {MASTER_TABLE} WHERE 1=1"
params = []

# Apply district filter in SQL if provided
if districts:
    normalized_districts = []
    for d in districts:
        d = d.strip().upper()
        if not d.startswith("D"):
            d = f"D{d.zfill(2)}"
        normalized_districts.append(d)
    placeholders = ','.join(['?'] * len(normalized_districts))
    query += f" AND district IN ({placeholders})"
    params.extend(normalized_districts)

# Load data and parse dates
df = pd.read_sql_query(query, conn, params=params)
conn.close()
```

**Impact:** This fallback will fail on Render because SQLite file doesn't exist. Should use SQLAlchemy instead.

**Recommended Fix:**
```python
# Fallback to SQLAlchemy database query
from models.database import db
from models.transaction import Transaction
from sqlalchemy import and_

# Build query using SQLAlchemy
query = db.session.query(Transaction)

# Apply district filter
if districts:
    normalized_districts = []
    for d in districts:
        d = d.strip().upper()
        if not d.startswith("D"):
            d = f"D{d.zfill(2)}"
        normalized_districts.append(d)
    query = query.filter(Transaction.district.in_(normalized_districts))

# Apply date filters
if start_date:
    from datetime import datetime
    start_dt = datetime.strptime(start_date + "-01", "%Y-%m-%d")
    query = query.filter(Transaction.transaction_date >= start_dt)

if end_date:
    from datetime import datetime
    from calendar import monthrange
    year, month = map(int, end_date.split("-"))
    last_day = monthrange(year, month)[1]
    end_dt = datetime(year, month, last_day)
    query = query.filter(Transaction.transaction_date <= end_dt)

# Convert to DataFrame using SQLAlchemy
from sqlalchemy import text
df = pd.read_sql(query.statement, db.engine)

# Apply segment filter in pandas (after loading)
if segment:
    segment_upper = segment.strip().upper()
    if segment_upper in ["CCR", "RCR", "OCR"]:
        df["_market_segment"] = df["district"].apply(_get_market_segment)
        df = df[df["_market_segment"] == segment_upper]
        df = df.drop(columns=["_market_segment"])

# Add parsed_date
if "transaction_date" in df.columns:
    df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
    mask = df["parsed_date"].isna()
    if mask.any() and "contract_date" in df.columns:
        df.loc[mask, "parsed_date"] = df.loc[mask, "contract_date"].apply(parse_contract_date)
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')

df = df.dropna(subset=["parsed_date"])

# Apply limit
if limit and len(df) > limit:
    df = df.head(limit)
```

---

#### Issue #4: `backend/services/data_processor.py` - Lines 452-455
**Function:** `get_available_districts()` - Fallback path when `GLOBAL_DF` is None

**Current Code:**
```python
# Fallback to database
conn = sqlite3.connect(DB_PATH)
df = pd.read_sql_query(f"SELECT DISTINCT district FROM {MASTER_TABLE} ORDER BY district", conn)
conn.close()
return df["district"].tolist()
```

**Impact:** Will fail on Render when `GLOBAL_DF` is None.

**Recommended Fix:**
```python
# Fallback to SQLAlchemy
from models.database import db
from models.transaction import Transaction

districts = db.session.query(Transaction.district).distinct().order_by(Transaction.district).all()
return [d[0] for d in districts]  # Extract from tuple results
```

---

### 2. **Legacy Database Path References**

#### Issue #5: `backend/config.py` - Lines 12, 19
**Current Code:**
```python
DB_PATH = os.getenv('DB_PATH', 'condo_master.db')

SQLALCHEMY_DATABASE_URI = os.getenv(
    'DATABASE_URL',
    f'sqlite:///{os.path.join(os.path.dirname(__file__), os.getenv("DB_PATH", "condo_master.db"))}'
)
```

**Impact:** 
- `DB_PATH` is still referenced but only used for SQLite fallback (should be removed)
- The SQLite fallback in `SQLALCHEMY_DATABASE_URI` is fine for local development, but production should always use PostgreSQL

**Recommended Fix:**
```python
# Remove DB_PATH - no longer needed
# DB_PATH = os.getenv('DB_PATH', 'condo_master.db')  # REMOVE

# SQLAlchemy configuration
SQLALCHEMY_DATABASE_URI = os.getenv(
    'DATABASE_URL',
    f'sqlite:///{os.path.join(os.path.dirname(__file__), "condo_master.db")}'  # Local dev only
)
# Production (Render) should always set DATABASE_URL to PostgreSQL connection string
```

---

### 3. **GLOBAL_DF Usage Patterns**

#### Issue #6: `backend/services/data_processor.py` - Multiple locations
**Current Pattern:** Functions check `GLOBAL_DF` first, then fallback to SQLite

**Functions affected:**
1. `get_filtered_transactions()` - Lines 182-291
2. `get_available_districts()` - Lines 445-455

**Status:** ✅ **PARTIALLY FIXED** - `app.py` now initializes `GLOBAL_DF` at startup from PostgreSQL

**Remaining Issue:** The fallback paths still use SQLite instead of SQLAlchemy. These should be updated to use SQLAlchemy as a fallback.

**Recommendation:** 
- Keep `GLOBAL_DF` pattern for performance (in-memory is faster)
- But replace SQLite fallback with SQLAlchemy fallback
- This ensures it works even if `GLOBAL_DF` initialization fails

---

### 4. **Functions That Should Use SQLAlchemy**

#### Issue #7: `backend/services/data_processor.py` - `get_filtered_transactions()`
**Status:** ⚠️ **NEEDS MIGRATION** - Fallback uses SQLite

**Action Required:** Replace SQLite fallback with SQLAlchemy (see Issue #3 above)

---

#### Issue #8: `backend/services/data_processor.py` - `get_available_districts()`
**Status:** ⚠️ **NEEDS MIGRATION** - Fallback uses SQLite

**Action Required:** Replace SQLite fallback with SQLAlchemy (see Issue #4 above)

---

## Migration Plan

### Phase 1: Remove SQLite Dependencies (High Priority)

1. **Update `get_filtered_transactions()` fallback** (Issue #3)
   - Replace `sqlite3.connect(DB_PATH)` with SQLAlchemy query
   - Use `db.session.query(Transaction)` pattern
   - Convert to DataFrame using `pd.read_sql(query.statement, db.engine)`

2. **Update `get_available_districts()` fallback** (Issue #4)
   - Replace SQLite query with `db.session.query(Transaction.district).distinct()`
   - Return list directly from SQLAlchemy results

3. **Remove SQLite imports** (Issue #1)
   - Remove `import sqlite3` from `data_processor.py`
   - Remove `DB_PATH` constant (Issue #2)

4. **Clean up config.py** (Issue #5)
   - Remove `DB_PATH` from Config class
   - Keep SQLite fallback in `SQLALCHEMY_DATABASE_URI` for local dev only
   - Document that production must use PostgreSQL

### Phase 2: Testing & Validation

1. **Test locally with SQLite** (fallback mode)
   - Ensure functions work when `GLOBAL_DF` is None
   - Verify SQLAlchemy queries work correctly

2. **Test on Render with PostgreSQL**
   - Verify `GLOBAL_DF` initialization works
   - Test fallback paths if `GLOBAL_DF` fails to load
   - Ensure no SQLite dependencies remain

3. **Performance testing**
   - Compare `GLOBAL_DF` (in-memory) vs SQLAlchemy fallback performance
   - Document performance characteristics

### Phase 3: Documentation & Cleanup

1. **Update function docstrings**
   - Document that fallback uses SQLAlchemy, not SQLite
   - Remove references to SQLite in comments

2. **Remove debug code**
   - Remove debug prints from `routes/analytics.py` (lines 184-190)
   - Clean up any temporary logging

3. **Update architecture docs**
   - Document that all database access uses SQLAlchemy
   - Note that `GLOBAL_DF` is a performance optimization, not a requirement

---

## Implementation Priority

### 🔴 Critical (Must Fix Before Production)
1. Issue #3: `get_filtered_transactions()` SQLite fallback
2. Issue #4: `get_available_districts()` SQLite fallback

### 🟡 Important (Should Fix Soon)
3. Issue #1: Remove `sqlite3` import
4. Issue #2: Remove `DB_PATH` constant
5. Issue #5: Clean up `config.py`

### 🟢 Nice to Have (Can Wait)
6. Remove debug code
7. Update documentation

---

## Testing Checklist

After migration, verify:

- [ ] `get_filtered_transactions()` works when `GLOBAL_DF` is None (SQLAlchemy fallback)
- [ ] `get_available_districts()` works when `GLOBAL_DF` is None (SQLAlchemy fallback)
- [ ] All API endpoints work on Render (PostgreSQL)
- [ ] Local development still works (SQLite fallback in config)
- [ ] No `sqlite3` imports remain
- [ ] No references to `condo_master.db` file paths
- [ ] Performance is acceptable (GLOBAL_DF vs SQLAlchemy)

---

## Notes

- **GLOBAL_DF Pattern:** The in-memory DataFrame pattern is kept for performance. This is fine as long as the fallback uses SQLAlchemy.
- **Backward Compatibility:** The migration maintains backward compatibility by keeping the same function signatures.
- **Render Deployment:** After migration, Render will work correctly because all database access uses SQLAlchemy (which supports PostgreSQL).

