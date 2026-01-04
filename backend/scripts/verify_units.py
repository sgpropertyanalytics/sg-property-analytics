#!/usr/bin/env python3
"""
verify_units.py - Verify project unit counts against multiple sources.

Sources:
1. Internal: Transaction count must be <= total units
2. External: 99.co, Stacked Homes (with name matching)

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
# HELPER FUNCTIONS
# =============================================================================

def fetch_page(url):
    """Fetch a page with rate limiting."""
    time.sleep(RATE_LIMIT_SECONDS)
    try:
        response = requests.get(url, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.text
    except Exception as e:
        return None


def normalize_name(name):
    """Normalize project name for matching."""
    # Remove common suffixes and normalize
    name = name.upper()
    name = re.sub(r'\s*(RESIDENCES|RESIDENCE|CONDO|CONDOMINIUM|EC)\s*$', '', name)
    name = re.sub(r'[^\w\s]', '', name)  # Remove punctuation
    return name.strip()


def names_match(name1, name2):
    """Check if two project names match (fuzzy)."""
    n1 = normalize_name(name1)
    n2 = normalize_name(name2)

    # Exact match after normalization
    if n1 == n2:
        return True

    # One contains the other
    if n1 in n2 or n2 in n1:
        return True

    # First word matches (e.g., "LENTOR" matches "LENTOR GARDENS")
    words1 = n1.split()
    words2 = n2.split()
    if words1 and words2 and words1[0] == words2[0]:
        return True

    return False


def extract_units_near_name(text, project_name, window=500):
    """
    Extract unit count only if it appears near the project name.
    Returns (units, confidence) or (None, 0)
    """
    text_upper = text.upper()
    name_upper = normalize_name(project_name)

    # Find all occurrences of the project name
    pattern = re.escape(name_upper.split()[0])  # Match first word
    matches = list(re.finditer(pattern, text_upper))

    if not matches:
        return None, 0

    # For each name occurrence, look for units nearby
    for match in matches:
        start = max(0, match.start() - window)
        end = min(len(text), match.end() + window)
        context = text[start:end]

        # Look for unit patterns in context
        unit_patterns = [
            r'(\d{2,4})\s*(?:residential\s+)?units',
            r'total\s+(?:of\s+)?(\d{2,4})\s*units',
            r'comprises?\s+(\d{2,4})\s*units',
            r'(\d{2,4})\s*(?:apartment|flat)s?',
        ]

        for pattern in unit_patterns:
            unit_match = re.search(pattern, context, re.IGNORECASE)
            if unit_match:
                units = int(unit_match.group(1))
                # Filter out unrealistic numbers
                if 50 <= units <= 5000:
                    return units, 0.7

    return None, 0


# =============================================================================
# SOURCE CHECKERS
# =============================================================================

def check_internal_consistency(project_name, current_units):
    """
    Check if transaction count is consistent with total units.
    Returns: {source, agrees, txn_count, note}
    """
    from constants import SALE_TYPE_NEW as DB_SALE_TYPE_NEW
    txn_result = db.session.execute(text("""
        SELECT COUNT(*) as txn_count
        FROM transactions
        WHERE UPPER(project_name) LIKE UPPER(:project_pattern)
          AND sale_type = :sale_type
    """), {"project_pattern": f"%{project_name}%", "sale_type": DB_SALE_TYPE_NEW}).fetchone()

    txn_count = txn_result.txn_count if txn_result else 0

    if txn_count == 0:
        return {
            "source": "transactions",
            "txn_count": 0,
            "agrees": None,  # Can't verify - no transactions yet
            "note": "No transactions found (pre-launch?)"
        }

    if current_units and txn_count <= current_units:
        return {
            "source": "transactions",
            "txn_count": txn_count,
            "agrees": True,
            "note": f"{txn_count} sold <= {current_units} total"
        }
    else:
        return {
            "source": "transactions",
            "txn_count": txn_count,
            "agrees": False,
            "note": f"CONFLICT: {txn_count} sold > {current_units} total"
        }


def search_99co(project_name):
    """
    Search 99.co for project info with name matching.
    """
    # Try direct project URL pattern
    slug = project_name.lower().replace(" ", "-").replace("(", "").replace(")", "")
    direct_url = f"https://www.99.co/singapore/new-launches/{slug}"

    html = fetch_page(direct_url)
    if html:
        units, conf = extract_units_near_name(html, project_name)
        if units:
            return {
                "source": "99.co",
                "source_url": direct_url,
                "total_units": units,
                "found": True,
                "confidence": conf
            }

    # Fall back to search
    search_url = f"https://www.99.co/singapore/new-launches?search={quote_plus(project_name)}"
    html = fetch_page(search_url)
    if html:
        units, conf = extract_units_near_name(html, project_name)
        if units:
            return {
                "source": "99.co",
                "source_url": search_url,
                "total_units": units,
                "found": True,
                "confidence": conf
            }

    return None


def search_stacked_homes(project_name):
    """
    Search Stacked Homes for project reviews with name matching.
    """
    search_url = f"https://stackedhomes.com/?s={quote_plus(project_name)}"

    try:
        html = fetch_page(search_url)
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")

        # Find article links that match project name
        articles = soup.find_all("a", href=True)

        for article in articles:
            href = article.get("href", "")
            link_text = article.get_text()

            # Check if link text contains project name
            if not names_match(link_text, project_name):
                continue

            if "stackedhomes.com" not in href:
                continue

            # Fetch the article
            article_html = fetch_page(href)
            if article_html:
                units, conf = extract_units_near_name(article_html, project_name)
                if units:
                    return {
                        "source": "stacked_homes",
                        "source_url": href,
                        "total_units": units,
                        "found": True,
                        "confidence": conf
                    }

        return None

    except Exception as e:
        return None


# =============================================================================
# VERIFICATION LOGIC
# =============================================================================

def verify_project(project_name, current_units):
    """
    Verify a project against all sources.
    Returns: {status, confidence, sources, verified_value}
    """
    print(f"\n  Verifying: {project_name} (DB: {current_units} units)")

    sources = []
    external_values = []

    # 1. Internal consistency check (always run)
    print(f"    [1/3] Checking transactions...", end=" ", flush=True)
    internal = check_internal_consistency(project_name, current_units)
    sources.append(internal)

    if internal["agrees"] is True:
        print(f"✓ {internal['note']}")
    elif internal["agrees"] is False:
        print(f"✗ {internal['note']}")
    else:
        print(f"- {internal['note']}")

    # 2. 99.co
    print(f"    [2/3] Checking 99.co...", end=" ", flush=True)
    result_99 = search_99co(project_name)
    if result_99 and result_99.get("found"):
        found_units = result_99["total_units"]
        agrees = found_units == current_units
        sources.append({
            "source": "99.co",
            "units": found_units,
            "agrees": agrees,
            "url": result_99.get("source_url")
        })
        external_values.append(found_units)
        status = "✓" if agrees else "✗"
        print(f"{status} Found {found_units} units")
    else:
        print("- Not found")

    # 3. Stacked Homes
    print(f"    [3/3] Checking Stacked Homes...", end=" ", flush=True)
    result_sh = search_stacked_homes(project_name)
    if result_sh and result_sh.get("found"):
        found_units = result_sh["total_units"]
        agrees = found_units == current_units
        sources.append({
            "source": "stacked_homes",
            "units": found_units,
            "agrees": agrees,
            "url": result_sh.get("source_url")
        })
        external_values.append(found_units)
        status = "✓" if agrees else "✗"
        print(f"{status} Found {found_units} units")
    else:
        print("- Not found")

    # Calculate status and confidence
    agreeing = [s for s in sources if s.get("agrees") is True]
    disagreeing = [s for s in sources if s.get("agrees") is False]

    # Determine status
    if len(disagreeing) > 0:
        status = STATUS_MISMATCH
        confidence = 0.3
    elif len(agreeing) >= 2:
        status = STATUS_CONFIRMED
        confidence = 0.9
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
        "source_count": len([s for s in sources if s.get("agrees") is not None]),
        "external_values": external_values,
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
    parser = argparse.ArgumentParser(description="Verify project unit counts")
    parser.add_argument("--project", help="Verify specific project (partial match)")
    parser.add_argument("--limit", type=int, help="Limit number of projects")
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
        print(f"Sources: Transactions (internal), 99.co, Stacked Homes")
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
                "external_values": result.get("external_values", []),
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
        print(f"  ✓ Confirmed:  {stats['confirmed']}")
        print(f"  ⚠ Mismatch:   {stats['mismatch']}")
        print(f"  ? Unverified: {stats['unverified']}")

        # Print details table
        print(f"\n{'Project':<40} {'Units':>6} {'Status':<12} {'Conf':>6} {'Ext. Values'}")
        print("-" * 80)
        for r in results:
            icon = {"confirmed": "✓", "mismatch": "⚠", "unverified": "?"}[r["status"]]
            ext_vals = ", ".join(str(v) for v in r["external_values"]) if r["external_values"] else "-"
            print(f"{r['project'][:39]:<40} {r['units']:>6} {icon} {r['status']:<10} {r['confidence']:>5.0%} {ext_vals}")

        if args.dry_run:
            print(f"\n(Dry run - no changes made)")
        else:
            print(f"\nDatabase updated.")


if __name__ == "__main__":
    main()
