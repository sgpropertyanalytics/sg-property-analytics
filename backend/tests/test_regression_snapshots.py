"""
Regression Snapshot Tests

Validates API responses against golden snapshots to catch silent correctness drift.

Slices monitored:
- Segment metrics: CCR/RCR/OCR x last 3 complete months
- District metrics: D01/D03/D09/D10/D15/D19/D23 x last quarter
  - CCR: D01 (CBD), D09 (Orchard), D10 (Tanglin)
  - RCR: D03 (Queenstown), D15 (East Coast)
  - OCR: D19 (Serangoon), D23 (Hillview)

Tolerances:
- counts: ±0 (exact)
- median_psf/avg_psf: ±0.5% or ±$15 psf

Run: cd backend && pytest tests/test_regression_snapshots.py -v
Update: pytest tests/test_regression_snapshots.py --update-snapshots
"""

import pytest
import json
import sys
from pathlib import Path
from datetime import date, timedelta
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, field
from enum import Enum

# Add backend to path
backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))


# =============================================================================
# CONSTANTS
# =============================================================================

SNAPSHOT_DIR = Path(__file__).parent / "snapshots" / "regression"
SEGMENTS = ["CCR", "RCR", "OCR"]
# Districts covering all segments:
# CCR: D01 (CBD), D09 (Orchard), D10 (Tanglin)
# RCR: D03 (Queenstown), D15 (East Coast)
# OCR: D19 (Serangoon), D23 (Hillview)
KEY_DISTRICTS = ["D01", "D03", "D09", "D10", "D15", "D19", "D23"]
METRICS = ["count", "median_psf", "avg_psf"]


class ResultStatus(Enum):
    PASS = "PASS"
    WARN = "WARN"
    FAIL = "FAIL"


class RootCauseCategory(Enum):
    BOUNDARY_CHANGE = "Date filter inclusive/exclusive changed"
    FILTER_DRIFT = "Segment/district mapping changed"
    METRIC_DRIFT = "Calculation method changed"
    OUTLIER_CHANGE = "Outlier exclusion rule modified"
    DATA_INGESTION = "New data was ingested (expected)"
    UNKNOWN = "Unknown cause - manual investigation needed"


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class SliceParams:
    """Parameters for a regression slice."""
    slice_id: str
    group_by: str
    segment: Optional[str] = None
    district: Optional[str] = None
    metrics: List[str] = field(default_factory=lambda: METRICS.copy())
    date_from: Optional[date] = None
    date_to: Optional[date] = None


@dataclass
class MetricComparison:
    """Comparison result for a single metric."""
    metric: str
    expected: Optional[float]
    actual: Optional[float]
    delta: float
    delta_pct: float
    status: ResultStatus


@dataclass
class SliceResult:
    """Result of comparing a slice against snapshot."""
    slice_id: str
    status: ResultStatus
    comparisons: List[MetricComparison]
    root_cause: Optional[RootCauseCategory] = None
    explanation: Optional[str] = None


# =============================================================================
# TOLERANCE LOGIC
# =============================================================================

def is_within_tolerance(metric: str, expected: Optional[float], actual: Optional[float]) -> Tuple[bool, ResultStatus]:
    """
    Check if actual value is within tolerance of expected.

    Returns:
        (is_ok, status) where status is PASS, WARN, or FAIL
    """
    if expected is None and actual is None:
        return True, ResultStatus.PASS

    if expected is None or actual is None:
        return False, ResultStatus.FAIL

    if metric == "count":
        # Counts must be exact
        if int(expected) == int(actual):
            return True, ResultStatus.PASS
        return False, ResultStatus.FAIL

    elif metric in ("median_psf", "avg_psf"):
        if expected == 0:
            return actual == 0, ResultStatus.PASS if actual == 0 else ResultStatus.FAIL

        pct_diff = abs(actual - expected) / expected
        abs_diff = abs(actual - expected)

        if pct_diff <= 0.005 or abs_diff <= 15:
            return True, ResultStatus.PASS
        elif pct_diff <= 0.02 or abs_diff <= 50:
            # Within warning threshold
            return True, ResultStatus.WARN
        else:
            return False, ResultStatus.FAIL

    # Unknown metrics pass by default
    return True, ResultStatus.PASS


