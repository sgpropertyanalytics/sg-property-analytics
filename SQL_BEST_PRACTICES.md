# SQL & Backend Refactoring Best Practices

> **Post-v2 Contract Stabilization**
>
> This document defines non-negotiable backend SQL and data-access rules to prevent regression after the v2 API contract migration.

---

## Table of Contents

1. [SQL Parameter Style](#1-sql-parameter-style-mandatory)
2. [Date Handling](#2-date-handling-critical)
3. [Sale Type / Enum Handling](#3-sale-type--enum-handling)
4. [Outlier Filtering](#4-outlier-filtering-consistent-rule)
5. [Parameterized Numeric Guards](#5-parameterized-numeric-guards)
6. [SQL Construction Discipline](#6-sql-construction-discipline)
7. [API Versioning Discipline](#7-api-versioning-discipline)
8. [Guardrails](#8-guardrails-non-optional)
9. [Testing Requirements](#9-testing-requirements)
10. [Root Cause Analysis](#10-root-cause-lesson)
11. [Engineering Principle](#11-final-engineering-principle)

---

## 1. SQL Parameter Style (MANDATORY)

### Use SQLAlchemy bind parameters (`:param`) ONLY

**Allowed:**

```sql
WHERE sale_type = :sale_type
  AND transaction_date >= :date_from
  AND transaction_date <= :date_to
```

**Forbidden:**

```sql
%(sale_type)s                    -- psycopg2-specific
:date_from mixed with %(sale_type)s  -- mixed styles
f"psf > {PSF_MIN}"               -- f-string interpolation
```

### Why This Matters

| Reason | Explanation |
|--------|-------------|
| Compatible with `sqlalchemy.text()` | Works across all SQLAlchemy execution paths |
| Database-agnostic | Not psycopg2-specific, portable to other drivers |
| Supports safe casting and typing | Parameter types handled correctly |
| Prevents runtime syntax errors | No format string injection issues |

### Rule

> **Never mix `:param` and `%(param)s` in the same query.**

---

## 2. Date Handling (CRITICAL)

### Pass Python `date` / `datetime` Objects

```python
# ✅ CORRECT
params = {
    "date_from": date(2023, 1, 1),
    "date_to": date.today(),
}
```

### Do NOT Pass Date Strings

```python
# ❌ FORBIDDEN
params = {
    "date_from": "2024-01-01",  # String - don't do this
}
```

### Casting Rules

**No `::date` casting needed if:**

- DB column is `DATE` or `TIMESTAMP`
- Params are Python `date` / `datetime` objects

**Only use casting if:**

- Schema mismatch exists (rare, document explicitly)

---

## 3. Sale Type / Enum Handling

### Always Normalize Through API Contract Enums

**Backend:**

```python
from schemas.api_contract import SaleType

# ✅ CORRECT - Use contract methods
sale_type_db = SaleType.to_db(SaleType.RESALE)  # → "Resale"
```

**Never:**

```python
# ❌ FORBIDDEN - Hardcoded strings
sale_type = 'Resale'
```

### Reason

| Issue | Impact |
|-------|--------|
| Case sensitivity bugs | `'resale'` ≠ `'Resale'` |
| Scattered enum mapping | Hard to find/update mappings |
| v1/v2 compatibility | Contract ensures both versions work |

---

## 4. Outlier Filtering (CONSISTENT RULE)

### Always Use `COALESCE`

```sql
-- ✅ CORRECT
COALESCE(is_outlier, false) = false
```

### Forbidden Pattern

```sql
-- ❌ FORBIDDEN
is_outlier = false OR is_outlier IS NULL
```

### Reason

| Aspect | `COALESCE` | `OR IS NULL` |
|--------|------------|--------------|
| Simplicity | Single condition | Multiple conditions |
| Index-friendly | Yes | May prevent index use |
| Semantic consistency | Clear default | Ambiguous intent |

---

## 5. Parameterized Numeric Guards

### Use Bind Parameters for All Values

```python
# ✅ CORRECT
query = """
    AND psf > :psf_min
    AND psf < :psf_max
"""
params = {"psf_min": PSF_MIN, "psf_max": PSF_MAX}
```

### Forbidden Pattern

```python
# ❌ FORBIDDEN - f-string interpolation
query = f"psf > {PSF_MIN}"
```

### Reason

| Issue | Impact |
|-------|--------|
| SQL injection | Security vulnerability |
| Type issues | Subtle bugs with floats/ints |
| Query plan reuse | Database can't cache execution plan |

---

## 6. SQL Construction Discipline

### Rule: No Raw SQL in Route Files

SQL queries must live in service files, not routes.

| Location | Contains |
|----------|----------|
| `services/*_service.py` | SQL queries with `text()` |
| `*_compute.py` | Pure computation functions |
| Routes | Parse params → call service → return response |

### Example Structure

```python
# ✅ CORRECT - routes/analytics.py
@analytics_bp.route("/api/my-endpoint")
def my_endpoint():
    params = parse_filter_params(request.args)
    result = my_service.get_data(params)
    return jsonify(result)

# ✅ CORRECT - services/my_service.py
def get_data(params):
    query = text("""
        SELECT ...
        WHERE COALESCE(is_outlier, false) = false
          AND sale_type = :sale_type
    """)
    return db.session.execute(query, params).fetchall()
```

---

## 7. API Versioning Discipline

### v2 Contract Status

`api_contract.py` is **FROZEN**. All new endpoints must:

| Requirement | Example |
|-------------|---------|
| Support `?schema=v2` | Query param toggles response format |
| Use camelCase | `medianPsf` not `median_psf` |
| Use enums | `SaleType.RESALE` not `"Resale"` |

### v1 Status

| Status | Meaning |
|--------|---------|
| **DEPRECATED** | Still works, but don't use for new code |
| **NOT REMOVED YET** | Frontend migration in progress |
| Removal timeline | Phase 1c with announcement |

### Dual-Mode Response Pattern

```python
# Default response includes both formats
{
    "median_psf": 1500,    # v1 (deprecated)
    "medianPsf": 1500,     # v2
    "_v2": { ... }         # Nested v2 object
}

# With ?schema=v2: strict v2 only
{
    "medianPsf": 1500
}
```

---

## 8. Guardrails (NON-OPTIONAL)

### Backend Guardrails

| Check | Action |
|-------|--------|
| `%(...)s` param style in SQL | **Reject** |
| f-string SQL interpolation | **Reject** |
| Date param types | **Assert** before execution |

### Implementation Example

```python
def execute_safe_query(query: str, params: dict):
    # Guard: Reject psycopg2-style params
    if '%(' in query:
        raise ValueError("Use :param style, not %(param)s")

    # Guard: Validate date types
    for key, value in params.items():
        if 'date' in key.lower():
            if not isinstance(value, (date, datetime)):
                raise TypeError(f"{key} must be date/datetime, got {type(value)}")

    return db.session.execute(text(query), params)
```

### Frontend Guardrails (Already Implemented)

| Rule | Implementation |
|------|----------------|
| No raw field access | `median_psf`, `avg_psf` forbidden |
| Must use schema helpers | `getAggField`, `AggField` required |

---

## 9. Testing Requirements

### Required Tests for Any SQL Refactor

**Unit Tests:**

- Pure computation functions (no DB)
- Input validation
- Edge cases (null, empty, boundary values)

**Integration Tests:**

| Test Case | Purpose |
|-----------|---------|
| Valid project | Happy path works |
| Fallback logic | Graceful degradation |
| `schema=v2` response shape | v2 contract compliance |
| No snake_case in v2 | Strict v2 validation |

### Example Test

```python
def test_v2_response_has_no_snake_case():
    response = client.get('/api/endpoint?schema=v2')
    data = response.json()

    def check_no_snake_case(obj, path=""):
        if isinstance(obj, dict):
            for key in obj.keys():
                assert '_' not in key, f"Snake case key '{key}' found at {path}"
                check_no_snake_case(obj[key], f"{path}.{key}")
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                check_no_snake_case(item, f"{path}[{i}]")

    check_no_snake_case(data)
```

---

## 10. Root Cause Lesson

### Why This Bug Happened

This error resurfaced because:

| Fixed Earlier | Still Missing |
|---------------|---------------|
| API schema drift | SQL param consistency |
| Enum normalization | Query execution guardrails |
| Frontend safety | SQL linting/analysis |

### Key Insight

> **Schema correctness ≠ SQL execution correctness.**
>
> Both need guardrails.

---

## 11. Final Engineering Principle

> **Contracts protect correctness. Guardrails protect discipline.**

Once both exist:

| Benefit | Explanation |
|---------|-------------|
| Refactors become safe | Contract ensures API compatibility |
| Performance work is low-risk | Guardrails catch regressions |
| Bugs stop resurfacing | Systematic prevention |

---

## Quick Reference Card

```
SQL CHECKLIST (Before Any Query)

[ ] Uses :param style only (no %(param)s)
[ ] Date params are Python date/datetime objects
[ ] Enums use api_contract.py methods
[ ] Outlier filter uses COALESCE
[ ] Numeric values are parameterized
[ ] SQL lives in service file, not route
[ ] v2 endpoint returns camelCase
[ ] Tests cover v1, v2, and edge cases
```
