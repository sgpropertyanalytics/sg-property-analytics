"""
Contract tests for project endpoints.
"""

import pytest
import json
from pathlib import Path

from api.contracts.schemas import projects
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestProjectSchoolFlagContract:
    """Test projects/school-flag contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/school-flag")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required (project_name from URL)."""
        contract = get_contract("projects/school-flag")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestProjectsWithSchoolContract:
    """Test projects/with-school contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/with-school")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_segment(self):
        """Segment should have allowed values."""
        contract = get_contract("projects/with-school")
        segment_field = contract.param_schema.fields["segment"]
        assert "CCR" in segment_field.allowed_values
        assert "RCR" in segment_field.allowed_values
        assert "OCR" in segment_field.allowed_values

    def test_validate_invalid_segment(self):
        """Invalid segment should fail."""
        contract = get_contract("projects/with-school")
        params = {"segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestProjectsLocationsContract:
    """Test projects/locations contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/locations")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_status(self):
        """Status should have allowed values."""
        contract = get_contract("projects/locations")
        status_field = contract.param_schema.fields["status"]
        assert "pending" in status_field.allowed_values
        assert "success" in status_field.allowed_values
        assert "failed" in status_field.allowed_values

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("projects/locations")
        assert contract.param_schema.fields["limit"].default == 100
        assert contract.param_schema.fields["offset"].default == 0


class TestProjectsSchoolFlagsContract:
    """Test projects/school-flags contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/school-flags")
        assert contract is not None
        assert contract.version == "v3"

    def test_projects_required(self):
        """Projects should be required."""
        contract = get_contract("projects/school-flags")
        projects_field = contract.param_schema.fields["projects"]
        assert projects_field.required is True


class TestSchoolsContract:
    """Test projects/schools contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/schools")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("projects/schools")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestSchoolByIdContract:
    """Test projects/school-by-id contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/school-by-id")
        assert contract is not None
        assert contract.version == "v3"


class TestProjectsHotContract:
    """Test projects/hot contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/hot")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_market_segment(self):
        """Market segment should have allowed values."""
        contract = get_contract("projects/hot")
        segment_field = contract.param_schema.fields["market_segment"]
        assert "CCR" in segment_field.allowed_values
        assert "RCR" in segment_field.allowed_values
        assert "OCR" in segment_field.allowed_values

    def test_param_schema_aliases(self):
        """Check aliases."""
        contract = get_contract("projects/hot")
        assert contract.param_schema.aliases.get("region") == "market_segment"


class TestProjectsInventoryStatusContract:
    """Test projects/inventory-status contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/inventory-status")
        assert contract is not None
        assert contract.version == "v3"


class TestProjectsSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All project schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "projects_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            endpoints = [
                ("projects/school-flag", "school_flag"),
                ("projects/with-school", "with_school"),
                ("projects/locations", "locations"),
                ("projects/school-flags", "school_flags"),
                ("projects/schools", "schools"),
                ("projects/school-by-id", "school_by_id"),
                ("projects/hot", "hot"),
                ("projects/inventory-status", "inventory_status"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
