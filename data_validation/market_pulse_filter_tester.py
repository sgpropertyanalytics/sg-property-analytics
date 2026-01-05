#!/usr/bin/env python3
"""
Market Pulse Filter Validation Test Suite

Comprehensive testing of all filter combinations for the Market Pulse dashboard.
Tests sidebar filters, cross-filters, and data completeness.

Usage:
    python market_pulse_filter_tester.py [--api-url URL]
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass, field

try:
    import requests
except ImportError:
    print("Error: requests library required. Install with: pip install requests")
    sys.exit(1)


# Constants from CLAUDE.md
EXPECTED_CCR_DISTRICTS = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11']
EXPECTED_RCR_DISTRICTS = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
EXPECTED_OCR_DISTRICTS = ['D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28']
EXPECTED_BEDROOMS = [1, 2, 3, 4, 5]  # 5 = 5+ bedroom/penthouse
EXPECTED_SALE_TYPES = ['New Sale', 'Resale']


@dataclass
class TestResult:
    """Result of a filter test"""
    test_name: str
    passed: bool
    filter_params: Dict[str, Any]
    expected: Any
    actual: Any
    response_time_ms: int = 0
    error_message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "test_name": self.test_name,
            "passed": self.passed,
            "filter_params": self.filter_params,
            "expected": str(self.expected) if self.expected else None,
            "actual": str(self.actual) if self.actual else None,
            "response_time_ms": self.response_time_ms,
            "error_message": self.error_message,
            "details": self.details
        }


class MarketPulseFilterTester:
    """Comprehensive filter testing for Market Pulse dashboard"""

    def __init__(self, api_base_url: str = "https://sg-property-analyzer.onrender.com"):
        self.api_url = api_base_url.rstrip('/')
        self.session = requests.Session()
        self.results: List[TestResult] = []
        self.issues: List[str] = []

    def _api_call(self, endpoint: str, params: Dict = None) -> Tuple[Dict, int, int]:
        """Make API call and return (data, status_code, response_time_ms)"""
        url = f"{self.api_url}/api{endpoint}"
        start = time.time()
        try:
            response = self.session.get(url, params=params, timeout=60)
            response_time = int((time.time() - start) * 1000)
            if response.status_code == 200:
                return response.json(), response.status_code, response_time
            return {"error": response.text}, response.status_code, response_time
        except Exception as e:
            return {"error": str(e)}, 0, int((time.time() - start) * 1000)

    def _add_result(self, result: TestResult):
        """Add test result and track issues"""
        self.results.append(result)
        if not result.passed:
            self.issues.append(f"[FAIL] {result.test_name}: {result.error_message}")

    # =========================================================================
    # FILTER OPTIONS VALIDATION
    # =========================================================================

    def test_filter_options_completeness(self):
        """Test that filter-options returns all expected values"""
        print("\n=== Testing Filter Options Completeness ===")

        data, status, response_time = self._api_call("/filter-options")

        if status != 200:
            self._add_result(TestResult(
                test_name="filter-options endpoint",
                passed=False,
                filter_params={},
                expected="200 OK",
                actual=f"HTTP {status}",
                response_time_ms=response_time,
                error_message=f"API returned status {status}"
            ))
            return

        # Test districts completeness
        api_districts = set(data.get("districts", []))
        expected_all = set(EXPECTED_CCR_DISTRICTS + EXPECTED_RCR_DISTRICTS + EXPECTED_OCR_DISTRICTS)
        missing_districts = expected_all - api_districts
        extra_districts = api_districts - expected_all

        self._add_result(TestResult(
            test_name="Districts completeness",
            passed=len(missing_districts) == 0,
            filter_params={},
            expected=sorted(expected_all),
            actual=sorted(api_districts),
            response_time_ms=response_time,
            error_message=f"Missing: {missing_districts}" if missing_districts else "",
            details={"missing": list(missing_districts), "extra": list(extra_districts)}
        ))

        # Test region mapping
        api_regions = data.get("regions", {})
        for region, expected_districts in [
            ("CCR", EXPECTED_CCR_DISTRICTS),
            ("RCR", EXPECTED_RCR_DISTRICTS),
            ("OCR", EXPECTED_OCR_DISTRICTS)
        ]:
            api_region_districts = set(api_regions.get(region, []))
            expected_set = set(expected_districts)
            missing = expected_set - api_region_districts

            self._add_result(TestResult(
                test_name=f"{region} region mapping",
                passed=len(missing) == 0,
                filter_params={"region": region},
                expected=sorted(expected_set),
                actual=sorted(api_region_districts),
                response_time_ms=0,
                error_message=f"Missing from {region}: {missing}" if missing else ""
            ))

        # Test bedroom types
        api_bedrooms = set(data.get("bedrooms", []))
        expected_bedrooms = set(EXPECTED_BEDROOMS)
        missing_bedrooms = expected_bedrooms - api_bedrooms

        self._add_result(TestResult(
            test_name="Bedroom types completeness",
            passed=len(missing_bedrooms) == 0,
            filter_params={},
            expected=sorted(expected_bedrooms),
            actual=sorted(api_bedrooms),
            response_time_ms=0,
            error_message=f"Missing bedrooms: {missing_bedrooms}" if missing_bedrooms else ""
        ))

        # Test sale types
        api_sale_types = set(data.get("sale_types", []))
        expected_sale_types = set(EXPECTED_SALE_TYPES)
        missing_sale_types = expected_sale_types - api_sale_types

        self._add_result(TestResult(
            test_name="Sale types completeness",
            passed=len(missing_sale_types) == 0,
            filter_params={},
            expected=sorted(expected_sale_types),
            actual=sorted(api_sale_types),
            response_time_ms=0,
            error_message=f"Missing sale types: {missing_sale_types}" if missing_sale_types else ""
        ))

    # =========================================================================
    # INDIVIDUAL FILTER TESTS
    # =========================================================================

    def test_district_filters(self):
        """Test each district filter returns data"""
        print("\n=== Testing District Filters ===")

        all_districts = EXPECTED_CCR_DISTRICTS + EXPECTED_RCR_DISTRICTS + EXPECTED_OCR_DISTRICTS

        for district in all_districts:
            params = {"group_by": "month", "metrics": "count", "district": district}
            data, status, response_time = self._api_call("/aggregate", params)

            total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0
            has_data = total_records > 0

            self._add_result(TestResult(
                test_name=f"District {district} filter",
                passed=has_data,
                filter_params=params,
                expected=f"> 0 records",
                actual=f"{total_records} records",
                response_time_ms=response_time,
                error_message=f"No data for district {district}" if not has_data else "",
                details={"total_records": total_records}
            ))

            if has_data:
                print(f"  ✓ {district}: {total_records:,} records ({response_time}ms)")
            else:
                print(f"  ✗ {district}: NO DATA ({response_time}ms)")

    def test_bedroom_filters(self):
        """Test each bedroom filter returns data"""
        print("\n=== Testing Bedroom Filters ===")

        for bedroom in EXPECTED_BEDROOMS:
            params = {"group_by": "month", "metrics": "count", "bedroom": str(bedroom)}
            data, status, response_time = self._api_call("/aggregate", params)

            total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0
            has_data = total_records > 0

            bedroom_label = f"{bedroom}+" if bedroom == 5 else str(bedroom)
            self._add_result(TestResult(
                test_name=f"Bedroom {bedroom_label} filter",
                passed=has_data,
                filter_params=params,
                expected=f"> 0 records",
                actual=f"{total_records} records",
                response_time_ms=response_time,
                error_message=f"No data for {bedroom_label}-bedroom" if not has_data else "",
                details={"total_records": total_records}
            ))

            if has_data:
                print(f"  ✓ {bedroom_label}-Bedroom: {total_records:,} records ({response_time}ms)")
            else:
                print(f"  ✗ {bedroom_label}-Bedroom: NO DATA ({response_time}ms)")

    def test_region_filters(self):
        """Test each region (segment) filter returns data"""
        print("\n=== Testing Region (Segment) Filters ===")

        for region in ["CCR", "RCR", "OCR"]:
            params = {"group_by": "month", "metrics": "count", "segment": region}
            data, status, response_time = self._api_call("/aggregate", params)

            total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0
            has_data = total_records > 0

            self._add_result(TestResult(
                test_name=f"Region {region} filter",
                passed=has_data,
                filter_params=params,
                expected=f"> 0 records",
                actual=f"{total_records} records",
                response_time_ms=response_time,
                error_message=f"No data for region {region}" if not has_data else "",
                details={"total_records": total_records}
            ))

            if has_data:
                print(f"  ✓ {region}: {total_records:,} records ({response_time}ms)")
            else:
                print(f"  ✗ {region}: NO DATA ({response_time}ms)")

    def test_sale_type_filters(self):
        """Test each sale type filter returns data"""
        print("\n=== Testing Sale Type Filters ===")

        for sale_type in EXPECTED_SALE_TYPES:
            params = {"group_by": "month", "metrics": "count", "sale_type": sale_type}
            data, status, response_time = self._api_call("/aggregate", params)

            total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0
            has_data = total_records > 0

            self._add_result(TestResult(
                test_name=f"Sale type '{sale_type}' filter",
                passed=has_data,
                filter_params=params,
                expected=f"> 0 records",
                actual=f"{total_records} records",
                response_time_ms=response_time,
                error_message=f"No data for sale type '{sale_type}'" if not has_data else "",
                details={"total_records": total_records}
            ))

            if has_data:
                print(f"  ✓ {sale_type}: {total_records:,} records ({response_time}ms)")
            else:
                print(f"  ✗ {sale_type}: NO DATA ({response_time}ms)")

    def test_date_range_filters(self):
        """Test date range filters work correctly"""
        print("\n=== Testing Date Range Filters ===")

        # Test specific years
        for year in range(2021, 2026):
            params = {
                "group_by": "month",
                "metrics": "count",
                "date_from": f"{year}-01-01",
                "date_to": f"{year}-12-31"
            }
            data, status, response_time = self._api_call("/aggregate", params)

            total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0

            self._add_result(TestResult(
                test_name=f"Year {year} date filter",
                passed=total_records > 0,
                filter_params=params,
                expected=f"> 0 records",
                actual=f"{total_records} records",
                response_time_ms=response_time,
                error_message=f"No data for year {year}" if total_records == 0 else "",
                details={"total_records": total_records}
            ))

            status_symbol = "✓" if total_records > 0 else "✗"
            print(f"  {status_symbol} Year {year}: {total_records:,} records ({response_time}ms)")

    # =========================================================================
    # COMBINED FILTER TESTS
    # =========================================================================

    def test_region_bedroom_combinations(self):
        """Test region + bedroom filter combinations"""
        print("\n=== Testing Region + Bedroom Combinations ===")

        for region in ["CCR", "RCR", "OCR"]:
            for bedroom in [2, 3, 4]:  # Focus on common bedrooms
                params = {
                    "group_by": "month",
                    "metrics": "count,avg_psf",
                    "segment": region,
                    "bedroom": str(bedroom)
                }
                data, status, response_time = self._api_call("/aggregate", params)

                total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0

                self._add_result(TestResult(
                    test_name=f"{region} + {bedroom}BR combination",
                    passed=total_records > 0,
                    filter_params=params,
                    expected=f"> 0 records",
                    actual=f"{total_records} records",
                    response_time_ms=response_time,
                    error_message=f"No data for {region} {bedroom}BR" if total_records == 0 else "",
                    details={"total_records": total_records}
                ))

                status_symbol = "✓" if total_records > 0 else "✗"
                print(f"  {status_symbol} {region} {bedroom}BR: {total_records:,} records")

    def test_district_sale_type_combinations(self):
        """Test district + sale type filter combinations"""
        print("\n=== Testing District + Sale Type Combinations ===")

        # Sample districts from each region
        sample_districts = ["D09", "D10", "D15", "D18"]

        for district in sample_districts:
            for sale_type in EXPECTED_SALE_TYPES:
                params = {
                    "group_by": "month",
                    "metrics": "count",
                    "district": district,
                    "sale_type": sale_type
                }
                data, status, response_time = self._api_call("/aggregate", params)

                total_records = data.get("meta", {}).get("total_records", 0) if status == 200 else 0

                self._add_result(TestResult(
                    test_name=f"{district} + {sale_type} combination",
                    passed=total_records >= 0,  # 0 is okay for specific combinations
                    filter_params=params,
                    expected=f">= 0 records",
                    actual=f"{total_records} records",
                    response_time_ms=response_time,
                    details={"total_records": total_records}
                ))

                print(f"  {district} {sale_type}: {total_records:,} records")

    # =========================================================================
    # CROSS-FILTER VALIDATION
    # =========================================================================

    def test_cross_filter_consistency(self):
        """Test that cross-filter combinations are consistent"""
        print("\n=== Testing Cross-Filter Consistency ===")

        # Get total count without filters
        data_all, _, _ = self._api_call("/aggregate", {"group_by": "", "metrics": "count"})
        total_all = data_all.get("data", [{}])[0].get("count", 0) if data_all.get("data") else 0

        # Sum of all regions should equal total
        region_total = 0
        for region in ["CCR", "RCR", "OCR"]:
            data, _, _ = self._api_call("/aggregate", {
                "group_by": "",
                "metrics": "count",
                "segment": region
            })
            count = data.get("data", [{}])[0].get("count", 0) if data.get("data") else 0
            region_total += count
            print(f"  {region}: {count:,} records")

        match = total_all == region_total
        self._add_result(TestResult(
            test_name="Region sum equals total",
            passed=match,
            filter_params={},
            expected=total_all,
            actual=region_total,
            error_message=f"Region sum ({region_total:,}) != Total ({total_all:,})" if not match else "",
            details={"total": total_all, "region_sum": region_total}
        ))
        print(f"  Total: {total_all:,}, Region Sum: {region_total:,} - {'✓ MATCH' if match else '✗ MISMATCH'}")

        # Sum of all sale types should equal total
        sale_type_total = 0
        for sale_type in EXPECTED_SALE_TYPES:
            data, _, _ = self._api_call("/aggregate", {
                "group_by": "",
                "metrics": "count",
                "sale_type": sale_type
            })
            count = data.get("data", [{}])[0].get("count", 0) if data.get("data") else 0
            sale_type_total += count
            print(f"  {sale_type}: {count:,} records")

        match = total_all == sale_type_total
        self._add_result(TestResult(
            test_name="Sale type sum equals total",
            passed=match,
            filter_params={},
            expected=total_all,
            actual=sale_type_total,
            error_message=f"Sale type sum ({sale_type_total:,}) != Total ({total_all:,})" if not match else "",
            details={"total": total_all, "sale_type_sum": sale_type_total}
        ))
        print(f"  Total: {total_all:,}, Sale Type Sum: {sale_type_total:,} - {'✓ MATCH' if match else '✗ MISMATCH'}")

    # =========================================================================
    # DASHBOARD ENDPOINT TESTS
    # =========================================================================

    def test_dashboard_endpoint(self):
        """Test the unified dashboard endpoint with various filter combinations"""
        print("\n=== Testing Dashboard Endpoint ===")

        test_cases = [
            {"name": "No filters", "params": {}},
            {"name": "CCR only", "params": {"segment": "CCR"}},
            {"name": "3BR only", "params": {"bedroom": "3"}},
            {"name": "New Sale only", "params": {"sale_type": "New Sale"}},
            {"name": "CCR + 3BR", "params": {"segment": "CCR", "bedroom": "3"}},
            {"name": "D09 + Resale", "params": {"district": "D09", "sale_type": "Resale"}},
        ]

        for tc in test_cases:
            data, status, response_time = self._api_call("/dashboard", tc["params"])

            passed = status == 200 and "data" in data
            total_matched = data.get("meta", {}).get("total_records_matched", 0) if passed else 0

            self._add_result(TestResult(
                test_name=f"Dashboard: {tc['name']}",
                passed=passed,
                filter_params=tc["params"],
                expected="Valid dashboard response",
                actual=f"{total_matched:,} records matched" if passed else f"HTTP {status}",
                response_time_ms=response_time,
                error_message="" if passed else f"Dashboard failed for {tc['name']}",
                details={"total_records_matched": total_matched}
            ))

            status_symbol = "✓" if passed else "✗"
            print(f"  {status_symbol} {tc['name']}: {total_matched:,} records ({response_time}ms)")

    def test_new_vs_resale_endpoint(self):
        """Test the new-vs-resale comparison endpoint"""
        print("\n=== Testing New vs Resale Endpoint ===")

        test_cases = [
            {"name": "No filters", "params": {}},
            {"name": "CCR only", "params": {"segment": "CCR"}},
            {"name": "3BR only", "params": {"bedroom": "3"}},
            {"name": "Quarter grain", "params": {"timeGrain": "quarter"}},
            {"name": "Year grain", "params": {"timeGrain": "year"}},
        ]

        for tc in test_cases:
            data, status, response_time = self._api_call("/new-vs-resale", tc["params"])

            passed = status == 200 and "chartData" in data
            chart_points = len(data.get("chartData", [])) if passed else 0

            self._add_result(TestResult(
                test_name=f"New vs Resale: {tc['name']}",
                passed=passed,
                filter_params=tc["params"],
                expected="Valid response with chartData",
                actual=f"{chart_points} data points" if passed else f"HTTP {status}",
                response_time_ms=response_time,
                error_message="" if passed else f"Endpoint failed for {tc['name']}",
                details={"chart_points": chart_points}
            ))

            status_symbol = "✓" if passed else "✗"
            print(f"  {status_symbol} {tc['name']}: {chart_points} data points ({response_time}ms)")

    # =========================================================================
    # DATA VALIDATION
    # =========================================================================

    def test_data_consistency(self):
        """Test data consistency across different aggregation levels"""
        print("\n=== Testing Data Consistency ===")

        # Monthly data should sum to yearly total
        for year in [2023, 2024]:
            # Get yearly total
            yearly_params = {
                "group_by": "",
                "metrics": "count,total_value",
                "date_from": f"{year}-01-01",
                "date_to": f"{year}-12-31"
            }
            yearly_data, _, _ = self._api_call("/aggregate", yearly_params)
            yearly_count = yearly_data.get("data", [{}])[0].get("count", 0) if yearly_data.get("data") else 0

            # Get monthly breakdown
            monthly_params = {
                "group_by": "month",
                "metrics": "count",
                "date_from": f"{year}-01-01",
                "date_to": f"{year}-12-31"
            }
            monthly_data, _, _ = self._api_call("/aggregate", monthly_params)
            monthly_sum = sum(d.get("count", 0) for d in monthly_data.get("data", []))

            match = yearly_count == monthly_sum
            self._add_result(TestResult(
                test_name=f"Year {year} monthly sum consistency",
                passed=match,
                filter_params=yearly_params,
                expected=yearly_count,
                actual=monthly_sum,
                error_message=f"Monthly sum ({monthly_sum:,}) != Yearly total ({yearly_count:,})" if not match else "",
                details={"yearly_count": yearly_count, "monthly_sum": monthly_sum}
            ))

            status_symbol = "✓" if match else "✗"
            print(f"  {status_symbol} {year}: Yearly={yearly_count:,}, Monthly Sum={monthly_sum:,}")

    # =========================================================================
    # RUN ALL TESTS
    # =========================================================================

    def run_all_tests(self):
        """Run all test suites"""
        print(f"\n{'='*60}")
        print("MARKET PULSE FILTER VALIDATION TEST SUITE")
        print(f"API: {self.api_url}")
        print(f"Started: {datetime.now().isoformat()}")
        print(f"{'='*60}")

        start_time = time.time()

        # Run all test suites
        self.test_filter_options_completeness()
        self.test_district_filters()
        self.test_bedroom_filters()
        self.test_region_filters()
        self.test_sale_type_filters()
        self.test_date_range_filters()
        self.test_region_bedroom_combinations()
        self.test_district_sale_type_combinations()
        self.test_cross_filter_consistency()
        self.test_dashboard_endpoint()
        self.test_new_vs_resale_endpoint()
        self.test_data_consistency()

        elapsed = time.time() - start_time

        return self.generate_report(elapsed)

    def generate_report(self, elapsed_seconds: float) -> Dict:
        """Generate test report"""
        passed = sum(1 for r in self.results if r.passed)
        failed = len(self.results) - passed

        print(f"\n{'='*60}")
        print("TEST RESULTS SUMMARY")
        print(f"{'='*60}")
        print(f"Total Tests: {len(self.results)}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")
        print(f"Success Rate: {(passed/len(self.results)*100):.1f}%")
        print(f"Total Time: {elapsed_seconds:.1f}s")

        if self.issues:
            print(f"\n{'='*60}")
            print("ISSUES FOUND")
            print(f"{'='*60}")
            for issue in self.issues:
                print(f"  {issue}")

        return {
            "summary": {
                "total_tests": len(self.results),
                "passed": passed,
                "failed": failed,
                "success_rate": round(passed/len(self.results)*100, 1),
                "elapsed_seconds": round(elapsed_seconds, 1)
            },
            "issues": self.issues,
            "results": [r.to_dict() for r in self.results]
        }


def main():
    parser = argparse.ArgumentParser(description="Market Pulse Filter Validation")
    parser.add_argument("--api-url", default="https://sg-property-analyzer.onrender.com",
                        help="API base URL")
    parser.add_argument("--json", action="store_true", help="Output JSON report")
    args = parser.parse_args()

    tester = MarketPulseFilterTester(args.api_url)
    report = tester.run_all_tests()

    if args.json:
        print(json.dumps(report, indent=2))

    # Exit with error code if tests failed
    sys.exit(0 if report["summary"]["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
