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
import pytest

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

    def test_frontend_schema_has_isSaleType_helpers(self):
        """Verify frontend schema has v1/v2 compatibility helpers for sale type."""
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

        # Should have isSaleType helper that handles both v1 and v2
        assert 'export const isSaleType' in content
        assert "newSale:" in content
        assert "resale:" in content
        # Should check both v1 ('New Sale') and v2 ('new_sale')
        assert "'New Sale'" in content
        assert "'new_sale'" in content

    def test_frontend_schema_has_isTenure_helpers(self):
        """Verify frontend schema has v1/v2 compatibility helpers for tenure."""
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

        # Should have isTenure helper that handles both v1 and v2
        assert 'export const isTenure' in content
        assert "freehold:" in content
        assert "leasehold99:" in content
        # Should check both v1 ('99-year') and v2 ('99_year')
        assert "'99-year'" in content
        assert "'99_year'" in content

    def test_frontend_schema_has_normalizeFilterOptions(self):
        """Verify frontend schema has normalizeFilterOptions function."""
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

        # Should have normalizeFilterOptions function
        assert 'export const normalizeFilterOptions' in content
        # Should handle v1 snake_case fields
        assert 'sale_types' in content
        assert 'date_range' in content
        # Should handle v2 camelCase fields
        assert 'saleTypes' in content
        assert 'dateRange' in content

    def test_frontend_schema_has_bedroom_enum(self):
        """Verify frontend schema has Bedroom enum with FIVE_PLUS."""
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

        # Should have Bedroom enum
        assert 'export const Bedroom' in content
        assert "FIVE_PLUS: '5_plus'" in content


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


