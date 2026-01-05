# Documentation Debt Audit Report

**Date:** 2026-01-04
**Auditor:** Claude Code
**Scope:** All documentation files excluding .claude/ agent/skill configurations

---

## A) File Inventory Summary

| Location | Count | Types |
|----------|-------|-------|
| Root level | 16 | Plans, reports, investigations |
| docs/ | 19 | Core docs, operational guides |
| docs/handoffs/ | 5 | Session handoff docs |
| docs/investigations/ | 1 | Debug checkpoints |
| docs/audits/ | 2 | Code audits |
| docs/plans/ | 1 | Migration plans |
| docs/validation/ | 1 | Data validation reports |
| frontend/ | 3 | Component-specific audits |
| **Total** | **48** | |

---

## B) Full Inventory Table

### Root Level Documents

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `CLAUDE.md` | Reference | **Active** | Main instructions doc, referenced everywhere | **Keep** | None |
| `README.md` | Reference | **Active** | Project readme | **Keep** | None |
| `REPO_MAP.md` | Reference | **Active** | Section 9 has Historical Incidents; referenced in handoffs | **Keep** | CLAUDE.md |
| `DEPRECATED.md` | Reference | **Active** | Lists deprecated endpoints/patterns | **Keep** | Backend routes |
| `MIGRATION_INTEGRITY_AUDIT.md` | Audit | **Partially Obsolete** | "Status: INCOMPLETE" header; Phase 2/3 sections outdated (completed per commits) | **Rewrite Summary** | PHASE3_ZUSTAND_MIGRATION_PLAN |
| `PARAM_PYDANTIC.md` | Migration Plan | **Completed** | "Phase 7 Complete" in audit; all phases done per handoff doc | **Archive** | Pydantic audit |
| `PHASE3_ZUSTAND_MIGRATION_PLAN.md` | Migration Plan | **Completed** | Zustand store exists and is used; migration done | **Archive** | filterStore.js |
| `FILTER_SIMPLIFICATION_PLAN.md` | Migration Plan | **Completed** | Per frontend-fetch-layer-audit: "250+ lines deleted" | **Archive** | docs/plans/filter-simplification.md |
| `INGESTION_ARCHITECTURE.md` | Design | **Active** | Describes data pipeline (CSV → PostgreSQL) | **Move** to docs/ | None |
| `validation_district_deep_dive_2025-12-28.md` | Validation | **Obsolete** | One-time validation report, dated Dec 28 | **Archive** | None |
| `DATA_QUALITY_REPORT_2025-12-29.md` | Validation | **Obsolete** | One-time data quality report, dated Dec 29 | **Archive** | None |
| `AUDIT_REPORT.md` | Audit | **Superseded** | "All issues have been fully resolved" - completed stability audit | **Archive** | None |
| `FRONTEND_ENGINEERING_WORKS.md` | Migration | **Partially Complete** | "Status: LARGELY COMPLETE" but has remaining tasks | **Merge** into docs/frontend.md | ChartFrame, useAppQuery |
| `NEW_LAUNCH_PAGE_INVESTIGATION.md` | Debug Log | **Completed** | Bug found and fixed per docs/investigations/NL-diagnose-checkpoint.md | **Archive** | NL-diagnose-checkpoint.md |
| `MARKET_CORE_DATA_INTEGRITY_REPORT.md` | Validation | **Reference** | Comprehensive baseline data; useful for regression | **Move** to docs/validation/ | None |
| `LOADING_STATE_AUDIT_REPORT.md` | Audit | **Completed** | "MIGRATION COMPLETE" - 12 components migrated | **Archive** | FRONTEND_ENGINEERING_WORKS |
| `ABSORPTION_VALIDATION_REPORT.md` | Validation | **Reference** | "CALCULATION VERIFIED CORRECT" - keep as formula reference | **Move** to docs/validation/ | None |

