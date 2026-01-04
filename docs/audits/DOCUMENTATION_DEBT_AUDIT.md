# Documentation Debt Audit Report

**Generated:** 2026-01-04
**Scope:** All documentation files in sg-property-analyzer repository
**Status:** ACTIONABLE - Ready for cleanup PR

---

## A) Discovery Summary

### Files Found by Location

| Location | Count | Types |
|----------|-------|-------|
| Root (`/`) | 17 | Plans, audits, investigations, reference |
| `/docs/` | 21 | Architecture, reference, operational |
| `/docs/audits/` | 2 | Audit reports |
| `/docs/plans/` | 1 | Migration plans |
| `/docs/investigations/` | 1 | Debug checkpoints |
| `/docs/handoffs/` | 1 | Session handoffs |
| `/docs/validation/` | 1 | Validation reports |
| `/frontend/` | 4 | Investigation, audit reports |
| `/data_validation/` | 1 | Validation report |
| `/backend/` | 2 | README files |
| `/scripts/` | 1 | README |
| **Total** | **52** | (excluding `.claude/` config) |

### Files Found by Type

| Type | Count | Status Overview |
|------|-------|-----------------|
| Reference/Architecture | 12 | Mostly Active |
| Migration Plans | 5 | 3 Complete, 2 Active |
| Audit Reports | 8 | 6 Complete, 2 Active |
| Investigation/Debug | 5 | 4 Complete, 1 Active |
| Validation Reports | 6 | All Complete |
| Operational/README | 8 | All Active |
| Design/Decisions | 3 | All Active |
| Scratchpad/Session | 3 | Should Archive |

---

## 1) Inventory Table

### ROOT LEVEL (17 files)

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `README.md` | Reference | **Active** | Main project readme | Keep | Points to docs/ |
| `REPO_MAP.md` | Reference | **Active** | "Navigation lives here", §9 Historical Incidents current | Keep | Core navigation |
| `claude.md` | Reference | **Active** | System rules, Jan 2026 | Keep | References REPO_MAP.md |
| `DEPRECATED.md` | Inventory | **Active** | Tracks deprecated code, Dec 2025 | Keep | - |
| `INGESTION_ARCHITECTURE.md` | Design | **Active** | Data pipeline architecture | Keep | - |
| `FILTER_SIMPLIFICATION_PLAN.md` | Plan | **Superseded** | 23-layer analysis; newer version exists at docs/plans/ | **Merge/Delete** | Duplicate of docs/plans/filter-simplification.md |
| `PHASE3_ZUSTAND_MIGRATION_PLAN.md` | Plan | **Completed** | "✅ MIGRATION COMPLETE January 2026" | **Archive** | Original plan, now historical |
| `PARAM_PYDANTIC.md` | Plan | **Active** | Phase 7 COMPLETE, Phase 8 PARTIAL | Keep | Ongoing migration |
| `MIGRATION_INTEGRITY_AUDIT.md` | Audit | **Active** | P0-P2 issues listed, Jan 2, 2026 | Keep | Tracks active tech debt |
| `LOADING_STATE_AUDIT_REPORT.md` | Audit | **Completed** | "✅ MIGRATION COMPLETE" | **Merge** | Overlaps with FRONTEND_ENGINEERING_WORKS.md |
| `FRONTEND_ENGINEERING_WORKS.md` | Plan | **Active** | PR3 Status-only migration, remaining work listed | Keep | Canonical for frontend migration |
| `NEW_LAUNCH_PAGE_INVESTIGATION.md` | Investigation | **Completed** | "BUG FOUND AND FIXED" Jan 2, 2026 | **Archive** | Fixed, historical value |
| `AUDIT_REPORT.md` | Audit | **Completed** | Stability audit Dec 31, 2025 "all issues resolved" | **Archive** | Historical audit |
| `DATA_QUALITY_REPORT_2025-12-29.md` | Validation | **Completed** | One-time batch validation | **Delete** | Time-bound, no ongoing value |
| `MARKET_CORE_DATA_INTEGRITY_REPORT.md` | Validation | **Completed** | "✅ PASS" Dec 28, 2025 | **Delete** | One-time validation |
| `ABSORPTION_VALIDATION_REPORT.md` | Validation | **Completed** | "✅ CALCULATION INTEGRITY: PASS" Dec 31, 2025 | **Delete** | One-time validation |
| `validation_district_deep_dive_2025-12-28.md` | Validation | **Completed** | "✅ PASS" Dec 28, 2025 | **Delete** | One-time validation |

