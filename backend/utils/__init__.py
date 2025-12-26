"""
Utility modules for the backend.
"""
from .subscription import (
    get_user_from_request,
    is_premium_user,
    get_subscription_tier,
    require_premium,
    require_auth,
    serialize_transaction,
    serialize_transactions,
    check_k_anonymity,
    enforce_filter_granularity,
    K_ANONYMITY_THRESHOLD,
    K_THRESHOLDS,
    get_k_threshold,
    get_granularity_level,
    auto_widen_for_k_anonymity,
    build_k_anonymity_meta,
)
from .rate_limiter import (
    init_limiter,
    get_limiter,
    get_rate_limit_key,
    RATE_LIMITS,
)

__all__ = [
    'get_user_from_request',
    'is_premium_user',
    'get_subscription_tier',
    'require_premium',
    'require_auth',
    'serialize_transaction',
    'serialize_transactions',
    'check_k_anonymity',
    'enforce_filter_granularity',
    'K_ANONYMITY_THRESHOLD',
    'K_THRESHOLDS',
    'get_k_threshold',
    'get_granularity_level',
    'auto_widen_for_k_anonymity',
    'build_k_anonymity_meta',
    'init_limiter',
    'get_limiter',
    'get_rate_limit_key',
    'RATE_LIMITS',
]
