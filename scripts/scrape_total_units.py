#!/usr/bin/env python3
"""
scrape_total_units.py - Scrape and cross-validate total units from multiple sources.

Sources (in order of reliability):
1. EdgeProp (JSON-LD structured data - most reliable)
2. 99.co (structured data)
3. PropertyGuru (project pages)
4. Stacked Homes (blog articles)

Cross-validation:
- Scrapes ALL sources for each project
- Compares results and calculates confidence
- Uses most common value when sources agree
- Flags conflicts for manual review

Usage:
    python scripts/scrape_total_units.py --list-missing     # List projects needing data
    python scripts/scrape_total_units.py --hot              # Focus on high-txn projects
    python scripts/scrape_total_units.py --limit 50         # Process 50 projects
    python scripts/scrape_total_units.py --project "NAME"   # Single project lookup
    python scripts/scrape_total_units.py --dry-run          # Preview without saving
"""

import re
import csv
import time
import random
import argparse
import requests
from pathlib import Path
from urllib.parse import quote_plus
from collections import Counter
from bs4 import BeautifulSoup

# Paths
SCRIPT_DIR = Path(__file__).parent
BACKEND_DIR = SCRIPT_DIR.parent / "backend"
CSV_PATH = BACKEND_DIR / "data" / "new_launch_units.csv"
OUTPUT_PATH = BACKEND_DIR / "data" / "new_launch_units_updated.csv"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Rate limiting
RATE_LIMIT_MIN = 1.5
RATE_LIMIT_MAX = 3.0


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def slugify(name: str) -> str:
    """Convert project name to URL slug."""
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


def normalize_name(name: str) -> str:
    """Normalize project name for matching."""
    name = name.upper()
    name = re.sub(r'\s*(RESIDENCES|RESIDENCE|CONDO|CONDOMINIUM|EC)\s*$', '', name)
    name = re.sub(r'[^\w\s]', '', name)
    return name.strip()


def names_match(name1: str, name2: str) -> bool:
    """Check if two project names match (fuzzy)."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)

    if n1 == n2:
        return True
    if n1 in n2 or n2 in n1:
        return True

    words1 = n1.split()
    words2 = n2.split()
    if words1 and words2 and words1[0] == words2[0]:
        return True

    return False


def fetch_url(url: str, silent: bool = True) -> str:
    """Fetch URL with error handling."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        if not silent:
            print(f"      [!] {e}")
    return ""


def rate_limit():
    """Apply rate limiting between requests."""
    time.sleep(random.uniform(RATE_LIMIT_MIN, RATE_LIMIT_MAX))


# =============================================================================
# SOURCE SCRAPERS - Each returns (units, confidence) or (None, 0)
# =============================================================================

