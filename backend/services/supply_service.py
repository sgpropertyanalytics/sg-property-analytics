"""
Supply Service - Aggregates supply pipeline data for waterfall charts.

Provides a unified view of:
1. Unsold Inventory - Developer stock from launched projects (not yet sold)
2. Upcoming Launches - Pre-launch projects by launch year
3. GLS Pipeline - Open GLS tenders (status='launched', not yet awarded)

CRITICAL: Categories are MUTUALLY EXCLUSIVE to prevent double-counting:
- Unsold Inventory: Projects in new_launch_units.csv that are still selling (no resales yet)
- Upcoming Launches: Projects in upcoming_launches table (future launches)
- GLS Pipeline: Open tenders NOT linked to any upcoming_launch (unassigned sites)

Response contract:
- All numeric fields return 0 instead of null
- All three regions (CCR, RCR, OCR) always present
- totals match sum of components (invariant)

Usage:
    from services.supply_service import get_supply_summary

    result = get_supply_summary(include_gls=True, launch_year=2026)
"""

import logging
from datetime import date
from typing import Dict, Any, List, Optional
from collections import defaultdict

logger = logging.getLogger('supply_service')


def _get_imports():
    """Lazy imports to avoid import-time errors in production."""
    from models.database import db
    from sqlalchemy import func, text
    from constants import (
        get_region_for_district,
        get_districts_for_region,
        CCR_DISTRICTS,
        RCR_DISTRICTS,
        OCR_DISTRICTS,
        SALE_TYPE_NEW,
    )
    from db.sql import exclude_outliers, OUTLIER_FILTER
    return {
        'db': db,
        'func': func,
        'text': text,
        'get_region_for_district': get_region_for_district,
        'get_districts_for_region': get_districts_for_region,
        'CCR_DISTRICTS': CCR_DISTRICTS,
        'RCR_DISTRICTS': RCR_DISTRICTS,
        'OCR_DISTRICTS': OCR_DISTRICTS,
        'SALE_TYPE_NEW': SALE_TYPE_NEW,
        'exclude_outliers': exclude_outliers,
        'OUTLIER_FILTER': OUTLIER_FILTER,
    }


# =============================================================================
# MAIN PUBLIC FUNCTION
# =============================================================================

def get_supply_summary(
    include_gls: bool = True,
    launch_year: int = 2026
) -> Dict[str, Any]:
    """
    Get aggregated supply pipeline data for waterfall visualization.

    Args:
        include_gls: Whether to include GLS pipeline in totals
        launch_year: Year filter for upcoming launches (default 2026)

    Returns:
        {
            "byRegion": {
                "CCR": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply, components },
                "RCR": { ... },
                "OCR": { ... }
            },
            "byDistrict": {
                "D01": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply, region, projects },
                ...
            },
            "totals": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply },
            "meta": { launchYear, includeGls, computedAs, asOfDate, warnings }
        }
    """
    # Fetch each category with project-level detail
    unsold_by_district, unsold_projects = _get_unsold_inventory_with_projects()
    upcoming_by_district, upcoming_projects = _get_upcoming_launches_with_projects(launch_year)
    gls_by_region = _get_gls_pipeline_by_region() if include_gls else {}

    # Merge into district-level data (includes projects)
    by_district = _merge_district_data_with_projects(
        unsold_by_district, upcoming_by_district,
        unsold_projects, upcoming_projects
    )

    # Rollup to region level
    by_region = _rollup_by_region(by_district, gls_by_region, include_gls)

    # Compute totals
    totals = _compute_totals(by_region)

    # Detect any potential overlaps (for debugging)
    warnings = _detect_overlaps(unsold_by_district, upcoming_by_district, gls_by_region)

    return {
        "byRegion": by_region,
        "byDistrict": by_district,
        "totals": totals,
        "meta": _build_meta(launch_year, include_gls, warnings)
    }


# =============================================================================
# PRIVATE HELPERS - DATA FETCHING
# =============================================================================

