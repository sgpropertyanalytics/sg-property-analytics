# Data Ingestion & Scraping Architecture

> **Core Principle:** One ingestion pipeline. One source of truth. All changes auditable.

---

## 1. System Purpose

This system ingests, validates, and consolidates property market data from multiple sources into structured domain tables for analytics and visualization.

**Designed to:**
- Track provenance
- Detect schema drift
- Prevent silent data corruption
- Support future multi-source reconciliation
- Maintain auditability and reproducibility

**Not optimized for:**
- Maximum scraping speed
- Blind automation
- High-frequency scraping

---

## 2. Data Sources

### Scraped Sources

| Data | Source | Method |
|------|--------|--------|
| GLS Tenders | URA.gov.sg | Web scraping |
| Geocoding | OneMap API | API |

> **Note:** GLS is the only scraped dataset.

### File-Based Sources (Not Scraped)

| Data | Source | Method |
|------|--------|--------|
| Transactions | URA REALIS | CSV upload (ETL) |
| Total Units | Manual CSV | File-based |
| Upcoming Launches | Manual CSV | File-based |

---

## 3. Unit Data Model

Unit counts use a 3-tier confidence system:

| Tier | Source | Confidence |
|------|--------|------------|
| 1 | Manual CSV (`new_launch_units.csv`) | High |
| 2 | `upcoming_launches` table | Medium |
| 3 | Estimated from transactions | Low |

**This hierarchy is intentional and must be preserved.**

---

## 4. Architecture Overview

### A. Legacy Scraper (Production)

**File:** `services/gls_scraper.py`

**Responsibilities:**
- Fetch URA GLS pages
- Parse tender data
- Call OneMap API
- ❌ Writes directly to `gls_tenders`

**Limitations:**
- No diffing
- No audit trail
- No schema change detection
- No conflict detection

### B. Ingestion Orchestrator (Built, Activating)

**Location:** `scrapers/` (rename mentally to "ingestion orchestrator")

**Purpose:** A generalized ingestion framework responsible for:
- Run tracking
- Provenance
- Schema change detection
- Multi-source readiness
- Promotion gating
- Diff vs existing

**Key Components:**

| File | Purpose |
|------|---------|
| `orchestrator.py` | Execution controller |
| `tier_system.py` | Source trust levels |
| `field_authority.py` | Field ownership rules |
| `rate_limiter.py` | Domain-keyed rate limiting |
| `adapters/ura_gls.py` | Wraps legacy scraper |
| `promoters/` | Domain writers |
| `utils/schema_diff.py` | Structure change detection |
| `utils/hashing.py` | Content fingerprinting |

**Tracking Tables:**
- `scrape_runs` → `ingestion_runs`
- `scraped_entities`
- `canonical_entities`
- `entity_candidates`
- `scraper_schema_changes`
- `discovered_links`

---

## 5. Current State

| Area | Status |
|------|--------|
| Legacy scraper | ✅ Active |
| Orchestrator infrastructure | ✅ Built |
| Orchestrator in production | ⚠️ Ready (needs migration) |
| Diff vs existing | ✅ Implemented |
| Conflict detection | ✅ Implemented |
| Promotion gating | ✅ Implemented |
| Multi-source ingestion | ✅ Ready (adapters built) |
| Cross-validation (Phase 3) | ✅ Complete |

> **Note:** Run migration 014 to enable unified ingestion tracking.

---

## 6. Core Design Rule (NON-NEGOTIABLE)

**Only the orchestrator may write to domain tables** (`gls_tenders`, `upcoming_launches`).

The scraper/uploader:
- ✅ May fetch and parse data
- ✅ May enrich with geocoding
- ❌ Must not write production tables directly

---

## 7. Correct Ingestion Flow

```
Scraper / CSV / API
       ↓
scraped_entities (raw extraction)
       ↓
canonical_entities (merged truth)
       ↓
diff + reconciliation
       ↓
promotion gate (block on conflicts)
       ↓
domain tables (gls_tenders, upcoming_launches, transactions)
```

---

## 8. Required Capabilities (To Implement)

### Diff Detection
Every ingestion must output:
- `unchanged` — no change from existing
- `changed` — values differ (list fields)
- `new` — record doesn't exist yet
- `missing` — record exists but not in source (deletion candidate)

### Conflict Detection
Flag suspicious changes:
- Value swings > threshold (e.g., units changed by >50%)
- Regressions (awarded → launched)
- Invalid state transitions
- Null → value where shouldn't happen

### Promotion Gating
- Block on hard conflicts
- Configurable thresholds
- Require approval for suspicious changes
- Auto-promote clean records

