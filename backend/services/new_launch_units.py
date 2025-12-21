"""
New Launch Units Service - MVP Approach

SCOPE: New launches ONLY (projects with active developer sales)
SOURCE: Static JSON file (manually verified from EdgeProp, developer brochures)

Key insight: Total units is STATIC data that never changes after a project is built.
No need for complex scraping - just maintain a verified data file.

For projects not in the data file -> mark needs_review=true for manual lookup.

Usage:
    from services.new_launch_units import get_units_for_project, sync_new_launch_units

    # Single project lookup
    result = get_units_for_project("GRAND DUNMAN")
    # Returns: {"total_units": 1008, "source": "EdgeProp", ...}

    # Sync all new launches to database
    results = sync_new_launch_units()
"""

import os
import json
from typing import Optional, Dict, Any, List
from datetime import datetime


# Path to static data file
DATA_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'data',
    'new_launch_units.json'
)

# Cache for loaded data
_data_cache = None


def _load_data() -> Dict[str, Any]:
    """Load static project data from JSON file."""
    global _data_cache
    if _data_cache is None:
        try:
            with open(DATA_FILE, 'r') as f:
                _data_cache = json.load(f)
        except FileNotFoundError:
            _data_cache = {"projects": {}}
    return _data_cache


def _normalize_name(name: str) -> str:
    """Normalize project name for matching."""
    return name.upper().strip()


def get_units_for_project(project_name: str) -> Dict[str, Any]:
    """
    Get total units for a project from static data file.

    Returns:
        {
            "project_name": str,
            "total_units": int or None,
            "developer": str or None,
            "tenure": str or None,
            "top": int or None,
            "district": str or None,
            "source": str or None,
            "needs_review": bool
        }
    """
    data = _load_data()
    projects = data.get("projects", {})

    normalized = _normalize_name(project_name)

    result = {
        "project_name": project_name,
        "total_units": None,
        "developer": None,
        "tenure": None,
        "top": None,
        "district": None,
        "source": None,
        "needs_review": True,  # Default to needs review if not found
    }

    # Exact match first
    if normalized in projects:
        info = projects[normalized]
        result.update({
            "total_units": info.get("total_units"),
            "developer": info.get("developer"),
            "tenure": info.get("tenure"),
            "top": info.get("top"),
            "district": info.get("district"),
            "source": info.get("source"),
            "needs_review": False,
        })
        return result

    # Try case-insensitive match
    for name, info in projects.items():
        if _normalize_name(name) == normalized:
            result.update({
                "total_units": info.get("total_units"),
                "developer": info.get("developer"),
                "tenure": info.get("tenure"),
                "top": info.get("top"),
                "district": info.get("district"),
                "source": info.get("source"),
                "needs_review": False,
            })
            return result

    return result


def list_all_projects() -> List[Dict[str, Any]]:
    """List all projects in the static data file."""
    data = _load_data()
    projects = data.get("projects", {})

    return [
        {
            "project_name": name,
            **info
        }
        for name, info in projects.items()
    ]


def sync_new_launch_units(dry_run: bool = False) -> Dict[str, Any]:
    """
    Sync total units for all new launches from static data file to database.

    Processes:
    1. Projects in static file -> update total_units in project_inventory
    2. New Sale projects not in static file -> mark needs_review=true

    Args:
        dry_run: If True, don't save to database

    Returns:
        {
            "processed": int,
            "updated": int,
            "needs_review": int,
            "already_has_data": int,
            "details": list
        }
    """
    from models.database import db
    from models.transaction import Transaction
    from models.project_inventory import ProjectInventory
    from sqlalchemy import func, distinct

    results = {
        "processed": 0,
        "updated": 0,
        "needs_review": 0,
        "already_has_data": 0,
        "details": [],
    }

    # Get all projects with New Sale transactions (active new launches)
    new_sale_projects = db.session.query(
        distinct(Transaction.project_name)
    ).filter(
        Transaction.sale_type == 'New Sale',
        Transaction.is_outlier == False
    ).all()

    new_sale_project_names = [p[0] for p in new_sale_projects]
    print(f"Found {len(new_sale_project_names)} projects with New Sale transactions")

    for project_name in new_sale_project_names:
        results["processed"] += 1

        # Check if already has data
        existing = ProjectInventory.query.filter_by(
            project_name=project_name
        ).first()

        if existing and existing.total_units:
            results["already_has_data"] += 1
            continue

        # Look up in static data
        lookup = get_units_for_project(project_name)

        detail = {
            "project_name": project_name,
            "total_units": lookup["total_units"],
            "source": lookup["source"],
            "needs_review": lookup["needs_review"],
        }

        if lookup["total_units"]:
            results["updated"] += 1
            print(f"  [FOUND] {project_name}: {lookup['total_units']} units")

            if not dry_run:
                if not existing:
                    existing = ProjectInventory(project_name=project_name)
                    db.session.add(existing)

                existing.total_units = lookup["total_units"]
                existing.data_source = lookup["source"] or "Static Data"
                existing.needs_review = False
                existing.last_synced = datetime.utcnow()

        elif lookup["needs_review"]:
            results["needs_review"] += 1
            print(f"  [NEEDS REVIEW] {project_name}")

            if not dry_run:
                if not existing:
                    existing = ProjectInventory(project_name=project_name)
                    db.session.add(existing)

                existing.needs_review = True
                existing.last_synced = datetime.utcnow()

        results["details"].append(detail)

    if not dry_run:
        db.session.commit()

    print(f"\nDone: {results['updated']} updated, "
          f"{results['needs_review']} need review, "
          f"{results['already_has_data']} already had data")

    return results


def add_project(project_name: str, total_units: int, developer: str = None,
                tenure: str = None, top: int = None, district: str = None,
                source: str = "Manual Entry") -> bool:
    """
    Add a new project to the static data file.

    This is for manual addition of projects that need to be looked up.

    Returns:
        True if added successfully
    """
    data = _load_data()
    projects = data.get("projects", {})

    normalized = _normalize_name(project_name)
    projects[normalized] = {
        "total_units": total_units,
        "developer": developer,
        "tenure": tenure,
        "top": top,
        "district": district,
        "source": source,
    }

    data["projects"] = projects
    data["_last_updated"] = datetime.now().strftime("%Y-%m-%d")

    try:
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)

        # Clear cache
        global _data_cache
        _data_cache = None

        return True
    except Exception as e:
        print(f"Error saving data: {e}")
        return False


# Quick test function
def test_lookup():
    """Test the lookup on a few known projects."""
    test_cases = [
        ("NORMANTON PARK", 1862),
        ("THE CONTINUUM", 816),
        ("GRAND DUNMAN", 1008),
        ("LENTOR HILLS RESIDENCES", 598),
        ("UNKNOWN PROJECT XYZ", None),  # Should need review
    ]

    print("Testing static data lookup...")
    print("=" * 60)

    for project_name, expected in test_cases:
        result = get_units_for_project(project_name)
        actual = result["total_units"]

        if expected is None:
            status = "OK (needs review)" if result["needs_review"] else "ERROR"
        else:
            status = "OK" if actual == expected else ("WRONG" if actual else "NOT FOUND")

        print(f"[{status}] {project_name}: {actual} (expected {expected})")

    print("=" * 60)
    print(f"\nTotal projects in static file: {len(list_all_projects())}")


if __name__ == "__main__":
    test_lookup()