def _get_unsold_inventory_by_district() -> Dict[str, int]:
    """
    Get unsold inventory from launched projects (still selling).

    DEFINITION: Projects in new_launch_units.csv that have NOT had any resale transactions.
    Unsold = total_units - count(New Sale transactions)

    Returns:
        Dict mapping district → unsold units (e.g., {"D01": 500, "D15": 200})
    """
    try:
        imports = _get_imports()
        db = imports['db']
        func = imports['func']
        SALE_TYPE_NEW = imports['SALE_TYPE_NEW']

        from services.new_launch_units import get_new_launch_projects
        from models.transaction import Transaction

        # Get all projects that are still new launches (no resales yet)
        new_launch_projects = get_new_launch_projects()

        if not new_launch_projects:
            return {}

        # Build project name → (total_units, district) mapping
        project_data = {}
        for project_info in new_launch_projects:
            project_name = project_info.get('project_name')
            total_units = project_info.get('total_units') or 0
            district = project_info.get('district')

            if not project_name or not district:
                continue

            # Normalize district format
            d = district.upper().strip()
            if not d.startswith('D'):
                d = f'D{d.zfill(2)}'

            project_data[project_name.upper()] = {
                'total_units': total_units,
                'district': d
            }

        if not project_data:
            return {}

        # Get all project names as a list
        project_names = list(project_data.keys())

        # Single bulk query: count New Sale transactions per project
        # Using UPPER() on both sides for case-insensitive matching
        results = db.session.query(
            func.upper(Transaction.project_name).label('project_name'),
            func.count(Transaction.id).label('sold_count')
        ).filter(
            func.upper(Transaction.project_name).in_(project_names),
            Transaction.sale_type == SALE_TYPE_NEW,
            # Note: Skipping outlier filter for performance, as new launches are generally not outliers
        ).group_by(
            func.upper(Transaction.project_name)
        ).all()

        # Build sold count lookup
        sold_counts = {row.project_name: row.sold_count for row in results}

        # Calculate unsold per district
        result = defaultdict(int)
        for project_name_upper, data in project_data.items():
            sold = sold_counts.get(project_name_upper, 0)
            unsold = max(0, data['total_units'] - sold)

            if unsold > 0:
                result[data['district']] += unsold

        return dict(result)
    except Exception as e:
        logger.warning(f"Could not fetch unsold inventory: {e}")
        import traceback
        logger.warning(traceback.format_exc())
        return {}


def _get_upcoming_launches_by_district(launch_year: int) -> Dict[str, int]:
    """
    Get upcoming launches supply by district for a specific year.

    DEFINITION: Projects in upcoming_launches table (future launches, not yet selling).

    Args:
        launch_year: Filter by launch year

    Returns:
        Dict mapping district → total units (e.g., {"D09": 800, "D21": 500})
    """
    imports = _get_imports()
    db = imports['db']
    func = imports['func']

    try:
        from models.upcoming_launch import UpcomingLaunch

        # Query grouped by district
        results = db.session.query(
            UpcomingLaunch.district,
            func.sum(UpcomingLaunch.total_units).label('total_units')
        ).filter(
            UpcomingLaunch.launch_year == launch_year
        ).group_by(
            UpcomingLaunch.district
        ).all()

        district_units = {}
        for row in results:
            if row.district and row.total_units:
                # Normalize district format
                d = row.district.upper().strip()
                if not d.startswith('D'):
                    d = f'D{d.zfill(2)}'
                district_units[d] = int(row.total_units)

        return district_units
    except Exception as e:
        logger.warning(f"Could not fetch upcoming launches: {e}")
        return {}


