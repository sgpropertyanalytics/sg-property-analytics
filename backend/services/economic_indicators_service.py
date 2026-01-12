"""
Economic Indicators Service - Auto-refresh from Data.gov.sg

Fetches key economic indicators and updates AI context:
- CPI/Inflation (monthly)
- Unemployment rate (quarterly)
- GDP growth (quarterly)
- HDB resale price index (quarterly)

All data from SingStat via Data.gov.sg API.
"""

import json
import logging
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)

# Data.gov.sg API endpoint
DATASTORE_URL = "https://data.gov.sg/api/action/datastore_search"

# Dataset IDs
DATASETS = {
    "cpi": "d_bdaff844e3ef89d39fceb962ff8f0791",  # CPI Monthly (2024 base)
    "unemployment": "d_b0da22a41f952764376a2b7b5b0f2533",  # Unemployment Quarterly
    "gdp": "d_a5ff719648a0e6d4b4c623ee383ab686",  # GDP Growth Quarterly
    "hdb_rpi": "d_14f63e595975691e7c24a27ae4c07c79",  # HDB Resale Price Index
}

# File paths
INDICATORS_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "snapshot" / "economic-indicators.md"
MANIFEST_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "manifest.json"


def fetch_dataset(dataset_id: str, limit: int = 50) -> Optional[Dict]:
    """Fetch dataset from Data.gov.sg API."""
    try:
        response = requests.get(
            DATASTORE_URL,
            params={"resource_id": dataset_id, "limit": limit},
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            logger.error(f"API returned unsuccessful for {dataset_id}")
            return None

        return data.get("result", {})
    except Exception as e:
        logger.error(f"Failed to fetch dataset {dataset_id}: {e}")
        return None


def get_latest_columns(fields: List[Dict], exclude: List[str] = None) -> List[str]:
    """Get column names sorted by recency (newest first)."""
    exclude = exclude or ["DataSeries", "_id"]
    cols = [f["id"] for f in fields if f["id"] not in exclude]
    return cols  # Already sorted newest first in API response


def parse_period(col_name: str) -> str:
    """Convert column name like '2025Nov' or '20253Q' to readable format."""
    if len(col_name) == 7 and col_name[:4].isdigit():
        # Monthly: 2025Nov -> Nov 2025
        year = col_name[:4]
        month = col_name[4:]
        return f"{month} {year}"
    elif len(col_name) == 6 and col_name[:4].isdigit():
        # Quarterly: 20253Q -> Q3 2025
        year = col_name[:4]
        quarter = col_name[4:]
        return f"Q{quarter[0]} {year}"
    return col_name


def fetch_cpi_data() -> Optional[Dict]:
    """Fetch CPI (Consumer Price Index) data."""
    result = fetch_dataset(DATASETS["cpi"], limit=5)
    if not result or not result.get("records"):
        return None

    fields = result.get("fields", [])
    records = result.get("records", [])

    # Find "All Items" row (headline CPI)
    all_items = next((r for r in records if r.get("DataSeries") == "All Items"), None)
    if not all_items:
        return None

    # Get latest 6 months
    cols = get_latest_columns(fields)[:6]
    values = [(parse_period(c), float(all_items.get(c, 0))) for c in cols if all_items.get(c)]

    if not values:
        return None

    latest_period, latest_value = values[0]

    # Calculate YoY inflation (current vs 12 months ago)
    # Base year 2024 = 100, so value - 100 = approximate inflation %
    yoy_inflation = latest_value - 100

    return {
        "latest_period": latest_period,
        "index": latest_value,
        "yoy_inflation": yoy_inflation,
        "trend": values[:6],
        "base_year": "2024"
    }


def fetch_unemployment_data() -> Optional[Dict]:
    """Fetch unemployment rate data."""
    result = fetch_dataset(DATASETS["unemployment"], limit=10)
    if not result or not result.get("records"):
        return None

    fields = result.get("fields", [])
    records = result.get("records", [])

    cols = get_latest_columns(fields)
    latest_col = cols[0] if cols else None
    prev_col = cols[4] if len(cols) > 4 else None  # YoY comparison (4 quarters back)

    if not latest_col:
        return None

    rates = {}
    for rec in records:
        series = rec.get("DataSeries", "")
        if "Total" in series:
            rates["total"] = float(rec.get(latest_col, 0))
            rates["total_prev"] = float(rec.get(prev_col, 0)) if prev_col else None
        elif "Resident" in series and "Citizen" not in series:
            rates["resident"] = float(rec.get(latest_col, 0))
        elif "Citizen" in series:
            rates["citizen"] = float(rec.get(latest_col, 0))

    return {
        "latest_period": parse_period(latest_col),
        "rates": rates
    }


def fetch_gdp_data() -> Optional[Dict]:
    """Fetch GDP growth rate data."""
    result = fetch_dataset(DATASETS["gdp"], limit=5)
    if not result or not result.get("records"):
        return None

    fields = result.get("fields", [])
    records = result.get("records", [])

    # Find headline GDP row
    gdp_row = next((r for r in records if r.get("DataSeries") == "GDP At Current Market Prices"), None)
    if not gdp_row:
        return None

    cols = get_latest_columns(fields)[:8]
    values = []
    for c in cols:
        val = gdp_row.get(c)
        if val is not None:
            values.append((parse_period(c), float(val)))

    if not values:
        return None

    return {
        "latest_period": values[0][0],
        "latest_growth": values[0][1],
        "trend": values[:8]
    }


def fetch_hdb_rpi_data() -> Optional[Dict]:
    """Fetch HDB Resale Price Index data."""
    result = fetch_dataset(DATASETS["hdb_rpi"], limit=150)
    if not result or not result.get("records"):
        return None

    records = result.get("records", [])

    # Sort by quarter descending to get latest
    def parse_quarter(q):
        try:
            year, qtr = q.split("-")
            return int(year) * 10 + int(qtr[1])
        except:
            return 0

    sorted_records = sorted(records, key=lambda r: parse_quarter(r.get("quarter", "")), reverse=True)

    if not sorted_records:
        return None

    latest = sorted_records[0]
    prev_year = sorted_records[4] if len(sorted_records) > 4 else None  # 4 quarters back

    latest_index = float(latest.get("index", 0))
    yoy_change = None
    if prev_year:
        prev_index = float(prev_year.get("index", 0))
        if prev_index > 0:
            yoy_change = ((latest_index - prev_index) / prev_index) * 100

    return {
        "latest_period": latest.get("quarter", "").replace("-", " "),
        "index": latest_index,
        "yoy_change": yoy_change,
        "base_period": "Q1 2009 = 100",
        "trend": [(r.get("quarter", "").replace("-", " "), float(r.get("index", 0)))
                  for r in sorted_records[:8]]
    }


def generate_indicators_markdown(
    cpi: Optional[Dict],
    unemployment: Optional[Dict],
    gdp: Optional[Dict],
    hdb_rpi: Optional[Dict]
) -> str:
    """Generate the economic-indicators.md content."""
    today = datetime.now().strftime("%Y-%m-%d")

    # Format helpers
    def fmt_pct(val, decimals=1):
        if val is None:
            return "N/A"
        sign = "+" if val > 0 else ""
        return f"{sign}{val:.{decimals}f}%"

    def fmt_trend(trend, is_pct=False):
        if not trend:
            return "N/A"
        items = []
        for period, val in trend[:4]:
            if is_pct:
                items.append(f"{period}: {fmt_pct(val)}")
            else:
                items.append(f"{period}: {val:.1f}")
        return " → ".join(items)

    # CPI section
    cpi_section = "Data unavailable"
    if cpi:
        cpi_section = f"""| Metric | Value |
|--------|-------|
| **CPI Index** | {cpi['index']:.1f} (Base: {cpi['base_year']} = 100) |
| **YoY Inflation** | {fmt_pct(cpi['yoy_inflation'])} |
| **Period** | {cpi['latest_period']} |

**Recent Trend**: {fmt_trend(cpi['trend'])}"""

    # Unemployment section
    unemp_section = "Data unavailable"
    if unemployment:
        rates = unemployment.get("rates", {})
        yoy_change = ""
        if rates.get("total_prev"):
            diff = rates["total"] - rates["total_prev"]
            yoy_change = f" ({fmt_pct(diff, 2)} YoY)"
        unemp_section = f"""| Category | Rate |
|----------|------|
| **Total** | {rates.get('total', 'N/A'):.1f}%{yoy_change} |
| Resident | {rates.get('resident', 'N/A'):.1f}% |
| Citizen | {rates.get('citizen', 'N/A'):.1f}% |

**Period**: {unemployment['latest_period']}"""

    # GDP section
    gdp_section = "Data unavailable"
    if gdp:
        gdp_section = f"""| Metric | Value |
|--------|-------|
| **YoY Growth** | {fmt_pct(gdp['latest_growth'])} |
| **Period** | {gdp['latest_period']} |

**Recent Trend**: {fmt_trend(gdp['trend'], is_pct=True)}"""

    # HDB RPI section
    hdb_section = "Data unavailable"
    if hdb_rpi:
        hdb_section = f"""| Metric | Value |
|--------|-------|
| **Index** | {hdb_rpi['index']:.1f} ({hdb_rpi['base_period']}) |
| **YoY Change** | {fmt_pct(hdb_rpi['yoy_change'])} |
| **Period** | {hdb_rpi['latest_period']} |

**Recent Trend**: {fmt_trend(hdb_rpi['trend'])}"""

    markdown = f"""# Economic Indicators

**Last Updated**: {today}
**Sources**: SingStat, HDB via Data.gov.sg API
**Auto-Refreshed**: Yes

---

## Consumer Price Index (CPI) - Monthly

{cpi_section}

### What It Means for Property
- Higher inflation → pressure on construction costs → higher new launch prices
- Inflation above 2-3% often triggers MAS policy tightening
- Property seen as inflation hedge, driving investment demand

---

## Unemployment Rate - Quarterly

{unemp_section}

### What It Means for Property
- Low unemployment (<3%) supports property demand and prices
- Rising unemployment → reduced buyer confidence, transaction volume drops
- Resident unemployment is key indicator for citizen/PR buyer segment

---

## GDP Growth - Quarterly

{gdp_section}

### What It Means for Property
- GDP growth >3% typically supports healthy property market
- Negative GDP → recession fears, weaker luxury segment
- Services sector performance impacts CBD/CCR demand

---

## HDB Resale Price Index - Quarterly

{hdb_section}

### What It Means for Property
- HDB prices lead private condo demand (upgrader pipeline)
- High HDB index = more HDB sellers with capital for private purchase
- OCR/RCR condos most correlated with HDB price movements

---

## Economic Context Summary

| Indicator | Current | Interpretation |
|-----------|---------|----------------|
| Inflation | {fmt_pct(cpi['yoy_inflation']) if cpi else 'N/A'} | {'Moderate - normal market' if cpi and cpi['yoy_inflation'] < 3 else 'Elevated - cost pressure' if cpi else 'N/A'} |
| Unemployment | {unemployment['rates'].get('total', 'N/A'):.1f}% | {'Low - strong demand' if unemployment and unemployment['rates'].get('total', 5) < 3 else 'Moderate' if unemployment else 'N/A'} |
| GDP Growth | {fmt_pct(gdp['latest_growth']) if gdp else 'N/A'} | {'Growing - positive sentiment' if gdp and gdp['latest_growth'] > 0 else 'Contracting - caution' if gdp else 'N/A'} |
| HDB Index | {hdb_rpi['index']:.0f} | {'Rising - upgrader pipeline active' if hdb_rpi and hdb_rpi['yoy_change'] and hdb_rpi['yoy_change'] > 0 else 'Stable/Falling' if hdb_rpi else 'N/A'} |

---

**Disclaimer**: Economic indicators are lagging data. Always verify current conditions. This data is auto-refreshed from Data.gov.sg for informational purposes only.
"""
    return markdown


def update_manifest():
    """Update manifest.json with new timestamp and entry."""
    try:
        if MANIFEST_FILE.exists():
            with open(MANIFEST_FILE, "r") as f:
                manifest = json.load(f)

            today = datetime.now().strftime("%Y-%m-%d")

            # Add or update economic-indicators.md entry
            if "snapshot/economic-indicators.md" not in manifest.get("files", {}):
                manifest["files"]["snapshot/economic-indicators.md"] = {
                    "updated_at": today,
                    "last_verified_at": today,
                    "source_urls": [
                        "https://data.gov.sg/datasets/d_bdaff844e3ef89d39fceb962ff8f0791/view",
                        "https://data.gov.sg/datasets/d_b0da22a41f952764376a2b7b5b0f2533/view",
                        "https://data.gov.sg/datasets/d_a5ff719648a0e6d4b4c623ee383ab686/view",
                        "https://data.gov.sg/datasets/d_14f63e595975691e7c24a27ae4c07c79/view"
                    ],
                    "description": "Key economic indicators: CPI, unemployment, GDP, HDB price index",
                    "injection": "conditional",
                    "injection_triggers": [
                        "economy",
                        "economic",
                        "inflation",
                        "CPI",
                        "unemployment",
                        "GDP",
                        "HDB price",
                        "market conditions",
                        "macro"
                    ],
                    "notes": "Inject for macroeconomic context and market condition discussions."
                }
            else:
                manifest["files"]["snapshot/economic-indicators.md"]["updated_at"] = today
                manifest["files"]["snapshot/economic-indicators.md"]["last_verified_at"] = today

            with open(MANIFEST_FILE, "w") as f:
                json.dump(manifest, f, indent=2)
                f.write("\n")

            logger.info(f"Updated manifest.json timestamp to {today}")
    except Exception as e:
        logger.warning(f"Failed to update manifest: {e}")


def refresh_economic_indicators() -> bool:
    """
    Main function to refresh all economic indicators.

    Returns:
        True if successful, False otherwise
    """
    logger.info("Fetching economic indicators from Data.gov.sg...")

    # Fetch all datasets
    cpi = fetch_cpi_data()
    logger.info(f"CPI: {'OK' if cpi else 'FAILED'}")

    unemployment = fetch_unemployment_data()
    logger.info(f"Unemployment: {'OK' if unemployment else 'FAILED'}")

    gdp = fetch_gdp_data()
    logger.info(f"GDP: {'OK' if gdp else 'FAILED'}")

    hdb_rpi = fetch_hdb_rpi_data()
    logger.info(f"HDB RPI: {'OK' if hdb_rpi else 'FAILED'}")

    # Generate markdown even if some failed
    if not any([cpi, unemployment, gdp, hdb_rpi]):
        logger.error("All economic indicator fetches failed")
        return False

    logger.info("Generating economic indicators markdown...")
    markdown = generate_indicators_markdown(cpi, unemployment, gdp, hdb_rpi)

    try:
        INDICATORS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(INDICATORS_FILE, "w") as f:
            f.write(markdown)
        logger.info(f"Updated {INDICATORS_FILE}")

        update_manifest()
        return True

    except Exception as e:
        logger.error(f"Failed to write indicators file: {e}")
        return False


# Allow running standalone
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = refresh_economic_indicators()
    if success:
        print("Economic indicators refreshed successfully!")
    else:
        print("Failed to refresh economic indicators")
        exit(1)
