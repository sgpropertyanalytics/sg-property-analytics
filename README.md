# Singapore Condo Resale Analytics – Full Stack App

Modern **Flask + React + Vite + Tailwind** stack for analyzing private condominium resale transactions in Singapore, using a **pre-computed analytics** architecture.

## Project Structure (current)

```txt
sgpropertytrend/
├── backend/                    # Flask API backend
│   ├── app.py                  # Flask application factory & entry point
│   ├── config.py               # Config (DB, JWT, ENV)
│   ├── requirements.txt        # Python dependencies
│   ├── condo_master.db         # SQLite DB (local dev)
│   ├── models/                 # SQLAlchemy models
│   ├── routes/                 # API route blueprints (analytics, auth, ads)
│   └── services/               # Aggregation, analytics reader, data processing
│
├── frontend/                   # React + Vite + Tailwind frontend
│   ├── index.html              # Vite HTML shell (<div id="root" />)
│   ├── vite.config.js          # Vite config + dev API proxy
│   ├── tailwind.config.js      # Tailwind v4 config
│   ├── postcss.config.js       # PostCSS pipeline
│   ├── vercel.json             # SPA routing for Vercel
│   ├── src/
│   │   ├── main.jsx            # React entry (imports ./index.css)
│   │   ├── App.jsx             # Routes + layout, wrapped in DataProvider
│   │   ├── index.css           # Tailwind import + base theme
│   │   ├── api/client.js       # Axios API client (VITE_API_URL-based)
│   │   ├── context/DataContext.jsx  # Centralized districts + metadata
│   │   ├── components/         # Chart components (LineChart, BarChart, etc.)
│   │   └── pages/
│   │       ├── Dashboard.jsx   # Main analytics dashboard (mobile-first)
│   │       └── Login.jsx       # Auth page
│   └── legacy/
│       └── dashboard.html      # Old static dashboard (CDN React) – reference only
│
├── scripts/                    # ETL & maintenance scripts
│   ├── upload.py               # CSV → DB + trigger aggregation
│   └── recompute_stats.py      # Recompute analytics from existing data
│
├── rawdata/                    # Source CSVs (New Sale / Resale)
├── ARCHITECTURE.md             # Detailed backend + analytics design
├── REACT_PORT_COMPLETE.md      # React port notes
├── CENTRALIZED_STATE_COMPLETE.md # DataContext + env setup notes
└── SAAS_SETUP_COMPLETE.md      # Auth + Ads backend setup notes
```

## Quick Start – Backend

```bash
cd backend
pip install -r requirements.txt

# Ensure .env is configured (see env.example)
python app.py
```

The Flask API will run on `http://localhost:5000` and expose `/api/...` endpoints.

## Quick Start – Frontend

```bash
cd frontend
npm install

# For local dev (proxies /api to backend):
npm run dev
```

Open `http://localhost:3000/dashboard`.

Make sure `VITE_API_URL` is set in `frontend/.env` **or** in your hosting (Vercel) to your backend URL, e.g.:

```bash
VITE_API_URL=http://localhost:5000/api
# or in production:
# VITE_API_URL=https://sg-property-analyzer.onrender.com/api
```

## Key Features

- **Pre-computed analytics**:
  - CSVs loaded via `scripts/upload.py`
  - Aggregations computed once into `PreComputedStats`
  - API endpoints simply read JSON blobs (fast, scalable)
- **Rich analytics dashboard**:
  - Price and PSF trends by quarter and region (CCR/RCR/OCR)
  - Transaction counts by bedroom type
  - New sale vs resale comparisons
  - Market stats (short-term vs long-term)
  - Mobile-first layout with scroll-snapping chart carousels
- **Modern frontend stack**:
  - React 18 + Vite
  - Tailwind v4 for styling
  - Chart.js via `react-chartjs-2`

## API Overview (selected)

All endpoints are served under `/api`:

| Endpoint                         | Description                                   |
|----------------------------------|-----------------------------------------------|
| `GET /api/health`               | Health + data-loaded status                   |
| `GET /api/resale_stats`         | Median price & PSF stats                      |
| `GET /api/transactions`         | Individual transaction records                |
| `GET /api/price_trends`         | Quarterly price trends (by bedroom)          |
| `GET /api/total_volume`         | Total transacted volume by district          |
| `GET /api/avg_psf`              | Average PSF by district                      |
| `GET /api/districts`            | List of available districts                  |
| `GET /api/market_stats`         | Short-term vs long-term market view          |
| `GET /api/market_stats_by_district` | Market stats split by district          |

Most visualization endpoints accept filters such as `?bedroom=2,3,4` and optional district / segment params (see `frontend/src/api/client.js` for exact usage).

## Notes

- **Legacy single-file dashboard** (`frontend/legacy/dashboard.html`) is kept only as a visual/logic reference; it is **not** served by Vercel.
- All new work on the UI should happen in `frontend/src/**`.
- For detailed architecture, see `ARCHITECTURE.md` and the specialized “*_COMPLETE.md” documents. 


