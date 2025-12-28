"""
API package - Middle-stack contract enforcement layer.

This package provides:
- Contract registry for API schema definitions
- Param normalization adapters
- Schema validation logic
- @api_contract decorator for route enforcement
- Global middleware (request_id, error_envelope)
"""

from .contracts import api_contract, get_contract, SchemaMode

__all__ = ['api_contract', 'get_contract', 'SchemaMode']