def _get_gls_pipeline_by_region() -> Dict[str, int]:
    """
    Get GLS pipeline supply by region (open tenders only).

    DEFINITION: GLS tenders with status='launched' (open for bidding, not yet awarded).
    These are UNASSIGNED sites - not yet linked to any upcoming_launch project.

    Note: GLS tenders use planning_area → market_segment mapping (not district).

    Returns:
        Dict mapping region → estimated units (e.g., {"CCR": 2000, "RCR": 3000, "OCR": 1500})
    """
    imports = _get_imports()
    db = imports['db']
    func = imports['func']

    try:
        from models.gls_tender import GLSTender
        from models.upcoming_launch import UpcomingLaunch

        # Get GLS tenders that are:
        # 1. status = 'launched' (open for bidding)
        # 2. NOT linked to any upcoming_launch (unassigned)

        # First, get IDs of GLS tenders that ARE linked to upcoming_launches
        linked_gls_ids_subquery = db.session.query(UpcomingLaunch.gls_tender_id).filter(
            UpcomingLaunch.gls_tender_id.isnot(None)
        ).subquery()

        # Query GLS tenders: launched AND not linked
        results = db.session.query(
            GLSTender.market_segment,
            func.sum(GLSTender.estimated_units).label('total_units')
        ).filter(
            GLSTender.status == 'launched',
            ~GLSTender.id.in_(linked_gls_ids_subquery.select())  # NOT linked - use .select() to avoid SAWarning
        ).group_by(
            GLSTender.market_segment
        ).all()

        region_units = {}
        for row in results:
            region = row.market_segment or 'Unknown'
            if region in ['CCR', 'RCR', 'OCR'] and row.total_units:
                region_units[region] = int(row.total_units)

        return region_units
    except Exception as e:
        logger.warning(f"Could not fetch GLS pipeline: {e}")
        return {}


# =============================================================================
# PRIVATE HELPERS - DATA TRANSFORMATION
# =============================================================================

def _merge_district_data(
    unsold_by_district: Dict[str, int],
    upcoming_by_district: Dict[str, int]
) -> Dict[str, Dict[str, Any]]:
    """
    Merge unsold inventory and upcoming launches into district-level records.

    Returns:
        {
            "D01": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply, region },
            ...
        }

    Note: GLS pipeline is only available at region level, so glsPipeline=0 for all districts.
    """
    imports = _get_imports()
    get_region_for_district = imports['get_region_for_district']

    # Collect all districts
    all_districts = set(unsold_by_district.keys()) | set(upcoming_by_district.keys())

    result = {}
    for district in sorted(all_districts):  # Sorted for deterministic output
        unsold = unsold_by_district.get(district, 0)
        upcoming = upcoming_by_district.get(district, 0)

        result[district] = {
            "unsoldInventory": unsold,
            "upcomingLaunches": upcoming,
            "glsPipeline": 0,  # GLS is region-level only
            "totalEffectiveSupply": unsold + upcoming,
            "region": get_region_for_district(district)
        }

    return result


def _rollup_by_region(
    by_district: Dict[str, Dict[str, Any]],
    gls_by_region: Dict[str, int],
    include_gls: bool
) -> Dict[str, Dict[str, Any]]:
    """
    Roll up district data to region level and add GLS pipeline.

    Always includes CCR, RCR, OCR even if values are 0.

    Returns:
        {
            "CCR": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply, components },
            "RCR": { ... },
            "OCR": { ... }
        }
    """
    # Initialize all regions with zeros
    regions = {
        "CCR": {"unsoldInventory": 0, "upcomingLaunches": 0, "glsPipeline": 0},
        "RCR": {"unsoldInventory": 0, "upcomingLaunches": 0, "glsPipeline": 0},
        "OCR": {"unsoldInventory": 0, "upcomingLaunches": 0, "glsPipeline": 0},
    }

    # Sum district values into regions
    for district, data in by_district.items():
        region = data["region"]
        if region in regions:
            regions[region]["unsoldInventory"] += data["unsoldInventory"]
            regions[region]["upcomingLaunches"] += data["upcomingLaunches"]

    # Add GLS pipeline (region-level only)
    if include_gls:
        for region, units in gls_by_region.items():
            if region in regions:
                regions[region]["glsPipeline"] = units

    # Compute totals and add components list
    result = {}
    for region, data in regions.items():
        gls = data["glsPipeline"] if include_gls else 0
        total = data["unsoldInventory"] + data["upcomingLaunches"] + gls

        components = ["unsoldInventory", "upcomingLaunches"]
        if include_gls:
            components.append("glsPipeline")

        result[region] = {
            "unsoldInventory": data["unsoldInventory"],
            "upcomingLaunches": data["upcomingLaunches"],
            "glsPipeline": gls,
            "totalEffectiveSupply": total,
            "components": components
        }

    return result


