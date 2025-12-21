"""
New Launch Units Service - CSV Lookup

Reads total_units data from: backend/data/new_launch_units.csv

To add new projects, edit the CSV file and commit to git.

Usage:
    from services.new_launch_units import get_units_for_project

    result = get_units_for_project("GRAND DUNMAN")
    # Returns: {"total_units": 1008, "source": "EdgeProp", ...}
"""

import os
import csv
from typing import Dict, Any, List


# Path to CSV file in backend/data folder (tracked in git)
CSV_FILE = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    'data',
    'new_launch_units.csv'
)

# Cache for loaded data
_data_cache = None


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


def get_units_for_project(project_name: str) -> Dict[str, Any]:
    """
    Get total units for a project from CSV file.

    Args:
        project_name: The project name to look up

    Returns:
        Dict with total_units, developer, tenure, etc.
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
    }

    if normalized in data:
        info = data[normalized]
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


def list_all_projects() -> List[Dict[str, Any]]:
    """List all projects in the CSV file."""
    data = _load_data()
    return [{"project_name": name, **info} for name, info in data.items()]


def clear_cache():
    """Clear cache to force reload from file."""
    global _data_cache
    _data_cache = None
