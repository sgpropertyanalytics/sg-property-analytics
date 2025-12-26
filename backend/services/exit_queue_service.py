"""
Exit Queue Risk Analysis Service

Provides exit queue risk metrics for condo resale market analysis.
Broken into layers:
- Query layer: SQL queries with defensive defaults
- Metric calculation: Pure functions for risk metrics
- Gating flags: Project characteristic flags

Note: Serialization is handled by schemas/api_contract.py for consistency.
"""

from datetime import datetime, date, timedelta
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass

from schemas.api_contract import SaleType


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class BasicStats:
    """Raw stats from transaction queries."""
    district: str
    first_resale_date: Optional[date]
    total_resale_transactions: int
    resales_12m: int
    resales_24m: int
    median_psf: Optional[float]


@dataclass
class UniqueUnitsStats:
    """Unique unit counts."""
    total: int
    last_12m: int


@dataclass
class UnitData:
    """Data from hybrid unit lookup (CSV, database, or estimation)."""
    total_units: Optional[int]
    top_year: Optional[int]
    tenure: Optional[str]
    developer: Optional[str]
    unit_source: Optional[str] = None  # 'csv', 'database', 'estimated', or None
    confidence: Optional[str] = None    # 'high', 'medium', 'low', or None
    note: Optional[str] = None          # Human-readable explanation


@dataclass
class ResaleMetrics:
    """Calculated resale metrics."""
    unique_resale_units_total: int
    unique_resale_units_12m: int
    total_resale_transactions: int
    resale_maturity_pct: Optional[float]
    active_exit_pressure_pct: Optional[float]
    absorption_speed_days: Optional[float]
    transactions_per_100_units: Optional[float]
    resales_last_24m: int


@dataclass
class RiskAssessment:
    """Risk zone assessment."""
    maturity_zone: str  # 'green', 'yellow', 'red', 'unknown'
    pressure_zone: str  # 'green', 'yellow', 'red', 'unknown'
    quadrant: str
    overall_risk: str  # 'low', 'moderate', 'elevated', 'unknown'
    interpretation: str


@dataclass
class GatingFlags:
    """Project characteristic flags for gating warnings."""
    is_boutique: bool
    is_brand_new: bool
    is_ultra_luxury: bool
    is_thin_data: bool
    unit_type_mixed: bool


@dataclass
class DataQuality:
    """Data completeness info."""
    has_top_year: bool
    has_total_units: bool
    completeness: str  # 'complete', 'partial', 'no_resales'
    sample_window_months: int
    warnings: list
    unit_source: Optional[str] = None   # 'csv', 'database', 'estimated', or None
    unit_confidence: Optional[str] = None  # 'high', 'medium', 'low', or None
    unit_note: Optional[str] = None     # Human-readable explanation


@dataclass
class PropertyFundamentals:
    """Property basic info."""
    total_units: Optional[int]
    top_year: Optional[int]
    property_age_years: Optional[int]
    age_source: str  # 'top_date', 'first_resale', 'not_topped_yet', 'insufficient_data'
    tenure: Optional[str]
    district: str
    developer: Optional[str]
    first_resale_date: Optional[date]


# =============================================================================
# QUERY LAYER - SQL queries with defensive defaults
# =============================================================================

def query_basic_stats(db, text, project_name: str, twelve_months_ago: date, twenty_four_months_ago: date, sale_type_db: str = None) -> Optional[BasicStats]:
    """
    Query basic transaction statistics for a project.
    Uses COALESCE for is_outlier NULL safety and SaleType.to_db() for sale_type normalization.

    Args:
        sale_type_db: DB value for sale_type filter (default: 'Resale' via SaleType.to_db)
    """
    # Use SaleType enum mapping for case-insensitive DB value
    if sale_type_db is None:
        sale_type_db = SaleType.to_db(SaleType.RESALE)  # 'Resale'

    result = db.session.execute(text("""
        SELECT
            district,
            MIN(transaction_date) as first_resale_date,
            COUNT(*) as total_resale_transactions,
            COUNT(*) FILTER (WHERE transaction_date >= :twelve_months_ago) as resales_12m,
            COUNT(*) FILTER (WHERE transaction_date >= :twenty_four_months_ago) as resales_24m,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price / NULLIF(area_sqft, 0)) as median_psf
        FROM transactions
        WHERE project_name = :project_name
          AND COALESCE(is_outlier, false) = false
          AND sale_type = :sale_type_db
        GROUP BY district
    """), {
        "project_name": project_name,
        "twelve_months_ago": twelve_months_ago,
        "twenty_four_months_ago": twenty_four_months_ago,
        "sale_type_db": sale_type_db
    }).fetchone()

    if not result:
        return None

    return BasicStats(
        district=result[0],
        first_resale_date=result[1],  # Already a date object from transaction_date column
        total_resale_transactions=result[2] or 0,
        resales_12m=result[3] or 0,
        resales_24m=result[4] or 0,
        median_psf=float(result[5]) if result[5] else None
    )


