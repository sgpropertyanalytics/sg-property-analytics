# Glossary

## Acronyms

| Term | Meaning |
|------|---------|
| CCR | Core Central Region |
| RCR | Rest of Central Region |
| OCR | Outside Central Region |
| GLS | Government Land Sales |
| PSF | Price per Square Foot |
| TOP | Temporary Occupation Permit |
| URA | Urban Redevelopment Authority |
| EC | Executive Condominium |
| IQR | Interquartile Range |
| TTL | Time To Live (cache) |
| LRU | Least Recently Used (cache) |

---

## Domain Terms

### Property Types

| Term | Description |
|------|-------------|
| Condo | Private condominium |
| EC | Executive Condominium (hybrid public/private) |
| Apt | Apartment |

### Sale Types

| Term | Description |
|------|-------------|
| New Sale | First sale by developer |
| Resale | Secondary market sale |
| Sub Sale | Sale before TOP by non-developer |

### Tenure Types

| Term | Description |
|------|-------------|
| Freehold | Perpetual ownership |
| 99-year | 99-year leasehold |
| 999-year | 999-year leasehold (effectively freehold) |
| 103-year | 103-year leasehold (older properties) |

### Market Segments

| Segment | Districts | Description |
|---------|-----------|-------------|
| CCR | D01, D02, D04, D06, D07, D09, D10, D11 | Prime central areas (Orchard, Marina Bay) |
| RCR | D03, D05, D08, D12, D13, D14, D15, D20 | City fringe areas |
| OCR | D16-D28 (excluding RCR) | Suburban areas |

---

## Technical Terms

### Backend

| Term | Definition |
|------|------------|
| Adapter | Function that normalizes API responses to a consistent shape |
| API Contract | Specification of request/response formats between frontend and backend |
| Bind Parameter | SQL parameter using `:name` syntax for safe value injection |
| Cache Warming | Pre-populating cache with common queries on startup |
| Partial Index | Database index with a WHERE clause limiting indexed rows |
| Service | Backend module containing business logic and SQL queries |
| Serializer | Function that converts database objects to JSON-compatible dicts |

### Frontend

| Term | Definition |
|------|------------|
| AbortController | Browser API for cancelling fetch requests |
| Debounce | Delay execution until input stops changing |
| Filter Context | React context holding all filter state |
| Filter Key | String hash of current filters for cache/dependency tracking |
| Stale Request | Request whose result is outdated due to newer requests |
| useAbortableQuery | Hook that handles async fetching with abort/stale protection |

### Data

| Term | Definition |
|------|------------|
| Outlier | Transaction with price outside 1.5 * IQR range |
| K-Anonymity | Minimum number of records required before showing data |
| Staging Table | Temporary table used during upload before atomic swap |
| Global IQR | IQR calculated across all transactions (not per-group) |

---

## Field Mappings

### API Field Names

| v1 (deprecated) | v2/v3 (current) | Description |
|-----------------|-----------------|-------------|
| `sale_type` | `saleType` | Type of sale |
| `median_psf` | `medianPsf` | Median price per sqft |
| `total_value` | `totalValue` | Sum of prices |
| `project_name` | `projectName` | Project name |
| `bedroom_count` | `bedroomCount` | Number of bedrooms |
| `transaction_date` | `transactionDate` | Date of transaction |
| `floor_level` | `floorLevel` | Classified floor level |
| `floor_range` | `floorRange` | Original floor range |

### Database to API

| Database | API | Notes |
|----------|-----|-------|
| `sale_type` | `saleType` | Normalized via SaleType enum |
| `tenure` | `tenure` | Normalized via Tenure enum |
| `district` | `district` | No change |
| `market_segment` | `region` | CCR/RCR/OCR |

---

## Singapore Districts

| District | Area |
|----------|------|
| D01 | Raffles Place, Marina Bay |
| D02 | Tanjong Pagar, Chinatown |
| D03 | Alexandra, Queenstown |
| D04 | Harbourfront, Telok Blangah |
| D05 | Buona Vista, Clementi |
| D06 | City Hall, Clarke Quay |
| D07 | Beach Road, Bugis |
| D08 | Farrer Park, Serangoon Rd |
| D09 | Orchard, River Valley |
| D10 | Holland, Tanglin |
| D11 | Newton, Novena |
| D12 | Balestier, Toa Payoh |
| D13 | Macpherson, Potong Pasir |
| D14 | Eunos, Geylang |
| D15 | East Coast, Marine Parade |
| D16 | Bedok, Upper East Coast |
| D17 | Changi, Loyang |
| D18 | Pasir Ris, Tampines |
| D19 | Punggol, Sengkang |
| D20 | Ang Mo Kio, Bishan |
| D21 | Upper Bukit Timah, Clementi Park |
| D22 | Boon Lay, Jurong |
| D23 | Bukit Batok, Choa Chu Kang |
| D24 | Lim Chu Kang, Tengah |
| D25 | Woodlands, Admiralty |
| D26 | Mandai, Upper Thomson |
| D27 | Sembawang, Yishun |
| D28 | Seletar, Yio Chu Kang |

---

## Metrics Reference

| Metric | Calculation | Unit |
|--------|-------------|------|
| PSF | Price / Area | $/sqft |
| Median PSF | 50th percentile of PSF | $/sqft |
| Z-Score | (value - mean) / stddev | Standard deviations |
| Percentile | PERCENT_RANK() | 0-100 |
| YoY Growth | (current - previous) / previous | Percentage |
| Deal Rating | Based on percentile (Good < 25%, Fair 25-75%, High > 75%) | Category |

---

## File Locations

| Concept | Backend | Frontend |
|---------|---------|----------|
| API Contract | `api/contracts/contract_schema.py` | `frontend/src/schemas/apiContract` |
| Enums | `api/contracts/contract_schema.py` | `frontend/src/schemas/apiContract` |
| Filter Logic | `routes/analytics.py` | `contexts/FilterContext.jsx` |
| Adapters | N/A | `adapters/` |
| Services | `services/` | N/A |
| Constants | `constants.py` | `constants/index.js` |

---

*Last updated: December 2024*
