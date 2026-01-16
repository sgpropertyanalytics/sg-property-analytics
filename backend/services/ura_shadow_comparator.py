"""
URA Shadow Comparator - Compare API sync results vs baseline

Compares:
1. Count diffs by month/district/sale_type/property_type
2. PSF diffs (median/p95) by same cuts
3. Top N row mismatches with field-level diffs
4. Coverage: % rows present in both sets

Usage:
    from services.ura_shadow_comparator import URAShadowComparator

    comparator = URAShadowComparator(db_engine)

    # Compare a run against CSV baseline
    report = comparator.compare_run_vs_csv(run_id='abc-123')

    # Compare two API runs
    report = comparator.compare_runs(current_run_id='abc', baseline_run_id='xyz')
"""

import logging
from datetime import date, datetime, timedelta
from enum import Enum
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from sqlalchemy import text
from sqlalchemy.engine import Engine

# Public API
__all__ = [
    'URAShadowComparator',
    'ComparisonReport',
    'compare_api_vs_csv',
    'compare_run_vs_csv',
]


class FilterType(Enum):
    """Type of filter for comparison queries."""
    RUN_ID = 'run_id'
    SOURCE = 'source'


@dataclass
class SourceFilter:
    """
    Structured filter for comparison queries.

    Avoids SQL injection by separating filter type from value.
    Values are passed as parameters, not interpolated.
    """
    filter_type: FilterType
    value: str
    label: str  # For logging/reporting

    @classmethod
    def for_run(cls, run_id: str) -> 'SourceFilter':
        """Create filter for a specific sync run."""
        return cls(FilterType.RUN_ID, run_id, run_id)

    @classmethod
    def for_source(cls, source: str) -> 'SourceFilter':
        """Create filter for a source type (csv, ura_api)."""
        return cls(FilterType.SOURCE, source, source)

logger = logging.getLogger(__name__)


