#!/usr/bin/env python3
"""
Simple script to scrape total units for projects from property websites.
Scrapes EdgeProp, 99.co, and PropertyGuru for unit counts.

Usage:
    python scripts/scrape_total_units.py                    # Process all missing
    python scripts/scrape_total_units.py --project "PARC CLEMATIS"  # Single project
    python scripts/scrape_total_units.py --limit 50         # Process 50 projects
    python scripts/scrape_total_units.py --dry-run          # Preview without saving
    python scripts/scrape_total_units.py --list-missing     # List projects needing data
"""

import re
import csv
import time
import random
import argparse
import requests
from pathlib import Path
from urllib.parse import quote_plus, quote

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

# Patterns to extract total units
UNIT_PATTERNS = [
    r"total\s+(?:of\s+)?(\d{1,4})\s*(?:residential\s+)?units",
    r"(\d{1,4})\s*(?:residential\s+)?units",
    r"comprises?\s+(\d{1,4})\s*units",
    r"(\d{1,4})\s*(?:condo|condominium)\s*units",
    r"(\d{1,4})-unit\s+(?:condo|development)",
    r"development\s+(?:of|with)\s+(\d{1,4})\s*units",
    r"No\.\s*of\s*Units[:\s]+(\d{1,4})",
    r"Units[:\s]+(\d{1,4})",
]


def slugify(name: str) -> str:
    """Convert project name to URL slug."""
    # Remove special characters, replace spaces with hyphens
    slug = re.sub(r"[^\w\s-]", "", name.lower())
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug


def fetch_url(url: str) -> str:
    """Fetch URL with error handling."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        if resp.status_code == 200:
            return resp.text
    except Exception as e:
        pass
    return ""


def extract_units_from_html(html: str, source: str = "") -> int | None:
    """Extract total units from HTML content."""
    import json

    # Try JSON-LD structured data first (most reliable)
    # EdgeProp uses: "name":"Number of Units","value":"1,450 condos and 18 landed units"
    json_ld_match = re.search(r'"Number of Units"[^}]*"value"\s*:\s*"([^"]+)"', html)
    if json_ld_match:
        value = json_ld_match.group(1)
        # Extract all numbers and sum them (e.g., "1,450 condos and 18 landed")
        numbers = re.findall(r'([\d,]+)', value)
        if numbers:
            total = sum(int(n.replace(",", "")) for n in numbers)
            if 5 <= total <= 5000:
                return total

    # Try 99.co pattern: "1,468 units" in structured data or text
    units_match = re.search(r'"totalUnits"\s*:\s*(\d+)', html)
    if units_match:
        units = int(units_match.group(1))
        if 5 <= units <= 5000:
            return units

    # Try common patterns in page text (less reliable, so be more specific)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"\s+", " ", text)

    # Look for "X units" in context of total/development (not "for sale/rent")
    specific_patterns = [
        r"(?:total|comprises?|consisting of|development of)\s+(\d{1,4})\s*(?:residential\s+)?units",
        r"(\d{1,4})\s*(?:residential\s+)?units\s+(?:in total|total)",
        r"No\.\s*of\s*Units[:\s]+(\d{1,4})",
    ]

    for pattern in specific_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            units = int(match)
            if 5 <= units <= 5000:
                return units

    return None


def try_edgeprop(project_name: str) -> tuple[int | None, str]:
    """Try scraping from EdgeProp."""
    slug = slugify(project_name)
    url = f"https://www.edgeprop.sg/condo-apartment/{slug}"
    html = fetch_url(url)
    if html:
        units = extract_units_from_html(html)
        if units:
            return units, "EdgeProp"
    return None, ""


def try_99co(project_name: str) -> tuple[int | None, str]:
    """Try scraping from 99.co."""
    slug = slugify(project_name)
    url = f"https://www.99.co/singapore/condos-apartments/{slug}"
    html = fetch_url(url)
    if html:
        units = extract_units_from_html(html)
        if units:
            return units, "99.co"
    return None, ""


def try_propertyguru_search(project_name: str) -> tuple[int | None, str]:
    """Try searching PropertyGuru."""
    # PropertyGuru uses search - harder to scrape directly
    # But we can try their project pages
    slug = slugify(project_name)
    url = f"https://www.propertyguru.com.sg/project/{slug}"
    html = fetch_url(url)
    if html:
        units = extract_units_from_html(html)
        if units:
            return units, "PropertyGuru"
    return None, ""


def get_project_units(project_name: str) -> tuple[int | None, str]:
    """
    Try multiple sources to find total units.
    Returns (units, source) tuple.
    """
    # Try EdgeProp first (most reliable)
    units, source = try_edgeprop(project_name)
    if units:
        return units, source

    time.sleep(random.uniform(1, 2))

    # Try 99.co
    units, source = try_99co(project_name)
    if units:
        return units, source

    time.sleep(random.uniform(1, 2))

    # Try PropertyGuru
    units, source = try_propertyguru_search(project_name)
    if units:
        return units, source

    return None, ""


def load_existing_csv() -> dict[str, dict]:
    """Load existing CSV into dict keyed by project name."""
    projects = {}
    if CSV_PATH.exists():
        with open(CSV_PATH, "r") as f:
            reader = csv.DictReader(f)
            for row in reader:
                projects[row["project_name"].upper().strip()] = row
    return projects


def get_all_db_projects() -> list[str]:
    """Get all unique project names from the database."""
    import sys
    sys.path.insert(0, str(BACKEND_DIR))

    from models.database import db
    from app import create_app
    from sqlalchemy import text

    app = create_app()
    with app.app_context():
        result = db.session.execute(text("""
            SELECT DISTINCT project_name
            FROM transactions
            WHERE project_name IS NOT NULL
            ORDER BY project_name
        """)).fetchall()
        return [r[0] for r in result]


def get_missing_projects(existing: dict[str, dict], all_projects: list[str]) -> list[str]:
    """Find projects that don't have total_units data."""
    missing = []
    for project in all_projects:
        key = project.upper().strip()
        if key not in existing:
            missing.append(project)
        elif not existing[key].get("total_units"):
            missing.append(project)
    return missing


