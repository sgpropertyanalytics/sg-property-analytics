"""
Contract registry strict-mode tests.
"""

from api.contracts.registry import (
    register_contract,
    EndpointContract,
    ResponseSchema,
    SchemaMode,
    CONTRACTS,
)


def test_register_contract_forces_strict_in_production(monkeypatch):
    """Dashboard-critical endpoints should be strict in production."""
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("CONTRACT_STRICT_ENDPOINTS", "dashboard")

    contract = EndpointContract(
        endpoint="dashboard",
        version="v3",
        response_schema=ResponseSchema(data_fields={}, meta_fields={}, data_is_list=False),
        mode=SchemaMode.WARN,
    )

    previous = CONTRACTS.get("dashboard")
    try:
        register_contract(contract)
        assert CONTRACTS["dashboard"].mode == SchemaMode.STRICT
    finally:
        if previous is not None:
            CONTRACTS["dashboard"] = previous
