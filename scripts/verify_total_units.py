#!/usr/bin/env python3
"""
================================================================================
DEPRECATED - Will be consolidated into backend/data_health/external.py
================================================================================

This script is deprecated and will be removed in a future PR.

The scraper functions will be moved to:
    backend/data_health/external.py

For now, this script still works but will print a deprecation warning.
After migration, use:
    python scripts/check_data_health.py --verify-external  (Phase 2)

================================================================================

verify_total_units.py - Multi-source verification for project total units.

Uses tier-ranked sources:
- Tier B (Institutional): EdgeProp, 99.co, SRX, NewLaunchesCondo
- Tier C (Content): StackedHomes, PLB Insights

Confidence scoring:
- 3+ Tier B sources agree: 95% (auto-confirm)
- 2 Tier B sources agree: 85% (high confidence)
- 1 Tier B + 1 Tier C agree: 75% (medium confidence)
- Single source: 60% (low confidence)
- Sources disagree: 40% (needs review)

Usage:
    python scripts/verify_total_units.py --limit 50
    python scripts/verify_total_units.py --project "NORMANTON PARK"
    python scripts/verify_total_units.py --all
"""

import warnings
warnings.warn(
    "\n\n"
    "=" * 70 + "\n"
    "DEPRECATED: verify_total_units.py\n"
    "=" * 70 + "\n"
    "Will be consolidated into backend/data_health/external.py\n"
    "This script will be removed in a future PR.\n"
    "=" * 70 + "\n",
    DeprecationWarning,
    stacklevel=2
)

import csv
import re
import time
import random
import argparse
import requests
from pathlib import Path
from collections import Counter
from dataclasses import dataclass
from typing import Optional, Dict, List, Tuple

# Paths
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
CSV_PATH = BACKEND_DIR / "data" / "new_launch_units.csv"
OUTPUT_PATH = BACKEND_DIR / "data" / "new_launch_units_verified.csv"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Rate limiting
RATE_LIMIT = (1.0, 2.0)  # min, max seconds


@dataclass
class SourceResult:
    """Result from a single source."""
    source: str
    tier: str  # 'B' or 'C'
    units: Optional[int]
    url: str
    confidence: float  # Source-level confidence


def slugify(name: str) -> str:
    """Convert project name to URL slug."""
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_]+", "-", slug)
    return re.sub(r"-+", "-", slug).strip("-")


def rate_limit():
    """Apply rate limiting."""
    time.sleep(random.uniform(*RATE_LIMIT))


