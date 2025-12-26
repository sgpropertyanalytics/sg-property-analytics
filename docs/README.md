# SG Property Analyzer Documentation

Analytics platform for Singapore private residential real estate transactions.

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](architecture.md) | System design, tech stack, data flow |
| [Backend](backend.md) | APIs, SQL rules, services |
| [Frontend](frontend.md) | UI, charts, filter system, adapters |
| [Data Model](data-model.md) | Metrics, bands, classifications, formulas |
| [Access Control](access-control.md) | Tiers, paywall, masking, compliance |
| [Decisions](decisions.md) | Design decisions, trade-offs, roadmap |
| [Glossary](glossary.md) | Terminology, acronyms, mappings |

## Operational Guides

| Document | Description |
|----------|-------------|
| [Deployment](DEPLOYMENT.md) | Database migrations, Render setup |
| [Data Upload](DATA_UPLOAD_GUIDE.md) | CSV upload pipeline, validation |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SG Property Analyzer                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   Frontend (React/Vite)          Backend (Flask)                     │
│   ┌─────────────────────┐       ┌─────────────────────────────────┐ │
│   │ Filter Context      │ ────▶ │ /api/aggregate (unified)        │ │
│   │ Charts              │       │ /api/dashboard                  │ │
│   │ Adapters            │       │ /api/transactions/list          │ │
│   └─────────────────────┘       │ /api/deal-checker               │ │
│                                  │ /api/gls, /api/upcoming-launches│ │
│                                  └─────────────────────────────────┘ │
│                                           │                          │
│                                           ▼                          │
│                                  ┌─────────────────────────────────┐ │
│                                  │ PostgreSQL (Render)              │ │
│                                  │ ~205K transactions               │ │
│                                  │ GLS tenders, Upcoming launches   │ │
│                                  └─────────────────────────────────┘ │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Chart.js |
| Backend | Flask, SQLAlchemy, Python 3.10+ |
| Database | PostgreSQL (Render hosted) |
| Auth | Firebase (Google OAuth) |
| Hosting | Render (backend), Vercel/Render (frontend) |

## Core Principles

1. **Insights, not data** - Show derived analytics, never raw transaction records
2. **Adapter pattern** - All API responses pass through adapters before charts
3. **SQL-first aggregation** - No in-memory pandas for production queries
4. **API contract versioning** - v3 current, v1 deprecated (sunset 2026-04-01)

## Project Structure

```
sg-property-analyzer/
├── backend/
│   ├── routes/          # API endpoints
│   ├── services/        # Business logic, SQL queries
│   ├── models/          # SQLAlchemy models
│   ├── schemas/         # API contracts, serializers
│   └── utils/           # Helpers
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── adapters/    # API response transformers
│   │   ├── hooks/       # Custom React hooks
│   │   ├── contexts/    # React contexts
│   │   ├── schemas/     # Frontend contracts
│   │   └── api/         # API client
├── rawdata/             # CSV files (New Sale, Resale)
├── scripts/             # Upload, migration scripts
└── docs/                # This documentation
```

## Getting Started

### Backend

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL="postgresql://..."
flask run --port 5001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `FLASK_ENV` | `development` or `production` |
| `FIREBASE_*` | Firebase auth credentials |

---

## Key Concepts

### Filter System

All charts share a unified filter context:
- Districts (D01-D28)
- Regions (CCR, RCR, OCR)
- Bedroom types (Studio, 1BR-5+BR)
- Property types (Condo, EC, Apt)
- Sale types (New Sale, Resale, Sub Sale)
- Date range

### API Contract

Backend emits `apiContractVersion: "v3"` in all responses. Frontend validates and adapters normalize field names.

```javascript
// Frontend adapter usage
const { data } = useAbortableQuery(
  (signal) => fetchAggregate(params, { signal })
    .then(r => transformTimeSeries(r.data)),
  [filterKey]
);
```

### Access Tiers

| Tier | Access |
|------|--------|
| Free | Summary metrics, aggregated charts (data masked) |
| Premium | Full project details, transaction lists |
| Professional | All features + API access |

---

*Last updated: December 2024*
