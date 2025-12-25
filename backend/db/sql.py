"""
SQL execution helper with enforced best practices.

Best practices enforced:
1. Use :name param style only (SQLAlchemy bind params)
2. Pass Python date objects directly (no .isoformat() conversion)
3. Never use percent-paren psycopg2-specific style
4. COALESCE(is_outlier, false) = false for null safety

Usage:
    from db.sql import run_sql, validate_sql_params

    result = run_sql(
        db,
        '''
        SELECT * FROM transactions
        WHERE project_name = :project_name
          AND transaction_date >= :date_from
          AND COALESCE(is_outlier, false) = false
        ''',
        project_name='GRAND DUNMAN',
        date_from=date(2024, 1, 1)
    )
"""
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy import text


# Regex patterns for validation
PSYCOPG2_PARAM_PATTERN = re.compile(r'%\([a-zA-Z_][a-zA-Z0-9_]*\)s')
SQLALCHEMY_PARAM_PATTERN = re.compile(r':([a-zA-Z_][a-zA-Z0-9_]*)')


class SQLParamStyleError(Exception):
    """Raised when SQL uses incorrect parameter style."""
    pass


class SQLDateParamError(Exception):
    """Raised when date parameters are not Python date/datetime objects."""
    pass


def validate_sql_text(sql: str) -> None:
    """
    Validate that SQL text uses correct :name param style.

    Raises SQLParamStyleError if psycopg2 percent-paren style is detected.
    """
    matches = PSYCOPG2_PARAM_PATTERN.findall(sql)
    if matches:
        raise SQLParamStyleError(
            f"SQL contains psycopg2-style params: {matches}. "
            f"Use SQLAlchemy :name style instead."
        )


def validate_params(params: Dict[str, Any]) -> None:
    """
    Validate that date parameters are Python date/datetime objects.

    Raises SQLDateParamError if date params are strings.
    """
    date_param_names = {'date_from', 'date_to', 'start_date', 'end_date',
                        'cutoff_date', 'twelve_months_ago', 'twenty_four_months_ago'}

    for key, value in params.items():
        # Check if this looks like a date param
        is_date_param = (
            key in date_param_names or
            key.endswith('_date') or
            key.startswith('date_')
        )

        if is_date_param and value is not None:
            if isinstance(value, str):
                raise SQLDateParamError(
                    f"Date parameter '{key}' is a string ('{value}'). "
                    f"Pass a Python date or datetime object instead."
                )
            if not isinstance(value, (date, datetime)):
                raise SQLDateParamError(
                    f"Date parameter '{key}' has type {type(value).__name__}. "
                    f"Expected date or datetime."
                )


def extract_param_names(sql: str) -> List[str]:
    """Extract :name parameter names from SQL text."""
    return SQLALCHEMY_PARAM_PATTERN.findall(sql)


def run_sql(
    db,
    sql: str,
    validate: bool = True,
    **params
) -> List[Tuple]:
    """
    Execute SQL with validation and best-practice enforcement.

    Args:
        db: SQLAlchemy database session (or object with .session.execute)
        sql: SQL text using :name param style
        validate: Whether to validate SQL and params (default True)
        **params: Named parameters to pass to the query

    Returns:
        List of result rows

    Raises:
        SQLParamStyleError: If SQL uses psycopg2 percent-paren style
        SQLDateParamError: If date params are strings instead of date objects

    Example:
        results = run_sql(
            db,
            '''
            SELECT project_name, COUNT(*)
            FROM transactions
            WHERE district = :district
              AND transaction_date >= :date_from
              AND COALESCE(is_outlier, false) = false
            GROUP BY project_name
            ''',
            district='D15',
            date_from=date(2024, 1, 1)
        )
    """
    if validate:
        validate_sql_text(sql)
        validate_params(params)

    # Get session - handle both db and db.session patterns
    session = getattr(db, 'session', db)

    result = session.execute(text(sql), params)
    return result.fetchall()


def run_sql_scalar(
    db,
    sql: str,
    validate: bool = True,
    **params
) -> Any:
    """
    Execute SQL and return a single scalar value.

    Useful for COUNT(*), MAX(), etc.
    """
    if validate:
        validate_sql_text(sql)
        validate_params(params)

    session = getattr(db, 'session', db)
    result = session.execute(text(sql), params)
    row = result.fetchone()
    return row[0] if row else None


def run_sql_one(
    db,
    sql: str,
    validate: bool = True,
    **params
) -> Optional[Tuple]:
    """
    Execute SQL and return a single row or None.
    """
    if validate:
        validate_sql_text(sql)
        validate_params(params)

    session = getattr(db, 'session', db)
    result = session.execute(text(sql), params)
    return result.fetchone()


# Standard filter snippets for reuse
OUTLIER_FILTER = "COALESCE(is_outlier, false) = false"