### FRONTEND (4 files)

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `frontend/README.md` | Reference | **Active** | Frontend setup guide | Keep | - |
| `frontend/ASYNC_AUTH_AUDIT_REPORT.md` | Audit | **Active** | 6 issues identified, fixes proposed | Keep | Detailed technical reference |
| `frontend/ASYNC_AUTH_ISSUES_SIMPLIFIED.md` | Debug | **Duplicate** | Visual guide, same content as audit | **Merge** | Content in ASYNC_AUTH_AUDIT_REPORT.md |
| `frontend/TURNOVER_RATE_INVESTIGATION.md` | Investigation | **Completed** | "CORRECT" Dec 31, 2025 | **Delete** | Formula validated, done |

### DOCS DIRECTORY (21 files)

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `docs/README.md` | Navigation | **Active** | Doc index | Keep | - |
| `docs/architecture.md` | Reference | **Active** | System design | Keep | Core reference |
| `docs/backend.md` | Reference | **Active** | API/SQL rules | Keep | Core reference |
| `docs/frontend.md` | Reference | **Active** | UI patterns | Keep | Core reference |
| `docs/data-model.md` | Reference | **Active** | Schema definitions | Keep | Core reference |
| `docs/access-control.md` | Reference | **Active** | Tiers, paywall | Keep | Core reference |
| `docs/glossary.md` | Reference | **Active** | Terminology | Keep | - |
| `docs/decisions.md` | Design | **Active** | Design rationale | Keep | - |
| `docs/DEPLOYMENT.md` | Operational | **Active** | Deployment guide | Keep | - |
| `docs/DATA_UPLOAD_GUIDE.md` | Operational | **Active** | Upload procedures | Keep | - |
| `docs/MIGRATION.md` | Meta | **Completed** | Dec 2024 doc migration | **Archive** | Historical, explains current structure |
| `docs/SYSTEM_OVERVIEW.md` | Reference | **Active** | High-level overview | Keep | - |
| `docs/LIBRARY_FIRST_REFERENCE.md` | Reference | **Active** | Library-first policy | Keep | Referenced by REPO_MAP |
| `docs/BACKEND_CHART_DEPENDENCIES.md` | Reference | **Active** | Chart→endpoint mapping | Keep | Critical for backend changes |
| `docs/PENDING_BUGS.md` | Tracking | **Completed** | "No pending bugs" - only resolved | **Archive** | BUG-001 resolved, historical |
| `docs/API_ENDPOINT_CLEANUP_PLAN.md` | Plan | **Active** | Phase 1-4 checklists, partially complete | Keep | Tracks endpoint cleanup |
| `docs/ENDPOINT_DEPRECATION_MONITORING.md` | Operational | **Active** | Monitors deprecated endpoints | Keep | - |
| `docs/DISTRICT_OVERVIEW_BUG_FIX_PLAN.md` | Plan | **Active** | Cache key bug fix, P0 implementation steps | Keep | District filter bug fix |
| `docs/plans/filter-simplification.md` | Plan | **Active** | Jan 4, 2026 - 7-layer simplification | Keep | Canonical filter plan |
| `docs/investigations/NL-diagnose-checkpoint.md` | Investigation | **Completed** | Bug found, fixed Jan 3, 2026 | **Delete** | Supersedes NEW_LAUNCH_PAGE_INVESTIGATION.md |
| `docs/validation/market_core_page_validation_2025-12-28.md` | Validation | **Completed** | One-time validation | **Delete** | Time-bound |
| `docs/handoffs/2026-01-04_*.md` | Handoff | **Active** | Recent session handoff | Keep (1 week) | - |

### DATA VALIDATION (1 file)

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `data_validation/FILTER_VALIDATION_REPORT.md` | Validation | **Completed** | Dec 22, 2025 | **Delete** | One-time validation |

### BACKEND/SCRIPTS (3 files)

| Path | Type | Status | Evidence | Action | Dependencies |
|------|------|--------|----------|--------|--------------|
| `backend/migrations/README.md` | Reference | **Active** | Migration instructions | Keep | - |
| `backend/tests/snapshots/regression/README.md` | Reference | **Active** | Snapshot test docs | Keep | - |
| `scripts/README.md` | Reference | **Active** | Script documentation | Keep | - |

