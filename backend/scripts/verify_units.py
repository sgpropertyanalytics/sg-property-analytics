#!/usr/bin/env python3
"""
verify_units.py - Simple one-off verification of unit counts.

Checks unit counts against Tier B sources and updates verification status.
Run manually when data accuracy check is needed.

Usage:
    python scripts/verify_units.py [--project "PROJECT NAME"] [--dry-run]

Examples:
    python scripts/verify_units.py                    # Verify all projects
    python scripts/verify_units.py --project "LENTOR HILLS"
    python scripts/verify_units.py --dry-run         # Preview without updating DB
"""

import argparse
import sys
from datetime import datetime
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from models.database import db
from app import create_app


# Verification status constants
STATUS_CONFIRMED = "confirmed"
STATUS_MISMATCH = "mismatch"
STATUS_UNVERIFIED = "unverified"

# Minimum sources needed for auto-confirm
MIN_SOURCES = 2


def get_projects_to_verify(project_name=None):
    """Get list of projects needing verification."""
    query = """
        SELECT project_name, total_units, verification_status
        FROM upcoming_launches
        WHERE total_units IS NOT NULL
    """
    params = {}

    if project_name:
        query += " AND UPPER(project_name) = UPPER(:project_name)"
        params["project_name"] = project_name

    query += " ORDER BY project_name"

    result = db.session.execute(text(query), params)
    return [dict(row._mapping) for row in result]


def verify_project(project_name, current_units):
    """
    Verify a project's unit count.

    This is a simplified verification that checks internal consistency.
    For external source verification, implement source-specific lookups.

    Returns:
        dict with {status, confidence, sources, verified_value}
    """
    sources = []

    # Check 1: Transaction count consistency
    txn_result = db.session.execute(text("""
        SELECT COUNT(*) as txn_count
        FROM transactions
        WHERE UPPER(project) = UPPER(:project_name)
          AND sale_type = 'New Sale'
    """), {"project_name": project_name}).fetchone()

    txn_count = txn_result.txn_count if txn_result else 0

    if txn_count > 0:
        # If we have transactions, that's a data point
        if txn_count <= current_units:
            sources.append({
                "source": "transactions",
                "value": f"{txn_count} sold (consistent)",
                "agrees": True
            })
        else:
            # More transactions than units = mismatch
            sources.append({
                "source": "transactions",
                "value": f"{txn_count} sold > {current_units} total",
                "agrees": False
            })

    # Check 2: Cross-reference with new_launch_units.csv if available
    csv_result = db.session.execute(text("""
        SELECT total_units
        FROM project_units_csv
        WHERE UPPER(project_name) = UPPER(:project_name)
    """), {"project_name": project_name}).fetchone()

    if csv_result and csv_result.total_units:
        csv_units = csv_result.total_units
        if csv_units == current_units:
            sources.append({
                "source": "csv_reference",
                "value": csv_units,
                "agrees": True
            })
        else:
            sources.append({
                "source": "csv_reference",
                "value": csv_units,
                "agrees": False
            })

    # Determine status
    agreeing = [s for s in sources if s.get("agrees")]
    disagreeing = [s for s in sources if not s.get("agrees")]

    if len(disagreeing) > 0:
        status = STATUS_MISMATCH
        confidence = 0.3
    elif len(agreeing) >= MIN_SOURCES:
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
        "verified_value": current_units if status == STATUS_CONFIRMED else None
    }


def update_verification_status(project_name, status, confidence, sources):
    """Update the verification columns in the database."""
    db.session.execute(text("""
        UPDATE upcoming_launches
        SET verification_status = :status,
            units_confidence_score = :confidence,
            verified_sources = :sources,
            verified_at = :verified_at
        WHERE UPPER(project_name) = UPPER(:project_name)
    """), {
        "project_name": project_name,
        "status": status,
        "confidence": confidence,
        "sources": str(sources),  # Simple string storage
        "verified_at": datetime.utcnow()
    })


def main():
    parser = argparse.ArgumentParser(description="Verify unit counts for projects")
    parser.add_argument("--project", help="Verify specific project only")
    parser.add_argument("--dry-run", action="store_true", help="Preview without DB updates")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        projects = get_projects_to_verify(args.project)

        if not projects:
            print("No projects to verify.")
            return

        print(f"\nVerifying {len(projects)} project(s)...\n")
        print("-" * 70)

        stats = {"confirmed": 0, "mismatch": 0, "unverified": 0}

        for proj in projects:
            name = proj["project_name"]
            units = proj["total_units"]

            result = verify_project(name, units)
            status = result["status"]
            confidence = result["confidence"]
            sources = result["sources"]

            stats[status] = stats.get(status, 0) + 1

            # Print result
            icon = {"confirmed": "✓", "mismatch": "⚠", "unverified": "?"}[status]
            print(f"{icon} {name}")
            print(f"   Units: {units} | Status: {status} | Confidence: {confidence:.0%}")
            if sources:
                for s in sources:
                    print(f"   - {s['source']}: {s['value']}")
            print()

            # Update DB unless dry-run
            if not args.dry_run:
                update_verification_status(name, status, confidence, sources)

        if not args.dry_run:
            db.session.commit()

        print("-" * 70)
        print(f"\nSummary:")
        print(f"  Confirmed:  {stats['confirmed']}")
        print(f"  Mismatch:   {stats['mismatch']}")
        print(f"  Unverified: {stats['unverified']}")

        if args.dry_run:
            print("\n(Dry run - no changes made)")


if __name__ == "__main__":
    main()
