#!/usr/bin/env python3
"""
verify_units.py - Verify project data against multiple external sources.

Checks unit counts and project details against:
- 99.co (property portal)
- Stacked Homes (property blog/analysis)
- PropertyGuru (property portal)
- EdgeProp (property portal)

Usage:
    python scripts/verify_units.py                     # Verify all projects
    python scripts/verify_units.py --project "LENTOR" # Verify specific project
    python scripts/verify_units.py --dry-run          # Preview without DB update
    python scripts/verify_units.py --limit 10         # Verify first 10 projects
"""

import argparse
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from models.database import db
from app import create_app


# =============================================================================
# CONFIGURATION
# =============================================================================

RATE_LIMIT_SECONDS = 2  # Be polite to external sites

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Verification status
STATUS_CONFIRMED = "confirmed"
STATUS_MISMATCH = "mismatch"
STATUS_UNVERIFIED = "unverified"


# =============================================================================
# SOURCE SCRAPERS
# =============================================================================

def fetch_page(url):
    """Fetch a page with rate limiting."""
    time.sleep(RATE_LIMIT_SECONDS)
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.text
    except Exception as e:
        print(f"    [!] Failed to fetch {url}: {e}")
        return None


def search_99co(project_name):
    """
    Search 99.co for project info.
    Returns: {total_units, developer, found, source_url} or None
    """
    search_url = f"https://www.99.co/singapore/new-launches?search={quote_plus(project_name)}"

    try:
        html = fetch_page(search_url)
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")

        # Look for project cards with unit info
        # 99.co structure varies, try common patterns
        data = {"source": "99.co", "source_url": search_url, "found": False}

        # Try to find unit count in page
        text_content = soup.get_text()

        # Pattern: "XXX units" or "XXX Units"
        units_match = re.search(r"(\d{2,4})\s*units", text_content, re.IGNORECASE)
        if units_match:
            data["total_units"] = int(units_match.group(1))
            data["found"] = True

        # Pattern: Developer name after "by" or "Developer:"
        dev_match = re.search(r"(?:by|developer[:\s]+)([A-Z][A-Za-z\s&]+(?:Pte|Ltd|Limited)?)", text_content)
        if dev_match:
            data["developer"] = dev_match.group(1).strip()

        return data if data["found"] else None

    except Exception as e:
        print(f"    [!] 99.co error: {e}")
        return None


def search_stacked_homes(project_name):
    """
    Search Stacked Homes blog for project reviews.
    Returns: {total_units, developer, found, source_url} or None
    """
    # Stacked Homes uses Google-indexed articles
    search_url = f"https://stackedhomes.com/?s={quote_plus(project_name)}"

    try:
        html = fetch_page(search_url)
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")
        data = {"source": "stacked_homes", "source_url": search_url, "found": False}

        # Find article links that match project name
        articles = soup.find_all("a", href=True)
        project_upper = project_name.upper()

        for article in articles:
            href = article.get("href", "")
            text = article.get_text().upper()

            # Check if this looks like a review article
            if project_upper.split()[0] in text and "stackedhomes.com" in href:
                # Found a potential article, fetch it
                article_html = fetch_page(href)
                if article_html:
                    article_soup = BeautifulSoup(article_html, "html.parser")
                    article_text = article_soup.get_text()

                    # Extract unit count
                    units_patterns = [
                        r"(\d{2,4})\s*(?:residential\s+)?units",
                        r"total\s+(?:of\s+)?(\d{2,4})\s*units",
                        r"comprises?\s+(\d{2,4})\s*units",
                    ]
                    for pattern in units_patterns:
                        match = re.search(pattern, article_text, re.IGNORECASE)
                        if match:
                            data["total_units"] = int(match.group(1))
                            data["found"] = True
                            data["source_url"] = href
                            break

                    if data["found"]:
                        break

        return data if data["found"] else None

    except Exception as e:
        print(f"    [!] Stacked Homes error: {e}")
        return None


