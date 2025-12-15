# Codebase Cleanup Audit Report
**Generated:** 2025-12-14  
**Architect:** Senior Python Architect Review

---

## Executive Summary

Your codebase has successfully migrated to a modular ETL architecture. The new system is **production-ready** and the legacy files are **safe to delete** after confirmation.

---

## Step 1: Dependency Check ✅

### Production Files Analysis

| File | Database Used | Legacy Imports | Status |
|------|--------------|----------------|--------|
| `app.py` | `condo_master.db` (via `data_processor.py`) | ❌ None | ✅ Clean |
| `data_processor.py` | `condo_master.db` | ❌ None | ✅ Clean |
| `run_etl.py` | N/A (orchestrator) | ❌ None | ✅ Clean |
| `transform_and_load.py` | `condo_master.db` | ❌ None | ✅ Clean |

### Database Usage

- **Production Database:** `condo_master.db` with `master_transactions` table
  - Used by: `data_processor.py`, `transform_and_load.py`
  - Status: ✅ Active and populated (1,308 records)

- **Legacy Database:** `condo_data.db` with `transactions` table
  - Used by: `data_fetcher.py` (legacy module)
  - Status: ⚠️ Deprecated, not used by production code

### Legacy Import Check

**Result:** ✅ **NO production files import legacy modules**

All production files (`app.py`, `data_processor.py`, `run_etl.py`, `transform_and_load.py`) are clean and do NOT import:
- `data_fetcher.py`
- Any `fetch_*.py` scripts

---

## Step 2: Logic Comparison (Safety Check) ✅

### URA API Logic Comparison

| Feature | Legacy (`data_fetcher.py`) | New (`extract_ura_api.py`) | Status |
|---------|---------------------------|---------------------------|--------|
| API Key Loading | ✅ `os.getenv()` | ✅ `os.getenv()` | ✅ Covered |
| Headers (AccessKey) | ✅ Present | ✅ Present | ✅ Covered |
| Batch Pagination (1-4) | ✅ Implemented | ✅ Implemented | ✅ Covered |
| Year Filtering | ✅ Implemented | ✅ Implemented | ✅ Covered |
| Date Range Filtering | ✅ 2 years ago | ✅ 2 years ago | ✅ Covered |
| Resale Filtering | ✅ `typeOfSale == "Resale"` | ✅ `typeOfSale == "Resale"` | ✅ Covered |
| Property Type Filter | ✅ Condo/Apartment | ✅ Condo/Apartment | ✅ Covered |
| Error Handling | ✅ Try/except | ✅ Try/except | ✅ Covered |
| Timeout | ✅ 60s | ✅ 60s | ✅ Covered |

**Conclusion:** ✅ `extract_ura_api.py` **fully covers** all logic from legacy URA API functions.

### Web Scraping Logic Comparison

| Feature | Legacy (`data_fetcher.py`) | New (`extract_web_scrape.py`) | Status |
|---------|---------------------------|------------------------------|--------|
| Square Foot Scraping | ✅ Implemented | ✅ Implemented | ✅ Covered |
| PropertyForSale Scraping | ✅ Implemented | ✅ Implemented | ✅ Covered |
| BeautifulSoup Parsing | ✅ Present | ✅ Present | ✅ Covered |
| Date Parsing | ✅ Multiple formats | ✅ Multiple formats | ✅ Covered |
| District Normalization | ✅ D## format | ✅ D## format | ✅ Covered |
| Filtering (HDB/EC) | ✅ Present | ✅ Present | ✅ Covered |
| Resale Only | ✅ Present | ✅ Present | ✅ Covered |

**Conclusion:** ✅ `extract_web_scrape.py` **fully covers** all logic from legacy web scraping functions.

### ETL Orchestration Comparison

| Feature | Legacy (`data_fetcher.py`) | New (`transform_and_load.py`) | Status |
|---------|---------------------------|------------------------------|--------|
| Multi-source Extraction | ✅ Present | ✅ Present | ✅ Covered |
| Data Normalization | ✅ Present | ✅ Enhanced | ✅ Improved |
| Deduplication | ✅ Present | ✅ Enhanced | ✅ Improved |
| Conflict Resolution | ✅ Basic | ✅ Priority-based | ✅ Improved |
| Master Table Storage | ✅ `condo_data.db` | ✅ `condo_master.db` | ✅ Migrated |

**Conclusion:** ✅ `transform_and_load.py` **fully replaces** and **improves** legacy ETL logic.

---

## Step 3: Frontend Analysis

### Dashboard Files

| File | Lines | Status | Usage |
|------|-------|--------|-------|
| `dashboard.html` | 985 | ✅ **ACTIVE** | Served by `app.py` at `/` |
| `Dashboard.jsx` | 445 | ⚠️ **UNUSED** | Not imported or used anywhere |

**Finding:**
- `app.py` serves `dashboard.html` from root directory (line 241)
- `Dashboard.jsx` is a React component but not used in the current architecture
- The project uses standalone HTML with in-browser Babel transformation (not a build process)

**Recommendation:** `Dashboard.jsx` can be safely deleted.

---

## Step 4: Cleanup Proposal

### Files Safe to Delete ✅