def query_unique_units(db, text, project_name: str, twelve_months_ago: date, sale_type_db: str = None) -> UniqueUnitsStats:
    """
    Query unique unit counts using floor_range + area_sqft approximation.
    Uses COALESCE for NULL safety.
    """
    if sale_type_db is None:
        sale_type_db = SaleType.to_db(SaleType.RESALE)

    result = db.session.execute(text("""
        SELECT
            COUNT(DISTINCT COALESCE(floor_range, 'unknown') || '-' || CAST(COALESCE(area_sqft, 0) AS VARCHAR)) as unique_units,
            COUNT(DISTINCT CASE WHEN transaction_date >= :twelve_months_ago
                  THEN COALESCE(floor_range, 'unknown') || '-' || CAST(COALESCE(area_sqft, 0) AS VARCHAR) END) as unique_units_12m
        FROM transactions
        WHERE project_name = :project_name
          AND COALESCE(is_outlier, false) = false
          AND sale_type = :sale_type_db
    """), {
        "project_name": project_name,
        "twelve_months_ago": twelve_months_ago,
        "sale_type_db": sale_type_db
    }).fetchone()

    return UniqueUnitsStats(
        total=result[0] if result and result[0] else 0,
        last_12m=result[1] if result and result[1] else 0
    )


def query_absorption_speed(db, text, project_name: str, twenty_four_months_ago: date, sale_type_db: str = None) -> Optional[float]:
    """
    Calculate median days between resales for the same unit.
    Returns None if insufficient data.
    """
    if sale_type_db is None:
        sale_type_db = SaleType.to_db(SaleType.RESALE)

    result = db.session.execute(text("""
        WITH unit_resales AS (
            SELECT
                COALESCE(floor_range, 'unknown') || '-' || CAST(COALESCE(area_sqft, 0) AS VARCHAR) as unit_key,
                transaction_date as sale_date,
                LAG(transaction_date) OVER (
                    PARTITION BY COALESCE(floor_range, 'unknown') || '-' || CAST(COALESCE(area_sqft, 0) AS VARCHAR)
                    ORDER BY transaction_date
                ) as prev_date
            FROM transactions
            WHERE project_name = :project_name
              AND COALESCE(is_outlier, false) = false
              AND sale_type = :sale_type_db
              AND transaction_date >= :twenty_four_months_ago
        )
        SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY (sale_date - prev_date)
        ) as median_days
        FROM unit_resales
        WHERE prev_date IS NOT NULL
    """), {
        "project_name": project_name,
        "twenty_four_months_ago": twenty_four_months_ago,
        "sale_type_db": sale_type_db
    }).fetchone()

    if result and result[0]:
        return float(result[0])
    return None


def query_bedroom_diversity(db, text, project_name: str, sale_type_db: str = None) -> int:
    """
    Count distinct bedroom types for unit-type-mixed flag.
    Uses COALESCE for NULL safety.
    """
    if sale_type_db is None:
        sale_type_db = SaleType.to_db(SaleType.RESALE)

    result = db.session.execute(text("""
        SELECT COUNT(DISTINCT COALESCE(bedroom_count, 0)) as bedroom_types
        FROM transactions
        WHERE project_name = :project_name
          AND COALESCE(is_outlier, false) = false
          AND sale_type = :sale_type_db
    """), {"project_name": project_name, "sale_type_db": sale_type_db}).fetchone()

    return result[0] if result and result[0] else 0


# =============================================================================
# METRIC CALCULATION - Pure functions
# =============================================================================

def calculate_property_age(top_year: Optional[int], first_resale_date: Optional[date], current_year: int) -> Tuple[Optional[int], str]:
    """
    Calculate property age and determine source.
    Returns (age_years, age_source).
    """
    if top_year:
        if top_year <= current_year:
            return (current_year - top_year, "top_date")
        else:
            return (None, "not_topped_yet")
    elif first_resale_date:
        return (current_year - first_resale_date.year, "first_resale")
    else:
        return (None, "insufficient_data")


