# SG Property Analyzer Documentation

Analytics platform for Singapore private residential real estate transactions.

## Quick Links

### Core Documentation

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System design, layer diagrams, data flow |
| [Backend](backend.md) | API contracts, SQL rules, services, caching |
| [Frontend](frontend.md) | Zustand stores, TanStack Query, adapters |
| [Data Model](data-model.md) | Transaction schema, classifications, formulas |
| [Access Control](access-control.md) | Tiers, paywall, masking, compliance |
| [Glossary](glossary.md) | Terminology, acronyms, mappings |
| [Decisions](decisions.md) | Design decisions, trade-offs |

### Runbooks

| Document | Description |
|----------|-------------|
| [Deployment](runbooks/DEPLOYMENT.md) | Database migrations, Render setup |
| [Migration](runbooks/MIGRATION.md) | Database migration procedures |
| [Data Upload](runbooks/DATA_UPLOAD_GUIDE.md) | CSV upload pipeline, validation |
| [Deprecation Monitoring](runbooks/ENDPOINT_DEPRECATION_MONITORING.md) | Track deprecated endpoints |

### Reference

| Document | Description |
|----------|-------------|
| [Engineering Principles](reference/ENGINEERING_PRINCIPLES.md) | Core principles |
| [Code Patterns](reference/CODE_PATTERNS.md) | Snippets and patterns |
| [Checklists](reference/CHECKLISTS.md) | Pre-commit checklists |
| [Testing](reference/TESTING.md) | Testing guide |
| [Library Reference](reference/LIBRARY_FIRST_REFERENCE.md) | Library decisions |
| [Chart Dependencies](reference/BACKEND_CHART_DEPENDENCIES.md) | Chart → endpoint mapping |
| [Deprecated](reference/DEPRECATED.md) | Deprecated endpoints/patterns |

### Validation Reports

| Document | Description |
|----------|-------------|
| [Market Core Validation](validation/MARKET_CORE_DATA_INTEGRITY_REPORT.md) | Sale type filtering, calculations |
| [Absorption Validation](validation/ABSORPTION_VALIDATION_REPORT.md) | Absorption rate formula |
| [Ingestion Architecture](validation/INGESTION_ARCHITECTURE.md) | Data pipeline design |

### Archive

Historical documentation from completed migrations, audits, and investigations.
See [archive/README.md](archive/README.md) for details.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           SG Property Analyzer                                │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  Frontend (React/Vite)                 Backend (Flask)                        │
│  ┌────────────────────────┐           ┌────────────────────────────────────┐ │
│  │ Zustand Filter Store   │           │ Middleware Layer                   │ │
│  │  • filters, drill state│           │  • request_id, query_timing        │ │
│  │  • buildApiParams()    │           ├────────────────────────────────────┤ │
│  ├────────────────────────┤           │ API Contract Layer                 │ │
│  │ useAppQuery (TanStack) │  ──────▶  │  • @api_contract decorator         │ │
│  │  • caching, abort      │           │  • param validation/normalization  │ │
│  ├────────────────────────┤           ├────────────────────────────────────┤ │
│  │ Adapters               │           │ Routes → Services → SQL            │ │
│  │  • transformTimeSeries │  ◀──────  │  • /api/aggregate                  │ │
│  │  • transformDistrib... │           │  • /api/dashboard                  │ │
│  ├────────────────────────┤           │  • /api/filters                    │ │
│  │ Charts (Chart.js)      │           └────────────────────────────────────┘ │
│  └────────────────────────┘                        │                         │
│                                                    ▼                         │
│                                        ┌────────────────────────────────────┐│
│                                        │ PostgreSQL (Render)                ││
│                                        │  • transactions (~205K rows)       ││
│                                        │  • gls_tenders, upcoming_launches  ││
│                                        │  • project_locations, users        ││
│                                        └────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Chart.js, TanStack Query, Zustand |
| Backend | Flask, SQLAlchemy, Python 3.10+ |
| Database | PostgreSQL (Render hosted) |
| Auth | Firebase (Google OAuth) + JWT |
| Hosting | Vercel (frontend), Render (backend) |
| CI/CD | GitHub Actions (3-stage Claude Code review) |

## Page Routes

