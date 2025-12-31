# backend/tests/test_smoke_endpoints.py
"""
API Smoke Tests - Critical endpoint health checks

These tests run on every CI build to catch 404s BEFORE deploy.
If any endpoint the frontend relies on returns 404, CI fails.

Run: pytest backend/tests/test_smoke_endpoints.py -m smoke -v
"""
import pytest


@pytest.mark.smoke
def test_smoke_ping(client):
    """Dead-simple connectivity check - no DB required."""
    r = client.get("/api/ping")
    assert r.status_code == 200
    data = r.get_json()
    assert data.get("ok") is True


@pytest.mark.smoke
def test_smoke_metadata(client):
    """Metadata endpoint - used by DataContext."""
    r = client.get("/api/metadata")
    assert r.status_code == 200
    data = r.get_json()
    assert "total_records" in data or "active_records" in data


@pytest.mark.smoke
def test_smoke_filter_options(client):
    """Filter options - used by PowerBI filters."""
    r = client.get("/api/filter-options")
    assert r.status_code == 200
    data = r.get_json()
    assert "districts" in data and isinstance(data["districts"], list)


@pytest.mark.smoke
def test_smoke_districts(client):
    """Districts endpoint - used by DataContext and maps."""
    r = client.get("/api/districts")
    assert r.status_code == 200
    data = r.get_json()
    assert "districts" in data and isinstance(data["districts"], list)


@pytest.mark.smoke
def test_smoke_health(client):
    """Health check - used by monitoring."""
    r = client.get("/api/health")
    assert r.status_code == 200
    data = r.get_json()
    assert data.get("status") in ("healthy", "ok")


@pytest.mark.smoke
def test_smoke_aggregate(client):
    """Aggregate endpoint - core analytics API."""
    r = client.get("/api/aggregate?group_by=region&metrics=count")
    assert r.status_code == 200
    data = r.get_json()
    assert "data" in data


@pytest.mark.smoke
def test_smoke_kpi_summary(client):
    """KPI summary - used by dashboard KPI cards."""
    r = client.get("/api/kpi-summary-v2")
    assert r.status_code == 200
    data = r.get_json()
    assert "data" in data or "kpis" in data or isinstance(data, list)


@pytest.mark.smoke
def test_smoke_dashboard(client):
    """Dashboard endpoint - unified chart data."""
    r = client.get("/api/dashboard?panels=summary")
    assert r.status_code == 200
    data = r.get_json()
    assert "data" in data or "summary" in data


@pytest.mark.smoke
def test_smoke_auth_subscription_requires_auth(client):
    """Subscription endpoint - should require auth (401 without token)."""
    r = client.get("/api/auth/subscription")
    # 401 is expected without auth token - endpoint EXISTS
    assert r.status_code == 401


@pytest.mark.smoke
def test_smoke_projects_names(client):
    """Project names - used by Deal Checker dropdown."""
    r = client.get("/api/projects/names")
    assert r.status_code == 200
    data = r.get_json()
    assert "projects" in data


@pytest.mark.smoke
def test_smoke_gls_all(client):
    """GLS data - used by Supply & Inventory page."""
    r = client.get("/api/gls/all")
    assert r.status_code == 200


@pytest.mark.smoke
def test_smoke_supply_summary(client):
    """Supply summary - used by Supply & Inventory page."""
    r = client.get("/api/supply/summary")
    assert r.status_code == 200