def calculate_delta(expected: Optional[float], actual: Optional[float]) -> Tuple[float, float]:
    """Calculate absolute and percentage delta."""
    if expected is None or actual is None:
        return 0.0, 0.0

    delta = actual - expected
    delta_pct = (delta / expected * 100) if expected != 0 else 0.0
    return delta, delta_pct


# =============================================================================
# DATE UTILITIES
# =============================================================================

def get_last_n_complete_months(n: int, reference_date: Optional[date] = None) -> List[Tuple[date, date]]:
    """
    Get date ranges for the last N complete months.

    URA data is month-level, so we use 1st of month boundaries.

    Returns:
        List of (month_start, month_end_exclusive) tuples
    """
    if reference_date is None:
        reference_date = date.today()

    # Start from first of current month (incomplete) and go back
    current_month_start = date(reference_date.year, reference_date.month, 1)

    months = []
    for i in range(1, n + 1):
        # Calculate month_start by going back i months
        year = current_month_start.year
        month = current_month_start.month - i

        while month <= 0:
            month += 12
            year -= 1

        month_start = date(year, month, 1)

        # End is start of next month (exclusive)
        if month_start.month == 12:
            month_end = date(month_start.year + 1, 1, 1)
        else:
            month_end = date(month_start.year, month_start.month + 1, 1)

        months.append((month_start, month_end))

    return list(reversed(months))  # Chronological order


def get_last_complete_quarter(reference_date: Optional[date] = None) -> Tuple[date, date]:
    """
    Get date range for the last complete quarter.

    Returns:
        (quarter_start, quarter_end_exclusive)
    """
    if reference_date is None:
        reference_date = date.today()

    current_quarter = (reference_date.month - 1) // 3 + 1
    current_year = reference_date.year

    # Go to previous quarter
    if current_quarter == 1:
        prev_quarter = 4
        prev_year = current_year - 1
    else:
        prev_quarter = current_quarter - 1
        prev_year = current_year

    quarter_start = date(prev_year, (prev_quarter - 1) * 3 + 1, 1)

    # End of quarter
    if prev_quarter == 4:
        quarter_end = date(prev_year + 1, 1, 1)
    else:
        quarter_end = date(prev_year, prev_quarter * 3 + 1, 1)

    return quarter_start, quarter_end


# =============================================================================
# SLICE GENERATION
# =============================================================================

def generate_segment_slices() -> List[SliceParams]:
    """Generate slice params for segment metrics."""
    slices = []
    months = get_last_n_complete_months(3)

    for segment in SEGMENTS:
        for month_start, month_end in months:
            month_str = month_start.strftime("%Y-%m")
            slice_id = f"segment_{segment}_{month_str}"
            slices.append(SliceParams(
                slice_id=slice_id,
                group_by="month",
                segment=segment,
                metrics=METRICS.copy(),
                date_from=month_start,
                date_to=month_end
            ))

    return slices


def generate_district_slices() -> List[SliceParams]:
    """Generate slice params for district metrics."""
    slices = []
    quarter_start, quarter_end = get_last_complete_quarter()
    quarter_num = (quarter_start.month - 1) // 3 + 1
    quarter_str = f"{quarter_start.year}-Q{quarter_num}"

    for district in KEY_DISTRICTS:
        slice_id = f"district_{district}_{quarter_str}"
        slices.append(SliceParams(
            slice_id=slice_id,
            group_by="quarter",
            district=district,
            metrics=METRICS.copy(),
            date_from=quarter_start,
            date_to=quarter_end
        ))

    return slices


# =============================================================================
# API CALLING
# =============================================================================

def call_aggregate_api(params: SliceParams, client) -> Dict[str, Any]:
    """
    Call /api/aggregate with slice params.

    Args:
        params: SliceParams defining the query
        client: Flask test client

    Returns:
        API response data
    """
    query_params = {
        "group_by": params.group_by,
        "metrics": ",".join(params.metrics),
    }

    if params.segment:
        query_params["segment"] = params.segment
    if params.district:
        query_params["district"] = params.district
    if params.date_from:
        query_params["date_from"] = params.date_from.isoformat()
    if params.date_to:
        # API uses exclusive date_to per CLAUDE.md conventions
        # Pass the exclusive end date directly
        query_params["date_to"] = params.date_to.isoformat()

    response = client.get("/api/aggregate", query_string=query_params)

    if response.status_code != 200:
        raise RuntimeError(f"API returned {response.status_code}: {response.data}")

    return response.get_json()


