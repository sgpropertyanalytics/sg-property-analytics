"""
New Launch Units Service - Verified Unit Lookup

Provides total_units data from verified sources ONLY with confidence labeling:

1. CSV file (backend/data/new_launch_units.csv) - Authoritative for completed projects
2. upcoming_launches database table - For future/upcoming projects

IMPORTANT: No estimation algorithms. All data must be from verified sources.
This ensures data integrity - if a project's unit count is unknown, it stays unknown.

Each response includes:
- total_units: The unit count (or None if unavailable)
- unit_source: 'csv', 'database', or None
- confidence: 'high', 'medium', or None
- note: Human-readable explanation of data source

Usage:
    from services.new_launch_units import get_project_units

    # Lookup with confidence labeling
    result = get_project_units("D'LEEDON")
    # Returns: {
    #     "total_units": 1715,
    #     "unit_source": "csv",
    #     "confidence": "high",
    #     "note": "Official data from CSV"
    # }

Legacy functions still available:
    - get_units_for_project() - CSV-only lookup
    - is_new_launch() - Check if project is still a new launch
"""

import os
import csv
import logging
from typing import Dict, Any, List, Set, Optional

logger = logging.getLogger('new_launch_units')


# Path to CSV file in backend/data folder (tracked in git, READ-ONLY)
# This file is SOURCE-OF-TRUTH for new launch project data.
# It must NEVER be mutated by runtime code - use dynamic filtering instead.
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


# =============================================================================
# HYBRID UNIT LOOKUP (NEW)
# =============================================================================

# Confidence levels for unit data sources
CONFIDENCE_HIGH = 'high'      # Official sources (CSV, verified database)
CONFIDENCE_MEDIUM = 'medium'  # Database source with data provenance



def get_project_units(project_name: str) -> Dict[str, Any]:
    """
    Get total units for a project using verified data sources only.

    Lookup hierarchy:
    1. CSV file (authoritative for completed projects) - HIGH confidence
    2. upcoming_launches database table (future projects) - from data_confidence column

    NOTE: No estimation fallback. If project not in CSV or upcoming_launches,
    returns None for total_units. This ensures data integrity.

    Args:
        project_name: The project name to look up

    Returns:
        Dict with:
        - total_units: int or None
        - unit_source: 'csv', 'database', or None
        - confidence: 'high', 'medium', or None
        - note: Human-readable explanation
        - top: TOP year if available
        - developer: Developer name if available
        - district: District if available
        - tenure: Tenure type if available
    """
    normalized = project_name.upper().strip()

    # Base response structure
    result = {
        "project_name": project_name,
        "total_units": None,
        "unit_source": None,
        "confidence": None,
        "note": None,
        "top": None,
        "developer": None,
        "district": None,
        "tenure": None,
    }

    # -------------------------------------------------------------------------
    # Source 1: CSV file (highest priority for new launches)
    # -------------------------------------------------------------------------
    csv_data = _load_data()
    if normalized in csv_data:
        info = csv_data[normalized]
        if info.get('total_units'):
            result.update({
                "total_units": info['total_units'],
                "unit_source": "csv",
                "confidence": CONFIDENCE_HIGH,
                "note": f"Official data from {info.get('source', 'CSV')}",
                "top": info.get('top'),
                "developer": info.get('developer'),
                "district": info.get('district'),
                "tenure": info.get('tenure'),
            })
            logger.debug(f"Found {project_name} in CSV: {info['total_units']} units")
            return result

    # -------------------------------------------------------------------------
    # Source 2: upcoming_launches database table
    # -------------------------------------------------------------------------
    db_result = _lookup_upcoming_launches(normalized)
    if db_result and db_result.get('total_units'):
        db_confidence = db_result.get('data_confidence', CONFIDENCE_MEDIUM)
        result.update({
            "total_units": db_result['total_units'],
            "unit_source": "database",
            "confidence": db_confidence,
            "note": f"From {db_result.get('data_source', 'database')}",
            "top": db_result.get('expected_top_date'),
            "developer": db_result.get('developer'),
            "district": db_result.get('district'),
            "tenure": db_result.get('tenure'),
        })
        logger.debug(f"Found {project_name} in upcoming_launches: {db_result['total_units']} units")
        return result

    # No data available from verified sources
    result["note"] = "No unit data available from verified sources (CSV or database)"
    return result