| Nav Label | Route | Data Scope |
|-----------|-------|------------|
| Market Overview | `/market-overview` | Resale ONLY |
| District Overview | `/district-overview` | All |
| New Launch Market | `/new-launch-market` | New Sale + Resale |
| Supply & Inventory | `/supply-inventory` | All |
| Explore | `/explore` | All |
| Value Check | `/value-check` | All |
| Exit Risk | `/exit-risk` | All |

## Core Principles

1. **Page owns business logic** - Pages decide data scope, charts receive as props
2. **Adapter pattern** - Charts never access raw API data directly
3. **SQL-first aggregation** - No pandas in production (512MB memory limit)
4. **API contract system** - `@api_contract` decorator validates all requests
5. **TanStack Query** - All data fetching via `useAppQuery` (caching, abort, deduplication)
6. **Zustand state** - Filter state via `useZustandFilters` (replaced Context)

## Project Structure

```
sg-property-analyzer/
├── backend/
│   ├── api/
│   │   ├── contracts/        # @api_contract system
│   │   │   ├── wrapper.py    # Decorator
│   │   │   ├── normalize.py  # Param normalization
│   │   │   ├── schemas/      # 17 endpoint contracts
│   │   │   └── contract_schema.py # Enums + serialization
│   │   └── middleware/       # request_id, query_timing
│   ├── routes/
│   │   └── analytics/        # 12 route modules
│   ├── services/             # 37 service files
│   ├── models/               # SQLAlchemy models
│   ├── db/                   # sql.py (helpers)
│   ├── tests/                # Contract tests, snapshots
│   └── utils/                # normalize.py (input boundary)
│
├── frontend/src/
│   ├── stores/               # Zustand state management
│   │   └── filterStore.js    # Filter state
│   ├── lib/
│   │   └── queryClient.js    # TanStack Query config
│   ├── context/
│   │   ├── AuthContext.jsx   # Auth
│   │   └── PowerBIFilter/    # Utilities only (Provider removed)
│   ├── components/
│   │   ├── layout/           # DashboardLayout, GlobalNavRail
│   │   └── powerbi/          # 40+ chart components
│   ├── adapters/
│   │   └── aggregate/        # 13 transform modules
│   ├── hooks/                # useAppQuery, useDeferredFetch
│   ├── schemas/apiContract/  # Frontend enums
│   └── api/client.js         # Axios with queue
│
├── .github/workflows/        # CI/CD (Claude Code review, regression)
├── docs/                     # This documentation
├── scripts/                  # Upload, migration scripts
└── rawdata/                  # CSV files
```

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://..."
flask run --port 5000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `FLASK_ENV` | Backend | `development` or `production` |
| `FIREBASE_*` | Both | Firebase auth credentials |
| `VITE_API_URL` | Frontend | (optional) API base URL |

---

## Key Concepts

### Zustand Filter Store

All filter state lives in a Zustand store:

```javascript
import { useZustandFilters } from '../stores';

const {
  filters,           // districts, bedroomTypes, timeFilter, saleType
  drillPath,         // location, time hierarchy
  timeGrouping,      // 'year' | 'quarter' | 'month'
  buildApiParams,    // Merge filters + overrides
  debouncedFilterKey // 200ms debounced cache key
} = useZustandFilters();
```

### Data Fetching Pattern

```javascript
import { useAppQuery } from '../hooks';
import { useZustandFilters } from '../stores';

const { data, status, error } = useAppQuery(
  async (signal) => {
    const params = buildApiParams({ group_by: 'quarter' });
    const response = await getAggregate(params, { signal });
    return transformTimeSeries(response.data, timeGrouping);
  },
  [debouncedFilterKey, timeGrouping],
  { chartName: 'MyChart', keepPreviousData: true }
);
```

### API Contract System

Backend validates all requests with `@api_contract`:

```python
@analytics_bp.route("/aggregate")
@api_contract("aggregate")  # Validates params, normalizes, injects meta
def aggregate():
    params = g.normalized_params  # Already validated
    return jsonify({"data": service.get_data(**params)})
```

### Access Tiers

| Tier | Access |
|------|--------|
| Free | Summary metrics, aggregated charts (premium data masked) |
| Premium | Full project details, exports |
| Professional | All features + API access |

---

## Diagrams

For detailed architecture diagrams, see:
- [Backend Layer Diagram](architecture.md#backend-architecture)
- [Frontend Provider Hierarchy](architecture.md#frontend-architecture)
- [Request Processing Flow](backend.md#api-contract-system)
- [Data Fetching Pipeline](frontend.md#data-fetching)

---

*Last updated: January 2026*