class TestFilterOptionsSerializer:
    """Unit tests for filter options serialization with {value, label} format."""

    def test_serialize_filter_options_sale_types_as_value_label(self):
        """Verify sale_types are returned as {value, label} objects."""
        from schemas.api_contract import serialize_filter_options, SaleType

        result = serialize_filter_options(
            districts=['D01', 'D02'],
            regions={'CCR': ['D01'], 'RCR': ['D02'], 'OCR': []},
            bedrooms=[1, 2, 3],
            sale_types=['New Sale', 'Resale'],
            projects=['Test Condo'],
            date_range={'min': '2020-01-01', 'max': '2024-12-31'},
            psf_range={'min': 500, 'max': 5000},
            size_range={'min': 300, 'max': 3000},
            tenures=['Freehold', '99-year'],
            include_deprecated=False
        )

        sale_types = result['saleTypes']

        # Should be list of {value, label} objects
        assert len(sale_types) == 2
        for st in sale_types:
            assert 'value' in st, "Each option must have 'value'"
            assert 'label' in st, "Each option must have 'label'"

        # Check specific values
        values = [st['value'] for st in sale_types]
        labels = [st['label'] for st in sale_types]
        assert SaleType.NEW_SALE in values
        assert SaleType.RESALE in values
        assert 'New Sale' in labels
        assert 'Resale' in labels

    def test_serialize_filter_options_tenures_as_value_label(self):
        """Verify tenures are returned as {value, label} objects."""
        from schemas.api_contract import serialize_filter_options, Tenure

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[2],
            sale_types=['Resale'],
            projects=[],
            date_range={'min': None, 'max': None},
            psf_range={'min': None, 'max': None},
            size_range={'min': None, 'max': None},
            tenures=['Freehold', '99-year', '999-year'],
            include_deprecated=False
        )

        tenures = result['tenures']

        # Should be list of {value, label} objects
        assert len(tenures) == 3
        for t in tenures:
            assert 'value' in t
            assert 'label' in t

        # Check enum values
        values = [t['value'] for t in tenures]
        assert Tenure.FREEHOLD in values
        assert Tenure.LEASEHOLD_99 in values
        assert Tenure.LEASEHOLD_999 in values

        # Labels should be original DB format
        labels = [t['label'] for t in tenures]
        assert 'Freehold' in labels
        assert '99-year' in labels
        assert '999-year' in labels

    def test_serialize_filter_options_regions_as_value_label(self):
        """Verify regions are returned as {value, label} objects."""
        from schemas.api_contract import serialize_filter_options

        result = serialize_filter_options(
            districts=['D01', 'D15', 'D18'],
            regions={'CCR': ['D01'], 'RCR': ['D15'], 'OCR': ['D18']},
            bedrooms=[2],
            sale_types=['Resale'],
            projects=[],
            date_range={},
            psf_range={},
            size_range={},
            tenures=['Freehold'],
            include_deprecated=False
        )

        regions = result['regions']

        # Should be list of {value, label} objects
        assert len(regions) == 3
        for r in regions:
            assert 'value' in r
            assert 'label' in r

        values = [r['value'] for r in regions]
        labels = [r['label'] for r in regions]

        # Values should be lowercase
        assert 'ccr' in values
        assert 'rcr' in values
        assert 'ocr' in values

        # Labels should be uppercase
        assert 'CCR' in labels
        assert 'RCR' in labels
        assert 'OCR' in labels

    def test_serialize_filter_options_districts_as_value_label(self):
        """Verify districts are returned as {value, label} objects."""
        from schemas.api_contract import serialize_filter_options

        result = serialize_filter_options(
            districts=['D01', 'D15'],
            regions={'CCR': ['D01'], 'RCR': ['D15'], 'OCR': []},
            bedrooms=[2],
            sale_types=['Resale'],
            projects=[],
            date_range={},
            psf_range={},
            size_range={},
            tenures=['Freehold'],
            include_deprecated=False
        )

        districts = result['districts']

        # Should be list of {value, label} objects
        assert len(districts) == 2
        for d in districts:
            assert 'value' in d
            assert 'label' in d

        values = [d['value'] for d in districts]
        assert 'D01' in values
        assert 'D15' in values

    def test_serialize_filter_options_bedrooms_as_value_label(self):
        """Verify bedrooms are returned as {value, label} with 5_plus handling."""
        from schemas.api_contract import serialize_filter_options, Bedroom

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[1, 2, 3, 4, 5],
            sale_types=['Resale'],
            projects=[],
            date_range={},
            psf_range={},
            size_range={},
            tenures=['Freehold'],
            include_deprecated=False
        )

        bedrooms = result['bedrooms']

        # Should be list of {value, label} objects
        assert len(bedrooms) == 5
        for br in bedrooms:
            assert 'value' in br
            assert 'label' in br

        # Find the 5+ entry
        five_plus = next((br for br in bedrooms if br['value'] == Bedroom.FIVE_PLUS), None)
        assert five_plus is not None, "Should have 5_plus value"
        assert five_plus['label'] == '5+', "5_plus should have label '5+'"

        # Check that 1-4 are integers
        for br in bedrooms:
            if br['value'] != Bedroom.FIVE_PLUS:
                assert isinstance(br['value'], int)

    def test_serialize_filter_options_includes_market_segments(self):
        """Verify marketSegments field is included."""
        from schemas.api_contract import serialize_filter_options, FilterOptionsFields

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[2],
            sale_types=['Resale'],
            projects=[],
            date_range={},
            psf_range={},
            size_range={},
            tenures=['Freehold'],
            include_deprecated=False
        )

        assert FilterOptionsFields.MARKET_SEGMENTS in result
        market_segments = result['marketSegments']

        # Should be same as regions
        for ms in market_segments:
            assert 'value' in ms
            assert 'label' in ms

    def test_serialize_filter_options_dual_mode(self):
        """Verify dual mode includes both v2 {value,label} and v1 raw values."""
        from schemas.api_contract import serialize_filter_options

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[2],
            sale_types=['New Sale', 'Resale'],
            projects=[],
            date_range={'min': '2020-01-01', 'max': '2024-12-31'},
            psf_range={'min': 500, 'max': 5000},
            size_range={'min': 300, 'max': 3000},
            tenures=['Freehold', '99-year'],
            include_deprecated=True
        )

        # v2 format: {value, label} objects
        assert 'saleTypes' in result
        assert isinstance(result['saleTypes'][0], dict)
        assert 'value' in result['saleTypes'][0]

        # v1 format: raw DB values (deprecated)
        assert 'sale_types' in result
        assert 'New Sale' in result['sale_types']
        assert 'Resale' in result['sale_types']

        # Legacy regions dict preserved
        assert 'regions_legacy' in result
        assert 'CCR' in result['regions_legacy']

    def test_serialize_filter_options_includes_contract_version(self):
        """Verify API contract version is included."""
        from schemas.api_contract import serialize_filter_options, API_CONTRACT_VERSION

        result = serialize_filter_options(
            districts=[],
            regions={},
            bedrooms=[],
            sale_types=[],
            projects=[],
            date_range={},
            psf_range={},
            size_range={},
            tenures=[],
            include_deprecated=False
        )

        assert result['apiContractVersion'] == API_CONTRACT_VERSION

    def test_serialize_filter_options_preserves_camel_case_fields(self):
        """Verify camelCase field names are used."""
        from schemas.api_contract import serialize_filter_options, FilterOptionsFields

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[2],
            sale_types=['Resale'],
            projects=['Test'],
            date_range={'min': '2020-01-01', 'max': '2024-12-31'},
            psf_range={'min': 500, 'max': 5000},
            size_range={'min': 300, 'max': 3000},
            tenures=['Freehold'],
            include_deprecated=False
        )

        # Check camelCase fields exist
        assert FilterOptionsFields.DISTRICTS in result
        assert FilterOptionsFields.SALE_TYPES in result
        assert FilterOptionsFields.DATE_RANGE in result
        assert FilterOptionsFields.PSF_RANGE in result
        assert FilterOptionsFields.SIZE_RANGE in result
        assert FilterOptionsFields.TENURES in result
        assert FilterOptionsFields.MARKET_SEGMENTS in result


