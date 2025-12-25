"""
New Launch Units Service - CSV Lookup with Resale Filter

Reads total_units data from: backend/data/new_launch_units.csv

A project is considered a "new launch" if:
1. It exists in the CSV file with total_units data
2. It has NOT yet had any resale transactions in the database

Once a project has its first resale transaction, it transitions to the
resale market and is no longer considered a new launch.

To add new projects, edit the CSV file and commit to git.

Usage:
    from services.new_launch_units import get_units_for_project, is_new_launch

    # Check if project is still a new launch
    if is_new_launch("GRAND DUNMAN"):
        result = get_units_for_project("GRAND DUNMAN")
        # Returns: {"total_units": 1008, "source": "EdgeProp", ...}
"""

import os
import csv
from typing import Dict, Any, List, Set


# Path to CSV file in backend/data folder (tracked in git)
CSV_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'data',
    'new_launch_units.csv'
)

# Cache for loaded data
_data_cache = None
# Cache for projects with resale transactions
_resale_projects_cache = None


def _load_data() -> Dict[str, Dict[str, Any]]:
    """Load project data from CSV file into a dictionary."""
    global _data_cache
    if _data_cache is None:
        _data_cache = {}
        try:
            with open(CSV_FILE, 'r', newline='', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    name = row.get('project_name', '').upper().strip()
                    if name:
                        _data_cache[name] = {
                            'total_units': int(row['total_units']) if row.get('total_units') else None,
                            'developer': row.get('developer') or None,
                            'tenure': row.get('tenure') or None,
                            'top': int(row['top']) if row.get('top') else None,
                            'district': row.get('district') or None,
                            'source': row.get('source') or None,
                        }
        except FileNotFoundError:
            print(f"Warning: CSV not found at {CSV_FILE}")
            _data_cache = {}
        except Exception as e:
            print(f"Error loading CSV: {e}")
            _data_cache = {}
    return _data_cache


def get_units_for_project(project_name: str, check_resale: bool = True) -> Dict[str, Any]:
    """
    Get total units for a project from CSV file.

    Args:
        project_name: The project name to look up
        check_resale: If True, also check if project has resale transactions

    Returns:
        Dict with total_units, developer, tenure, has_resale, is_new_launch, etc.
    """
    data = _load_data()
    normalized = project_name.upper().strip()

    result = {
        "project_name": project_name,
        "total_units": None,
        "developer": None,
        "tenure": None,
        "top": None,
        "district": None,
        "source": None,
        "needs_review": True,
        "has_resale": None,
        "is_new_launch": False,
    }

    if normalized in data:
        info = data[normalized]
        has_resale = has_resale_transactions(project_name) if check_resale else None
        result.update({
            "total_units": info.get("total_units"),
            "developer": info.get("developer"),
            "tenure": info.get("tenure"),
            "top": info.get("top"),
            "district": info.get("district"),
            "source": info.get("source"),
            "needs_review": False,
            "has_resale": has_resale,
            "is_new_launch": not has_resale if has_resale is not None else None,
        })

    return result


def list_all_projects() -> List[Dict[str, Any]]:
    """List all projects in the CSV file."""
    data = _load_data()
    return [{"project_name": name, **info} for name, info in data.items()]


def clear_cache():
    """Clear cache to force reload from file and database."""
    global _data_cache, _resale_projects_cache
    _data_cache = None
    _resale_projects_cache = None


def _load_resale_projects() -> Set[str]:
    """
    Load set of project names that have resale transactions.

    Once a project has any resale transaction, it's no longer a new launch.
    """
    global _resale_projects_cache
    if _resale_projects_cache is None:
        _resale_projects_cache = set()
        try:
            from models.database import db
            from sqlalchemy import text

            from db.sql import OUTLIER_FILTER
            from constants import SALE_TYPE_RESALE
            result = db.session.execute(text(f"""
                SELECT DISTINCT UPPER(project_name) as project_name
                FROM transactions
                WHERE sale_type = '{SALE_TYPE_RESALE}'
                  AND {OUTLIER_FILTER}
            """)).fetchall()

            _resale_projects_cache = {row[0] for row in result}
        except Exception as e:
            print(f"Warning: Could not load resale projects: {e}")
            _resale_projects_cache = set()

    return _resale_projects_cache


def has_resale_transactions(project_name: str) -> bool:
    """
    Check if a project has any resale transactions.

    Args:
        project_name: The project name to check

    Returns:
        True if the project has resale transactions, False otherwise
    """
    resale_projects = _load_resale_projects()
    normalized = project_name.upper().strip()
    return normalized in resale_projects


def is_new_launch(project_name: str) -> bool:
    """
    Check if a project is still considered a new launch.

    A project is a new launch if:
    1. It exists in our new launch CSV data
    2. It has NOT yet had any resale transactions

    Args:
        project_name: The project name to check

    Returns:
        True if the project is a new launch, False otherwise
    """
    data = _load_data()
    normalized = project_name.upper().strip()

    # Must be in our CSV data
    if normalized not in data:
        return False

    # Must NOT have any resale transactions
    if has_resale_transactions(project_name):
        return False

    return True


def get_new_launch_projects() -> List[Dict[str, Any]]:
    """
    Get all projects that are currently still new launches.

    Returns only projects that:
    1. Are in the CSV file
    2. Have NOT had any resale transactions
    """
    data = _load_data()
    resale_projects = _load_resale_projects()

    result = []
    for name, info in data.items():
        if name not in resale_projects:
            result.append({
                "project_name": name,
                "has_resale": False,
                **info
            })

    return result


def cleanup_resale_projects() -> Dict[str, Any]:
    """
    Remove projects from CSV that now have resale transactions.

    This function:
    1. Checks all projects in the CSV against the database
    2. Removes any that have resale transactions
    3. Rewrites the CSV file
    4. Clears the cache

    Call this periodically (e.g., at startup or after data upload) to keep
    the CSV file clean.

    Returns:
        Dict with 'removed' (list of removed project names) and 'remaining' count
    """
    data = _load_data()
    resale_projects = _load_resale_projects()

    # Find projects to remove
    projects_to_remove = []
    projects_to_keep = {}

    for name, info in data.items():
        if name in resale_projects:
            projects_to_remove.append(name)
        else:
            projects_to_keep[name] = info

    # If nothing to remove, return early
    if not projects_to_remove:
        return {
            "removed": [],
            "remaining": len(projects_to_keep),
            "message": "No projects to remove"
        }

    # Rewrite CSV with remaining projects
    try:
        with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['project_name', 'total_units', 'developer', 'tenure', 'top', 'district', 'source'])

            for name, info in sorted(projects_to_keep.items()):
                writer.writerow([
                    name,
                    info.get('total_units') or '',
                    info.get('developer') or '',
                    info.get('tenure') or '',
                    info.get('top') or '',
                    info.get('district') or '',
                    info.get('source') or '',
                ])

        # Clear cache to reload updated data
        clear_cache()

        return {
            "removed": projects_to_remove,
            "remaining": len(projects_to_keep),
            "message": f"Removed {len(projects_to_remove)} projects that now have resale transactions"
        }

    except Exception as e:
        return {
            "removed": [],
            "remaining": len(data),
            "error": str(e),
            "message": f"Failed to update CSV: {e}"
        }
