"""
@api_contract decorator - applies contract enforcement to route handlers.

Usage:
    @analytics_bp.route("/aggregate", methods=["GET"])
    @api_contract("aggregate")
    def aggregate():
        # Handler can access g.normalized_params for validated params
        ...

The decorator:
1. Validates public params against ParamSchema
2. Normalizes params (singulars->plurals, date bounds, etc.)
3. Validates normalized params against ServiceBoundarySchema
4. After handler, validates response against ResponseSchema
5. Injects meta fields (requestId, elapsedMs, etc.)
6. Applies compatibility adapters
"""

import functools
import logging
import time
import uuid
from typing import Callable, Any, Dict, Optional, Tuple, Union

from flask import request, jsonify, g, Response

from .registry import get_contract, SchemaMode, EndpointContract
from .normalize import normalize_params
from .validate import (
    validate_public_params,
    validate_service_params,
    validate_response,
    ContractViolation,
)

# Import ValidationError from utils.normalize if available
try:
    from utils.normalize import ValidationError
except ImportError:
    class ValidationError(ValueError):
        def __init__(self, message: str, field: str = None, received_value=None):
            super().__init__(message)
            self.field = field
            self.received_value = received_value


logger = logging.getLogger('api.contracts')


def api_contract(endpoint_name: str):
    """
    Decorator that enforces API contracts on route handlers.

    Args:
        endpoint_name: The contract name (e.g., "aggregate")

    Returns:
        Decorated function with contract enforcement

    Usage:
        @app.route("/api/aggregate")
        @api_contract("aggregate")
        def aggregate():
            params = g.normalized_params  # Access validated params
            ...
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs) -> Union[Response, Tuple[Response, int]]:
            start_time = time.perf_counter()

            # Get or generate request ID
            request_id = request.headers.get('X-Request-ID')
            if not request_id:
                request_id = str(uuid.uuid4())
            g.request_id = request_id

            # Get contract
            contract = get_contract(endpoint_name)
            if not contract:
                # No contract registered - pass through without enforcement
                logger.debug(f"No contract for endpoint '{endpoint_name}', passing through")
                return fn(*args, **kwargs)

            try:
                # 1. Collect raw params
                raw_params = _collect_raw_params()

                # 2. Validate public params
                validate_public_params(raw_params, contract.param_schema)

                # 3. Normalize params
                normalized = normalize_params(raw_params, contract.param_schema)

                # 4. Inject into request context BEFORE service validation
                # This ensures params are available even if service validation fails in WARN mode
                g.normalized_params = normalized
                g.contract = contract
                g.filters_applied = _extract_filters_applied(normalized)

                # 5. Validate service params (may raise ContractViolation)
                validate_service_params(normalized, contract.service_schema)

            except ValidationError as e:
                return _make_error_response(
                    code="INVALID_PARAMS",
                    message=str(e),
                    field=getattr(e, 'field', None),
                    request_id=request_id,
                    status_code=400,
                )

            except ContractViolation as e:
                if contract.mode == SchemaMode.STRICT:
                    return _make_error_response(
                        code="CONTRACT_VIOLATION",
                        message=str(e),
                        details=e.details,
                        request_id=request_id,
                        status_code=400,
                    )
                else:
                    # Warn mode - log violation and continue
                    # g.normalized_params already set in step 4
                    _log_violation(endpoint_name, e, request_id, stage="params")

            # 6. Call the handler
            try:
                result = fn(*args, **kwargs)
            except Exception as e:
                logger.exception(f"Handler error for {endpoint_name}")
                return _make_error_response(
                    code="INTERNAL_ERROR",
                    message="An unexpected error occurred",
                    request_id=request_id,
                    status_code=500,
                )

            # 7. Process response
            elapsed_ms = (time.perf_counter() - start_time) * 1000

            # Handle tuple responses (response, status_code)
            if isinstance(result, tuple):
                if len(result) >= 2:
                    response_data, status_code = result[0], result[1]
                else:
                    response_data, status_code = result[0], 200
            elif isinstance(result, Response):
                # Extract JSON from Response so we can inject meta fields
                response_data = result
                status_code = result.status_code or 200
            else:
                response_data = result
                status_code = 200

            # 8. Get data as dict if it's a Response
            if isinstance(response_data, Response):
                try:
                    response_data = response_data.get_json()
                except Exception:
                    # Can't parse JSON, just add headers and return as-is
                    response_data.headers['X-Request-ID'] = request_id
                    response_data.headers['X-API-Contract-Version'] = contract.version
                    return response_data, status_code

            # 9. Validate response schema (only for successful responses)
            if status_code == 200 and isinstance(response_data, dict):
                try:
                    validate_response(response_data, contract.response_schema)
                except ContractViolation as e:
                    if contract.mode == SchemaMode.STRICT:
                        return _make_error_response(
                            code="RESPONSE_SCHEMA_MISMATCH",
                            message="Response does not match contract",
                            details=e.details,
                            request_id=request_id,
                            status_code=500,
                        )
                    else:
                        _log_violation(endpoint_name, e, request_id, stage="response")

            # 10. Inject meta fields
            if isinstance(response_data, dict):
                if 'meta' not in response_data:
                    response_data['meta'] = {}
                response_data['meta'].update({
                    'requestId': request_id,
                    'elapsedMs': round(elapsed_ms, 2),
                    'apiVersion': contract.version,
                })

            # 11. Apply serializer if defined
            if contract.serializer and isinstance(response_data, dict):
                try:
                    response_data = contract.serializer(response_data)
                except Exception as e:
                    logger.warning(f"Serializer failed: {e}")

            # 12. Build response
            response = jsonify(response_data)
            response.headers['X-Request-ID'] = request_id
            response.headers['X-API-Contract-Version'] = contract.version
            return response, status_code

        return wrapper
    return decorator


def _collect_raw_params() -> Dict[str, Any]:
    """Collect all params from request (query string + JSON body)."""
    params = dict(request.args)

    # Merge JSON body for POST requests
    if request.method in ('POST', 'PUT', 'PATCH') and request.is_json:
        body = request.get_json(silent=True) or {}
        params.update(body)

    return params


def _extract_filters_applied(params: Dict[str, Any]) -> Dict[str, Any]:
    """Extract filter-related params for meta.filtersApplied."""
    filter_keys = [
        'districts', 'bedrooms', 'segments', 'tenures',
        'date_from', 'date_to_exclusive', 'date_to',
        'sale_type', 'psf_min', 'psf_max', 'price_min', 'price_max',
        'project', 'floor_level',
    ]
    return {k: v for k, v in params.items() if k in filter_keys and v is not None}


def _make_error_response(
    code: str,
    message: str,
    field: Optional[str] = None,
    details: Optional[Dict] = None,
    request_id: Optional[str] = None,
    status_code: int = 400,
) -> Tuple[Response, int]:
    """Build standardized error response."""
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

    response = jsonify(error)
    if request_id:
        response.headers['X-Request-ID'] = request_id
    return response, status_code


def _log_violation(
    endpoint: str,
    violation: ContractViolation,
    request_id: str,
    stage: str = "params"
) -> None:
    """Log contract violation for observability."""
    logger.warning(
        f"Contract violation: endpoint={endpoint} stage={stage} "
        f"request_id={request_id} message={violation.message}",
        extra={
            "event": "contract_violation",
            "endpoint": endpoint,
            "stage": stage,
            "request_id": request_id,
            "details": violation.details,
        }
    )
