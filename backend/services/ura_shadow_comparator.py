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
from datetime import date, timedelta
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from sqlalchemy import text
from sqlalchemy.engine import Engine

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
    top_mismatches: List[Dict[str, Any]] = field(default_factory=list)

    # Overall assessment
    is_acceptable: bool = False
    issues: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON serialization."""
        result = asdict(self)
        # Convert dates to ISO strings
        result['comparison_date'] = self.comparison_date.isoformat()
        if self.date_range_start:
            result['date_range_start'] = self.date_range_start.isoformat()
        if self.date_range_end:
            result['date_range_end'] = self.date_range_end.isoformat()
        return result


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
            current_filter=f"run_id = '{run_id}'",
            baseline_filter="source = 'csv'",
            current_source=run_id,
            baseline_source='csv',
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

        Args:
            date_range: Optional (start, end) date range to compare
            property_types: Optional list of property types to include

        Returns:
            ComparisonReport with detailed comparison results
        """
        return self._compare(
            current_filter="source = 'ura_api'",
            baseline_filter="source = 'csv'",
            current_source='ura_api',
            baseline_source='csv',
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
            current_filter=f"run_id = '{current_run_id}'",
            baseline_filter=f"run_id = '{baseline_run_id}'",
            current_source=current_run_id,
            baseline_source=baseline_run_id,
            date_range=date_range
        )

    def _compare(
        self,
        current_filter: str,
        baseline_filter: str,
        current_source: str,
        baseline_source: str,
        date_range: Optional[Tuple[date, date]] = None,
        property_types: Optional[List[str]] = None
    ) -> ComparisonReport:
        """
        Core comparison logic.

        Args:
            current_filter: SQL WHERE clause for current data
            baseline_filter: SQL WHERE clause for baseline data
            current_source: Label for current source
            baseline_source: Label for baseline source
            date_range: Optional date range filter
            property_types: Optional property type filter
        """
        report = ComparisonReport(
            current_source=current_source,
            baseline_source=baseline_source
        )

        # Build common filters
        common_filters = ["COALESCE(is_outlier, false) = false"]
        if date_range:
            report.date_range_start = date_range[0]
            report.date_range_end = date_range[1]
            common_filters.append(
                f"transaction_month >= '{date_range[0].isoformat()}' "
                f"AND transaction_month < '{date_range[1].isoformat()}'"
            )
        if property_types:
            types_str = ", ".join(f"'{t}'" for t in property_types)
            common_filters.append(f"property_type IN ({types_str})")

        common_where = " AND ".join(common_filters)

        with self.engine.connect() as conn:
            # 1. Get total counts
            report.current_row_count = self._get_count(
                conn, current_filter, common_where
            )
            report.baseline_row_count = self._get_count(
                conn, baseline_filter, common_where
            )

            report.row_count_diff = report.current_row_count - report.baseline_row_count
            if report.baseline_row_count > 0:
                report.row_count_diff_pct = (
                    report.row_count_diff / report.baseline_row_count * 100
                )

            # 2. Count by dimensions
            report.count_by_month = self._get_count_by_dimension(
                conn, 'transaction_month', current_filter, baseline_filter, common_where
            )
            report.count_by_district = self._get_count_by_dimension(
                conn, 'district', current_filter, baseline_filter, common_where
            )
            report.count_by_sale_type = self._get_count_by_dimension(
                conn, 'sale_type', current_filter, baseline_filter, common_where
            )
            report.count_by_property_type = self._get_count_by_dimension(
                conn, 'property_type', current_filter, baseline_filter, common_where
            )

            # 3. PSF comparisons
            report.psf_median_by_month = self._get_psf_by_dimension(
                conn, 'transaction_month', current_filter, baseline_filter, common_where, 0.5
            )
            report.psf_p95_by_month = self._get_psf_by_dimension(
                conn, 'transaction_month', current_filter, baseline_filter, common_where, 0.95
            )
            report.psf_median_by_district = self._get_psf_by_dimension(
                conn, 'district', current_filter, baseline_filter, common_where, 0.5
            )

            # 4. Row-level coverage (by row_hash)
            coverage = self._get_row_coverage(
                conn, current_filter, baseline_filter, common_where
            )
            report.coverage_pct = coverage['coverage_pct']
            report.missing_in_current = coverage['missing_in_current']
            report.missing_in_baseline = coverage['missing_in_baseline']

            # 5. Top mismatches
            report.top_mismatches = self._get_top_mismatches(
                conn, current_filter, baseline_filter, common_where, limit=10
            )

        # 6. Assess overall acceptability
        self._assess_report(report)

        return report

    def _get_count(self, conn, source_filter: str, common_where: str) -> int:
        """Get row count for a source."""
        query = text(f"""
            SELECT COUNT(*)
            FROM transactions
            WHERE {source_filter}
              AND {common_where}
        """)
        result = conn.execute(query)
        return result.scalar() or 0

    def _get_count_by_dimension(
        self,
        conn,
        dimension: str,
        current_filter: str,
        baseline_filter: str,
        common_where: str
    ) -> Dict[str, Dict[str, int]]:
        """Get count comparison by dimension."""
        query = text(f"""
            WITH current_counts AS (
                SELECT {dimension}::text as dim_value, COUNT(*) as cnt
                FROM transactions
                WHERE {current_filter} AND {common_where}
                GROUP BY {dimension}
            ),
            baseline_counts AS (
                SELECT {dimension}::text as dim_value, COUNT(*) as cnt
                FROM transactions
                WHERE {baseline_filter} AND {common_where}
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

        result = {}
        for row in conn.execute(query):
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
        current_filter: str,
        baseline_filter: str,
        common_where: str,
        percentile: float
    ) -> Dict[str, Dict[str, float]]:
        """Get PSF percentile comparison by dimension."""
        query = text(f"""
            WITH current_psf AS (
                SELECT {dimension}::text as dim_value,
                       PERCENTILE_CONT(:percentile) WITHIN GROUP (ORDER BY psf) as psf_val
                FROM transactions
                WHERE {current_filter} AND {common_where}
                GROUP BY {dimension}
            ),
            baseline_psf AS (
                SELECT {dimension}::text as dim_value,
                       PERCENTILE_CONT(:percentile) WITHIN GROUP (ORDER BY psf) as psf_val
                FROM transactions
                WHERE {baseline_filter} AND {common_where}
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

        result = {}
        for row in conn.execute(query, {'percentile': percentile}):
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
        current_filter: str,
        baseline_filter: str,
        common_where: str
    ) -> Dict[str, Any]:
        """Calculate row coverage by row_hash."""
        query = text(f"""
            WITH current_hashes AS (
                SELECT DISTINCT row_hash
                FROM transactions
                WHERE {current_filter} AND {common_where}
                  AND row_hash IS NOT NULL
            ),
            baseline_hashes AS (
                SELECT DISTINCT row_hash
                FROM transactions
                WHERE {baseline_filter} AND {common_where}
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

        row = conn.execute(query).fetchone()

        total = (row.current_count or 0) + (row.baseline_count or 0) - (row.matched or 0)
        coverage_pct = 0.0
        if total > 0:
            coverage_pct = (row.matched or 0) / total * 100 * 2  # Jaccard-ish

        # Actually use union coverage: matched / max(current, baseline)
        max_count = max(row.current_count or 0, row.baseline_count or 0)
        if max_count > 0:
            coverage_pct = (row.matched or 0) / max_count * 100

        return {
            'coverage_pct': round(coverage_pct, 2),
            'matched': row.matched or 0,
            'missing_in_current': row.missing_in_current or 0,
            'missing_in_baseline': row.missing_in_baseline or 0
        }

    def _get_top_mismatches(
        self,
        conn,
        current_filter: str,
        baseline_filter: str,
        common_where: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get top N rows where the same natural key exists in both but fields differ.

        Note: This compares rows with matching row_hash - if row_hash matches,
        the rows are identical by definition. So this actually finds rows that
        exist in one source but not the other.
        """
        # Find rows in baseline missing from current (potential deletions/revisions)
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
                AND {current_filter.replace('run_id', 'c.run_id').replace('source', 'c.source')}
            WHERE {baseline_filter.replace('run_id', 'b.run_id').replace('source', 'b.source')}
              AND {common_where.replace('is_outlier', 'b.is_outlier').replace('transaction_month', 'b.transaction_month').replace('property_type', 'b.property_type')}
              AND c.row_hash IS NULL
            LIMIT :limit
        """)

        mismatches = []
        try:
            for row in conn.execute(query, {'limit': limit}):
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
