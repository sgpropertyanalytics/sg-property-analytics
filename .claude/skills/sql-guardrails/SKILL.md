---
name: sql-guardrails
description: Backend SQL and data-access guardrails. ALWAYS activate before writing or modifying ANY SQL queries, service functions, or route handlers. Enforces parameter style (:param only), date handling (Python objects), enum normalization (api_contract.py), outlier filtering (COALESCE), and v2 API compliance. Use before AND after any backend SQL changes.
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
│   ├── Use api_contract.py methods
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
from schemas.api_contract import SaleType

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

## Part 6: Testing Requirements

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

## Quick Reference Card

```
SQL GUARDRAILS CHECKLIST

[ ] :param style only (no %(param)s)
[ ] Python date objects (no strings)
[ ] Enums via api_contract.py
[ ] COALESCE(is_outlier, false) = false
[ ] Parameterized numeric values
[ ] SQL in service files
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
- [x] Enum handling: api_contract.py
- [x] Outlier filter: COALESCE pattern
- [x] SQL location: services/ directory

### v2 Compliance
- [x] Supports ?schema=v2
- [x] Returns camelCase in v2 mode
- [x] Tests pass for both modes

Verified by: [name]
Date: [date]
```