def search_propertyguru(project_name):
    """
    Search PropertyGuru for project info.
    Returns: {total_units, developer, found, source_url} or None
    """
    search_url = f"https://www.propertyguru.com.sg/new-property-launch?freetext={quote_plus(project_name)}"

    try:
        html = fetch_page(search_url)
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")
        data = {"source": "propertyguru", "source_url": search_url, "found": False}

        text_content = soup.get_text()

        # Look for unit counts
        units_match = re.search(r"(\d{2,4})\s*units", text_content, re.IGNORECASE)
        if units_match:
            data["total_units"] = int(units_match.group(1))
            data["found"] = True

        return data if data["found"] else None

    except Exception as e:
        print(f"    [!] PropertyGuru error: {e}")
        return None


def search_edgeprop(project_name):
    """
    Search EdgeProp for project info.
    Returns: {total_units, developer, found, source_url} or None
    """
    search_url = f"https://www.edgeprop.sg/condo-directory?q={quote_plus(project_name)}"

    try:
        html = fetch_page(search_url)
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")
        data = {"source": "edgeprop", "source_url": search_url, "found": False}

        text_content = soup.get_text()

        # Look for unit counts
        units_match = re.search(r"(\d{2,4})\s*units", text_content, re.IGNORECASE)
        if units_match:
            data["total_units"] = int(units_match.group(1))
            data["found"] = True

        return data if data["found"] else None

    except Exception as e:
        print(f"    [!] EdgeProp error: {e}")
        return None


# =============================================================================
# VERIFICATION LOGIC
# =============================================================================

def verify_project(project_name, current_units):
    """
    Verify a project against all external sources.

    Returns:
        dict with {status, confidence, sources, verified_value}
    """
    print(f"\n  Checking: {project_name} (current: {current_units} units)")

    sources = []

    # Check each source
    source_functions = [
        ("99.co", search_99co),
        ("Stacked Homes", search_stacked_homes),
        ("PropertyGuru", search_propertyguru),
        ("EdgeProp", search_edgeprop),
    ]

    for source_name, search_fn in source_functions:
        print(f"    Searching {source_name}...", end=" ", flush=True)
        result = search_fn(project_name)

        if result and result.get("found"):
            found_units = result.get("total_units")
            agrees = found_units == current_units if found_units else None

            sources.append({
                "source": source_name,
                "units": found_units,
                "agrees": agrees,
                "url": result.get("source_url"),
            })

            if found_units:
                status = "✓" if agrees else "✗"
                print(f"Found {found_units} units {status}")
            else:
                print("Found (no unit count)")
        else:
            print("Not found")

    # Also check internal consistency
    print(f"    Checking transactions...", end=" ", flush=True)
    txn_result = db.session.execute(text("""
        SELECT COUNT(*) as txn_count
        FROM transactions
        WHERE UPPER(project) LIKE UPPER(:project_pattern)
          AND sale_type = 'New Sale'
    """), {"project_pattern": f"%{project_name}%"}).fetchone()

    txn_count = txn_result.txn_count if txn_result else 0
    if txn_count > 0:
        if current_units and txn_count <= current_units:
            print(f"{txn_count} sold (consistent)")
            sources.append({
                "source": "transactions",
                "units": txn_count,
                "agrees": True,
                "note": "sold count <= total units"
            })
        elif current_units and txn_count > current_units:
            print(f"{txn_count} sold > {current_units} total (MISMATCH)")
            sources.append({
                "source": "transactions",
                "units": txn_count,
                "agrees": False,
                "note": "sold count > total units"
            })
    else:
        print("No transactions found")

    # Calculate confidence and status
    agreeing = [s for s in sources if s.get("agrees") is True]
    disagreeing = [s for s in sources if s.get("agrees") is False]

    if len(disagreeing) > 0:
        status = STATUS_MISMATCH
        confidence = 0.3
    elif len(agreeing) >= 3:
        status = STATUS_CONFIRMED
        confidence = 0.95
    elif len(agreeing) >= 2:
        status = STATUS_CONFIRMED
        confidence = 0.85
    elif len(agreeing) == 1:
        status = STATUS_CONFIRMED
        confidence = 0.7
    else:
        status = STATUS_UNVERIFIED
        confidence = 0.0

    return {
        "status": status,
        "confidence": confidence,
        "sources": sources,
        "source_count": len([s for s in sources if s.get("units")]),
    }


