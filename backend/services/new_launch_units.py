"""
New Launch Units Service - Hybrid Unit Lookup

Provides total_units data from multiple sources with confidence labeling:

1. CSV file (backend/data/new_launch_units.csv) - Authoritative for new launches
2. upcoming_launches database table - Secondary source with data provenance
3. Transaction-based estimation - Fallback for older projects

Each response includes:
- total_units: The unit count (or None if unavailable)
- unit_source: 'csv', 'database', 'estimated', or None
- confidence: 'high', 'medium', 'low', or None
- note: Human-readable explanation of data source

Usage:
    from services.new_launch_units import get_project_units

    # Hybrid lookup with confidence labeling
    result = get_project_units("D'LEEDON")
    # Returns: {
    #     "total_units": 1715,
    #     "unit_source": "estimated",
    #     "confidence": "medium",
    #     "note": "Estimated from max unit number in transactions"
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


# =============================================================================
# HYBRID UNIT LOOKUP (NEW)
# =============================================================================

# Confidence levels for unit data sources
CONFIDENCE_HIGH = 'high'      # Official sources (CSV, verified database)
CONFIDENCE_MEDIUM = 'medium'  # Estimated from unit numbers
CONFIDENCE_LOW = 'low'        # Estimated from unique units (less reliable)

# Estimation correction factor for unique units approach
# Accounts for units that haven't transacted yet
UNIQUE_UNITS_CORRECTION_FACTOR = 1.15


def get_project_units(project_name: str) -> Dict[str, Any]:
    """
    Get total units for a project using hybrid lookup with confidence labeling.

    Lookup hierarchy:
    1. CSV file (authoritative for new launches) - HIGH confidence
    2. upcoming_launches database table - confidence from data_confidence column
    3. Transaction-based estimation - MEDIUM/LOW confidence

    Args:
        project_name: The project name to look up

    Returns:
        Dict with:
        - total_units: int or None
        - unit_source: 'csv', 'database', 'estimated', or None
        - confidence: 'high', 'medium', 'low', or None
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

    # -------------------------------------------------------------------------
    # Source 3: Transaction-based estimation
    # -------------------------------------------------------------------------
    estimation = _estimate_units_from_transactions(normalized)
    if estimation and estimation.get('total_units'):
        result.update({
            "total_units": estimation['total_units'],
            "unit_source": "estimated",
            "confidence": estimation['confidence'],
            "note": estimation['note'],
            "district": estimation.get('district'),
            "tenure": estimation.get('tenure'),
        })
        logger.debug(f"Estimated {project_name}: {estimation['total_units']} units")
        return result

    # No data available
    result["note"] = "No unit data available from any source"
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


def _estimate_units_from_transactions(project_name_upper: str) -> Optional[Dict[str, Any]]:
    """
    Estimate total units from transaction patterns.

    Uses unique combinations of (floor_range, area_sqft) to estimate distinct units.
    The transactions table uses floor_level (High/Mid/Low) with floor_range (e.g., "31 to 35")
    rather than specific unit numbers.

    Confidence depends on transaction repeat ratio:
    - MEDIUM: High repeat ratio indicates mature market with stable unit count
    - LOW: Low repeat ratio suggests not all units have transacted yet

    Returns None if insufficient data for estimation.
    """
    try:
        from models.database import db
        from sqlalchemy import text
        from db.sql import OUTLIER_FILTER

        # Count unique units by floor_range + rounded area combination
        # This identifies distinct unit types in the project
        unique_units_result = db.session.execute(text(f"""
            SELECT
                COUNT(DISTINCT CONCAT(
                    COALESCE(floor_range, floor_level, ''),
                    '-',
                    COALESCE(ROUND(area_sqft)::text, '')
                )) as unique_units,
                COUNT(*) as transaction_count,
                MAX(district) as district,
                MAX(tenure) as tenure
            FROM transactions
            WHERE UPPER(project_name) = :project_name
              AND {OUTLIER_FILTER}
        """), {"project_name": project_name_upper}).fetchone()

        if unique_units_result and unique_units_result[0] and unique_units_result[0] >= 5:
            unique_count = unique_units_result[0]
            transaction_count = unique_units_result[1]

            # Calculate repeat ratio to determine market maturity
            # Higher ratio = more resales per unique unit = more mature market
            repeat_ratio = transaction_count / unique_count if unique_count > 0 else 1

            if repeat_ratio >= 2:
                # High repeat ratio = mature market, unique count is more reliable
                # Apply small adjustment for units that may never transact (e.g., owner-occupied)
                estimated_units = int(unique_count * 1.05)
                confidence = CONFIDENCE_MEDIUM
                note = f"Estimated from {unique_count} unique units ({transaction_count} transactions)"
            else:
                # Low repeat ratio = not all units have transacted yet
                # Apply correction factor to account for untransacted units
                estimated_units = int(unique_count * UNIQUE_UNITS_CORRECTION_FACTOR)
                confidence = CONFIDENCE_LOW
                note = f"Estimated from {unique_count} unique units (may be incomplete)"

            return {
                "total_units": estimated_units,
                "confidence": confidence,
                "note": note,
                "district": unique_units_result[2],
                "tenure": unique_units_result[3],
            }

    except Exception as e:
        logger.warning(f"Error estimating units for {project_name_upper}: {e}")

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
