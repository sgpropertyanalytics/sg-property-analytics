# Data Model Reference

## Transaction Schema

### Core Fields

| Column | Type | Source | Description |
|--------|------|--------|-------------|
| `project_name` | VARCHAR(255) | CSV | Project name |
| `street_name` | TEXT | CSV | Street address |
| `district` | VARCHAR(10) | CSV | Postal district (D01-D28) |
| `property_type` | VARCHAR(100) | CSV | Property type |
| `market_segment` | VARCHAR(10) | CSV | CCR, RCR, OCR |
| `tenure` | TEXT | CSV | Tenure description |
| `sale_type` | VARCHAR(50) | CSV | New Sale, Resale, Sub Sale |
| `price` | FLOAT | CSV | Transaction price |
| `nett_price` | FLOAT | CSV | Nett price (if different) |
| `area_sqft` | FLOAT | CSV | Floor area |
| `psf` | FLOAT | CSV | Price per square foot |
| `transaction_date` | DATE | CSV | Transaction date |
| `floor_range` | VARCHAR(20) | CSV | Floor range (e.g., "16-20") |
| `num_units` | INTEGER | CSV | Number of units |
| `type_of_area` | VARCHAR(20) | CSV | Strata, Land, etc. |

### Computed Fields

| Column | Type | Computation |
|--------|------|-------------|
| `floor_level` | VARCHAR(20) | Classified from `floor_range` |
| `bedroom_count` | INTEGER | Classified from `area_sqft` |
| `contract_date` | VARCHAR(4) | MMYY from `transaction_date` |
| `lease_start_year` | INTEGER | Parsed from `tenure` |
| `remaining_lease` | INTEGER | Calculated from lease start |
| `is_outlier` | BOOLEAN | Global IQR flagging |

---

## Classifications

### Floor Level

| Floor Range | Classification |
|-------------|----------------|
| 01 – 05 | Low |
| 06 – 10 | Mid-Low |
| 11 – 20 | Mid |
| 21 – 30 | Mid-High |
| 31 – 40 | High |
| 41+ | Luxury |

### Bedroom Count (Three-Tier Classification)

**Primary: Size-based (default)**

| Area (sqft) | Bedroom Count |
|-------------|---------------|
| < 400 | Studio |
| 400 - 599 | 1BR |
| 600 - 849 | 2BR |
| 850 - 1199 | 3BR |
| 1200 - 1599 | 4BR |
| >= 1600 | 5+BR |

**Refined: Project-specific (for newer projects)**

Uses historical transaction patterns within each project to refine boundaries.

**Direct: Explicit value (when provided)**

Uses bedroom count directly from source data.

### Market Segment (Region)

| Region | Districts | Description |
|--------|-----------|-------------|
| CCR | D01, D02, D04, D06, D07, D09, D10, D11 | Core Central Region |
| RCR | D03, D05, D08, D12, D13, D14, D15, D20 | Rest of Central Region |
| OCR | D16, D17, D18, D19, D21-D28 | Outside Central Region |

### Age Classification

| Age (Years from TOP) | Classification |
|----------------------|----------------|
| Not yet TOP | New Sale (Pre-TOP) |
| 0 – 4 | Just TOP / Recently TOP |
| 4 – 8 | Recently TOP |
| 8 – 15 | Maturing |
| 15 – 30 | Mature |
| 30+ | Older |

---

## Metrics

### Aggregate Metrics

| Metric | Calculation | API Field |
|--------|-------------|-----------|
| Count | COUNT(*) | `count` |
| Total Value | SUM(price) | `totalValue` |
| Median PSF | PERCENTILE_CONT(0.5) of psf | `medianPsf` |
| Average PSF | AVG(psf) | `avgPsf` |
| Min Price | MIN(price) | `minPrice` |
| Max Price | MAX(price) | `maxPrice` |

### Derived Metrics

