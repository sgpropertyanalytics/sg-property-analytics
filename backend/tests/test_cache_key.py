import json
from datetime import date

from utils.cache_key import build_json_cache_key, build_query_cache_key


def test_build_json_cache_key_normalizes_and_sorts():
    params = {
        "b": 2,
        "a": [3, 2],
        "empty": [],
        "nested": {"y": 2, "x": 1},
        "when": date(2024, 1, 2),
    }
    expected_payload = {
        "a": [3, 2],
        "b": 2,
        "nested": {"x": 1, "y": 2},
        "when": "2024-01-02",
    }

    key = build_json_cache_key("agg", params)

    assert key == f"agg:{json.dumps(expected_payload, sort_keys=True)}"


def test_build_query_cache_key_filters_and_csv_lists():
    params = {
        "district": ["D01", "D02"],
        "date_from": date(2024, 5, 1),
        "ignored": "nope",
        "empty": "",
    }
    include_keys = ["district", "date_from", "date_to"]

    key = build_query_cache_key("summary", params, include_keys=include_keys)

    assert key == "summary:date_from=2024-05-01&district=D01,D02"