@dataclass
class ComparisonReport:
    """Structured comparison report."""

    # Identifiers
    current_source: str  # 'ura_api' or run_id
    baseline_source: str  # 'csv' or run_id
    comparison_date: date = field(default_factory=date.today)
    date_range_start: Optional[date] = None
    date_range_end: Optional[date] = None

    # Summary
    current_row_count: int = 0
    baseline_row_count: int = 0
    row_count_diff: int = 0
    row_count_diff_pct: float = 0.0

    # Count diffs by dimension
    count_by_month: Dict[str, Dict[str, int]] = field(default_factory=dict)
    count_by_district: Dict[str, Dict[str, int]] = field(default_factory=dict)
    count_by_sale_type: Dict[str, Dict[str, int]] = field(default_factory=dict)
    count_by_property_type: Dict[str, Dict[str, int]] = field(default_factory=dict)

    # PSF diffs
    psf_median_by_month: Dict[str, Dict[str, float]] = field(default_factory=dict)
    psf_p95_by_month: Dict[str, Dict[str, float]] = field(default_factory=dict)
    psf_median_by_district: Dict[str, Dict[str, float]] = field(default_factory=dict)

    # Row-level comparison
    coverage_pct: float = 0.0  # % rows present in both sets (by row_hash)
    missing_in_current: int = 0  # Rows in baseline but not in current
    missing_in_baseline: int = 0  # Rows in current but not in baseline
    ambiguous_matches: int = 0  # 1-to-many matches (row_hash with multiple rows)
    max_multiplicity: int = 1  # Highest row count for any single row_hash
    top_mismatches: List[Dict[str, Any]] = field(default_factory=list)

    # Overall assessment
    is_acceptable: bool = False
    issues: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON serialization."""
        import json

        def serialize_value(v):
            """Recursively serialize values for JSON."""
            if isinstance(v, (date, datetime)):
                return v.isoformat()
            elif isinstance(v, dict):
                return {k: serialize_value(val) for k, val in v.items()}
            elif isinstance(v, list):
                return [serialize_value(item) for item in v]
            return v

        result = asdict(self)
        # Recursively convert dates to ISO strings
        return {k: serialize_value(v) for k, v in result.items()}


class URAShadowComparator:
    """
    Compare URA API sync results against baseline (CSV or previous run).

    Thresholds for acceptable comparison:
    - Row count diff: < 5%
    - PSF median diff: < 2%
    - Coverage: > 95%
    """

    # Thresholds for acceptable comparison
    ROW_COUNT_DIFF_THRESHOLD_PCT = 5.0
    PSF_MEDIAN_DIFF_THRESHOLD_PCT = 2.0
    COVERAGE_THRESHOLD_PCT = 95.0

    def __init__(self, engine: Engine):
        """
        Initialize comparator.

        Args:
            engine: SQLAlchemy database engine
        """
        self.engine = engine

    def compare_run_vs_csv(
        self,
        run_id: str,
        date_range: Optional[Tuple[date, date]] = None,
        property_types: Optional[List[str]] = None
    ) -> ComparisonReport:
        """
        Compare an API sync run against CSV baseline data.

        Args:
            run_id: UUID of the URA sync run to compare
            date_range: Optional (start, end) date range to compare
            property_types: Optional list of property types to include

        Returns:
            ComparisonReport with detailed comparison results
        """
        return self._compare(
            current_filter=SourceFilter.for_run(run_id),
            baseline_filter=SourceFilter.for_source('csv'),
            date_range=date_range,
            property_types=property_types
        )

    def compare_api_vs_csv(
        self,
        date_range: Optional[Tuple[date, date]] = None,
        property_types: Optional[List[str]] = None
    ) -> ComparisonReport:
        """
        Compare all API data against all CSV data.

        Automatically uses the overlap window (intersection of date ranges)
        to ensure fair comparison between sources. This excludes CSV data
        from before API starts (Dec 2020 - Jan 2021) and API data after
        CSV ends (future months).

        Args:
            date_range: Optional (start, end) date range to compare.
                       If None, automatically uses overlap window.
            property_types: Optional list of property types to include

        Returns:
            ComparisonReport with detailed comparison results
        """
        # Auto-detect overlap window if no date range specified
        if date_range is None:
            from services.etl.fingerprint import get_overlap_window
            from models.database import db
            date_range = get_overlap_window(db.session)
            logger.info(f"Auto-detected overlap window: {date_range[0]} to {date_range[1]}")

        return self._compare(
            current_filter=SourceFilter.for_source('ura_api'),
            baseline_filter=SourceFilter.for_source('csv'),
            date_range=date_range,
            property_types=property_types
        )

    def compare_runs(
        self,
        current_run_id: str,
        baseline_run_id: str,
        date_range: Optional[Tuple[date, date]] = None
    ) -> ComparisonReport:
        """
        Compare two API sync runs.

        Args:
            current_run_id: UUID of the current run
            baseline_run_id: UUID of the baseline run
            date_range: Optional (start, end) date range to compare

        Returns:
            ComparisonReport with detailed comparison results
        """
        return self._compare(
            current_filter=SourceFilter.for_run(current_run_id),
            baseline_filter=SourceFilter.for_run(baseline_run_id),
            date_range=date_range
        )

    def _compare(
        self,
        current_filter: SourceFilter,
        baseline_filter: SourceFilter,
        date_range: Optional[Tuple[date, date]] = None,
        property_types: Optional[List[str]] = None
    ) -> ComparisonReport:
        """
        Core comparison logic.

        Args:
            current_filter: SourceFilter for current data
            baseline_filter: SourceFilter for baseline data
            date_range: Optional date range filter
            property_types: Optional property type filter
        """
        report = ComparisonReport(
            current_source=current_filter.label,
            baseline_source=baseline_filter.label
        )

        # Build common parameters - all values are parameterized, no interpolation
        common_params: Dict[str, Any] = {}

        if date_range:
            report.date_range_start = date_range[0]
            report.date_range_end = date_range[1]
            common_params['date_start'] = date_range[0]
            common_params['date_end'] = date_range[1]

        if property_types:
            # Validate property types against allowlist to prevent injection
            allowed_types = {'Condominium', 'Apartment', 'Executive Condominium'}
            validated_types = [t for t in property_types if t in allowed_types]
            if validated_types:
                common_params['property_types'] = tuple(validated_types)

        with self.engine.connect() as conn:
            # 1. Get total counts
            report.current_row_count = self._get_count(
                conn, current_filter, common_params
            )
            report.baseline_row_count = self._get_count(
                conn, baseline_filter, common_params
            )

            report.row_count_diff = report.current_row_count - report.baseline_row_count
            if report.baseline_row_count > 0:
                report.row_count_diff_pct = (
                    report.row_count_diff / report.baseline_row_count * 100
                )

            # 2. Count by dimensions
            report.count_by_month = self._get_count_by_dimension(
                conn, 'transaction_month', current_filter, baseline_filter, common_params
            )
            report.count_by_district = self._get_count_by_dimension(
                conn, 'district', current_filter, baseline_filter, common_params
            )
            report.count_by_sale_type = self._get_count_by_dimension(
                conn, 'sale_type', current_filter, baseline_filter, common_params
            )
            report.count_by_property_type = self._get_count_by_dimension(
                conn, 'property_type', current_filter, baseline_filter, common_params
            )

            # 3. PSF comparisons
            report.psf_median_by_month = self._get_psf_by_dimension(
                conn, 'transaction_month', current_filter, baseline_filter, common_params, 0.5
            )
            report.psf_p95_by_month = self._get_psf_by_dimension(
                conn, 'transaction_month', current_filter, baseline_filter, common_params, 0.95
            )
            report.psf_median_by_district = self._get_psf_by_dimension(
                conn, 'district', current_filter, baseline_filter, common_params, 0.5
            )

            # 4. Row-level coverage (by row_hash)
            coverage = self._get_row_coverage(
                conn, current_filter, baseline_filter, common_params
            )
            report.coverage_pct = coverage['coverage_pct']
            report.missing_in_current = coverage['missing_in_current']
            report.missing_in_baseline = coverage['missing_in_baseline']
            report.ambiguous_matches = coverage['ambiguous_matches']
            report.max_multiplicity = coverage['max_multiplicity']

            # 5. Top mismatches
            report.top_mismatches = self._get_top_mismatches(
                conn, current_filter, baseline_filter, common_params, limit=10
            )

        # 6. Assess overall acceptability
        self._assess_report(report)

        return report

    def _build_source_condition(self, filter: SourceFilter, param_prefix: str) -> Tuple[str, Dict[str, Any]]:
        """
        Build SQL condition and params for a source filter.

        Args:
            filter: The source filter
            param_prefix: Prefix for parameter names (e.g., 'current', 'baseline')

        Returns:
            Tuple of (SQL condition string, params dict)
        """
        param_name = f"{param_prefix}_value"
        if filter.filter_type == FilterType.RUN_ID:
            return f"run_id = :{param_name}", {param_name: filter.value}
        else:  # SOURCE
            return f"source = :{param_name}", {param_name: filter.value}

    def _build_common_conditions(self, common_params: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
        """
        Build common WHERE conditions from params.

        Returns:
            Tuple of (SQL conditions string, params dict)
        """
        conditions = ["COALESCE(is_outlier, false) = false"]
        params = {}

        if 'date_start' in common_params:
            conditions.append("transaction_month >= :date_start AND transaction_month < :date_end")
            params['date_start'] = common_params['date_start']
            params['date_end'] = common_params['date_end']

        if 'property_types' in common_params:
            conditions.append("property_type IN :property_types")
            params['property_types'] = common_params['property_types']

        return " AND ".join(conditions), params

    def _get_count(
        self,
        conn,
        source_filter: SourceFilter,
        common_params: Dict[str, Any]
    ) -> int:
        """Get row count for a source using parameterized query."""
        # Build source condition
        source_cond, source_params = self._build_source_condition(source_filter, 'src')

        # Build common conditions
        common_cond, common_params_sql = self._build_common_conditions(common_params)

        query = text(f"""
            SELECT COUNT(*)
            FROM transactions
            WHERE {source_cond}
              AND {common_cond}
        """)

        params = {**source_params, **common_params_sql}
        result = conn.execute(query, params)
        return result.scalar() or 0

    def _get_count_by_dimension(
        self,
        conn,
        dimension: str,
        current_filter: SourceFilter,
        baseline_filter: SourceFilter,
        common_params: Dict[str, Any]
    ) -> Dict[str, Dict[str, int]]:
        """Get count comparison by dimension using parameterized query."""
        # Validate dimension against allowlist (prevent SQL injection via dimension)
        allowed_dimensions = {'transaction_month', 'district', 'sale_type', 'property_type'}
        if dimension not in allowed_dimensions:
            raise ValueError(f"Invalid dimension: {dimension}")

        # Build conditions
        current_cond, current_params = self._build_source_condition(current_filter, 'current')
        baseline_cond, baseline_params = self._build_source_condition(baseline_filter, 'baseline')
        common_cond, common_params_sql = self._build_common_conditions(common_params)

        query = text(f"""
            WITH current_counts AS (
                SELECT {dimension}::text as dim_value, COUNT(*) as cnt
                FROM transactions
                WHERE {current_cond} AND {common_cond}
                GROUP BY {dimension}
            ),
            baseline_counts AS (
                SELECT {dimension}::text as dim_value, COUNT(*) as cnt
                FROM transactions
                WHERE {baseline_cond} AND {common_cond}
                GROUP BY {dimension}
            )
            SELECT
                COALESCE(c.dim_value, b.dim_value) as dim_value,
                COALESCE(c.cnt, 0) as current_count,
                COALESCE(b.cnt, 0) as baseline_count
            FROM current_counts c
            FULL OUTER JOIN baseline_counts b ON c.dim_value = b.dim_value
            ORDER BY dim_value
        """)

        params = {**current_params, **baseline_params, **common_params_sql}
        result = {}
        for row in conn.execute(query, params):
            dim_value = row.dim_value or 'NULL'
            result[dim_value] = {
                'current': row.current_count,
                'baseline': row.baseline_count,
                'diff': row.current_count - row.baseline_count
            }
        return result

    def _get_psf_by_dimension(
        self,
        conn,
        dimension: str,
        current_filter: SourceFilter,
        baseline_filter: SourceFilter,
        common_params: Dict[str, Any],
        percentile: float
    ) -> Dict[str, Dict[str, float]]:
        """Get PSF percentile comparison by dimension using parameterized query."""
        # Validate dimension against allowlist
        allowed_dimensions = {'transaction_month', 'district', 'sale_type', 'property_type'}
        if dimension not in allowed_dimensions:
            raise ValueError(f"Invalid dimension: {dimension}")

        # Build conditions
        current_cond, current_params = self._build_source_condition(current_filter, 'current')
        baseline_cond, baseline_params = self._build_source_condition(baseline_filter, 'baseline')
        common_cond, common_params_sql = self._build_common_conditions(common_params)

        query = text(f"""
            WITH current_psf AS (
                SELECT {dimension}::text as dim_value,
                       PERCENTILE_CONT(:percentile) WITHIN GROUP (ORDER BY psf) as psf_val
                FROM transactions
                WHERE {current_cond} AND {common_cond}
                GROUP BY {dimension}
            ),
            baseline_psf AS (
                SELECT {dimension}::text as dim_value,
                       PERCENTILE_CONT(:percentile) WITHIN GROUP (ORDER BY psf) as psf_val
                FROM transactions
                WHERE {baseline_cond} AND {common_cond}
                GROUP BY {dimension}
            )
            SELECT
                COALESCE(c.dim_value, b.dim_value) as dim_value,
                c.psf_val as current_psf,
                b.psf_val as baseline_psf
            FROM current_psf c
            FULL OUTER JOIN baseline_psf b ON c.dim_value = b.dim_value
            ORDER BY dim_value
        """)

        params = {**current_params, **baseline_params, **common_params_sql, 'percentile': percentile}
        result = {}
        for row in conn.execute(query, params):
            dim_value = row.dim_value or 'NULL'
            current_psf = float(row.current_psf) if row.current_psf else None
            baseline_psf = float(row.baseline_psf) if row.baseline_psf else None

            diff = None
            diff_pct = None
            if current_psf is not None and baseline_psf is not None and baseline_psf > 0:
                diff = current_psf - baseline_psf
                diff_pct = diff / baseline_psf * 100

            result[dim_value] = {
                'current': round(current_psf, 2) if current_psf else None,
                'baseline': round(baseline_psf, 2) if baseline_psf else None,
                'diff': round(diff, 2) if diff else None,
                'diff_pct': round(diff_pct, 2) if diff_pct else None
            }
        return result

    def _get_row_coverage(
        self,
        conn,
        current_filter: SourceFilter,
        baseline_filter: SourceFilter,
        common_params: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Calculate row coverage by row_hash using parameterized query."""
        # Build conditions
        current_cond, current_params = self._build_source_condition(current_filter, 'current')
        baseline_cond, baseline_params = self._build_source_condition(baseline_filter, 'baseline')
        common_cond, common_params_sql = self._build_common_conditions(common_params)

        query = text(f"""
            WITH current_hashes AS (
                SELECT DISTINCT row_hash
                FROM transactions
                WHERE {current_cond} AND {common_cond}
                  AND row_hash IS NOT NULL
            ),
            baseline_hashes AS (
                SELECT DISTINCT row_hash
                FROM transactions
                WHERE {baseline_cond} AND {common_cond}
                  AND row_hash IS NOT NULL
            ),
            stats AS (
                SELECT
                    (SELECT COUNT(*) FROM current_hashes) as current_count,
                    (SELECT COUNT(*) FROM baseline_hashes) as baseline_count,
                    (SELECT COUNT(*) FROM current_hashes c JOIN baseline_hashes b ON c.row_hash = b.row_hash) as matched,
                    (SELECT COUNT(*) FROM baseline_hashes b LEFT JOIN current_hashes c ON b.row_hash = c.row_hash WHERE c.row_hash IS NULL) as missing_in_current,
                    (SELECT COUNT(*) FROM current_hashes c LEFT JOIN baseline_hashes b ON c.row_hash = b.row_hash WHERE b.row_hash IS NULL) as missing_in_baseline
            )
            SELECT * FROM stats
        """)

        params = {**current_params, **baseline_params, **common_params_sql}
        row = conn.execute(query, params).fetchone()

        # Use union coverage: matched / max(current, baseline)
        max_count = max(row.current_count or 0, row.baseline_count or 0)
        coverage_pct = 0.0
        if max_count > 0:
            coverage_pct = (row.matched or 0) / max_count * 100

        # Query for ambiguous (1-to-many) matches
        ambiguous_query = text(f"""
            WITH matched_hashes AS (
                SELECT row_hash,
                       COUNT(*) FILTER (WHERE {current_cond}) as current_cnt,
                       COUNT(*) FILTER (WHERE {baseline_cond}) as baseline_cnt
                FROM transactions
                WHERE ({current_cond} OR {baseline_cond})
                  AND {common_cond}
                  AND row_hash IS NOT NULL
                GROUP BY row_hash
                HAVING COUNT(*) FILTER (WHERE {current_cond}) > 0
                   AND COUNT(*) FILTER (WHERE {baseline_cond}) > 0
            )
            SELECT
                COUNT(*) FILTER (WHERE current_cnt > 1 OR baseline_cnt > 1) as ambiguous_count,
                MAX(current_cnt + baseline_cnt) as max_multiplicity
            FROM matched_hashes
        """)
        ambig_row = conn.execute(ambiguous_query, params).fetchone()

        return {
            'coverage_pct': round(coverage_pct, 2),
            'matched': row.matched or 0,
            'missing_in_current': row.missing_in_current or 0,
            'missing_in_baseline': row.missing_in_baseline or 0,
            'ambiguous_matches': ambig_row.ambiguous_count or 0 if ambig_row else 0,
            'max_multiplicity': ambig_row.max_multiplicity or 1 if ambig_row else 1
        }

    def _get_top_mismatches(
        self,
        conn,
        current_filter: SourceFilter,
        baseline_filter: SourceFilter,
        common_params: Dict[str, Any],
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get top N rows that exist in baseline but not in current.

        Uses parameterized queries to prevent SQL injection.
        """
        # Build conditions with table-prefixed params
        current_cond, current_params = self._build_source_condition(current_filter, 'current')
        baseline_cond, baseline_params = self._build_source_condition(baseline_filter, 'baseline')
        common_cond, common_params_sql = self._build_common_conditions(common_params)

        # Modify conditions for table aliases
        # Replace column references to use table aliases
        current_cond_c = current_cond.replace('run_id', 'c.run_id').replace('source', 'c.source')
        baseline_cond_b = baseline_cond.replace('run_id', 'b.run_id').replace('source', 'b.source')
        common_cond_b = (common_cond
                         .replace('is_outlier', 'b.is_outlier')
                         .replace('transaction_month', 'b.transaction_month')
                         .replace('property_type', 'b.property_type'))

        query = text(f"""
            SELECT
                b.project_name,
                b.transaction_month,
                b.district,
                b.price as baseline_price,
                b.psf as baseline_psf,
                b.area_sqft as baseline_area,
                b.sale_type as baseline_sale_type,
                'missing_in_current' as mismatch_type
            FROM transactions b
            LEFT JOIN transactions c ON b.row_hash = c.row_hash
                AND {current_cond_c}
            WHERE {baseline_cond_b}
              AND {common_cond_b}
              AND c.row_hash IS NULL
            LIMIT :limit
        """)

        params = {**current_params, **baseline_params, **common_params_sql, 'limit': limit}
        mismatches = []
        try:
            for row in conn.execute(query, params):
                mismatches.append({
                    'project_name': row.project_name,
                    'transaction_month': str(row.transaction_month),
                    'district': row.district,
                    'baseline_price': row.baseline_price,
                    'baseline_psf': row.baseline_psf,
                    'mismatch_type': row.mismatch_type
                })
        except Exception as e:
            logger.warning(f"Error getting mismatches: {e}")

        return mismatches

    def _assess_report(self, report: ComparisonReport) -> None:
        """Assess if comparison results are acceptable."""
        report.issues = []

        # Check row count diff
        if abs(report.row_count_diff_pct) > self.ROW_COUNT_DIFF_THRESHOLD_PCT:
            report.issues.append(
                f"Row count diff {report.row_count_diff_pct:.1f}% exceeds threshold "
                f"({self.ROW_COUNT_DIFF_THRESHOLD_PCT}%)"
            )

        # Check PSF median diffs
        for month, psf_data in report.psf_median_by_month.items():
            diff_pct = psf_data.get('diff_pct')
            if diff_pct and abs(diff_pct) > self.PSF_MEDIAN_DIFF_THRESHOLD_PCT:
                report.issues.append(
                    f"PSF median diff for {month}: {diff_pct:.1f}% exceeds threshold "
                    f"({self.PSF_MEDIAN_DIFF_THRESHOLD_PCT}%)"
                )

        # Check coverage
        if report.coverage_pct < self.COVERAGE_THRESHOLD_PCT:
            report.issues.append(
                f"Coverage {report.coverage_pct:.1f}% below threshold "
                f"({self.COVERAGE_THRESHOLD_PCT}%)"
            )

        report.is_acceptable = len(report.issues) == 0

        if report.is_acceptable:
            logger.info(f"Comparison PASSED: {report.current_source} vs {report.baseline_source}")
        else:
            logger.warning(
                f"Comparison FAILED: {report.current_source} vs {report.baseline_source}. "
                f"Issues: {report.issues}"
            )


# =============================================================================
# Module-level convenience functions
# =============================================================================

def compare_api_vs_csv(
    engine: Engine,
    date_range: Optional[Tuple[date, date]] = None,
    property_types: Optional[List[str]] = None
) -> ComparisonReport:
    """
    Convenience function to compare API vs CSV data.

    Args:
        engine: SQLAlchemy database engine
        date_range: Optional (start, end) date range
        property_types: Optional list of property types

    Returns:
        ComparisonReport
    """
    comparator = URAShadowComparator(engine)
    return comparator.compare_api_vs_csv(date_range, property_types)


def compare_run_vs_csv(
    engine: Engine,
    run_id: str,
    date_range: Optional[Tuple[date, date]] = None
) -> ComparisonReport:
    """
    Convenience function to compare a specific run vs CSV.

    Args:
        engine: SQLAlchemy database engine
        run_id: UUID of the sync run
        date_range: Optional (start, end) date range

    Returns:
        ComparisonReport
    """
    comparator = URAShadowComparator(engine)
    return comparator.compare_run_vs_csv(run_id, date_range)
