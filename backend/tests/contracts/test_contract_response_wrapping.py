"""
Snapshot tests for response wrapping on endpoints that return top-level payloads.
"""

import json
from pathlib import Path

import pytest
from flask import request

from api.contracts import api_contract
from api.contracts.schemas import projects, projects_analytics, deal_checker  # noqa: F401


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


def _invoke_wrapped(app, endpoint, payload, *, query_string=None, view_args=None):
    @api_contract(endpoint)
    def handler():
        return payload

    with app.test_request_context("/test", query_string=query_string):
        if view_args:
            request.view_args = view_args
        result = handler()

    if isinstance(result, tuple):
        response, status = result
    else:
        response, status = result, 200
    return status, response.get_json()


@pytest.mark.parametrize(
    "endpoint,payload,query_string,view_args,snapshot_key",
    [
        (
            "projects/hot",
            {"projects": [], "total_count": 0, "last_updated": "2025-01-01T00:00:00Z"},
            None,
            None,
            "projects_hot",
        ),
        (
            "projects/inventory",
            {"project_name": "Sample Project", "cumulative_new_sales": 0},
            None,
            {"project_name": "Sample Project"},
            "projects_inventory",
        ),
        (
            "projects/price-bands",
            {"projectName": "Sample Project"},
            {"window_months": 24},
            {"project_name": "Sample Project"},
            "projects_price_bands",
        ),
        (
            "projects/exit-queue",
            {"projectName": "Sample Project"},
            None,
            {"project_name": "Sample Project"},
            "projects_exit_queue",
        ),
        (
            "deal-checker/multi-scope",
            {"project": {}, "filters": {}, "scopes": {}, "map_data": {}},
            {"project_name": "Sample Project", "bedroom": 2, "price": 1500000},
            None,
            "deal_checker_multi_scope",
        ),
        (
            "deal-checker/project-names",
            {"projects": [], "count": 0},
            None,
            None,
            "deal_checker_project_names",
        ),
    ],
)
def test_response_wrapping_snapshot(app, endpoint, payload, query_string, view_args, snapshot_key):
    snapshot_path = SNAPSHOT_DIR / "response_wrapping_samples.json"
    snapshot = json.loads(snapshot_path.read_text())

    status, response = _invoke_wrapped(
        app,
        endpoint,
        payload,
        query_string=query_string,
        view_args=view_args,
    )

    assert status == 200
    assert "data" in response
    assert "meta" in response

    expected = snapshot[snapshot_key]
    for key in expected["data_keys"]:
        assert key in response["data"]
    for key in expected["meta_keys"]:
        assert key in response["meta"]
