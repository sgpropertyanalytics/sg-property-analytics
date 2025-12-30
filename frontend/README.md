# Singapore Property Dashboard - React Frontend

Modern React + Vite frontend for the Singapore Condo Resale Statistics dashboard.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Contract Generation

The frontend relies on generated API contract artifacts. Run this once after pull or whenever backend contracts change:

```bash
./scripts/generate_contracts.sh
```

## Build

```bash
npm run build
```

## Features

- **React 18** with Hooks
- **Vite** for fast development and building
- **Chart.js** via `react-chartjs-2` for data visualization
- **React Router** for navigation
- **Axios** for API calls with JWT token interceptor
- **React Context** for centralized state management (prevents redundant API calls)
- **Environment Variables** for safe configuration (dev vs production)

## Project Structure

```
frontend/
├── src/
│   ├── api/
│   │   └── client.js          # Axios client with JWT interceptor
│   ├── context/
│   │   └── DataContext.jsx    # Centralized state (districts, metadata)
│   ├── components/
│   │   ├── LineChart.jsx      # Line chart component
│   │   ├── BarChart.jsx      # Bar chart component
│   │   ├── RegionChart.jsx   # Region comparison chart
│   │   └── SaleTypeChart.jsx # New Sale vs Resale chart
│   ├── pages/
│   │   ├── Login.jsx         # Login/Register page
│   │   └── Dashboard.jsx    # Main dashboard
│   ├── App.jsx               # Main app with routing & DataProvider
│   ├── main.jsx              # Entry point
│   └── index.css             # Global styles
├── index.html                # HTML template
├── vite.config.js            # Vite configuration
├── .env.example              # Environment variables template
└── package.json              # Dependencies
```

## API Integration

The frontend connects to the Flask backend using the `VITE_API_URL` environment variable.

### Environment Variables

Create a `.env` file in the `frontend/` directory:

```bash
# For local development (defaults to http://localhost:5000/api if not set)
VITE_API_URL=http://localhost:5000/api

# For production (e.g., Railway backend)
VITE_API_URL=https://your-backend.railway.app/api
```

**Important**: 
- Vite requires the `VITE_` prefix for environment variables to be exposed to the client
- The variable should include the full path including `/api`
- See `.env.example` for template

### Development vs Production

- **Development**: Vite proxy automatically forwards `/api` requests to `http://localhost:5000`
- **Production**: Set `VITE_API_URL` to your production backend URL

All analytics endpoints are publicly accessible (no authentication required).

## Development

The Vite dev server proxies `/api` requests to `http://localhost:5000` automatically.
