# Documentation Migration

This document explains the documentation reorganization completed in December 2024.

## New Documentation Structure

```
/docs
├── README.md           # High-level overview, quick links
├── architecture.md     # System design, data flow, tech stack
├── backend.md          # APIs, SQL rules, services
├── frontend.md         # UI, charts, filter system, adapters
├── data-model.md       # Metrics, bands, classifications
├── access-control.md   # Tiers, paywall, compliance
├── decisions.md        # Design decisions, roadmap
├── glossary.md         # Terms, acronyms, mappings
├── DEPLOYMENT.md       # Operational: deployment guide
├── DATA_UPLOAD_GUIDE.md # Operational: data upload
└── MIGRATION.md        # This file
```

## Files Deleted (Obsolete/Duplicate)

| File | Reason |
|------|--------|
| `docs/PERFORMANCE_CHECKLIST.md` | Duplicate of root `PERFORMANCE_CHECKLIST.md` |
| `DEAD_CODE_AUDIT.md` | One-time audit report, not ongoing documentation |
| `SAAS_SETUP_COMPLETE.md` | Outdated setup notes (references dead Ad system) |
| `COMPLIANCE_REVIEW_REPORT.md` | One-time audit report |
| `CHART_MIGRATION_CHECKLIST.md` | Migration complete (all charts done) |

## Files Archived (Content Merged)

Content from these files was consolidated into the new structure and the originals archived:

| Original File | Merged Into | Reason |
|---------------|-------------|--------|
| `TECHNICAL_ARCHITECTURE.md` | `architecture.md` | Consolidated architecture docs |
| `DATA_PIPELINE_AUDIT.md` | `architecture.md`, `data-model.md` | Pipeline details integrated |
| `POWER_BI_PATTERNS.md` | `frontend.md` | Filter patterns documented |
| `SQL_BEST_PRACTICES.md` | `backend.md` | SQL rules documented |
| `CONTRACT_ASYNC_SAFETY.md` | `frontend.md` | Async patterns documented |
| `PERFORMANCE_ANALYSIS.md` | `architecture.md`, `decisions.md` | Performance decisions documented |
| `PERFORMANCE_CHECKLIST.md` | `backend.md`, `DEPLOYMENT.md` | Operational checklists |
| `CONTRACT_DEPRECATION.md` | `backend.md`, `decisions.md` | API versioning documented |
| `LEGAL_COMPLIANCE.md` | `access-control.md` | Compliance rules documented |
| `docs/INVENTORY_INTEGRATION_DESIGN.md` | `decisions.md` | Feature roadmap |

## Files Kept Unchanged

| File | Reason |
|------|--------|
| `docs/DEPLOYMENT.md` | Active operational guide |
| `docs/DATA_UPLOAD_GUIDE.md` | Active operational guide |
| `frontend/README.md` | Package-specific readme |
| `scripts/README.md` | Package-specific readme |
| `.claude/**/*.md` | Claude configuration files |

## Root README.md

Updated to point to `/docs/README.md` for detailed documentation.

## Migration Benefits

1. **Reduced duplication** - Single source of truth for each topic
2. **Cleaner organization** - Logical grouping by domain
3. **Easier maintenance** - Clear ownership per file
4. **Better onboarding** - Progressive depth (README → specific docs)

---

*Migration completed: December 2024*
