"""
Subscription Check Utility

Provides functions to check user subscription status from JWT tokens.
Use this for tier-aware API responses - return full data for premium users,
teaser data for free users.

SECURITY: This is the SERVER-SIDE enforcement layer. Frontend blur is UI only.

Preview Dashboard Model (Blur Paywall):
- Free users: ALL data returned, but frontend shows blurred UI
- Premium users: Full access, no blur
- NO time restrictions - all historical data available to everyone
- Granularity restrictions: Free users cannot group by project-level fields
"""
from flask import request
from functools import wraps
from models.user import User


def get_user_from_request():
    """
    Extract and verify user from Authorization header.

    Returns:
        User object if valid token, None otherwise
    """
    from routes.auth import verify_token

    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None

    token = auth_header.split(' ')[1]
    user_id = verify_token(token)

    if not user_id:
        return None

    return User.query.get(user_id)


def is_premium_user():
    """
    Check if current request is from a premium subscriber.

    Returns:
        True if user has active premium subscription, False otherwise
        (including unauthenticated users)
    """
    user = get_user_from_request()
    if not user:
        return False
    return user.is_subscribed()


def get_subscription_tier():
    """
    Get the subscription tier for current request.

    Returns:
        'premium' if active subscription
        'free' if authenticated but no subscription
        'anonymous' if not authenticated
    """
    user = get_user_from_request()
    if not user:
        return 'anonymous'
    if user.is_subscribed():
        return 'premium'
    return 'free'


def check_granularity_allowed(group_by, is_premium=None):
    """
    Check if the requested grouping granularity is allowed for the user's tier.

    Free users can only group by:
    - district, region, segment (location)
    - year, quarter, month (time)
    - bedroom, sale_type (general dimensions)

    Free users CANNOT group by:
    - project (project-level precision)
    - Any other granular identifiers

    Args:
        group_by: Comma-separated grouping fields (e.g., 'district,quarter')
        is_premium: Override tier check

    Returns:
        tuple: (allowed: bool, error_message: str or None)
    """
    if is_premium is None:
        is_premium = is_premium_user()

    # Premium users can use any granularity
    if is_premium:
        return (True, None)

    # Free tier: check for project-level grouping
    BLOCKED_FIELDS = ['project', 'project_name', 'address', 'unit', 'floor']

    if group_by:
        fields = [f.strip().lower() for f in group_by.split(',')]
        for field in fields:
            if any(blocked in field for blocked in BLOCKED_FIELDS):
                return (False, f"Project-level data requires premium subscription. Upgrade to see exact project names.")

    return (True, None)


def require_premium(f):
    """
    Decorator to require premium subscription for an endpoint.

    Returns 403 if user is not premium.
    Use for endpoints that should be completely blocked for free users.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_premium_user():
            from flask import jsonify
            return jsonify({
                "error": "Premium subscription required",
                "code": "PREMIUM_REQUIRED"
            }), 403
        return f(*args, **kwargs)
    return decorated_function


def require_auth(f):
    """
    Decorator to require authentication (any tier).

    Returns 401 if user is not authenticated.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_user_from_request()
        if not user:
            from flask import jsonify
            return jsonify({
                "error": "Authentication required",
                "code": "AUTH_REQUIRED"
            }), 401
        return f(*args, **kwargs)
    return decorated_function


def serialize_transaction(transaction, is_premium=None):
    """
    Serialize a transaction based on user's subscription tier.

    Args:
        transaction: Transaction model instance
        is_premium: Override tier check (useful when checked once for batch)

    Returns:
        dict - full data for premium, masked data for free/anonymous
    """
    if is_premium is None:
        is_premium = is_premium_user()

    if is_premium:
        return transaction.to_dict()
    else:
        return transaction.to_teaser_dict()


def serialize_transactions(transactions, is_premium=None, schema_version='v1'):
    """
    Serialize a list of transactions based on user's subscription tier.

    Optimized for batch serialization - checks tier once.

    Args:
        transactions: List of Transaction model instances
        is_premium: Override tier check
        schema_version: 'v1' (default, includes deprecated snake_case fields)
                       'v2' (clean output, camelCase + enum values only)

    Returns:
        list of dicts - full data for premium, masked data for free/anonymous
    """
    from schemas.api_contract import serialize_transaction, serialize_transaction_teaser

    if is_premium is None:
        is_premium = is_premium_user()

    # v2 means no deprecated fields; v1 (default) includes both old and new
    include_deprecated = (schema_version != 'v2')

    if is_premium:
        return [serialize_transaction(t, include_deprecated=include_deprecated) for t in transactions]
    else:
        return [serialize_transaction_teaser(t, include_deprecated=include_deprecated) for t in transactions]


