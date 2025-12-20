# Data Upload Guide

This guide explains how to upload URA REALIS CSV data into the Singapore Property Analyzer database.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [File Structure](#file-structure)
3. [Upload Process Overview](#upload-process-overview)
4. [Step-by-Step Upload Flow](#step-by-step-upload-flow)
5. [Handling New Weekly Data](#handling-new-weekly-data)
6. [CLI Commands Reference](#cli-commands-reference)
7. [Column Mapping](#column-mapping)
8. [Floor Level Classification](#floor-level-classification)
9. [Troubleshooting](#troubleshooting)

---

## Quick Reference

```bash
# Full reimport (clears existing data)
python -m scripts.upload --force

# Preview without changes
python -m scripts.upload --dry-run

# Check schema mapping
python -m scripts.upload --check

# Append new data (keeps existing)
python -m scripts.upload
# When prompted, choose "no" to keep existing data
```

---

## File Structure

```
sg-property-analyzer/
├── rawdata/
│   ├── New Sale/
│   │   ├── 2023H1.csv
│   │   ├── 2023H2.csv
│   │   ├── 2024H1.csv
│   │   ├── 2024H2.csv
│   │   └── 2025H1.csv    ← Add new files here
│   └── Resale/
│       ├── 2023H1.csv
│       ├── 2023H2.csv
│       ├── 2024H1.csv
│       ├── 2024H2.csv
│       └── 2025H1.csv    ← Add new files here
├── scripts/
│   └── upload.py         ← Main upload script
└── backend/
    ├── services/
    │   ├── data_loader.py        ← CSV cleaning & transformation
    │   ├── data_validation.py    ← Deduplication & outlier removal
    │   ├── data_computation.py   ← Analytics pre-computation
    │   └── classifier_extended.py ← Floor level classification
    └── models/
        └── transaction.py        ← Database model
```

---

## Upload Process Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    UPLOAD PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  rawdata/*.csv                                              │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────┐                                        │
│  │  pd.read_csv()  │  Read raw CSV files                    │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ clean_csv_data()│  Filter, parse, transform              │
│  │                 │  - Filter: Condo/Apt only              │
│  │                 │  - Parse: Dates, prices, areas         │
│  │                 │  - Classify: Bedrooms, floor levels    │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │  Transaction()  │  Create ORM objects                    │
│  │  bulk_insert    │  Insert in batches of 500              │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ Deduplication   │  Remove duplicate transactions         │
│  │ (SQL-based)     │  Match: project, date, price, area,    │
│  │                 │         floor_range                    │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ Outlier Filter  │  IQR method per district/bedroom       │
│  │ (SQL-based)     │  Remove statistical anomalies          │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────┐                                        │
│  │ Recompute Stats │  Pre-compute analytics                 │
│  │                 │  - Price trends                        │
│  │                 │  - District summaries                  │
│  │                 │  - Bedroom breakdowns                  │
│  └────────┬────────┘                                        │
│           │                                                 │
│           ▼                                                 │
│      PostgreSQL                                             │
│      (Render DB)                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Upload Flow

### Step 1: Script Initialization
**File:** `scripts/upload.py`

- Parses command-line arguments (`--force`, `--check`, `--dry-run`)
- Locates `rawdata/` folder
- Creates Flask app with database connection

### Step 2: Clear Existing Data (if --force)
**File:** `scripts/upload.py`

```sql
DELETE FROM transactions;
```

### Step 3: Read CSV Files
**File:** `scripts/upload.py` → `process_and_save_csv()`

- Reads each CSV from `rawdata/New Sale/` and `rawdata/Resale/`
- Tries multiple encodings: UTF-8, Latin-1, ISO-8859-1, CP1252

### Step 4: Clean & Transform
**File:** `backend/services/data_loader.py` → `clean_csv_data()`

| Operation | Details |
|-----------|---------|
| Filter property types | Keep: Condo, Apartment. Exclude: EC, HDB |
| Parse dates | "Dec-20" → 2020-12-01 |
| Parse district | "District 9" → "D09" |
| Parse prices | "$1,500,000" → 1500000.0 |
| Classify bedrooms | Based on area_sqft and sale date |
| Classify floor level | Based on floor_range |

### Step 5: Floor Level Classification
**File:** `backend/services/classifier_extended.py` → `classify_floor_level()`

| Floor Range | Classification |
|-------------|----------------|
| 01 – 05 | Low |
| 06 – 10 | Mid-Low |
| 11 – 20 | Mid |
| 21 – 30 | Mid-High |
| 31 – 40 | High |
| 41+ | Luxury |

### Step 6: Insert to Database
**File:** `scripts/upload.py`

- Creates `Transaction` objects for each row
- Batch inserts 500 rows at a time
- Uses `bulk_save_objects()` for efficiency

### Step 7: Remove Duplicates
**File:** `backend/services/data_validation.py` → `remove_duplicates_sql()`

```sql
DELETE FROM transactions
WHERE id NOT IN (
    SELECT MIN(id)
    FROM transactions
    GROUP BY project_name, transaction_date, price, area_sqft,
             COALESCE(floor_range, '')
)
```

### Step 8: Remove Outliers
**File:** `backend/services/data_validation.py` → `filter_outliers_sql()`

For each (district, bedroom_count) group:
- Calculate Q1, Q3, IQR for price
- Remove: `price < Q1 - 1.5×IQR` or `price > Q3 + 1.5×IQR`

### Step 9: Recompute Analytics
**File:** `backend/services/data_computation.py` → `recompute_all_stats()`

- Pre-computes price trends, district summaries, bedroom breakdowns
- Stores in `analytics_cache` table for fast API responses

---

## Handling New Weekly Data

### When You Receive New CSV Files

URA REALIS typically releases data in half-yearly batches (H1/H2). When new data arrives:

#### Option A: Full Reimport (Recommended for Major Updates)

Best when: New half-year file, data corrections, or schema changes.

```bash
# 1. Add new CSV file to rawdata/
cp ~/Downloads/2025H2.csv rawdata/New\ Sale/
cp ~/Downloads/2025H2.csv rawdata/Resale/

# 2. Full reimport
python -m scripts.upload --force
```

#### Option B: Append New Data (For Incremental Updates)

Best when: Adding a single new file without modifying existing data.

```bash
# 1. Add new CSV file to rawdata/
cp ~/Downloads/2025H2.csv rawdata/New\ Sale/

# 2. Run upload without --force
python -m scripts.upload

# 3. When prompted "Clear and reload?", type: no
#    This appends new data and deduplicates
```

### How Deduplication Works

The system uses SQL-based deduplication to handle incremental updates:

```
┌────────────────────────────────────────────────────────────┐
│                  DEDUPLICATION LOGIC                       │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Existing DB:  [A, B, C, D, E]                             │
│  New CSV:      [D, E, F, G]     (D, E are duplicates)      │
│                                                            │
│  After append: [A, B, C, D, E, D, E, F, G]                 │
│                                                            │
│  After dedup:  [A, B, C, D, E, F, G]                       │
│                ✓ Keeps first occurrence (lowest ID)        │
│                ✓ Only truly new records (F, G) remain      │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Duplicate detection keys:**
- `project_name`
- `transaction_date`
- `price`
- `area_sqft`
- `floor_range`

### Current Limitation

> **Note:** The current implementation reads ALL CSV files in `rawdata/` on every run, even for incremental updates. This is by design for simplicity and data integrity, but means:
>
> - **Full reimport:** ~2-5 minutes depending on data size
> - **Append mode:** Same time, but existing DB data is preserved
>
> The deduplication step ensures no duplicate transactions, so this is safe but not optimized for very frequent updates.

### Recommended Workflow for Weekly Updates

```bash
# 1. Preview what will happen
python -m scripts.upload --dry-run

# 2. Check schema compatibility
python -m scripts.upload --check

# 3. Run the import
python -m scripts.upload --force

# 4. Verify on Render
# Go to Render Dashboard → Your Service → Logs
```

---

## CLI Commands Reference

### Main Upload Script

```bash
python -m scripts.upload [OPTIONS]
```

| Option | Description |
|--------|-------------|
| (none) | Interactive mode - prompts to clear or append |
| `--force` / `-f` | Clear all existing data, no prompt |
| `--check` | Schema parity check only (no import) |
| `--dry-run` | Preview without making changes |
| `--skip-validation` | Skip deduplication and outlier removal |

### Examples

```bash
# Full reimport (most common)
python -m scripts.upload --force

# Check if CSV columns match database schema
python -m scripts.upload --check

# See what would happen without changes
python -m scripts.upload --dry-run

# Import without removing outliers (debugging)
python -m scripts.upload --force --skip-validation
```

### For Render Production

```bash
# In Render Shell:
python -m scripts.upload --force
```

---

## Column Mapping

### CSV to Database Mapping

| CSV Column (URA REALIS) | DB Column | Type | Notes |
|-------------------------|-----------|------|-------|
| Project Name | `project_name` | VARCHAR(255) | Required, indexed |
| Street Name | `street_name` | TEXT | Full address |
| Property Type | `property_type` | VARCHAR(100) | Condo, Apartment |
| Postal District | `district` | VARCHAR(10) | Parsed to D01-D28 |
| Market Segment | `market_segment` | VARCHAR(10) | CCR, RCR, OCR |
| Tenure | `tenure` | TEXT | Original text |
| Type of Sale | `sale_type` | VARCHAR(50) | New Sale, Resale |
| No. of Units | `num_units` | INTEGER | For bulk transactions |
| Nett Price ($) | `nett_price` | FLOAT | Alternative price |
| Transacted Price ($) | `price` | FLOAT | Required |
| Area (SQFT) | `area_sqft` | FLOAT | Required |
| Type of Area | `type_of_area` | VARCHAR(20) | Strata, Land |
| Unit Price ($ PSF) | `psf` | FLOAT | Required |
| Sale Date | `transaction_date` | DATE | Required, indexed |
| Floor Range | `floor_range` | VARCHAR(20) | e.g., "01 to 05" |

### Computed Columns

| DB Column | Source | Notes |
|-----------|--------|-------|
| `floor_level` | Computed from `floor_range` | Low, Mid-Low, Mid, Mid-High, High, Luxury |
| `bedroom_count` | Computed from `area_sqft` | Uses three-tier classification |
| `contract_date` | Derived from `transaction_date` | MMYY format |
| `lease_start_year` | Parsed from `tenure` | 4-digit year |
| `remaining_lease` | Calculated from `tenure` | Years remaining |

---

## Floor Level Classification

```
Floor Range    →    Classification
─────────────────────────────────
01 – 05        →    Low
06 – 10        →    Mid-Low
11 – 20        →    Mid
21 – 30        →    Mid-High
31 – 40        →    High
41+            →    Luxury
```

**Implementation:** `backend/services/classifier_extended.py` → `classify_floor_level()`

---

## Troubleshooting

### Common Issues

#### 1. "CSV folder not found"
```bash
# Ensure rawdata folder exists with correct structure
ls -la rawdata/
ls -la rawdata/New\ Sale/
ls -la rawdata/Resale/
```

#### 2. "No valid data after cleaning"
- Check CSV file encoding (UTF-8 preferred)
- Verify column names match URA REALIS format
- Ensure Property Type contains "Condo" or "Apartment"

#### 3. Schema mismatch
```bash
# Run schema check
python -m scripts.upload --check
```

#### 4. Memory issues on Render
The script is designed for 512MB limit:
- Processes one CSV at a time
- Uses SQL-based deduplication (not pandas)
- Clears memory after each file

#### 5. Verify data after upload
```bash
python -c "
import sys; sys.path.insert(0, 'backend')
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

## Appendix: Database Schema

```sql
CREATE TABLE transactions (
    -- Primary Key
    id INTEGER PRIMARY KEY,

    -- Core Required Fields
    project_name VARCHAR(255) NOT NULL,
    transaction_date DATE NOT NULL,
    price FLOAT NOT NULL,
    area_sqft FLOAT NOT NULL,
    psf FLOAT NOT NULL,
    district VARCHAR(10) NOT NULL,
    bedroom_count INTEGER NOT NULL,

    -- Optional Fields
    contract_date VARCHAR(10),
    property_type VARCHAR(100) DEFAULT 'Condominium',
    sale_type VARCHAR(50),
    tenure TEXT,
    lease_start_year INTEGER,
    remaining_lease INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),

    -- New Columns (previously dropped)
    street_name TEXT,
    floor_range VARCHAR(20),
    floor_level VARCHAR(20),
    num_units INTEGER,
    nett_price FLOAT,
    type_of_area VARCHAR(20),
    market_segment VARCHAR(10)
);

-- Indexes
CREATE INDEX ix_transactions_project_name ON transactions(project_name);
CREATE INDEX ix_transactions_transaction_date ON transactions(transaction_date);
CREATE INDEX ix_transactions_district ON transactions(district);
CREATE INDEX ix_transactions_bedroom_count ON transactions(bedroom_count);
CREATE INDEX ix_transactions_floor_level ON transactions(floor_level);
```

---

*Last updated: December 2024*
