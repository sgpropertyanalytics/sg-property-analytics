# Data Upload Guide

Production-grade data upload with **zero downtime** using staging + atomic publish.

---

## Prerequisite (One-Time)

Install backend modules so scripts can import without sys.path hacks:

```bash
pip install -e .
```

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Architecture Overview](#architecture-overview)
3. [Weekly Update Runbook](#weekly-update-runbook)
4. [Rollback Procedure](#rollback-procedure)
5. [CLI Commands Reference](#cli-commands-reference)
6. [Upload Pipeline Details](#upload-pipeline-details)
7. [Validation Checks](#validation-checks)
8. [Column Mapping](#column-mapping)
9. [Troubleshooting](#troubleshooting)

---

## Quick Reference

```bash
# Standard weekly update (zero downtime)
python -m scripts.upload

# Preview without changes
python -m scripts.upload --dry-run

# Check schema mapping
python -m scripts.upload --check

# Rollback to previous version (if something goes wrong)
python -m scripts.upload --rollback
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                ZERO DOWNTIME UPLOAD ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  FRONTEND/API ──────────► transactions (PRODUCTION)            │
│                               │                                 │
│                          [always stable]                        │
│                               │                                 │
│                               │  (atomic swap when ready)       │
│                               │                                 │
│  UPLOAD SCRIPT ──────────► transactions_staging (ISOLATED)     │
│                               │                                 │
│                          [loading, validating]                  │
│                               │                                 │
│                               ▼                                 │
│                          transactions_prev (BACKUP)             │
│                               │                                 │
│                          [rollback safety]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Guarantees

| Guarantee | How It's Achieved |
|-----------|-------------------|
| Zero downtime | Production table untouched until atomic swap |
| Rollback safety | Previous version kept in `transactions_prev` |
| Concurrency safety | PostgreSQL advisory lock prevents parallel uploads |
| Data integrity | Validation checks before publish |
| Atomicity | Table rename is instantaneous (~1 second) |

---

## Weekly Update Runbook

### Standard Weekly Update

When new CSV data arrives (e.g., new half-year file from URA REALIS):

```bash
# Step 1: Add new CSV files to rawdata/
cp ~/Downloads/2025H2_NewSale.csv rawdata/New\ Sale/2025H2.csv
cp ~/Downloads/2025H2_Resale.csv rawdata/Resale/2025H2.csv

# Step 2: Preview what will happen
python -m scripts.upload --dry-run

# Step 3: Run the upload (staging → validate → publish)
python -m scripts.upload

# Step 4: Verify on frontend
# Open browser and check dashboard shows new data
```

### What Happens During Upload

```
Timeline:
─────────────────────────────────────────────────────────────────
0:00  Create transactions_staging table
0:01  Load CSV 1 to staging...
0:02  Load CSV 2 to staging...
...
1:30  Deduplicate staging
1:45  Remove outliers from staging
2:00  Validate staging data
2:10  ATOMIC SWAP (< 1 second)
      │
      ├── transactions → transactions_prev
      └── transactions_staging → transactions
      │
      └── Frontend now sees new data!
2:15  Recompute analytics stats
2:30  Done!
─────────────────────────────────────────────────────────────────

During 0:00 - 2:10: Frontend serves OLD data (stable)
At 2:10:           Instant switch to NEW data
After 2:10:        Frontend serves NEW data
```

### For Render Production

```bash
# In Render Shell:
python -m scripts.upload

# Monitor progress via logs
# Upload takes ~2-5 minutes depending on data size
```

---

## Rollback Procedure

If something goes wrong after publish:

```bash
# Rollback to previous version
python -m scripts.upload --rollback

# With --force to skip confirmation
python -m scripts.upload --rollback --force
```

### What Rollback Does

```
Before rollback:
  transactions      = new (broken) data
  transactions_prev = old (good) data

After rollback:
  transactions      = old (good) data  ← Frontend uses this
  transactions_staging = new (broken) data  ← Moved here for debugging
```

### Rollback Availability

- Previous version is kept until the NEXT successful upload
- You can rollback anytime before running another upload
- After a new upload, the old `transactions_prev` is replaced

---

## CLI Commands Reference

### Main Upload Script

```bash
python -m scripts.upload [OPTIONS]
```

| Option | Description |
|--------|-------------|
| (none) | Full pipeline: staging → validate → publish |
| `--staging-only` | Load to staging, don't publish (for review) |
| `--publish` | Publish existing staging to production |
| `--rollback` | Rollback production to previous version |
| `--check` | Schema parity check only |
| `--dry-run` | Preview without changes |
| `--skip-validation` | Skip validation (not recommended) |
| `--force` / `-f` | Skip confirmation prompts |

### Example Workflows

```bash
# Normal update (most common)
python -m scripts.upload

# Two-step update (review staging before publish)
python -m scripts.upload --staging-only
# ... review staging data in database ...
python -m scripts.upload --publish

# Emergency rollback
python -m scripts.upload --rollback --force

# Check if CSV matches database schema
python -m scripts.upload --check
```

---

## Upload Pipeline Details

### Stage 1: Create Staging Table

```sql
DROP TABLE IF EXISTS transactions_staging;
CREATE TABLE transactions_staging (...);
```

### Stage 2: Load CSV to Staging

```
rawdata/
├── New Sale/*.csv  →  INSERT INTO transactions_staging
└── Resale/*.csv    →  INSERT INTO transactions_staging
```

- Processes one CSV at a time (memory efficient)
- Cleans and transforms data
- Classifies bedrooms and floor levels

### Stage 3: Deduplicate

```sql
DELETE FROM transactions_staging
WHERE id NOT IN (
    SELECT MIN(id)
    FROM transactions_staging
    GROUP BY project_name, transaction_date, price, area_sqft, floor_range
);
```

### Stage 4: Remove Outliers

Uses **GLOBAL IQR method** (across all transactions):

```sql
-- Calculate global bounds
Q1 = PERCENTILE_CONT(0.25) across ALL transactions
Q3 = PERCENTILE_CONT(0.75) across ALL transactions
IQR = Q3 - Q1

-- Remove outliers
DELETE FROM transactions_staging
WHERE price < (Q1 - 1.5 * IQR) OR price > (Q3 + 1.5 * IQR)
```

**Why Global IQR?**
- Catches extreme outliers (e.g., $890M transactions) that per-group IQR would miss
- Ensures consistent price distribution charts
- Typical bounds: ~$0 - $4M for Singapore condos

### Stage 5: Validate

See [Validation Checks](#validation-checks) below.

### Stage 6: Atomic Publish

```sql
BEGIN;
  ALTER TABLE transactions RENAME TO transactions_prev;
  ALTER TABLE transactions_staging RENAME TO transactions;
  CREATE INDEX ... ON transactions(...);
COMMIT;
```

### Stage 7: Recompute Stats

Pre-computes analytics for fast API responses.

---

## Validation Checks

Before publishing, the script validates staging data:

| Check | Threshold | Failure Action |
|-------|-----------|----------------|
| Row count | ≥ 1,000 | Block publish |
| project_name nulls | 0% | Block publish |
| price nulls | 0% | Block publish |
| area_sqft nulls | 0% | Block publish |
| district nulls | ≤ 1% | Block publish |
| transaction_date nulls | 0% | Block publish |
| Price range | $50K - $100M | Warn if > 1% |
| PSF range | $100 - $20K | Warn if > 1% |

### Bypassing Validation (Not Recommended)

```bash
python -m scripts.upload --skip-validation
```

---

## Outlier Handling Architecture

### Key Principle: Outlier Filtering Happens ONCE

```
┌─────────────────────────────────────────────────────────────────┐
│              OUTLIER FILTERING - SINGLE LOCATION                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  UPLOAD PIPELINE (staging):                                     │
│    Stage 4: filter_outliers_staging()                           │
│    ✅ ONLY place outliers are removed                           │
│    ✅ Uses global IQR method                                    │
│    ✅ Runs ONCE per upload                                      │
│                                                                 │
│  APP STARTUP:                                                   │
│    _run_startup_validation()                                    │
│    ✅ READ-ONLY - reports issues, NO deletions                  │
│    ✅ Ensures deterministic datasets                            │
│    ✅ Same row count after every restart                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Design?

| Problem | Solution |
|---------|----------|
| IQR drift (recalculating bounds creates new outliers) | Filter once in staging, never again |
| Non-deterministic datasets | App startup is read-only |
| Debugging difficulty | Single location for outlier logic |
| Reproducibility | Same upload → same output |

### Files Involved

| File | Function | Mutates DB? |
|------|----------|-------------|
| `scripts/upload.py` | `filter_outliers_staging()` | ✅ Yes (staging only) |
| `backend/app.py` | `_run_startup_validation()` | ❌ No (read-only) |
| `backend/services/data_validation.py` | `run_validation_report()` | ❌ No (read-only) |
| `backend/services/data_validation.py` | `run_all_validations()` | ⚠️ Yes (deprecated, upload only) |

### Test Coverage

```bash
# Verify app restart doesn't change row counts
pytest tests/test_startup_no_mutations.py -v
```

---

## Column Mapping

### CSV to Database Mapping

| CSV Column (URA REALIS) | DB Column | Type |
|-------------------------|-----------|------|
| Project Name | `project_name` | VARCHAR(255) |
| Street Name | `street_name` | TEXT |
| Property Type | `property_type` | VARCHAR(100) |
| Postal District | `district` | VARCHAR(10) |
| Market Segment | `market_segment` | VARCHAR(10) |
| Tenure | `tenure` | TEXT |
| Type of Sale | `sale_type` | VARCHAR(50) |
| No. of Units | `num_units` | INTEGER |
| Nett Price ($) | `nett_price` | FLOAT |
| Transacted Price ($) | `price` | FLOAT |
| Area (SQFT) | `area_sqft` | FLOAT |
| Type of Area | `type_of_area` | VARCHAR(20) |
| Unit Price ($ PSF) | `psf` | FLOAT |
| Sale Date | `transaction_date` | DATE |
| Floor Range | `floor_range` | VARCHAR(20) |

### Computed Columns

| DB Column | Source | Notes |
|-----------|--------|-------|
| `floor_level` | Computed from `floor_range` | Low, Mid-Low, Mid, Mid-High, High, Luxury |
| `bedroom_count` | Computed from `area_sqft` | Uses three-tier classification |
| `contract_date` | Derived from `transaction_date` | MMYY format |
| `lease_start_year` | Parsed from `tenure` | 4-digit year |
| `remaining_lease` | Calculated from `tenure` | Years remaining |

### Floor Level Classification

| Floor Range | Classification |
|-------------|----------------|
| 01 – 05 | Low |
| 06 – 10 | Mid-Low |
| 11 – 20 | Mid |
| 21 – 30 | Mid-High |
| 31 – 40 | High |
| 41+ | Luxury |

---

## Troubleshooting

### "Another upload is already running"

The script uses PostgreSQL advisory locks to prevent concurrent uploads.

```bash
# Wait for the other upload to finish, or
# If you're sure no upload is running, the lock may be stale
# The lock is released when the connection closes
```

### Validation Failed

```bash
# Check the specific validation error in the output
# Common issues:
# - Row count too low: Check if CSVs are in correct folders
# - Null rates too high: Check CSV data quality
# - Price/PSF outliers: May indicate data issues

# To bypass validation (use with caution):
python -m scripts.upload --skip-validation
```

### Rollback Not Available

```bash
# If you see "No previous version available for rollback"
# This means transactions_prev doesn't exist because:
# - This is the first upload
# - A previous rollback already swapped the tables

# Check what tables exist:
psql -c "\dt transactions*"
```

### Staging Table Left Behind

If an upload failed mid-way, you may have a stale staging table:

```bash
# Option 1: Run a fresh upload (drops and recreates staging)
python -m scripts.upload

# Option 2: Manually drop staging
psql -c "DROP TABLE IF EXISTS transactions_staging"
```

### Verify Data After Upload

```bash
python -c "
from app import create_app
from models.transaction import Transaction

app = create_app()
with app.app_context():
    count = Transaction.query.count()
    sample = Transaction.query.first()
    print(f'Total transactions: {count:,}')
    print(f'Sample floor_level: {sample.floor_level}')
    print(f'Sample market_segment: {sample.market_segment}')
"
```

---

## File Structure

```
sg-property-analyzer/
├── rawdata/
│   ├── New Sale/
│   │   ├── 2023H1.csv
│   │   ├── 2023H2.csv
│   │   └── ...
│   └── Resale/
│       ├── 2023H1.csv
│       ├── 2023H2.csv
│       └── ...
├── scripts/
│   └── upload.py         ← Main upload script
└── backend/
    ├── services/
    │   ├── data_loader.py
    │   ├── data_validation.py
    │   └── classifier_extended.py
    └── models/
        └── transaction.py
```

---

## Database Tables

| Table | Purpose | Lifecycle |
|-------|---------|-----------|
| `transactions` | Production data (API reads from here) | Always present |
| `transactions_staging` | Staging area during upload | Created/dropped per upload |
| `transactions_prev` | Previous production backup | Kept until next upload |

---

*Last updated: December 2024*
