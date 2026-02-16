"""
Utility modules for the backend.
"""
from .subscription import (
    get_user_from_request,
    has_authenticated_access,
    get_access_level,
    require_authenticated_access,
    check_k_anonymity,
    enforce_filter_granularity,
    K_ANONYMITY_THRESHOLD,
    K_THRESHOLDS,
    get_k_threshold,
    get_granularity_level,
    auto_widen_for_k_anonymity,
    build_k_anonymity_meta,
    build_suppressed_row,
    suppress_if_needed,
)
from .rate_limiter import (
    init_limiter,
    get_limiter,
    get_rate_limit_key,
    RATE_LIMITS,
)
from .normalize import (
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

__all__ = [
    'get_user_from_request',
    'has_authenticated_access',
    'get_access_level',
    'require_authenticated_access',
    'check_k_anonymity',
    'enforce_filter_granularity',
    'K_ANONYMITY_THRESHOLD',
    'K_THRESHOLDS',
    'get_k_threshold',
    'get_granularity_level',
    'auto_widen_for_k_anonymity',
    'build_k_anonymity_meta',
    'build_suppressed_row',
    'suppress_if_needed',
    'init_limiter',
    'get_limiter',
    'get_rate_limit_key',
    'RATE_LIMITS',
    # Input normalization
    'ValidationError',
    'to_int',
    'to_float',
    'to_bool',
    'to_date',
    'to_datetime',
    'to_str',
    'to_list',
    'to_enum',
    'validation_error_response',
]