### docs/ Directory

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `docs/README.md` | Index | **Active** | Doc map with Quick Links | **Keep** (update after consolidation) | All docs |
| `docs/architecture.md` | Reference | **Active** | System design, layer diagrams | **Keep** | None |
| `docs/backend.md` | Reference | **Active** | API contracts, SQL rules | **Keep** | None |
| `docs/frontend.md` | Reference | **Active** | Zustand, TanStack Query patterns | **Keep** (merge FRONTEND_ENGINEERING_WORKS) | None |
| `docs/decisions.md` | ADR | **Active** | "Implementation pending" on some - still relevant | **Keep** | None |
| `docs/glossary.md` | Reference | **Active** | Terminology definitions | **Keep** | None |
| `docs/access-control.md` | Reference | **Active** | Tier/paywall documentation | **Keep** | None |
| `docs/data-model.md` | Reference | **Active** | Transaction schema, formulas | **Keep** | None |
| `docs/MIGRATION.md` | Runbook | **Active** | Database migration procedures | **Keep** | None |
| `docs/DEPLOYMENT.md` | Runbook | **Active** | Render setup, deployment | **Keep** | None |
| `docs/SYSTEM_OVERVIEW.md` | Reference | **Duplicate** | Overlaps heavily with docs/README.md | **Merge** into README.md | None |
| `docs/API_ENDPOINT_CLEANUP_PLAN.md` | Migration Plan | **Unknown** | Need to verify if cleanup completed | **Review** | DEPRECATED.md |
| `docs/BACKEND_CHART_DEPENDENCIES.md` | Reference | **Active** | Chart → endpoint mapping | **Keep** | None |
| `docs/DATA_UPLOAD_GUIDE.md` | Runbook | **Active** | CSV upload pipeline | **Keep** | None |
| `docs/ENDPOINT_DEPRECATION_MONITORING.md` | Runbook | **Active** | Deprecation tracking | **Keep** | DEPRECATED.md |
| `docs/LIBRARY_FIRST_REFERENCE.md` | Reference | **Active** | Library decisions, wheel reference | **Keep** | None |
| `docs/DISTRICT_OVERVIEW_BUG_FIX_PLAN.md` | Debug Log | **Completed** | Likely completed based on naming | **Archive** | None |
| `docs/PENDING_BUGS.md` | Tracker | **Active** | "No pending bugs" - keep for future tracking | **Keep** | None |
| `docs/ENGINEERING_PRINCIPLES.md` | Reference | **Active** | Core principles | **Keep** | CLAUDE.md |
| `docs/CODE_PATTERNS.md` | Reference | **Active** | Code snippets/patterns | **Keep** | None |
| `docs/CHECKLISTS.md` | Reference | **Active** | Pre-commit checklists | **Keep** | None |
| `docs/TESTING.md` | Reference | **Active** | Testing guide | **Keep** | None |

### docs/handoffs/

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `2026-01-04_08-39-56_beadschart-no-data-fix.md` | Handoff | **Completed** | "status: ready_for_review" - merged to main | **Archive** | PENDING_BUGS.md |
| `2026-01-04_09-15-33_useDeferredFetch-fix.md` | Handoff | **Completed** | One-time session handoff | **Archive** | None |
| `2026-01-04_16-08-45_pydantic-cleanup-phase2.md` | Handoff | **Completed** | Phase 2 done per phase 3 doc | **Archive** | PARAM_PYDANTIC.md |
| `2026-01-04_16-39-50_pydantic-cleanup-phase3.md` | Handoff | **Completed** | Phase 3 done per final handoff | **Archive** | PARAM_PYDANTIC.md |
| `2026-01-04_17-40-51_pydantic-migration-complete.md` | Handoff | **Completed** | Final migration handoff | **Archive** | PARAM_PYDANTIC.md |

### docs/investigations/

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `NL-diagnose-checkpoint.md` | Debug Log | **Completed** | "Root Cause Found & Fixed" section | **Archive** | NEW_LAUNCH_PAGE_INVESTIGATION.md |

### docs/audits/

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `frontend-fetch-layer-audit.md` | Audit | **Active** | Verification checklist for fetch layer | **Keep** (as reference) | frontend.md |
| `pydantic-contract-audit.md` | Audit | **Completed** | Migration complete per handoff | **Archive** | PARAM_PYDANTIC.md |

### docs/plans/

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `filter-simplification.md` | Plan | **Completed** | Root FILTER_SIMPLIFICATION_PLAN.md completed | **Archive** | FILTER_SIMPLIFICATION_PLAN.md |

### docs/validation/

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `market_core_page_validation_2025-12-28.md` | Validation | **Reference** | Baseline validation data | **Keep** | MARKET_CORE_DATA_INTEGRITY_REPORT.md |