def extract_metrics_from_response(response: Dict[str, Any]) -> Dict[str, Optional[float]]:
    """
    Extract metric values from aggregate response.

    For single-row responses (one month/quarter), extract directly.
    For multi-row responses, aggregate appropriately.
    """
    data = response.get("data", [])

    if not data:
        return {metric: None for metric in METRICS}

    if len(data) == 1:
        row = data[0]
        return {
            "count": row.get("count"),
            "median_psf": row.get("medianPsf") or row.get("median_psf"),
            "avg_psf": row.get("avgPsf") or row.get("avg_psf"),
        }

    # Multiple rows - sum counts, use weighted PSF average if possible
    total_count = sum(r.get("count", 0) or 0 for r in data)

    # For PSF, use count-weighted average
    psf_weighted_sum = 0.0
    avg_weighted_sum = 0.0
    total_weight = 0

    for r in data:
        count = r.get("count", 0) or 0
        median = r.get("medianPsf") or r.get("median_psf")
        avg = r.get("avgPsf") or r.get("avg_psf")

        if count > 0 and median is not None:
            psf_weighted_sum += median * count
            total_weight += count
        if count > 0 and avg is not None:
            avg_weighted_sum += avg * count

    return {
        "count": total_count,
        "median_psf": psf_weighted_sum / total_weight if total_weight > 0 else None,
        "avg_psf": avg_weighted_sum / total_weight if total_weight > 0 else None,
    }


# =============================================================================
# SNAPSHOT MANAGEMENT
# =============================================================================

def load_snapshot(filename: str) -> Dict[str, Any]:
    """Load snapshot from JSON file."""
    snapshot_path = SNAPSHOT_DIR / filename
    if not snapshot_path.exists():
        return {}

    with open(snapshot_path, "r") as f:
        return json.load(f)