# ============================================================================
# TIERED K-ANONYMITY FOR URA COMPLIANCE
# ============================================================================
#
# Data privacy rules apply uniformly to ALL users regardless of subscription tier.
# Premium access enhances analytical tools, NOT data granularity.
#
# Thresholds by granularity level:
#   - Market/Segment: K ≥ 30 (broadest scope)
#   - District: K ≥ 20
#   - Project (large): K ≥ 15
#   - Unit-level: ALWAYS BLOCKED
#
# If K-anonymity fails at the requested level, we auto-widen to a higher level.

K_THRESHOLDS = {
    "market": 30,      # Broadest - highest threshold
    "segment": 30,     # CCR/RCR/OCR
    "district": 20,    # D01-D28
    "project": 15,     # Individual projects
    "unit": None,      # ALWAYS BLOCKED - never allow
}

# Legacy constant for backward compatibility
K_ANONYMITY_THRESHOLD = 30  # Use the strictest threshold as default


def get_k_threshold(level: str) -> int:
    """
    Get K threshold for a granularity level.

    Args:
        level: One of 'market', 'segment', 'district', 'project', 'unit'

    Returns:
        int threshold for that level

    Raises:
        ValueError if level is 'unit' (always blocked)
    """
    if level == "unit":
        raise ValueError("Unit-level queries are not permitted")
    return K_THRESHOLDS.get(level, 30)  # Default to strictest


def get_granularity_level(filters: dict) -> str:
    """
    Derive granularity level from filter parameters.

    Examines the effective filter grouping to determine privacy level.

    Args:
        filters: Dict of filter parameters

    Returns:
        One of 'market', 'segment', 'district', 'project'
    """
    # Unit-identifying fields are always blocked
    UNIT_FIELDS = {'unit', 'unit_number', 'address', 'block', 'stack', 'floor',
                   'floor_range', 'floor_level'}

    if filters:
        filter_keys = {k.lower() for k in filters.keys()}
        if filter_keys & UNIT_FIELDS:
            return "unit"  # Will be blocked

        if filters.get('project_exact') or filters.get('project'):
            return "project"
        elif filters.get('district'):
            return "district"
        elif filters.get('segment'):
            return "segment"

    return "market"


def check_k_anonymity(count, level=None, filters=None):
    """
    Tiered K-anonymity check.

    CRITICAL: Same rules apply uniformly regardless of subscription tier.
    Premium differentiation is in tooling, NOT data granularity.

    Args:
        count: Number of observations in result set
        level: Granularity level ('market', 'segment', 'district', 'project')
               If not provided, derived from filters
        filters: Filter dict to derive level from (if level not provided)

    Returns:
        tuple: (passes_check: bool, error_message: str or None)
    """
    # Derive level from filters if not explicitly provided
    if level is None:
        level = get_granularity_level(filters or {})

    # Unit-level is always blocked
    if level == "unit":
        return (False, "Unit-level data is not available for privacy reasons.")

    k_required = get_k_threshold(level)
    if count < k_required:
        return (
            False,
            f"Insufficient market activity at {level} level. "
            f"Minimum {k_required} observations required."
        )
    return (True, None)


def auto_widen_for_k_anonymity(filters: dict, get_count_fn):
    """
    Automatically widen filters until K-anonymity passes.

    Progressively widens: project → district → segment → market

    Args:
        filters: Original filter dict
        get_count_fn: Callable that takes filters and returns count

    Returns:
        tuple: (final_filters: dict, fallback_level: str, count: int)
    """
    def remove_project(f):
        """Remove project filters"""
        result = dict(f)
        result.pop('project', None)
        result.pop('project_exact', None)
        return result

    def remove_district(f):
        """Remove district filter (keep project removed)"""
        result = remove_project(f)
        result.pop('district', None)
        return result

    def remove_segment(f):
        """Remove segment filter (keep district/project removed)"""
        result = remove_district(f)
        result.pop('segment', None)
        return result

    current_level = get_granularity_level(filters)

    # Build widening path from current level
    if current_level == "unit":
        # Unit is always blocked - widen to project first
        widening_path = [
            (remove_project(filters), "project", 15),
            (remove_district(filters), "district", 20),
            (remove_segment(filters), "segment", 30),
            ({}, "market", 30),
        ]
    elif current_level == "project":
        widening_path = [
            (filters, "project", 15),
            (remove_project(filters), "district", 20),
            (remove_district(filters), "segment", 30),
            (remove_segment(filters), "market", 30),
        ]
    elif current_level == "district":
        widening_path = [
            (filters, "district", 20),
            (remove_district(filters), "segment", 30),
            (remove_segment(filters), "market", 30),
        ]
    elif current_level == "segment":
        widening_path = [
            (filters, "segment", 30),
            (remove_segment(filters), "market", 30),
        ]
    else:  # market
        widening_path = [(filters, "market", 30)]

    for widened_filters, level, k_required in widening_path:
        count = get_count_fn(widened_filters)
        if count >= k_required:
            return widened_filters, level, count

    # Even market-wide doesn't pass - return with warning
    return {}, "market", 0


