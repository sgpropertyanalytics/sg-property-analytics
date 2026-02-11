"""
Schema Guard - targeted checks for required columns.

Used to prevent runtime 500s when migrations are missing.
"""
from typing import Dict, List, Optional

from sqlalchemy import text

from models.database import db


REQUIRED_USER_ACCESS_COLUMNS = [
    "access_override_enabled",
    "access_override_until",
    "access_tier",
]


def check_user_access_columns() -> Dict[str, Optional[List[str]]]:
    """
    Check that required user access columns exist.

    Returns:
        dict with:
            - missing: list of missing column names
            - error: error string if the check failed
    """
    try:
        result = db.session.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'users'
                  AND column_name = ANY(:columns)
                """
            ),
            {"columns": REQUIRED_USER_ACCESS_COLUMNS + ["access_source", "billing_customer_ref"]},
        )
        existing = {row[0] for row in result.fetchall()}
        missing = [column for column in REQUIRED_USER_ACCESS_COLUMNS if column not in existing]
        if "access_source" not in existing:
            missing.append("access_source")
        if "billing_customer_ref" not in existing:
            missing.append("billing_customer_ref")
        return {"missing": missing, "error": None}
    except Exception as exc:  # pragma: no cover - defensive guardrail
        return {
            "missing": REQUIRED_USER_ACCESS_COLUMNS + ["access_source", "billing_customer_ref"],
            "error": str(exc),
        }


def check_user_entitlement_columns() -> Dict[str, Optional[List[str]]]:
    """Backward-compatible alias. Use check_user_access_columns()."""
    return check_user_access_columns()