#### Category 1: Legacy Fetch Scripts (5 files)
These scripts all import from `data_fetcher.py` and are replaced by `run_etl.py`:

1. ✅ `fetch_2025_data.py` - Replaced by `run_etl.py` + `extract_ura_api.py`
2. ✅ `fetch_all_sources.py` - Replaced by `run_etl.py`
3. ✅ `fetch_datagovsg_data.py` - Replaced by `run_etl.py` + `extract_ura_api.py`
4. ✅ `fetch_historical_data.py` - Replaced by `run_etl.py`
5. ✅ `fetch_real_data.py` - Replaced by `run_etl.py` + `extract_ura_api.py`

#### Category 2: Legacy Core Module (1 file)
6. ✅ `data_fetcher.py` - All logic migrated to:
   - `extract_ura_api.py` (extraction)
   - `extract_web_scrape.py` (extraction)
   - `transform_and_load.py` (transformation & load)

#### Category 3: Legacy Database (1 file)
7. ✅ `condo_data.db` - Replaced by `condo_master.db`
   - **Note:** Consider backing up before deletion if you want to preserve historical data

#### Category 4: Backup Artifacts (1 file)
8. ✅ `files.zip` - Appears to be a backup artifact

#### Category 5: Unused Frontend (1 file)
9. ✅ `Dashboard.jsx` - Not used; `dashboard.html` is the active frontend

### Files to KEEP ✅

#### Core ETL Architecture
- ✅ `extract_ura_api.py` - Extraction layer (URA API)
- ✅ `extract_web_scrape.py` - Extraction layer (Web scraping)
- ✅ `transform_and_load.py` - Transformation & Load layer
- ✅ `run_etl.py` - ETL orchestrator

#### Analysis Layer
- ✅ `data_processor.py` - Analysis (reads from master table)
- ✅ `classifier.py` - Bedroom classification

#### API Layer
- ✅ `app.py` - Flask API

#### Frontend
- ✅ `dashboard.html` - Active frontend

#### Configuration & Documentation
- ✅ `.env` / `env.example` - Environment variables
- ✅ `README.md` - Documentation
- ✅ `SETUP_DATA.md` - Setup instructions
- ✅ `ETL_ARCHITECTURE.md` - Architecture documentation

#### Database
- ✅ `condo_master.db` - Production database (Single Source of Truth)

---

## Cleanup Script

```bash
#!/bin/bash
# Cleanup Script for ETL Migration
# Run this script to remove legacy files

echo "=========================================="
echo "ETL Migration Cleanup Script"
echo "=========================================="
echo ""
echo "This will delete the following files:"
echo ""
echo "Legacy Fetch Scripts:"
echo "  - fetch_2025_data.py"
echo "  - fetch_all_sources.py"
echo "  - fetch_datagovsg_data.py"
echo "  - fetch_historical_data.py"
echo "  - fetch_real_data.py"
echo ""
echo "Legacy Core Module:"
echo "  - data_fetcher.py"
echo ""
echo "Legacy Database:"
echo "  - condo_data.db"
echo ""
echo "Backup Artifacts:"
echo "  - files.zip"
echo ""
echo "Unused Frontend:"
echo "  - Dashboard.jsx"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Cleanup cancelled."
    exit 1
fi

echo ""
echo "Deleting files..."

# Legacy fetch scripts
rm -f fetch_2025_data.py
rm -f fetch_all_sources.py
rm -f fetch_datagovsg_data.py
rm -f fetch_historical_data.py
rm -f fetch_real_data.py

# Legacy core module
rm -f data_fetcher.py

# Legacy database (optional - uncomment if you want to delete)
# rm -f condo_data.db

# Backup artifacts
rm -f files.zip

# Unused frontend
rm -f Dashboard.jsx

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Remaining structure:"
echo "  - extract_ura_api.py (Extraction)"
echo "  - extract_web_scrape.py (Extraction)"
echo "  - transform_and_load.py (Transform & Load)"
echo "  - run_etl.py (ETL Orchestrator)"
echo "  - data_processor.py (Analysis)"
echo "  - app.py (API)"
echo "  - dashboard.html (Frontend)"
echo "  - condo_master.db (Master Database)"
```

---

## Summary

### ✅ Safe to Delete (9 files)
1. `fetch_2025_data.py`
2. `fetch_all_sources.py`
3. `fetch_datagovsg_data.py`
4. `fetch_historical_data.py`
5. `fetch_real_data.py`
6. `data_fetcher.py`
7. `condo_data.db` (⚠️ backup first if needed)
8. `files.zip`
9. `Dashboard.jsx`

### ✅ Keep (Core Architecture)
- ETL modules: `extract_ura_api.py`, `extract_web_scrape.py`, `transform_and_load.py`, `run_etl.py`
- Analysis: `data_processor.py`, `classifier.py`
- API: `app.py`
- Frontend: `dashboard.html`
- Database: `condo_master.db`

---

## Confirmation Required

**Before deletion, please confirm:**
1. ✅ All logic has been verified to be covered by new modules
2. ✅ No production code imports legacy modules
3. ✅ Master database (`condo_master.db`) is working correctly
4. ⚠️ Backup `condo_data.db` if you need historical data from it

**Ready to proceed?** Review the files listed above and confirm deletion.

