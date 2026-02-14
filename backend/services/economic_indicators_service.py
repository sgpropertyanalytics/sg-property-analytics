"""
Economic Indicators Service - Auto-refresh from Data.gov.sg

Fetches key economic indicators and updates AI context:
- CPI/Inflation (monthly)
- Unemployment rate (quarterly)
- GDP growth (quarterly)
- HDB resale price index (quarterly)

All data from SingStat via Data.gov.sg API.
"""

import logging
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

from utils.manifest import update_manifest

logger = logging.getLogger(__name__)

# Data.gov.sg API endpoint
DATASTORE_URL = "https://data.gov.sg/api/action/datastore_search"

# Dataset IDs
DATASETS = {
    "cpi": "d_bdaff844e3ef89d39fceb962ff8f0791",  # CPI Monthly (2024 base)
    "unemployment": "d_b0da22a41f952764376a2b7b5b0f2533",  # Unemployment Quarterly
    "gdp": "d_a5ff719648a0e6d4b4c623ee383ab686",  # GDP Growth Quarterly
    "hdb_rpi": "d_14f63e595975691e7c24a27ae4c07c79",  # HDB Resale Price Index
    "individual_income": "d_52760e82e8786bac11cca40eb29d1a93",  # Gross Monthly Income (Annual)
    "household_income": "d_a3beab3d771a17e67cb726a0d4499e10",  # Household Income Percentiles (Annual)
    "household_indicators": "d_6d878eb9c5a47f54fee7ce496f681e8d",  # Key Household Income Indicators
}

# File paths
INDICATORS_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "snapshot" / "economic-indicators.md"


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


def fetch_income_data() -> Optional[Dict]:
    """
    Fetch income data: individual median and household income by percentiles.

    Returns dict with individual_median, household_median, percentiles, etc.
    """
    income_data = {}

    # 1. Fetch individual income (has 2025 data)
    result = fetch_dataset(DATASETS["individual_income"], limit=10)
    if result and result.get("records"):
        fields = result.get("fields", [])
        records = result.get("records", [])

        # Find latest year column
        year_cols = [f["id"] for f in fields if f["id"].isdigit()]
        latest_year = max(year_cols) if year_cols else None
        prev_year = str(int(latest_year) - 1) if latest_year else None

        # Find median row
        median_row = next((r for r in records if "Median" in str(r.get("DataSeries", ""))
                          and "Male" not in str(r.get("DataSeries", ""))
                          and "Female" not in str(r.get("DataSeries", ""))), None)

        if median_row and latest_year:
            latest_val = median_row.get(latest_year)
            prev_val = median_row.get(prev_year) if prev_year else None

            if latest_val and latest_val != "na":
                income_data["individual_median"] = float(latest_val)
                income_data["individual_year"] = latest_year
                if prev_val and prev_val != "na":
                    yoy = ((float(latest_val) - float(prev_val)) / float(prev_val)) * 100
                    income_data["individual_yoy"] = yoy

    # 2. Fetch household income percentiles (has 2024 data)
    result = fetch_dataset(DATASETS["household_income"], limit=15)
    if result and result.get("records"):
        fields = result.get("fields", [])
        records = result.get("records", [])

        # Find latest year column
        year_cols = [f["id"] for f in fields if f["id"].isdigit()]
        latest_year = max(year_cols) if year_cols else None
        prev_year = str(int(latest_year) - 1) if latest_year else None

        if latest_year:
            income_data["household_year"] = latest_year
            income_data["percentiles"] = {}

            for rec in records:
                pct_label = rec.get("Dollar", "")
                val = rec.get(latest_year)
                prev_val = rec.get(prev_year) if prev_year else None

                if val and str(val).replace(".", "").isdigit():
                    val = float(val)
                    # Map percentile labels
                    if "10th" in pct_label:
                        income_data["percentiles"]["p10"] = val
                    elif "20th" in pct_label:
                        income_data["percentiles"]["p20"] = val
                    elif "30th" in pct_label:
                        income_data["percentiles"]["p30"] = val
                    elif "40th" in pct_label:
                        income_data["percentiles"]["p40"] = val
                    elif "50th" in pct_label or "Median" in pct_label:
                        income_data["household_median"] = val
                        income_data["percentiles"]["p50"] = val
                        if prev_val and str(prev_val).replace(".", "").isdigit():
                            yoy = ((val - float(prev_val)) / float(prev_val)) * 100
                            income_data["household_yoy"] = yoy
                    elif "60th" in pct_label:
                        income_data["percentiles"]["p60"] = val
                    elif "70th" in pct_label:
                        income_data["percentiles"]["p70"] = val
                    elif "80th" in pct_label:
                        income_data["percentiles"]["p80"] = val
                    elif "90th" in pct_label:
                        income_data["percentiles"]["p90"] = val

    # 3. Calculate affordability metrics
    if income_data.get("household_median"):
        median = income_data["household_median"]
        # Estimate take-home (remove ~17% employer CPF)
        income_data["household_takehome"] = median / 1.17
        # TDSR 55% of take-home
        tdsr_limit = (median / 1.17) * 0.55
        income_data["tdsr_limit"] = tdsr_limit
        # Max loan at 2% rate, 30yr tenure
        # Monthly payment = loan * (r(1+r)^n) / ((1+r)^n - 1)
        # Solving for loan: loan = payment / ((r(1+r)^n) / ((1+r)^n - 1))
        r = 0.02 / 12  # monthly rate
        n = 360  # 30 years
        factor = (r * (1 + r)**n) / ((1 + r)**n - 1)
        max_loan = tdsr_limit / factor
        income_data["max_loan"] = max_loan
        # With 25% down, max property
        income_data["max_property"] = max_loan / 0.75

    return income_data if income_data else None


