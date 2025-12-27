---
name: input-boundary-guardrails
description: Backend input validation and type safety guardrails. ALWAYS activate before writing or modifying ANY API route handlers that accept external input. Enforces boundary normalization, canonical types, fail-fast validation, and single-source parsing. Use before AND after any backend input handling changes.
---

# Input Boundary Safety Guardrails

## Purpose

Prevent runtime crashes, type mismatches, and silent bugs by enforcing strict input normalization at API boundaries. All external inputs (query params, JSON, headers, DB rows) must be normalized once at entry, then trusted internally.

---

## Part 1: The Golden Rule

### Normalize All External Inputs at the Boundary

```
                    ┌─────────────────────────────────────┐
                    │         EXTERNAL WORLD              │
                    │   (query params, JSON, headers)     │
                    └────────────────┬────────────────────┘
                                     │
                    ┌────────────────▼────────────────────┐
                    │      BOUNDARY NORMALIZATION         │
                    │   (route handler / first function)  │
                    │                                     │
                    │   "123"     → int                   │
                    │   "2025-01" → date                  │
                    │   "true"    → bool                  │
                    │   None      → None (explicit)       │
                    └────────────────┬────────────────────┘
                                     │
                    ┌────────────────▼────────────────────┐
                    │       INTERNAL (TRUSTED) ZONE       │
                    │   ❌ No parsing                     │
                    │   ❌ No casting                     │
                    │   ❌ No guessing                    │
                    │   ✅ Types already correct          │
                    └─────────────────────────────────────┘
```

**Why This Matters:**
Most production bugs come from:
- strings vs numbers
- string vs date
- nullable vs non-nullable
- inconsistent formats

---

## Part 2: Mandatory Checks Before Writing Route Handlers

### When This Activates

- Writing or modifying API route handlers
- Processing query parameters or request body
- Handling external data (webhooks, uploads)
- Reading environment variables
- Any function that receives "untrusted" input

### The "Must Do" Checklist

```
EVERY ROUTE HANDLER MUST:

├── Boundary Normalization
│   ├── Normalize ALL inputs at the top of the handler
│   ├── Use centralized helpers (to_int, to_date, to_bool)
│   ├── Handle None/missing values explicitly
│   └── Convert to canonical types immediately
│
├── Fail Fast
│   ├── Invalid input → return 400 (not 500)
│   ├── Validate BEFORE calling business logic
│   └── Include input type in error messages
│
├── Internal Trust
│   ├── Business logic assumes valid types
│   ├── No int(), float(), strptime() in services
│   └── No defensive parsing in core logic
│
└── Canonical Types Only
    ├── Date: datetime.date
    ├── Timestamp: datetime.datetime (UTC)
    ├── Money: int (cents)
    ├── Percent: float (0-1)
    ├── IDs: str
    └── Flags: bool
```

---

## Part 3: Forbidden Patterns

### Immediately Reject Code That Contains:

```python
# FORBIDDEN: Parsing deep in business logic
def calculate_metrics(data, date_from):
    parsed_date = datetime.strptime(date_from, "%Y-%m-%d")  # ❌ Should already be date
    ...

# FORBIDDEN: Scattered int() calls
def get_district_stats(district_id):
    district_num = int(district_id)  # ❌ Should already be int
    ...

# FORBIDDEN: Implicit type assumptions
def compare_dates(date_from, date_to):
    if date_from > date_to:  # ❌ Crashes if types differ
        ...

# FORBIDDEN: Letting crashes bubble as 500
@app.route("/data")
def get_data():
    value = int(request.args.get("value"))  # ❌ Invalid → 500 instead of 400
    ...

# FORBIDDEN: Missing None handling
@app.route("/search")
def search():
    limit = int(request.args.get("limit"))  # ❌ Crashes if limit is None
    ...
```

---

## Part 4: Correct Patterns

### Route Handler with Proper Boundary Normalization

