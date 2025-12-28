"""
Response envelope helpers.

Provides standardized success and error response builders.
"""

from typing import Any, Dict, List, Optional
from flask import g


def success_envelope(
    data: Any,
    meta: Optional[Dict[str, Any]] = None,
    warnings: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Build a standardized success response envelope.

    Args:
        data: Response data (list or dict)
        meta: Optional metadata dict
        warnings: Optional list of warning messages

    Returns:
        Response dict with standard structure:
        {
            "data": ...,
            "meta": {...},
            "warnings": [...]  # if any
        }
    """
    response = {"data": data}

    # Build meta
    if meta is None:
        meta = {}

    # Always include request ID if available
    if hasattr(g, 'request_id'):
        meta['requestId'] = g.request_id

    response['meta'] = meta

    # Include warnings if any
    if warnings:
        response['warnings'] = warnings

    return response


def error_envelope(
    code: str,
    message: str,
    field: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    hint: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a standardized error response envelope.

    Args:
        code: Error code (e.g., "INVALID_PARAMS")
        message: Human-readable error message
        field: Optional field that caused the error
        details: Optional additional details
        hint: Optional hint for fixing the error

    Returns:
        Error response dict:
        {
            "error": {
                "code": "...",
                "message": "...",
                "requestId": "...",
                ...
            }
        }
    """
    error = {
        "code": code,
        "message": message,
    }

    # Add request ID if available
    if hasattr(g, 'request_id'):
        error['requestId'] = g.request_id

    # Optional fields
    if field:
        error['field'] = field
    if details:
        error['details'] = details
    if hint:
        error['hint'] = hint

    return {"error": error}


def paginated_envelope(
    data: List[Any],
    page: int,
    limit: int,
    total: int,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build a paginated response envelope.

    Args:
        data: Page of data items
        page: Current page number (1-indexed)
        limit: Items per page
        total: Total items across all pages
        meta: Optional additional metadata

    Returns:
        Response dict with pagination info:
        {
            "data": [...],
            "meta": {
                "pagination": {
                    "page": 1,
                    "limit": 20,
                    "total": 100,
                    "totalPages": 5,
                    "hasMore": true
                },
                ...
            }
        }
    """
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    has_more = page < total_pages

    pagination = {
        "page": page,
        "limit": limit,
        "total": total,
        "totalPages": total_pages,
        "hasMore": has_more,
    }

    response_meta = meta.copy() if meta else {}
    response_meta['pagination'] = pagination

    return success_envelope(data, meta=response_meta)
