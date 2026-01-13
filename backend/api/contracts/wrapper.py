"""
@api_contract decorator - applies contract enforcement to route handlers.

Usage:
    @analytics_bp.route("/aggregate", methods=["GET"])
    @api_contract("aggregate")
    def aggregate():
        # Handler can access g.normalized_params for validated params
        ...

The decorator:
1. Validates and normalizes params via Pydantic model
2. Injects normalized params into g.normalized_params
3. Calls the handler
4. Validates response against ResponseSchema
5. Injects meta fields (requestId, elapsedMs, apiVersion, etc.)
6. Applies serializer if defined
"""

import functools
import logging
import os
import time
import uuid
from typing import Callable, Any, Dict, Optional, Tuple, Union, Set

from flask import request, jsonify, g, Response
from pydantic import ValidationError as PydanticValidationError

from .registry import get_contract, SchemaMode, EndpointContract
from .validate import validate_response, ContractViolation
from .contract_schema import API_CONTRACT_VERSION, get_schema_hash
from utils.normalize import ValidationError


logger = logging.getLogger('api.contracts')

# Dev mode detection for unknown param warnings
_IS_DEV = os.environ.get('FLASK_DEBUG', '').lower() == 'true' or \
          os.environ.get('FLASK_ENV', '').lower() == 'development'


def _get_known_param_names(pydantic_model) -> Set[str]:
    """Get all known parameter names from a Pydantic model, including aliases."""
    known = set()
    for field_name, field_info in pydantic_model.model_fields.items():
        known.add(field_name)
        # Add alias if defined
        if field_info.alias:
            known.add(field_info.alias)
        # Add validation_alias if defined (for input parsing)
        if field_info.validation_alias:
            if isinstance(field_info.validation_alias, str):
                known.add(field_info.validation_alias)
    return known


def _warn_unknown_params(endpoint_name: str, raw_params: Dict, pydantic_model) -> None:
    """Log warning for unknown parameters in dev mode."""
    if not _IS_DEV:
        return

    known_names = _get_known_param_names(pydantic_model)
    unknown = set(raw_params.keys()) - known_names

    if unknown:
        logger.warning(
            f"[{endpoint_name}] Unknown params ignored: {sorted(unknown)}. "
            f"Known params: {sorted(known_names)}"
        )


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

                # 2. Validate and normalize params via Pydantic
                # All endpoints now have pydantic_model (migration complete Jan 2026)
                if not contract.pydantic_model:
                    raise ValueError(f"No pydantic_model for endpoint '{endpoint_name}' - all endpoints must have Pydantic models")

                # Warn about unknown params in dev mode (helps catch typos)
                _warn_unknown_params(endpoint_name, raw_params, contract.pydantic_model)

                try:
                    normalized = contract.pydantic_model(**raw_params).model_dump()
                except PydanticValidationError as e:
                    logger.exception(f"Pydantic validation failed for {endpoint_name}: {e}")
                    raise ValidationError(
                        message=f"Parameter validation failed: {e}",
                        field=None,
                        received_value=raw_params
                    ) from e

                # 3. Inject into request context
                g.normalized_params = normalized
                g.contract = contract
                g.filters_applied = _extract_filters_applied(normalized)

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

            # Capture Set-Cookie headers from original Response (if any) before rebuilding
            # This preserves auth cookies set by handlers like /auth/login
            original_set_cookies = []

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
                # Capture Set-Cookie headers before extracting JSON
                original_set_cookies = response_data.headers.getlist('Set-Cookie')
                try:
                    response_data = response_data.get_json()
                except Exception:
                    # Can't parse JSON, just add headers and return as-is
                    response_data.headers['X-Request-ID'] = request_id
                    response_data.headers['X-API-Contract-Version'] = contract.version
                    return response_data, status_code

            # 9. Normalize response envelope and inject meta before validation
            if isinstance(response_data, dict):
                if status_code == 200 and 'data' not in response_data:
                    response_data = {"data": response_data, "meta": {}}

                if 'meta' not in response_data:
                    response_data['meta'] = {}

                # Inject ALL meta fields from decorator (single source of truth)
                # This ensures serializers don't need to inject these fields
                response_data['meta'].update({
                    'requestId': request_id,
                    'elapsedMs': round(elapsed_ms, 2),
                    'apiVersion': contract.version,
                    # Contract versioning for frontend validation
                    'apiContractVersion': API_CONTRACT_VERSION,
                    'contractHash': get_schema_hash(endpoint_name),
                })

            # 10. Validate response schema (only for successful responses)
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

            # Restore Set-Cookie headers that were on the original Response
            for cookie in original_set_cookies:
                response.headers.add('Set-Cookie', cookie)

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

    # Merge path params (e.g., /projects/<project_name>)
    if request.view_args:
        params.update(request.view_args)

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
    # Format violation details for readable logging
    details_str = ""
    if violation.details and "violations" in violation.details:
        violations_list = violation.details["violations"]
        if violations_list:
            formatted = []
            for v in violations_list[:5]:  # Limit to first 5 for log readability
                path = v.get("path", "unknown")
                error = v.get("error", "unknown")
                msg = v.get("message", "")
                formatted.append(f"{path}: {error} ({msg})")
            details_str = " | violations=[" + ", ".join(formatted) + "]"
            if len(violations_list) > 5:
                details_str += f" (+{len(violations_list) - 5} more)"

    logger.warning(
        f"Contract violation: endpoint={endpoint} stage={stage} "
        f"request_id={request_id} message={violation.message}{details_str}",
        extra={
            "event": "contract_violation",
            "endpoint": endpoint,
            "stage": stage,
            "request_id": request_id,
            "details": violation.details,
        }
    )
