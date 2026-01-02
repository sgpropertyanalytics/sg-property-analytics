"""
Frontend-Backend Contract Alignment Tests.

PURPOSE:
These tests ensure frontend's expected API params match backend's accepted params.
When frontend adds a new param to buildApiParamsFromState(), these tests will fail
if the backend schema doesn't accept it.

ROOT CAUSE CONTEXT:
This test file was created after a P0 bug where:
1. Frontend's filter migration added `timeframe` param to buildApiParamsFromState()
2. Backend's AGGREGATE_PARAM_SCHEMA didn't have `timeframe` field
3. normalize_params() only copies schema-defined fields → timeframe was dropped
4. _normalize_timeframe() saw timeframe=None → defaulted to 'Y1'
5. Result: Charts always showed 1Y data regardless of user's time selection

The existing tests passed because:
- Frontend unit tests verified buildApiParamsFromState() outputs timeframe (isolation)
- Backend contract tests only checked some fields existed (additive-only)
- No test verified the full frontend→backend param flow

PREVENTION:
These tests bridge the gap by explicitly listing all params frontend sends
and verifying backend schemas accept them.

MAINTENANCE:
When adding new filter params:
1. Add to frontend's buildApiParamsFromState() in utils.js
2. Add to backend's schema (e.g., AGGREGATE_PARAM_SCHEMA)
3. Add to the FRONTEND_*_PARAMS set in this file
4. Tests will fail if any step is missed
"""

import pytest


class TestAggregateParamAlignment:
    """
    Ensures frontend's /api/aggregate params match backend's AGGREGATE_PARAM_SCHEMA.

    Source: frontend/src/context/PowerBIFilter/utils.js buildApiParamsFromState()
    Target: backend/api/contracts/schemas/aggregate.py AGGREGATE_PARAM_SCHEMA
    """

    # All params frontend can send to /api/aggregate
    # Extracted from buildApiParamsFromState() in utils.js
    FRONTEND_AGGREGATE_PARAMS = {
        # Time filter (unified) - lines 182-192
        'timeframe',        # Preset mode: timeFilter.type='preset' → timeframe=value
        'dateFrom',         # Custom mode: timeFilter.type='custom' → dateFrom, dateTo
        'dateTo',

        # Location filters - lines 194-215
        'district',         # activeFilters.districts.join(',')
        'segment',          # activeFilters.segments.join(',')

        # Bedroom filter - lines 204-206
        'bedroom',          # activeFilters.bedroomTypes.join(',')

        # Sale type - lines 217-222
        'saleType',         # activeFilters.saleType (or from page props)

        # PSF/Size ranges - lines 225-228
        'psfMin',           # activeFilters.psfRange.min
        'psfMax',           # activeFilters.psfRange.max
        'sizeMin',          # activeFilters.sizeRange.min
        'sizeMax',          # activeFilters.sizeRange.max

        # Fact filter (transaction table) - lines 231-234
        'priceMin',         # factFilter.priceRange.min (with includeFactFilter=true)
        'priceMax',         # factFilter.priceRange.max

        # Other filters - lines 237-241
        'tenure',           # activeFilters.tenure
        'propertyAgeMin',   # activeFilters.propertyAge.min
        'propertyAgeMax',   # activeFilters.propertyAge.max
        'project',          # activeFilters.project
        'propertyAgeBucket', # activeFilters.propertyAgeBucket

        # Additional params passed from chart components
        'groupBy',          # V2_PARAM_KEY_MAP: group_by → groupBy
        'metrics',          # Aggregation metrics
        'projectExact',     # V2_PARAM_KEY_MAP: project_exact → projectExact
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
        'priceMin': 'price_min',
        'priceMax': 'price_max',
        'groupBy': 'group_by',
        'projectExact': 'project_exact',
        'propertyAgeMin': 'property_age_min',
        'propertyAgeMax': 'property_age_max',
        'propertyAgeBucket': 'property_age_bucket',
    }

    def test_aggregate_schema_accepts_all_frontend_params(self, contract_registry):
        """
        Backend aggregate schema must accept ALL params frontend sends.

        This is the KEY test that would have caught the timeframe bug.
        """
        contract = contract_registry.get("aggregate")
        assert contract is not None, "Aggregate contract not registered"

        schema_fields = set(contract.param_schema.fields.keys())
        schema_aliases = set(contract.param_schema.aliases.keys()) if hasattr(contract.param_schema, 'aliases') else set()

        # Combined set of all accepted params (fields + aliases)
        accepted_params = schema_fields | schema_aliases

        missing_params = []
        for param in self.FRONTEND_AGGREGATE_PARAMS:
            # Check if param is accepted directly or via alias
            if param not in accepted_params:
                # Also check if it maps to a field via alias
                snake_case = self.EXPECTED_ALIASES.get(param)
                if snake_case and snake_case in schema_fields:
                    continue  # Acceptable: camelCase alias exists
                missing_params.append(param)

        assert not missing_params, (
            f"Frontend sends params that backend aggregate schema doesn't accept:\n"
            f"  Missing: {missing_params}\n"
            f"  Schema fields: {sorted(schema_fields)}\n"
            f"  Schema aliases: {sorted(schema_aliases)}\n\n"
            f"FIX: Add missing params to AGGREGATE_PARAM_SCHEMA.fields in\n"
            f"     backend/api/contracts/schemas/aggregate.py"
        )

    def test_aggregate_schema_has_timeframe_field(self, contract_registry):
        """
        Explicit test for timeframe field.

        This is the specific field that was missing and caused P0 bug.
        Added as explicit test to prevent regression.
        """
        contract = contract_registry.get("aggregate")
        assert contract is not None, "Aggregate contract not registered"

        assert 'timeframe' in contract.param_schema.fields, (
            "CRITICAL: 'timeframe' field missing from AGGREGATE_PARAM_SCHEMA!\n"
            "This was a P0 bug - charts ignored time filter selection.\n"
            "Frontend sends timeframe (e.g., 'M6', 'Y3') but backend dropped it.\n\n"
            "FIX: Add 'timeframe' FieldSpec to AGGREGATE_PARAM_SCHEMA.fields"
        )

    def test_aggregate_schema_has_all_required_aliases(self, contract_registry):
        """Verify camelCase → snake_case aliases exist."""
        contract = contract_registry.get("aggregate")
        assert contract is not None, "Aggregate contract not registered"

        schema_aliases = contract.param_schema.aliases if hasattr(contract.param_schema, 'aliases') else {}
        schema_fields = contract.param_schema.fields

        for camel_case, snake_case in self.EXPECTED_ALIASES.items():
            # Either the alias exists, or the camelCase field exists directly
            alias_exists = schema_aliases.get(camel_case) == snake_case
            field_exists = camel_case in schema_fields or snake_case in schema_fields

            assert alias_exists or field_exists, (
                f"Missing alias or field for '{camel_case}':\n"
                f"  Expected: aliases['{camel_case}'] = '{snake_case}' OR field '{snake_case}' exists\n"
                f"  Found aliases: {schema_aliases}\n"
                f"  Found fields: {list(schema_fields.keys())}"
            )


