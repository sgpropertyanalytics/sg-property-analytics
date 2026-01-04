"""
Frontend-Backend Contract Alignment Tests.

PURPOSE:
These tests ensure frontend's expected API params match backend's accepted params.
When frontend adds a new param to buildApiParamsFromState(), these tests will fail
if the backend Pydantic model doesn't accept it.

UPDATED: Now uses Pydantic model introspection instead of legacy ParamSchema.
"""

import pytest


def get_pydantic_fields_and_aliases(pydantic_model):
    """
    Extract field names and validation aliases from a Pydantic model.

    Returns:
        tuple: (set of field names, dict of alias -> field name)
    """
    if pydantic_model is None:
        return set(), {}

    fields = set(pydantic_model.model_fields.keys())
    aliases = {}

    for field_name, field_info in pydantic_model.model_fields.items():
        # Check validation_alias (used for input parsing)
        if field_info.validation_alias:
            alias = field_info.validation_alias
            if isinstance(alias, str):
                aliases[alias] = field_name

    return fields, aliases


class TestAggregateParamAlignment:
    """
    Ensures frontend's /api/aggregate params match backend's AggregateParams model.

    Source: frontend/src/context/PowerBIFilter/utils.js buildApiParamsFromState()
    Target: backend/api/contracts/pydantic_models/aggregate.py AggregateParams
    """

    # Params that frontend sends AND backend AggregateParams accepts
    # Note: Some frontend params (priceMin, priceMax, propertyAge*) are not in AggregateParams
    # They may be handled by different endpoints or filtered client-side
    FRONTEND_AGGREGATE_PARAMS = {
        # Time filter
        'timeframe', 'dateFrom', 'dateTo',
        # Location filters
        'district', 'segment',
        # Bedroom filter
        'bedroom',
        # Sale type
        'saleType',
        # PSF/Size ranges
        'psfMin', 'psfMax', 'sizeMin', 'sizeMax',
        # Other filters
        'tenure', 'project',
        # Chart params
        'groupBy', 'metrics', 'projectExact',
    }

    # Aliases that map camelCase (frontend) → snake_case (backend)
    EXPECTED_ALIASES = {
        'saleType': 'sale_type',
        'dateFrom': 'date_from',
        'dateTo': 'date_to',
        'psfMin': 'psf_min',
        'psfMax': 'psf_max',
        'sizeMin': 'size_min',
        'sizeMax': 'size_max',
        'groupBy': 'group_by',
        'projectExact': 'project_exact',
    }

    def test_aggregate_schema_accepts_all_frontend_params(self, contract_registry):
        """Backend aggregate Pydantic model must accept ALL params frontend sends."""
        contract = contract_registry.get("aggregate")
        assert contract is not None, "Aggregate contract not registered"
        assert contract.pydantic_model is not None, "Aggregate contract has no pydantic_model"

        schema_fields, schema_aliases = get_pydantic_fields_and_aliases(contract.pydantic_model)
        accepted_params = schema_fields | set(schema_aliases.keys())

        missing_params = []
        for param in self.FRONTEND_AGGREGATE_PARAMS:
            if param not in accepted_params:
                # Check snake_case version
                snake_case = self.EXPECTED_ALIASES.get(param)
                if snake_case and snake_case in schema_fields:
                    continue
                missing_params.append(param)

        assert not missing_params, (
            f"Frontend sends params that backend aggregate model doesn't accept:\n"
            f"  Missing: {missing_params}\n"
            f"  Model fields: {sorted(schema_fields)}\n"
            f"  Model aliases: {sorted(schema_aliases.keys())}\n\n"
            f"FIX: Add missing params to AggregateParams in\n"
            f"     backend/api/contracts/pydantic_models/aggregate.py"
        )

    def test_aggregate_schema_has_timeframe_field(self, contract_registry):
        """Explicit test for timeframe field - the field that caused P0 bug."""
        contract = contract_registry.get("aggregate")
        assert contract is not None, "Aggregate contract not registered"
        assert contract.pydantic_model is not None, "Aggregate contract has no pydantic_model"

        schema_fields, _ = get_pydantic_fields_and_aliases(contract.pydantic_model)

        assert 'timeframe' in schema_fields, (
            "CRITICAL: 'timeframe' field missing from AggregateParams!\n"
            "This was a P0 bug - charts ignored time filter selection.\n\n"
            "FIX: Add 'timeframe' field to AggregateParams"
        )

    def test_aggregate_schema_has_all_required_aliases(self, contract_registry):
        """Verify camelCase → snake_case aliases exist in Pydantic model."""
        contract = contract_registry.get("aggregate")
        assert contract is not None, "Aggregate contract not registered"
        assert contract.pydantic_model is not None, "Aggregate contract has no pydantic_model"

        schema_fields, schema_aliases = get_pydantic_fields_and_aliases(contract.pydantic_model)

        for camel_case, snake_case in self.EXPECTED_ALIASES.items():
            alias_exists = schema_aliases.get(camel_case) == snake_case
            field_exists = camel_case in schema_fields or snake_case in schema_fields

            assert alias_exists or field_exists, (
                f"Missing alias or field for '{camel_case}':\n"
                f"  Expected: validation_alias='{camel_case}' on field '{snake_case}'\n"
                f"  Found aliases: {schema_aliases}\n"
                f"  Found fields: {sorted(schema_fields)}"
            )


