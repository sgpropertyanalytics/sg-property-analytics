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
    median_psf: Optional[float]


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
    """
    Transaction-based resale metrics.

    Note: Turnover values are displayed as "X transactions per 100 units" in UI,
    NOT as percentages. The *_pct suffix is internal naming only.
    """
    total_resale_transactions: int
    resales_12m: int
    market_turnover_pct: Optional[float]   # total_resale_transactions / total_units × 100
    recent_turnover_pct: Optional[float]   # resales_12m / total_units × 100


@dataclass
class RiskAssessment:
    """
    Liquidity zone assessment.

    Zones based on turnover per 100 units:
    - 'low' (<5): Low Liquidity - harder to exit
    - 'healthy' (5-15): Healthy Liquidity - optimal for exit
    - 'high' (>15): Elevated Turnover - possible volatility
    """
    market_turnover_zone: str   # 'low', 'healthy', 'high', 'unknown'
    recent_turnover_zone: str   # 'low', 'healthy', 'high', 'unknown'
    overall_risk: str           # 'low', 'moderate', 'elevated', 'unknown'
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

def query_basic_stats(db, text, project_name: str, twelve_months_ago: date, sale_type_db: str = None) -> Optional[BasicStats]:
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
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price / NULLIF(area_sqft, 0)) as median_psf
        FROM transactions
        WHERE project_name = :project_name
          AND COALESCE(is_outlier, false) = false
          AND sale_type = :sale_type_db
        GROUP BY district
    """), {
        "project_name": project_name,
        "twelve_months_ago": twelve_months_ago,
        "sale_type_db": sale_type_db
    }).fetchone()

    if not result:
        return None

    return BasicStats(
        district=result[0],
        first_resale_date=result[1],  # Already a date object from transaction_date column
        total_resale_transactions=result[2] or 0,
        resales_12m=result[3] or 0,
        median_psf=float(result[4]) if result[4] else None
    )


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


def calculate_turnover_metrics(
    total_resale_transactions: int,
    resales_12m: int,
    total_units: Optional[int]
) -> Tuple[Optional[float], Optional[float]]:
    """
    Calculate turnover metrics as transactions per 100 units.

    Returns:
        (market_turnover_pct, recent_turnover_pct)
        - market_turnover_pct: total_resale_transactions / total_units × 100
        - recent_turnover_pct: resales_12m / total_units × 100

    Note: These values should be displayed in UI as "X transactions per 100 units",
    NOT as "X%" - the suffix is internal naming only.
    """
    if not total_units or total_units <= 0:
        return (None, None)

    market_turnover = round((total_resale_transactions / total_units) * 100, 1)
    recent_turnover = round((resales_12m / total_units) * 100, 1)

    return (market_turnover, recent_turnover)


def get_liquidity_zone(turnover_pct: Optional[float]) -> str:
    """
    Determine liquidity zone from turnover percentage.

    Zones based on transactions per 100 units:
    - 'low' (<5): Low Liquidity - harder to exit
    - 'healthy' (5-15): Healthy Liquidity - optimal for exit (GREEN)
    - 'high' (>15): Elevated Turnover - possible volatility

    Note: GREEN = moderate/healthy, NOT "more is better"
    """
    if turnover_pct is None:
        return "unknown"
    if turnover_pct < 5:
        return "low"
    if turnover_pct <= 15:
        return "healthy"
    return "high"


def get_overall_risk(market_zone: str, recent_zone: str) -> str:
    """
    Determine overall risk from liquidity zones.

    Risk assessment:
    - 'low': Both zones healthy, or market healthy with any recent
    - 'moderate': Mixed zones
    - 'elevated': Either zone at extreme (low or high)
    - 'unknown': Missing data
    """
    if market_zone == "unknown" or recent_zone == "unknown":
        return "unknown"

    # Healthy market turnover is the key indicator
    if market_zone == "healthy":
        return "low"

    # Both extremes (low or high) indicate risk
    if market_zone == "low":
        return "elevated" if recent_zone == "low" else "moderate"
    if market_zone == "high":
        return "elevated" if recent_zone == "high" else "moderate"

    return "moderate"


def generate_interpretation(
    market_turnover: Optional[float],
    recent_turnover: Optional[float],
    market_zone: str,
    recent_zone: str
) -> str:
    """
    Generate human-readable liquidity interpretation.

    Uses neutral, institutional language focused on liquidity quality.
    Avoids emotional terms like "danger", "panic", "distress", "hot market".
    """
    if market_turnover is None:
        return "Turnover data unavailable. Total units information required for calculation."

    # Market turnover description
    if market_zone == "low":
        market_desc = f"a thin resale market with {market_turnover} transactions per 100 units"
        exit_note = "Exit may require time or price concessions."
    elif market_zone == "healthy":
        market_desc = f"a balanced resale market with {market_turnover} transactions per 100 units"
        exit_note = "Favorable conditions for both buying and selling."
    else:  # high
        market_desc = f"a high-activity resale market with {market_turnover} transactions per 100 units"
        exit_note = "Consider whether activity reflects sustained demand or exit clustering."

    return f"This is {market_desc}. {exit_note}"


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
    total_resale_transactions: int,
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
        is_thin_data=total_resale_transactions < 10,
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
    basic_stats = query_basic_stats(db, text, project_name, twelve_months_ago)

    if not basic_stats:
        return (None, {
            "project_name": project_name,
            "error": "No resale transactions found for this project",
            "data_quality": {"completeness": "no_resales"}
        }, 404)

    # Query bedroom diversity
    bedroom_types = query_bedroom_diversity(db, text, project_name)

    # Calculate property age
    property_age, age_source = calculate_property_age(
        unit_data.top_year, basic_stats.first_resale_date, current_year
    )

    # Calculate turnover metrics
    market_turnover, recent_turnover = calculate_turnover_metrics(
        basic_stats.total_resale_transactions,
        basic_stats.resales_12m,
        unit_data.total_units
    )

    # Determine liquidity zones
    market_zone = get_liquidity_zone(market_turnover)
    recent_zone = get_liquidity_zone(recent_turnover)
    overall_risk = get_overall_risk(market_zone, recent_zone)

    # Generate interpretation
    interpretation = generate_interpretation(
        market_turnover, recent_turnover, market_zone, recent_zone
    )

    # Calculate gating flags
    gating_flags = calculate_gating_flags(
        unit_data.total_units, property_age, basic_stats.median_psf,
        basic_stats.district, basic_stats.total_resale_transactions, bedroom_types
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
        total_resale_transactions=basic_stats.total_resale_transactions,
        resales_12m=basic_stats.resales_12m,
        market_turnover_pct=market_turnover,
        recent_turnover_pct=recent_turnover
    )

    risk_assessment = RiskAssessment(
        market_turnover_zone=market_zone,
        recent_turnover_zone=recent_zone,
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
