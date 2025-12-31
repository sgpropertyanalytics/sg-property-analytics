# backend/tests/test_districts_superset.py
"""
Districts Superset Equivalence Test

Ensures /filter-options always includes all districts from /districts.
This guards against drift where one endpoint has data the other lacks.

Run: pytest tests/test_districts_superset.py -v
"""
import pytest


def _extract_district_values(districts_raw):
    """Extract district values from various response formats.

    Handles:
    - List of strings: ['D01', 'D02', ...]
    - List of {value, label} objects: [{value: 'D01', label: 'D01'}, ...]
    """
    if not districts_raw:
        return []

    if isinstance(districts_raw[0], dict):
        return [d.get("value") for d in districts_raw if d.get("value")]
    return list(districts_raw)


def _unwrap_response(data):
    """Unwrap api_contract decorator's data wrapper if present.

    The @api_contract decorator wraps responses as:
    {"data": {...actual response...}, "meta": {...}}

    Non-decorated endpoints return the response directly.
    """
    if isinstance(data, dict) and "data" in data and "meta" in data:
        return data["data"]
    return data


@pytest.mark.smoke
def test_filter_options_contains_all_districts(client):
    """
    /filter-options.districts must be a superset of /districts.districts.

    This test fails if:
    - Either endpoint returns non-200
    - /districts has entries not in /filter-options
    - Order differs (both should be sorted)
    """
    # Fetch both endpoints
    districts_resp = client.get("/api/districts")
    filter_opts_resp = client.get("/api/filter-options")

    # Both must return 200
    assert districts_resp.status_code == 200, f"/districts returned {districts_resp.status_code}"
    assert filter_opts_resp.status_code == 200, (
        f"/filter-options returned {filter_opts_resp.status_code}: "
        f"{filter_opts_resp.get_json()}"
    )

    districts_data = districts_resp.get_json()
    filter_opts_data = _unwrap_response(filter_opts_resp.get_json())

    # Check for error in filter-options response
    assert "error" not in filter_opts_data, (
        f"/filter-options returned error: {filter_opts_data.get('error')}"
    )

    # Extract district lists
    districts_list = districts_data.get("districts", [])
    filter_opts_districts_raw = filter_opts_data.get("districts", [])

    # Debug: print what we got if empty
    if not filter_opts_districts_raw:
        print(f"DEBUG: /filter-options response keys: {list(filter_opts_data.keys())}")
        print(f"DEBUG: /filter-options first 200 chars: {str(filter_opts_data)[:200]}")

    # Normalize both to list of strings
    filter_opts_districts = _extract_district_values(filter_opts_districts_raw)

    # Convert to sets for comparison
    districts_set = set(districts_list)
    filter_opts_set = set(filter_opts_districts)

    # /filter-options must contain all districts from /districts (superset)
    missing_in_filter_opts = districts_set - filter_opts_set
    assert not missing_in_filter_opts, (
        f"Districts missing from /filter-options: {missing_in_filter_opts}\n"
        f"/districts has {len(districts_set)} entries, /filter-options has {len(filter_opts_set)}\n"
        f"Raw filter_opts_districts: {filter_opts_districts_raw[:3] if filter_opts_districts_raw else 'EMPTY'}"
    )

    # They should be exactly equal (same source)
    extra_in_filter_opts = filter_opts_set - districts_set
    assert not extra_in_filter_opts, (
        f"Extra districts in /filter-options: {extra_in_filter_opts}\n"
        "Both endpoints should use the same source function."
    )

    # Order should match (both sorted by district code)
    assert districts_list == filter_opts_districts, (
        f"District order mismatch:\n"
        f"/districts: {districts_list[:5]}...\n"
        f"/filter-options: {filter_opts_districts[:5]}..."
    )


@pytest.mark.smoke
def test_districts_endpoint_marked_deprecated(client):
    """
    /districts response should include deprecation notice.
    """
    resp = client.get("/api/districts")
    assert resp.status_code == 200

    data = resp.get_json()
    assert data.get("_deprecated") is True, "/districts should be marked deprecated"
    assert "_message" in data, "/districts should include deprecation message"


@pytest.mark.smoke
def test_filter_options_districts_not_empty(client):
    """
    /filter-options must return non-empty districts list.
    """
    resp = client.get("/api/filter-options")
    assert resp.status_code == 200

    raw_data = resp.get_json()
    data = _unwrap_response(raw_data)
    districts_raw = data.get("districts", [])

    # Debug: print response keys if districts missing
    if not districts_raw:
        print(f"DEBUG: Response keys: {list(data.keys())}")
        print(f"DEBUG: Response sample: {str(data)[:300]}")

    # Normalize to list of values
    districts = _extract_district_values(districts_raw)

    assert len(districts) > 0, (
        f"/filter-options returned empty districts. "
        f"Response keys: {list(data.keys())}"
    )
    assert len(districts) >= 20, f"Expected 20+ districts, got {len(districts)}"
