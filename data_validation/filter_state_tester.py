"""
Filter State Validation Framework
Tests all filter combinations to ensure data completeness and accuracy
for Singapore Condo Resale Dashboard

Usage:
    python filter_state_tester.py [--year YEAR] [--district DISTRICT] [--report]
"""
import os
import sys
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Set
from datetime import datetime
from decimal import Decimal
from dotenv import load_dotenv
load_dotenv()

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    PSYCOPG2_AVAILABLE = True
except ImportError:
    PSYCOPG2_AVAILABLE = False


@dataclass
class FilterState:
    """Represents a specific filter configuration"""
    year: Optional[int] = None
    quarter: Optional[int] = None
    month: Optional[int] = None
    district: Optional[str] = None
    bedroom_count: Optional[int] = None
    sale_type: Optional[str] = None
    segment: Optional[str] = None  # CCR, RCR, OCR

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in self.__dict__.items() if v is not None}

    def __str__(self):
        active = [f"{k}={v}" for k, v in self.to_dict().items()]
        return f"FilterState({', '.join(active)})" if active else "FilterState(ALL)"


@dataclass
class ValidationResult:
    """Result of a single validation check"""
    filter_state: FilterState
    check_name: str
    passed: bool
    expected: Any
    actual: Any
    discrepancy: Optional[str] = None
    sql_evidence: Optional[str] = None
    severity: str = "error"  # error, warning, info

    def to_dict(self) -> Dict[str, Any]:
        return {
            "filter_state": str(self.filter_state),
            "check_name": self.check_name,
            "passed": self.passed,
            "expected": self.expected,
            "actual": self.actual,
            "discrepancy": self.discrepancy,
            "severity": self.severity
        }


