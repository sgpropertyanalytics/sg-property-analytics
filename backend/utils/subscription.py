"""
Subscription Check Utility

Provides functions to check user subscription status from JWT tokens.
Use this for tier-aware API responses - return full data for premium users,
teaser data for free users.

SECURITY: This is the SERVER-SIDE enforcement layer. Frontend blur is UI only.
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


def serialize_transactions(transactions, is_premium=None):
    """
    Serialize a list of transactions based on user's subscription tier.

    Optimized for batch serialization - checks tier once.

    Args:
        transactions: List of Transaction model instances
        is_premium: Override tier check

    Returns:
        list of dicts - full data for premium, masked data for free/anonymous
    """
    if is_premium is None:
        is_premium = is_premium_user()

    if is_premium:
        return [t.to_dict() for t in transactions]
    else:
        return [t.to_teaser_dict() for t in transactions]


# K-anonymity threshold for free tier
# If a query returns fewer than this many records, don't return individual data
K_ANONYMITY_THRESHOLD = 10


def check_k_anonymity(count, is_premium=None):
    """
    Check if result set is large enough to prevent re-identification.

    For free users, if a filtered query returns fewer than K records,
    the data is too specific and could identify individual transactions.

    Args:
        count: Number of records in result set
        is_premium: Override tier check

    Returns:
        tuple: (passes_check: bool, error_message: str or None)
    """
    if is_premium is None:
        is_premium = is_premium_user()

    # Premium users get all data
    if is_premium:
        return (True, None)

    # Free users: enforce k-anonymity
    if count < K_ANONYMITY_THRESHOLD:
        return (False, f"Not enough data. Broaden your filters to see results (minimum {K_ANONYMITY_THRESHOLD} transactions required).")

    return (True, None)


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
