"""
Test Chart Dependencies Registry Sync

These tests verify that BACKEND_CHART_DEPENDENCIES.md stays in sync with the actual codebase.
CI will fail if the registry drifts from reality.

Run: pytest tests/test_chart_dependencies.py -v
"""

import os
import re
from pathlib import Path

import pytest

# Paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
FRONTEND_DIR = PROJECT_ROOT / "frontend" / "src"
REGISTRY_PATH = PROJECT_ROOT / "docs" / "BACKEND_CHART_DEPENDENCIES.md"


# === Registry Parsing ===


def read_registry():
    """Read the dependency registry file."""
    if not REGISTRY_PATH.exists():
        pytest.fail(f"Registry file not found: {REGISTRY_PATH}")
    return REGISTRY_PATH.read_text()


def extract_endpoints_from_registry(content: str) -> set:
    """Extract all endpoint paths mentioned in the registry."""
    # Match patterns like `/api/aggregate`, `/insights/district-psf`
    pattern = r"`(/api/[a-z0-9\-/]+|/insights/[a-z0-9\-/]+)`"
    matches = re.findall(pattern, content, re.IGNORECASE)
    return set(matches)


def extract_charts_from_registry(content: str) -> set:
    """Extract all chart component names mentioned in the registry."""
    # Match patterns like `TimeTrendChart`, `MarketStrategyMap`
    # Look for names ending in Chart, Map, Grid, Table, Row
    pattern = r"\b([A-Z][a-zA-Z]+(?:Chart|Map|Grid|Table|Row|Oscillator|Heatmap))\b"
    matches = re.findall(pattern, content)
    return set(matches)


def extract_pages_from_registry(content: str) -> set:
    """Extract all page routes mentioned in the registry."""
    # Match patterns like `/market-overview`, `/district-overview`
    pattern = r"`(/[a-z\-]+)`"
    matches = re.findall(pattern, content)
    # Filter to only page routes (not API endpoints)
    page_routes = {m for m in matches if not m.startswith("/api") and not m.startswith("/insights")}
    return page_routes


# === Codebase Discovery ===


def find_backend_endpoints() -> set:
    """Find all route endpoints defined in backend."""
    endpoints = set()
    routes_dir = BACKEND_DIR / "routes"

    if not routes_dir.exists():
        return endpoints

    for py_file in routes_dir.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue
        content = py_file.read_text()
        # Match @bp.route("/path") or @app.route("/path")
        pattern = r'@\w+\.route\(["\']([^"\']+)["\']'
        matches = re.findall(pattern, content)
        endpoints.update(matches)

    return endpoints


def find_frontend_charts() -> set:
    """Find all chart components in frontend."""
    charts = set()
    components_dir = FRONTEND_DIR / "components"

    if not components_dir.exists():
        return charts

    # Look for files that are chart components
    chart_patterns = ["*Chart.jsx", "*Chart.js", "*Map.jsx", "*Grid.jsx", "*Table.jsx", "*Heatmap.jsx"]

    for pattern in chart_patterns:
        for file in components_dir.rglob(pattern):
            # Extract component name from filename
            name = file.stem
            if name and name[0].isupper():
                charts.add(name)

    return charts


def find_frontend_pages() -> set:
    """Find all page components in frontend."""
    pages = set()
    pages_dir = FRONTEND_DIR / "pages"

    if not pages_dir.exists():
        return pages

    for file in pages_dir.glob("*.jsx"):
        pages.add(file.stem)

    return pages


# === Tests ===


class TestRegistryExists:
    """Verify the registry file exists and is readable."""

    def test_registry_file_exists(self):
        """Registry file must exist."""
        assert REGISTRY_PATH.exists(), f"Registry file not found: {REGISTRY_PATH}"

    def test_registry_is_not_empty(self):
        """Registry must have content."""
        content = read_registry()
        assert len(content) > 1000, "Registry appears to be too short"

    def test_registry_has_required_sections(self):
        """Registry must have all required sections."""
        content = read_registry()
        required_sections = [
            "Endpoint-to-Chart Mapping",
            "Data Source-to-Endpoint Mapping",
            "Service-to-Route Mapping",
            "Impact Analysis Cheat Sheet",
        ]
        for section in required_sections:
            assert section in content, f"Missing required section: {section}"


class TestEndpointSync:
    """Verify endpoints in registry match actual backend routes."""

    def test_documented_endpoints_exist(self):
        """All endpoints in registry should exist in backend."""
        content = read_registry()
        registry_endpoints = extract_endpoints_from_registry(content)
        backend_endpoints = find_backend_endpoints()

        # Normalize paths for comparison
        def normalize(path):
            # Remove trailing slashes, lowercase
            return path.rstrip("/").lower()

        registry_normalized = {normalize(e) for e in registry_endpoints}
        backend_normalized = {normalize(e) for e in backend_endpoints}

        # Check if documented endpoints exist (allow some flexibility for nested routes)
        missing = []
        for endpoint in registry_normalized:
            # Check if any backend endpoint starts with or matches
            found = any(endpoint in be or be in endpoint for be in backend_normalized)
            if not found and not endpoint.startswith("/insights"):
                # /insights endpoints may be dynamically registered
                missing.append(endpoint)

        if missing:
            pytest.fail(
                f"Endpoints documented in registry but not found in backend:\n"
                f"{missing}\n\n"
                f"Either add these routes or remove from BACKEND_CHART_DEPENDENCIES.md"
            )

    def test_critical_endpoints_documented(self):
        """Critical endpoints must be in the registry."""
        content = read_registry()
        registry_endpoints = extract_endpoints_from_registry(content)

        critical_endpoints = [
            "/api/aggregate",
            "/api/kpi-summary-v2",
        ]

        registry_lower = {e.lower() for e in registry_endpoints}

        for endpoint in critical_endpoints:
            assert (
                endpoint.lower() in registry_lower
            ), f"Critical endpoint {endpoint} not documented in registry"