def get_hot_missing_projects(min_txns: int = 15) -> list[tuple[str, int]]:
    """Get projects with >min_txns transactions that are missing total_units."""
    import os
    from sqlalchemy import create_engine, text

    # Direct database connection (avoid app circular imports)
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        # Try to load from config
        import sys
        sys.path.insert(0, str(BACKEND_DIR))
        try:
            from config import Config
            database_url = Config.SQLALCHEMY_DATABASE_URI
        except:
            raise RuntimeError("DATABASE_URL not set")

    engine = create_engine(database_url)
    with engine.connect() as conn:
        # Get projects with enough transactions
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
        import csv as csv_module
        with open(CSV_PATH, "r") as f:
            reader = csv_module.DictReader(f)
            for row in reader:
                if row.get("total_units"):
                    csv_projects.add(row["project_name"].upper().strip())

    # Filter to missing only
    missing = [(p, c) for p, c in hot_projects if p.upper().strip() not in csv_projects]
    return missing


def main():
    parser = argparse.ArgumentParser(description="Scrape total units for projects")
    parser.add_argument("--project", help="Single project to look up")
    parser.add_argument("--limit", type=int, default=10, help="Max projects to process")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    parser.add_argument("--list-missing", action="store_true", help="Just list missing projects")
    parser.add_argument("--hot", action="store_true", help="Focus on hot projects (>15 txns)")
    parser.add_argument("--min-txns", type=int, default=15, help="Min transactions for hot projects")
    args = parser.parse_args()

    print("Loading existing data...")
    existing = load_existing_csv()
    print(f"  Found {len(existing)} projects in CSV")

    if args.project:
        # Single project lookup
        print(f"\nSearching for: {args.project}")
        units, source = get_project_units(args.project)
        if units:
            print(f"  ✓ Found: {units} units (via {source})")
        else:
            print(f"  ✗ Could not find total units")
        return

    if args.hot:
        # Focus on hot projects with many transactions
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

        # Process hot projects (just the names)
        to_process = [p for p, c in hot_missing[:args.limit]]
        print(f"\nProcessing {len(to_process)} hot projects...")
    else:
        print("\nFetching all projects from database...")
        all_projects = get_all_db_projects()
        print(f"  Found {len(all_projects)} unique projects in DB")

        missing = get_missing_projects(existing, all_projects)
        print(f"  Missing total_units data: {len(missing)} projects")

        if args.list_missing:
            print("\nMissing projects:")
            for p in missing[:100]:
                print(f"  - {p}")
            if len(missing) > 100:
                print(f"  ... and {len(missing) - 100} more")
            return

        # Process projects
        to_process = missing[:args.limit]
        print(f"\nProcessing {len(to_process)} projects...")

    results = []
    for i, project in enumerate(to_process, 1):
        print(f"\n[{i}/{len(to_process)}] {project}")
        units, source = get_project_units(project)

        if units:
            print(f"  ✓ Found: {units} units")
            results.append({
                "project_name": project,
                "total_units": units,
                "source": source,
            })
        else:
            print(f"  ✗ Not found")

        # Rate limiting
        if i < len(to_process):
            delay = random.uniform(3, 6)
            print(f"  Waiting {delay:.1f}s...")
            time.sleep(delay)

    # Summary
    print(f"\n{'='*50}")
    print(f"Results: Found {len(results)}/{len(to_process)} projects")

    if results and not args.dry_run:
        print(f"\nUpdating CSV...")
        # Merge with existing
        for r in results:
            key = r["project_name"].upper().strip()
            if key in existing:
                existing[key]["total_units"] = r["total_units"]
                existing[key]["source"] = r["source"]
            else:
                existing[key] = {
                    "project_name": r["project_name"],
                    "total_units": r["total_units"],
                    "developer": "",
                    "tenure": "",
                    "top": "",
                    "district": "",
                    "source": r["source"],
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

    if results:
        print("\nFound:")
        for r in results:
            print(f"  {r['project_name']}: {r['total_units']} units")


if __name__ == "__main__":
    main()