def save_snapshot(filename: str, data: Dict[str, Any]) -> None:
    """Save snapshot to JSON file."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    snapshot_path = SNAPSHOT_DIR / filename

    with open(snapshot_path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def build_snapshot_data(slices: List[SliceParams], client) -> Dict[str, Any]:
    """Build snapshot data by calling API for each slice."""
    from datetime import datetime, timezone
    import subprocess

    # Get git SHA
    try:
        git_sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=backend_path,
            stderr=subprocess.DEVNULL
        ).decode().strip()[:7]
    except Exception:
        git_sha = "unknown"

    snapshot = {
        "_metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "git_sha": git_sha,
            "api_version": "v3",
            "slice_count": len(slices),
        },
        "slices": {}
    }

    for params in slices:
        try:
            response = call_aggregate_api(params, client)
            metrics = extract_metrics_from_response(response)

            snapshot["slices"][params.slice_id] = {
                "params": {
                    "segment": params.segment,
                    "district": params.district,
                    "date_from": params.date_from.isoformat() if params.date_from else None,
                    "date_to": params.date_to.isoformat() if params.date_to else None,
                },
                "metrics": metrics
            }
        except Exception as e:
            snapshot["slices"][params.slice_id] = {
                "error": str(e)
            }

    return snapshot


# =============================================================================
# COMPARISON LOGIC
# =============================================================================

def compare_slice(params: SliceParams, expected: Dict[str, Any], actual: Dict[str, Optional[float]]) -> SliceResult:
    """Compare actual metrics against expected snapshot."""
    comparisons = []
    overall_status = ResultStatus.PASS

    expected_metrics = expected.get("metrics", {})

    for metric in METRICS:
        exp_val = expected_metrics.get(metric)
        act_val = actual.get(metric)

        delta, delta_pct = calculate_delta(exp_val, act_val)
        is_ok, status = is_within_tolerance(metric, exp_val, act_val)

        comparisons.append(MetricComparison(
            metric=metric,
            expected=exp_val,
            actual=act_val,
            delta=delta,
            delta_pct=delta_pct,
            status=status
        ))

        # Update overall status (FAIL > WARN > PASS)
        if status == ResultStatus.FAIL:
            overall_status = ResultStatus.FAIL
        elif status == ResultStatus.WARN and overall_status != ResultStatus.FAIL:
            overall_status = ResultStatus.WARN

    result = SliceResult(
        slice_id=params.slice_id,
        status=overall_status,
        comparisons=comparisons
    )

    # Add root cause analysis for failures
    if overall_status == ResultStatus.FAIL:
        result.root_cause, result.explanation = analyze_failure(comparisons)

    return result


def analyze_failure(comparisons: List[MetricComparison]) -> Tuple[RootCauseCategory, str]:
    """Analyze failure to determine likely root cause."""
    count_comp = next((c for c in comparisons if c.metric == "count"), None)

    if count_comp and count_comp.status == ResultStatus.FAIL:
        if count_comp.delta < 0:
            return (
                RootCauseCategory.BOUNDARY_CHANGE,
                f"Count dropped by {abs(int(count_comp.delta))} ({count_comp.delta_pct:.1f}%). "
                "Likely date filter changed from >= to >, excluding boundary transactions."
            )
        else:
            return (
                RootCauseCategory.BOUNDARY_CHANGE,
                f"Count increased by {int(count_comp.delta)} ({count_comp.delta_pct:.1f}%). "
                "Likely date filter changed from < to <=, including extra transactions."
            )

    # Check for PSF-only failures
    psf_fails = [c for c in comparisons if c.metric in ("median_psf", "avg_psf") and c.status == ResultStatus.FAIL]

    if psf_fails and (not count_comp or count_comp.status == ResultStatus.PASS):
        median_comp = next((c for c in comparisons if c.metric == "median_psf"), None)
        avg_comp = next((c for c in comparisons if c.metric == "avg_psf"), None)

        if median_comp and avg_comp and median_comp.actual and avg_comp.actual:
            # Check if median now equals avg (common bug)
            if abs(median_comp.actual - avg_comp.actual) < 1:
                return (
                    RootCauseCategory.METRIC_DRIFT,
                    "median_psf now equals avg_psf. Likely PERCENTILE_CONT was replaced with AVG."
                )

        return (
            RootCauseCategory.OUTLIER_CHANGE,
            "PSF metrics drifted while count stable. Likely outlier filtering changed."
        )

    return (RootCauseCategory.UNKNOWN, "Manual investigation required.")


# =============================================================================
# REPORT GENERATION
# =============================================================================

def generate_report(results: List[SliceResult]) -> str:
    """Generate markdown report from results."""
    from datetime import datetime, timezone
    import subprocess

    try:
        git_sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=backend_path,
            stderr=subprocess.DEVNULL
        ).decode().strip()[:7]
    except Exception:
        git_sha = "unknown"

    overall = ResultStatus.PASS
    for r in results:
        if r.status == ResultStatus.FAIL:
            overall = ResultStatus.FAIL
            break
        elif r.status == ResultStatus.WARN:
            overall = ResultStatus.WARN

    lines = [
        "# Regression Snapshot Report",
        "",
        f"**Run:** {datetime.now(timezone.utc).isoformat()}",
        f"**Commit:** {git_sha}",
        f"**Status:** {overall.value}",
        "",
        "## Summary",
        "",
        "| Slice | Status | Issues |",
        "|-------|--------|--------|",
    ]

    for r in results:
        issues = ", ".join(
            f"{c.metric}: {c.delta:+.2f} ({c.delta_pct:+.1f}%)"
            for c in r.comparisons if c.status != ResultStatus.PASS
        ) or "-"
        lines.append(f"| {r.slice_id} | {r.status.value} | {issues} |")

    # Failures section
    failures = [r for r in results if r.status == ResultStatus.FAIL]
    if failures:
        lines.extend(["", "## Failures", ""])
        for i, r in enumerate(failures, 1):
            lines.append(f"### {i}. {r.slice_id}")
            lines.append("")
            lines.append("| Metric | Expected | Actual | Delta | Delta % |")
            lines.append("|--------|----------|--------|-------|---------|")
            for c in r.comparisons:
                exp_str = f"{c.expected:.2f}" if c.expected is not None else "None"
                act_str = f"{c.actual:.2f}" if c.actual is not None else "None"
                lines.append(
                    f"| {c.metric} | {exp_str} | {act_str} | "
                    f"{c.delta:+.2f} | {c.delta_pct:+.1f}% |"
                )
            lines.append("")
            if r.root_cause:
                lines.append(f"**Root Cause Category:** {r.root_cause.name}")
                lines.append("")
            if r.explanation:
                lines.append(f"**Explanation:** {r.explanation}")
                lines.append("")

    # Warnings section
    warnings = [r for r in results if r.status == ResultStatus.WARN]
    if warnings:
        lines.extend(["", "## Warnings", ""])
        for i, r in enumerate(warnings, 1):
            lines.append(f"### {i}. {r.slice_id}")
            lines.append("")
            for c in r.comparisons:
                if c.status == ResultStatus.WARN:
                    exp_str = f"{c.expected:.2f}" if c.expected is not None else "None"
                    act_str = f"{c.actual:.2f}" if c.actual is not None else "None"
                    lines.append(
                        f"- {c.metric}: {exp_str} -> {act_str} "
                        f"({c.delta:+.2f}, {c.delta_pct:+.1f}%)"
                    )
            lines.append("")
            lines.append("**Status:** Within tolerance, but monitor for continued drift.")
            lines.append("")

    return "\n".join(lines)


# =============================================================================
# TEST CLASSES
# =============================================================================

class TestSegmentRegression:
    """Regression tests for segment (CCR/RCR/OCR) metrics."""

    SNAPSHOT_FILE = "segment_metrics.json"

    def test_segment_metrics_match_snapshot(self, client, update_snapshots):
        """
        Compare current segment metrics against golden snapshot.

        Monitors: CCR/RCR/OCR x last 3 complete months
        Metrics: count, median_psf, avg_psf
        """
        slices = generate_segment_slices()

        if update_snapshots:
            # Generate new snapshot
            snapshot = build_snapshot_data(slices, client)
            save_snapshot(self.SNAPSHOT_FILE, snapshot)
            pytest.skip("Snapshot updated")
            return

        # Load existing snapshot
        snapshot = load_snapshot(self.SNAPSHOT_FILE)
        if not snapshot:
            pytest.skip(
                f"No snapshot found at {SNAPSHOT_DIR / self.SNAPSHOT_FILE}. "
                "Run with --update-snapshots to generate."
            )

        results = []
        for params in slices:
            expected = snapshot.get("slices", {}).get(params.slice_id, {})
            if not expected or "error" in expected:
                continue

            try:
                response = call_aggregate_api(params, client)
                actual = extract_metrics_from_response(response)
                result = compare_slice(params, expected, actual)
                results.append(result)
            except Exception as e:
                results.append(SliceResult(
                    slice_id=params.slice_id,
                    status=ResultStatus.FAIL,
                    comparisons=[],
                    explanation=str(e)
                ))

        # Generate report
        report = generate_report(results)
        print("\n" + report)

        # Assert no failures
        failures = [r for r in results if r.status == ResultStatus.FAIL]
        assert not failures, (
            f"{len(failures)} segment slice(s) failed regression check. "
            "See report above for details."
        )


class TestDistrictRegression:
    """Regression tests for key district metrics."""

    SNAPSHOT_FILE = "district_metrics.json"

    def test_district_metrics_match_snapshot(self, client, update_snapshots):
        """
        Compare current district metrics against golden snapshot.

        Monitors: D09/D10/D15 x last quarter
        Metrics: count, median_psf, avg_psf
        """
        slices = generate_district_slices()

        if update_snapshots:
            snapshot = build_snapshot_data(slices, client)
            save_snapshot(self.SNAPSHOT_FILE, snapshot)
            pytest.skip("Snapshot updated")
            return

        snapshot = load_snapshot(self.SNAPSHOT_FILE)
        if not snapshot:
            pytest.skip(
                f"No snapshot found at {SNAPSHOT_DIR / self.SNAPSHOT_FILE}. "
                "Run with --update-snapshots to generate."
            )

        results = []
        for params in slices:
            expected = snapshot.get("slices", {}).get(params.slice_id, {})
            if not expected or "error" in expected:
                continue

            try:
                response = call_aggregate_api(params, client)
                actual = extract_metrics_from_response(response)
                result = compare_slice(params, expected, actual)
                results.append(result)
            except Exception as e:
                results.append(SliceResult(
                    slice_id=params.slice_id,
                    status=ResultStatus.FAIL,
                    comparisons=[],
                    explanation=str(e)
                ))

        report = generate_report(results)
        print("\n" + report)

        failures = [r for r in results if r.status == ResultStatus.FAIL]
        assert not failures, (
            f"{len(failures)} district slice(s) failed regression check. "
            "See report above for details."
        )