def _compute_totals(by_region: Dict[str, Dict[str, Any]]) -> Dict[str, int]:
    """
    Compute grand totals from region data.

    Returns:
        { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply }
    """
    totals = {
        "unsoldInventory": 0,
        "upcomingLaunches": 0,
        "glsPipeline": 0,
        "totalEffectiveSupply": 0
    }

    for region_data in by_region.values():
        totals["unsoldInventory"] += region_data["unsoldInventory"]
        totals["upcomingLaunches"] += region_data["upcomingLaunches"]
        totals["glsPipeline"] += region_data["glsPipeline"]
        totals["totalEffectiveSupply"] += region_data["totalEffectiveSupply"]

    return totals


def _detect_overlaps(
    unsold_by_district: Dict[str, int],
    upcoming_by_district: Dict[str, int],
    gls_by_region: Dict[str, int]
) -> List[str]:
    """
    Detect potential data overlaps or quality issues.

    Returns:
        List of warning messages (empty if no issues)
    """
    warnings = []

    # Check for suspiciously high values
    for district, units in unsold_by_district.items():
        if units > 10000:
            warnings.append(f"Unusually high unsold inventory in {district}: {units} units")

    for district, units in upcoming_by_district.items():
        if units > 10000:
            warnings.append(f"Unusually high upcoming launches in {district}: {units} units")

    # GLS should not exceed expected pipeline
    total_gls = sum(gls_by_region.values())
    if total_gls > 50000:
        warnings.append(f"Unusually high GLS pipeline: {total_gls} units")

    return warnings


def _build_meta(
    launch_year: int,
    include_gls: bool,
    warnings: List[str]
) -> Dict[str, Any]:
    """
    Build metadata for the response.
    """
    formula = "unsoldInventory + upcomingLaunches"
    if include_gls:
        formula += " + glsPipeline"

    return {
        "launchYear": launch_year,
        "includeGls": include_gls,
        "computedAs": formula,
        "asOfDate": date.today().isoformat(),
        "warnings": warnings
    }


# =============================================================================
# PROJECT-LEVEL HELPERS
# =============================================================================

def _get_unsold_inventory_with_projects() -> tuple:
    """
    Get unsold inventory with project-level breakdown.

    Returns:
        Tuple of (district_totals: Dict[str, int], projects: List[Dict])
        projects: [{ name, district, region, unsold, total_units, sold }]
    """
    try:
        imports = _get_imports()
        db = imports['db']
        func = imports['func']
        SALE_TYPE_NEW = imports['SALE_TYPE_NEW']
        get_region_for_district = imports['get_region_for_district']

        from services.new_launch_units import get_new_launch_projects
        from models.transaction import Transaction

        # Get all projects that are still new launches (no resales yet)
        new_launch_projects = get_new_launch_projects()

        if not new_launch_projects:
            return {}, []

        # Build project name → (total_units, district) mapping
        project_data = {}
        for project_info in new_launch_projects:
            project_name = project_info.get('project_name')
            total_units = project_info.get('total_units') or 0
            district = project_info.get('district')

            if not project_name or not district:
                continue

            # Normalize district format
            d = district.upper().strip()
            if not d.startswith('D'):
                d = f'D{d.zfill(2)}'

            project_data[project_name.upper()] = {
                'original_name': project_name,
                'total_units': total_units,
                'district': d
            }

        if not project_data:
            return {}, []

        # Get all project names as a list
        project_names = list(project_data.keys())

        # Single bulk query: count New Sale transactions per project
        results = db.session.query(
            func.upper(Transaction.project_name).label('project_name'),
            func.count(Transaction.id).label('sold_count')
        ).filter(
            func.upper(Transaction.project_name).in_(project_names),
            Transaction.sale_type == SALE_TYPE_NEW,
        ).group_by(
            func.upper(Transaction.project_name)
        ).all()

        # Build sold count lookup
        sold_counts = {row.project_name: row.sold_count for row in results}

        # Calculate unsold per district AND build project list
        district_totals = defaultdict(int)
        projects = []

        for project_name_upper, data in project_data.items():
            sold = sold_counts.get(project_name_upper, 0)
            unsold = max(0, data['total_units'] - sold)
            district = data['district']
            region = get_region_for_district(district)

            if unsold > 0:
                district_totals[district] += unsold
                projects.append({
                    'name': data['original_name'],
                    'district': district,
                    'region': region,
                    'unsold': unsold,
                    'total_units': data['total_units'],
                    'sold': sold,
                    'category': 'unsold'
                })

        return dict(district_totals), projects
    except Exception as e:
        logger.warning(f"Could not fetch unsold inventory with projects: {e}")
        import traceback
        logger.warning(traceback.format_exc())
        return {}, []