### frontend/ Directory

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `ASYNC_AUTH_AUDIT_REPORT.md` | Audit | **Superseded** | AUDIT_REPORT.md shows issues resolved | **Archive** | AUDIT_REPORT.md |
| `ASYNC_AUTH_ISSUES_SIMPLIFIED.md` | Debug Log | **Superseded** | Companion to above | **Archive** | ASYNC_AUTH_AUDIT_REPORT.md |
| `TURNOVER_RATE_INVESTIGATION.md` | Investigation | **Completed** | "Calculations are CORRECT" - validates no bug | **Archive** | None |

---

## C) Consolidation Plan

### Target Structure

```
docs/
├── README.md                    # Index (update after consolidation)
├── architecture.md              # System design
├── backend.md                   # Backend patterns
├── frontend.md                  # Frontend patterns (+ merged content)
├── data-model.md                # Data structures
├── access-control.md            # Tiers/paywall
├── glossary.md                  # Terminology
├── decisions.md                 # ADRs
│
├── runbooks/
│   ├── DEPLOYMENT.md
│   ├── MIGRATION.md
│   ├── DATA_UPLOAD_GUIDE.md
│   └── ENDPOINT_DEPRECATION_MONITORING.md
│
├── reference/
│   ├── ENGINEERING_PRINCIPLES.md
│   ├── CODE_PATTERNS.md
│   ├── CHECKLISTS.md
│   ├── TESTING.md
│   ├── LIBRARY_FIRST_REFERENCE.md
│   ├── BACKEND_CHART_DEPENDENCIES.md
│   └── DEPRECATED.md           # Moved from root
│
├── validation/
│   ├── market_core_page_validation_2025-12-28.md
│   ├── MARKET_CORE_DATA_INTEGRITY_REPORT.md  # Moved from root
│   └── ABSORPTION_VALIDATION_REPORT.md       # Moved from root
│
└── archive/
    ├── README.md               # Index of archived docs
    ├── migrations/
    │   ├── PARAM_PYDANTIC.md
    │   ├── PHASE3_ZUSTAND_MIGRATION_PLAN.md
    │   ├── FILTER_SIMPLIFICATION_PLAN.md
    │   ├── filter-simplification.md
    │   └── pydantic-contract-audit.md
    │
    ├── audits/
    │   ├── AUDIT_REPORT.md
    │   ├── LOADING_STATE_AUDIT_REPORT.md
    │   ├── ASYNC_AUTH_AUDIT_REPORT.md
    │   └── ASYNC_AUTH_ISSUES_SIMPLIFIED.md
    │
    ├── investigations/
    │   ├── NEW_LAUNCH_PAGE_INVESTIGATION.md
    │   ├── NL-diagnose-checkpoint.md
    │   ├── TURNOVER_RATE_INVESTIGATION.md
    │   └── DISTRICT_OVERVIEW_BUG_FIX_PLAN.md
    │
    ├── validations/
    │   ├── validation_district_deep_dive_2025-12-28.md
    │   └── DATA_QUALITY_REPORT_2025-12-29.md
    │
    └── handoffs/
        ├── 2026-01-04_08-39-56_beadschart-no-data-fix.md
        ├── 2026-01-04_09-15-33_useDeferredFetch-fix.md
        ├── 2026-01-04_16-08-45_pydantic-cleanup-phase2.md
        ├── 2026-01-04_16-39-50_pydantic-cleanup-phase3.md
        └── 2026-01-04_17-40-51_pydantic-migration-complete.md
```

### Merge Clusters

#### Cluster 1: Frontend Engineering Documentation
- **Canonical:** `docs/frontend.md`
- **Merge from:** `FRONTEND_ENGINEERING_WORKS.md`
- **Content to preserve:**
  - "The Standard Pattern" code block
  - Migration Status table (as historical reference)
  - Remaining Work section items
- **Delete after merge:** `FRONTEND_ENGINEERING_WORKS.md`

#### Cluster 2: System Overview Duplicates
- **Canonical:** `docs/README.md`
- **Merge from:** `docs/SYSTEM_OVERVIEW.md`
- **Content to preserve:**
  - Any unique diagrams not in README.md
- **Delete after merge:** `docs/SYSTEM_OVERVIEW.md`

#### Cluster 3: Pydantic Migration Docs
- **Canonical:** `docs/archive/migrations/PARAM_PYDANTIC.md`
- **Related files:**
  - `docs/audits/pydantic-contract-audit.md`
  - `docs/handoffs/2026-01-04_16-08-45_pydantic-cleanup-phase2.md`
  - `docs/handoffs/2026-01-04_16-39-50_pydantic-cleanup-phase3.md`
  - `docs/handoffs/2026-01-04_17-40-51_pydantic-migration-complete.md`
