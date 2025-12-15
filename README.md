# Singapore Condo Resale Statistics API

A Flask API backend + React dashboard for analyzing private condominium resale transactions in Singapore.

## Project Structure

```
condo_api/
├── app.py              # Flask API routes
├── data_fetcher.py     # URA API connection & SQLite storage
├── data_processor.py   # Query, filter, and calculate statistics
├── classifier.py       # Bedroom classification from unit size
├── requirements.txt    # Dependencies
├── condo_data.db       # SQLite database (generated)
└── frontend/
    ├── dashboard.html  # Standalone HTML dashboard (no build needed)
    └── Dashboard.jsx   # React component (for npm projects)
```

## Quick Start

```bash
# Install dependencies
pip install -r requirements.txt

# Start the server
python app.py
```

Open `http://localhost:5000` to see the dashboard.

## Dashboard Features

**Bedroom Filter**: Toggle 2B, 3B, 4B visibility across all charts

**Chart 1 - Price Trends**:
- Line chart: Median price by month
- Bar chart: Transaction count by month
- Breakdown by bedroom type

**Chart 2 - Total Volume by District**:
- Stacked bar chart showing total transacted amount
- Districts sorted by volume (highest first)

**Chart 3 - Average PSF by District**:
- Grouped bar chart showing average price per sqft
- Districts sorted by PSF (highest first)

**Summary Table**: Combined view of volume and PSF by district

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/resale_stats` | Median price & PSF stats |
| `GET /api/transactions` | Individual transaction records |
| `GET /api/price_trends` | Monthly price trends |
| `GET /api/total_volume` | Total volume by district |
| `GET /api/avg_psf` | Average PSF by district |
| `GET /api/districts` | List of available districts |

All visualization endpoints accept `?bedroom=2,3,4` filter.

## Bedroom Classification

Since URA data doesn't include bedroom count, it's estimated from unit area:

| Bedroom | Area Range (sqft) |
|---------|-------------------|
| 1-Bed | < 700 |
| 2-Bed | 700 - 1000 |
| 3-Bed | 1000 - 1400 |
| 4-Bed | 1400 - 2000 |
| 5-Bed+ | > 2000 |

## Data Source

Data fetched from URA Data Service API via Data.gov.sg. To use live data:

1. Get API key from URA
2. Update `URA_API_KEY` in `data_fetcher.py`
3. Run `python -c "from data_fetcher import fetch_and_store_all_batches; fetch_and_store_all_batches()"`

## Sample Data

For testing without API key, sample data is loaded automatically:
```bash
python data_fetcher.py
```