def _get_upcoming_launches_with_projects(launch_year: int) -> tuple:
    """
    Get upcoming launches with project-level breakdown.

    Args:
        launch_year: Filter by launch year

    Returns:
        Tuple of (district_totals: Dict[str, int], projects: List[Dict])
        projects: [{ name, district, region, units, expected_launch_date }]
    """
    imports = _get_imports()
    db = imports['db']
    func = imports['func']
    get_region_for_district = imports['get_region_for_district']

    try:
        from models.upcoming_launch import UpcomingLaunch

        # Query all projects for the year
        results = db.session.query(
            UpcomingLaunch.project_name,
            UpcomingLaunch.district,
            UpcomingLaunch.total_units,
            UpcomingLaunch.expected_launch_date
        ).filter(
            UpcomingLaunch.launch_year == launch_year
        ).all()

        district_totals = defaultdict(int)
        projects = []

        for row in results:
            if not row.district or not row.total_units:
                continue

            # Normalize district format
            d = row.district.upper().strip()
            if not d.startswith('D'):
                d = f'D{d.zfill(2)}'

            units = int(row.total_units)
            region = get_region_for_district(d)

            # Derive quarter from expected_launch_date if available
            launch_quarter = None
            if row.expected_launch_date:
                launch_quarter = f"Q{((row.expected_launch_date.month - 1) // 3) + 1}"

            district_totals[d] += units
            projects.append({
                'name': row.project_name or 'Unknown Project',
                'district': d,
                'region': region,
                'units': units,
                'launch_quarter': launch_quarter,
                'category': 'upcoming'
            })

        return dict(district_totals), projects
    except Exception as e:
        logger.warning(f"Could not fetch upcoming launches with projects: {e}")
        return {}, []


def _merge_district_data_with_projects(
    unsold_by_district: Dict[str, int],
    upcoming_by_district: Dict[str, int],
    unsold_projects: List[Dict],
    upcoming_projects: List[Dict]
) -> Dict[str, Dict[str, Any]]:
    """
    Merge unsold inventory and upcoming launches into district-level records
    with project-level breakdown.

    Returns:
        {
            "D01": {
                unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply,
                region, projects: [{ name, units, category }, ...]
            },
            ...
        }
    """
    imports = _get_imports()
    get_region_for_district = imports['get_region_for_district']

    # Collect all districts
    all_districts = set(unsold_by_district.keys()) | set(upcoming_by_district.keys())

    # Group projects by district
    projects_by_district = defaultdict(list)
    for project in unsold_projects:
        projects_by_district[project['district']].append({
            'name': project['name'],
            'units': project['unsold'],
            'category': 'unsold',
            'total_units': project.get('total_units'),
            'sold': project.get('sold')
        })
    for project in upcoming_projects:
        projects_by_district[project['district']].append({
            'name': project['name'],
            'units': project['units'],
            'category': 'upcoming',
            'launch_quarter': project.get('launch_quarter')
        })

    result = {}
    for district in sorted(all_districts):  # Sorted for deterministic output
        unsold = unsold_by_district.get(district, 0)
        upcoming = upcoming_by_district.get(district, 0)

        # Sort projects: unsold first, then upcoming, then by units desc
        district_projects = projects_by_district.get(district, [])
        district_projects.sort(key=lambda p: (
            0 if p['category'] == 'unsold' else 1,
            -p['units']
        ))

        result[district] = {
            "unsoldInventory": unsold,
            "upcomingLaunches": upcoming,
            "glsPipeline": 0,  # GLS is region-level only
            "totalEffectiveSupply": unsold + upcoming,
            "region": get_region_for_district(district),
            "projects": district_projects
        }

    return result
