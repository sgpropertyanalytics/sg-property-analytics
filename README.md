# Singapore Property Analytics Dashboard

A **Power BI-style analytics dashboard** for Singapore private condo transactions. Visualize price trends, transaction volumes, and market comparisons across districts and regions.

## What It Does

- **Market Overview**: Track median PSF, transaction counts, and price trends over time
- **Regional Analysis**: Compare CCR, RCR, OCR market segments
- **Drill-Down**: Year → Quarter → Month granularity with Power BI-style drill buttons
- **Cross-Filtering**: Click charts to filter data across the dashboard
- **New vs Resale**: Compare new launch prices against resale units

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Runs on `http://localhost:5000`. Requires PostgreSQL in production (SQLite for local dev).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000`. Set `VITE_API_URL` in `.env` for production:

```bash
VITE_API_URL=https://your-backend.onrender.com/api
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS + Chart.js |
| Backend | Flask + SQLAlchemy |
| Database | PostgreSQL (production) / SQLite (dev) |
| Hosting | Render (512MB memory optimized) |

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for:
- System design and data flow
- Power BI filter patterns (global slicers, cross-filtering, drill)
- API endpoint documentation
- Database schema
- Memory optimization strategies

## Key API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/dashboard` | Unified chart data (time series, volume, histogram) |
| `GET /api/new-vs-resale` | New launch vs resale comparison |
| `GET /api/transactions/list` | Paginated transaction records |
| `GET /api/filter-options` | Available filter values |

All endpoints accept global filters: `district`, `bedroom`, `segment`, `date_from`, `date_to`.

## Project Structure

```
sg-property-analyzer/
├── backend/           # Flask API
├── frontend/          # React + Vite app
├── scripts/           # ETL scripts (upload.py)
├── ARCHITECTURE.md    # System design docs
└── claude.md          # Development guide
```

## License

MIT
