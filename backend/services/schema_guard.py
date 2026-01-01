"""
Schema Guard - targeted checks for required columns.

Used to prevent runtime 500s when migrations are missing.
"""
from typing import Dict, List, Optional

from sqlalchemy import text

from models.database import db


REQUIRED_USER_ENTITLEMENT_COLUMNS = [
    "access_override",
    "override_until",
    "entitlement_source",
]


def check_user_entitlement_columns() -> Dict[str, Optional[List[str]]]:
    """
    Check that required user entitlement columns exist.

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
            {"columns": REQUIRED_USER_ENTITLEMENT_COLUMNS},
        )
        existing = {row[0] for row in result.fetchall()}
        missing = [
            column for column in REQUIRED_USER_ENTITLEMENT_COLUMNS
            if column not in existing
        ]
        return {"missing": missing, "error": None}
    except Exception as exc:  # pragma: no cover - defensive guardrail
        return {"missing": REQUIRED_USER_ENTITLEMENT_COLUMNS, "error": str(exc)}
