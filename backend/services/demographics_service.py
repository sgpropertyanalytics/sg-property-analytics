"""
Demographics Service - Auto-refresh population data from Data.gov.sg

Fetches Singapore population statistics and updates the AI context file.
Data source: SingStat via Data.gov.sg API
"""

import json
import logging
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Data.gov.sg API endpoints
POPULATION_INDICATORS_URL = "https://data.gov.sg/api/action/datastore_search"
POPULATION_DATASET_ID = "d_3d227e5d9fdec73f3bcadce671c333a6"

# AI context file path
DEMOGRAPHICS_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "snapshot" / "demographics.md"
MANIFEST_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "manifest.json"


def fetch_population_data() -> Optional[dict]:
    """
    Fetch population indicators from Data.gov.sg API.

    Returns:
        dict with population metrics or None if failed
    """
    try:
        response = requests.get(
            POPULATION_INDICATORS_URL,
            params={
                "resource_id": POPULATION_DATASET_ID,
                "limit": 30  # Get all indicators
            },
            timeout=30
        )
        response.raise_for_status()
        data = response.json()

        if not data.get("success"):
            logger.error("Data.gov.sg API returned unsuccessful response")
            return None

        records = data.get("result", {}).get("records", [])
        if not records:
            logger.error("No records returned from Data.gov.sg API")
            return None

        # Parse into structured dict
        metrics = {}
        for record in records:
            series_name = record.get("DataSeries", "")
            # Get latest year's data (2025, fallback to 2024)
            value = record.get("2025") or record.get("2024")
            if series_name and value is not None:
                metrics[series_name] = value

        # Also get previous year for YoY calculation
        metrics_prev = {}
        for record in records:
            series_name = record.get("DataSeries", "")
            value = record.get("2024") or record.get("2023")
            if series_name and value is not None:
                metrics_prev[series_name] = value

        return {
            "current": metrics,
            "previous": metrics_prev,
            "year": "2025" if records[0].get("2025") else "2024"
        }

    except requests.RequestException as e:
        logger.error(f"Failed to fetch population data: {e}")
        return None
    except Exception as e:
        logger.error(f"Error parsing population data: {e}")
        return None


def format_population(value) -> str:
    """Format population number for display."""
    try:
        value = float(value)
    except (ValueError, TypeError):
        return str(value)

    if value >= 1_000_000:
        return f"{value / 1_000_000:.2f} million"
    elif value >= 1_000:
        return f"{value / 1_000:.0f}K"
    return str(int(value))


def calculate_yoy_change(current, previous) -> str:
    """Calculate year-over-year percentage change."""
    try:
        current = float(current)
        previous = float(previous)
    except (ValueError, TypeError):
        return "N/A"

    if previous == 0:
        return "N/A"
    change = ((current - previous) / previous) * 100
    sign = "+" if change > 0 else ""
    return f"{sign}{change:.1f}%"