def scrape_edgeprop(project_name: str) -> tuple[int | None, float]:
    """
    Scrape EdgeProp - most reliable source (JSON-LD structured data).
    Returns (units, confidence) where confidence is 0.9 for structured data.
    """
    slug = slugify(project_name)
    url = f"https://www.edgeprop.sg/condo-apartment/{slug}"
    html = fetch_url(url)

    if not html:
        return None, 0

    # Try JSON-LD structured data first (most reliable)
    json_ld_match = re.search(r'"Number of Units"[^}]*"value"\s*:\s*"([^"]+)"', html)
    if json_ld_match:
        value = json_ld_match.group(1)
        numbers = re.findall(r'([\d,]+)', value)
        if numbers:
            total = sum(int(n.replace(",", "")) for n in numbers)
            if 10 <= total <= 5000:
                return total, 0.9  # High confidence for structured data

    # Try table/text patterns
    text = re.sub(r"<[^>]+>", " ", html)
    patterns = [
        r"No\.\s*of\s*Units[:\s]+(\d{1,4})",
        r"Total\s+Units[:\s]+(\d{1,4})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            units = int(match.group(1))
            if 10 <= units <= 5000:
                return units, 0.8

    return None, 0


def scrape_99co(project_name: str) -> tuple[int | None, float]:
    """
    Scrape 99.co - good structured data.
    Returns (units, confidence).
    """
    slug = slugify(project_name)
    url = f"https://www.99.co/singapore/condos-apartments/{slug}"
    html = fetch_url(url)

    if not html:
        return None, 0

    # Try structured data
    units_match = re.search(r'"totalUnits"\s*:\s*(\d+)', html)
    if units_match:
        units = int(units_match.group(1))
        if 10 <= units <= 5000:
            return units, 0.85

    # Try page text with project name context
    name_upper = normalize_name(project_name)
    first_word = name_upper.split()[0] if name_upper else ""

    if first_word and first_word in html.upper():
        # Look for units near project name
        patterns = [
            r"(\d{2,4})\s*(?:residential\s+)?units",
            r"total\s+(?:of\s+)?(\d{2,4})\s*units",
        ]
        for pattern in patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                units = int(match.group(1))
                if 10 <= units <= 5000:
                    return units, 0.7

    return None, 0


def scrape_propertyguru(project_name: str) -> tuple[int | None, float]:
    """
    Scrape PropertyGuru - often blocked but worth trying.
    Returns (units, confidence).
    """
    slug = slugify(project_name)
    url = f"https://www.propertyguru.com.sg/project/{slug}"
    html = fetch_url(url)

    if not html:
        return None, 0

    # PropertyGuru often has structured data
    units_match = re.search(r'"numberOfUnits"\s*:\s*"?(\d+)"?', html)
    if units_match:
        units = int(units_match.group(1))
        if 10 <= units <= 5000:
            return units, 0.85

    # Try text patterns
    text = re.sub(r"<[^>]+>", " ", html)
    patterns = [
        r"Total\s+Units[:\s]+(\d{1,4})",
        r"(\d{2,4})\s*units\s*(?:in\s+)?total",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            units = int(match.group(1))
            if 10 <= units <= 5000:
                return units, 0.75

    return None, 0


def scrape_stacked_homes(project_name: str) -> tuple[int | None, float]:
    """
    Scrape Stacked Homes blog articles.
    Returns (units, confidence) - lower confidence as it's from articles.
    """
    search_url = f"https://stackedhomes.com/?s={quote_plus(project_name)}"
    html = fetch_url(search_url)

    if not html:
        return None, 0

    soup = BeautifulSoup(html, "html.parser")
    articles = soup.find_all("a", href=True)

    for article in articles:
        href = article.get("href", "")
        link_text = article.get_text()

        if not names_match(link_text, project_name):
            continue
        if "stackedhomes.com" not in href:
            continue

        # Fetch the article
        rate_limit()
        article_html = fetch_url(href)
        if not article_html:
            continue

        # Look for units in article text near project name
        name_upper = normalize_name(project_name)
        first_word = name_upper.split()[0] if name_upper else ""

        if first_word and first_word in article_html.upper():
            patterns = [
                r"(\d{2,4})\s*(?:residential\s+)?units",
                r"total\s+(?:of\s+)?(\d{2,4})\s*units",
                r"comprises?\s+(\d{2,4})\s*units",
            ]
            for pattern in patterns:
                match = re.search(pattern, article_html, re.IGNORECASE)
                if match:
                    units = int(match.group(1))
                    if 50 <= units <= 5000:
                        return units, 0.6  # Lower confidence for blog

        break  # Only check first matching article

    return None, 0


# =============================================================================
# CROSS-VALIDATION LOGIC
# =============================================================================

def cross_validate_sources(results: dict[str, tuple[int | None, float]]) -> dict:
    """
    Cross-validate results from multiple sources.

    Returns:
        {
            'units': int or None,
            'confidence': float (0-1),
            'sources': list of source names that agree,
            'all_values': dict of source -> value,
            'status': 'confirmed' | 'mismatch' | 'single' | 'none'
        }
    """
    # Filter to sources that found data
    found = {k: v for k, v in results.items() if v[0] is not None}

    if not found:
        return {
            'units': None,
            'confidence': 0,
            'sources': [],
            'all_values': {},
            'status': 'none'
        }

    # Get all values
    all_values = {k: v[0] for k, v in found.items()}
    values = list(all_values.values())

    if len(found) == 1:
        source, (units, conf) = list(found.items())[0]
        return {
            'units': units,
            'confidence': conf * 0.8,  # Reduce confidence for single source
            'sources': [source],
            'all_values': all_values,
            'status': 'single'
        }

    # Check for agreement (within 5% tolerance for rounding differences)
    def values_agree(v1, v2, tolerance=0.05):
        if v1 == v2:
            return True
        diff = abs(v1 - v2) / max(v1, v2)
        return diff <= tolerance

    # Find the most common value (or cluster)
    value_counts = Counter(values)
    most_common_value, count = value_counts.most_common(1)[0]

    # Find all sources that agree with the most common value
    agreeing_sources = [k for k, v in all_values.items()
                        if values_agree(v, most_common_value)]

    if len(agreeing_sources) >= 3:
        # High confidence - 3+ sources agree
        return {
            'units': most_common_value,
            'confidence': 0.95,
            'sources': agreeing_sources,
            'all_values': all_values,
            'status': 'confirmed'
        }
    elif len(agreeing_sources) >= 2:
        # Medium confidence - 2 sources agree
        return {
            'units': most_common_value,
            'confidence': 0.85,
            'sources': agreeing_sources,
            'all_values': all_values,
            'status': 'confirmed'
        }
    else:
        # Sources disagree - use highest confidence source
        best_source = max(found.items(), key=lambda x: x[1][1])
        return {
            'units': best_source[1][0],
            'confidence': 0.5,
            'sources': [best_source[0]],
            'all_values': all_values,
            'status': 'mismatch'
        }


def scrape_project(project_name: str, verbose: bool = True) -> dict:
    """
    Scrape a project from all sources and cross-validate.

    Returns dict with units, confidence, sources, status.
    """
    if verbose:
        print(f"    Scraping sources...")

    results = {}

    # 1. EdgeProp (most reliable)
    if verbose:
        print(f"      EdgeProp...", end=" ", flush=True)
    units, conf = scrape_edgeprop(project_name)
    results['EdgeProp'] = (units, conf)
    if verbose:
        print(f"{units or '-'}")
    rate_limit()

    # 2. 99.co
    if verbose:
        print(f"      99.co...", end=" ", flush=True)
    units, conf = scrape_99co(project_name)
    results['99.co'] = (units, conf)
    if verbose:
        print(f"{units or '-'}")
    rate_limit()

    # 3. PropertyGuru
    if verbose:
        print(f"      PropertyGuru...", end=" ", flush=True)
    units, conf = scrape_propertyguru(project_name)
    results['PropertyGuru'] = (units, conf)
    if verbose:
        print(f"{units or '-'}")
    rate_limit()

    # 4. Stacked Homes (slowest - fetches article)
    if verbose:
        print(f"      StackedHomes...", end=" ", flush=True)
    units, conf = scrape_stacked_homes(project_name)
    results['StackedHomes'] = (units, conf)
    if verbose:
        print(f"{units or '-'}")

    # Cross-validate
    validated = cross_validate_sources(results)

    if verbose:
        status_icon = {
            'confirmed': '✓',
            'single': '~',
            'mismatch': '⚠',
            'none': '✗'
        }[validated['status']]

        if validated['units']:
            sources_str = ", ".join(validated['sources'])
            print(f"    {status_icon} Result: {validated['units']} units ({validated['confidence']:.0%} confidence)")
            print(f"      Agreeing: {sources_str}")
            if validated['status'] == 'mismatch':
                print(f"      All values: {validated['all_values']}")
        else:
            print(f"    {status_icon} No data found")

    return validated


# =============================================================================
# DATA LOADING
# =============================================================================

def load_existing_csv() -> dict[str, dict]:
    """Load existing CSV into dict keyed by project name."""
    projects = {}
    if CSV_PATH.exists():
        with open(CSV_PATH, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                projects[row["project_name"].upper().strip()] = row
    return projects


def get_hot_missing_projects(min_txns: int = 15) -> list[tuple[str, int]]:
    """Get projects with >min_txns transactions that are missing total_units."""
    import os
    from sqlalchemy import create_engine, text

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        try:
            import sys
            sys.path.insert(0, str(BACKEND_DIR))
            from config import Config
            database_url = Config.SQLALCHEMY_DATABASE_URI
        except Exception as exc:
            raise RuntimeError("DATABASE_URL not set") from exc

    engine = create_engine(database_url)
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT project_name, COUNT(*) as txn_count
            FROM transactions
            WHERE project_name IS NOT NULL
              AND COALESCE(is_outlier, false) = false
            GROUP BY project_name
            HAVING COUNT(*) > :min_txns
            ORDER BY COUNT(*) DESC
        """), {"min_txns": min_txns}).fetchall()

        hot_projects = [(r[0], r[1]) for r in result]

    # Read existing CSV
    csv_projects = set()
    if CSV_PATH.exists():
        with open(CSV_PATH, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("total_units"):
                    csv_projects.add(row["project_name"].upper().strip())

    # Filter to missing only
    missing = [(p, c) for p, c in hot_projects if p.upper().strip() not in csv_projects]
    return missing


def get_all_missing_projects() -> list[str]:
    """Get all projects missing from CSV."""
    import os
    from sqlalchemy import create_engine, text

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        try:
            import sys
            sys.path.insert(0, str(BACKEND_DIR))
            from config import Config
            database_url = Config.SQLALCHEMY_DATABASE_URI
        except Exception as exc:
            raise RuntimeError("DATABASE_URL not set") from exc

    engine = create_engine(database_url)
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT project_name
            FROM transactions
            WHERE project_name IS NOT NULL
            ORDER BY project_name
        """)).fetchall()
        all_projects = [r[0] for r in result]

    # Read existing CSV
    existing = load_existing_csv()

    missing = []
    for project in all_projects:
        key = project.upper().strip()
        if key not in existing or not existing[key].get("total_units"):
            missing.append(project)

    return missing


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Scrape and cross-validate total units")
    parser.add_argument("--project", help="Single project to look up")
    parser.add_argument("--limit", type=int, default=10, help="Max projects to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    parser.add_argument("--list-missing", action="store_true", help="Just list missing projects")
    parser.add_argument("--hot", action="store_true", help="Focus on hot projects (>15 txns)")
    parser.add_argument("--min-txns", type=int, default=15, help="Min transactions for hot projects")
    parser.add_argument("--all", action="store_true", help="Process all missing projects")
    args = parser.parse_args()

    print("="*60)
    print("CROSS-VALIDATED UNIT SCRAPER")
    print("="*60)
    print("Sources: EdgeProp, 99.co, PropertyGuru, Stacked Homes")
    print()

    if args.project:
        # Single project lookup
        print(f"Project: {args.project}")
        print("-"*60)
        result = scrape_project(args.project)
        return

    print("Loading existing data...")
    existing = load_existing_csv()
    print(f"  Found {len(existing)} projects in CSV")

    if args.hot:
        print(f"\nFetching hot projects (>{args.min_txns} transactions)...")
        hot_missing = get_hot_missing_projects(args.min_txns)
        print(f"  Found {len(hot_missing)} hot projects missing total_units")

        if args.list_missing:
            print("\nHot projects missing total_units:")
            for p, c in hot_missing[:100]:
                print(f"  {c:4d} txns - {p}")
            if len(hot_missing) > 100:
                print(f"  ... and {len(hot_missing) - 100} more")
            return

        to_process = [p for p, c in hot_missing[:args.limit]]
    else:
        print("\nFetching missing projects...")
        missing = get_all_missing_projects()
        print(f"  Found {len(missing)} projects missing total_units")

        if args.list_missing:
            print("\nMissing projects:")
            for p in missing[:100]:
                print(f"  - {p}")
            if len(missing) > 100:
                print(f"  ... and {len(missing) - 100} more")
            return

        if args.all:
            to_process = missing
        else:
            to_process = missing[:args.limit]

    if not to_process:
        print("\nNo projects to process.")
        return

    print(f"\nProcessing {len(to_process)} projects...")
    print("="*60)

    results = []
    stats = {'confirmed': 0, 'single': 0, 'mismatch': 0, 'none': 0}

    for i, project in enumerate(to_process, 1):
        print(f"\n[{i}/{len(to_process)}] {project}")
        result = scrape_project(project)

        stats[result['status']] += 1

        if result['units']:
            results.append({
                "project_name": project,
                "total_units": result['units'],
                "confidence": result['confidence'],
                "sources": ", ".join(result['sources']),
                "status": result['status'],
                "all_values": str(result['all_values']),
            })

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"  ✓ Confirmed (2+ agree): {stats['confirmed']}")
    print(f"  ~ Single source:        {stats['single']}")
    print(f"  ⚠ Mismatch:             {stats['mismatch']}")
    print(f"  ✗ Not found:            {stats['none']}")
    print(f"\n  Total found: {len(results)}/{len(to_process)}")

    if results:
        print(f"\n{'Project':<35} {'Units':>6} {'Conf':>6} {'Status':<10} {'Sources'}")
        print("-"*80)
        for r in results:
            print(f"{r['project_name'][:34]:<35} {r['total_units']:>6} {r['confidence']:>5.0%} {r['status']:<10} {r['sources']}")

    if results and not args.dry_run:
        print(f"\nUpdating CSV...")
        for r in results:
            key = r["project_name"].upper().strip()
            if key in existing:
                existing[key]["total_units"] = r["total_units"]
                existing[key]["source"] = r["sources"]
            else:
                existing[key] = {
                    "project_name": r["project_name"],
                    "total_units": r["total_units"],
                    "developer": "",
                    "tenure": "",
                    "top": "",
                    "district": "",
                    "source": r["sources"],
                }

        # Write updated CSV
        with open(OUTPUT_PATH, "w", newline="") as f:
            fieldnames = ["project_name", "total_units", "developer", "tenure", "top", "district", "source"]
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row in sorted(existing.values(), key=lambda x: x["project_name"]):
                writer.writerow(row)

        print(f"  Saved to: {OUTPUT_PATH}")
        print(f"  Review and rename to {CSV_PATH.name} when ready")

    if args.dry_run:
        print(f"\n(Dry run - no changes made)")


if __name__ == "__main__":
    main()