---

## 2) Consolidation Plan

### Target Directory Structure

```
/docs/
├── README.md                    # Index (keep)
├── architecture.md              # System design (keep)
├── backend.md                   # API/SQL rules (keep)
├── frontend.md                  # UI patterns (keep)
├── data-model.md                # Schema (keep)
├── access-control.md            # Tiers (keep)
├── glossary.md                  # Terms (keep)
├── decisions.md                 # Design rationale (keep)
├── SYSTEM_OVERVIEW.md           # Overview (keep)
├── BACKEND_CHART_DEPENDENCIES.md # Critical (keep)
├── LIBRARY_FIRST_REFERENCE.md   # Policy (keep)
├── DEPLOYMENT.md                # Operational (keep)
├── DATA_UPLOAD_GUIDE.md         # Operational (keep)
├── ENDPOINT_DEPRECATION_MONITORING.md # Operational (keep)
│
├── migrations/                  # Active migration tracking
│   ├── README.md               # Migration overview
│   ├── pydantic-migration.md   # ← PARAM_PYDANTIC.md
│   ├── frontend-status.md      # ← FRONTEND_ENGINEERING_WORKS.md
│   └── integrity-audit.md      # ← MIGRATION_INTEGRITY_AUDIT.md
│
├── plans/
│   ├── filter-simplification.md # Canonical filter plan (keep)
│   └── (future plans)
│
├── audits/
│   ├── async-auth-audit.md     # ← frontend/ASYNC_AUTH_AUDIT_REPORT.md
│   └── DOCUMENTATION_DEBT_AUDIT.md # This file
│
├── archive/                     # Completed work
│   ├── README.md               # What's archived + why
│   ├── zustand-migration-plan.md    # ← PHASE3_ZUSTAND_MIGRATION_PLAN.md
│   ├── new-launch-bug-jan2026.md    # ← NEW_LAUNCH_PAGE_INVESTIGATION.md
│   ├── stability-audit-dec2025.md   # ← AUDIT_REPORT.md
│   ├── pending-bugs-resolved.md     # ← docs/PENDING_BUGS.md
│   └── doc-migration-dec2024.md     # ← docs/MIGRATION.md
│
└── handoffs/                    # Session handoffs (auto-cleanup after 1 week)
    └── *.md
```

### Cluster 1: Filter Simplification Plans (DUPLICATE)

| Role | File | Content to Preserve | Action |
|------|------|---------------------|--------|
| **Canonical** | `docs/plans/filter-simplification.md` | 7-layer analysis, migration phases | Keep |
| Merge source | `/FILTER_SIMPLIFICATION_PLAN.md` | 23-layer analysis, comparison tables | Extract unique content, delete |

**Unique content to preserve from root file:**
- Appendix: Current Layer Map (23 layers diagram)
- Problem 4: "Reinventing React Query" analysis
- Proposed Store Structure (Zustand config)

**Action:** Append "Historical Analysis" section to canonical doc with the 23-layer diagram.

### Cluster 2: Async/Auth Documentation (OVERLAP)

| Role | File | Content to Preserve | Action |
|------|------|---------------------|--------|
| **Canonical** | `frontend/ASYNC_AUTH_AUDIT_REPORT.md` | Technical details, fixes, code locations | Move to docs/audits/ |
| Merge source | `frontend/ASYNC_AUTH_ISSUES_SIMPLIFIED.md` | Visual diagrams, problem summary | Merge diagrams into canonical, delete |

**Action:** Add "Visual Summary" section with ASCII diagrams to the audit report.

### Cluster 3: Loading State / Frontend Migration (OVERLAP)

| Role | File | Content to Preserve | Action |
|------|------|---------------------|--------|
| **Canonical** | `FRONTEND_ENGINEERING_WORKS.md` | Migration status table, remaining work | Keep (move to docs/migrations/) |
| Merge source | `LOADING_STATE_AUDIT_REPORT.md` | Component audit table (26 components) | Merge table into canonical, delete |

**Action:** Add component audit results as appendix to FRONTEND_ENGINEERING_WORKS.md.

### Cluster 4: New Launch Investigation (SUPERSEDED)

