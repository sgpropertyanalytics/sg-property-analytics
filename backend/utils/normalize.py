"""
Input Normalization Utilities
=============================

Single source of truth for input normalization.
All parsing of external inputs happens here, nowhere else.

Usage:
    from utils.normalize import to_int, to_date, to_bool, ValidationError

    @app.route("/data")
    def get_data():
        try:
            date_from = to_date(request.args.get("date_from"))
            limit = to_int(request.args.get("limit"), default=100)
        except ValidationError as e:
            return {"error": str(e)}, 400

        # Now types are guaranteed correct
        return service.get_data(date_from=date_from, limit=limit)

See: .claude/skills/input-boundary-guardrails/SKILL.md
"""

from datetime import date, datetime
from enum import Enum
from typing import Optional, Type, TypeVar, Union

E = TypeVar('E', bound=Enum)


class ValidationError(ValueError):
    """Raised when input cannot be normalized to expected type."""

    def __init__(self, message: str, field: str = None, received_value=None):
        super().__init__(message)
        self.field = field
        self.received_value = received_value


def to_int(
    value: Optional[str],
    *,
    default: Optional[int] = None,
    field: str = None
) -> Optional[int]:
    """
    Convert string to int, with explicit None handling.

    Args:
        value: Input string (typically from request.args.get())
        default: Value to return if input is None or empty
        field: Field name for error messages

    Returns:
        Parsed integer or default

    Raises:
        ValidationError: If value cannot be converted to int
    """
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        raise ValidationError(
            f"Expected int, got {type(value).__name__}: {value!r}",
            field=field,
            received_value=value
        )


def to_float(
    value: Optional[str],
    *,
    default: Optional[float] = None,
    field: str = None
) -> Optional[float]:
    """
    Convert string to float, with explicit None handling.

    Args:
        value: Input string (typically from request.args.get())
        default: Value to return if input is None or empty
        field: Field name for error messages

    Returns:
        Parsed float or default

    Raises:
        ValidationError: If value cannot be converted to float
    """
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        raise ValidationError(
            f"Expected float, got {type(value).__name__}: {value!r}",
            field=field,
            received_value=value
        )


def to_bool(
    value: Optional[str],
    *,
    default: bool = False,
    field: str = None
) -> bool:
    """
    Convert string to bool.

    Accepts (case-insensitive):
        True: 'true', '1', 'yes', 'on'
        False: 'false', '0', 'no', 'off'

    Args:
        value: Input string (typically from request.args.get())
        default: Value to return if input is None or empty
        field: Field name for error messages

    Returns:
        Parsed boolean or default

    Raises:
        ValidationError: If value is not a recognized boolean string
    """
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    lower = str(value).lower()
    if lower in ("true", "1", "yes", "on"):
        return True
    if lower in ("false", "0", "no", "off"):
        return False
    raise ValidationError(
        f"Expected bool, got: {value!r}",
        field=field,
        received_value=value
    )


