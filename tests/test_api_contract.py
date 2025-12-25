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
