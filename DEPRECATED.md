# Deprecated Code Inventory

Last updated: 2025-12-29

## Definition

**Deprecated** = not imported + not referenced by routes/CLI + not used by frontend

## Categories

| Category | Meaning | Action |
|----------|---------|--------|
| SAFE_TO_REMOVE | Confirmed unused | Delete when ready |
| INTENTIONAL_DEPRECATION | Returns 410/error by design | Keep forever |
| KEEP_FOR_COMPAT | Backwards compatibility layer | Keep until v1 sunset |

---

## SAFE_TO_REMOVE

These files are confirmed unused and can be safely deleted.

| File | Lines | Reason | Evidence | Removal Date |
|------|-------|--------|----------|--------------|
| *(none found)* | - | - | - | - |

**Total: 0 lines**

---

## INITIALLY SUSPECTED BUT VERIFIED IN USE

These files were initially flagged as unused but deeper analysis confirmed they ARE active:

| File | Reason Initially Flagged | Actual Usage |
|------|-------------------------|--------------|
| `backend/services/project_location_service.py` | No direct imports in services/routes | Used by `scripts/upload.py:2651` for incremental project location updates |
| `backend/models/processed_webhook.py` | Not in main app flow | Used by `routes/payments.py` for Stripe webhook idempotency checking |

---

## INTENTIONAL_DEPRECATION (DO NOT REMOVE)

These files intentionally return deprecation responses for compliance or consolidation.

| File | Endpoints | Purpose | Why Keep |
|------|-----------|---------|----------|
| `backend/routes/analytics/deprecated.py` | `/transactions`, `/transactions/list`, `/comparable_value_analysis`, `/scatter-sample` | Returns HTTP 410 Gone | URA compliance - raw transaction data not allowed. Provides migration guidance to clients. |
| `backend/routes/analytics/kpi.py` | `/kpi-summary` | Returns HTTP 410 Gone | Consolidated to `/kpi-summary-v2` (registry-based). Deprecated 2024-12-29. |

---

## KEEP_FOR_COMPAT

These provide backwards compatibility during API migration.

| File/Pattern | Purpose | Status |
|--------------|---------|--------|
| *(none - v2 migration complete)* | - | - |

### REMOVED (v2 Migration Complete - 2025-12-29)

The following backwards compatibility layers have been removed:

| Pattern | Former Purpose | Removal Reason |
|---------|----------------|----------------|
| `contract_schema.py` dual serializers | Returned both v1 (snake_case) and v2 (camelCase) fields | Frontend migrated to v2-only, all endpoints default to v2 |
| `?schema=v2` parameter | Allowed clients to opt into v2-only output | Now v2-only by default, parameter ignored |
| `include_deprecated` parameter | Controlled whether v1 fields were included | Removed from all serializers, v1 fields deleted |

---

## VERSIONED BUT ACTIVE (NOT DEPRECATED)

These look like duplicates but serve distinct purposes.

| Files | Distinction | Status |
|-------|-------------|--------|
| `kpi.py` vs `kpi_v2.py` | Legacy endpoint vs registry pattern | Consolidating to v2 |
| `KPICard.tsx` vs `KPICardV2.tsx` | Different component designs | Both in use |
| `007_add_performance_indexes_v2.sql` | Outlier-aware indexes (distinct from original) | Both needed |

---

## Verification Commands

Run these before removing any file:

```bash
# Check for imports
grep -r "from services.project_location_service" backend/
grep -r "ProcessedWebhook" backend/routes/ backend/services/

# Check CLI/scripts usage
grep -r "project_location_service" scripts/

# Check git history (recent usage)
git log --oneline -20 -- <file_path>
```

---

## Removal Process

1. Run verification commands above
2. Delete file
3. Run `python -c "from <module> import *"` to check imports
4. Run `pytest tests/ -v --tb=short`
5. Update this document with removal date

---

## Change Log

| Date | Action | Files |
|------|--------|-------|
| 2024-12-29 | Initial inventory created | N/A |
| 2025-12-29 | v2 API migration complete - removed dual serializers | `contract_schema.py`, routes, tests |
