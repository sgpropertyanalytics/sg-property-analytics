"""
Contract Registry - Single source of truth for API contracts.

Each endpoint has:
- ParamSchema: What frontend sends (public params)
- ServiceBoundarySchema: What services receive (validated, typed)
- ResponseSchema: What endpoint returns (validated output)
- CompatMap: Legacy -> current field/param mappings
"""

import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable, Type
from enum import Enum
from datetime import date


class SchemaMode(Enum):
    """Contract enforcement mode."""
    WARN = "warn"      # Log violations, don't fail (production default)
    STRICT = "strict"  # Fail on violations (dev/staging)


def _get_default_mode() -> SchemaMode:
    """Get schema mode from environment."""
    mode = os.environ.get('CONTRACT_MODE', 'warn').lower()
    return SchemaMode.STRICT if mode == 'strict' else SchemaMode.WARN


def _is_production_env() -> bool:
    """Detect production environment for contract enforcement."""
    env = (
        os.environ.get("ENV")
        or os.environ.get("FLASK_ENV")
        or os.environ.get("APP_ENV")
        or ""
    ).lower()
    return env in {"prod", "production"}


DEFAULT_STRICT_ENDPOINTS = {
    "dashboard",
    "aggregate",
    "kpi-summary-v2",
    "charts/projects-by-district",
    "charts/price-projects-by-district",
    "charts/floor-liquidity-heatmap",
    "charts/psf-by-price-band",
    "charts/budget-heatmap",
}


def _get_strict_endpoints() -> List[str]:
    """Get endpoints that must be strict in production."""
    raw = os.environ.get("CONTRACT_STRICT_ENDPOINTS")
    if raw:
        return [e.strip() for e in raw.split(",") if e.strip()]
    return list(DEFAULT_STRICT_ENDPOINTS)


@dataclass
class FieldSpec:
    """Specification for a single field."""
    name: str
    type: Type                          # int, str, date, list, dict, etc.
    required: bool = False
    nullable: bool = True
    default: Any = None
    allowed_values: Optional[List] = None
    description: str = ""

    def __post_init__(self):
        # Convert string type names to actual types for JSON serialization compat
        if isinstance(self.type, str):
            type_map = {
                'int': int,
                'float': float,
                'str': str,
                'bool': bool,
                'list': list,
                'dict': dict,
                'date': date,
            }
            self.type = type_map.get(self.type, str)


@dataclass
class ParamSchema:
    """Schema for public API parameters (what frontend sends)."""
    fields: Dict[str, FieldSpec]

    # Normalization rules
    aliases: Dict[str, str] = field(default_factory=dict)  # e.g., {"saleType": "sale_type"}

    def get_field(self, name: str) -> Optional[FieldSpec]:
        """Get field spec, checking aliases."""
        if name in self.fields:
            return self.fields[name]
        # Check if name is an alias
        canonical = self.aliases.get(name)
        if canonical and canonical in self.fields:
            return self.fields[canonical]
        return None


@dataclass
class ServiceBoundarySchema:
    """Schema for what services receive (post-normalization)."""
    fields: Dict[str, FieldSpec]

    def get_required_fields(self) -> List[str]:
        """Get list of required field names."""
        return [name for name, spec in self.fields.items() if spec.required]


@dataclass
class ResponseSchema:
    """Schema for API response validation."""
    data_fields: Dict[str, FieldSpec]         # Fields in data[]
    meta_fields: Dict[str, FieldSpec]         # Fields in meta{}
    required_meta: List[str] = field(default_factory=list)

    # For non-list responses (single object in data)
    data_is_list: bool = True


@dataclass
class CompatMap:
    """Backwards compatibility mappings."""
    params: Dict[str, str] = field(default_factory=dict)   # old_param -> new_param
    response: Dict[str, str] = field(default_factory=dict) # old_field -> new_field

    def get_canonical_param(self, name: str) -> str:
        """Get canonical param name from legacy name."""
        return self.params.get(name, name)

    def get_canonical_response_field(self, name: str) -> str:
        """Get canonical response field from legacy name."""
        return self.response.get(name, name)


@dataclass
class EndpointContract:
    """Complete contract for an endpoint."""
    endpoint: str                         # e.g., "aggregate"
    version: str                          # e.g., "v3"
    param_schema: ParamSchema
    service_schema: ServiceBoundarySchema
    response_schema: ResponseSchema
    compat_map: Optional[CompatMap] = None
    serializer: Optional[Callable] = None
    mode: SchemaMode = field(default_factory=_get_default_mode)

    def __post_init__(self):
        # Ensure compat_map exists
        if self.compat_map is None:
            self.compat_map = CompatMap()


# Global registry instance
CONTRACTS: Dict[str, EndpointContract] = {}


def register_contract(contract: EndpointContract) -> None:
    """
    Register an endpoint contract.

    Args:
        contract: The EndpointContract to register

    Raises:
        ValueError: If contract with same endpoint already registered
    """
    if contract.endpoint in CONTRACTS:
        # Allow re-registration (for testing/hot-reload)
        pass
    if _is_production_env() and contract.endpoint in _get_strict_endpoints():
        contract.mode = SchemaMode.STRICT
    CONTRACTS[contract.endpoint] = contract


def get_contract(endpoint: str) -> Optional[EndpointContract]:
    """
    Get contract for an endpoint.

    Args:
        endpoint: The endpoint name (e.g., "aggregate")

    Returns:
        EndpointContract if found, None otherwise
    """
    return CONTRACTS.get(endpoint)


def list_contracts() -> List[str]:
    """Get list of registered endpoint names."""
    return list(CONTRACTS.keys())


def get_contract_version(endpoint: str) -> Optional[str]:
    """Get version string for an endpoint's contract."""
    contract = get_contract(endpoint)
    return contract.version if contract else None


def set_contract_mode(endpoint: str, mode: SchemaMode) -> None:
    """
    Set enforcement mode for a specific endpoint.

    Useful for gradual rollout (e.g., enable STRICT for one endpoint at a time).
    """
    contract = get_contract(endpoint)
    if contract:
        contract.mode = mode


def set_global_mode(mode: SchemaMode) -> None:
    """Set enforcement mode for all registered contracts."""
    for contract in CONTRACTS.values():
        contract.mode = mode
