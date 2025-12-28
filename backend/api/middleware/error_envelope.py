"""
Error envelope middleware - Standardize all error responses.

Provides consistent error response format:
{
    "error": {
        "code": "NOT_FOUND",
        "message": "The requested resource was not found",
        "requestId": "uuid"
    }
}
"""

import logging
from flask import Flask, jsonify, g
from werkzeug.exceptions import HTTPException


logger = logging.getLogger('api.middleware.error')


def setup_error_handlers(app: Flask) -> None:
    """
    Set up standardized error handlers on Flask app.

    Handles:
    - HTTP exceptions (400, 404, 500, etc.)
    - Unhandled Python exceptions

    Args:
        app: Flask application instance
    """

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        """Handle Flask/Werkzeug HTTP exceptions."""
        request_id = getattr(g, 'request_id', None)

        # Convert error name to error code
        # "Not Found" -> "NOT_FOUND"
        code = error.name.upper().replace(' ', '_')

        response = jsonify({
            "error": {
                "code": code,
                "message": error.description,
                "requestId": request_id,
            }
        })

        if request_id:
            response.headers['X-Request-ID'] = request_id

        return response, error.code

    @app.errorhandler(Exception)
    def handle_generic_error(error):
        """Handle unhandled Python exceptions."""
        request_id = getattr(g, 'request_id', None)

        # Log the full exception
        logger.exception(
            f"Unhandled error: {error}",
            extra={
                "event": "unhandled_error",
                "request_id": request_id,
                "error_type": type(error).__name__,
            }
        )

        response = jsonify({
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "An unexpected error occurred",
                "requestId": request_id,
            }
        })

        if request_id:
            response.headers['X-Request-ID'] = request_id

        return response, 500


# Error codes reference
ERROR_CODES = {
    # Client errors (4xx)
    "BAD_REQUEST": 400,
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "METHOD_NOT_ALLOWED": 405,
    "CONFLICT": 409,
    "UNPROCESSABLE_ENTITY": 422,
    "TOO_MANY_REQUESTS": 429,

    # Contract errors
    "INVALID_PARAMS": 400,
    "CONTRACT_VIOLATION": 400,
    "RESPONSE_SCHEMA_MISMATCH": 500,

    # Business logic errors
    "PREMIUM_REQUIRED": 403,
    "SUBSCRIPTION_EXPIRED": 403,

    # Server errors (5xx)
    "INTERNAL_ERROR": 500,
    "SERVICE_UNAVAILABLE": 503,
}


def make_error_response(
    code: str,
    message: str,
    status_code: int = None,
    field: str = None,
    details: dict = None,
    hint: str = None,
):
    """
    Create a standardized error response.

    Args:
        code: Error code (e.g., "INVALID_PARAMS")
        message: Human-readable error message
        status_code: HTTP status code (defaults based on error code)
        field: Optional field name that caused the error
        details: Optional additional details dict
        hint: Optional hint for fixing the error

    Returns:
        Tuple of (response, status_code)
    """
    request_id = getattr(g, 'request_id', None)

    # Default status code based on error code
    if status_code is None:
        status_code = ERROR_CODES.get(code, 500)

    error = {
        "error": {
            "code": code,
            "message": message,
            "requestId": request_id,
        }
    }

    if field:
        error["error"]["field"] = field
    if details:
        error["error"]["details"] = details
    if hint:
        error["error"]["hint"] = hint

    response = jsonify(error)
    if request_id:
        response.headers['X-Request-ID'] = request_id

    return response, status_code
