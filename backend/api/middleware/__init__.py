"""
Global middleware for API requests.

Provides:
- Request ID injection (X-Request-ID)
- Error envelope standardization
"""

from .request_id import setup_request_id_middleware
from .error_envelope import setup_error_handlers

__all__ = ['setup_request_id_middleware', 'setup_error_handlers']
