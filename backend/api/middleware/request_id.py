"""
Request ID middleware - Inject X-Request-ID for request correlation.

Provides:
- Request ID injection on every request
- Response header addition
- Correlation ID for logging and debugging
"""

import uuid
from flask import Flask, request, g


def setup_request_id_middleware(app: Flask) -> None:
    """
    Set up request ID middleware on Flask app.

    Injects X-Request-ID into:
    - Flask's g object (g.request_id)
    - Response headers (X-Request-ID)

    Args:
        app: Flask application instance
    """

    @app.before_request
    def inject_request_id():
        """Inject request ID before each request."""
        # Use existing header if provided, otherwise generate new
        request_id = request.headers.get('X-Request-ID')
        if not request_id:
            request_id = str(uuid.uuid4())
        g.request_id = request_id

    @app.after_request
    def add_request_id_header(response):
        """Add request ID to response headers."""
        if hasattr(g, 'request_id'):
            response.headers['X-Request-ID'] = g.request_id
        return response


def get_request_id() -> str:
    """
    Get current request ID from Flask context.

    Returns:
        Request ID string, or generated UUID if not in request context
    """
    if hasattr(g, 'request_id'):
        return g.request_id
    return str(uuid.uuid4())
