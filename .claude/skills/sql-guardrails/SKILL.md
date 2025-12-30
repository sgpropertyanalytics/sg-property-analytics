---
name: sql-guardrails
description: Backend SQL and data-access guardrails. ALWAYS activate before writing or modifying ANY SQL queries, service functions, or route handlers. Enforces parameter style (:param only), date handling (Python objects), enum normalization (contract_schema.py), outlier filtering (COALESCE), and v2 API compliance. Use before AND after any backend SQL changes.
---

# SQL & Backend Guardrails

> **Full documentation**: See [SQL_BEST_PRACTICES.md](../../../SQL_BEST_PRACTICES.md) for complete reference.

## Purpose

Prevent SQL-related bugs and ensure v2 API contract compliance. This skill acts as a guardrail for all backend database operations.

---

## Part 1: Mandatory Checks Before Writing SQL

### When This Activates

- Writing or modifying SQL queries (raw or ORM)
- Creating or updating service functions that touch the database
- Adding new API endpoints
- Refactoring existing database logic

### The "Must Do" Checklist

```
✅ EVERY SQL QUERY MUST:

├── Parameter Style
│   ├── Use :param bind parameters ONLY
│   ├── NO %(param)s (psycopg2-specific)
│   └── NO f-string interpolation
│
├── Date Parameters
│   ├── Pass Python date/datetime objects
│   ├── NO string dates ("2024-01-01")
│   └── NO ::date casting unless schema mismatch
│
├── Enum Values
│   ├── Use contract_schema.py methods
│   ├── SaleType.to_db() for DB values
│   └── NO hardcoded strings ('Resale', 'New Sale')
│
├── Outlier Filtering
│   └── Use COALESCE(is_outlier, false) = false
│
└── Location
    ├── SQL in services/*_service.py
    ├── Pure logic in *_compute.py
    └── Routes: parse params → call service → return
```

---

## Part 2: Forbidden Patterns

### Immediately Reject Code That Contains:

```python
# ❌ FORBIDDEN: psycopg2-style parameters
WHERE sale_type = %(sale_type)s

# ❌ FORBIDDEN: Mixed parameter styles
WHERE date >= :date_from AND type = %(type)s

# ❌ FORBIDDEN: f-string interpolation
query = f"WHERE psf > {min_psf}"

# ❌ FORBIDDEN: String dates
params = {"date_from": "2024-01-01"}

# ❌ FORBIDDEN: Hardcoded enum strings
if sale_type == 'New Sale':

# ❌ FORBIDDEN: OR IS NULL pattern
WHERE is_outlier = false OR is_outlier IS NULL
```

---

## Part 3: Correct Patterns

### SQL Parameter Style

```python
# ✅ CORRECT
query = text("""
    SELECT project, COUNT(*) as count
    FROM transactions
    WHERE COALESCE(is_outlier, false) = false
      AND sale_type = :sale_type
      AND transaction_date >= :date_from
      AND transaction_date <= :date_to
      AND psf > :psf_min
""")

params = {
    "sale_type": SaleType.to_db(SaleType.RESALE),
    "date_from": date(2023, 1, 1),
    "date_to": date.today(),
    "psf_min": 500
}

result = db.session.execute(query, params)
```

### Enum Handling

```python
# ✅ CORRECT - Backend
from api.contracts.contract_schema import SaleType

sale_type_db = SaleType.to_db(sale_type_enum)  # → "Resale"
```

```javascript
// ✅ CORRECT - Frontend
import { SaleType, isSaleType } from '../schemas/apiContract';

const isNew = isSaleType.newSale(row.saleType);
```

---

## Part 4: v2 API Compliance

### Endpoint Requirements

| Requirement | Implementation |
|-------------|----------------|
| Support `?schema=v2` | Check query param |
| Default: dual-mode | Both snake_case + camelCase |
| v2: strict mode | camelCase only, enums only |

### Response Pattern

