# Taxonomy & Enum Integrity (No Drift)

**Trigger:** Before modifying age bands, sale types, regions, or any categorical bucket keys.

## Core Rule
All categorical "bucket" keys (age bands, sale type, region, labels, etc.) MUST come from the canonical enums in:
- `backend/schemas/api_contract.py`

No other file (SQL, routes, frontend, utils) may invent, rename, or extend bucket keys.

---

## 1) Single Source of Truth
**Canonical:** `PropertyAgeBucket` (and other enums) in `backend/schemas/api_contract.py`

✅ Allowed
- Backend computes `age_band` using the canonical enum keys.
- API returns `age_band` values that are exactly one of the enum keys.

❌ Forbidden
- Adding new bucket keys not present in the enum (e.g., `just_top`).
- Duplicating bucket definitions in SQL or frontend.
- Hardcoding bucket strings outside `api_contract.py`.

---

## 2) Classification Location (Backend Only)
Age band classification MUST happen in backend code, using `PropertyAgeBucket.classify()`.

✅ Required pattern
```python
# Use canonical classifier
from schemas.api_contract import PropertyAgeBucket

age_band = PropertyAgeBucket.classify(
    age=property_age,
    sale_type=sale_type,
    tenure=tenure
)
```

❌ Forbidden patterns
- SQL returns string bucket keys (e.g., `literal('recently_top')`).
- Frontend computes or overrides `age_band`.
- Duplicating classification logic in multiple places.

---

## 3) Dynamic SQL from Enums
When SQL needs to GROUP BY bucket, build the CASE dynamically from `PropertyAgeBucket`:

```python
# Build CASE conditions from PropertyAgeBucket.AGE_RANGES
age_conditions = [
    (func.lower(Transaction.sale_type) == 'new sale', literal(PropertyAgeBucket.NEW_SALE)),
    (Transaction.tenure.ilike('%freehold%'), literal(PropertyAgeBucket.FREEHOLD)),
    (Transaction.lease_start_year.is_(None), literal('unknown')),
]

for bucket, (min_age, max_age) in PropertyAgeBucket.AGE_RANGES.items():
    if max_age is None:
        condition = property_age >= min_age
    else:
        condition = and_(property_age >= min_age, property_age < max_age)
    age_conditions.append((condition, literal(bucket)))

age_band_case = case(*age_conditions, else_=literal('unknown'))
```

This ensures bucket keys come from the canonical source.

---

## 4) Contract Tests (Hard Guardrail)
Tests in `tests/test_api_contract.py` enforce:

- `test_classify_returns_valid_keys_only` - classify() only returns valid keys
- `test_enum_key_snapshot` - enum keys don't change without intent
- `test_age_band_boundaries` - exact age range behavior

If enum keys change, tests fail immediately.

---

## 5) Review Checklist (Before Merge)
- [ ] No new bucket strings added outside `api_contract.py`
- [ ] SQL uses PropertyAgeBucket constants (not hardcoded strings)
- [ ] Backend is the only place mapping age → age_band
- [ ] All tests in TestPropertyAgeBucket pass
- [ ] Frontend AGE_BAND_LABELS_* match PropertyAgeBucket.LABELS

---

## Mental Model
**Enums define reality.
Backend classifies.
SQL provides numbers (or uses enum constants).
Frontend displays.
No one invents categories.**
