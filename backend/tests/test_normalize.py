"""
Unit tests for utils/normalize.py

Tests all input normalization functions to ensure:
- Correct type conversion
- Proper None/empty string handling
- Appropriate defaults
- Clear ValidationError messages
"""

import pytest
from datetime import date, datetime
from enum import Enum

from utils.normalize import (
    ValidationError,
    to_int,
    to_float,
    to_bool,
    to_date,
    to_datetime,
    to_str,
    to_list,
    to_enum,
    validation_error_response,
)


class TestToInt:
    """Tests for to_int()"""

    def test_valid_int_string(self):
        assert to_int("123") == 123
        assert to_int("-456") == -456
        assert to_int("0") == 0

    def test_none_returns_none(self):
        assert to_int(None) is None

    def test_empty_string_returns_none(self):
        assert to_int("") is None

    def test_none_with_default(self):
        assert to_int(None, default=100) == 100

    def test_empty_with_default(self):
        assert to_int("", default=50) == 50

    def test_invalid_string_raises(self):
        with pytest.raises(ValidationError) as exc:
            to_int("abc")
        assert "Expected int" in str(exc.value)
        assert "abc" in str(exc.value)

    def test_float_string_raises(self):
        with pytest.raises(ValidationError):
            to_int("3.14")

    def test_field_in_error(self):
        with pytest.raises(ValidationError) as exc:
            to_int("bad", field="limit")
        assert exc.value.field == "limit"


class TestToFloat:
    """Tests for to_float()"""

    def test_valid_float_string(self):
        assert to_float("3.14") == 3.14
        assert to_float("-2.5") == -2.5
        assert to_float("100") == 100.0

    def test_none_returns_none(self):
        assert to_float(None) is None

    def test_empty_string_returns_none(self):
        assert to_float("") is None

    def test_with_default(self):
        assert to_float(None, default=1.5) == 1.5
        assert to_float("", default=0.0) == 0.0

    def test_invalid_string_raises(self):
        with pytest.raises(ValidationError) as exc:
            to_float("not-a-number")
        assert "Expected float" in str(exc.value)


class TestToBool:
    """Tests for to_bool()"""

    def test_true_values(self):
        assert to_bool("true") is True
        assert to_bool("True") is True
        assert to_bool("TRUE") is True
        assert to_bool("1") is True
        assert to_bool("yes") is True
        assert to_bool("on") is True

    def test_false_values(self):
        assert to_bool("false") is False
        assert to_bool("False") is False
        assert to_bool("0") is False
        assert to_bool("no") is False
        assert to_bool("off") is False

    def test_none_returns_default_false(self):
        assert to_bool(None) is False

    def test_empty_returns_default(self):
        assert to_bool("") is False
        assert to_bool("", default=True) is True

    def test_none_with_default_true(self):
        assert to_bool(None, default=True) is True

    def test_invalid_value_raises(self):
        with pytest.raises(ValidationError) as exc:
            to_bool("maybe")
        assert "Expected bool" in str(exc.value)

    def test_bool_passthrough(self):
        assert to_bool(True) is True
        assert to_bool(False) is False


class TestToDate:
    """Tests for to_date()"""

    def test_valid_date_string(self):
        assert to_date("2024-01-15") == date(2024, 1, 15)
        assert to_date("2023-12-31") == date(2023, 12, 31)

    def test_year_month_format(self):
        assert to_date("2024-01") == date(2024, 1, 1)
        assert to_date("2023-06") == date(2023, 6, 1)

    def test_none_returns_none(self):
        assert to_date(None) is None

    def test_empty_string_returns_none(self):
        assert to_date("") is None

    def test_with_default(self):
        default = date(2020, 1, 1)
        assert to_date(None, default=default) == default

    def test_date_passthrough(self):
        d = date(2024, 6, 15)
        assert to_date(d) == d

    def test_datetime_extracts_date(self):
        dt = datetime(2024, 6, 15, 10, 30, 0)
        assert to_date(dt) == date(2024, 6, 15)

    def test_invalid_format_raises(self):
        with pytest.raises(ValidationError) as exc:
            to_date("01-15-2024")  # Wrong format
        assert "Expected date" in str(exc.value)

    def test_invalid_date_raises(self):
        with pytest.raises(ValidationError):
            to_date("2024-13-01")  # Invalid month

    def test_garbage_raises(self):
        with pytest.raises(ValidationError):
            to_date("not-a-date")


class TestToDatetime:
    """Tests for to_datetime()"""

    def test_iso_format(self):
        result = to_datetime("2024-01-15T10:30:00")
        assert result == datetime(2024, 1, 15, 10, 30, 0)

    def test_iso_with_z_suffix(self):
        result = to_datetime("2024-01-15T10:30:00Z")
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15

    def test_none_returns_none(self):
        assert to_datetime(None) is None

    def test_empty_returns_none(self):
        assert to_datetime("") is None

    def test_datetime_passthrough(self):
        dt = datetime(2024, 6, 15, 10, 30)
        assert to_datetime(dt) == dt

    def test_invalid_format_raises(self):
        with pytest.raises(ValidationError):
            to_datetime("not-a-datetime")


