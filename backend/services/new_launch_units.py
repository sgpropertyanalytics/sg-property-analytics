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
            top_year = info.get('top')
            # Estimate TOP if not in CSV
            if top_year is None:
                top_year = _estimate_top_year(normalized)
            result.update({
                "total_units": info['total_units'],
                "unit_source": "csv",
                "confidence": CONFIDENCE_HIGH,
                "note": f"Official data from {info.get('source', 'CSV')}",
                "top": top_year,
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
        top_year = db_result.get('expected_top_date')
        # Estimate TOP if not in database
        if top_year is None:
            top_year = _estimate_top_year(normalized)
        result.update({
            "total_units": db_result['total_units'],
            "unit_source": "database",
            "confidence": db_confidence,
            "note": f"From {db_result.get('data_source', 'database')}",
            "top": top_year,
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
        # Estimate TOP year for this project
        top_year = _estimate_top_year(normalized)
        result.update({
            "total_units": estimation['total_units'],
            "unit_source": "estimated",
            "confidence": estimation['confidence'],
            "note": estimation['note'],
            "top": top_year,
            "district": estimation.get('district'),
            "tenure": estimation.get('tenure'),
        })
        logger.debug(f"Estimated {project_name}: {estimation['total_units']} units")
        return result

    # No data available
    result["note"] = "No unit data available from any source"

    # -------------------------------------------------------------------------
    # Final step: Estimate TOP year if still missing
    # -------------------------------------------------------------------------
    if result.get("top") is None:
        estimated_top = _estimate_top_year(normalized)
        if estimated_top:
            result["top"] = estimated_top
            result["top_source"] = "estimated"

    return result


def _estimate_top_year(project_name_upper: str) -> Optional[int]:
    """
    Estimate TOP year from transaction data.

    Strategy:
    1. For projects with New Sale transactions: first New Sale year + 2-3 years
    2. For projects with only Resale: first transaction year (already TOP'd)

    Returns estimated TOP year or None if cannot determine.
    """
    try:
        from models.database import db
        from sqlalchemy import text
        from db.sql import OUTLIER_FILTER

        # First, check for New Sale transactions
        new_sale_year = db.session.execute(text(f"""
            SELECT MIN(EXTRACT(YEAR FROM transaction_date)::int) as first_year
            FROM transactions
            WHERE UPPER(project_name) = :project_name
              AND sale_type = 'New Sale'
              AND {OUTLIER_FILTER}
        """), {"project_name": project_name_upper}).scalar()

        if new_sale_year:
            # New Sale typically starts 2-3 years before TOP
            # Conservative estimate: first New Sale + 3 years
            return int(new_sale_year) + 3

        # Fallback: For resale-only projects, use first transaction year
        # These are already TOP'd, so first transaction approximates when they TOP'd
        first_resale_year = db.session.execute(text(f"""
            SELECT MIN(EXTRACT(YEAR FROM transaction_date)::int) as first_year
            FROM transactions
            WHERE UPPER(project_name) = :project_name
              AND {OUTLIER_FILTER}
        """), {"project_name": project_name_upper}).scalar()

        if first_resale_year:
            # If only resale exists, the project TOP'd around or before first resale
            return int(first_resale_year)

    except Exception as e:
        logger.warning(f"Error estimating TOP year for {project_name_upper}: {e}")

    return None


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

    IMPORTANT: The transactions table uses floor_range (e.g., "01 to 05") which
    groups multiple floors together. This means simply counting unique
    (floor_range, area) combinations will UNDERESTIMATE the true unit count.

    Estimation approach:
    1. Count distinct floor ranges (e.g., "01 to 05", "06 to 10" = 2 ranges)
    2. Estimate floors per range (typically 5)
    3. Count unique unit types per floor range
    4. Multiply: unit_types × floors_per_range × num_ranges × units_per_type_factor

    Returns None if insufficient data for estimation.
    """
    try:
        from models.database import db
        from sqlalchemy import text
        from db.sql import OUTLIER_FILTER

        # Step 1: Get distinct floor ranges and unit types per range
        floor_analysis = db.session.execute(text(f"""
            SELECT
                COUNT(DISTINCT floor_range) as num_floor_ranges,
                COUNT(DISTINCT ROUND(area_sqft)) as num_unit_types,
                COUNT(*) as transaction_count,
                MAX(district) as district,
                MAX(tenure) as tenure
            FROM transactions
            WHERE UPPER(project_name) = :project_name
              AND {OUTLIER_FILTER}
              AND floor_range IS NOT NULL
        """), {"project_name": project_name_upper}).fetchone()

        if not floor_analysis or not floor_analysis[0]:
            # Fallback: No floor_range data, use simple unique combination count
            return _estimate_units_simple(project_name_upper)

        num_floor_ranges = floor_analysis[0]
        num_unit_types = floor_analysis[1]
        transaction_count = floor_analysis[2]
        district = floor_analysis[3]
        tenure = floor_analysis[4]

        if num_unit_types < 3:
            return None  # Not enough data

        # Step 2: Estimate floors per range
        # floor_range like "01 to 05" = 5 floors, "06 to 10" = 5 floors
        # Most URA data uses 5-floor ranges
        floors_per_range = 5

        # Step 3: Estimate units per floor
        # Average unit types per range gives us types per "band"
        # Typical condo: 4-8 units per floor
        avg_types_per_range = db.session.execute(text(f"""
            SELECT AVG(type_count)::float
            FROM (
                SELECT floor_range, COUNT(DISTINCT ROUND(area_sqft)) as type_count
                FROM transactions
                WHERE UPPER(project_name) = :project_name
                  AND {OUTLIER_FILTER}
                  AND floor_range IS NOT NULL
                GROUP BY floor_range
            ) sub
        """), {"project_name": project_name_upper}).scalar() or num_unit_types

        # Step 4: Calculate estimate
        # Conservative estimate: types_per_range × floors_per_range × num_ranges
        # This assumes 1 unit per type per floor (underestimate for developments
        # with multiple units of same type per floor)
        base_estimate = int(avg_types_per_range * floors_per_range * num_floor_ranges)

        # Apply a correction factor for multiple units of same type per floor
        # Tested against known projects (KOVAN MELODY, D'LEEDON, THE INTERLACE, etc.):
        # - Factor 1.5: Avg error 22% (best overall balance)
        # - Factor 1.75: Avg error 23% (better for some, worse for others)
        # - Factor 2.0: Avg error 32% (over-estimates most projects)
        # Some projects like KOVAN MELODY still underestimate due to unusual layouts
        MULTI_UNIT_FACTOR = 1.5

        estimated_units = int(base_estimate * MULTI_UNIT_FACTOR)

        # Confidence is always LOW for estimates - they can be off by 50%+
        note = (
            f"Estimated from {num_unit_types} unit types across {num_floor_ranges} floor ranges "
            f"({transaction_count} transactions). Actual count may differ."
        )

        return {
            "total_units": estimated_units,
            "confidence": CONFIDENCE_LOW,
            "note": note,
            "district": district,
            "tenure": tenure,
        }

    except Exception as e:
        logger.warning(f"Error estimating units for {project_name_upper}: {e}")

    return None


def _estimate_units_simple(project_name_upper: str) -> Optional[Dict[str, Any]]:
    """
    Simple fallback estimation when floor_range data is not available.
    Uses unique (floor_level, area) combinations with a correction factor.
    """
    try:
        from models.database import db
        from sqlalchemy import text
        from db.sql import OUTLIER_FILTER

        result = db.session.execute(text(f"""
            SELECT
                COUNT(DISTINCT CONCAT(
                    COALESCE(floor_level, ''),
                    '-',
                    COALESCE(ROUND(area_sqft)::text, '')
                )) as unique_combos,
                COUNT(*) as transaction_count,
                MAX(district) as district,
                MAX(tenure) as tenure
            FROM transactions
            WHERE UPPER(project_name) = :project_name
              AND {OUTLIER_FILTER}
        """), {"project_name": project_name_upper}).fetchone()

        if result and result[0] and result[0] >= 5:
            unique_combos = result[0]
            transaction_count = result[1]

            # Apply large correction factor since floor_level is even more aggregated
            # (High/Mid/Low instead of specific ranges)
            SIMPLE_CORRECTION_FACTOR = 8.0
            estimated_units = int(unique_combos * SIMPLE_CORRECTION_FACTOR)

            return {
                "total_units": estimated_units,
                "confidence": CONFIDENCE_LOW,
                "note": f"Rough estimate from {unique_combos} unit patterns ({transaction_count} transactions). Actual count may differ significantly.",
                "district": result[2],
                "tenure": result[3],
            }

    except Exception as e:
        logger.warning(f"Error in simple estimation for {project_name_upper}: {e}")

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