class TestDashboardParamAlignment:
    """
    Ensures frontend's /api/dashboard params match backend's DASHBOARD_PARAM_SCHEMA.

    Source: frontend/src/context/PowerBIFilter/utils.js buildApiParamsFromState()
    Target: backend/api/contracts/schemas/dashboard.py DASHBOARD_PARAM_SCHEMA
    """

    # Dashboard uses similar params to aggregate
    FRONTEND_DASHBOARD_PARAMS = {
        # Time filter
        'timeframe',
        'dateFrom',
        'dateTo',

        # Location
        'district',
        'segment',

        # Other filters
        'bedroom',
        'saleType',
        'tenure',
        'project',

        # Range filters
        'psfMin',
        'psfMax',
        'sizeMin',
        'sizeMax',

        # Dashboard-specific
        'panels',           # Which dashboard panels to return
        'timeGrain',        # 'month', 'quarter', 'year'
        'locationGrain',    # 'district', 'region'
    }

    def test_dashboard_schema_accepts_all_frontend_params(self, contract_registry):
        """Backend dashboard schema must accept ALL params frontend sends."""
        contract = contract_registry.get("dashboard")
        if contract is None:
            pytest.skip("Dashboard contract not registered")

        schema_fields = set(contract.param_schema.fields.keys())
        schema_aliases = set(contract.param_schema.aliases.keys()) if hasattr(contract.param_schema, 'aliases') else set()
        accepted_params = schema_fields | schema_aliases

        missing_params = []
        for param in self.FRONTEND_DASHBOARD_PARAMS:
            if param not in accepted_params:
                # Check snake_case version
                snake_case = param.replace('Min', '_min').replace('Max', '_max')
                snake_case = ''.join(['_' + c.lower() if c.isupper() else c for c in snake_case]).lstrip('_')
                if snake_case not in schema_fields:
                    missing_params.append(param)

        assert not missing_params, (
            f"Frontend sends params that backend dashboard schema doesn't accept:\n"
            f"  Missing: {missing_params}\n"
            f"  Schema fields: {sorted(schema_fields)}\n\n"
            f"FIX: Add missing params to DASHBOARD_PARAM_SCHEMA.fields in\n"
            f"     backend/api/contracts/schemas/dashboard.py"
        )

    def test_dashboard_schema_has_timeframe_field(self, contract_registry):
        """Explicit test for timeframe field in dashboard schema."""
        contract = contract_registry.get("dashboard")
        if contract is None:
            pytest.skip("Dashboard contract not registered")

        assert 'timeframe' in contract.param_schema.fields, (
            "CRITICAL: 'timeframe' field missing from DASHBOARD_PARAM_SCHEMA!\n"
            "BeadsChart and PriceDistributionChart use /api/dashboard.\n"
            "Without timeframe, these charts ignore time filter selection.\n\n"
            "FIX: Add 'timeframe' FieldSpec to DASHBOARD_PARAM_SCHEMA.fields"
        )