```python
from datetime import date
from utils.normalize import to_int, to_date, to_bool, ValidationError

@analytics_bp.route("/aggregate", methods=["GET"])
def get_aggregate():
    # === BOUNDARY NORMALIZATION ===
    try:
        district = request.args.get("district")  # str or None, OK as-is
        date_from = to_date(request.args.get("date_from"))
        date_to = to_date(request.args.get("date_to"))
        limit = to_int(request.args.get("limit"), default=100)
        include_outliers = to_bool(request.args.get("include_outliers"), default=False)
    except ValidationError as e:
        return {"error": str(e)}, 400

    # === INTERNAL ZONE (types guaranteed) ===
    result = aggregate_service.get_data(
        district=district,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        include_outliers=include_outliers
    )

    return jsonify(result)
```

### Business Logic (Internal Zone)

```python
# services/aggregate_service.py
from datetime import date

def get_data(
    district: str | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
    include_outliers: bool
):
    # NO PARSING HERE - types are already correct
    # Trust the boundary layer

    if date_from and date_to:
        assert isinstance(date_from, date), f"Expected date, got {type(date_from)}"
        assert isinstance(date_to, date), f"Expected date, got {type(date_to)}"

    # Safe to use directly in SQL
    query = text("""
        SELECT * FROM transactions
        WHERE (:date_from IS NULL OR transaction_date >= :date_from)
          AND (:date_to IS NULL OR transaction_date <= :date_to)
        LIMIT :limit
    """)
    ...
```

---

## Part 5: Centralized Normalize Utilities

### Create `/backend/utils/normalize.py`

```python
"""
Single source of truth for input normalization.
All parsing happens here, nowhere else.
"""

from datetime import date, datetime
from typing import Optional, TypeVar, Union

T = TypeVar('T')


class ValidationError(ValueError):
    """Raised when input cannot be normalized."""
    pass


def to_int(value: Optional[str], *, default: Optional[int] = None) -> Optional[int]:
    """Convert string to int, with explicit None handling."""
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (ValueError, TypeError) as e:
        raise ValidationError(f"Expected int, got {type(value).__name__}: {value!r}")


def to_float(value: Optional[str], *, default: Optional[float] = None) -> Optional[float]:
    """Convert string to float, with explicit None handling."""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (ValueError, TypeError) as e:
        raise ValidationError(f"Expected float, got {type(value).__name__}: {value!r}")


def to_bool(value: Optional[str], *, default: bool = False) -> bool:
    """Convert string to bool. Accepts 'true', '1', 'yes' (case-insensitive)."""
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    lower = str(value).lower()
    if lower in ("true", "1", "yes", "on"):
        return True
    if lower in ("false", "0", "no", "off"):
        return False
    raise ValidationError(f"Expected bool, got: {value!r}")


def to_date(value: Optional[Union[str, date]], *, default: Optional[date] = None) -> Optional[date]:
    """Convert string (YYYY-MM-DD or YYYY-MM) to date object."""
    if value is None or value == "":
        return default
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        # Support both YYYY-MM-DD and YYYY-MM
        if len(value) == 7:  # YYYY-MM
            return datetime.strptime(value, "%Y-%m").date()
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError) as e:
        raise ValidationError(f"Expected date (YYYY-MM-DD), got {type(value).__name__}: {value!r}")


def to_datetime(value: Optional[str], *, default: Optional[datetime] = None) -> Optional[datetime]:
    """Convert ISO string to datetime object (UTC assumed)."""
    if value is None or value == "":
        return default
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError) as e:
        raise ValidationError(f"Expected ISO datetime, got {type(value).__name__}: {value!r}")


def to_str(value: Optional[str], *, default: Optional[str] = None, strip: bool = True) -> Optional[str]:
    """Normalize string input, optionally stripping whitespace."""
    if value is None or value == "":
        return default
    result = str(value)
    return result.strip() if strip else result
```

---

## Part 6: Canonical Type Table

| Concept | Canonical Type | Normalize Helper |
|---------|----------------|------------------|
| Date | `datetime.date` | `to_date()` |
| Timestamp | `datetime.datetime` (UTC) | `to_datetime()` |
| Money | `int` (cents) | `to_int()` |
| Percent | `float` (0-1) | `to_float()` |
| IDs | `str` | `to_str()` |
| Flags | `bool` | `to_bool()` |
| Counts | `int` | `to_int()` |