- **Action:** Archive all as separate files (good historical record)

#### Cluster 4: New Launch Investigation
- **Canonical:** `docs/archive/investigations/NEW_LAUNCH_PAGE_INVESTIGATION.md`
- **Related:** `docs/investigations/NL-diagnose-checkpoint.md`
- **Action:** Keep both in archive (different investigation phases)

---

## D) Pending Issues Extraction

### High Priority (P0-P1)

| Item | Source | Action | Owner | Verification |
|------|--------|--------|-------|--------------|
| Migrate `useSupplyData` to return `status` | `LOADING_STATE_AUDIT_REPORT.md:271` | Update hook | Frontend | `useSupplyData` returns `{status}` |
| Update PriceBandChart/PriceGrowthChart callers | `LOADING_STATE_AUDIT_REPORT.md:276` | Pass `status` prop | Frontend | Props use `status` not `loading` |
| Add ESLint rule for `isBootPending=` | `FRONTEND_ENGINEERING_WORKS.md:131` | ESLint config | Frontend | `npm run lint` catches violations |

### Medium Priority (P2)

| Item | Source | Action | Owner | Verification |
|------|--------|--------|-------|--------------|
| Add data freshness indicator | `MARKET_CORE_DATA_INTEGRITY_REPORT.md:682` | UI component | Frontend | Shows "Last updated: DATE" |
| Add `is_partial_period` flag | `MARKET_CORE_DATA_INTEGRITY_REPORT.md:683` | API response | Backend | Response includes flag |
| Add small segment warnings (n < 10) | `MARKET_CORE_DATA_INTEGRITY_REPORT.md:684` | UI warning | Frontend | Shows warning badge |
| Convert TODOs to tracked issues | `MIGRATION_INTEGRITY_AUDIT.md:599` | GitHub issues | DevOps | Issues created |

### Low Priority (P3)

| Item | Source | Action | Owner | Verification |
|------|--------|--------|-------|--------------|
| Add filter schema versioning | `AUDIT_REPORT.md:250` | Storage version | Frontend | Version in localStorage key |
| Verify Dec 2025 data completeness | `DATA_QUALITY_REPORT_2025-12-29.md:277` | Data audit | Data | Monthly counts normal |
| Add missing AggregateParams fields | `docs/handoffs/pydantic-migration-complete.md:82` | Pydantic model | Backend | priceMin, priceMax in model |
| Migrate V1 insights endpoints | `docs/handoffs/pydantic-migration-complete.md:87` | @api_contract | Backend | district-psf, district-liquidity |

### Code TODOs Found

| Location | TODO | Priority |
|----------|------|----------|
| `MIGRATION_INTEGRITY_AUDIT.md:403` | "Show error toast" | P2 |
| `MIGRATION_INTEGRITY_AUDIT.md:408` | "Audit retry patterns removal" | P2 |
| `MIGRATION_INTEGRITY_AUDIT.md:413-414` | Telemetry/error tracking service | P3 |

---

## E) Deletion Safety Checks

### Safe to Delete (Fully Covered Elsewhere)

| File | Covered By | Verification |
|------|-----------|--------------|
| `docs/SYSTEM_OVERVIEW.md` | `docs/README.md` | Diff shows redundant content |
| `FILTER_SIMPLIFICATION_PLAN.md` | `docs/plans/filter-simplification.md` | Same content |

### Safe to Archive (Completed Work)

| File | Evidence | Risk Level |
|------|----------|------------|
| `PARAM_PYDANTIC.md` | "Phase 7 Complete", migration done | Low |
| `PHASE3_ZUSTAND_MIGRATION_PLAN.md` | Zustand store in use | Low |
| `AUDIT_REPORT.md` | "All issues resolved" | Low |
| `LOADING_STATE_AUDIT_REPORT.md` | "MIGRATION COMPLETE" | Low |
| All handoff docs | One-time session context | Low |

### Requires Verification Before Action

| File | Concern | Check Command |
|------|---------|---------------|
| `docs/API_ENDPOINT_CLEANUP_PLAN.md` | Unknown completion status | `grep -r "cleanup-plan" docs/` |
| `MIGRATION_INTEGRITY_AUDIT.md` | Some sections may still be relevant | Manual review of P1/P2 items |

### Do NOT Delete (Unique Operational Knowledge)

