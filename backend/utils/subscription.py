"""
Access Check Utility

Provides authentication and access helpers from Firebase ID tokens.
"""
from flask import request
from functools import wraps
from models.user import User
from models.database import db


def get_user_from_firebase_token():
    """
    Extract and verify user from Authorization: Bearer <firebase-id-token> header.

    Verifies the Firebase ID token via firebase_admin.auth, looks up the user
    by firebase_uid (indexed), auto-creates if not found, and updates profile
    if changed.

    Returns:
        User object if valid Firebase token, None otherwise
    """
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None

    id_token = auth_header.split(' ', 1)[1]
    if not id_token:
        return None

    try:
        from routes.auth import get_firebase_app
        firebase_app = get_firebase_app()
        if not firebase_app:
            return None

        from firebase_admin import auth as firebase_auth
        decoded_token = firebase_auth.verify_id_token(id_token)
    except Exception:
        return None

    firebase_uid = decoded_token.get('uid')
    email = decoded_token.get('email')
    display_name = decoded_token.get('name')
    avatar_url = decoded_token.get('picture')

    if not firebase_uid:
        return None

    try:
        # Lookup by firebase_uid first (indexed, fast)
        user = User.query.filter_by(firebase_uid=firebase_uid).first()

        if not user and email:
            # Fallback: lookup by email (for existing users without firebase_uid linked)
            user = User.query.filter_by(email=email.strip().lower()).first()
            if user:
                # Link firebase_uid to existing user
                user.firebase_uid = firebase_uid
                db.session.commit()

        if not user:
            # Auto-create user
            user = User(
                email=email.strip().lower() if email else None,
                firebase_uid=firebase_uid,
                password_hash='firebase_auth',
                display_name=display_name,
                avatar_url=avatar_url,
            )
            user.access_level = 'authenticated'
            db.session.add(user)
            db.session.commit()
        else:
            # Update profile if changed
            needs_update = False
            if display_name and display_name != user.display_name:
                user.display_name = display_name
                needs_update = True
            if avatar_url and avatar_url != user.avatar_url:
                user.avatar_url = avatar_url
                needs_update = True
            if needs_update:
                db.session.commit()

        return user
    except Exception:
        db.session.rollback()
        return None


def get_user_from_request():
    """
    Extract and verify user from request.

    Verifies Firebase ID token from Authorization: Bearer header.

    Returns:
        User object if valid token, None otherwise
    """
    return get_user_from_firebase_token()


def has_authenticated_access():
    """Return True when the current request is from an authenticated user."""
    user = get_user_from_request()
    if not user:
        return False

    return True


def get_access_level():
    """
    Get access level for current request.

    Returns:
        'authenticated' if authenticated
        'anonymous' if not authenticated
    """
    user = get_user_from_request()
    if not user:
        return 'anonymous'

    return 'authenticated'


def check_granularity_allowed(group_by, has_authenticated_access_override=None):
    """
    Check if requested grouping granularity is allowed.

    Args:
        group_by: Comma-separated grouping fields (e.g., 'district,quarter')
        has_authenticated_access_override: Override access check

    Returns:
        tuple: (allowed: bool, error_message: str or None)
    """
    if has_authenticated_access_override is None:
        has_authenticated_access_override = has_authenticated_access()

    # Authenticated users can use any granularity.
    if has_authenticated_access_override:
        return (True, None)

    # Anonymous access: check for project-level grouping.
    BLOCKED_FIELDS = ['project', 'project_name', 'address', 'unit', 'floor']

    if group_by:
        fields = [f.strip().lower() for f in group_by.split(',')]
        for field in fields:
            if any(blocked in field for blocked in BLOCKED_FIELDS):
                return (False, "Project-level data requires authenticated access.")

    return (True, None)


def require_authenticated_access(f):
    """
    Decorator to require authentication for an endpoint.

    Returns:
        - 200: OPTIONS preflight (CORS bypass)
        - 401: Not authenticated
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        from flask import jsonify

        # CORS: Let OPTIONS preflight through (browser won't send auth headers)
        if request.method == "OPTIONS":
            return f(*args, **kwargs)

        # Step 1: Check authentication first → 401 if not authenticated
        user = get_user_from_request()
        if not user:
            return jsonify({
                "error": "Authentication required",
                "code": "AUTH_REQUIRED"
            }), 401

        return f(*args, **kwargs)
    return decorated_function


# ============================================================================
# TIERED K-ANONYMITY FOR URA COMPLIANCE
# ============================================================================
#
# Data privacy rules apply uniformly to all users regardless of access level.
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

    CRITICAL: Same rules apply uniformly regardless of access level.
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


def enforce_filter_granularity(filters, has_authenticated_access_override=None):
    """
    Limit filter granularity for anonymous access to prevent re-identification.

    Args:
        filters: Dict of filter parameters
        has_authenticated_access_override: Override access check

    Returns:
        tuple: (sanitized_filters: dict, warnings: list)
    """
    if has_authenticated_access_override is None:
        has_authenticated_access_override = has_authenticated_access()

    # Authenticated users: no restrictions.
    if has_authenticated_access_override:
        return (filters, [])

    sanitized = dict(filters)
    warnings = []

    # Block exact project filter for anonymous users.
    if 'project_exact' in sanitized:
        del sanitized['project_exact']
        warnings.append("Exact project search requires authenticated access")

    if 'project' in sanitized:
        del sanitized['project']
        warnings.append("Project search requires authenticated access")

    return (sanitized, warnings)