class TestToStr:
    """Tests for to_str()"""

    def test_basic_string(self):
        assert to_str("hello") == "hello"

    def test_strips_whitespace(self):
        assert to_str("  hello  ") == "hello"
        assert to_str("\thello\n") == "hello"

    def test_no_strip(self):
        assert to_str("  hello  ", strip=False) == "  hello  "

    def test_none_returns_none(self):
        assert to_str(None) is None

    def test_empty_returns_none(self):
        assert to_str("") is None

    def test_with_default(self):
        assert to_str(None, default="default") == "default"
        assert to_str("", default="fallback") == "fallback"


class TestToList:
    """Tests for to_list()"""

    def test_comma_separated(self):
        assert to_list("a,b,c") == ["a", "b", "c"]

    def test_strips_items(self):
        assert to_list("a, b, c") == ["a", "b", "c"]
        assert to_list(" a , b , c ") == ["a", "b", "c"]

    def test_int_items(self):
        assert to_list("1,2,3", item_type=int) == [1, 2, 3]

    def test_float_items(self):
        assert to_list("1.5,2.5,3.5", item_type=float) == [1.5, 2.5, 3.5]

    def test_none_returns_empty(self):
        assert to_list(None) == []

    def test_empty_returns_empty(self):
        assert to_list("") == []

    def test_with_default(self):
        assert to_list(None, default=["x"]) == ["x"]

    def test_custom_separator(self):
        assert to_list("a|b|c", separator="|") == ["a", "b", "c"]

    def test_invalid_int_items_raises(self):
        with pytest.raises(ValidationError) as exc:
            to_list("1,two,3", item_type=int)
        assert "Expected list of int" in str(exc.value)


class SampleEnum(Enum):
    """Test enum for to_enum tests"""
    NEW_SALE = "New Sale"
    RESALE = "Resale"
    SUB_SALE = "Sub Sale"


class TestToEnum:
    """Tests for to_enum()"""

    def test_exact_value_match(self):
        assert to_enum("New Sale", SampleEnum) == SampleEnum.NEW_SALE
        assert to_enum("Resale", SampleEnum) == SampleEnum.RESALE

    def test_case_insensitive_match(self):
        assert to_enum("new sale", SampleEnum) == SampleEnum.NEW_SALE
        assert to_enum("NEW SALE", SampleEnum) == SampleEnum.NEW_SALE
        assert to_enum("resale", SampleEnum) == SampleEnum.RESALE

    def test_name_match(self):
        assert to_enum("NEW_SALE", SampleEnum) == SampleEnum.NEW_SALE
        assert to_enum("RESALE", SampleEnum) == SampleEnum.RESALE

    def test_none_returns_none(self):
        assert to_enum(None, SampleEnum) is None

    def test_empty_returns_none(self):
        assert to_enum("", SampleEnum) is None

    def test_with_default(self):
        assert to_enum(None, SampleEnum, default=SampleEnum.RESALE) == SampleEnum.RESALE

    def test_invalid_value_raises(self):
        with pytest.raises(ValidationError) as exc:
            to_enum("Unknown", SampleEnum)
        assert "Expected one of" in str(exc.value)
        assert "New Sale" in str(exc.value)
        assert "Unknown" in str(exc.value)


class TestValidationErrorResponse:
    """Tests for validation_error_response()"""

    def test_basic_response(self):
        error = ValidationError("Test error")
        response, status = validation_error_response(error)

        assert status == 400
        assert response["error"] == "Test error"
        assert response["type"] == "validation_error"

    def test_with_field(self):
        error = ValidationError("Bad value", field="limit")
        response, status = validation_error_response(error)

        assert response["field"] == "limit"

    def test_with_received_value(self):
        error = ValidationError("Bad value", received_value="abc")
        response, status = validation_error_response(error)

        assert response["received_value"] == "abc"

    def test_full_error(self):
        error = ValidationError("Expected int", field="page", received_value="xyz")
        response, status = validation_error_response(error)

        assert status == 400
        assert response["error"] == "Expected int"
        assert response["field"] == "page"
        assert response["received_value"] == "xyz"
        assert response["type"] == "validation_error"


class TestEdgeCases:
    """Edge case tests"""

    def test_whitespace_only_string(self):
        # Whitespace-only should be treated as empty after strip
        assert to_str("   ") is None
        assert to_str("   ", default="empty") == "empty"

    def test_to_int_with_whitespace(self):
        # int() handles whitespace, so this should work
        assert to_int(" 123 ") == 123

    def test_to_float_with_whitespace(self):
        assert to_float(" 3.14 ") == 3.14

    def test_to_date_with_whitespace(self):
        # strptime doesn't handle leading/trailing whitespace well
        with pytest.raises(ValidationError):
            to_date(" 2024-01-15 ")

    def test_large_numbers(self):
        assert to_int("999999999999") == 999999999999
        assert to_float("1e10") == 1e10

    def test_negative_numbers(self):
        assert to_int("-100") == -100
        assert to_float("-3.14") == -3.14