def build_k_anonymity_meta(passed: bool, fallback_level: str, count: int) -> dict:
    """
    Build metadata block with clear K-anonymity messaging.

    Provides transparency about data aggregation level.

    Args:
        passed: Whether K-anonymity check passed
        fallback_level: Level data is aggregated at (None if original level)
        count: Number of observations

    Returns:
        dict with kAnonymity metadata for API responses
    """
    messages = {
        None: None,
        "project": None,  # Original level passed
        "district": "Expanded to district level due to limited market activity.",
        "segment": "Expanded to market segment level due to limited market activity.",
        "market": "Showing market-wide data due to limited activity in selected filters.",
    }

    return {
        "kAnonymityPassed": passed,
        "fallbackLevel": fallback_level,
        "message": messages.get(fallback_level),
        "observationCount": count,
    }


def build_suppressed_row(level: str, count: int, identifiers: dict = None) -> dict:
    """
    Build a suppressed row response when count < K_required.

    MANDATORY: Use this for any row where observation count is below
    the K-anonymity threshold for that level.

    Args:
        level: Granularity level ('project', 'district', 'segment', 'market')
        count: Actual observation count
        identifiers: Dict of non-sensitive identifiers to preserve
                    (e.g., {"project": "The Sail", "district": "D01"})

    Returns:
        dict with suppressed=True and null sensitive fields
    """
    k_required = get_k_threshold(level) if level != "unit" else 15

    result = {
        "suppressed": True,
        "kRequired": k_required,
        "observationCount": count,
        "reason": f"Insufficient sample size (minimum {k_required} observations required)",
        # Sensitive fields - always null when suppressed
        "medianPrice": None,
        "medianPsf": None,
        "psfRange": None,
        "priceRange": None,
        "sqft": None,
    }

    # Preserve non-sensitive identifiers for spatial/discovery context
    if identifiers:
        result.update(identifiers)

    return result


def suppress_if_needed(row: dict, count: int, level: str = "project") -> dict:
    """
    Check if a row needs suppression and apply it if so.

    Use this to post-process aggregated rows before returning.

    Args:
        row: Original row dict with aggregated values
        count: Observation count for this row
        level: Granularity level

    Returns:
        Original row if K passes, suppressed row if not
    """
    passes, _ = check_k_anonymity(count, level=level)

    if passes:
        # Add suppressed=False for frontend consistency
        row["suppressed"] = False
        row["observationCount"] = count
        return row

    # Extract non-sensitive identifiers to preserve
    identifiers = {}
    safe_keys = {"project", "projectName", "district", "segment", "region",
                 "bedroom", "bedroomCount", "tenure", "name", "distance"}
    for key in safe_keys:
        if key in row:
            identifiers[key] = row[key]

    return build_suppressed_row(level, count, identifiers)


def enforce_filter_granularity(filters, is_premium=None):
    """
    Limit filter granularity for free users to prevent re-identification.

    Free tier restrictions:
    - No exact project filter (can use district)
    - No date filter more specific than quarter
    - No exact price filter (can use ranges)

    Args:
        filters: Dict of filter parameters
        is_premium: Override tier check

    Returns:
        tuple: (sanitized_filters: dict, warnings: list)
    """
    if is_premium is None:
        is_premium = is_premium_user()

    # Premium users: no restrictions
    if is_premium:
        return (filters, [])

    sanitized = dict(filters)
    warnings = []

    # Block exact project filter for free users
    if 'project_exact' in sanitized:
        del sanitized['project_exact']
        warnings.append("Exact project search requires premium subscription")

    if 'project' in sanitized:
        del sanitized['project']
        warnings.append("Project search requires premium subscription")

    return (sanitized, warnings)