class TestChartSync:
    """Verify charts in registry match actual frontend components."""

    def test_documented_charts_exist(self):
        """Charts mentioned in registry should exist in frontend."""
        content = read_registry()
        registry_charts = extract_charts_from_registry(content)
        frontend_charts = find_frontend_charts()

        # Some charts may have slightly different names
        missing = []
        for chart in registry_charts:
            # Check exact match or partial match
            found = chart in frontend_charts or any(chart in fc for fc in frontend_charts)
            if not found:
                missing.append(chart)

        # Allow up to 3 missing (for flexibility with naming variations)
        if len(missing) > 3:
            pytest.fail(
                f"Charts documented in registry but not found in frontend:\n"
                f"{missing}\n\n"
                f"Either add these components or update BACKEND_CHART_DEPENDENCIES.md"
            )

    def test_critical_charts_documented(self):
        """Critical charts must be in the registry."""
        content = read_registry()
        registry_charts = extract_charts_from_registry(content)

        critical_charts = [
            "TimeTrendChart",
            "GrowthDumbbellChart",
            "MarketStrategyMap",
        ]

        for chart in critical_charts:
            assert chart in registry_charts, f"Critical chart {chart} not documented in registry"


class TestImpactCheatSheet:
    """Verify the impact analysis cheat sheet is complete."""

    def test_aggregate_impact_documented(self):
        """Impact of changing /api/aggregate must be documented."""
        content = read_registry()
        assert (
            "What breaks if I change `/api/aggregate`" in content
            or "What breaks if I change /api/aggregate" in content
        ), "Missing impact analysis for /api/aggregate"

    def test_resale_data_impact_documented(self):
        """Impact of removing resale data must be documented."""
        content = read_registry()
        assert (
            "resale transaction data" in content.lower() or "resale data" in content.lower()
        ), "Missing impact analysis for resale data removal"

    def test_district_impact_documented(self):
        """Impact of changing district classification must be documented."""
        content = read_registry()
        assert (
            "district classification" in content.lower() or "district" in content.lower()
        ), "Missing impact analysis for district changes"


class TestDataSourceMapping:
    """Verify data source mappings are complete."""

    def test_transactions_table_documented(self):
        """Transactions table must be documented."""
        content = read_registry()
        assert "transactions" in content.lower(), "Missing documentation for transactions table"

    def test_csv_files_documented(self):
        """Critical CSV files must be documented."""
        content = read_registry()
        assert "upcoming_launches.csv" in content, "Missing documentation for upcoming_launches.csv"

    def test_critical_fields_documented(self):
        """Critical transaction fields must be listed."""
        content = read_registry()
        critical_fields = ["transaction_date", "psf", "sale_type", "district", "is_outlier"]
        for field in critical_fields:
            assert field in content, f"Critical field {field} not documented"


class TestRegistryFormat:
    """Verify the registry follows the expected format."""

    def test_has_markdown_tables(self):
        """Registry should use markdown tables."""
        content = read_registry()
        # Tables have | characters
        assert content.count("|") > 50, "Registry should contain markdown tables"

    def test_has_code_blocks(self):
        """Registry should have code examples."""
        content = read_registry()
        assert "```" in content, "Registry should contain code blocks"

    def test_has_last_updated_section(self):
        """Registry should track when it was last updated."""
        content = read_registry()
        assert "Last Updated" in content or "last updated" in content.lower(), "Registry should have Last Updated section"


# === Warning Tests (non-blocking) ===


class TestRegistryWarnings:
    """Tests that warn but don't fail CI."""

    @pytest.mark.filterwarnings("ignore")
    def test_undocumented_charts_warning(self):
        """Warn about charts that exist but aren't documented."""
        content = read_registry()
        registry_charts = extract_charts_from_registry(content)
        frontend_charts = find_frontend_charts()

        undocumented = frontend_charts - registry_charts
        if undocumented:
            # Just print a warning, don't fail
            print(f"\nWARNING: Undocumented charts found: {undocumented}")
            print("Consider adding these to BACKEND_CHART_DEPENDENCIES.md")

    @pytest.mark.filterwarnings("ignore")
    def test_v1_endpoints_warning(self):
        """Warn about v1 endpoints that lack contract validation."""
        content = read_registry()
        if "v1 (NO validation" in content or "v1 - LEGACY" in content:
            print("\nWARNING: Registry contains v1 endpoints without contract validation")
            print("Consider migrating these to v2 with assertKnownVersion")