def to_date(
    value: Optional[Union[str, date]],
    *,
    default: Optional[date] = None,
    field: str = None
) -> Optional[date]:
    """
    Convert string to date object.

    Accepts formats:
        - YYYY-MM-DD (full date)
        - YYYY-MM (first of month)
        - Already a date object (passthrough)
        - Already a datetime object (extracts date)

    Args:
        value: Input string or date object
        default: Value to return if input is None or empty
        field: Field name for error messages

    Returns:
        Parsed date or default

    Raises:
        ValidationError: If value cannot be parsed as date
    """
    if value is None or value == "":
        return default
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        # Support both YYYY-MM-DD and YYYY-MM
        if len(value) == 7:  # YYYY-MM
            return datetime.strptime(value, "%Y-%m").date()
        return datetime.strptime(value, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ValidationError(
            f"Expected date (YYYY-MM-DD), got {type(value).__name__}: {value!r}",
            field=field,
            received_value=value
        )


def to_datetime(
    value: Optional[str],
    *,
    default: Optional[datetime] = None,
    field: str = None
) -> Optional[datetime]:
    """
    Convert ISO string to datetime object (UTC assumed).

    Accepts formats:
        - ISO 8601 format (e.g., 2024-01-15T10:30:00Z)
        - Already a datetime object (passthrough)

    Args:
        value: Input ISO string or datetime object
        default: Value to return if input is None or empty
        field: Field name for error messages

    Returns:
        Parsed datetime or default

    Raises:
        ValidationError: If value cannot be parsed as datetime
    """
    if value is None or value == "":
        return default
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        raise ValidationError(
            f"Expected ISO datetime, got {type(value).__name__}: {value!r}",
            field=field,
            received_value=value
        )


def to_str(
    value: Optional[str],
    *,
    default: Optional[str] = None,
    strip: bool = True,
    field: str = None
) -> Optional[str]:
    """
    Normalize string input, optionally stripping whitespace.

    Args:
        value: Input string
        default: Value to return if input is None or empty
        strip: Whether to strip leading/trailing whitespace
        field: Field name for error messages

    Returns:
        Normalized string or default
    """
    if value is None or value == "":
        return default
    result = str(value)
    if strip:
        result = result.strip()
    # Treat whitespace-only as empty
    if result == "":
        return default
    return result


def to_list(
    value: Optional[str],
    *,
    default: Optional[list] = None,
    separator: str = ",",
    item_type: type = str,
    field: str = None
) -> Optional[list]:
    """
    Convert comma-separated string to list.

    Args:
        value: Input string (e.g., "1,2,3" or "D01,D02,D03")
        default: Value to return if input is None or empty
        separator: Separator character
        item_type: Type to convert each item to (str, int, float)
        field: Field name for error messages

    Returns:
        List of parsed items or default

    Raises:
        ValidationError: If any item cannot be converted
    """
    if value is None or value == "":
        return default if default is not None else []

    items = [item.strip() for item in value.split(separator) if item.strip()]

    if item_type == str:
        return items

    try:
        if item_type == int:
            return [int(item) for item in items]
        elif item_type == float:
            return [float(item) for item in items]
        else:
            return [item_type(item) for item in items]
    except (ValueError, TypeError) as e:
        raise ValidationError(
            f"Expected list of {item_type.__name__}, got invalid item in: {value!r}",
            field=field,
            received_value=value
        )


def to_enum(
    value: Optional[str],
    enum_class: Type[E],
    *,
    default: Optional[E] = None,
    field: str = None
) -> Optional[E]:
    """
    Convert string to enum member.

    Args:
        value: Input string (case-insensitive match against enum values)
        enum_class: The enum class to convert to
        default: Value to return if input is None or empty
        field: Field name for error messages

    Returns:
        Enum member or default

    Raises:
        ValidationError: If value doesn't match any enum member
    """
    if value is None or value == "":
        return default

    # Try exact match first (by value)
    for member in enum_class:
        if member.value == value:
            return member

    # Try case-insensitive match by value
    value_lower = value.lower()
    for member in enum_class:
        if str(member.value).lower() == value_lower:
            return member

    # Try match by name
    try:
        return enum_class[value.upper().replace(" ", "_").replace("-", "_")]
    except KeyError:
        pass

    valid_values = [m.value for m in enum_class]
    raise ValidationError(
        f"Expected one of {valid_values}, got: {value!r}",
        field=field,
        received_value=value
    )


def validation_error_response(error: ValidationError) -> tuple:
    """
    Convert ValidationError to a structured 400 response tuple.

    Usage:
        try:
            limit = to_int(request.args.get("limit"))
        except ValidationError as e:
            return validation_error_response(e)

    Returns:
        Tuple of (dict, 400) suitable for Flask response
    """
    response = {
        "error": str(error),
        "type": "validation_error"
    }
    if error.field:
        response["field"] = error.field
    if error.received_value is not None:
        response["received_value"] = str(error.received_value)
    return response, 400


# ============================================================================
# SERVICE LAYER COERCION (for internal use)
# ============================================================================

def coerce_to_date(value) -> Optional[date]:
    """
    Coerce value to date object. For use in SERVICE LAYER only.

    Services expect date objects internally, but this function provides
    backward-compatibility for legacy code that may still pass strings.

    Use Case:
        Routes normalize with to_date() → pass date objects to services
        Services use coerce_to_date() for legacy safety

    Accepts:
        - None (passthrough)
        - date object (passthrough)
        - datetime object (extracts .date())
        - string 'YYYY-MM-DD' (legacy, parsed)

    Raises:
        ValueError: If value cannot be coerced to date

    Example:
        from utils.normalize import coerce_to_date

        def build_filter_conditions(filters):
            if filters.get('date_from'):
                from_dt = coerce_to_date(filters['date_from'])
                conditions.append(Transaction.date >= from_dt)
    """
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        # Support both YYYY-MM-DD and YYYY-MM
        try:
            if len(value) == 7:  # YYYY-MM
                return datetime.strptime(value, "%Y-%m").date()
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError(f"Cannot parse date string: {value!r}")
    raise ValueError(f"Cannot coerce {type(value).__name__} to date: {value!r}")


# Convenience aliases
normalize_int = to_int
normalize_float = to_float
normalize_bool = to_bool
normalize_date = to_date
normalize_datetime = to_datetime
normalize_str = to_str
normalize_list = to_list
normalize_enum = to_enum
coerce_date = coerce_to_date  # Alias