def fetch(url: str, timeout: int = 10) -> str:
    """Fetch URL with error handling."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=timeout)
        if resp.status_code == 200:
            return resp.text
    except:
        pass
    return ""


# =============================================================================
# TIER B SOURCES
# =============================================================================

def scrape_edgeprop(name: str) -> SourceResult:
    """EdgeProp - Most reliable Tier B source."""
    slug = slugify(name)
    url = f"https://www.edgeprop.sg/condo-apartment/{slug}"
    html = fetch(url)

    units = None
    if html:
        # Try JSON-LD structured data
        match = re.search(r'"Number of Units"[^}]*"value"\s*:\s*"([^"]+)"', html)
        if match:
            value = match.group(1)
            nums = re.findall(r'([\d,]+)', value)
            if nums:
                total = sum(int(n.replace(",", "")) for n in nums)
                if 10 <= total <= 5000:
                    units = total

    return SourceResult("EdgeProp", "B", units, url, 0.9)


def scrape_99co(name: str) -> SourceResult:
    """99.co - Good Tier B source."""
    slug = slugify(name)
    url = f"https://www.99.co/singapore/condos-apartments/{slug}"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'(\d{2,4})\s*residential\s*units',
            r'comprises?\s*(\d{2,4})\s*units',
            r'total\s*of\s*(\d{2,4})\s*units',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("99.co", "B", units, url, 0.85)


def scrape_srx(name: str) -> SourceResult:
    """SRX - Tier B property portal."""
    slug = slugify(name)
    url = f"https://www.srx.com.sg/condo/{slug}"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'"totalUnits"[:\s]*(\d+)',
            r'>(\d{2,4})\s*units<',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("SRX", "B", units, url, 0.8)


def scrape_newlaunchescondo(name: str) -> SourceResult:
    """NewLaunchesCondo.sg - New launch focused Tier B."""
    slug = slugify(name)
    url = f"https://newlaunchescondo.sg/{slug}/"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'>(\d{2,4})\s*Units<',
            r'(\d{2,4})\s*residential\s*units',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("NewLaunchesCondo", "B", units, url, 0.8)


def scrape_showflat(name: str) -> SourceResult:
    """ShowFlat.sg - New launch showflat portal."""
    slug = slugify(name)
    url = f"https://www.showflat.sg/{slug}/"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'(\d{2,4})\s*(?:residential\s*)?units',
            r'Units[:\s]*(\d{2,4})',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("ShowFlat", "B", units, url, 0.75)


def scrape_era(name: str) -> SourceResult:
    """ERA Singapore - Real estate agency."""
    slug = slugify(name)
    # Try multiple URL patterns
    urls = [
        f"https://www.era.com.sg/new-launch/{slug}/",
        f"https://www.era.com.sg/property/{slug}/",
    ]

    units = None
    used_url = urls[0]

    for url in urls:
        html = fetch(url)
        if html and len(html) > 5000:  # Valid response
            used_url = url
            patterns = [
                r'Total\s*Units[:\s]*(\d+)',
                r'(\d{2,4})\s*(?:residential\s*)?units',
                r'"units"[:\s]*(\d+)',
            ]
            for p in patterns:
                match = re.search(p, html, re.I)
                if match:
                    val = int(match.group(1))
                    if 10 <= val <= 5000:
                        units = val
                        break
            if units:
                break

    return SourceResult("ERA", "B", units, used_url, 0.75)


def scrape_propnex(name: str) -> SourceResult:
    """PropNex - Large real estate agency."""
    slug = slugify(name)
    url = f"https://www.propnex.com/new-launch/{slug}"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'(\d{2,4})\s*(?:residential\s*)?units',
            r'"totalUnits"[:\s]*(\d+)',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("PropNex", "B", units, url, 0.75)


def scrape_orangetee(name: str) -> SourceResult:
    """OrangeTee - Real estate agency."""
    slug = slugify(name)
    url = f"https://www.orangetee.com/new-launch/{slug}"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'(\d{2,4})\s*units',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("OrangeTee", "B", units, url, 0.7)


def scrape_huttons(name: str) -> SourceResult:
    """Huttons - Real estate agency."""
    slug = slugify(name)
    url = f"https://www.huttons.com.sg/new-launch/{slug}"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'(\d{2,4})\s*(?:residential\s*)?units',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("Huttons", "B", units, url, 0.7)


# =============================================================================
# TIER C SOURCES
# =============================================================================

def scrape_stackedhomes(name: str) -> SourceResult:
    """StackedHomes - Tier C blog/reviews."""
    search_url = f"https://stackedhomes.com/?s={name.replace(' ', '+')}"
    html = fetch(search_url)

    units = None
    url = search_url

    if html:
        # Find article links
        articles = re.findall(
            r'href="(https://stackedhomes\.com/editorial/[^"]*)"',
            html, re.I
        )
        # Check if project name is in any article URL
        for article_url in articles[:3]:
            if slugify(name.split()[0]) in article_url.lower():
                rate_limit()
                article_html = fetch(article_url)
                if article_html:
                    patterns = [
                        r'(\d{2,4})\s*residential\s*units',
                        r'comprises?\s*(\d{2,4})\s*units',
                        r'total\s*of\s*(\d{2,4})\s*units',
                    ]
                    for p in patterns:
                        match = re.search(p, article_html, re.I)
                        if match:
                            val = int(match.group(1))
                            if 50 <= val <= 5000:
                                units = val
                                url = article_url
                                break
                    if units:
                        break

    return SourceResult("StackedHomes", "C", units, url, 0.7)


def scrape_plbinsights(name: str) -> SourceResult:
    """PLB Insights - Property analytics blog."""
    # Search their site
    search_url = f"https://plbinsights.com/?s={name.replace(' ', '+')}"
    html = fetch(search_url)

    units = None
    url = search_url

    if html and name.upper().split()[0] in html.upper():
        patterns = [
            r'(\d{2,4})\s*(?:residential\s*)?units',
            r'Total\s*Units[:\s]*(\d+)',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 50 <= val <= 5000:
                    units = val
                    break

    return SourceResult("PLBInsights", "C", units, url, 0.65)


def scrape_propertysoul(name: str) -> SourceResult:
    """PropertySoul - Property blog."""
    search_url = f"https://www.propertysoul.com/?s={name.replace(' ', '+')}"
    html = fetch(search_url)

    units = None
    url = search_url

    if html and name.upper().split()[0] in html.upper():
        patterns = [
            r'(\d{2,4})\s*(?:residential\s*)?units',
            r'comprises?\s*(\d{2,4})\s*units',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 50 <= val <= 5000:
                    units = val
                    break

    return SourceResult("PropertySoul", "C", units, url, 0.6)


def scrape_newlaunchreview(name: str) -> SourceResult:
    """NewLaunchReview - New launch reviews."""
    slug = slugify(name)
    url = f"https://www.newlaunchreview.com/{slug}/"
    html = fetch(url)

    units = None
    if html:
        patterns = [
            r'Total\s*Units[:\s]*(\d+)',
            r'(\d{2,4})\s*(?:residential\s*)?units',
        ]
        for p in patterns:
            match = re.search(p, html, re.I)
            if match:
                val = int(match.group(1))
                if 10 <= val <= 5000:
                    units = val
                    break

    return SourceResult("NewLaunchReview", "C", units, url, 0.65)


# =============================================================================
# CROSS-VALIDATION
# =============================================================================

def verify_project(name: str, current_units: int, verbose: bool = True) -> Dict:
    """
    Verify a project against all tier sources.

    Returns dict with:
        - status: 'high_conf', 'medium_conf', 'low_conf', 'mismatch', 'unverified'
        - confidence: 0.0 to 1.0
        - sources: list of agreeing source names
        - all_values: dict of source -> units
        - suggested: suggested correct value if mismatch
    """
    results: List[SourceResult] = []

    if verbose:
        print(f"    Scraping sources for {name[:30]}...")

    # Tier B sources (higher weight) - Primary sources
    scrapers_b_primary = [
        ("EdgeProp", scrape_edgeprop),
        ("99.co", scrape_99co),
        ("SRX", scrape_srx),
        ("NewLaunchesCondo", scrape_newlaunchescondo),
    ]

    # Tier B sources - Secondary (agencies)
    scrapers_b_secondary = [
        ("ShowFlat", scrape_showflat),
        ("ERA", scrape_era),
        ("PropNex", scrape_propnex),
        ("OrangeTee", scrape_orangetee),
        ("Huttons", scrape_huttons),
    ]

    # Tier C sources (blogs/content)
    scrapers_c = [
        ("StackedHomes", scrape_stackedhomes),
        ("PLBInsights", scrape_plbinsights),
        ("PropertySoul", scrape_propertysoul),
        ("NewLaunchReview", scrape_newlaunchreview),
    ]

    # Run primary Tier B scrapers first
    for src_name, scraper in scrapers_b_primary:
        if verbose:
            print(f"      {src_name}...", end=" ", flush=True)
        result = scraper(name)
        results.append(result)
        if verbose:
            print(f"{result.units or '-'}")
        rate_limit()

    # Check how many primary sources found data
    tier_b_found = sum(1 for r in results if r.units is not None)

    # If less than 2 primary sources, try secondary Tier B
    if tier_b_found < 2:
        for src_name, scraper in scrapers_b_secondary[:3]:  # Limit to 3 secondary
            if verbose:
                print(f"      {src_name}...", end=" ", flush=True)
            result = scraper(name)
            results.append(result)
            if verbose:
                print(f"{result.units or '-'}")
            rate_limit()

    # Update count
    tier_b_found = sum(1 for r in results if r.units is not None and r.tier == 'B')

    # If still less than 2, try Tier C sources
    if tier_b_found < 2:
        for src_name, scraper in scrapers_c[:2]:  # Limit to 2 Tier C
            if verbose:
                print(f"      {src_name}...", end=" ", flush=True)
            result = scraper(name)
            results.append(result)
            if verbose:
                print(f"{result.units or '-'}")
            rate_limit()

    # Analyze results
    found = [r for r in results if r.units is not None]
    all_values = {r.source: r.units for r in found}

    if not found:
        return {
            'status': 'unverified',
            'confidence': 0.0,
            'sources': [],
            'all_values': {},
            'suggested': None,
        }

    # Check agreement (5% tolerance)
    def agrees(v1, v2, tolerance=0.05):
        if v1 == v2:
            return True
        return abs(v1 - v2) / max(v1, v2) <= tolerance

    # Find consensus value
    values = [r.units for r in found]
    value_counts = Counter(values)
    consensus_value, consensus_count = value_counts.most_common(1)[0]

    # Find sources that agree with consensus
    agreeing = [r for r in found if agrees(r.units, consensus_value)]
    agreeing_b = [r for r in agreeing if r.tier == 'B']
    agreeing_c = [r for r in agreeing if r.tier == 'C']

    # Check if current value matches consensus
    current_matches = agrees(current_units, consensus_value) if current_units else False

    # Determine confidence
    if len(agreeing_b) >= 3:
        status = 'high_conf'
        confidence = 0.95
    elif len(agreeing_b) >= 2:
        status = 'high_conf' if current_matches else 'mismatch'
        confidence = 0.90 if current_matches else 0.85
    elif len(agreeing_b) == 1 and len(agreeing_c) >= 1:
        status = 'medium_conf' if current_matches else 'mismatch'
        confidence = 0.80 if current_matches else 0.70
    elif len(agreeing_b) == 1:
        status = 'low_conf' if current_matches else 'mismatch'
        confidence = 0.70 if current_matches else 0.50
    elif len(found) > 0:
        status = 'low_conf'
        confidence = 0.50
    else:
        status = 'unverified'
        confidence = 0.0

    return {
        'status': status,
        'confidence': confidence,
        'sources': [r.source for r in agreeing],
        'all_values': all_values,
        'suggested': consensus_value if not current_matches else None,
    }


def load_csv() -> List[Dict]:
    """Load existing CSV data."""
    with open(CSV_PATH, 'r') as f:
        return list(csv.DictReader(f))


def save_results(results: List[Dict]):
    """Save verification results."""
    fieldnames = [
        'project_name', 'total_units', 'developer', 'tenure', 'top', 'district', 'source',
        'verification_status', 'confidence', 'verified_sources', 'all_values', 'suggested_units'
    ]

    with open(OUTPUT_PATH, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(results)


def main():
    parser = argparse.ArgumentParser(description="Multi-source verification for total units")
    parser.add_argument("--limit", type=int, default=20, help="Max projects to verify")
    parser.add_argument("--project", help="Verify single project")
    parser.add_argument("--all", action="store_true", help="Verify all projects")
    parser.add_argument("--quiet", action="store_true", help="Less verbose output")
    args = parser.parse_args()

    print("=" * 70)
    print("MULTI-SOURCE TOTAL UNITS VERIFICATION")
    print("=" * 70)
    print("Tier B: EdgeProp, 99.co, SRX, NewLaunchesCondo")
    print("Tier C: StackedHomes (if needed)")
    print()

    rows = load_csv()

    if args.project:
        # Single project
        matches = [r for r in rows if args.project.upper() in r['project_name'].upper()]
        if not matches:
            print(f"Project '{args.project}' not found")
            return
        rows = matches[:1]
    elif args.all:
        pass  # Use all rows
    else:
        rows = rows[:args.limit]

    print(f"Verifying {len(rows)} projects...")
    print("-" * 70)

    results = []
    stats = {'high_conf': 0, 'medium_conf': 0, 'low_conf': 0, 'mismatch': 0, 'unverified': 0}

    for i, row in enumerate(rows, 1):
        name = row['project_name']
        current = int(row['total_units']) if row.get('total_units') else 0

        print(f"\n[{i}/{len(rows)}] {name}")
        print(f"    Current: {current} units")

        result = verify_project(name, current, verbose=not args.quiet)
        stats[result['status']] += 1

        # Update row
        row['verification_status'] = result['status']
        row['confidence'] = result['confidence']
        row['verified_sources'] = ','.join(result['sources'])
        row['all_values'] = str(result['all_values'])
        row['suggested_units'] = result['suggested'] or ''

        results.append(row)

        icon = {
            'high_conf': '✓✓',
            'medium_conf': '✓',
            'low_conf': '~',
            'mismatch': '⚠',
            'unverified': '-'
        }[result['status']]

        print(f"    {icon} {result['status']} ({result['confidence']:.0%})")
        if result['all_values']:
            print(f"    Sources: {result['all_values']}")
        if result['suggested']:
            print(f"    ⚠ SUGGESTED: {result['suggested']} units")

    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"✓✓ High confidence:   {stats['high_conf']}")
    print(f"✓  Medium confidence: {stats['medium_conf']}")
    print(f"~  Low confidence:    {stats['low_conf']}")
    print(f"⚠  Mismatch:          {stats['mismatch']}")
    print(f"-  Unverified:        {stats['unverified']}")

    # Save
    save_results(results)
    print(f"\nSaved to: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
