# Scripts Directory

## upload.py
Loads CSV files from `rawdata/` folder into the Transaction database table and triggers aggregation.

**Usage:**
```bash
cd scripts
python upload.py
```

**What it does:**
1. Loads all CSV files from `rawdata/New Sale/` and `rawdata/Resale/`
2. Cleans and processes data using existing `data_loader.py` logic
3. Removes duplicates
4. Saves to `Transaction` SQLAlchemy table
5. Triggers `aggregation_service.recompute_all_stats()` to pre-compute all analytics

**First run:** Will ask if you want to clear existing data (recommended: yes)

## recompute_stats.py
Re-runs the aggregation service to update pre-computed stats without reloading data.

**Usage:**
```bash
cd scripts
python recompute_stats.py
```

**What it does:**
1. Reads existing transactions from database
2. Re-computes all analytics using existing business logic
3. Updates `PreComputedStats` table

**Use cases:**
- After adding new CSV files (run `upload.py` first, then this)
- Scheduled updates (via cron)
- After modifying business logic in `data_processor.py`

## Scheduled Updates (Cron)

To automatically recompute stats daily at 2 AM:

```bash
# Edit crontab
crontab -e

# Add this line:
0 2 * * * cd /path/to/sgpropertytrend && /path/to/venv/bin/python scripts/recompute_stats.py >> /path/to/logs/recompute.log 2>&1
```

## run_etl.py
Legacy ETL script (from original architecture). Can be deprecated in favor of `upload.py`.

## generate_contracts.sh
Generates frontend contract artifacts from backend API contracts.

**Usage:**
```bash
./scripts/generate_contracts.sh
```