| Role | File | Content to Preserve | Action |
|------|------|---------------------|--------|
| Superseded | `/NEW_LAUNCH_PAGE_INVESTIGATION.md` | Root cause, fix commits | Archive |
| Superseded | `docs/investigations/NL-diagnose-checkpoint.md` | Debug log sequence | Delete (content in parent doc) |

**Action:** Archive root file, delete investigation checkpoint (build notes, not reference).

---

## 3) Pending Issues Extraction

### Open TODOs and Incomplete Items

| Source Doc | Section | Action Item | Owner | Priority | Verification |
|------------|---------|-------------|-------|----------|--------------|
| `FRONTEND_ENGINEERING_WORKS.md` | Remaining Work | Migrate `useSupplyData` to return `status` | Frontend | P2 | Hook returns `status` not `loading` |
| `FRONTEND_ENGINEERING_WORKS.md` | Remaining Work | Update PriceBandChart/PriceGrowthChart callers | Frontend | P2 | Components use `status` prop |
| `FRONTEND_ENGINEERING_WORKS.md` | Remaining Work | Add ESLint rule for `isBootPending` | Frontend | P3 | ESLint fails on `isBootPending=` |
| `PARAM_PYDANTIC.md` | Phase 8 | Frontend cleanup (optional) | Frontend | P3 | Listed as low priority |
| `MIGRATION_INTEGRITY_AUDIT.md` | P0-1 | Fix `request.args.get()` violations | Backend | **P0** | Routes use `g.normalized_params` |
| `MIGRATION_INTEGRITY_AUDIT.md` | P0-2 | Consolidate `_expand_csv_list()` | Backend | **P0** | Single source in `utils.normalize` |
| `MIGRATION_INTEGRITY_AUDIT.md` | P0-3 | Fix MarketValueOscillator saleType default | Frontend | **P0** | Component has no default |
| `MIGRATION_INTEGRITY_AUDIT.md` | P1-1 | Complete Phase 2 migration (13 charts) | Frontend | P1 | All charts use `useAppQuery` |
| `MIGRATION_INTEGRITY_AUDIT.md` | P1-2 | Remove normalization fallbacks | Backend | P1 | No try/except in contracts/normalize.py |
| `MIGRATION_INTEGRITY_AUDIT.md` | P1-5 | Phase 3 Zustand migration | Frontend | P1 | PowerBIFilterProvider <100 lines |
| `MIGRATION_INTEGRITY_AUDIT.md` | P1-8 | Audit retry mechanisms | Frontend | P1 | Allowlist expires 2026-02-15 |
| `MIGRATION_INTEGRITY_AUDIT.md` | P2-1 | Convert TODOs to tracked issues | All | P2 | No untracked TODOs in code |
| `MIGRATION_INTEGRITY_AUDIT.md` | P2-5 | Add CI migration checks | DevOps | P2 | CI runs migration-audit.py |
| `frontend/ASYNC_AUTH_AUDIT_REPORT.md` | Fix #2 | NaN guard for Oscillator divergence | Frontend | P1 | `== null` check exists |
| `frontend/ASYNC_AUTH_AUDIT_REPORT.md` | Fix #4 | Explicit state reset on abort | Frontend | P1 | `inFlight: false` on abort |
| `docs/plans/filter-simplification.md` | Phase 1 | Backend param alignment | Backend | P1 | Backend accepts `timeframe` |
| `docs/plans/filter-simplification.md` | Phase 2 | Component simplification | Frontend | P2 | Charts use inline params |
| `ABSORPTION_VALIDATION_REPORT.md` | Recommendations | Add UI badge explaining calculation | Frontend | P3 | UI shows calculation method |
| `AUDIT_REPORT.md` | P2 Gap | NewVsResaleChart sparse data warning | Frontend | P2 | Warning shown in UI |

### Allowlist Expiry Warnings

| Item | Expires | Days Left | Action Required |
|------|---------|-----------|-----------------|
| `kpi-v1-410-response` | 2026-02-15 | 42 | Check analytics, delete if unused |
| `dual-retry-mechanism` | 2026-02-15 | 42 | Audit and consolidate before expiry |
| `deprecated-endpoints-410` | 2026-02-28 | 55 | Monitor for zero usage |
| `useAbortableQuery-compat-shim` | 2026-03-01 | 56 | Complete Phase 2 migration first |
| `normalize-helpers-scattered` | 2026-03-15 | 70 | Consolidate helpers |