| File | Reason |
|------|--------|
| `docs/MIGRATION.md` | Database migration procedures |
| `docs/DEPLOYMENT.md` | Production deployment steps |
| `docs/DATA_UPLOAD_GUIDE.md` | CSV pipeline documentation |
| `DEPRECATED.md` | Active deprecation tracking |
| `MARKET_CORE_DATA_INTEGRITY_REPORT.md` | Baseline data reference |

---

## F) Proposed PR Plan

### Commit 1: Create archive structure
```
docs: create archive directory structure

- Create docs/archive/ with subdirectories
- Add docs/archive/README.md explaining archive purpose
- Create docs/runbooks/ and docs/reference/ directories
```

### Commit 2: Move completed migration docs to archive
```
docs: archive completed migration documentation

Move to docs/archive/migrations/:
- PARAM_PYDANTIC.md
- PHASE3_ZUSTAND_MIGRATION_PLAN.md
- FILTER_SIMPLIFICATION_PLAN.md
- docs/plans/filter-simplification.md
- docs/audits/pydantic-contract-audit.md
```

### Commit 3: Archive completed audits and investigations
```
docs: archive completed audits and investigations

Move to docs/archive/audits/:
- AUDIT_REPORT.md
- LOADING_STATE_AUDIT_REPORT.md
- frontend/ASYNC_AUTH_AUDIT_REPORT.md
- frontend/ASYNC_AUTH_ISSUES_SIMPLIFIED.md

Move to docs/archive/investigations/:
- NEW_LAUNCH_PAGE_INVESTIGATION.md
- docs/investigations/NL-diagnose-checkpoint.md
- frontend/TURNOVER_RATE_INVESTIGATION.md
- docs/DISTRICT_OVERVIEW_BUG_FIX_PLAN.md
```

### Commit 4: Archive handoffs and dated validations
```
docs: archive session handoffs and dated validations

Move to docs/archive/handoffs/:
- All files from docs/handoffs/

Move to docs/archive/validations/:
- validation_district_deep_dive_2025-12-28.md
- DATA_QUALITY_REPORT_2025-12-29.md
```

### Commit 5: Reorganize active docs
```
docs: reorganize active documentation

Move to docs/runbooks/:
- docs/DEPLOYMENT.md
- docs/MIGRATION.md
- docs/DATA_UPLOAD_GUIDE.md
- docs/ENDPOINT_DEPRECATION_MONITORING.md

Move to docs/reference/:
- docs/ENGINEERING_PRINCIPLES.md
- docs/CODE_PATTERNS.md
- docs/CHECKLISTS.md
- docs/TESTING.md
- docs/LIBRARY_FIRST_REFERENCE.md
- docs/BACKEND_CHART_DEPENDENCIES.md
- DEPRECATED.md (from root)

Move to docs/validation/:
- MARKET_CORE_DATA_INTEGRITY_REPORT.md (from root)
- ABSORPTION_VALIDATION_REPORT.md (from root)
- INGESTION_ARCHITECTURE.md (from root)
```

### Commit 6: Merge duplicates and update indexes
```
docs: merge duplicates, update README index

- Merge docs/SYSTEM_OVERVIEW.md into docs/README.md
- Delete docs/SYSTEM_OVERVIEW.md
- Update docs/README.md with new structure
- Merge FRONTEND_ENGINEERING_WORKS.md key content into docs/frontend.md
- Delete FRONTEND_ENGINEERING_WORKS.md
```

### Commit 7: Update MIGRATION_INTEGRITY_AUDIT.md
```
docs: update migration audit with completed status

- Mark completed sections in MIGRATION_INTEGRITY_AUDIT.md
- Add summary of what remains incomplete
- Move to docs/archive/ if fully complete
```

---

## G) Summary

| Category | Count | Action |
|----------|-------|--------|
| Keep as-is | 18 | Core docs, active runbooks |
| Move/reorganize | 12 | Better structure |
| Archive | 18 | Completed work |
| Merge | 4 | Eliminate duplicates |
| Delete | 2 | Fully redundant |
| **Total** | **48** | |

### Before vs After

| Metric | Before | After |
|--------|--------|-------|
| Root-level docs | 16 | 2 (CLAUDE.md, REPO_MAP.md) |
| Unstructured docs/ files | 19 | 8 core + subdirs |
| Discoverable structure | No | Yes (runbooks/, reference/, validation/, archive/) |
| Stale migration plans | 4 active | 0 active (all archived) |
| Duplicate content | 3 sets | 0 |

---

*Generated by Documentation Debt Auditor - 2026-01-04*