class TestInsightsParamAlignment:
    """
    Ensures frontend's /api/insights/* params match backend schemas.
    """

    FRONTEND_INSIGHTS_PARAMS = {
        'timeframe',
        'district',
        'segment',
        'bedroom',
        'saleType',
    }

    def test_insights_schema_has_timeframe_field(self, contract_registry):
        """Verify insights endpoints accept timeframe."""
        # Check if any insights contracts are registered
        insights_contracts = [
            name for name in contract_registry.keys()
            if 'insight' in name.lower() or 'district' in name.lower()
        ]

        for contract_name in insights_contracts:
            contract = contract_registry.get(contract_name)
            if contract and hasattr(contract, 'param_schema'):
                schema_fields = set(contract.param_schema.fields.keys())
                if 'date_from' in schema_fields or 'date_to' in schema_fields:
                    # This endpoint uses date filtering - should also accept timeframe
                    assert 'timeframe' in schema_fields, (
                        f"Contract '{contract_name}' has date_from/date_to but missing timeframe.\n"
                        f"Frontend sends timeframe for all time-filtered endpoints."
                    )


class TestTransactionsParamAlignment:
    """
    Ensures frontend's /api/transactions params match backend schema.
    """

    FRONTEND_TRANSACTIONS_PARAMS = {
        'timeframe',
        'dateFrom',
        'dateTo',
        'district',
        'segment',
        'bedroom',
        'saleType',
        'tenure',
        'project',
        'psfMin',
        'psfMax',
        'sizeMin',
        'sizeMax',
        'priceMin',
        'priceMax',
        'page',
        'perPage',
        'sortBy',
        'sortOrder',
    }

    def test_transactions_schema_accepts_timeframe(self, contract_registry):
        """Transactions endpoint should accept timeframe param."""
        contract = contract_registry.get("transactions")
        if contract is None:
            pytest.skip("Transactions contract not registered")

        schema_fields = set(contract.param_schema.fields.keys())

        # Either timeframe exists directly, or we rely on date resolution elsewhere
        if 'date_from' in schema_fields:
            # This endpoint handles dates - should also handle timeframe
            assert 'timeframe' in schema_fields, (
                "Transactions endpoint has date_from/date_to but missing timeframe.\n"
                "Frontend sends timeframe for time-filtered requests."
            )


# =============================================================================
# SUMMARY TEST
# =============================================================================

class TestContractAlignmentSummary:
    """
    Summary test that provides overview of all alignments.
    Run this to get a quick status of frontend-backend param alignment.
    """

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
            if not contract:
                print(f"\n[SKIP] {endpoint_name}: Contract not registered")
                continue

            schema_fields = set(contract.param_schema.fields.keys())
            schema_aliases = set(contract.param_schema.aliases.keys()) if hasattr(contract.param_schema, 'aliases') else set()
            accepted = schema_fields | schema_aliases

            missing = expected_params - accepted
            # Also check snake_case versions
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

            # Always verify timeframe specifically
            if 'timeframe' not in schema_fields:
                all_aligned = False
                print(f"  ⚠️  CRITICAL: 'timeframe' not in schema fields!")

        print("\n" + "=" * 60)
        if all_aligned:
            print("✅ All frontend params are accepted by backend schemas")
        else:
            print("❌ Some frontend params are NOT accepted by backend")
        print("=" * 60 + "\n")

        # This test always passes - it's informational
        # The individual tests above will fail if there are issues
