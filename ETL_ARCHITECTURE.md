# ETL Architecture Documentation

## Overview

This project follows a strict **ETL (Extract, Transform, Load)** architecture with clear separation of concerns. All analysis is performed on a single, trusted source: the `master_transactions` table in `condo_master.db`.

## Architecture Principles

1. **Modularity & Separation of Concerns**: Each stage (Extract, Transform, Load, Analysis) is isolated in its own module
2. **Single Source of Truth (SSoT)**: All final analysis uses only the `master_transactions` table
3. **Security by Design**: API keys loaded via environment variables (`os.getenv`), never hardcoded

## Module Structure

### A. Extraction Layer (Source-Specific)

#### `extract_web_scrape.py`
- **Purpose**: Extract transaction data from public websites
- **Sources**:
  - Square Foot Research: `https://www.squarefoot.com.sg/latest-transactions/sale/residential/non-landed`
  - PropertyForSale.com.sg: `https://www.propertyforsale.com.sg/ura-private-residential-transactions`
- **Output**: Pandas DataFrame with standardized schema
- **Key Functions**:
  - `extract_squarefoot()` → DataFrame
  - `extract_propertyforsale()` → DataFrame
  - `extract_all_web_sources()` → Combined DataFrame

#### `extract_ura_api.py`
- **Purpose**: Extract transaction data from URA API (optional, for future use)
- **Output**: Pandas DataFrame with standardized schema
- **Key Functions**:
  - `extract_ura_api(year_filter=None)` → DataFrame
  - `extract_all_api_sources()` → Combined DataFrame

**Standard Schema** (all extraction modules must return this):
```python
{
    'project_name': 'string',
    'transaction_date': 'string',  # YYYY-MM-DD
    'contract_date': 'string',     # MMYY
    'price': 'float64',
    'area_sqft': 'float64',
    'psf': 'float64',
    'district': 'string',          # D## format
    'property_type': 'string',
    'source': 'string'
}
```

### B. Transformation & Load Layer

#### `transform_and_load.py`
- **Purpose**: Orchestrates the entire ETL process
- **Workflow**:
  1. Calls all extraction modules
  2. Normalizes and standardizes data types/formats
  3. Performs deduplication with conflict resolution
  4. Loads clean data into `master_transactions` table
- **Key Functions**:
  - `normalize_data(df)` → Normalized DataFrame
  - `deduplicate_and_resolve_conflicts(df)` → Deduplicated DataFrame
  - `load_to_master_table(df)` → Number of records inserted
  - `run_etl_pipeline()` → Main orchestration function

**Conflict Resolution Priority**:
1. URA API (most authoritative)
2. PropertyForSale
3. Square Foot

**Deduplication Logic**:
- Same project name (case-insensitive)
- Same district
- Same price (within 1% tolerance)
- Same area (within 1% tolerance)
- Same month (YYYY-MM)

### C. Analysis Layer

#### `classifier.py`
- **Purpose**: Flexible classification heuristic for bedroom count
- **Logic**: Categorizes units as 2-BR, 3-BR, 4-BR based on area (sqft)
- **Key Function**: `classify_bedroom(area_sqft)` → int

#### `data_processor.py`
- **Purpose**: Query master table and perform statistical calculations
- **Important**: This module ONLY reads from `master_transactions` table
- **Key Functions**:
  - `get_filtered_transactions()` → Filtered DataFrame from master table
  - `calculate_statistics()` → Statistical calculations
  - `get_resale_stats()` → Final statistics for API
  - `get_price_trends()` → Price trends over time
  - `get_total_volume_by_district()` → Volume by district
  - `get_avg_psf_by_district()` → Average PSF by district

### D. API Layer

#### `app.py`
- **Purpose**: Flask application providing REST API endpoints
- **Important**: Does NOT perform ETL - only serves data from master table
- **Endpoints**:
  - `/api/resale_stats` - Get resale statistics
  - `/api/transactions` - Get transaction details
  - `/api/price_trends` - Get price trends
  - `/api/total_volume` - Get volume by district
  - `/api/avg_psf` - Get average PSF by district
  - `/api/health` - Health check

## Database Schema

### Master Table: `master_transactions`
```sql
CREATE TABLE master_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_name TEXT NOT NULL,
    transaction_date TEXT,
    contract_date TEXT,
    price REAL NOT NULL,
    area_sqft REAL NOT NULL,
    psf REAL NOT NULL,
    district TEXT NOT NULL,
    bedroom_count INTEGER,
    property_type TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_name, contract_date, price, area_sqft, district)
);
```

## Usage

### Running ETL Pipeline

```bash
# Run complete ETL process
python run_etl.py

# Or use the module directly
python -c "from transform_and_load import run_etl_pipeline; run_etl_pipeline()"
```

### Starting API Server

```bash
python app.py
```

The API will be available at `http://localhost:5000`

## Data Flow

```
┌─────────────────┐
│  Web Sources    │
│  (Square Foot,  │
│  PropertyForSale)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ extract_web_    │
│ scrape.py       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ transform_and_  │
│ load.py         │
│  - Normalize    │
│  - Deduplicate  │
│  - Load         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ master_         │
│ transactions    │
│ (condo_master.db)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ data_processor  │
│ .py             │
│ (Analysis)      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ app.py          │
│ (API Layer)     │
└─────────────────┘
```

## Security

- API keys stored in `.env` file (not committed to git)
- `.env` file listed in `.gitignore`
- Keys loaded via `os.getenv()` - never hardcoded
- Environment variables loaded using `python-dotenv`

## File Structure

```
sgpropertytrend/
├── extract_web_scrape.py      # Extraction: Web scraping
├── extract_ura_api.py          # Extraction: URA API (optional)
├── transform_and_load.py       # Transformation & Load (ETL orchestrator)
├── classifier.py               # Analysis: Bedroom classification
├── data_processor.py            # Analysis: Statistical calculations
├── app.py                       # API Layer: Flask endpoints
├── run_etl.py                   # ETL pipeline runner
├── condo_master.db              # Master database (SSoT)
├── .env                         # Environment variables (API keys)
└── dashboard.html               # Frontend dashboard
```

