"""
SORA Interest Rate Service - Auto-refresh from MAS/alternative sources

Fetches Singapore Overnight Rate Average (SORA) and updates AI context.
Primary source: MAS API (when available)
Fallback: housingloansg.com

SORA replaced SIBOR as of 1 Jan 2025 for all home loans.
"""

import logging
import re
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict
from bs4 import BeautifulSoup

from utils.manifest import update_manifest

logger = logging.getLogger(__name__)

# File paths
INTEREST_RATES_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "snapshot" / "interest-rates.md"

# URLs
HOUSINGLOAN_SG_URL = "https://housingloansg.com/hl/charts/sibor-sor-daily-chart"
MAS_SORA_URL = "https://eservices.mas.gov.sg/statistics/dir/DomesticInterestRates.aspx"


def fetch_sora_from_housingloansg() -> Optional[Dict]:
    """
    Fetch SORA rates from housingloansg.com (reliable alternative source).

    Returns:
        Dict with 1m, 3m, 6m SORA rates and date, or None if failed
    """
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
        response = requests.get(HOUSINGLOAN_SG_URL, headers=headers, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Find the SORA rates table or text
        # The page displays rates in a structured format
        text = soup.get_text()

        # Extract rates using regex patterns
        rates = {}

        # Pattern for compounded SORA rates
        # Looking for patterns like "1-Month: 1.16790%" or "1M SORA: 1.16%"
        patterns = {
            'sora_1m': r'1[- ]?(?:Month|M)[:\s]*(\d+\.\d+)%?',
            'sora_3m': r'3[- ]?(?:Month|M)[:\s]*(\d+\.\d+)%?',
            'sora_6m': r'6[- ]?(?:Month|M)[:\s]*(\d+\.\d+)%?',
        }

        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                rates[key] = float(match.group(1))

        # Try to find the date
        date_pattern = r'(?:as of|updated?:?)\s*(\w+\s+\d+,?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})'
        date_match = re.search(date_pattern, text, re.IGNORECASE)

        if date_match:
            rates['date'] = date_match.group(1)
        else:
            rates['date'] = datetime.now().strftime("%B %d, %Y")

        if rates.get('sora_1m') or rates.get('sora_3m'):
            logger.info(f"Fetched SORA rates from housingloansg.com: {rates}")
            return rates
        else:
            logger.warning("Could not parse SORA rates from housingloansg.com")
            return None

    except Exception as e:
        logger.error(f"Failed to fetch SORA from housingloansg.com: {e}")
        return None


def fetch_sora_rates() -> Optional[Dict]:
    """
    Fetch SORA rates from available sources.

    Returns:
        Dict with SORA rates or None if all sources failed
    """
    # Try housingloansg.com first (MAS is often under maintenance)
    rates = fetch_sora_from_housingloansg()

    if rates:
        return rates

    # Fallback: return cached/hardcoded rates with warning
    logger.warning("All SORA sources failed, using fallback rates")
    return {
        'sora_1m': 1.17,
        'sora_3m': 1.16,
        'sora_6m': 1.29,
        'date': 'January 2026 (fallback)',
        'fallback': True
    }


def generate_interest_rates_markdown(rates: Dict) -> str:
    """
    Generate interest-rates.md content from SORA data.
    """
    today = datetime.now().strftime("%Y-%m-%d")

    sora_1m = rates.get('sora_1m', 'N/A')
    sora_3m = rates.get('sora_3m', 'N/A')
    sora_6m = rates.get('sora_6m', 'N/A')
    rate_date = rates.get('date', 'Unknown')
    is_fallback = rates.get('fallback', False)

    # Format rates
    def fmt_rate(r):
        if isinstance(r, (int, float)):
            return f"{r:.2f}%"
        return str(r)

    markdown = f"""# Interest Rates (SORA)

**Last Updated**: {today}
**Rate Date**: {rate_date}
**Source**: MAS / housingloansg.com
**Auto-Refreshed**: Yes
{f"**Note**: Using fallback rates - live sources unavailable" if is_fallback else ""}

---

## Current SORA Rates

SORA (Singapore Overnight Rate Average) replaced SIBOR as of 1 January 2025 for all home loans.

| Tenor | Compounded SORA | Notes |
|-------|-----------------|-------|
| **1-Month** | {fmt_rate(sora_1m)} | Most common for floating rate loans |
| **3-Month** | {fmt_rate(sora_3m)} | Used by most banks |
| **6-Month** | {fmt_rate(sora_6m)} | Less volatile, used by some lenders |

---

## What SORA Means for Buyers

### Current Rate Environment
- 1M SORA at {fmt_rate(sora_1m)} is {"low" if isinstance(sora_1m, (int, float)) and sora_1m < 2 else "moderate" if isinstance(sora_1m, (int, float)) and sora_1m < 3.5 else "elevated"} by historical standards
- Typical bank spread: +0.75% to +1.00% above SORA
- **Effective mortgage rate**: ~{fmt_rate(sora_3m + 0.85 if isinstance(sora_3m, (int, float)) else 'N/A')} (3M SORA + 0.85% spread)

### Rate Outlook Context
- SORA tracks interbank overnight lending rates
- Lower SORA = lower mortgage payments = higher affordability
- Current rates are {"favorable" if isinstance(sora_1m, (int, float)) and sora_1m < 2.5 else "moderate"} for property purchases

---

## Historical Context

| Period | 3M SORA Range | Market Impact |
|--------|---------------|---------------|
| 2024 | 3.5% - 3.7% | High rates suppressed demand |
| 2025 H1 | 2.0% - 2.5% | Rates easing, demand recovering |
| 2025 H2 | 1.1% - 1.5% | Low rates supporting market |
| Current | {fmt_rate(sora_3m)} | {"Favorable" if isinstance(sora_3m, (int, float)) and sora_3m < 2 else "Moderate"} for buyers |

---

## Mortgage Affordability Example

For a $1.5M property with 75% LTV ($1.125M loan), 30-year tenure:

| Rate Scenario | Monthly Payment | vs Peak (3.7%) |
|---------------|-----------------|----------------|
| Current ({fmt_rate(sora_3m + 0.85 if isinstance(sora_3m, (int, float)) else 2.0)}) | ~${int(1125000 * ((sora_3m + 0.85)/100/12) * (1 + (sora_3m + 0.85)/100/12)**360 / ((1 + (sora_3m + 0.85)/100/12)**360 - 1)) if isinstance(sora_3m, (int, float)) else 'N/A':,} | -${int(1125000 * (3.7/100/12) * (1 + 3.7/100/12)**360 / ((1 + 3.7/100/12)**360 - 1) - 1125000 * ((sora_3m + 0.85)/100/12) * (1 + (sora_3m + 0.85)/100/12)**360 / ((1 + (sora_3m + 0.85)/100/12)**360 - 1)) if isinstance(sora_3m, (int, float)) else 'N/A':,}/month |
| Peak (4.55%) | ~$5,740 | Baseline |
| Low (2.0%) | ~$4,160 | -$1,580/month |

---

**Disclaimer**: Interest rates change daily. Always verify current rates with your bank before making decisions. This data is for informational purposes only.
"""
    return markdown


_SORA_MANIFEST_ENTRY = {
    "source_urls": [
        "https://www.mas.gov.sg/monetary-policy/sora",
        "https://housingloansg.com/hl/charts/sibor-sor-daily-chart"
    ],
    "description": "Current SORA interest rates and mortgage context",
    "injection": "conditional",
    "injection_triggers": [
        "interest rate", "SORA", "mortgage", "loan",
        "affordability", "financing"
    ],
    "notes": "Inject for affordability and financing discussions."
}


def refresh_sora_rates() -> bool:
    """
    Main function to refresh SORA interest rates.

    Returns:
        True if successful, False otherwise
    """
    logger.info("Fetching SORA rates...")
    rates = fetch_sora_rates()

    if not rates:
        logger.error("Failed to fetch SORA rates from all sources")
        return False

    logger.info(f"Generating interest rates markdown...")
    markdown = generate_interest_rates_markdown(rates)

    try:
        INTEREST_RATES_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(INTEREST_RATES_FILE, "w") as f:
            f.write(markdown)
        logger.info(f"Updated {INTEREST_RATES_FILE}")

        update_manifest("snapshot/interest-rates.md", _SORA_MANIFEST_ENTRY)
        return True

    except Exception as e:
        logger.error(f"Failed to write interest rates file: {e}")
        return False


# Allow running standalone
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    success = refresh_sora_rates()
    if success:
        print("SORA rates refreshed successfully!")
    else:
        print("Failed to refresh SORA rates")
        exit(1)
