"""
Contract enforcement package.

Provides schema validation, param normalization, and the @api_contract decorator.
"""

from .registry import (
    SchemaMode,
    FieldSpec,
    ResponseSchema,
    EndpointContract,
    CompatMap,
    register_contract,
    get_contract,
    CONTRACTS,
)
from .wrapper import api_contract
from .validate import ContractViolation

__all__ = [
    'SchemaMode',
    'FieldSpec',
    'ResponseSchema',
    'EndpointContract',
    'CompatMap',
    'register_contract',
    'get_contract',
    'CONTRACTS',
    'api_contract',
    'ContractViolation',
]