def generate_demographics_markdown(data: dict) -> str:
    """
    Generate the demographics.md content from API data.

    Args:
        data: Dict with 'current', 'previous', and 'year' keys

    Returns:
        Markdown content string
    """
    current = data["current"]
    previous = data["previous"]
    year = data["year"]
    today = datetime.now().strftime("%Y-%m-%d")

    # Extract key metrics
    total_pop = current.get("Total Population", 0)
    citizen_pop = current.get("Singapore Citizen Population", 0)
    pr_pop = current.get("Permanent Resident Population", 0)
    nr_pop = current.get("Non-Resident Population", 0)
    resident_pop = current.get("Resident Population", 0)

    # Previous year for YoY
    total_pop_prev = previous.get("Total Population", 0)
    citizen_pop_prev = previous.get("Singapore Citizen Population", 0)
    pr_pop_prev = previous.get("Permanent Resident Population", 0)
    nr_pop_prev = previous.get("Non-Resident Population", 0)

    # Growth rates (already in the data)
    total_growth = current.get("Total Population Growth", "N/A")
    resident_growth = current.get("Resident Population Growth", "N/A")

    markdown = f"""# Demographics & Buyer Profiles

**Last Updated**: {today}
**Data Year**: June {year}
**Sources**: SingStat via Data.gov.sg API, Industry Reports
**Auto-Refreshed**: Yes

---

## Singapore Population (June {year})

| Category | Population | Change (YoY) |
|----------|------------|--------------|
| **Total** | {format_population(total_pop)} | {'+' + str(total_growth) + '%' if isinstance(total_growth, (int, float)) else total_growth} |
| Citizens | {format_population(citizen_pop)} | {calculate_yoy_change(citizen_pop, citizen_pop_prev)} |
| Permanent Residents | {format_population(pr_pop)} | {calculate_yoy_change(pr_pop, pr_pop_prev)} |
| Non-Residents (Foreigners) | {format_population(nr_pop)} | {calculate_yoy_change(nr_pop, nr_pop_prev)} |

**Residents (Citizens + PRs)**: {format_population(resident_pop)}

**Source**: [Data.gov.sg - Population Indicators](https://data.gov.sg/datasets/d_3d227e5d9fdec73f3bcadce671c333a6/view)

---

## Private Property Buyer Profile (Estimated)

### By Residency Status
| Buyer Type | Share of Transactions | Notes |
|------------|----------------------|-------|
| Singapore Citizens | ~75-80% | Bulk of market activity |
| Permanent Residents | ~15-18% | Strong in mass market |
| Foreigners (non-PR) | ~4-7% | Down from 10%+ pre-ABSD hike |

### Foreign Buyer Trends Post-60% ABSD (Apr 2023)
- Foreigner share dropped from ~10% to ~4.7% of transactions
- CCR luxury segment most affected
- American buyers overtook Chinese nationals in 2024

---

## Top Foreign Buyer Nationalities

| Rank | Nationality | Share of Foreign Buyers | Typical Segment |
|------|-------------|------------------------|-----------------|
| 1 | USA | Rising (overtook China) | CCR luxury |
| 2 | China (PRC) | Declining | CCR, RCR |
| 3 | Malaysia | Stable | RCR, OCR |
| 4 | Indonesia | Stable | CCR luxury |
| 5 | India | Growing | RCR, OCR |

---

## Foreign Buyer Concentration by Region

| Region | Foreign Buyer Share | Typical Profile |
|--------|--------------------|-----------------|
| CCR (Core Central) | Higher (~8-12%) | Ultra-wealthy, investment |
| RCR (Rest of Central) | Moderate (~5-7%) | Expats, PRs upgrading |
| OCR (Outside Central) | Lower (~3-5%) | PRs, family-oriented |

### Districts with High Foreign Interest
- **D09 (Orchard)**: Trophy assets, Chinese/Indonesian UHNW
- **D10 (Bukit Timah)**: Good schools, expat families
- **D01/D02 (CBD/Marina)**: Investment, rental yield focus
- **D15 (East Coast)**: Lifestyle, Malaysian buyers
- **D21 (Clementi)**: Education hub, Chinese families

---

## PR Buyer Patterns

- PRs face 5% ABSD on first property (vs 0% for citizens)
- Strong preference for RCR/OCR mass market ($1-2M range)
- Often upgrade from HDB after meeting MOP
- Key districts: D19, D20, D23 (family-oriented suburbs)

---

## Market Implications

### Population-Driven Demand
- **{format_population(citizen_pop)} citizens** = core demand base for owner-occupied homes
- **{format_population(pr_pop)} PRs** = key upgrader segment, price-sensitive
- **{format_population(nr_pop)} non-residents** = rental demand + luxury purchases

### Post-60% ABSD Environment
1. **Foreigner demand collapsed** in mid-market, survived only in ultra-luxury
2. **PR buyers became key swing factor** - lower ABSD, stable population
3. **Citizen upgraders dominate** mass market volume
4. **American buyers emerging** as top foreign nationality

---

**Disclaimer**: Buyer nationality data is approximate based on industry reports. URA REALIS does not publish official nationality breakdowns. Population data auto-refreshed from Data.gov.sg.
"""
    return markdown


def update_manifest():
    """Update manifest.json with new timestamp."""
    try:
        if MANIFEST_FILE.exists():
            with open(MANIFEST_FILE, "r") as f:
                manifest = json.load(f)

            today = datetime.now().strftime("%Y-%m-%d")
            if "snapshot/demographics.md" in manifest.get("files", {}):
                manifest["files"]["snapshot/demographics.md"]["updated_at"] = today
                manifest["files"]["snapshot/demographics.md"]["last_verified_at"] = today

            with open(MANIFEST_FILE, "w") as f:
                json.dump(manifest, f, indent=2)
                f.write("\n")

            logger.info(f"Updated manifest.json timestamp to {today}")
    except Exception as e:
        logger.warning(f"Failed to update manifest: {e}")


def refresh_demographics() -> bool:
    """
    Main function to refresh demographics data.

    Returns:
        True if successful, False otherwise
    """
    logger.info("Fetching population data from Data.gov.sg...")
    data = fetch_population_data()

    if not data:
        logger.error("Failed to fetch population data")
        return False

    logger.info(f"Generating demographics markdown for year {data['year']}...")
    markdown = generate_demographics_markdown(data)

    try:
        DEMOGRAPHICS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(DEMOGRAPHICS_FILE, "w") as f:
            f.write(markdown)
        logger.info(f"Updated {DEMOGRAPHICS_FILE}")

        update_manifest()
        return True

    except Exception as e:
        logger.error(f"Failed to write demographics file: {e}")
        return False


# Allow running standalone
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = refresh_demographics()
    if success:
        print("Demographics data refreshed successfully!")
    else:
        print("Failed to refresh demographics data")
        exit(1)
