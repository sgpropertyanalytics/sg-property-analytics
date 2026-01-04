"""
Contract enforcement package.

Provides schema validation, param normalization, and the @api_contract decorator.
"""

from .registry import (
    SchemaMode,
    FieldSpec,
    ResponseSchema,
    EndpointContract,
    register_contract,
    get_contract,
    CONTRACTS,
    # Legacy exports (kept for test compatibility)
    ParamSchema,
    ServiceBoundarySchema,
    CompatMap,
)
from .wrapper import api_contract
from .validate import ContractViolation

__all__ = [
    'SchemaMode',
    'FieldSpec',
    'ResponseSchema',
    'EndpointContract',
    'register_contract',
    'get_contract',
    'CONTRACTS',
    'api_contract',
    'ContractViolation',
    # Legacy exports (kept for test compatibility)
    'ParamSchema',
    'ServiceBoundarySchema',
    'CompatMap',
]