```python
# Default response (backward compatible)
{
    "median_psf": 1500,    # v1 (deprecated)
    "medianPsf": 1500,     # v2
}

# With ?schema=v2
{
    "medianPsf": 1500      # v2 only
}
```

---

## Part 5: Pre-Commit Validation

### Before Any Backend Change, Verify:

1. **Parameter Style**: No `%(...)s` in any SQL
2. **Date Types**: All date params are Python objects
3. **Enum Usage**: No hardcoded DB strings
4. **Outlier Filter**: Uses `COALESCE` pattern
5. **File Location**: SQL in services, not routes
6. **v2 Compliance**: New endpoints support `?schema=v2`

---

## Part 6: Placeholder/Param Validation

### The Problem

SQL placeholders (`:param`) are strings. Python dict keys are strings. No compiler catches mismatches.

```python
# BUG: SQL uses :max_date but params dict doesn't have it
sql = "WHERE date < :max_date_exclusive AND date > :max_date - INTERVAL '12 months'"
params = {"max_date_exclusive": tomorrow}  # ❌ Missing max_date!
```

### The Fix: Validate Before Execute

```python
import re

def validate_sql_params(sql: str, params: dict) -> None:
    """Fail fast if SQL placeholders don't match params."""
    placeholders = set(re.findall(r':([a-zA-Z_][a-zA-Z0-9_]*)', sql))
    param_keys = set(params.keys())

    missing = placeholders - param_keys
    if missing:
        raise ValueError(f"SQL placeholders missing from params: {missing}")

    unused = param_keys - placeholders
    if unused:
        # Warning only - unused params are safe but wasteful
        logger.warning(f"Unused params (not in SQL): {unused}")
```

**Where to add:** In your DB helper so ALL queries benefit automatically.

---

## Part 6b: Common Mistakes Quick Reference

| Anti-Pattern | Symptom | Grep to Find | Fix |
|--------------|---------|--------------|-----|
| `%(param)s` style | Works locally, breaks in prod | `grep -rn "%(.*)" backend/` | Use `:param` style |
| String dates | Query returns wrong results | `grep -rn '"20[0-9][0-9]-' backend/services/` | Use Python `date()` objects |
| Hardcoded enums | Filter mismatches | `grep -rn "'Resale'\|'New Sale'" backend/` | Use `SaleType.to_db()` |
| Missing COALESCE | Outliers included | `grep -rn "is_outlier = false" backend/` | Use `COALESCE(is_outlier, false) = false` |
| Mixed date params | Silent data gaps | `grep -rn "max_date.*max_date_exclusive" backend/` | Pick ONE convention per query |
| SQL in routes | Scattered logic | `grep -rn "text\(" backend/routes/` | Move to services/ |

### Quick Audit Commands

```bash
# Find psycopg2-style params (FORBIDDEN)
grep -rn "%(" backend/services/ backend/routes/

# Find hardcoded date strings
grep -rn '"20[0-9][0-9]-[0-9][0-9]' backend/

# Find hardcoded sale type strings
grep -rn "'Resale'\|'New Sale'\|'Sub Sale'" backend/

# Find missing COALESCE on outliers
grep -rn "is_outlier = false" backend/ | grep -v COALESCE

# Find f-string interpolation in SQL (DANGEROUS)
grep -rn 'f".*WHERE\|f".*SELECT\|f".*FROM' backend/
```

---

## Part 7: Testing Requirements

### Required Tests for SQL Changes

```python
# Unit test: Pure computation
def test_calculate_metrics():
    result = calculate_metrics(sample_data)
    assert result['median'] == expected

# Integration test: Valid query
def test_endpoint_returns_data():
    response = client.get('/api/endpoint')
    assert response.status_code == 200

# Contract test: v2 shape
def test_v2_response_is_camel_case():
    response = client.get('/api/endpoint?schema=v2')
    data = response.json()
    assert 'medianPsf' in data
    assert 'median_psf' not in data
```

---

## Part 8: SQL Correctness Patterns

### Stable Keys for Joins