def get_projects_to_verify(project_name=None, limit=None):
    """Get list of projects needing verification."""
    query = """
        SELECT project_name, total_units, verification_status
        FROM upcoming_launches
        WHERE total_units IS NOT NULL
    """
    params = {}

    if project_name:
        query += " AND UPPER(project_name) LIKE UPPER(:project_pattern)"
        params["project_pattern"] = f"%{project_name}%"

    query += " ORDER BY project_name"

    if limit:
        query += f" LIMIT {int(limit)}"

    result = db.session.execute(text(query), params)
    return [dict(row._mapping) for row in result]


def update_verification_status(project_name, status, confidence, sources):
    """Update the verification columns in the database."""
    import json

    db.session.execute(text("""
        UPDATE upcoming_launches
        SET verification_status = :status,
            units_confidence_score = :confidence,
            verified_at = :verified_at
        WHERE project_name = :project_name
    """), {
        "project_name": project_name,
        "status": status,
        "confidence": confidence,
        "verified_at": datetime.utcnow()
    })


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Verify project data against external sources")
    parser.add_argument("--project", help="Verify specific project (partial match)")
    parser.add_argument("--limit", type=int, help="Limit number of projects to verify")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB updates")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        projects = get_projects_to_verify(args.project, args.limit)

        if not projects:
            print("No projects to verify.")
            return

        print(f"\n{'='*70}")
        print(f"VERIFICATION RUN - {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print(f"{'='*70}")
        print(f"Projects to verify: {len(projects)}")
        print(f"Sources: 99.co, Stacked Homes, PropertyGuru, EdgeProp, Transactions")
        if args.dry_run:
            print("Mode: DRY RUN (no DB updates)")
        print(f"{'='*70}")

        stats = {"confirmed": 0, "mismatch": 0, "unverified": 0}
        results = []

        for proj in projects:
            name = proj["project_name"]
            units = proj["total_units"]

            result = verify_project(name, units)
            status = result["status"]
            confidence = result["confidence"]
            sources = result["sources"]

            stats[status] = stats.get(status, 0) + 1
            results.append({
                "project": name,
                "units": units,
                "status": status,
                "confidence": confidence,
                "sources": result["source_count"],
            })

            # Update DB unless dry-run
            if not args.dry_run:
                update_verification_status(name, status, confidence, sources)

        if not args.dry_run:
            db.session.commit()

        # Print summary
        print(f"\n{'='*70}")
        print("SUMMARY")
        print(f"{'='*70}")
        print(f"  Confirmed:  {stats['confirmed']}")
        print(f"  Mismatch:   {stats['mismatch']}")
        print(f"  Unverified: {stats['unverified']}")

        # Print details table
        print(f"\n{'Project':<40} {'Units':>6} {'Status':<12} {'Confidence':>10} {'Sources':>7}")
        print("-" * 80)
        for r in results:
            icon = {"confirmed": "✓", "mismatch": "⚠", "unverified": "?"}[r["status"]]
            print(f"{r['project'][:39]:<40} {r['units']:>6} {icon} {r['status']:<10} {r['confidence']:>9.0%} {r['sources']:>7}")

        if args.dry_run:
            print(f"\n(Dry run - no changes made)")
        else:
            print(f"\nDatabase updated.")


if __name__ == "__main__":
    main()
