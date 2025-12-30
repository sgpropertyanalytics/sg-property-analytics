from datetime import date

from constants import CCR_DISTRICTS
from utils.filter_builder import build_sql_where, normalize_district


def test_normalize_district_variants():
    assert normalize_district("1") == "D01"
    assert normalize_district("D1") == "D01"
    assert normalize_district("d09") == "D09"


def test_build_sql_where_districts_normalized():
    where_parts, params = build_sql_where({"districts": ["1", "D02"]})

    assert "COALESCE(is_outlier, false) = false" in where_parts
    assert any("district IN" in part for part in where_parts)
    assert params["district_0"] == "D01"
    assert params["district_1"] == "D02"


def test_build_sql_where_segment_expansion():
    where_parts, params = build_sql_where({"segments": ["CCR"]})

    assert any("district IN" in part for part in where_parts)
    assert len([k for k in params if k.startswith("seg_district_")]) == len(CCR_DISTRICTS)
    assert all(v in CCR_DISTRICTS for v in params.values())


def test_build_sql_where_date_range_exclusive():
    filters = {"date_from": date(2024, 1, 1), "date_to": date(2024, 1, 31)}
    where_parts, params = build_sql_where(filters)

    assert "transaction_date >= :date_from" in where_parts
    assert "transaction_date < :date_to_exclusive" in where_parts
    assert params["date_from"] == date(2024, 1, 1)
    assert params["date_to_exclusive"] == date(2024, 2, 1)