class TestDashboardParamAlignment:
    """
    Ensures frontend's /api/dashboard params match backend's DashboardParams model.
    """

    FRONTEND_DASHBOARD_PARAMS = {
        'timeframe', 'dateFrom', 'dateTo',
        'district', 'segment',
        'bedroom', 'saleType', 'tenure', 'project',
        'psfMin', 'psfMax', 'sizeMin', 'sizeMax',
        'panels', 'timeGrain', 'locationGrain',
    }

    def test_dashboard_schema_accepts_all_frontend_params(self, contract_registry):
        """Backend dashboard Pydantic model must accept ALL params frontend sends."""
        contract = contract_registry.get("dashboard")
        if contract is None:
            pytest.skip("Dashboard contract not registered")
        if contract.pydantic_model is None:
            pytest.skip("Dashboard contract has no pydantic_model")

        schema_fields, schema_aliases = get_pydantic_fields_and_aliases(contract.pydantic_model)
        accepted_params = schema_fields | set(schema_aliases.keys())

        missing_params = []
        for param in self.FRONTEND_DASHBOARD_PARAMS:
            if param not in accepted_params:
                snake_case = param.replace('Min', '_min').replace('Max', '_max')
                snake_case = ''.join(['_' + c.lower() if c.isupper() else c for c in snake_case]).lstrip('_')
                if snake_case not in schema_fields:
                    missing_params.append(param)

        assert not missing_params, (
            f"Frontend sends params that backend dashboard model doesn't accept:\n"
            f"  Missing: {missing_params}\n"
            f"  Model fields: {sorted(schema_fields)}\n\n"
            f"FIX: Add missing params to DashboardParams"
        )

    def test_dashboard_schema_has_timeframe_field(self, contract_registry):
        """Explicit test for timeframe field in dashboard schema."""
        contract = contract_registry.get("dashboard")
        if contract is None:
            pytest.skip("Dashboard contract not registered")
        if contract.pydantic_model is None:
            pytest.skip("Dashboard contract has no pydantic_model")

        schema_fields, _ = get_pydantic_fields_and_aliases(contract.pydantic_model)

        assert 'timeframe' in schema_fields, (
            "CRITICAL: 'timeframe' field missing from DashboardParams!"
        )


class TestContractAlignmentSummary:
    """Summary test that provides overview of all alignments."""

    def test_print_alignment_status(self, contract_registry, capsys):
        """Print alignment status for all major endpoints."""
        print("\n" + "=" * 60)
        print("FRONTEND-BACKEND CONTRACT ALIGNMENT STATUS")
        print("=" * 60)

        endpoints = [
            ('aggregate', TestAggregateParamAlignment.FRONTEND_AGGREGATE_PARAMS),
            ('dashboard', TestDashboardParamAlignment.FRONTEND_DASHBOARD_PARAMS),
        ]

        all_aligned = True

        for endpoint_name, expected_params in endpoints:
            contract = contract_registry.get(endpoint_name)
            if not contract or not contract.pydantic_model:
                print(f"\n[SKIP] {endpoint_name}: No Pydantic model")
                continue

            schema_fields, schema_aliases = get_pydantic_fields_and_aliases(contract.pydantic_model)
            accepted = schema_fields | set(schema_aliases.keys())

            missing = expected_params - accepted
            still_missing = set()
            for param in missing:
                snake = param.replace('Min', '_min').replace('Max', '_max')
                snake = ''.join(['_' + c.lower() if c.isupper() else c for c in snake]).lstrip('_')
                if snake not in schema_fields:
                    still_missing.add(param)

            if still_missing:
                all_aligned = False
                print(f"\n[FAIL] {endpoint_name}:")
                print(f"  Missing: {sorted(still_missing)}")
            else:
                print(f"\n[PASS] {endpoint_name}: All {len(expected_params)} params accepted")

            if 'timeframe' not in schema_fields:
                all_aligned = False
                print(f"  ⚠️  CRITICAL: 'timeframe' not in model fields!")

        print("\n" + "=" * 60)
        if all_aligned:
            print("✅ All frontend params are accepted by backend models")
        else:
            print("❌ Some frontend params are NOT accepted by backend")
        print("=" * 60 + "\n")