**Rules:**
- Never mix formats within the same concept
- Never store multiple versions (e.g., both string and date)
- Convert once at boundary, use everywhere

---

## Part 7: Error Message Standards

### Include Input Type in Error Messages

```python
# BAD: Unhelpful error
raise ValueError("strptime() error")

# GOOD: Debuggable error
raise ValidationError(f"Expected str|date, got {type(value).__name__}: {value!r}")
```

### Standard Error Response Format

```python
# For 400 errors:
{
    "error": "Expected int, got str: 'abc'",
    "field": "limit",
    "received_type": "str",
    "received_value": "abc"
}
```

---

## Part 8: Pre-Commit Validation

### Before Any Route Handler Change, Verify:

```
[ ] All inputs normalized at top of handler
[ ] Using centralized to_*() helpers
[ ] None handling is explicit
[ ] Invalid input returns 400 (not 500)
[ ] Error messages include input type
[ ] Business logic has NO parsing
[ ] Types match canonical type table
[ ] Assertions guard against type mismatch
```

---

## Part 9: Integration with Other Guardrails

### This Skill + sql-guardrails

Input boundary handles: query params → Python types
SQL guardrails handles: Python types → SQL parameters

```python
# Boundary layer (input-boundary-guardrails)
date_from = to_date(request.args.get("date_from"))

# SQL layer (sql-guardrails)
params = {"date_from": date_from}  # Already a Python date object
```

### This Skill + api-endpoint-guardrails

Input boundary: HOW to validate inputs
API endpoints: WHICH endpoints to create

---

## Part 10: Advanced Patterns (Optional)

### Pattern 1: @validate_inputs Decorator

```python
from functools import wraps

def validate_inputs(schema: dict):
    """Decorator that normalizes inputs according to schema."""
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            try:
                normalized = {}
                for field, converter in schema.items():
                    raw = request.args.get(field)
                    normalized[field] = converter(raw)
                return f(*args, **kwargs, **normalized)
            except ValidationError as e:
                return {"error": str(e)}, 400
        return wrapper
    return decorator

# Usage
@analytics_bp.route("/data")
@validate_inputs({
    "date_from": to_date,
    "limit": lambda x: to_int(x, default=100),
})
def get_data(date_from, limit):
    ...
```

### Pattern 2: Pydantic/Dataclass Validation

```python
from pydantic import BaseModel
from datetime import date

class AggregateRequest(BaseModel):
    district: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    limit: int = 100

@analytics_bp.route("/aggregate")
def get_aggregate():
    try:
        params = AggregateRequest(**request.args.to_dict())
    except ValidationError as e:
        return {"error": e.errors()}, 400

    return aggregate_service.get_data(**params.dict())
```

---

## Quick Reference Card

```
INPUT BOUNDARY GUARDRAILS

GOLDEN RULE:
Normalize ONCE at boundary → Trust internally

BOUNDARY LAYER:
[ ] to_int(), to_date(), to_bool() from normalize.py
[ ] None handling explicit
[ ] Invalid → 400 (not 500)
[ ] Error includes input type

INTERNAL ZONE:
[ ] NO int(), strptime(), json.loads()
[ ] Types already correct
[ ] Assertions guard assumptions

FORBIDDEN:
❌ Parsing in business logic
❌ Implicit type assumptions
❌ Scattered type conversions
❌ 500 for bad input
```

---

## Sign-Off Template

Before marking input handling work as complete:

```markdown
## Input Boundary Safety Sign-Off

### Change Summary
[Brief description]

### Boundary Compliance
- [x] All inputs normalized at handler entry
- [x] Using centralized normalize.py helpers
- [x] None/missing values handled explicitly
- [x] Invalid input returns 400 with helpful message

### Internal Safety
- [x] No parsing in business logic
- [x] Types match canonical type table
- [x] Type assertions where appropriate

### Error Handling
- [x] Error messages include input type
- [x] 400 for validation failures (not 500)

Verified by: [name]
Date: [date]
```