### Audit Output
- Per-run diff reports
- `run_id` on every change
- `who/what triggered it`
- Reproducibility

---

## 9. Multi-Source Policy

Multi-source scraping (PropertyGuru, 99.co, etc.) is:
- ❌ NOT active
- ⚠️ NOT required yet
- ✅ Architecturally supported

If added:
- Treated as Tier B/C
- Never auto-promoted
- Routed to `entity_candidates`
- Requires manual approval

---

## 10. Verification Mode for File-Based Datasets

### Purpose
CSV values were historically scraped and may be inaccurate. Periodic verification ensures data quality.

### Datasets Requiring Verification
- `new_launch_units.csv` (total units)
- `upcoming_launches.csv` (launch schedule + metadata)
- Derived "units from transactions" estimates

### Verification Sources + Trust Tiers

| Tier | Sources | Use |
|------|---------|-----|
| **A** (highest) | URA, official docs, developer PDFs, official project pages | Authoritative |
| **B** | PropertyGuru, 99.co, EdgeProp | Cross-validation |
| **C** | Blogs, forums | Never used to auto-correct |

### Cross-Validation Logic

#### A) Total Units (`new_launch_units.csv`)

For each project:
1. Check "units" from Tier A/B sources if available
2. Cross-check internal consistency:
   - If `transactions_count > total_units` → **hard conflict**
   - If units suspiciously low/high → **warning**
3. Compare CSV value vs verification value:
   - Exact match → ✅ `CONFIRMED`
   - Mismatch → ⚠️ `CONFLICT` (requires approval)
   - Cannot verify → 🟨 `UNVERIFIED` (keep CSV)

**Output fields:**
```
units_verified_value
units_verified_sources[]
units_verification_status = CONFIRMED | CONFLICT | UNVERIFIED
units_last_verified_at
units_last_verified_run_id
```

#### B) Upcoming Launches

Verify:
- Project exists (name/alias mapping)
- Launch month/quarter plausibility
- Status transitions (rumoured → preview → launched → sold out)
- Cross-check vs GLS tender linkage

### Promotion Policy

Verification results **do not directly overwrite** CSV or domain tables.

Instead:
1. Write to `entity_candidates` (or `verification_candidates`) with:
   - `before` / `after` values
   - `sources[]`
   - `confidence_score`
   - `recommended_action`
2. Only after approval (manual or rule-based) update:
   - `new_launch_units.csv` (or migrate to DB table)
   - `upcoming_launches` table

### Run Cadence

| Frequency | Scope |
|-----------|-------|
| **Weekly** | Sample (top N active / most-viewed / recently transacted) |
| **Monthly** | Full sweep of all projects in CSV |

**Trigger conditions for immediate check:**
- Project appears in transactions but has missing/low-confidence units
- Transaction volume spikes
- New GLS tender awarded / new launch introduced

### Verification Report Format

```
Verification Report
═══════════════════
✅ Confirmed: X
⚠️ Mismatch candidates: Y
‼️ Hard conflicts: Z
🟨 Unverified: W

Top Issues:
┌─────────────┬─────────┬───────────┬─────────────┬────────────┬─────────────┐
│ Project     │ Current │ Suggested │ Sources     │ Confidence │ Action      │
├─────────────┼─────────┼───────────┼─────────────┼────────────┼─────────────┤
│ THE INTERLACE│ 1,040  │ 1,040     │ URA, PG     │ HIGH       │ CONFIRM     │
│ D'LEEDON    │ 1,700   │ 1,715     │ EdgeProp    │ MEDIUM     │ REVIEW      │
└─────────────┴─────────┴───────────┴─────────────┴────────────┴─────────────┘
```

---

## 11. Implementation Roadmap

### Phase 1: Unified Ingestion Pattern ✅ COMPLETE
- [x] Rename `scrape_runs` → `ingestion_runs` (migration 014)
- [x] Add `source_type` column (scrape, csv_upload, api, manual)
- [x] Add diff detection to orchestrator (`scrapers/utils/diff.py`)
- [x] Add promotion gating logic (`orchestrator.py` - `promote_with_diff()`)
- [x] Create `IngestionRun` model with `SourceType` enum
- [x] Maintain backwards compatibility (`ScrapeRun` alias)

### Phase 2: Apply to All Pipelines
**Scraping (orchestrator):**
- [x] GLS scrape → orchestrator with diff (`run_scraper_with_diff()`)

**ETL (separate pipeline - see `etl-pipeline` agent):**
- [ ] Upcoming launches CSV → ETL pipeline
- [ ] New launch units CSV → ETL pipeline
- [ ] URA REALIS ETL → ETL pipeline