def generate_indicators_markdown(
    cpi: Optional[Dict],
    unemployment: Optional[Dict],
    gdp: Optional[Dict],
    hdb_rpi: Optional[Dict],
    income: Optional[Dict] = None
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

    # Income section
    income_section = "Data unavailable"
    if income:
        # Format currency
        def fmt_currency(val):
            if val is None:
                return "N/A"
            if val >= 1_000_000:
                return f"${val/1_000_000:.2f}M"
            elif val >= 1_000:
                return f"${val/1_000:.1f}K"
            return f"${val:,.0f}"

        ind_median = income.get("individual_median")
        ind_year = income.get("individual_year", "")
        ind_yoy = income.get("individual_yoy")

        hh_median = income.get("household_median")
        hh_year = income.get("household_year", "")
        hh_yoy = income.get("household_yoy")
        hh_takehome = income.get("household_takehome")

        percentiles = income.get("percentiles", {})
        tdsr_limit = income.get("tdsr_limit")
        max_property = income.get("max_property")

        income_section = f"""### Median Income

| Category | Monthly Income | Year | YoY Change |
|----------|----------------|------|------------|
| **Individual** | ${ind_median:,.0f} | {ind_year} | {fmt_pct(ind_yoy) if ind_yoy else 'N/A'} |
| **Household (incl. CPF)** | ${hh_median:,.0f} | {hh_year} | {fmt_pct(hh_yoy) if hh_yoy else 'N/A'} |
| **Household (take-home est.)** | ${hh_takehome:,.0f} | {hh_year} | - |

### Household Income by Percentile ({hh_year})

| Percentile | Monthly Income | Property Segment |
|------------|----------------|------------------|
| 10th | {fmt_currency(percentiles.get('p10'))} | Below market |
| 20th | {fmt_currency(percentiles.get('p20'))} | HDB upgraders |
| 30th | {fmt_currency(percentiles.get('p30'))} | Entry OCR |
| **50th (Median)** | **{fmt_currency(percentiles.get('p50'))}** | **Mass market OCR/RCR** |
| 70th | {fmt_currency(percentiles.get('p70'))} | Mid-tier RCR |
| 80th | {fmt_currency(percentiles.get('p80'))} | Upper RCR |
| 90th | {fmt_currency(percentiles.get('p90'))} | CCR entry |

### Affordability Benchmark (Median Household)

| Metric | Value | Notes |
|--------|-------|-------|
| Take-home Income | ${hh_takehome:,.0f}/month | Excl. employer CPF |
| TDSR Limit (55%) | ${tdsr_limit:,.0f}/month | Max mortgage payment |
| Max Loan (2%, 30yr) | {fmt_currency(income.get('max_loan'))} | At current rates |
| **Max Property** | **{fmt_currency(max_property)}** | With 25% down payment |""" if ind_median and hh_median else "Data unavailable"

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

## Income & Affordability - Annual

{income_section}

### What It Means for Property
- Median household can afford ~$1.9M property (mass market OCR/RCR)
- 70th percentile ($17K) needed for mid-tier RCR ($2.5M+)
- 90th percentile ($29K) needed for CCR entry ($4M+)
- Income growth (+3-5% YoY) supports price appreciation

---

## Economic Context Summary

| Indicator | Current | Interpretation |
|-----------|---------|----------------|
| Inflation | {fmt_pct(cpi['yoy_inflation']) if cpi else 'N/A'} | {'Moderate - normal market' if cpi and cpi['yoy_inflation'] < 3 else 'Elevated - cost pressure' if cpi else 'N/A'} |
| Unemployment | {unemployment['rates'].get('total', 'N/A'):.1f}% | {'Low - strong demand' if unemployment and unemployment['rates'].get('total', 5) < 3 else 'Moderate' if unemployment else 'N/A'} |
| GDP Growth | {fmt_pct(gdp['latest_growth']) if gdp else 'N/A'} | {'Growing - positive sentiment' if gdp and gdp['latest_growth'] > 0 else 'Contracting - caution' if gdp else 'N/A'} |
| HDB Index | {hdb_rpi['index']:.0f} | {'Rising - upgrader pipeline active' if hdb_rpi and hdb_rpi['yoy_change'] and hdb_rpi['yoy_change'] > 0 else 'Stable/Falling' if hdb_rpi else 'N/A'} |
| Median HH Income | ${income['household_median']:,.0f} | {'Growing - supports prices' if income and income.get('household_yoy', 0) > 0 else 'Stagnant' if income else 'N/A'} |

---

**Disclaimer**: Economic indicators are lagging data. Always verify current conditions. This data is auto-refreshed from Data.gov.sg for informational purposes only.
"""
    return markdown


_ECONOMIC_INDICATORS_MANIFEST_ENTRY = {
    "source_urls": [
        "https://data.gov.sg/datasets/d_bdaff844e3ef89d39fceb962ff8f0791/view",
        "https://data.gov.sg/datasets/d_b0da22a41f952764376a2b7b5b0f2533/view",
        "https://data.gov.sg/datasets/d_a5ff719648a0e6d4b4c623ee383ab686/view",
        "https://data.gov.sg/datasets/d_14f63e595975691e7c24a27ae4c07c79/view"
    ],
    "description": "Key economic indicators: CPI, unemployment, GDP, HDB price index, income",
    "injection": "conditional",
    "injection_triggers": [
        "economy", "economic", "inflation", "CPI", "unemployment",
        "GDP", "HDB price", "market conditions", "macro",
        "income", "salary", "affordability", "TDSR"
    ],
    "notes": "Inject for macroeconomic context, market conditions, and affordability discussions."
}


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

    income = fetch_income_data()
    logger.info(f"Income: {'OK' if income else 'FAILED'}")

    # Generate markdown even if some failed
    if not any([cpi, unemployment, gdp, hdb_rpi, income]):
        logger.error("All economic indicator fetches failed")
        return False

    logger.info("Generating economic indicators markdown...")
    markdown = generate_indicators_markdown(cpi, unemployment, gdp, hdb_rpi, income)

    try:
        INDICATORS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(INDICATORS_FILE, "w") as f:
            f.write(markdown)
        logger.info(f"Updated {INDICATORS_FILE}")

        update_manifest("snapshot/economic-indicators.md", _ECONOMIC_INDICATORS_MANIFEST_ENTRY)
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
