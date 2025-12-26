# Singapore Property Analytics Dashboard

Analytics platform for Singapore private residential transactions.

## Features

- **Market Overview**: Track median PSF, transaction counts, and price trends
- **Regional Analysis**: Compare CCR, RCR, OCR market segments
- **Drill-Down**: Year → Quarter → Month granularity
- **Cross-Filtering**: Click charts to filter data across the dashboard
- **New vs Resale**: Compare new launch vs resale prices

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
export DATABASE_URL=postgresql://dev:dev@localhost:5432/sg_property
flask run --port 5001
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Local PostgreSQL (Docker)

```bash
docker run -d --name sg-property-db -p 5432:5432 \
    -e POSTGRES_DB=sg_property -e POSTGRES_USER=dev -e POSTGRES_PASSWORD=dev \
    postgres:15
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Chart.js |
| Backend | Flask, SQLAlchemy, Python 3.10+ |
| Database | PostgreSQL |
| Auth | Firebase (Google OAuth) |
| Hosting | Render |

## Documentation

See [`/docs`](./docs/README.md) for complete documentation:

| Document | Description |
|----------|-------------|
| [Overview](./docs/README.md) | Quick links, project structure |
| [Architecture](./docs/architecture.md) | System design, data flow |
| [Backend](./docs/backend.md) | APIs, SQL rules, services |
| [Frontend](./docs/frontend.md) | UI, charts, adapters |
| [Data Model](./docs/data-model.md) | Metrics, bands, formulas |
| [Access Control](./docs/access-control.md) | Tiers, paywall, compliance |
| [Decisions](./docs/decisions.md) | Design decisions, roadmap |
| [Glossary](./docs/glossary.md) | Terms, acronyms |

### Operational Guides

| Document | Description |
|----------|-------------|
| [Deployment](./docs/DEPLOYMENT.md) | Database migrations, Render setup |
| [Data Upload](./docs/DATA_UPLOAD_GUIDE.md) | CSV upload pipeline |

## Project Structure

```
sg-property-analyzer/
├── backend/           # Flask API
├── frontend/          # React + Vite app
├── scripts/           # Upload, migration scripts
├── rawdata/           # CSV data files
├── docs/              # Documentation
└── claude.md          # AI development guide
```

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/aggregate` | Flexible aggregation |
| `GET /api/dashboard` | Multi-panel dashboard data |
| `GET /api/transactions/list` | Paginated transactions |
| `GET /api/deal-checker/multi-scope` | Value analysis |

## License

MIT
