#!/usr/bin/env python3
"""
Generate frontend contract artifacts from backend/api/contracts.

Outputs:
- frontend/src/generated/apiContract.json
- frontend/src/generated/apiContract.ts

Usage:
    python backend/scripts/generate_contracts.py   # From repo root
    python scripts/generate_contracts.py           # From backend/
"""

import json
import sys
import hashlib
from datetime import date, datetime, timezone
from pathlib import Path

# Ensure backend/ is in Python path (for imports like `from api.contracts...`)
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))


def _backend_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _repo_root() -> Path:
    return _backend_root().parent


def _normalize_type(type_value) -> str:
    if isinstance(type_value, type):
        return type_value.__name__
    return str(type_value)


def _normalize_value(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, list):
        return [_normalize_value(v) for v in value]
    if isinstance(value, dict):
        return {k: _normalize_value(v) for k, v in value.items()}
    return value


def _serialize_field(field_spec):
    return {
        "name": field_spec.name,
        "type": _normalize_type(field_spec.type),
        "required": bool(field_spec.required),
        "nullable": bool(field_spec.nullable),
        "default": _normalize_value(field_spec.default),
        "allowed_values": _normalize_value(field_spec.allowed_values),
        "description": field_spec.description,
    }


def _serialize_contract(contract):
    # Use Pydantic model_json_schema() when available (preferred)
    if contract.pydantic_model:
        try:
            pydantic_schema = contract.pydantic_model.model_json_schema()
            param_schema_data = {
                "json_schema": pydantic_schema,
                "model_name": contract.pydantic_model.__name__,
            }
        except Exception as e:
            model_name = contract.pydantic_model.__name__
            endpoint = contract.endpoint
            raise RuntimeError(
                f"Failed to generate JSON schema for contract '{endpoint}' "
                f"(model: {model_name}): {type(e).__name__}: {e}"
            ) from e
    else:
        # No param validation for this contract
        param_schema_data = {"fields": {}, "aliases": {}}

    # Service schema removed in Pydantic migration - always empty
    service_fields = {}

    response_data_fields = {
        name: _serialize_field(spec)
        for name, spec in contract.response_schema.data_fields.items()
    }
    response_meta_fields = {
        name: _serialize_field(spec)
        for name, spec in contract.response_schema.meta_fields.items()
    }

    return {
        "endpoint": contract.endpoint,
        "version": contract.version,
        "mode": contract.mode.value,
        "param_schema": param_schema_data,
        "service_schema": {
            "fields": service_fields,
        },
        "response_schema": {
            "data_fields": response_data_fields,
            "meta_fields": response_meta_fields,
            "required_meta": contract.response_schema.required_meta,
            "data_is_list": contract.response_schema.data_is_list,
        },
        "compat_map": {
            "params": contract.compat_map.params if contract.compat_map else {},
            "response": contract.compat_map.response if contract.compat_map else {},
        },
    }


def main() -> int:
    backend_root = _backend_root()
    repo_root = _repo_root()

    # Register contracts
    from api.contracts.registry import list_contracts
    from api.contracts import get_contract
    from api.contracts import schemas  # noqa: F401

    contracts = {}
    for endpoint in sorted(list_contracts()):
        contract = get_contract(endpoint)
        if contract is None:
            continue
        contracts[endpoint] = _serialize_contract(contract)

    # Note: No generated_at field - keeps hash deterministic for CI
    payload = {
        "source": "backend/api/contracts",
        "contracts": contracts,
    }

    output_dir = repo_root / "frontend" / "src" / "generated"
    output_dir.mkdir(parents=True, exist_ok=True)

    json_blob = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    json_path = output_dir / "apiContract.json"
    json_path.write_text(json_blob)

    ts_path = output_dir / "apiContract.ts"
    ts_path.write_text(
        "\n".join(
            [
                "import apiContractJson from './apiContract.json';",
                "",
                "export const apiContract = apiContractJson;",
                "",
                "export function getContract(endpoint) {",
                "  return apiContract.contracts?.[endpoint] || null;",
                "}",
                "",
                "export default apiContract;",
                "",
            ]
        )
    )

    hash_path = repo_root / "backend" / "contracts_manifest.sha256"
    digest = hashlib.sha256(json_blob.encode("utf-8")).hexdigest()
    hash_path.write_text(f"{digest}\n")

    print(f"Wrote {json_path}")
    print(f"Wrote {ts_path}")
    print(f"Wrote {hash_path}")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