```sql
-- ❌ WRONG - display name changes break joins
SELECT * FROM transactions t
JOIN projects p ON t.project_name = p.project_name

-- ✅ CORRECT - stable identifier
SELECT * FROM transactions t
JOIN projects p ON t.project_id = p.project_id
```

### Deterministic Aggregations

```sql
-- ❌ WRONG - non-deterministic (arbitrary tie-break)
SELECT MODE() WITHIN GROUP (ORDER BY project_name) as canonical_name

-- ❌ WRONG - unordered array
SELECT array_agg(project_name) as names

-- ✅ CORRECT - explicit ordering/tie-break
SELECT project_name
FROM projects
ORDER BY transaction_count DESC, project_id  -- id breaks ties
LIMIT 1

-- ✅ CORRECT - ordered array
SELECT array_agg(project_name ORDER BY project_id) as names
```

### Two-Phase Pattern (Invariant Truth)

```sql
-- ❌ WRONG - filter changes the definition of launch_date
WITH filtered AS (
    SELECT * FROM transactions WHERE district = 'D01'
)
SELECT project_id, MIN(transaction_date) as launch_date
FROM filtered
GROUP BY project_id  -- Launch date shifts based on filter!

-- ✅ CORRECT - compute globally, then filter membership
WITH launch_dates AS (
    -- Phase A: Compute truth globally (no filters)
    SELECT project_id, MIN(transaction_date) as launch_date
    FROM transactions
    GROUP BY project_id
),
filtered_projects AS (
    -- Phase B: Filter is membership, not redefinition
    SELECT DISTINCT project_id
    FROM transactions
    WHERE district = 'D01'
)
SELECT ld.*
FROM launch_dates ld
WHERE ld.project_id IN (SELECT project_id FROM filtered_projects)
```

### Static SQL with NULL Guards

```sql
-- ❌ FORBIDDEN - Dynamic string building in Python
query = "SELECT * FROM txn WHERE 1=1"
if bedroom:
    query += f" AND bedroom = {bedroom}"  -- Injection risk!

-- ✅ CORRECT - Static SQL, all filters in one query
SELECT * FROM transactions
WHERE COALESCE(is_outlier, false) = false
  AND (:bedroom IS NULL OR bedroom = :bedroom)
  AND (:district IS NULL OR district = :district)
  AND (:date_from IS NULL OR transaction_date >= :date_from)
  AND (:date_to IS NULL OR transaction_date < :date_to)
```

### DB Does Set Work (No N+1)

```python
# ❌ WRONG - O(n²) Python loop
project_names = db.execute("SELECT DISTINCT project_name FROM txn").fetchall()
for name in project_names:
    units = db.execute("SELECT * FROM units WHERE project_name = :n", {"n": name})
    # N queries for N projects!

# ✅ CORRECT - Single bulk join
result = db.execute("""
    SELECT t.project_name, u.unit_info
    FROM (SELECT DISTINCT project_name FROM transactions) t
    LEFT JOIN units u ON t.project_name = u.project_name
""")
```

---

## Quick Reference Card

```
SQL GUARDRAILS CHECKLIST

[ ] :param style only (no %(param)s)
[ ] Python date objects (no strings)
[ ] Enums via contract_schema.py
[ ] COALESCE(is_outlier, false) = false
[ ] Parameterized numeric values
[ ] SQL in service files
[ ] Placeholders match params.keys()
[ ] Exclusive bounds only (:max_date_exclusive, not :max_date)
[ ] v2 endpoint support
[ ] Tests for v1, v2, edge cases
```

---

## Sign-Off Template

Before marking SQL work as complete:

```markdown
## SQL Change Sign-Off

### Change Summary
[Brief description]

### Guardrail Compliance
- [x] Parameter style: :param only
- [x] Date handling: Python objects
- [x] Enum handling: contract_schema.py
- [x] Outlier filter: COALESCE pattern
- [x] SQL location: services/ directory

### v2 Compliance
- [x] Supports ?schema=v2
- [x] Returns camelCase in v2 mode
- [x] Tests pass for both modes

Verified by: [name]
Date: [date]
```
