"""
Pytest fixtures for contract tests.
"""

import pytest
from pathlib import Path


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


@pytest.fixture
def snapshot_dir():
    """Return path to snapshots directory."""
    return SNAPSHOT_DIR


@pytest.fixture
def app():
    """Create test Flask application."""
    from app import create_app

    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def contract_registry():
    """Get the contract registry after loading schemas."""
    # Import to trigger registration
    from api.contracts.schemas import aggregate, kpi_summary, dashboard
    from api.contracts import CONTRACTS
    return CONTRACTS


def extract_schema(data: dict) -> dict:
    """
    Extract schema shape from response (keys + types only).

    Useful for comparing response structures without values.
    """
    if isinstance(data, dict):
        return {k: extract_schema(v) for k, v in data.items()}
    elif isinstance(data, list) and data:
        return [extract_schema(data[0])]
    elif isinstance(data, list):
        return []
    else:
        return type(data).__name__


def diff_schemas(current: dict, snapshot: dict, path: str = "") -> list:
    """
    Find schema differences (removals/type changes).

    Returns list of diffs. Empty list = no differences.
    """
    diffs = []

    if isinstance(snapshot, dict) and isinstance(current, dict):
        # Check for removed keys
        for key in snapshot:
            full_path = f"{path}.{key}" if path else key
            if key not in current:
                diffs.append({
                    "path": full_path,
                    "error": "field_removed",
                    "was": snapshot[key]
                })
            else:
                # Recurse
                diffs.extend(diff_schemas(current[key], snapshot[key], full_path))
    elif isinstance(snapshot, list) and isinstance(current, list):
        if snapshot and current:
            diffs.extend(diff_schemas(current[0], snapshot[0], f"{path}[]"))
    else:
        # Type comparison
        if type(snapshot).__name__ != type(current).__name__:
            # Allow some type flexibility
            numeric_types = {'int', 'float'}
            snap_type = type(snapshot).__name__
            curr_type = type(current).__name__
            if not (snap_type in numeric_types and curr_type in numeric_types):
                diffs.append({
                    "path": path,
                    "error": "type_changed",
                    "was": snap_type,
                    "now": curr_type
                })

    return diffs
