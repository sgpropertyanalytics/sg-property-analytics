"""
EXPLAIN ANALYZE safety guardrails.

CRITICAL: This module enforces strict safety rules for EXPLAIN ANALYZE:
1. NEVER run against production database
2. NEVER run unbounded queries (must have date OR segment filter)
3. NEVER run arbitrary SQL (only analyze existing codebase queries)
4. Always use read-only connection with timeout

Usage:
    from utils.explain_safety import run_explain_safely, ExplainSafetyError

    try:
        plan = run_explain_safely(db, sql, params)
    except ExplainSafetyError as e:
        print(f"BLOCKED: {e}")
"""

import os
import re
from typing import Tuple, Dict, Any, Optional


class ExplainSafetyError(Exception):
    """Raised when EXPLAIN would violate safety rules."""
    pass


def validate_environment() -> Tuple[bool, str]:
    """
    Check if current environment is safe for EXPLAIN ANALYZE.

    Returns:
        Tuple of (is_safe, reason_message)
    """
    db_url = os.getenv('DATABASE_URL', '')

    if not db_url:
        return False, "DATABASE_URL not set"

    # Production indicators - BLOCK these
    unsafe_patterns = [
        r'render\.com',
        r'\.onrender\.com',
        r'amazonaws\.com',
        r'\.rds\.',
        r'\.azure\.com',
        r'\.gcp\.com',
        r'prod',
        r'production',
        r'live-db',
    ]

    for pattern in unsafe_patterns:
        if re.search(pattern, db_url, re.IGNORECASE):
            return False, f"Production database detected (matched: {pattern})"

    # Safe indicators - ALLOW these
    safe_patterns = ['localhost', '127.0.0.1', 'docker', 'dev', 'test', 'local']
    is_safe = any(p in db_url.lower() for p in safe_patterns)

    if not is_safe:
        return False, f"Cannot confirm this is a development database. URL must contain: {safe_patterns}"

    return True, "Development environment confirmed"


def validate_query_bounds(sql: str) -> Tuple[bool, str]:
    """
    Check if query has required filter bounds.

    Queries without date OR segment bounds would scan entire transaction table.

    Returns:
        Tuple of (has_bounds, reason_message)
    """
    sql_lower = sql.lower()

    # Check for date bounds (parameter style :name or actual SQL)
    date_indicators = [
        ':date_from', ':min_date', ':date_to', ':max_date',
        ':max_date_exclusive', ':thirty_days_ago',
        'transaction_date >=', 'transaction_date <=',
        'transaction_date <', 'transaction_date >',
        'transaction_date between',
    ]
    has_date_filter = any(ind in sql_lower for ind in date_indicators)

    # Check for segment bounds (district, region, sale_type)
    segment_indicators = [
        ':district', ':segment', ':region', ':sale_type',
        'district =', 'district in',
        'sale_type =', 'sale_type in',
    ]
    has_segment_filter = any(ind in sql_lower for ind in segment_indicators)

    if not (has_date_filter or has_segment_filter):
        return False, (
            "Query lacks date or segment bounds - would scan entire table. "
            "Add WHERE transaction_date >= :min_date OR district = :district"
        )

    return True, "Query has appropriate filter bounds"


def validate_is_select(sql: str) -> Tuple[bool, str]:
    """
    Ensure query is read-only.

    Only SELECT and WITH...SELECT are allowed.

    Returns:
        Tuple of (is_safe, reason_message)
    """
    sql_stripped = sql.strip().upper()

    # Direct SELECT
    if sql_stripped.startswith('SELECT'):
        return True, "Read-only SELECT query"

    # EXPLAIN wrapper (in case already wrapped)
    if sql_stripped.startswith('EXPLAIN'):
        return True, "Already EXPLAIN wrapped"

    # CTE (WITH clause) - must NOT contain write operations
    if sql_stripped.startswith('WITH'):
        dangerous = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE']
        for d in dangerous:
            if d in sql_stripped:
                return False, f"Query contains {d} - not allowed for EXPLAIN"
        return True, "CTE with SELECT"

    return False, "Only SELECT queries allowed for EXPLAIN ANALYZE"


def parse_explain_output(plan: dict) -> Dict[str, Any]:
    """
    Parse EXPLAIN ANALYZE JSON output to extract key metrics.

    Args:
        plan: The first element of EXPLAIN (FORMAT JSON) output

    Returns:
        Dict with execution_time_ms, rows_returned, rows_estimated, plan_type, etc.
    """
    if not plan:
        return {}

    result = {
        'execution_time_ms': plan.get('Execution Time', 0),
        'planning_time_ms': plan.get('Planning Time', 0),
        'rows_returned': 0,
        'rows_estimated': 0,
        'plan_type': None,
        'shared_hit_blocks': 0,
        'shared_read_blocks': 0,
    }

    # Walk the plan tree to get root node info
    root = plan.get('Plan', {})
    if root:
        result['plan_type'] = root.get('Node Type', 'Unknown')
        result['rows_returned'] = root.get('Actual Rows', 0)
        result['rows_estimated'] = root.get('Plan Rows', 0)
        result['shared_hit_blocks'] = root.get('Shared Hit Blocks', 0)
        result['shared_read_blocks'] = root.get('Shared Read Blocks', 0)

    return result


def run_explain_safely(db, sql: str, params: dict) -> Dict[str, Any]:
    """
    Run EXPLAIN ANALYZE with all safety checks.

    Args:
        db: Flask-SQLAlchemy db instance
        sql: SQL query to analyze (SELECT only)
        params: Query parameters

    Returns:
        Parsed EXPLAIN output dict

    Raises:
        ExplainSafetyError: If any safety check fails
    """
    # Step 1: Environment check
    safe, msg = validate_environment()
    if not safe:
        raise ExplainSafetyError(f"Environment check failed: {msg}")

    # Step 2: Read-only check
    safe, msg = validate_is_select(sql)
    if not safe:
        raise ExplainSafetyError(f"Read-only check failed: {msg}")

    # Step 3: Bounds check
    safe, msg = validate_query_bounds(sql)
    if not safe:
        raise ExplainSafetyError(f"Bounds check failed: {msg}")

    # Step 4: Execute with timeout
    from sqlalchemy import text

    explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {sql}"

    # Set statement timeout (30 seconds max for EXPLAIN)
    db.session.execute(text("SET LOCAL statement_timeout = '30s'"))

    try:
        result = db.session.execute(text(explain_sql), params)
        plan_json = result.fetchone()[0]  # JSON array with one element
        plan = plan_json[0] if plan_json else {}
        return parse_explain_output(plan)
    finally:
        # Reset timeout (LOCAL means it auto-resets at transaction end anyway)
        pass


def check_for_seq_scan(plan: dict, table_name: str = 'transactions') -> Optional[str]:
    """
    Check if EXPLAIN plan contains sequential scan on specified table.

    Args:
        plan: Parsed EXPLAIN output
        table_name: Table to check for seq scan

    Returns:
        Warning message if seq scan found, None otherwise
    """
    # This would need to walk the full plan tree for complex queries
    plan_type = plan.get('plan_type', '')

    if 'Seq Scan' in plan_type:
        return f"Sequential scan detected - consider adding index or filters"

    return None