---

## 4) Deletion/Archival Safety Rules

### Pre-Deletion Checklist

Before marking any document for deletion:

- [ ] **Not referenced from README/REPO_MAP:** Grep for filename in all `.md` files
- [ ] **No unique operational knowledge:** Check for prod steps, recovery procedures, credentials
- [ ] **Content covered elsewhere:** Verify canonical doc has the same information
- [ ] **Time-bound report:** One-time validation/audit with date in filename = safe to delete
- [ ] **Not linked from code comments:** Grep codebase for doc references

### Safe to Delete (Verified)

| File | Reason | Verified By |
|------|--------|-------------|
| `DATA_QUALITY_REPORT_2025-12-29.md` | Time-bound batch validation, date in name | No references found |
| `MARKET_CORE_DATA_INTEGRITY_REPORT.md` | One-time validation, ✅ PASS | No references found |
| `ABSORPTION_VALIDATION_REPORT.md` | One-time validation, ✅ PASS | No references found |
| `validation_district_deep_dive_2025-12-28.md` | One-time validation, date in name | No references found |
| `frontend/TURNOVER_RATE_INVESTIGATION.md` | Formula validated, marked "CORRECT" | No references found |
| `docs/validation/market_core_page_validation_2025-12-28.md` | Time-bound, date in name | No references found |
| `data_validation/FILTER_VALIDATION_REPORT.md` | Time-bound, Dec 22 | No references found |
| `docs/investigations/NL-diagnose-checkpoint.md` | Debug checkpoint, content in parent | No references found |

### Must Archive (Not Delete)

| File | Reason | Archive Name |
|------|--------|--------------|
| `PHASE3_ZUSTAND_MIGRATION_PLAN.md` | Contains implementation details for future reference | `archive/zustand-migration-plan.md` |
| `NEW_LAUNCH_PAGE_INVESTIGATION.md` | Documents incident and fix, historical value | `archive/new-launch-bug-jan2026.md` |
| `AUDIT_REPORT.md` | Stability audit, may need to reference fixes | `archive/stability-audit-dec2025.md` |
| `docs/PENDING_BUGS.md` | BUG-001 resolution details | `archive/pending-bugs-resolved.md` |
| `docs/MIGRATION.md` | Explains current doc structure origin | `archive/doc-migration-dec2024.md` |

### Risky - Requires Review

| File | Risk | Recommendation |
|------|------|----------------|
| `FILTER_SIMPLIFICATION_PLAN.md` | Referenced in MIGRATION_INTEGRITY_AUDIT.md | Merge unique content to canonical, then delete |
| `LOADING_STATE_AUDIT_REPORT.md` | Component table is useful | Merge table to FRONTEND_ENGINEERING_WORKS.md, then delete |
| `frontend/ASYNC_AUTH_ISSUES_SIMPLIFIED.md` | Visual diagrams valuable | Merge diagrams to audit report, then delete |

---

## 5) Output Deliverables

### Proposed PR Plan (5 Commits)

#### Commit 1: `docs: add documentation index and archive structure`
```
- Create docs/archive/README.md with archival policy
- Create docs/migrations/README.md explaining active migrations
- Update docs/README.md with new navigation
```

#### Commit 2: `docs: archive completed migration and investigation docs`
```
- Move PHASE3_ZUSTAND_MIGRATION_PLAN.md → docs/archive/zustand-migration-plan.md
- Move NEW_LAUNCH_PAGE_INVESTIGATION.md → docs/archive/new-launch-bug-jan2026.md
- Move AUDIT_REPORT.md → docs/archive/stability-audit-dec2025.md
- Move docs/PENDING_BUGS.md → docs/archive/pending-bugs-resolved.md
- Move docs/MIGRATION.md → docs/archive/doc-migration-dec2024.md
```

#### Commit 3: `docs: consolidate duplicate and overlapping docs`
```
- Merge FILTER_SIMPLIFICATION_PLAN.md unique content into docs/plans/filter-simplification.md
- Merge LOADING_STATE_AUDIT_REPORT.md component table into FRONTEND_ENGINEERING_WORKS.md
- Merge frontend/ASYNC_AUTH_ISSUES_SIMPLIFIED.md diagrams into ASYNC_AUTH_AUDIT_REPORT.md
- Move frontend/ASYNC_AUTH_AUDIT_REPORT.md → docs/audits/async-auth-audit.md
- Delete merged source files
```

