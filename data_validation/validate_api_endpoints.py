"""
API Endpoint Validation for Singapore Condo Dashboard
Validates that API endpoints return data consistent with the database

Usage:
    python validate_api_endpoints.py --base-url http://localhost:5000
    python validate_api_endpoints.py --base-url https://your-app.onrender.com
"""
import os
import sys
import json
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

from filter_state_tester import FilterState, ValidationResult, FilterStateValidator


@dataclass
class APIValidationResult:
    """Result of an API validation check"""
    endpoint: str
    filter_state: FilterState
    passed: bool
    api_count: int
    db_count: int
    api_total: Optional[float] = None
    db_total: Optional[float] = None
    response_time_ms: int = 0
    discrepancies: List[str] = field(default_factory=list)
    status_code: int = 200

    def to_dict(self) -> Dict[str, Any]:
        return {
            "endpoint": self.endpoint,
            "filter_state": str(self.filter_state),
            "passed": self.passed,
            "api_count": self.api_count,
            "db_count": self.db_count,
            "api_total": self.api_total,
            "db_total": self.db_total,
            "response_time_ms": self.response_time_ms,
            "discrepancies": self.discrepancies,
            "status_code": self.status_code
        }


class APIValidator:
    """Validates API endpoint responses against database truth"""

    def __init__(self, api_base_url: str, db_conn_string: Optional[str] = None):
        """
        Initialize API validator.

        Args:
            api_base_url: Base URL of the API (e.g., http://localhost:5000)
            db_conn_string: Database connection string (defaults to DATABASE_URL env var)
        """
        if not REQUESTS_AVAILABLE:
            raise ImportError("requests library required. Install with: pip install requests")

        self.api_url = api_base_url.rstrip('/')
        self.db_validator = FilterStateValidator(db_conn_string)
        self.session = requests.Session()

    def close(self):
        """Clean up resources"""
        self.session.close()
        self.db_validator.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def _build_query_params(self, filter_state: FilterState) -> Dict[str, str]:
        """Convert filter state to API query parameters"""
        params = {}

        if filter_state.year:
            # For date-based filtering, we need to construct date range
            if filter_state.quarter:
                start_month = (filter_state.quarter - 1) * 3 + 1
                end_month = start_month + 2
                params["date_from"] = f"{filter_state.year}-{start_month:02d}-01"
                # Get last day of end month
                if end_month == 12:
                    params["date_to"] = f"{filter_state.year}-12-31"
                else:
                    params["date_to"] = f"{filter_state.year}-{end_month:02d}-28"
            elif filter_state.month:
                params["date_from"] = f"{filter_state.year}-{filter_state.month:02d}-01"
                params["date_to"] = f"{filter_state.year}-{filter_state.month:02d}-28"
            else:
                params["date_from"] = f"{filter_state.year}-01-01"
                params["date_to"] = f"{filter_state.year}-12-31"

        if filter_state.district:
            params["district"] = filter_state.district

        if filter_state.bedroom_count:
            params["bedroom"] = str(filter_state.bedroom_count)

        if filter_state.sale_type:
            params["sale_type"] = filter_state.sale_type

        if filter_state.segment:
            params["segment"] = filter_state.segment

        return params

    def _get_db_stats(self, filter_state: FilterState) -> Dict[str, Any]:
        """Get statistics directly from database for comparison"""
        with self.db_validator.conn.cursor() as cur:
            where_sql, params = self.db_validator._build_where_clause(filter_state)

            sql = f"""
                SELECT
                    COUNT(*) AS count,
                    SUM(price) AS total_value,
                    AVG(psf) AS avg_psf
                FROM transactions
                WHERE {where_sql}
            """
            cur.execute(sql, params)
            row = cur.fetchone()

            return {
                "count": row[0] or 0,
                "total_value": float(row[1]) if row[1] else 0,
                "avg_psf": float(row[2]) if row[2] else 0
            }

    def validate_aggregate_endpoint(self, filter_state: FilterState,
                                     group_by: str = "month",
                                     metrics: str = "count,avg_psf") -> APIValidationResult:
        """Validate the /api/aggregate endpoint"""
        endpoint = "/api/aggregate"
        params = self._build_query_params(filter_state)
        params["group_by"] = group_by
        params["metrics"] = metrics

        start_time = time.time()
        try:
            response = self.session.get(f"{self.api_url}{endpoint}", params=params, timeout=30)
            response_time = int((time.time() - start_time) * 1000)
        except Exception as e:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=0,
                discrepancies=[f"Request failed: {str(e)}"],
                status_code=0
            )

        if response.status_code != 200:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=response_time,
                discrepancies=[f"HTTP {response.status_code}: {response.text[:200]}"],
                status_code=response.status_code
            )

        api_data = response.json()

        # Get DB truth
        db_stats = self._get_db_stats(filter_state)

        # Compare
        api_total_count = api_data.get("meta", {}).get("total_records", 0)
        db_count = db_stats["count"]

        discrepancies = []
        if api_total_count != db_count:
            discrepancies.append(f"Count mismatch: API={api_total_count}, DB={db_count}")

        return APIValidationResult(
            endpoint=endpoint,
            filter_state=filter_state,
            passed=len(discrepancies) == 0,
            api_count=api_total_count,
            db_count=db_count,
            response_time_ms=response_time,
            discrepancies=discrepancies,
            status_code=response.status_code
        )

    def validate_transactions_list(self, filter_state: FilterState,
                                    limit: int = 50) -> APIValidationResult:
        """Validate the /api/transactions/list endpoint"""
        endpoint = "/api/transactions/list"
        params = self._build_query_params(filter_state)
        params["limit"] = str(limit)
        params["page"] = "1"

        start_time = time.time()
        try:
            response = self.session.get(f"{self.api_url}{endpoint}", params=params, timeout=30)
            response_time = int((time.time() - start_time) * 1000)
        except Exception as e:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=0,
                discrepancies=[f"Request failed: {str(e)}"],
                status_code=0
            )

        if response.status_code != 200:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=response_time,
                discrepancies=[f"HTTP {response.status_code}"],
                status_code=response.status_code
            )

        api_data = response.json()

        # Get DB truth
        db_stats = self._get_db_stats(filter_state)

        api_total = api_data.get("pagination", {}).get("total_records", 0)
        db_count = db_stats["count"]

        discrepancies = []
        if api_total != db_count:
            discrepancies.append(f"Total count mismatch: API={api_total}, DB={db_count}")

        # Validate returned records match filter
        transactions = api_data.get("transactions", [])
        for txn in transactions:
            if filter_state.district and txn.get("district") != filter_state.district:
                discrepancies.append(f"District leakage: found {txn.get('district')} in {filter_state.district} filter")
                break
            if filter_state.bedroom_count and txn.get("bedroom_count") != filter_state.bedroom_count:
                discrepancies.append(f"Bedroom leakage: found {txn.get('bedroom_count')}BR in {filter_state.bedroom_count}BR filter")
                break

        return APIValidationResult(
            endpoint=endpoint,
            filter_state=filter_state,
            passed=len(discrepancies) == 0,
            api_count=api_total,
            db_count=db_count,
            response_time_ms=response_time,
            discrepancies=discrepancies,
            status_code=response.status_code
        )

    def validate_total_volume(self, filter_state: FilterState) -> APIValidationResult:
        """Validate the /api/total_volume endpoint"""
        endpoint = "/api/total_volume"

        start_time = time.time()
        try:
            response = self.session.get(f"{self.api_url}{endpoint}", timeout=30)
            response_time = int((time.time() - start_time) * 1000)
        except Exception as e:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=0,
                discrepancies=[f"Request failed: {str(e)}"],
                status_code=0
            )

        if response.status_code != 200:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=response_time,
                discrepancies=[f"HTTP {response.status_code}"],
                status_code=response.status_code
            )

        api_data = response.json()

        # Get total from API response
        data = api_data.get("data", [])
        api_total = sum(d.get("total", 0) for d in data if d.get("total"))

        # Get DB truth (all data, no filters for this endpoint)
        with self.db_validator.conn.cursor() as cur:
            cur.execute("SELECT SUM(price) FROM transactions")
            db_total = float(cur.fetchone()[0] or 0)

        discrepancies = []
        # Allow small tolerance for floating point
        if abs(api_total - db_total) > 1:
            discrepancies.append(f"Total volume mismatch: API=${api_total:,.0f}, DB=${db_total:,.0f}")

        return APIValidationResult(
            endpoint=endpoint,
            filter_state=filter_state,
            passed=len(discrepancies) == 0,
            api_count=len(data),
            db_count=len(data),
            api_total=api_total,
            db_total=db_total,
            response_time_ms=response_time,
            discrepancies=discrepancies,
            status_code=response.status_code
        )

    def validate_market_stats_by_district(self, filter_state: FilterState) -> APIValidationResult:
        """Validate the /api/market_stats_by_district endpoint"""
        endpoint = "/api/market_stats_by_district"
        params = {}
        if filter_state.bedroom_count:
            params["bedroom"] = str(filter_state.bedroom_count)
        if filter_state.district:
            params["districts"] = filter_state.district
        if filter_state.segment:
            params["segment"] = filter_state.segment

        start_time = time.time()
        try:
            response = self.session.get(f"{self.api_url}{endpoint}", params=params, timeout=30)
            response_time = int((time.time() - start_time) * 1000)
        except Exception as e:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=0,
                discrepancies=[f"Request failed: {str(e)}"],
                status_code=0
            )

        if response.status_code != 200:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=response_time,
                discrepancies=[f"HTTP {response.status_code}"],
                status_code=response.status_code
            )

        api_data = response.json()

        # Basic validation - check response has expected structure
        discrepancies = []
        if "data" not in api_data:
            discrepancies.append("Missing 'data' field in response")

        data = api_data.get("data", [])

        return APIValidationResult(
            endpoint=endpoint,
            filter_state=filter_state,
            passed=len(discrepancies) == 0,
            api_count=len(data),
            db_count=len(data),
            response_time_ms=response_time,
            discrepancies=discrepancies,
            status_code=response.status_code
        )

    def validate_projects_by_district(self, district: str) -> APIValidationResult:
        """Validate the /api/projects_by_district endpoint"""
        endpoint = "/api/projects_by_district"
        filter_state = FilterState(district=district)
        params = {"district": district}

        start_time = time.time()
        try:
            response = self.session.get(f"{self.api_url}{endpoint}", params=params, timeout=30)
            response_time = int((time.time() - start_time) * 1000)
        except Exception as e:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=0,
                discrepancies=[f"Request failed: {str(e)}"],
                status_code=0
            )

        if response.status_code != 200:
            return APIValidationResult(
                endpoint=endpoint,
                filter_state=filter_state,
                passed=False,
                api_count=0,
                db_count=0,
                response_time_ms=response_time,
                discrepancies=[f"HTTP {response.status_code}"],
                status_code=response.status_code
            )

        api_data = response.json()
        projects = api_data.get("projects", [])

        # Get DB count of projects in district
        with self.db_validator.conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(DISTINCT project_name)
                FROM transactions
                WHERE district = %s
            """, (district,))
            db_project_count = cur.fetchone()[0]

        discrepancies = []
        if len(projects) != db_project_count:
            discrepancies.append(f"Project count mismatch: API={len(projects)}, DB={db_project_count}")

        # Validate project totals sum to district total
        api_project_total = sum(p.get("total", 0) for p in projects)
        with self.db_validator.conn.cursor() as cur:
            cur.execute("""
                SELECT SUM(price)
                FROM transactions
                WHERE district = %s
            """, (district,))
            db_total = float(cur.fetchone()[0] or 0)

        if abs(api_project_total - db_total) > 1:
            discrepancies.append(f"Project total mismatch: API=${api_project_total:,.0f}, DB=${db_total:,.0f}")

        return APIValidationResult(
            endpoint=endpoint,
            filter_state=filter_state,
            passed=len(discrepancies) == 0,
            api_count=len(projects),
            db_count=db_project_count,
            api_total=api_project_total,
            db_total=db_total,
            response_time_ms=response_time,
            discrepancies=discrepancies,
            status_code=response.status_code
        )

    def run_full_validation(self, filter_states: List[FilterState] = None) -> List[APIValidationResult]:
        """Run validation across all endpoints for given filter states"""
        results = []

        if filter_states is None:
            # Default filter states to test
            years = self.db_validator._get_available_years()[:2]  # Last 2 years
            filter_states = [
                FilterState(),  # No filters
                FilterState(year=years[0]) if years else FilterState(),
                FilterState(year=years[0], quarter=3) if years else FilterState(),
                FilterState(district="D09"),
                FilterState(bedroom_count=3),
            ]

        for fs in filter_states:
            # Test aggregate endpoint
            results.append(self.validate_aggregate_endpoint(fs))

            # Test transactions list
            results.append(self.validate_transactions_list(fs))

        # Test total_volume (no filter state needed)
        results.append(self.validate_total_volume(FilterState()))

        # Test market_stats_by_district
        results.append(self.validate_market_stats_by_district(FilterState()))

        # Test projects_by_district for a few districts
        for district in ["D09", "D10", "D15"]:
            results.append(self.validate_projects_by_district(district))

        return results

    def generate_report(self, results: List[APIValidationResult]) -> str:
        """Generate markdown report of API validation results"""
        report = ["# API Endpoint Validation Report\n"]
        report.append(f"Generated: {datetime.now().isoformat()}\n")
        report.append(f"API Base URL: {self.api_url}\n")

        # Summary
        total = len(results)
        passed = sum(1 for r in results if r.passed)
        failed = total - passed
        avg_response_time = sum(r.response_time_ms for r in results) / total if total > 0 else 0

        report.append("## Summary")
        report.append(f"- **Total Checks:** {total}")
        report.append(f"- **Passed:** {passed}")
        report.append(f"- **Failed:** {failed}")
        report.append(f"- **Average Response Time:** {avg_response_time:.0f}ms\n")

        # Results by endpoint
        endpoints = set(r.endpoint for r in results)
        for endpoint in sorted(endpoints):
            endpoint_results = [r for r in results if r.endpoint == endpoint]
            endpoint_passed = sum(1 for r in endpoint_results if r.passed)

            report.append(f"### {endpoint}")
            report.append(f"- Checks: {len(endpoint_results)}, Passed: {endpoint_passed}")

            for result in endpoint_results:
                status = "PASS" if result.passed else "FAIL"
                report.append(f"  - [{status}] {result.filter_state} ({result.response_time_ms}ms)")
                if not result.passed:
                    for disc in result.discrepancies:
                        report.append(f"    - {disc}")

            report.append("")

        return "\n".join(report)


def main():
    """Main entry point for command-line usage"""
    import argparse

    parser = argparse.ArgumentParser(description="API Endpoint Validation for Singapore Condo Dashboard")
    parser.add_argument("--base-url", type=str, default="http://localhost:5000",
                        help="Base URL of the API")
    parser.add_argument("--endpoint", type=str, help="Specific endpoint to test")
    parser.add_argument("--year", type=int, help="Year filter")
    parser.add_argument("--quarter", type=int, choices=[1, 2, 3, 4], help="Quarter filter")
    parser.add_argument("--district", type=str, help="District filter (e.g., D09)")
    parser.add_argument("--full", action="store_true", help="Run full validation suite")
    parser.add_argument("--report", action="store_true", help="Generate markdown report")

    args = parser.parse_args()

    try:
        with APIValidator(args.base_url) as validator:
            if args.full:
                results = validator.run_full_validation()
            else:
                # Build filter state
                filter_state = FilterState(
                    year=args.year,
                    quarter=args.quarter,
                    district=args.district
                )

                results = []
                if args.endpoint:
                    # Test specific endpoint
                    if args.endpoint == "aggregate":
                        results.append(validator.validate_aggregate_endpoint(filter_state))
                    elif args.endpoint == "transactions":
                        results.append(validator.validate_transactions_list(filter_state))
                    elif args.endpoint == "total_volume":
                        results.append(validator.validate_total_volume(filter_state))
                    elif args.endpoint == "market_stats":
                        results.append(validator.validate_market_stats_by_district(filter_state))
                    elif args.endpoint == "projects" and args.district:
                        results.append(validator.validate_projects_by_district(args.district))
                    else:
                        print(f"Unknown endpoint: {args.endpoint}")
                        sys.exit(1)
                else:
                    # Test common endpoints with the filter state
                    results.append(validator.validate_aggregate_endpoint(filter_state))
                    results.append(validator.validate_transactions_list(filter_state))

            if args.report:
                print(validator.generate_report(results))
            else:
                # Print summary
                passed = sum(1 for r in results if r.passed)
                failed = len(results) - passed
                print(f"\nAPI Validation Results: {passed} passed, {failed} failed")

                for result in results:
                    status = "PASS" if result.passed else "FAIL"
                    print(f"\n[{status}] {result.endpoint}")
                    print(f"  Filter: {result.filter_state}")
                    print(f"  API Count: {result.api_count}, DB Count: {result.db_count}")
                    print(f"  Response Time: {result.response_time_ms}ms")
                    if not result.passed:
                        for disc in result.discrepancies:
                            print(f"  - {disc}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
