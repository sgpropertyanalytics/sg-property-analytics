# Scripts Directory

## Prerequisite (One-Time)

Install backend modules so scripts can import without sys.path hacks:

```bash
pip install -e .
```

## upload.py
Loads CSV files from `rawdata/` folder into the Transaction database table and triggers aggregation.

**Usage:**
```bash
python -m scripts.upload
```

**What it does:**
1. Loads all CSV files from `rawdata/New Sale/` and `rawdata/Resale/`
2. Cleans and processes data using existing `data_loader.py` logic
3. Removes duplicates
4. Saves to `Transaction` SQLAlchemy table
5. Triggers a full validation pass before publish

**First run:** Will ask if you want to clear existing data (recommended: yes)

## run_etl.py
Legacy ETL script (from original architecture). Can be deprecated in favor of `upload.py`.

## generate_contracts.sh
Generates frontend contract artifacts from backend API contracts.

**Usage:**
```bash
./scripts/generate_contracts.sh
```
