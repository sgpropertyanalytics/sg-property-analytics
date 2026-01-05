# Documentation Debt Audit Report

**Date:** 2026-01-05 (Updated)
**Status:** CLEANUP COMPLETE

---

## Summary

Documentation cleanup completed. Archive folder deleted (24 files, ~7,800 lines).
All P0 migration issues resolved. Remaining items are P2-P3 tech debt.

| Metric | Before | After |
|--------|--------|-------|
| Total doc files | 48 | 27 |
| Archive files | 24 | 0 (deleted) |
| P0 issues | 3 | 0 |
| P1 issues | 8 | 0 |

---

## Current Documentation Structure

```
docs/
├── Core (8)
│   ├── README.md, architecture.md, backend.md, frontend.md
│   ├── data-model.md, access-control.md, glossary.md, decisions.md
│
├── reference/ (7)
│   ├── ENGINEERING_PRINCIPLES.md, CODE_PATTERNS.md, CHECKLISTS.md
│   ├── TESTING.md, LIBRARY_FIRST_REFERENCE.md
│   ├── BACKEND_CHART_DEPENDENCIES.md, DEPRECATED.md
│
├── runbooks/ (4)
│   ├── DEPLOYMENT.md, MIGRATION.md
│   ├── DATA_UPLOAD_GUIDE.md, ENDPOINT_DEPRECATION_MONITORING.md
│
├── validation/ (4)
│   ├── ABSORPTION_VALIDATION_REPORT.md, INGESTION_ARCHITECTURE.md
│   ├── MARKET_CORE_DATA_INTEGRITY_REPORT.md
│   └── market_core_page_validation_2025-12-28.md
│
├── audits/ (1)
│   └── frontend-fetch-layer-audit.md
│
└── Tracking (3)
    ├── API_ENDPOINT_CLEANUP_PLAN.md
    ├── DOC_DEBT_AUDIT.md (this file)
    └── PENDING_BUGS.md
```

---

## Completed Work (Verified 2026-01-05)

### P0 Issues - ALL RESOLVED

| Issue | Evidence |
|-------|----------|
| Route bypasses contract | `charts.py`, `kpi_v2.py` now use `g.normalized_params` |
| Duplicate `_expand_csv_list()` | Removed - 0 matches in codebase |
| Hardcoded business logic | Components use `saleType = null` defaults |

### Migrations - ALL COMPLETE

| Migration | Status | Evidence |
|-----------|--------|----------|
| TanStack Query (Phase 2) | 100% | All charts use `useAppQuery` |
| Zustand (Phase 3) | 100% | All components use `useZustandFilters` |
| V1 → V2 API | 100% | v1 fields removed |
| Pydantic contracts | 100% | All routes use `@api_contract` |

### API Cleanup - PHASE 1 COMPLETE

| Item | Status |
|------|--------|
| `precomputed.py` (5 endpoints) | Deleted |
| `trends.py` cleanup | Done - only `/new-vs-resale` remains (98 lines) |
| V1 insights endpoints | Already have `@api_contract` |

---

## Remaining Tech Debt (P2-P3)

### P2 - Consistency Issues (Not Blocking)

| Item | Location | Issue | Impact |
|------|----------|-------|--------|
| `useSupplyData` hook | `SupplyDataContext.jsx:56` | Returns `loading` instead of `status` | Naming inconsistency |
| `PriceBandChart` prop | `PriceBandChart.jsx:65` | Uses `loading` prop | Naming inconsistency |
| `PriceGrowthChart` prop | `PriceGrowthChart.jsx:102` | Uses `loading` prop | Naming inconsistency |
| API cleanup Phase 2+ | `API_ENDPOINT_CLEANUP_PLAN.md` | GLS consolidation pending | Backlog |

### P3 - Nice to Have

| Item | Location | Notes |
|------|----------|-------|
| ESLint rule for `isBootPending` | `eslint.config.js` | Enforce consistent naming |
| Error toast TODO | `Pricing.jsx:44` | `// TODO: Show error toast` |
| Telemetry TODOs | `AppReadyContext.jsx:160,176` | `// TODO: Send to telemetry` |
| Dead feature flag | `filterStore.js:66-69` | `ZUSTAND_FILTERS_ENABLED` unused |

---

## Code TODOs (3 remaining)

```
frontend/src/pages/Pricing.jsx:44           // TODO: Show error toast
frontend/src/context/AppReadyContext.jsx:160  // TODO: Send to telemetry service
frontend/src/context/AppReadyContext.jsx:176  // TODO: Send to error tracking service
```

---

## Actions Completed This Session

1. Verified all P0 migration issues resolved
2. Deleted `docs/archive/` folder (24 files, 7,843 lines)
3. Updated this audit to reflect current state

---

## Next Steps (Optional)

1. **P2 Consistency** - Standardize `loading` → `status` in Supply components
2. **P2 API Cleanup** - Continue Phase 2 (GLS endpoint consolidation)
3. **P3 Cleanup** - Remove dead `ZUSTAND_FILTERS_ENABLED` feature flag

---

*Last updated: 2026-01-05*
