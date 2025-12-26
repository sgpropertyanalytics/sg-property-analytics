# System Architecture

## Data Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                             DATA FLOW OVERVIEW                              │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  URA REALIS CSV                                                             │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Upload Pipeline (scripts/upload.py)                                  │   │
│  │  1. Create staging table                                             │   │
│  │  2. Load CSVs with column mapping                                    │   │
│  │  3. Deduplicate                                                      │   │
│  │  4. Remove outliers (global IQR)                                     │   │
│  │  5. Validate                                                         │   │
│  │  6. Atomic swap (staging → production)                               │   │
│  │  7. Recompute stats                                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ PostgreSQL                                                           │   │
│  │  • transactions (205K+ rows)                                         │   │
│  │  • project_locations (project centroids)                             │   │
│  │  • new_launches (upcoming projects)                                  │   │
│  │  • gls_tenders (government land sales)                               │   │
│  │  • precomputed_stats (cached aggregates)                             │   │
│  │  • users, popular_schools                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Flask Backend                                                        │   │
│  │  • SQL-only aggregation (no pandas in production)                    │   │
│  │  • Server-side caching (LRU, 5-min TTL)                              │   │
│  │  • API contract versioning (v3 current)                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ React Frontend                                                       │   │
│  │  • FilterContext (unified filter state)                              │   │
│  │  • useAbortableQuery (async safety)                                  │   │
│  │  • Adapters (normalize API responses)                                │   │
│  │  • Chart.js visualizations                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Backend Architecture

### Layer Structure

```
Request → Route → Service → Model/SQL → Response
```

| Layer | Responsibility | Location |
|-------|---------------|----------|
| Routes | Parse params, call service, return JSON | `backend/routes/` |
| Services | SQL queries, business logic | `backend/services/` |
| Models | SQLAlchemy ORM definitions | `backend/models/` |
| Schemas | Serializers, API contracts | `backend/schemas/` |

### Key Services

| Service | Purpose |
|---------|---------|
| `dashboard_service.py` | Unified dashboard queries (time series, histograms, KPIs) |
| `aggregate_service.py` | Flexible SQL aggregations with grouping |
| `deal_checker.py` | Value analysis with multi-scope comparisons |
| `gls_scraper.py` | Government land sales data scraping |
| `data_loader.py` | CSV loading and transformation |
| `data_validation.py` | Data quality checks |

### Database Design

**Primary Table: `transactions`**
- ~205K rows
- Partial indexes for outlier filtering (WHERE is_outlier = false)
- Composite indexes for common query patterns

**Key Indexes:**
```sql
idx_txn_active_composite ON transactions(transaction_date, district, bedroom_count, sale_type)
  INCLUDE (price, psf, area_sqft)
  WHERE is_outlier = false OR is_outlier IS NULL;

idx_txn_price_active ON transactions(price)
  WHERE price > 0 AND (is_outlier = false OR is_outlier IS NULL);
```

---

## Frontend Architecture

### Component Hierarchy

```
App
├── AuthContext (Firebase)
├── FilterContext (unified filters)
└── Routes
    ├── LandingPage
    ├── Pricing
    └── Protected Dashboard Pages
        ├── MacroOverviewContent (Market Pulse)
        ├── ValueParityPanel
        ├── FloorDispersionContent
        ├── DistrictDeepDiveContent
        └── ProjectDeepDiveContent
```

### State Management

| Context | Purpose |
|---------|---------|
| `FilterContext` | All filter state (districts, bedrooms, dates, etc.) |
| `AuthContext` | Firebase user, subscription tier |

### Data Fetching Pattern

```javascript
// All charts use useAbortableQuery
const { data, loading, error } = useAbortableQuery(
  async (signal) => {
    const response = await getAggregate(params, { signal });
    return transformTimeSeries(response.data);  // Adapter
  },
  [filterKey, timeGrouping]
);
```

---

## API Architecture

### Primary Endpoints

| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /api/aggregate` | Flexible aggregation | Optional |
| `GET /api/dashboard` | Multi-panel dashboard data | Optional |
| `GET /api/transactions/list` | Paginated transaction list | Required |
| `GET /api/deal-checker/multi-scope` | Value analysis | Optional |
| `GET /api/gls/all` | GLS tender data | Public |
| `GET /api/upcoming-launches/all` | New launches | Public |

### API Contract

All responses include:
```json
{
  "meta": {
    "apiContractVersion": "v3",
    "timestamp": "2024-12-26T10:00:00Z"
  },
  "data": [...]
}
```

### Version Status

| Version | Status | Fields |
|---------|--------|--------|
| v1 | Deprecated (sunset 2026-04-01) | snake_case |
| v2 | Supported | camelCase |
| v3 | Current | camelCase + version tracking |

---

## Performance Architecture

### Caching Strategy

| Layer | Cache | TTL |
|-------|-------|-----|
| Backend | In-memory LRU | 5 minutes |
| Database | PostgreSQL buffer pool | Managed |
| Frontend | React Query (implicit) | Per-component |

### Performance Targets

| Metric | Target | Acceptable |
|--------|--------|------------|
| Dashboard (cached) | <50ms | <100ms |
| Dashboard (uncached) | <300ms | <500ms |
| Worst case query | <1s | <2s |
| Memory usage | <400MB | <512MB |

### Optimization Decisions

1. **Sequential queries for remote DB** - Parallel execution worsens performance due to connection pool contention
2. **Partial indexes** - Pre-filter outliers at index level
3. **Cache warming** - Pre-populate common queries on startup
4. **SQL-only aggregation** - No pandas DataFrames in memory

---

## Security Architecture

### Authentication

- Firebase Auth (Google OAuth)
- JWT tokens for session management
- Tier-based access control

### Data Protection

- No raw transaction data in free tier
- K-anonymity threshold (currently 10, recommended 50)
- Aggregation before display

### API Security

- CORS configuration
- Request validation
- Rate limiting (recommended)

---

## Deployment Architecture

### Render Configuration

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Render                                                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  Web Service (backend)                                                  │
│  • Port: $PORT                                                          │
│  • Start: gunicorn app:app                                              │
│  • Memory: 512MB                                                        │
│                                                                         │
│  PostgreSQL                                                             │
│  • Standard plan                                                        │
│  • 5 connection limit                                                   │
│  • Auto-backups                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Startup Sequence

1. Run database migrations
2. Verify schema (fail-fast if drift detected)
3. Warm cache for common queries
4. Start Gunicorn

---

## File Organization

```
backend/
├── app.py              # Flask app factory
├── config.py           # Environment config
├── routes/
│   ├── analytics.py    # Main analytics endpoints
│   ├── projects.py     # Project-specific endpoints
│   ├── gls.py          # GLS endpoints
│   └── upcoming_launches.py
├── services/
│   ├── dashboard_service.py
│   ├── aggregate_service.py
│   ├── deal_checker.py
│   └── ...
├── models/
│   ├── transaction.py
│   ├── project_location.py
│   └── ...
├── schemas/
│   └── api_contract.py
└── migrations/

frontend/src/
├── components/
│   ├── powerbi/        # Dashboard charts
│   ├── ui/             # Shared UI components
│   └── insights/       # Analysis components
├── adapters/           # API response transformers
├── hooks/
│   ├── useAbortableQuery.js
│   └── useStaleRequestGuard.js
├── contexts/
│   ├── FilterContext.jsx
│   └── AuthContext.jsx
├── schemas/
│   └── apiContract.js
└── api/
    └── client.js
```

---

*Last updated: December 2024*