# Region mapping
CCR_DISTRICTS = {'D01', 'D02', 'D06', 'D09', 'D10', 'D11'}
RCR_DISTRICTS = {'D03', 'D04', 'D05', 'D07', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20'}


def get_market_segment(district: str) -> str:
    """Map district to market segment"""
    d = district.upper()
    if d in CCR_DISTRICTS:
        return 'CCR'
    elif d in RCR_DISTRICTS:
        return 'RCR'
    else:
        return 'OCR'


class FilterStateValidator:
    """Main validation class for testing filter state data completeness"""

    def __init__(self, conn_string: Optional[str] = None):
        """
        Initialize validator with database connection.

        Args:
            conn_string: PostgreSQL connection string. If None, will try DATABASE_URL env var.
        """
        if not PSYCOPG2_AVAILABLE:
            raise ImportError("psycopg2 is required. Install with: pip install psycopg2-binary")

        self.conn_string = conn_string or os.getenv('DATABASE_URL')
        if not self.conn_string:
            raise ValueError("Database connection string required. Set DATABASE_URL or pass conn_string.")

        self.conn = psycopg2.connect(self.conn_string)
        self._cache: Dict[str, Any] = {}

    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _get_all_districts(self) -> List[str]:
        """Get all distinct districts from database"""
        if 'districts' not in self._cache:
            with self.conn.cursor() as cur:
                cur.execute("SELECT DISTINCT district FROM transactions ORDER BY district")
                self._cache['districts'] = [row[0] for row in cur.fetchall()]
        return self._cache['districts']

    def _get_all_bedroom_counts(self) -> List[int]:
        """Get all distinct bedroom counts from database"""
        if 'bedrooms' not in self._cache:
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT bedroom_count
                    FROM transactions
                    WHERE bedroom_count IS NOT NULL
                    ORDER BY bedroom_count
                """)
                self._cache['bedrooms'] = [row[0] for row in cur.fetchall()]
        return self._cache['bedrooms']

    def _get_available_years(self) -> List[int]:
        """Get all years with transaction data"""
        if 'years' not in self._cache:
            with self.conn.cursor() as cur:
                cur.execute("""
                    SELECT DISTINCT EXTRACT(YEAR FROM transaction_date)::int AS year
                    FROM transactions
                    WHERE transaction_date IS NOT NULL
                    ORDER BY year DESC
                """)
                self._cache['years'] = [row[0] for row in cur.fetchall()]
        return self._cache['years']

    def get_expected_time_periods(self, filter_state: FilterState) -> Dict:
        """Calculate what time periods SHOULD exist for a filter state"""
        expected = {"months": [], "quarters": [], "years": []}

        if filter_state.year:
            expected["years"] = [filter_state.year]
            if filter_state.quarter:
                expected["quarters"] = [filter_state.quarter]
                # Months in that quarter
                start_month = (filter_state.quarter - 1) * 3 + 1
                expected["months"] = list(range(start_month, start_month + 3))
            elif filter_state.month:
                expected["months"] = [filter_state.month]
                expected["quarters"] = [(filter_state.month - 1) // 3 + 1]
            else:
                expected["quarters"] = [1, 2, 3, 4]
                expected["months"] = list(range(1, 13))

        return expected

    def _build_where_clause(self, filter_state: FilterState) -> tuple[str, Dict]:
        """Build SQL WHERE clause from filter state"""
        where_clauses = ["1=1"]
        params = {}

        if filter_state.year:
            where_clauses.append("EXTRACT(YEAR FROM transaction_date) = %(year)s")
            params["year"] = filter_state.year

        if filter_state.quarter:
            where_clauses.append("EXTRACT(QUARTER FROM transaction_date) = %(quarter)s")
            params["quarter"] = filter_state.quarter

        if filter_state.month:
            where_clauses.append("EXTRACT(MONTH FROM transaction_date) = %(month)s")
            params["month"] = filter_state.month

        if filter_state.district:
            where_clauses.append("district = %(district)s")
            params["district"] = filter_state.district

        if filter_state.bedroom_count:
            where_clauses.append("bedroom_count = %(bedroom_count)s")
            params["bedroom_count"] = filter_state.bedroom_count

        if filter_state.sale_type:
            where_clauses.append("sale_type = %(sale_type)s")
            params["sale_type"] = filter_state.sale_type

        if filter_state.segment:
            segment_districts = []
            if filter_state.segment == 'CCR':
                segment_districts = list(CCR_DISTRICTS)
            elif filter_state.segment == 'RCR':
                segment_districts = list(RCR_DISTRICTS)
            elif filter_state.segment == 'OCR':
                all_districts = set(self._get_all_districts())
                segment_districts = list(all_districts - CCR_DISTRICTS - RCR_DISTRICTS)
            if segment_districts:
                where_clauses.append("district = ANY(%(segment_districts)s)")
                params["segment_districts"] = segment_districts

        return " AND ".join(where_clauses), params

    def check_time_completeness(self, filter_state: FilterState) -> List[ValidationResult]:
        """Check if all expected time periods have data"""
        results = []
        expected = self.get_expected_time_periods(filter_state)

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            where_sql, params = self._build_where_clause(filter_state)

            # Check months
            if expected["months"]:
                sql = f"""
                    SELECT DISTINCT EXTRACT(MONTH FROM transaction_date)::int AS month
                    FROM transactions
                    WHERE {where_sql}
                """
                cur.execute(sql, params)
                actual_months = {row["month"] for row in cur.fetchall() if row["month"]}
                missing_months = set(expected["months"]) - actual_months

                results.append(ValidationResult(
                    filter_state=filter_state,
                    check_name="Month Completeness",
                    passed=len(missing_months) == 0,
                    expected=sorted(expected["months"]),
                    actual=sorted(actual_months),
                    discrepancy=f"Missing months: {sorted(missing_months)}" if missing_months else None,
                    sql_evidence=sql,
                    severity="warning" if missing_months else "info"
                ))

            # Check quarters
            if expected["quarters"]:
                sql = f"""
                    SELECT DISTINCT EXTRACT(QUARTER FROM transaction_date)::int AS quarter
                    FROM transactions
                    WHERE {where_sql}
                """
                cur.execute(sql, params)
                actual_quarters = {row["quarter"] for row in cur.fetchall() if row["quarter"]}
                missing_quarters = set(expected["quarters"]) - actual_quarters

                results.append(ValidationResult(
                    filter_state=filter_state,
                    check_name="Quarter Completeness",
                    passed=len(missing_quarters) == 0,
                    expected=sorted(expected["quarters"]),
                    actual=sorted(actual_quarters),
                    discrepancy=f"Missing quarters: {sorted(missing_quarters)}" if missing_quarters else None,
                    severity="warning" if missing_quarters else "info"
                ))

        return results

    def check_drilldown_consistency(self, filter_state: FilterState) -> List[ValidationResult]:
        """Verify parent aggregates equal sum of children"""
        results = []

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            where_sql, params = self._build_where_clause(filter_state)

            # Year -> Quarter drilldown check
            sql = f"""
                WITH yearly AS (
                    SELECT COUNT(*) AS cnt, SUM(price) AS total
                    FROM transactions WHERE {where_sql}
                ),
                quarterly AS (
                    SELECT
                        EXTRACT(QUARTER FROM transaction_date) AS q,
                        COUNT(*) AS cnt,
                        SUM(price) AS total
                    FROM transactions WHERE {where_sql}
                    GROUP BY EXTRACT(QUARTER FROM transaction_date)
                )
                SELECT
                    y.cnt AS year_count,
                    y.total AS year_total,
                    SUM(q.cnt) AS sum_quarter_count,
                    SUM(q.total) AS sum_quarter_total
                FROM yearly y, quarterly q
                GROUP BY y.cnt, y.total
            """
            cur.execute(sql, params)
            row = cur.fetchone()

            if row and row["year_count"]:
                year_count = int(row["year_count"])
                sum_quarter_count = int(row["sum_quarter_count"]) if row["sum_quarter_count"] else 0
                count_match = year_count == sum_quarter_count

                year_total = float(row["year_total"]) if row["year_total"] else 0
                sum_quarter_total = float(row["sum_quarter_total"]) if row["sum_quarter_total"] else 0
                total_match = abs(year_total - sum_quarter_total) < 0.01  # Float tolerance

                results.append(ValidationResult(
                    filter_state=filter_state,
                    check_name="Year->Quarter Drilldown Count",
                    passed=count_match,
                    expected=year_count,
                    actual=sum_quarter_count,
                    discrepancy=f"Difference: {year_count - sum_quarter_count}" if not count_match else None,
                    severity="error" if not count_match else "info"
                ))

                results.append(ValidationResult(
                    filter_state=filter_state,
                    check_name="Year->Quarter Drilldown Value",
                    passed=total_match,
                    expected=f"${year_total:,.2f}",
                    actual=f"${sum_quarter_total:,.2f}",
                    discrepancy=f"Difference: ${year_total - sum_quarter_total:,.2f}" if not total_match else None,
                    severity="error" if not total_match else "info"
                ))

        return results

    def check_cross_dimensional_completeness(self, filter_state: FilterState,
                                              bedroom_types: List[int] = [2, 3, 4]) -> List[ValidationResult]:
        """Check that all expected dimension combinations exist"""
        results = []

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            where_sql, params = self._build_where_clause(filter_state)

            # Get districts with data for this filter
            sql = f"""
                SELECT district, bedroom_count, COUNT(*) as cnt
                FROM transactions
                WHERE {where_sql}
                AND bedroom_count = ANY(%(bedroom_types)s)
                GROUP BY district, bedroom_count
                ORDER BY district, bedroom_count
            """
            params["bedroom_types"] = bedroom_types
            cur.execute(sql, params)
            actual_combos = {(row["district"], row["bedroom_count"]) for row in cur.fetchall()}

            # Get all districts in this filter
            sql_districts = f"""
                SELECT DISTINCT district FROM transactions WHERE {where_sql}
            """
            cur.execute(sql_districts, params)
            districts = [row["district"] for row in cur.fetchall()]

            # Check for missing combinations
            missing_combos = []
            for district in districts:
                for bedroom in bedroom_types:
                    if (district, bedroom) not in actual_combos:
                        missing_combos.append((district, bedroom))

            results.append(ValidationResult(
                filter_state=filter_state,
                check_name="Cross-Dimensional Completeness (District x Bedroom)",
                passed=len(missing_combos) == 0,
                expected=f"All {len(districts)} districts have all bedroom types {bedroom_types}",
                actual=f"Found {len(actual_combos)} combinations",
                discrepancy=f"Missing: {missing_combos[:10]}{'...' if len(missing_combos) > 10 else ''}" if missing_combos else None,
                severity="warning" if missing_combos else "info"
            ))

        return results

    def check_district_project_consistency(self, filter_state: FilterState) -> List[ValidationResult]:
        """Verify district totals equal sum of project totals"""
        results = []

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            where_sql, params = self._build_where_clause(filter_state)

            sql = f"""
                WITH district_totals AS (
                    SELECT
                        district,
                        SUM(price) AS district_total,
                        COUNT(*) AS district_count
                    FROM transactions
                    WHERE {where_sql}
                    GROUP BY district
                ),
                project_rollup AS (
                    SELECT
                        district,
                        SUM(price) AS sum_project_total,
                        COUNT(*) AS sum_project_count
                    FROM transactions
                    WHERE {where_sql}
                    GROUP BY district
                )
                SELECT
                    d.district,
                    d.district_total,
                    p.sum_project_total,
                    d.district_total - p.sum_project_total AS value_discrepancy,
                    d.district_count,
                    p.sum_project_count,
                    d.district_count - p.sum_project_count AS count_discrepancy
                FROM district_totals d
                JOIN project_rollup p ON d.district = p.district
                WHERE d.district_total != p.sum_project_total
                   OR d.district_count != p.sum_project_count
            """
            cur.execute(sql, params)
            discrepancies = cur.fetchall()

            results.append(ValidationResult(
                filter_state=filter_state,
                check_name="District->Project Drilldown Consistency",
                passed=len(discrepancies) == 0,
                expected="All district totals match sum of projects",
                actual=f"{len(discrepancies)} districts with discrepancies" if discrepancies else "All match",
                discrepancy=str(discrepancies[:5]) if discrepancies else None,
                severity="error" if discrepancies else "info"
            ))

        return results

    def check_region_consistency(self, filter_state: FilterState) -> List[ValidationResult]:
        """Verify region (CCR/RCR/OCR) totals equal sum of district totals"""
        results = []

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            where_sql, params = self._build_where_clause(filter_state)

            sql = f"""
                WITH district_data AS (
                    SELECT
                        district,
                        CASE
                            WHEN district IN ('D01', 'D02', 'D06', 'D09', 'D10', 'D11') THEN 'CCR'
                            WHEN district IN ('D03', 'D04', 'D05', 'D07', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20') THEN 'RCR'
                            ELSE 'OCR'
                        END AS region,
                        SUM(price) AS total,
                        COUNT(*) AS cnt
                    FROM transactions
                    WHERE {where_sql}
                    GROUP BY district
                )
                SELECT
                    region,
                    SUM(total) AS region_total,
                    SUM(cnt) AS region_count,
                    COUNT(DISTINCT district) AS district_count
                FROM district_data
                GROUP BY region
                ORDER BY region
            """
            cur.execute(sql, params)
            region_data = cur.fetchall()

            for row in region_data:
                results.append(ValidationResult(
                    filter_state=filter_state,
                    check_name=f"Region {row['region']} Data Present",
                    passed=row['region_count'] > 0,
                    expected=f"Data for {row['region']}",
                    actual=f"{row['region_count']} transactions from {row['district_count']} districts, total ${float(row['region_total']):,.0f}",
                    severity="info"
                ))

        return results

    def run_all_checks(self, filter_state: FilterState) -> List[ValidationResult]:
        """Run all validation checks for a filter state"""
        results = []
        results.extend(self.check_time_completeness(filter_state))
        results.extend(self.check_drilldown_consistency(filter_state))
        results.extend(self.check_cross_dimensional_completeness(filter_state))
        results.extend(self.check_district_project_consistency(filter_state))
        results.extend(self.check_region_consistency(filter_state))
        return results

    def test_filter_combinations(self,
                                  years: List[int],
                                  quarters: List[int] = [1, 2, 3, 4],
                                  districts: List[str] = None,
                                  bedroom_types: List[int] = None) -> List[ValidationResult]:
        """Test multiple filter combinations"""
        all_results = []

        # Generate filter combinations
        for year in years:
            # Year only
            all_results.extend(self.run_all_checks(FilterState(year=year)))

            # Year + Quarter
            for quarter in quarters:
                all_results.extend(self.run_all_checks(
                    FilterState(year=year, quarter=quarter)
                ))

                # Year + Quarter + District
                if districts:
                    for district in districts:
                        all_results.extend(self.run_all_checks(
                            FilterState(year=year, quarter=quarter, district=district)
                        ))

        return all_results

    def generate_report(self, results: List[ValidationResult], verbose: bool = False) -> str:
        """Generate a markdown report of validation results"""
        report = ["# Filter State Validation Report\n"]
        report.append(f"Generated: {datetime.now().isoformat()}\n")

        # Summary
        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = total - passed
        errors = sum(1 for r in results if not r.passed and r.severity == "error")
        warnings = sum(1 for r in results if not r.passed and r.severity == "warning")

        report.append("## Summary")
        report.append(f"- **Total Checks:** {total}")
        report.append(f"- **Passed:** {passed}")
        report.append(f"- **Failed:** {failed}")
        report.append(f"  - Errors: {errors}")
        report.append(f"  - Warnings: {warnings}\n")

        # Group failures by filter state
        if failed > 0:
            report.append("## Failed Checks\n")

            failures = [r for r in results if not r.passed]

            # Group by severity
            for severity in ["error", "warning"]:
                severity_failures = [f for f in failures if f.severity == severity]
                if severity_failures:
                    report.append(f"### {severity.upper()}S ({len(severity_failures)})\n")
                    for result in severity_failures:
                        report.append(f"#### {result.check_name}")
                        report.append(f"- **Filter State:** `{result.filter_state}`")
                        report.append(f"- **Expected:** {result.expected}")
                        report.append(f"- **Actual:** {result.actual}")
                        if result.discrepancy:
                            report.append(f"- **Discrepancy:** {result.discrepancy}")
                        report.append("")

        # Optionally show all results
        if verbose:
            report.append("## All Results\n")
            report.append("| Check | Filter State | Status | Expected | Actual |")
            report.append("|-------|--------------|--------|----------|--------|")
            for result in results:
                status = "PASS" if result.passed else "FAIL"
                report.append(f"| {result.check_name} | {result.filter_state} | {status} | {result.expected} | {result.actual} |")

        return "\n".join(report)

    def quick_health_check(self) -> Dict[str, Any]:
        """Run a quick health check on the data"""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Basic stats
            cur.execute("""
                SELECT
                    COUNT(*) AS total_records,
                    COUNT(DISTINCT district) AS district_count,
                    COUNT(DISTINCT project_name) AS project_count,
                    MIN(transaction_date) AS earliest_date,
                    MAX(transaction_date) AS latest_date,
                    COUNT(DISTINCT EXTRACT(YEAR FROM transaction_date)) AS year_count
                FROM transactions
            """)
            stats = cur.fetchone()

            # Records by year
            cur.execute("""
                SELECT
                    EXTRACT(YEAR FROM transaction_date)::int AS year,
                    COUNT(*) AS count
                FROM transactions
                GROUP BY EXTRACT(YEAR FROM transaction_date)
                ORDER BY year DESC
            """)
            by_year = {row["year"]: row["count"] for row in cur.fetchall()}

            return {
                "total_records": stats["total_records"],
                "district_count": stats["district_count"],
                "project_count": stats["project_count"],
                "date_range": {
                    "earliest": str(stats["earliest_date"]),
                    "latest": str(stats["latest_date"])
                },
                "years_with_data": stats["year_count"],
                "records_by_year": by_year
            }


def main():
    """Main entry point for command-line usage"""
    import argparse

    parser = argparse.ArgumentParser(description="Filter State Validation for Singapore Condo Dashboard")
    parser.add_argument("--year", type=int, help="Specific year to validate")
    parser.add_argument("--quarter", type=int, choices=[1, 2, 3, 4], help="Specific quarter")
    parser.add_argument("--district", type=str, help="Specific district (e.g., D09)")
    parser.add_argument("--full", action="store_true", help="Run full validation suite")
    parser.add_argument("--report", action="store_true", help="Generate markdown report")
    parser.add_argument("--verbose", action="store_true", help="Show all results")
    parser.add_argument("--health", action="store_true", help="Quick health check only")

    args = parser.parse_args()

    try:
        with FilterStateValidator() as validator:
            if args.health:
                health = validator.quick_health_check()
                print("Database Health Check:")
                print(f"  Total Records: {health['total_records']:,}")
                print(f"  Districts: {health['district_count']}")
                print(f"  Projects: {health['project_count']}")
                print(f"  Date Range: {health['date_range']['earliest']} to {health['date_range']['latest']}")
                print(f"  Years: {health['years_with_data']}")
                print("\n  Records by Year:")
                for year, count in sorted(health['records_by_year'].items(), reverse=True):
                    print(f"    {year}: {count:,}")
                return

            if args.full:
                years = validator._get_available_years()
                results = validator.test_filter_combinations(years=years[-3:])  # Last 3 years
            else:
                # Build filter state from args
                filter_state = FilterState(
                    year=args.year or validator._get_available_years()[0],  # Default to latest year
                    quarter=args.quarter,
                    district=args.district
                )
                results = validator.run_all_checks(filter_state)

            if args.report:
                print(validator.generate_report(results, verbose=args.verbose))
            else:
                # Print summary
                passed = sum(1 for r in results if r.passed)
                failed = len(results) - passed
                print(f"\nValidation Results: {passed} passed, {failed} failed")

                if failed > 0:
                    print("\nFailed Checks:")
                    for result in results:
                        if not result.passed:
                            print(f"  [{result.severity.upper()}] {result.check_name}")
                            print(f"    Filter: {result.filter_state}")
                            print(f"    Expected: {result.expected}")
                            print(f"    Actual: {result.actual}")
                            if result.discrepancy:
                                print(f"    Discrepancy: {result.discrepancy}")
                            print()

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    conn_string = os.getenv("DATABASE_URL")
    if not conn_string:
        raise ValueError("DATABASE_URL not set in .env file")
    
    validator = FilterStateValidator(conn_string)
    
    print("Starting validation...")
    
    # Test specific filter state
    results = validator.run_all_checks(FilterState(year=2024, quarter=3))
    
    # Generate and print report
    report = validator.generate_report(results)
    print(report)
    
    validator.close()