def calculate_percentages(
    unique_resale_units_total: int,
    unique_resale_units_12m: int,
    total_resale_transactions: int,
    total_units: Optional[int]
) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Calculate resale percentages.
    Returns (maturity_pct, pressure_pct, transactions_per_100).
    """
    if not total_units or total_units <= 0:
        return (None, None, None)

    maturity_pct = round((unique_resale_units_total / total_units) * 100, 1)
    pressure_pct = round((unique_resale_units_12m / total_units) * 100, 1)
    transactions_per_100 = round((total_resale_transactions / total_units) * 100, 1)

    return (maturity_pct, pressure_pct, transactions_per_100)


def get_maturity_zone(pct: Optional[float]) -> str:
    """Determine maturity zone from percentage."""
    if pct is None:
        return "unknown"
    if pct >= 40:
        return "green"
    if pct >= 15:
        return "yellow"
    return "red"


def get_pressure_zone(pct: Optional[float]) -> str:
    """Determine pressure zone from percentage."""
    if pct is None:
        return "unknown"
    if pct < 5:
        return "green"
    if pct < 10:
        return "yellow"
    return "red"


def get_quadrant_and_risk(mat_zone: str, press_zone: str) -> Tuple[str, str]:
    """
    Determine quadrant and overall risk from zones.
    Returns (quadrant, overall_risk).
    """
    if mat_zone == "green" and press_zone == "green":
        return ("proven_low_pressure", "low")
    if mat_zone == "red" and press_zone == "red":
        return ("immature_high_pressure", "elevated")
    if mat_zone == "green" and press_zone == "red":
        return ("proven_high_pressure", "moderate")
    if mat_zone == "red" and press_zone == "green":
        return ("immature_low_pressure", "moderate")
    if mat_zone == "unknown" or press_zone == "unknown":
        return ("insufficient_data", "unknown")
    return ("developing", "moderate")


def generate_interpretation(
    mat_pct: Optional[float],
    press_pct: Optional[float],
    mat_zone: str,
    press_zone: str,
    quadrant: str
) -> str:
    """Generate human-readable risk interpretation."""
    if mat_pct is None or press_pct is None:
        return "Cannot generate risk assessment without total units data. Showing raw transaction counts only."

    mat_desc = {
        "green": f"a proven resale market with {mat_pct}% of units having changed hands",
        "yellow": f"a developing resale market with {mat_pct}% of units having resold",
        "red": f"an early-stage resale market with only {mat_pct}% of units having changed hands"
    }

    press_desc = {
        "green": f"Low recent activity ({press_pct}% in 12m) suggests minimal exit pressure",
        "yellow": f"Moderate activity ({press_pct}% in 12m) indicates some selling interest",
        "red": f"High activity ({press_pct}% in 12m) suggests significant exit pressure"
    }

    base = f"This is {mat_desc.get(mat_zone, 'an uncertain market')}. {press_desc.get(press_zone, 'Activity levels unclear')}."

    if quadrant == "proven_low_pressure":
        base += " This is generally a favorable exit queue position."
    elif quadrant == "immature_high_pressure":
        base += " Exercise caution - price discovery is limited while sellers compete."

    return base


def calculate_sample_window_months(first_resale_date: Optional[date], current_date: date) -> int:
    """Calculate months between first resale and now."""
    if not first_resale_date:
        return 0
    return (current_date.year - first_resale_date.year) * 12 + (current_date.month - first_resale_date.month)


# =============================================================================
# GATING FLAGS
# =============================================================================

def calculate_gating_flags(
    total_units: Optional[int],
    property_age_years: Optional[int],
    median_psf: Optional[float],
    district: str,
    unique_resale_units_total: int,
    resales_24m: int,
    bedroom_types: int
) -> GatingFlags:
    """Calculate all gating flags for the project."""
    return GatingFlags(
        is_boutique=total_units is not None and total_units < 50,
        is_brand_new=property_age_years is not None and property_age_years < 2,
        is_ultra_luxury=(
            (median_psf is not None and median_psf > 3000) or
            (district in ['D09', 'D10', 'D11'])
        ),
        is_thin_data=unique_resale_units_total < 8 or resales_24m < 10,
        unit_type_mixed=bedroom_types > 1
    )


def generate_warnings(
    total_units: Optional[int],
    top_year: Optional[int],
    is_thin_data: bool
) -> list:
    """Generate data quality warnings."""
    warnings = []
    if not total_units:
        warnings.append("Total units data not available - cannot calculate percentages")
    if not top_year:
        warnings.append("TOP year not available - age calculated from first resale")
    if is_thin_data:
        warnings.append("Limited transaction data - interpret with caution")
    return warnings


# =============================================================================
# RESULT CONTAINER
# =============================================================================

@dataclass
class ExitQueueResult:
    """Complete result from exit queue analysis."""
    project_name: str
    data_quality: DataQuality
    fundamentals: PropertyFundamentals
    resale_metrics: ResaleMetrics
    risk_assessment: RiskAssessment
    gating_flags: GatingFlags


# =============================================================================
# MAIN ORCHESTRATOR
# =============================================================================

def get_exit_queue_analysis(
    db,
    text,
    project_name: str,
    get_units_for_project
) -> Tuple[Optional[ExitQueueResult], Optional[Dict[str, Any]], Optional[int]]:
    """
    Main orchestrator for exit queue analysis.

    Returns:
        (result, error_response, status_code)
        - On success: (ExitQueueResult, None, None)
        - On error: (None, error_dict, status_code)
    """
    current_year = datetime.now().year
    current_date = datetime.now().date()
    twelve_months_ago = current_date - timedelta(days=365)
    twenty_four_months_ago = current_date - timedelta(days=730)

    # Get unit data from hybrid lookup (CSV → database → estimation)
    unit_data_raw = get_units_for_project(project_name)
    unit_data = UnitData(
        total_units=unit_data_raw.get('total_units') if unit_data_raw else None,
        top_year=unit_data_raw.get('top') if unit_data_raw else None,
        tenure=unit_data_raw.get('tenure') if unit_data_raw else None,
        developer=unit_data_raw.get('developer') if unit_data_raw else None,
        unit_source=unit_data_raw.get('unit_source') if unit_data_raw else None,
        confidence=unit_data_raw.get('confidence') if unit_data_raw else None,
        note=unit_data_raw.get('note') if unit_data_raw else None,
    )

    # Query basic stats
    basic_stats = query_basic_stats(db, text, project_name, twelve_months_ago, twenty_four_months_ago)

    if not basic_stats:
        return (None, {
            "project_name": project_name,
            "error": "No resale transactions found for this project",
            "data_quality": {"completeness": "no_resales"}
        }, 404)

    # Query unique units
    unique_units = query_unique_units(db, text, project_name, twelve_months_ago)

    # Query absorption speed (only if enough data)
    absorption_speed = None
    if basic_stats.resales_24m >= 12:
        absorption_speed = query_absorption_speed(db, text, project_name, twenty_four_months_ago)

    # Query bedroom diversity
    bedroom_types = query_bedroom_diversity(db, text, project_name)

    # Calculate property age
    property_age, age_source = calculate_property_age(
        unit_data.top_year, basic_stats.first_resale_date, current_year
    )

    # Calculate percentages
    maturity_pct, pressure_pct, trans_per_100 = calculate_percentages(
        unique_units.total, unique_units.last_12m,
        basic_stats.total_resale_transactions, unit_data.total_units
    )

    # Determine risk zones
    maturity_zone = get_maturity_zone(maturity_pct)
    pressure_zone = get_pressure_zone(pressure_pct)
    quadrant, overall_risk = get_quadrant_and_risk(maturity_zone, pressure_zone)

    # Generate interpretation
    interpretation = generate_interpretation(
        maturity_pct, pressure_pct, maturity_zone, pressure_zone, quadrant
    )

    # Calculate gating flags
    gating_flags = calculate_gating_flags(
        unit_data.total_units, property_age, basic_stats.median_psf,
        basic_stats.district, unique_units.total, basic_stats.resales_24m, bedroom_types
    )

    # Generate warnings
    warnings = generate_warnings(unit_data.total_units, unit_data.top_year, gating_flags.is_thin_data)

    # Calculate sample window
    sample_window = calculate_sample_window_months(basic_stats.first_resale_date, current_date)

    # Build data objects
    data_quality = DataQuality(
        has_top_year=unit_data.top_year is not None,
        has_total_units=unit_data.total_units is not None,
        completeness="complete" if (unit_data.top_year and unit_data.total_units) else "partial",
        sample_window_months=sample_window,
        warnings=warnings,
        unit_source=unit_data.unit_source,
        unit_confidence=unit_data.confidence,
        unit_note=unit_data.note,
    )

    fundamentals = PropertyFundamentals(
        total_units=unit_data.total_units,
        top_year=unit_data.top_year,
        property_age_years=property_age,
        age_source=age_source,
        tenure=unit_data.tenure,
        district=basic_stats.district,
        developer=unit_data.developer,
        first_resale_date=basic_stats.first_resale_date
    )

    resale_metrics = ResaleMetrics(
        unique_resale_units_total=unique_units.total,
        unique_resale_units_12m=unique_units.last_12m,
        total_resale_transactions=basic_stats.total_resale_transactions,
        resale_maturity_pct=maturity_pct,
        active_exit_pressure_pct=pressure_pct,
        absorption_speed_days=absorption_speed,
        transactions_per_100_units=trans_per_100,
        resales_last_24m=basic_stats.resales_24m
    )

    risk_assessment = RiskAssessment(
        maturity_zone=maturity_zone,
        pressure_zone=pressure_zone,
        quadrant=quadrant,
        overall_risk=overall_risk,
        interpretation=interpretation
    )

    # Return the result dataclass (serialization handled by caller)
    result = ExitQueueResult(
        project_name=project_name,
        data_quality=data_quality,
        fundamentals=fundamentals,
        resale_metrics=resale_metrics,
        risk_assessment=risk_assessment,
        gating_flags=gating_flags
    )

    return (result, None, None)
