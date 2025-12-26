# Backend Reference

## SQL Best Practices

### Parameter Style (MANDATORY)

**Use SQLAlchemy bind parameters (`:param`) only:**
```sql
WHERE sale_type = :sale_type
  AND transaction_date >= :date_from
  AND transaction_date <= :date_to
```

**Forbidden:**
```sql
%(sale_type)s                    -- psycopg2-specific
f"psf > {PSF_MIN}"               -- f-string interpolation
```

### Date Handling

**Pass Python `date`/`datetime` objects:**
```python
params = {
    "date_from": date(2023, 1, 1),
    "date_to": date.today(),
}
```

**Never pass date strings.**

### Outlier Filtering

**Always use COALESCE:**
```sql
WHERE COALESCE(is_outlier, false) = false
```

**Not:**
```sql
WHERE is_outlier = false OR is_outlier IS NULL
```

### Enum Normalization

**Use API contract methods:**
```python
from schemas.api_contract import SaleType
sale_type_db = SaleType.to_db(SaleType.RESALE)  # → "Resale"
```

**Never hardcode enum strings in business logic.**

---

## API Endpoints

### Core Analytics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/aggregate` | GET | Flexible aggregation with grouping |
| `/api/dashboard` | GET | Multi-panel dashboard data |
| `/api/transactions/list` | GET | Paginated transaction list |
| `/api/kpi-summary` | GET | Summary KPIs |

### Project Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects/hot` | GET | Hot projects list |
| `/api/projects/<name>` | GET | Project details |
| `/api/projects/<name>/transactions` | GET | Project transactions |

### Market Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gls/all` | GET | All GLS tenders |
| `/api/upcoming-launches/all` | GET | All upcoming launches |
| `/api/deal-checker/multi-scope` | GET | Value analysis |

### Admin/Debug

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/debug/data-status` | GET | Data loading status |
| `/admin/filter-outliers` | POST | Outlier management |

---

## API Contract

### Version Management

```python
# backend/schemas/api_contract.py
CURRENT_API_CONTRACT_VERSION = "v3"
SUPPORTED_API_CONTRACT_VERSIONS = {"v1", "v2", "v3"}
```

| Version | Status | Sunset |
|---------|--------|--------|
| v1 | Deprecated | 2026-04-01 |
| v2 | Supported | - |
| v3 | Current | - |

### Response Format

All responses include meta:
```json
{
  "meta": {
    "apiContractVersion": "v3",
    "timestamp": "2024-12-26T10:00:00Z",
    "dataVersion": "2024Q4"
  },
  "data": [...]
}
```

### Field Naming

| v1 (deprecated) | v2/v3 (current) |
|-----------------|-----------------|
| `sale_type` | `saleType` |
| `median_psf` | `medianPsf` |
| `total_value` | `totalValue` |
| `project_name` | `projectName` |

---

## Services

### Dashboard Service

```python
# services/dashboard_service.py

def get_dashboard_data(filters, panels):
    """
    Returns multi-panel dashboard data.

    Panels:
    - time_series: Transaction count + median PSF over time
    - volume_by_location: Count by region/district/project
    - price_histogram: Price distribution
    - bedroom_mix: Bedroom type distribution
    - sale_type_breakdown: New Sale vs Resale
    - summary: KPIs
    """
```

### Aggregate Service

```python
# services/aggregate_service.py

def get_aggregate(filters, group_by, metrics):
    """
    Flexible aggregation.

    group_by: quarter, year, district, region, project_name, sale_type, etc.
    metrics: count, total_value, median_psf, avg_psf, etc.
    """
```

### Deal Checker

```python
# services/deal_checker.py

def get_multi_scope_analysis(project, bedroom, area_sqft, price):
    """
    Value analysis comparing against:
    - Project history
    - District benchmark
    - Citywide benchmark

    Returns percentiles, z-scores, deal rating.
    """
```

---

## Database Queries

### Query Construction Rules

1. SQL lives in service files, not routes
2. Use `sqlalchemy.text()` for all queries
3. Pass all values as bind parameters
4. Use COALESCE for outlier filtering

### Example Query

```python
def query_time_series(filters):
    query = text("""
        SELECT
            DATE_TRUNC(:time_grain, transaction_date) as period,
            COUNT(*) as count,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
        FROM transactions
        WHERE COALESCE(is_outlier, false) = false
          AND transaction_date >= :date_from
          AND transaction_date <= :date_to
          AND (:districts IS NULL OR district = ANY(:districts))
        GROUP BY DATE_TRUNC(:time_grain, transaction_date)
        ORDER BY period
    """)

    return db.session.execute(query, {
        "time_grain": filters.get("time_grain", "quarter"),
        "date_from": filters.get("date_from", date(2020, 1, 1)),
        "date_to": filters.get("date_to", date.today()),
        "districts": filters.get("districts"),
    }).fetchall()
```

---

## Caching

### Server-side Cache

```python
# In dashboard_service.py
from functools import lru_cache

@lru_cache(maxsize=500)
def get_cached_dashboard(cache_key):
    """5-minute TTL via timestamp bucketing."""
    ...
```

### Cache Warming

On startup, pre-populates cache for:
- All data (no filters)
- By region (CCR, RCR, OCR)
- By bedroom type (2, 3, 4)

### Cache Invalidation

```bash
# Invalidate after data upload
curl -X DELETE https://api.example.com/api/dashboard/cache
```

---

## Error Handling

### Standard Error Response

```python
return jsonify({
    "error": "Invalid parameter",
    "code": "INVALID_PARAM",
    "details": {"param": "district", "message": "Must be D01-D28"}
}), 400
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_PARAM` | 400 | Invalid request parameter |
| `NOT_FOUND` | 404 | Resource not found |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `SERVER_ERROR` | 500 | Internal server error |

---

## Testing

### Required Tests

1. **Unit tests**: Pure computation functions
2. **Integration tests**: API endpoint responses
3. **Contract tests**: v2/v3 response shapes

### v2 Response Validation

```python
def test_v2_response_has_no_snake_case():
    response = client.get('/api/endpoint?schema=v2')
    data = response.json()

    def check_no_snake_case(obj, path=""):
        if isinstance(obj, dict):
            for key in obj.keys():
                assert '_' not in key, f"Snake case at {path}.{key}"
                check_no_snake_case(obj[key], f"{path}.{key}")

    check_no_snake_case(data)
```

---

## SQL Checklist

Before any query:

- [ ] Uses `:param` style only (no `%(param)s`)
- [ ] Date params are Python `date`/`datetime` objects
- [ ] Enums use `api_contract.py` methods
- [ ] Outlier filter uses `COALESCE`
- [ ] Numeric values are parameterized
- [ ] SQL lives in service file, not route
- [ ] v2 endpoint returns camelCase

---

*Last updated: December 2024*
