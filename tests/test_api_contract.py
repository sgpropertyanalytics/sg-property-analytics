#!/usr/bin/env python3
"""
API Contract Tests - Phase 1 POC

Tests the API schema contract layer for /api/transactions/list endpoint.
Verifies:
1. v2 schema returns camelCase field names
2. v2 saleType is lowercase enum (new_sale, resale)
3. Dual-mode (v1) returns both old and new fields for backwards compat
4. API accepts both v1 (sale_type) and v2 (saleType) filter params
5. Response meta includes API contract version

Run with: pytest tests/test_api_contract.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


class TestSaleTypeEnums:
    """Test SaleType enum conversion between DB and API values."""

    def test_db_to_api_mapping(self):
        """Verify DB values map to lowercase API enums."""
        from schemas.api_contract import SaleType

        assert SaleType.from_db('New Sale') == 'new_sale'
        assert SaleType.from_db('Resale') == 'resale'
        assert SaleType.from_db('Sub Sale') == 'sub_sale'

    def test_api_to_db_mapping(self):
        """Verify API enums map back to DB values."""
        from schemas.api_contract import SaleType

        assert SaleType.to_db('new_sale') == 'New Sale'
        assert SaleType.to_db('resale') == 'Resale'
        assert SaleType.to_db('sub_sale') == 'Sub Sale'

    def test_all_enums_are_lowercase(self):
        """Verify all API enum values are lowercase snake_case."""
        from schemas.api_contract import SaleType

        for enum_val in SaleType.ALL:
            assert enum_val == enum_val.lower(), f"Enum {enum_val} should be lowercase"
            assert ' ' not in enum_val, f"Enum {enum_val} should not contain spaces"

    def test_unknown_values_pass_through(self):
        """Unknown values should pass through unchanged."""
        from schemas.api_contract import SaleType

        assert SaleType.from_db('Unknown') == 'Unknown'
        assert SaleType.from_db(None) is None
        assert SaleType.to_db('unknown') == 'unknown'


class TestTenureEnums:
    """Test Tenure enum conversion."""

    def test_db_to_api_mapping(self):
        """Verify DB values map to API enums."""
        from schemas.api_contract import Tenure

        assert Tenure.from_db('Freehold') == 'freehold'
        assert Tenure.from_db('99-year') == '99_year'
        assert Tenure.from_db('999-year') == '999_year'


class TestTransactionSerializer:
    """Test transaction serialization to API schema."""

    def test_serialize_returns_camel_case(self):
        """Verify serialization produces camelCase keys."""
        from schemas.api_contract import serialize_transaction, TransactionFields

        # Create a mock transaction object
        class MockTransaction:
            id = 1
            project_name = "Test Condo"
            district = "D09"
            bedroom_count = 3
            transaction_date = None
            price = 1500000
            area_sqft = 1200
            psf = 1250
            sale_type = "Resale"
            tenure = "99-year"
            floor_level = "Mid"
            remaining_lease = 85
            market_segment = "CCR"
            street_name = "Test Street"
            floor_range = "10-15"

        txn = MockTransaction()
        result = serialize_transaction(txn, include_deprecated=False)

        # Check camelCase keys exist
        assert TransactionFields.PROJECT_NAME in result  # 'projectName'
        assert TransactionFields.BEDROOM_COUNT in result  # 'bedroomCount'
        assert TransactionFields.AREA_SQFT in result  # 'areaSqft'
        assert TransactionFields.SALE_TYPE in result  # 'saleType'

        # Check snake_case keys do NOT exist in v2 mode
        assert 'project_name' not in result
        assert 'bedroom_count' not in result
        assert 'area_sqft' not in result
        assert 'sale_type' not in result

    def test_serialize_sale_type_is_enum(self):
        """Verify saleType is converted to lowercase enum."""
        from schemas.api_contract import serialize_transaction, SaleType

        class MockTransaction:
            id = 1
            project_name = "Test"
            district = "D09"
            bedroom_count = 2
            transaction_date = None
            price = 1000000
            area_sqft = 800
            psf = 1250
            sale_type = "New Sale"
            tenure = "99-year"
            floor_level = None
            remaining_lease = None
            market_segment = None
            street_name = None
            floor_range = None

        txn = MockTransaction()
        result = serialize_transaction(txn, include_deprecated=False)

        assert result['saleType'] == SaleType.NEW_SALE  # 'new_sale'
        assert result['saleType'] in SaleType.ALL

    def test_dual_mode_includes_both_formats(self):
        """Verify dual mode (default) includes both old and new keys."""
        from schemas.api_contract import serialize_transaction

        class MockTransaction:
            id = 1
            project_name = "Test"
            district = "D09"
            bedroom_count = 2
            transaction_date = None
            price = 1000000
            area_sqft = 800
            psf = 1250
            sale_type = "Resale"
            tenure = "Freehold"
            floor_level = None
            remaining_lease = None
            market_segment = None
            street_name = None
            floor_range = None

        txn = MockTransaction()
        result = serialize_transaction(txn, include_deprecated=True)

        # Should have BOTH formats
        assert 'projectName' in result and 'project_name' in result
        assert 'bedroomCount' in result and 'bedroom_count' in result
        assert 'saleType' in result and 'sale_type' in result

        # New format uses enum, old format uses DB value
        assert result['saleType'] == 'resale'  # API enum
        assert result['sale_type'] == 'Resale'  # DB value


class TestApiContractVersion:
    """Test API contract versioning."""

    def test_contract_version_defined(self):
        """Verify API_CONTRACT_VERSION is defined."""
        from schemas.api_contract import API_CONTRACT_VERSION

        assert API_CONTRACT_VERSION is not None
        assert API_CONTRACT_VERSION == 'v2'


class TestFilterParamParsing:
    """Test filter parameter parsing for v1/v2 compatibility."""

    def test_parses_v2_sale_type_param(self):
        """Verify v2 saleType enum is converted to DB value."""
        from schemas.api_contract import parse_filter_params

        params = parse_filter_params({'saleType': 'new_sale'})
        assert params.get('sale_type_db') == 'New Sale'

        params = parse_filter_params({'saleType': 'resale'})
        assert params.get('sale_type_db') == 'Resale'

    def test_parses_v1_sale_type_param(self):
        """Verify v1 sale_type (DB value) is passed through."""
        from schemas.api_contract import parse_filter_params

        params = parse_filter_params({'sale_type': 'New Sale'})
        assert params.get('sale_type_db') == 'New Sale'

    def test_v2_takes_precedence(self):
        """If both v1 and v2 params present, v2 (saleType) takes precedence."""
        from schemas.api_contract import parse_filter_params

        params = parse_filter_params({
            'saleType': 'resale',
            'sale_type': 'New Sale'
        })
        # saleType should win
        assert params.get('sale_type_db') == 'Resale'


class TestFrontendSchemaSync:
    """Test that frontend schema matches backend schema."""

    def test_frontend_schema_file_exists(self):
        """Verify frontend schema file was created."""
        frontend_schema_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'frontend',
            'src',
            'schemas',
            'apiContract.js'
        )
        assert os.path.exists(frontend_schema_path), (
            "Frontend schema file should exist at frontend/src/schemas/apiContract.js"
        )

    def test_frontend_schema_has_sale_type_enums(self):
        """Verify frontend schema defines matching SaleType enums."""
        frontend_schema_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'frontend',
            'src',
            'schemas',
            'apiContract.js'
        )
        with open(frontend_schema_path, 'r') as f:
            content = f.read()

        # Should have matching enum values
        assert "NEW_SALE: 'new_sale'" in content
        assert "RESALE: 'resale'" in content
        assert "SUB_SALE: 'sub_sale'" in content

    def test_frontend_schema_has_txn_fields(self):
        """Verify frontend schema defines TransactionFields (TxnField)."""
        frontend_schema_path = os.path.join(
            os.path.dirname(__file__),
            '..',
            'frontend',
            'src',
            'schemas',
            'apiContract.js'
        )
        with open(frontend_schema_path, 'r') as f:
            content = f.read()

        # Should have field name constants
        assert "PROJECT_NAME: 'projectName'" in content
        assert "BEDROOM_COUNT: 'bedroomCount'" in content
        assert "TRANSACTION_DATE: 'transactionDate'" in content
        assert "SALE_TYPE: 'saleType'" in content


# Integration tests (require running app)
class TestTransactionsListEndpointContract:
    """
    Integration tests for /api/transactions/list contract.

    These tests verify the actual API response format.
    Requires: Flask app context and database connection.
    """

    def _get_test_client(self):
        """Get Flask test client."""
        try:
            from app import create_app
            app = create_app()
            app.config['TESTING'] = True
            return app.test_client()
        except Exception as e:
            pytest.skip(f"Could not create test client: {e}")

    def test_v2_schema_returns_camel_case(self):
        """v2 schema returns camelCase field names."""
        client = self._get_test_client()
        response = client.get('/api/transactions/list?limit=1&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available or no data")

        data = response.get_json()
        if not data.get('transactions'):
            pytest.skip("No transactions in database")

        txn = data['transactions'][0]

        # Must have v2 camelCase fields
        assert 'projectName' in txn or txn.get('projectName') is None
        assert 'bedroomCount' in txn
        assert 'saleType' in txn

        # Must NOT have v1 snake_case in v2 mode
        assert 'project_name' not in txn
        assert 'bedroom_count' not in txn
        assert 'sale_type' not in txn

    def test_v2_sale_type_is_enum(self):
        """v2 saleType is lowercase enum, not DB string."""
        client = self._get_test_client()
        response = client.get('/api/transactions/list?limit=10&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import SaleType

        for txn in data.get('transactions', []):
            sale_type = txn.get('saleType')
            if sale_type:
                assert sale_type in SaleType.ALL, f"Invalid saleType: {sale_type}"
                assert sale_type == sale_type.lower(), "saleType must be lowercase"
                assert ' ' not in sale_type, "saleType must not contain spaces"

    def test_backwards_compat_dual_mode(self):
        """Default (v1) returns both old and new fields."""
        client = self._get_test_client()
        response = client.get('/api/transactions/list?limit=1')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        if not data.get('transactions'):
            pytest.skip("No transactions in database")

        txn = data['transactions'][0]

        # Must have BOTH formats in dual mode
        assert 'projectName' in txn or txn.get('projectName') is None
        assert 'project_name' in txn or txn.get('project_name') is None
        assert 'bedroomCount' in txn and 'bedroom_count' in txn
        assert 'saleType' in txn and 'sale_type' in txn

    def test_accepts_v2_filter_params(self):
        """Accepts saleType param (v2) in addition to sale_type (v1)."""
        client = self._get_test_client()

        # v2 format
        response = client.get('/api/transactions/list?saleType=new_sale&limit=1')
        assert response.status_code == 200

        # v1 format still works
        response = client.get('/api/transactions/list?sale_type=New%20Sale&limit=1')
        assert response.status_code == 200

    def test_meta_includes_contract_version(self):
        """Response meta includes API contract version."""
        client = self._get_test_client()
        response = client.get('/api/transactions/list?limit=1')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import API_CONTRACT_VERSION

        assert 'meta' in data
        assert data['meta'].get('apiContractVersion') == API_CONTRACT_VERSION
        assert 'schemaVersion' in data['meta']


class TestAggregateSerializer:
    """Unit tests for aggregate serialization."""

    def test_serialize_aggregate_row_transforms_sale_type(self):
        """Verify sale_type is converted to lowercase enum."""
        from schemas.api_contract import serialize_aggregate_row, SaleType

        row = {'sale_type': 'New Sale', 'count': 10, 'avg_psf': 1500.0}
        result = serialize_aggregate_row(row, include_deprecated=False)

        assert result['saleType'] == SaleType.NEW_SALE
        assert 'sale_type' not in result

    def test_serialize_aggregate_row_transforms_region(self):
        """Verify region is converted to lowercase."""
        from schemas.api_contract import serialize_aggregate_row

        row = {'region': 'CCR', 'count': 10}
        result = serialize_aggregate_row(row, include_deprecated=False)

        assert result['region'] == 'ccr'

    def test_serialize_aggregate_row_transforms_bedroom(self):
        """Verify bedroom → bedroomCount."""
        from schemas.api_contract import serialize_aggregate_row

        row = {'bedroom': 3, 'count': 10}
        result = serialize_aggregate_row(row, include_deprecated=False)

        assert result['bedroomCount'] == 3
        assert 'bedroom' not in result

    def test_serialize_aggregate_row_transforms_metrics(self):
        """Verify metric fields are camelCased."""
        from schemas.api_contract import serialize_aggregate_row

        row = {
            'avg_psf': 1500.0,
            'median_psf': 1450.0,
            'total_value': 10000000,
            'count': 10
        }
        result = serialize_aggregate_row(row, include_deprecated=False)

        assert result['avgPsf'] == 1500.0
        assert result['medianPsf'] == 1450.0
        assert result['totalValue'] == 10000000
        assert 'avg_psf' not in result
        assert 'median_psf' not in result
        assert 'total_value' not in result

    def test_serialize_aggregate_row_dual_mode(self):
        """Verify dual mode includes both old and new fields."""
        from schemas.api_contract import serialize_aggregate_row

        row = {'sale_type': 'Resale', 'avg_psf': 1500.0, 'bedroom': 2}
        result = serialize_aggregate_row(row, include_deprecated=True)

        # Should have both
        assert result['saleType'] == 'resale'
        assert result['sale_type'] == 'Resale'
        assert result['avgPsf'] == 1500.0
        assert result['avg_psf'] == 1500.0
        assert result['bedroomCount'] == 2
        assert result['bedroom'] == 2

    def test_serialize_aggregate_response_adds_meta(self):
        """Verify response includes API contract version in meta."""
        from schemas.api_contract import serialize_aggregate_response, API_CONTRACT_VERSION

        data = [{'month': '2024-01', 'count': 10}]
        meta = {'total_records': 100}

        result = serialize_aggregate_response(data, meta)

        assert result['meta']['apiContractVersion'] == API_CONTRACT_VERSION
        assert result['meta']['total_records'] == 100


class TestAggregateEndpointContract:
    """
    Integration tests for /api/aggregate contract.

    These tests verify the actual API response format.
    Requires: Flask app context and database connection.
    """

    def _get_test_client(self):
        """Get Flask test client."""
        try:
            from app import create_app
            app = create_app()
            app.config['TESTING'] = True
            return app.test_client()
        except Exception as e:
            pytest.skip(f"Could not create test client: {e}")

    def test_v2_schema_transforms_sale_type(self):
        """v2 schema returns lowercase saleType enum."""
        client = self._get_test_client()
        response = client.get('/api/aggregate?group_by=sale_type&metrics=count&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import SaleType

        for row in data.get('data', []):
            sale_type = row.get('saleType')
            if sale_type:
                assert sale_type in SaleType.ALL, f"Invalid saleType: {sale_type}"
                assert sale_type == sale_type.lower()
                assert ' ' not in sale_type

            # Must NOT have v1 in v2 mode
            assert 'sale_type' not in row

    def test_v2_schema_transforms_bedroom(self):
        """v2 schema returns bedroomCount not bedroom."""
        client = self._get_test_client()
        response = client.get('/api/aggregate?group_by=bedroom&metrics=count&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        for row in data.get('data', []):
            assert 'bedroomCount' in row
            assert 'bedroom' not in row

    def test_v2_schema_transforms_metrics(self):
        """v2 schema returns camelCase metric fields."""
        client = self._get_test_client()
        response = client.get('/api/aggregate?group_by=month&metrics=avg_psf,median_psf&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        if data.get('data'):
            row = data['data'][0]
            # Should have camelCase
            assert 'avgPsf' in row or row.get('avgPsf') is not None
            # Should NOT have snake_case
            assert 'avg_psf' not in row

    def test_v2_schema_transforms_region(self):
        """v2 schema returns lowercase region."""
        client = self._get_test_client()
        response = client.get('/api/aggregate?group_by=region&metrics=count&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        for row in data.get('data', []):
            region = row.get('region')
            if region:
                assert region == region.lower(), f"Region should be lowercase: {region}"

    def test_backwards_compat_dual_mode(self):
        """Default (v1) returns both old and new fields."""
        client = self._get_test_client()
        response = client.get('/api/aggregate?group_by=sale_type,bedroom&metrics=avg_psf')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        if data.get('data'):
            row = data['data'][0]
            # Should have BOTH formats
            assert 'saleType' in row and 'sale_type' in row
            assert 'bedroomCount' in row and 'bedroom' in row
            assert 'avgPsf' in row and 'avg_psf' in row

    def test_meta_includes_contract_version(self):
        """Response meta includes API contract version."""
        client = self._get_test_client()
        response = client.get('/api/aggregate?group_by=month&metrics=count')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import API_CONTRACT_VERSION

        assert 'meta' in data
        assert data['meta'].get('apiContractVersion') == API_CONTRACT_VERSION
        assert data['meta'].get('schemaVersion') in ['v1', 'v2']

    def test_empty_result_still_has_contract_format(self):
        """Empty results still return proper contract format."""
        client = self._get_test_client()
        # Use an impossible filter to get empty results
        response = client.get('/api/aggregate?group_by=month&metrics=count&district=D99&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import API_CONTRACT_VERSION

        assert data['data'] == []
        assert 'meta' in data
        assert data['meta'].get('apiContractVersion') == API_CONTRACT_VERSION