| Metric | Formula | Description |
|--------|---------|-------------|
| PSF Premium | (project_psf - district_median) / district_median | Relative PSF premium |
| Z-Score | (value - mean) / stddev | Normalized deviation |
| Percentile | PERCENT_RANK() | Position in distribution |
| YoY Growth | (current - previous) / previous | Year-over-year change |

### Deal Checker Metrics

| Metric | Scope | Description |
|--------|-------|-------------|
| Project Percentile | Within project | Transaction PSF rank in project history |
| District Percentile | Within district | Transaction PSF rank in district |
| City Percentile | Citywide | Transaction PSF rank across all transactions |
| Deal Rating | Combined | Good (< 25%), Fair (25-75%), High (> 75%) |

---

## Outlier Handling

### Method: Global IQR

Outliers are removed during upload using global IQR across all transactions:

```
Q1 = 25th percentile of ALL transactions
Q3 = 75th percentile of ALL transactions
IQR = Q3 - Q1

Outlier if: price < (Q1 - 1.5 * IQR) OR price > (Q3 + 1.5 * IQR)
```

**Typical bounds:** ~$0 - $4M for Singapore condos

### Key Principles

1. **Outlier filtering happens ONCE** - During upload, never at runtime
2. **App startup is read-only** - No mutations, same row count after every restart
3. **Deterministic datasets** - Same upload produces same output

### Implementation

| Stage | Function | Mutates DB? |
|-------|----------|-------------|
| Upload | `filter_outliers_staging()` | Yes (staging only) |
| Startup | `_run_startup_validation()` | No (read-only) |

---

## Time Periods

### Grouping Options

| Grouping | Format | Example |
|----------|--------|---------|
| Year | YYYY | 2024 |
| Quarter | YYYY-QN | 2024-Q2 |
| Month | YYYY-MM | 2024-05 |

### Period Field Resolution

API responses may contain different period fields. Resolution order:
1. `period` (v3 standard)
2. `quarter`
3. `month`
4. `year`

Use adapter helper:
```javascript
const period = getPeriod(row);  // Handles all formats
```

---

## Data Sources

### Primary: URA REALIS

- Private residential transactions
- Updated semi-annually (H1/H2)
- CSV format with standardized columns

### Secondary: GLS Tenders

- Government land sales
- Scraped from URA website
- Contains: site, region, land type, status, award price

### Tertiary: Upcoming Launches

- New project launches
- Contains: project name, district, expected TOP, total units

---

## Column Mapping (CSV → Database)

| CSV Column (URA REALIS) | DB Column |
|-------------------------|-----------|
| Project Name | `project_name` |
| Street Name | `street_name` |
| Property Type | `property_type` |
| Postal District | `district` |
| Market Segment | `market_segment` |
| Tenure | `tenure` |
| Type of Sale | `sale_type` |
| No. of Units | `num_units` |
| Nett Price ($) | `nett_price` |
| Transacted Price ($) | `price` |
| Area (SQFT) | `area_sqft` |
| Type of Area | `type_of_area` |
| Unit Price ($ PSF) | `psf` |
| Sale Date | `transaction_date` |
| Floor Range | `floor_range` |

---

## Data Validation

### Upload Validation

| Check | Threshold | Action |
|-------|-----------|--------|
| Row count | ≥ 1,000 | Block publish |
| project_name nulls | 0% | Block publish |
| price nulls | 0% | Block publish |
| district nulls | ≤ 1% | Block publish |
| Price range | $50K - $100M | Warn if > 1% |
| PSF range | $100 - $20K | Warn if > 1% |

### Schema Validation

On startup, app validates:
- All required columns exist
- Column types match model
- Critical columns have data

Schema drift causes **hard fail** - app won't start.

---

## Data Freshness

### Upload Schedule

| Data Type | Frequency | Source |
|-----------|-----------|--------|
| Transactions | Semi-annual | URA REALIS CSV |
| GLS Tenders | Weekly | URA website scrape |
| Upcoming Launches | As available | Manual + scrape |

### Version Tracking

Each upload creates a data version tracked in precomputed stats.

---

*Last updated: December 2024*