#### Commit 4: `docs: delete obsolete validation reports`
```
- Delete DATA_QUALITY_REPORT_2025-12-29.md
- Delete MARKET_CORE_DATA_INTEGRITY_REPORT.md
- Delete ABSORPTION_VALIDATION_REPORT.md
- Delete validation_district_deep_dive_2025-12-28.md
- Delete frontend/TURNOVER_RATE_INVESTIGATION.md
- Delete docs/validation/market_core_page_validation_2025-12-28.md
- Delete data_validation/FILTER_VALIDATION_REPORT.md
- Delete docs/investigations/NL-diagnose-checkpoint.md
```

#### Commit 5: `docs: reorganize active migration docs`
```
- Move PARAM_PYDANTIC.md → docs/migrations/pydantic-migration.md
- Move FRONTEND_ENGINEERING_WORKS.md → docs/migrations/frontend-status.md
- Move MIGRATION_INTEGRITY_AUDIT.md → docs/migrations/integrity-audit.md
- Update REPO_MAP.md references
- Update cross-references in moved files
```

### Generated Index Files

#### `/docs/README.md` (Updated)

See existing file - add "Migrations" and "Archive" sections to quick links.

#### `/docs/archive/README.md` (New)

```markdown
# Archived Documentation

Documents moved here are no longer actively maintained but retained for historical reference.

## Contents

| Document | Original Location | Archived | Reason |
|----------|-------------------|----------|--------|
| zustand-migration-plan.md | /PHASE3_ZUSTAND_MIGRATION_PLAN.md | 2026-01-04 | Migration complete |
| new-launch-bug-jan2026.md | /NEW_LAUNCH_PAGE_INVESTIGATION.md | 2026-01-04 | Bug fixed |
| stability-audit-dec2025.md | /AUDIT_REPORT.md | 2026-01-04 | Audit complete |
| pending-bugs-resolved.md | /docs/PENDING_BUGS.md | 2026-01-04 | All bugs resolved |
| doc-migration-dec2024.md | /docs/MIGRATION.md | 2026-01-04 | Migration complete |

## Archival Policy

- **Completed migrations:** Archive after 2 weeks of stability
- **Bug investigations:** Archive when fix is verified in production
- **One-time audits:** Archive or delete after findings addressed
- **Validation reports:** Delete if time-bound; archive if contains methodology

## Retrieval

All archived documents remain searchable via git history.
```

#### `/docs/migrations/README.md` (New)

```markdown
# Active Migrations

Documents tracking ongoing migration efforts.

| Migration | Status | Document |
|-----------|--------|----------|
| Pydantic Validation | Phase 7 Complete, Phase 8 Partial | [pydantic-migration.md](pydantic-migration.md) |
| Frontend Status-only | Largely Complete | [frontend-status.md](frontend-status.md) |
| Migration Integrity | Active Tracking | [integrity-audit.md](integrity-audit.md) |

## Completion Criteria

A migration is complete when:
1. All phases marked done
2. No P0/P1 issues remain
3. 2 weeks of production stability
4. Document moved to /docs/archive/
```

---

## Summary

### Actions Required

| Priority | Action | Files Affected | Effort |
|----------|--------|----------------|--------|
| **P0** | Delete obsolete validation reports | 8 files | 5 min |
| **P1** | Archive completed docs | 5 files | 10 min |
| **P1** | Merge duplicate content | 3 clusters | 30 min |
| **P2** | Reorganize migration docs | 3 files | 15 min |
| **P2** | Update cross-references | ~5 files | 20 min |
| **P3** | Create index files | 2 new files | 15 min |

### Impact

- **Files to delete:** 8
- **Files to archive:** 5
- **Files to merge:** 6 (into 3)
- **Files to move:** 3
- **Net reduction:** ~15 files from working tree
- **New files:** 2 (index files)

### Documentation Health After Cleanup

| Metric | Before | After |
|--------|--------|-------|
| Total docs | 52 | ~35 |
| Root-level clutter | 17 | 6 |
| Duplicate content | 3 clusters | 0 |
| Obsolete reports | 8 | 0 |
| Orphaned investigations | 2 | 0 |

---

**Audit completed by:** Documentation Debt Auditor
**Date:** 2026-01-04
**Next review:** 2026-02-01 (monthly)