def _lookup_upcoming_launches(project_name_upper: str) -> Optional[Dict[str, Any]]:
    """Look up project in upcoming_launches table."""
    try:
        from models.database import db
        from models.upcoming_launch import UpcomingLaunch

        launch = UpcomingLaunch.query.filter(
            db.func.upper(UpcomingLaunch.project_name) == project_name_upper
        ).first()

        if launch:
            return {
                "total_units": launch.total_units,
                "data_source": launch.data_source,
                "data_confidence": launch.data_confidence,
                "expected_top_date": launch.expected_top_date.year if launch.expected_top_date else None,
                "developer": launch.developer,
                "district": launch.district,
                "tenure": launch.tenure,
            }
    except Exception as e:
        logger.warning(f"Error looking up upcoming_launches for {project_name_upper}: {e}")

    return None


def get_project_units_batch(project_names: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Get units for multiple projects efficiently.

    Args:
        project_names: List of project names

    Returns:
        Dict mapping project names to their unit data
    """
    results = {}
    for name in project_names:
        results[name] = get_project_units(name)
    return results


# =============================================================================
# DISTRICT-LEVEL AGGREGATION FOR RESALE METRICS
# =============================================================================

def get_district_units_for_resale(
    db_session,
    date_from: Optional['date'] = None,
    date_to: Optional['date'] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate total units per district from projects with resale transactions.

    Uses CSV data ONLY (no upcoming_launches, no estimation) to ensure
    data integrity for resale turnover calculations.

    Args:
        db_session: SQLAlchemy database session
        date_from: Optional start date filter (inclusive)
        date_to: Optional end date filter (exclusive)

    Returns:
        Dict mapping district to unit data:
        {
            "D01": {
                "total_units": 5000,
                "project_count": 15,
                "projects_with_units": 12,
                "coverage_pct": 80.0,
            },
            ...
        }
    """
    from sqlalchemy import text
    from db.sql import OUTLIER_FILTER
    from constants import SALE_TYPE_RESALE

    # Load CSV data (source of truth for unit counts)
    csv_data = _load_data()

    # Build date filter clause
    date_clause = ""
    params = {"sale_type": SALE_TYPE_RESALE}

    if date_from:
        date_clause += " AND transaction_date >= :date_from"
        params["date_from"] = date_from
    if date_to:
        date_clause += " AND transaction_date < :date_to"
        params["date_to"] = date_to

    # Query distinct (district, project_name) pairs with resale transactions
    query = text(f"""
        SELECT
            district,
            UPPER(TRIM(project_name)) as project_name
        FROM transactions
        WHERE sale_type = :sale_type
          AND {OUTLIER_FILTER}
          AND district IS NOT NULL
          AND project_name IS NOT NULL
          {date_clause}
        GROUP BY district, UPPER(TRIM(project_name))
    """)

    rows = db_session.execute(query, params).fetchall()

    # Aggregate by district
    district_data: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        district = row[0]
        project_name = row[1]

        if district not in district_data:
            district_data[district] = {
                "total_units": 0,
                "project_count": 0,
                "projects_with_units": 0,
                "projects_without_units": [],
            }

        district_data[district]["project_count"] += 1

        # Look up units from CSV only
        if project_name in csv_data:
            units = csv_data[project_name].get("total_units")
            if units:
                district_data[district]["total_units"] += units
                district_data[district]["projects_with_units"] += 1
            else:
                district_data[district]["projects_without_units"].append(project_name)
        else:
            district_data[district]["projects_without_units"].append(project_name)

    # Calculate coverage percentage and clean up
    for district, data in district_data.items():
        if data["project_count"] > 0:
            data["coverage_pct"] = round(
                100.0 * data["projects_with_units"] / data["project_count"], 1
            )
        else:
            data["coverage_pct"] = 0.0

        # Remove the list of missing projects (used for debugging only)
        del data["projects_without_units"]

    return district_data


def get_csv_units_for_project(project_name: str) -> Optional[int]:
    """
    Get total units for a project from CSV only.

    This is a fast lookup that bypasses database queries.
    Returns None if project not found in CSV.
    """
    csv_data = _load_data()
    normalized = project_name.upper().strip()

    if normalized in csv_data:
        return csv_data[normalized].get("total_units")

    return None