> **Note:** CSV/file processing is handled by the `etl-pipeline` agent, NOT the scraping orchestrator.
> The scraping orchestrator is for WEB SCRAPING only.

### Phase 3: Verification Mode ✅ COMPLETE
- [x] Create `verification_candidates` table (migration 012)
- [x] Implement cross-validation logic (`scrapers/utils/cross_validator.py`)
- [x] Add verification status fields to domain tables (migration 013)
- [x] Build verification report generator (`services/verification_report.py`)
- [x] Create 5 Tier B adapters (PropertyGuru, EdgeProp, 99.co, ERA, PropNex)
- [x] Build verification API routes (`/api/verification/*`)
- [x] Enforce 3-source minimum for auto-confirm

### Phase 4: UI Integration
- [ ] Show confidence badges on unit counts
- [ ] Review queue for conflicts
- [ ] Verification status indicators

---

## 12. File Reference

### Core Infrastructure
| File | Purpose |
|------|---------|
| `backend/scrapers/orchestrator.py` | Scraping orchestrator (web scraping only) |
| `backend/scrapers/tier_system.py` | Source trust levels |
| `backend/scrapers/field_authority.py` | Field ownership rules |
| `backend/scrapers/base.py` | Base scraper class |
| `backend/scrapers/utils/diff.py` | Diff detection module |
| `backend/scrapers/utils/cross_validator.py` | Cross-validation logic |
| `backend/services/gls_scraper.py` | Legacy GLS scraper |
| `backend/services/new_launch_units.py` | 3-tier unit lookup |
| `backend/services/verification_service.py` | Verification orchestration |
| `backend/services/verification_report.py` | Report generator |

### Models
| File | Purpose |
|------|---------|
| `backend/scrapers/models/ingestion_run.py` | IngestionRun + SourceType |
| `backend/scrapers/models/scraped_entity.py` | Per-source extraction |
| `backend/scrapers/models/canonical_entity.py` | Merged truth |
| `backend/scrapers/models/verification_candidate.py` | Cross-validation results |

### Verification Adapters
| File | Purpose |
|------|---------|
| `backend/scrapers/adapters/verification_base.py` | Base adapter class |
| `backend/scrapers/adapters/propertyguru_verification.py` | PropertyGuru |
| `backend/scrapers/adapters/edgeprop_verification.py` | EdgeProp |
| `backend/scrapers/adapters/ninety_nine_verification.py` | 99.co |
| `backend/scrapers/adapters/era_verification.py` | ERA |
| `backend/scrapers/adapters/propnex_verification.py` | PropNex |

### Migrations
| File | Purpose |
|------|---------|
| `backend/migrations/010_create_scraper_tables.sql` | Initial scraper tables |
| `backend/migrations/012_create_verification_candidates.sql` | Verification candidates |
| `backend/migrations/013_add_verification_status_columns.sql` | Domain table columns |
| `backend/migrations/014_rename_scrape_runs_to_ingestion_runs.sql` | Unified ingestion |

### Data Files
| File | Purpose |
|------|---------|
| `backend/data/new_launch_units.csv` | Manual unit counts |
| `backend/data/upcoming_launches.csv` | Launch schedule |

### Agents
| Agent | Purpose |
|-------|---------|
| `scraping-orchestrator.md` | Scraping/ingestion guidance |
| `etl-pipeline.md` | URA REALIS CSV processing |
| `data-integrity-validator.md` | Data quality checks |

---

## 13. Guidelines for All Future Changes

When proposing or implementing changes:

✅ Respect the orchestrator as the sole write authority
✅ Preserve provenance
✅ Avoid duplicate write paths
✅ Prefer reconciliation over overwrite
❌ Do not add direct-write promotion logic
❌ Do not bypass canonicalization

---

## 14. Long-Term Recommendation

Migrate from CSV files to database tables with proper audit fields:

```sql
CREATE TABLE project_reference (
    id SERIAL PRIMARY KEY,
    project_name VARCHAR(255) UNIQUE NOT NULL,
    total_units INTEGER,
    units_source VARCHAR(50),
    units_confidence VARCHAR(20),
    units_verified_at TIMESTAMP,
    units_verified_run_id VARCHAR(36),
    developer VARCHAR(255),
    tenure VARCHAR(50),
    district VARCHAR(10),
    -- ... other fields
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

This provides:
- Audit trail on every change
- Confidence tracking
- Verification status
- Run linkage

Keep CSV as import/export format, not source of truth.
