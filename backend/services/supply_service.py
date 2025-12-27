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
                "D01": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply, region },
                ...
            },
            "totals": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply },
            "meta": { launchYear, includeGls, computedAs, asOfDate, warnings }
        }
    """
    # Fetch each category (mutually exclusive)
    unsold_by_district = _get_unsold_inventory_by_district()
    upcoming_by_district = _get_upcoming_launches_by_district(launch_year)
    gls_by_region = _get_gls_pipeline_by_region() if include_gls else {}

    # Merge into district-level data
    by_district = _merge_district_data(unsold_by_district, upcoming_by_district)

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
    imports = _get_imports()
    db = imports['db']
    func = imports['func']
    SALE_TYPE_NEW = imports['SALE_TYPE_NEW']
    exclude_outliers = imports['exclude_outliers']

    from services.new_launch_units import get_new_launch_projects
    from models.transaction import Transaction

    # Get all projects that are still new launches (no resales yet)
    new_launch_projects = get_new_launch_projects()

    if not new_launch_projects:
        return {}

    result = defaultdict(int)

    for project_info in new_launch_projects:
        project_name = project_info.get('project_name')
        total_units = project_info.get('total_units') or 0
        district = project_info.get('district')

        if not project_name or not district:
            continue

        # Count new sale transactions for this project
        new_sale_count = db.session.query(func.count(Transaction.id)).filter(
            func.upper(Transaction.project_name) == project_name.upper(),
            Transaction.sale_type == SALE_TYPE_NEW,
            exclude_outliers(Transaction)
        ).scalar() or 0

        # Unsold = total - sold
        unsold = max(0, total_units - new_sale_count)

        if unsold > 0:
            # Normalize district format
            d = district.upper().strip()
            if not d.startswith('D'):
                d = f'D{d.zfill(2)}'
            result[d] += unsold

    return dict(result)


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