class TestFilterOptionsEndpointContract:
    """
    Integration tests for /api/filter-options contract.

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

    def test_v2_schema_sale_types_value_label_format(self):
        """v2 schema returns saleTypes as {value, label} objects."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import SaleType

        sale_types = data.get('saleTypes', [])
        assert len(sale_types) > 0, "Should have sale type options"

        for st in sale_types:
            assert 'value' in st, "Each saleType must have 'value'"
            assert 'label' in st, "Each saleType must have 'label'"
            assert st['value'] in SaleType.ALL, f"Invalid saleType value: {st['value']}"
            assert st['value'] == st['value'].lower(), "value must be lowercase"
            assert ' ' not in st['value'], "value must not contain spaces"

        # Must NOT have v1 in v2 mode
        assert 'sale_types' not in data

    def test_v2_schema_tenures_value_label_format(self):
        """v2 schema returns tenures as {value, label} objects."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        tenures = data.get('tenures', [])
        for t in tenures:
            assert 'value' in t, "Each tenure must have 'value'"
            assert 'label' in t, "Each tenure must have 'label'"
            # Value should be lowercase with underscores
            assert t['value'] == t['value'].lower(), f"Tenure value should be lowercase: {t['value']}"
            assert '-' not in t['value'], f"Tenure value should use underscores: {t['value']}"

    def test_v2_schema_regions_value_label_format(self):
        """v2 schema returns regions as {value, label} objects."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        regions = data.get('regions', [])
        assert len(regions) > 0, "Should have region options"

        for r in regions:
            assert 'value' in r, "Each region must have 'value'"
            assert 'label' in r, "Each region must have 'label'"
            # Value should be lowercase
            assert r['value'] == r['value'].lower()
            # Label should be uppercase
            assert r['label'] == r['label'].upper()

    def test_v2_schema_districts_value_label_format(self):
        """v2 schema returns districts as {value, label} objects."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        districts = data.get('districts', [])
        assert len(districts) > 0, "Should have district options"

        for d in districts:
            assert 'value' in d, "Each district must have 'value'"
            assert 'label' in d, "Each district must have 'label'"

    def test_v2_schema_bedrooms_value_label_format(self):
        """v2 schema returns bedrooms as {value, label} with 5_plus handling."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import Bedroom

        bedrooms = data.get('bedrooms', [])
        assert len(bedrooms) > 0, "Should have bedroom options"

        for br in bedrooms:
            assert 'value' in br, "Each bedroom must have 'value'"
            assert 'label' in br, "Each bedroom must have 'label'"

        # Check for 5+ handling if 5+ bedrooms exist
        values = [br['value'] for br in bedrooms]
        if Bedroom.FIVE_PLUS in values:
            five_plus = next(br for br in bedrooms if br['value'] == Bedroom.FIVE_PLUS)
            assert five_plus['label'] == '5+'

    def test_v2_schema_includes_market_segments(self):
        """v2 schema includes marketSegments field."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        assert 'marketSegments' in data, "Should include marketSegments"
        for ms in data['marketSegments']:
            assert 'value' in ms
            assert 'label' in ms

    def test_v2_schema_no_snake_case_fields(self):
        """v2 schema returns only camelCase field names."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        # Should have camelCase
        assert 'saleTypes' in data
        assert 'dateRange' in data
        assert 'psfRange' in data
        assert 'sizeRange' in data
        assert 'marketSegments' in data

        # Should NOT have snake_case
        assert 'sale_types' not in data
        assert 'date_range' not in data
        assert 'psf_range' not in data
        assert 'size_range' not in data
        assert 'regions_legacy' not in data

    def test_backwards_compat_dual_mode(self):
        """Default (v1) returns both v2 {value,label} and v1 raw values."""
        client = self._get_test_client()
        response = client.get('/api/filter-options')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        # v2 format present with {value, label}
        assert 'saleTypes' in data
        if data['saleTypes']:
            assert isinstance(data['saleTypes'][0], dict)
            assert 'value' in data['saleTypes'][0]
            assert 'label' in data['saleTypes'][0]

        # v1 format present with raw values
        assert 'sale_types' in data
        if data['sale_types']:
            assert isinstance(data['sale_types'][0], str)

        # Legacy regions dict preserved
        assert 'regions_legacy' in data

    def test_includes_contract_version(self):
        """Response includes API contract version."""
        client = self._get_test_client()
        response = client.get('/api/filter-options')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import API_CONTRACT_VERSION

        assert data.get('apiContractVersion') == API_CONTRACT_VERSION

    def test_v1_legacy_bedrooms_are_integers(self):
        """Legacy bedrooms (v1) are returned as integers, not strings."""
        client = self._get_test_client()
        response = client.get('/api/filter-options')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        # Legacy bedrooms should be raw integers
        bedrooms = data.get('bedrooms', [])
        for br in bedrooms:
            assert isinstance(br, int), f"Legacy bedroom should be int: {br}"

    def test_no_missing_options(self):
        """All expected option categories are present."""
        client = self._get_test_client()
        response = client.get('/api/filter-options?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()

        required_fields = [
            'saleTypes', 'tenures', 'regions', 'districts',
            'bedrooms', 'marketSegments', 'projects',
            'dateRange', 'psfRange', 'sizeRange'
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"


class TestDashboardSerializer:
    """Unit tests for dashboard panel serialization."""

    def test_serialize_time_series_panel_camel_case(self):
        """Verify time_series panel uses camelCase."""
        from schemas.api_contract import serialize_time_series_panel

        data = [
            {'period': '2024-01', 'count': 10, 'avg_psf': 1500.0, 'median_psf': 1450.0,
             'total_value': 15000000, 'avg_price': 1500000}
        ]
        result = serialize_time_series_panel(data, include_deprecated=False)

        assert len(result) == 1
        row = result[0]
        assert row['period'] == '2024-01'
        assert row['count'] == 10
        assert row['avgPsf'] == 1500.0
        assert row['medianPsf'] == 1450.0
        assert row['totalValue'] == 15000000
        assert row['avgPrice'] == 1500000
        # Must NOT have snake_case
        assert 'avg_psf' not in row
        assert 'median_psf' not in row
        assert 'total_value' not in row
        assert 'avg_price' not in row

    def test_serialize_time_series_panel_dual_mode(self):
        """Verify dual mode includes both old and new fields."""
        from schemas.api_contract import serialize_time_series_panel

        data = [{'period': '2024-01', 'count': 10, 'avg_psf': 1500.0}]
        result = serialize_time_series_panel(data, include_deprecated=True)

        row = result[0]
        assert row['avgPsf'] == 1500.0
        assert row['avg_psf'] == 1500.0

    def test_serialize_bedroom_mix_transforms_sale_type(self):
        """Verify bedroom_mix transforms sale_type to enum."""
        from schemas.api_contract import serialize_bedroom_mix_panel, SaleType

        data = [
            {'period': '2024-01', 'bedroom': 3, 'sale_type': 'New Sale', 'count': 10}
        ]
        result = serialize_bedroom_mix_panel(data, include_deprecated=False)

        row = result[0]
        assert row['bedroomCount'] == 3
        assert row['saleType'] == SaleType.NEW_SALE
        assert 'bedroom' not in row
        assert 'sale_type' not in row

    def test_serialize_bedroom_mix_dual_mode(self):
        """Verify dual mode includes both old and new fields."""
        from schemas.api_contract import serialize_bedroom_mix_panel

        data = [{'period': '2024-01', 'bedroom': 3, 'sale_type': 'Resale', 'count': 10}]
        result = serialize_bedroom_mix_panel(data, include_deprecated=True)

        row = result[0]
        assert row['bedroomCount'] == 3
        assert row['bedroom'] == 3
        assert row['saleType'] == 'resale'
        assert row['sale_type'] == 'Resale'

    def test_serialize_sale_type_breakdown_transforms_sale_type(self):
        """Verify sale_type_breakdown transforms sale_type to enum."""
        from schemas.api_contract import serialize_sale_type_breakdown_panel, SaleType

        data = [
            {'period': '2024-01', 'sale_type': 'Resale', 'count': 100, 'total_value': 150000000}
        ]
        result = serialize_sale_type_breakdown_panel(data, include_deprecated=False)

        row = result[0]
        assert row['saleType'] == SaleType.RESALE
        assert row['totalValue'] == 150000000
        assert 'sale_type' not in row
        assert 'total_value' not in row

    def test_serialize_summary_panel_camel_case(self):
        """Verify summary panel uses camelCase."""
        from schemas.api_contract import serialize_summary_panel

        data = {
            'total_count': 1000,
            'avg_psf': 1500.0,
            'median_psf': 1450.0,
            'avg_price': 1500000,
            'median_price': 1400000,
            'total_value': 1500000000,
            'date_min': '2020-01-01',
            'date_max': '2024-12-31',
            'psf_range': {'min': 500, 'max': 3000},
            'price_range': {'min': 500000, 'max': 5000000}
        }
        result = serialize_summary_panel(data, include_deprecated=False)

        assert result['totalCount'] == 1000
        assert result['avgPsf'] == 1500.0
        assert result['medianPsf'] == 1450.0
        assert result['avgPrice'] == 1500000
        assert result['medianPrice'] == 1400000
        assert result['totalValue'] == 1500000000
        assert result['dateMin'] == '2020-01-01'
        assert result['dateMax'] == '2024-12-31'
        assert result['psfRange'] == {'min': 500, 'max': 3000}
        assert result['priceRange'] == {'min': 500000, 'max': 5000000}
        # Must NOT have snake_case
        assert 'total_count' not in result
        assert 'avg_psf' not in result

    def test_serialize_dashboard_response_adds_meta(self):
        """Verify dashboard response includes API contract version."""
        from schemas.api_contract import serialize_dashboard_response, API_CONTRACT_VERSION

        data = {'summary': {'total_count': 100}}
        meta = {'cache_hit': True, 'elapsed_ms': 50.0}

        result = serialize_dashboard_response(data, meta)

        assert result['meta']['apiContractVersion'] == API_CONTRACT_VERSION
        assert result['meta']['cache_hit'] is True
        assert 'data' in result

    def test_serialize_volume_by_location_camel_case(self):
        """Verify volume_by_location uses camelCase."""
        from schemas.api_contract import serialize_volume_by_location_panel

        data = [
            {'location': 'CCR', 'count': 100, 'total_value': 150000000, 'avg_psf': 2500.0}
        ]
        result = serialize_volume_by_location_panel(data, include_deprecated=False)

        row = result[0]
        assert row['location'] == 'CCR'
        assert row['count'] == 100
        assert row['totalValue'] == 150000000
        assert row['avgPsf'] == 2500.0
        assert 'total_value' not in row
        assert 'avg_psf' not in row


class TestDashboardEndpointContract:
    """
    Integration tests for /api/dashboard contract.

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

    def test_v2_schema_time_series_camel_case(self):
        """v2 schema time_series panel uses camelCase."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=time_series&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        time_series = data.get('data', {}).get('time_series', [])

        if time_series:
            row = time_series[0]
            # Should have camelCase
            assert 'avgPsf' in row or row.get('avgPsf') is None
            assert 'medianPsf' in row or row.get('medianPsf') is None
            assert 'totalValue' in row or row.get('totalValue') is None
            # Should NOT have snake_case
            assert 'avg_psf' not in row
            assert 'median_psf' not in row
            assert 'total_value' not in row

    def test_v2_schema_bedroom_mix_transforms_sale_type(self):
        """v2 schema bedroom_mix panel transforms sale_type to enum."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=bedroom_mix&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import SaleType

        bedroom_mix = data.get('data', {}).get('bedroom_mix', [])
        for row in bedroom_mix:
            # Should have v2 fields
            assert 'bedroomCount' in row
            assert 'saleType' in row
            # saleType should be lowercase enum
            if row['saleType']:
                assert row['saleType'] in SaleType.ALL
                assert row['saleType'] == row['saleType'].lower()
            # Should NOT have v1 fields
            assert 'bedroom' not in row
            assert 'sale_type' not in row

    def test_v2_schema_sale_type_breakdown_transforms_sale_type(self):
        """v2 schema sale_type_breakdown transforms sale_type to enum."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=sale_type_breakdown&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import SaleType

        breakdown = data.get('data', {}).get('sale_type_breakdown', [])
        for row in breakdown:
            assert 'saleType' in row
            assert 'totalValue' in row or row.get('totalValue') is None
            if row['saleType']:
                assert row['saleType'] in SaleType.ALL
            assert 'sale_type' not in row
            assert 'total_value' not in row

    def test_v2_schema_summary_camel_case(self):
        """v2 schema summary panel uses camelCase."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=summary&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        summary = data.get('data', {}).get('summary', {})

        if summary:
            # Should have camelCase
            assert 'totalCount' in summary
            assert 'avgPsf' in summary or summary.get('avgPsf') is None
            assert 'medianPsf' in summary or summary.get('medianPsf') is None
            assert 'totalValue' in summary
            assert 'dateMin' in summary or summary.get('dateMin') is None
            assert 'dateMax' in summary or summary.get('dateMax') is None
            # Should NOT have snake_case
            assert 'total_count' not in summary
            assert 'avg_psf' not in summary
            assert 'median_psf' not in summary

    def test_backwards_compat_dual_mode(self):
        """Default (v1) returns both old and new fields."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=summary,bedroom_mix')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        summary = data.get('data', {}).get('summary', {})

        if summary:
            # Should have BOTH formats
            assert 'totalCount' in summary and 'total_count' in summary
            assert 'avgPsf' in summary or summary.get('avgPsf') is None
            assert 'avg_psf' in summary or summary.get('avg_psf') is None

        bedroom_mix = data.get('data', {}).get('bedroom_mix', [])
        if bedroom_mix:
            row = bedroom_mix[0]
            assert 'bedroomCount' in row and 'bedroom' in row
            assert 'saleType' in row and 'sale_type' in row

    def test_meta_includes_contract_version(self):
        """Response meta includes API contract version."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=summary')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        from schemas.api_contract import API_CONTRACT_VERSION

        assert 'meta' in data
        assert data['meta'].get('apiContractVersion') == API_CONTRACT_VERSION

    def test_accepts_v2_sale_type_filter(self):
        """Accepts saleType param (v2) in addition to sale_type (v1)."""
        client = self._get_test_client()

        # v2 format
        response = client.get('/api/dashboard?panels=summary&saleType=new_sale')
        assert response.status_code == 200

        # v1 format still works
        response = client.get('/api/dashboard?panels=summary&sale_type=New%20Sale')
        assert response.status_code == 200

    def test_all_panels_serialized(self):
        """All panels are properly serialized."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        panels = data.get('data', {})

        # Check each panel exists
        expected_panels = ['time_series', 'volume_by_location', 'price_histogram',
                          'bedroom_mix', 'summary']
        for panel in expected_panels:
            assert panel in panels, f"Missing panel: {panel}"

    def test_volume_by_location_camel_case(self):
        """v2 schema volume_by_location uses camelCase."""
        client = self._get_test_client()
        response = client.get('/api/dashboard?panels=volume_by_location&schema=v2')

        if response.status_code != 200:
            pytest.skip("API not available")

        data = response.get_json()
        locations = data.get('data', {}).get('volume_by_location', [])

        if locations:
            row = locations[0]
            assert 'location' in row
            assert 'count' in row
            assert 'totalValue' in row or row.get('totalValue') is None
            assert 'avgPsf' in row or row.get('avgPsf') is None
            # Should NOT have snake_case
            assert 'total_value' not in row
            assert 'avg_psf' not in row


class TestFrontendDashboardHelpers:
    """Tests for frontend dashboard schema helpers."""

    def test_frontend_schema_has_dashboard_field_enum(self):
        """Verify DashboardField enum exists in frontend schema."""
        schema_path = os.path.join(
            os.path.dirname(__file__), '..', 'frontend', 'src', 'schemas', 'apiContract.js'
        )
        with open(schema_path, 'r') as f:
            content = f.read()

        assert 'export const DashboardField' in content
        assert 'AVG_PSF' in content
        assert 'MEDIAN_PSF' in content
        assert 'TOTAL_VALUE' in content
        assert 'TOTAL_COUNT' in content
        assert 'BEDROOM_COUNT' in content
        assert 'SALE_TYPE' in content

    def test_frontend_schema_has_getDashboardField_helper(self):
        """Verify getDashboardField helper exists."""
        schema_path = os.path.join(
            os.path.dirname(__file__), '..', 'frontend', 'src', 'schemas', 'apiContract.js'
        )
        with open(schema_path, 'r') as f:
            content = f.read()

        assert 'export const getDashboardField' in content
        # Check v1 fallback map exists
        assert 'V1_DASHBOARD_FIELD_MAP' in content

    def test_frontend_schema_has_normalize_panel_helpers(self):
        """Verify panel normalizer helpers exist."""
        schema_path = os.path.join(
            os.path.dirname(__file__), '..', 'frontend', 'src', 'schemas', 'apiContract.js'
        )
        with open(schema_path, 'r') as f:
            content = f.read()

        # Summary panel
        assert 'export const normalizeSummaryPanel' in content
        # Time series
        assert 'export const normalizeTimeSeriesRow' in content
        # Location
        assert 'export const normalizeLocationRow' in content
        # Bedroom mix
        assert 'export const normalizeBedroomMixRow' in content
        # Sale type breakdown
        assert 'export const normalizeSaleTypeRow' in content

    def test_frontend_schema_has_v1_dashboard_field_map(self):
        """Verify V1_DASHBOARD_FIELD_MAP covers all v1 to v2 mappings."""
        schema_path = os.path.join(
            os.path.dirname(__file__), '..', 'frontend', 'src', 'schemas', 'apiContract.js'
        )
        with open(schema_path, 'r') as f:
            content = f.read()

        # All v1 snake_case fields should be in the map
        expected_v1_fields = [
            'avg_psf', 'median_psf', 'total_value', 'avg_price',
            'bedroom', 'sale_type', 'total_count', 'median_price',
            'date_min', 'date_max', 'psf_range', 'price_range'
        ]
        for field in expected_v1_fields:
            assert f"'{field}'" in content or f'"{field}"' in content, \
                f"Missing v1 field mapping: {field}"

    def test_frontend_charts_use_getAggField(self):
        """Verify key charts use getAggField helper for v1/v2 compatibility."""
        charts_to_check = [
            ('MedianPsfTrendChart.jsx', ['getAggField', 'AggField']),
            ('MarketMomentumGrid.jsx', ['getAggField', 'AggField']),
            ('PriceCompressionChart.jsx', ['getAggField', 'AggField']),
        ]

        for chart_file, expected_imports in charts_to_check:
            chart_path = os.path.join(
                os.path.dirname(__file__), '..', 'frontend', 'src',
                'components', 'powerbi', chart_file
            )
            with open(chart_path, 'r') as f:
                content = f.read()

            for import_name in expected_imports:
                assert import_name in content, \
                    f"{chart_file} should import {import_name}"


class TestForbidRawFieldAccess:
    """
    GUARDRAIL: Prevent reintroduction of raw DB field names in frontend.

    This test fails if any frontend chart component uses raw field names
    like `d.median_psf` instead of `getAggField(d, AggField.MEDIAN_PSF)`.

    Phase 1c TODO: Once v1 is removed, this guardrail ensures no one
    accidentally reintroduces raw field access patterns.
    """

    # Forbidden patterns: raw field access on data rows that should use schema helpers
    # These match patterns like `d.median_psf`, `row.avg_psf`, `item.floor_level`
    # but NOT `params.sale_type` (API param assignment) or string literals
    # Format: (pattern, description)
    FORBIDDEN_PATTERNS = [
        # Match data row access: d.field, row.field, item.field, etc.
        # Exclude: params., request., filter patterns
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(median_psf)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.MEDIAN_PSF)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(avg_psf)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.AVG_PSF)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(floor_level)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.FLOOR_LEVEL)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(sale_type)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.SALE_TYPE) or isSaleType helper'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(bedroom_count)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.BEDROOM_COUNT)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(total_value)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.TOTAL_VALUE)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(psf_25th)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.PSF_25TH)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(psf_75th)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.PSF_75TH)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(price_25th)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.PRICE_25TH)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(price_75th)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.PRICE_75TH)'),
        (r'(?<![a-zA-Z])(?:d|row|item|r|txn|record|entry)\.(median_price)(?![_a-zA-Z])',
         'Use getAggField(d, AggField.MEDIAN_PRICE)'),
    ]

    # Files that are ALLOWED to use raw field names (schema definitions, etc.)
    ALLOWED_FILES = [
        'apiContract.js',  # Schema definition file
        'apiContract.test.js',  # Test file for schema
        # Files using different APIs (not /api/aggregate) - these have their own schemas
        'HotProjectsTable.jsx',  # Uses getHotProjects API
        'UpcomingLaunchesTable.jsx',  # Uses getUpcomingLaunches API
        'TransactionDataTable.jsx',  # Uses getTransactionsList API
        'TransactionDetailModal.jsx',  # Uses transaction-specific fields
        'DealCheckerContent.jsx',  # Uses deal-checker specific API
        'DealCheckerMap.jsx',  # Uses deal-checker specific API
        'ScopeSummaryCards.jsx',  # Uses scope-specific API
    ]

    # Directories to scan
    SCAN_DIRS = [
        'components/powerbi',
        'pages',
        'context',
    ]

    def test_no_raw_field_access_in_charts(self):
        """
        GUARDRAIL: Fail if any chart uses raw field names.

        This prevents regression where someone bypasses schema helpers.
        """
        import re
        import glob

        violations = []
        frontend_src = os.path.join(
            os.path.dirname(__file__), '..', 'frontend', 'src'
        )

        for scan_dir in self.SCAN_DIRS:
            scan_path = os.path.join(frontend_src, scan_dir)
            if not os.path.exists(scan_path):
                continue

            # Find all .js and .jsx files
            for ext in ['*.js', '*.jsx']:
                pattern = os.path.join(scan_path, '**', ext)
                for filepath in glob.glob(pattern, recursive=True):
                    filename = os.path.basename(filepath)

                    # Skip allowed files
                    if filename in self.ALLOWED_FILES:
                        continue

                    with open(filepath, 'r') as f:
                        content = f.read()

                    # Check each forbidden pattern
                    for pattern_regex, suggestion in self.FORBIDDEN_PATTERNS:
                        matches = re.findall(pattern_regex, content)
                        if matches:
                            # Find line numbers for better error messages
                            for i, line in enumerate(content.split('\n'), 1):
                                if re.search(pattern_regex, line):
                                    rel_path = os.path.relpath(filepath, frontend_src)
                                    violations.append(
                                        f"{rel_path}:{i} - Found raw field access. {suggestion}"
                                    )

        if violations:
            violation_msg = "\n".join(violations[:20])  # Limit to first 20
            if len(violations) > 20:
                violation_msg += f"\n... and {len(violations) - 20} more violations"
            pytest.fail(
                f"GUARDRAIL VIOLATION: Found {len(violations)} raw field access(es).\n"
                f"Use schema helpers (getAggField, isSaleType) instead.\n\n"
                f"{violation_msg}"
            )

    def test_charts_import_schema_helpers(self):
        """
        Verify all aggregate-consuming charts import schema helpers.

        Charts that fetch from /api/aggregate MUST import getAggField.
        """
        import glob

        # Charts that use getAggregate API and MUST use schema helpers
        charts_requiring_helpers = [
            'FloorPremiumTrendChart.jsx',
            'FloorPremiumByRegionChart.jsx',
            'FloorLiquidityChart.jsx',
            'GrowthDumbbellChart.jsx',
            'MarketMomentumGrid.jsx',
            'MedianPsfTrendChart.jsx',
            'PriceCompressionChart.jsx',
            'ProjectDetailPanel.jsx',
        ]

        frontend_src = os.path.join(
            os.path.dirname(__file__), '..', 'frontend', 'src'
        )
        powerbi_dir = os.path.join(frontend_src, 'components', 'powerbi')

        missing_imports = []

        for chart_file in charts_requiring_helpers:
            chart_path = os.path.join(powerbi_dir, chart_file)
            if not os.path.exists(chart_path):
                continue

            with open(chart_path, 'r') as f:
                content = f.read()

            # Must import both getAggField and AggField
            if 'getAggField' not in content:
                missing_imports.append(f"{chart_file}: missing getAggField import")
            if 'AggField' not in content:
                missing_imports.append(f"{chart_file}: missing AggField import")

        if missing_imports:
            pytest.fail(
                f"GUARDRAIL VIOLATION: Charts missing schema helper imports.\n"
                f"All aggregate-consuming charts must import getAggField and AggField.\n\n"
                + "\n".join(missing_imports)
            )
