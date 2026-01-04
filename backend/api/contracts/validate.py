"""
Schema validation for API responses.

Provides response validation that checks:
- Required fields
- Type correctness
- Nullability constraints
- Undeclared fields (bidirectional validation)

Bidirectional validation catches schema drift where serializers return
fields that aren't declared in schemas.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from datetime import date

from .registry import ResponseSchema, FieldSpec


@dataclass
class ContractViolation(Exception):
    """Raised when contract is violated."""
    message: str
    details: Dict[str, Any]

    def __str__(self):
        return self.message

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dict for JSON serialization."""
        return {
            "message": self.message,
            "details": self.details,
        }


def validate_response(response: Dict[str, Any], schema: ResponseSchema) -> None:
    """
    Validate response against ResponseSchema.

    Detects:
    - Missing required fields
    - Wrong types
    - Unexpected nulls

    Args:
        response: Response dict to validate
        schema: ResponseSchema to validate against

    Raises:
        ContractViolation: If validation fails
    """
    violations = []

    # Validate data fields
    data = response.get('data', [])

    if schema.data_is_list:
        # Validate list of items
        if isinstance(data, list) and data:
            sample = data[0]  # Check first item as representative
            violations.extend(_validate_data_item(sample, schema.data_fields, "data[]"))
    else:
        # Validate single object
        if isinstance(data, dict):
            violations.extend(_validate_data_item(data, schema.data_fields, "data"))

    # Validate meta fields
    meta = response.get('meta', {})
    for field_name in schema.required_meta:
        if field_name not in meta:
            violations.append({
                "path": f"meta.{field_name}",
                "error": "missing_required_meta",
                "message": f"Required meta field '{field_name}' missing"
            })

    # Type-check meta fields
    for field_name, spec in schema.meta_fields.items():
        if field_name in meta:
            value = meta[field_name]
            if not spec.nullable and value is None:
                violations.append({
                    "path": f"meta.{field_name}",
                    "error": "unexpected_null",
                    "message": f"Meta field '{field_name}' cannot be null"
                })
            elif value is not None and not _check_type(value, spec.type):
                violations.append({
                    "path": f"meta.{field_name}",
                    "error": "type_mismatch",
                    "expected": spec.type.__name__,
                    "received": type(value).__name__
                })

    # Bidirectional: Check for undeclared meta fields
    declared_meta = set(schema.meta_fields.keys())
    for field_name in meta.keys():
        if field_name not in declared_meta:
            violations.append({
                "path": f"meta.{field_name}",
                "error": "undeclared_meta_field",
                "message": f"Meta field '{field_name}' not declared in schema"
            })

    if violations:
        raise ContractViolation(
            message=f"{len(violations)} response schema violation(s)",
            details={"violations": violations}
        )


def _validate_data_item(
    item: Dict[str, Any],
    field_specs: Dict[str, FieldSpec],
    path_prefix: str
) -> List[Dict[str, Any]]:
    """
    Validate a single data item against field specs.

    Performs BIDIRECTIONAL validation:
    1. Schema -> Response: All required schema fields must be in response
    2. Response -> Schema: All response fields must be declared in schema
    """
    violations = []

    # Direction 1: Schema -> Response (missing/invalid fields)
    for field_name, spec in field_specs.items():
        if field_name not in item:
            if spec.required:
                violations.append({
                    "path": f"{path_prefix}.{field_name}",
                    "error": "missing_field",
                    "message": f"Required field '{field_name}' missing from response"
                })
        else:
            value = item[field_name]
            if not spec.nullable and value is None:
                violations.append({
                    "path": f"{path_prefix}.{field_name}",
                    "error": "unexpected_null",
                    "message": f"Field '{field_name}' cannot be null"
                })
            elif value is not None and not _check_type(value, spec.type):
                violations.append({
                    "path": f"{path_prefix}.{field_name}",
                    "error": "type_mismatch",
                    "expected": spec.type.__name__,
                    "received": type(value).__name__
                })

    # Direction 2: Response -> Schema (undeclared fields)
    declared_fields = set(field_specs.keys())
    for field_name in item.keys():
        if field_name not in declared_fields:
            violations.append({
                "path": f"{path_prefix}.{field_name}",
                "error": "undeclared_field",
                "message": f"Field '{field_name}' not declared in schema (serializer-schema drift)"
            })

    return violations


def _check_type(value: Any, expected_type: type) -> bool:
    """
    Check if value matches expected type.

    Handles special cases:
    - int/float interchangeability for numeric fields
    - date/str for date fields (ISO format)
    """
    if isinstance(value, expected_type):
        return True

    # Allow numeric type flexibility
    if expected_type in (int, float) and isinstance(value, (int, float)):
        return True

    # Allow string dates
    if expected_type == date and isinstance(value, str):
        return True

    return False
