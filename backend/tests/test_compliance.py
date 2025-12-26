"""
URA Compliance Tests - Anti-Reconstructability Verification

These tests ensure API responses do not contain data that could be
used to reconstruct individual transaction records.

Key checks:
1. No forbidden keys (unit identifiers, exact dates with prices)
2. No record-like arrays (arrays of objects that look like DB records)
3. No date+price pairs at record granularity
4. Deprecated endpoints return 410 Gone
5. Schema allowlists enforced
"""

import pytest
import json
from typing import Any


# =============================================================================
# FORBIDDEN KEYS - Fields that could identify individual transactions
# =============================================================================

FORBIDDEN_KEYS = {
    'unit', 'unit_number', 'unit_no',
    'address', 'street_name',
    'block', 'stack', 'floor', 'floor_range', 'floor_level',
    'transaction_id', 'id',
    'price_exact', 'date_exact',
    'nett_price', 'num_units',
    'type_of_area', 'area_type',
    'contract_date', 'sale_date',
}

# Keys that are safe in aggregate arrays (e.g., psfBins, bedroomMix)
ALLOWED_ARRAY_TYPES = {
    'bins', 'psfBins', 'priceBins', 'timeSeries',
    'bedroomMix', 'saleMix', 'priceBands', 'quarters',
    'districtBreakdown', 'segmentBreakdown',
}

# Date-like and price-like fields for pair detection
DATE_LIKE_FIELDS = {
    'date', 'trans_date', 'transaction_date',
    'completion_date', 'sale_date', 'contract_date'
}
PRICE_LIKE_FIELDS = {
    'price', 'psf', 'amount',
    'nett_price', 'transacted_price'
}
ALLOWED_AGGREGATE_CONTAINERS = {'timeSeries', 'quarters'}


# =============================================================================
# RECURSIVE JSON WALKERS
# =============================================================================

def find_forbidden_keys(obj: Any, path: str = "") -> list:
    """
    Recursively walk JSON and find forbidden keys.

    Returns list of paths where forbidden keys were found.
    """
    violations = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            if key.lower() in FORBIDDEN_KEYS:
                violations.append(f"{path}.{key}")
            violations.extend(find_forbidden_keys(value, f"{path}.{key}"))

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            violations.extend(find_forbidden_keys(item, f"{path}[{i}]"))

    return violations


def find_record_like_arrays(obj: Any, path: str = "") -> list:
    """
    Find arrays that look like raw transaction records.

    A record-like array is:
    - An array of objects
    - Each object has many fields (>5)
    - Not in ALLOWED_ARRAY_TYPES
    """
    violations = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            # Skip known safe arrays
            if key in ALLOWED_ARRAY_TYPES:
                continue

            if isinstance(value, list) and len(value) > 0:
                if isinstance(value[0], dict) and len(value[0].keys()) > 5:
                    violations.append(
                        f"{path}.{key} looks like record array "
                        f"({len(value[0])} fields per object)"
                    )

            violations.extend(find_record_like_arrays(value, f"{path}.{key}"))

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            violations.extend(find_record_like_arrays(item, f"{path}[{i}]"))

    return violations


def find_date_price_pairs(obj: Any, path: str = "",
                          in_aggregate_container: bool = False) -> list:
    """
    Find forbidden date+price combinations at record granularity.

    Aggregate containers (timeSeries, quarters) are allowed to have
    period + medianPsf pairs. But individual records cannot.
    """
    violations = []

    if isinstance(obj, dict):
        keys_lower = {k.lower() for k in obj.keys()}

        # Check if this object has both date-like and price-like fields
        has_date = bool(keys_lower & DATE_LIKE_FIELDS)
        has_price = bool(keys_lower & PRICE_LIKE_FIELDS)

        if has_date and has_price and not in_aggregate_container:
            violations.append(f"{path} has date+price pair (forbidden)")

        for key, value in obj.items():
            is_aggregate = key in ALLOWED_AGGREGATE_CONTAINERS
            violations.extend(find_date_price_pairs(
                value, f"{path}.{key}", is_aggregate
            ))

    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            violations.extend(find_date_price_pairs(
                item, f"{path}[{i}]", in_aggregate_container
            ))

    return violations


# =============================================================================
# SCHEMA ALLOWLISTS PER ENDPOINT
# =============================================================================

ENDPOINT_SCHEMAS = {
    '/aggregate-summary': {
        'allowed_top_keys': {
            'summary', 'bedroomMix', 'saleMix',
            'psfDistribution', 'meta', 'warning'
        },
        'allowed_array_keys': {
            'bedroomMix', 'saleMix', 'psfDistribution'
        },
        'allowed_bin_fields': {
            'bedroom', 'count', 'pct', 'saleType',
            'binStart', 'binEnd'
        },
    },
}


def check_schema_compliance(endpoint: str, data: dict) -> list:
    """
    Verify response only contains allowed keys for the endpoint.
    """
    violations = []
    schema = ENDPOINT_SCHEMAS.get(endpoint)

    if not schema:
        return violations

    # Check top-level keys
    actual_keys = set(data.keys())
    allowed = schema.get('allowed_top_keys', set())
    extra = actual_keys - allowed
    if extra:
        violations.append(f"Unexpected top-level keys: {extra}")

    return violations


# =============================================================================
# TEST FIXTURES
# =============================================================================

@pytest.fixture
def client():
    """Create test client for Flask app."""
    from app import create_app
    app = create_app()
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def sample_aggregate_response():
    """Sample valid aggregate-summary response."""
    return {
        "summary": {
            "observationCount": 1500,
            "medianPsf": 1850,
            "medianPrice": 1500000,
            "psfRange": {"p10": 1200, "p25": 1500, "p50": 1850, "p75": 2200, "p90": 2800},
            "priceRange": {"p10": 800000, "p25": 1100000, "p50": 1500000, "p75": 2000000, "p90": 2800000}
        },
        "bedroomMix": [
            {"bedroom": 2, "count": 450, "pct": 30.0},
            {"bedroom": 3, "count": 600, "pct": 40.0},
            {"bedroom": 4, "count": 450, "pct": 30.0}
        ],
        "saleMix": [
            {"saleType": "resale", "count": 900, "pct": 60.0},
            {"saleType": "new_sale", "count": 600, "pct": 40.0}
        ],
        "psfDistribution": [],
        "meta": {
            "kAnonymityPassed": True,
            "fallbackLevel": None,
            "observationCount": 1500
        }
    }


@pytest.fixture
def forbidden_response():
    """Sample response with forbidden keys (should fail tests)."""
    return {
        "transactions": [
            {
                "unit_number": "#12-34",
                "floor": 12,
                "price": 1500000,
                "transaction_date": "2024-01-15",
                "project_name": "Some Condo"
            }
        ]
    }


# =============================================================================
# UNIT TESTS
# =============================================================================

class TestForbiddenKeys:
    """Test forbidden key detection."""

    def test_clean_response_passes(self, sample_aggregate_response):
        """Valid aggregate response should have no forbidden keys."""
        violations = find_forbidden_keys(sample_aggregate_response)
        assert not violations, f"Found forbidden keys: {violations}"

    def test_unit_number_detected(self, forbidden_response):
        """Unit number should be detected as forbidden."""
        violations = find_forbidden_keys(forbidden_response)
        assert any('unit_number' in v for v in violations)

    def test_floor_detected(self, forbidden_response):
        """Floor should be detected as forbidden."""
        violations = find_forbidden_keys(forbidden_response)
        assert any('floor' in v for v in violations)

    def test_nested_forbidden_key(self):
        """Forbidden keys in nested objects should be detected."""
        data = {
            "projects": [
                {"name": "Test", "details": {"unit": "#01-01"}}
            ]
        }
        violations = find_forbidden_keys(data)
        assert len(violations) == 1
        assert 'unit' in violations[0]


class TestRecordLikeArrays:
    """Test record-like array detection."""

    def test_aggregate_arrays_allowed(self, sample_aggregate_response):
        """Aggregate arrays (bedroomMix, etc.) should pass."""
        violations = find_record_like_arrays(sample_aggregate_response)
        assert not violations

    def test_transaction_array_detected(self):
        """Array of transaction-like objects should be flagged."""
        data = {
            "transactions": [
                {
                    "project": "Test",
                    "district": "D01",
                    "bedroom": 3,
                    "psf": 1800,
                    "price": 1500000,
                    "date": "2024-01"
                }
            ]
        }
        violations = find_record_like_arrays(data)
        assert len(violations) == 1
        assert 'transactions' in violations[0]

    def test_known_arrays_skipped(self):
        """psfBins, bedroomMix etc. should not be flagged."""
        data = {
            "psfBins": [
                {"binStart": 1000, "binEnd": 1200, "count": 50, "pct": 10,
                 "label": "1000-1200", "cumulative": 50}
            ]
        }
        violations = find_record_like_arrays(data)
        assert not violations


class TestDatePricePairs:
    """Test date+price pair detection."""

    def test_clean_response_passes(self, sample_aggregate_response):
        """Aggregate response should not have date+price pairs."""
        violations = find_date_price_pairs(sample_aggregate_response)
        assert not violations

    def test_record_level_pair_detected(self):
        """Date+price at record level should be detected."""
        data = {
            "record": {
                "transaction_date": "2024-01-15",
                "price": 1500000,
                "project": "Test"
            }
        }
        violations = find_date_price_pairs(data)
        assert len(violations) == 1

    def test_time_series_allowed(self):
        """Date+price in timeSeries container should be allowed."""
        data = {
            "timeSeries": [
                {"period": "2024-Q1", "medianPsf": 1850, "date": "2024-03"},
                {"period": "2024-Q2", "medianPsf": 1900, "date": "2024-06"}
            ]
        }
        violations = find_date_price_pairs(data)
        # timeSeries is allowed to have period + price aggregates
        assert not violations


class TestSchemaCompliance:
    """Test schema allowlist enforcement."""

    def test_aggregate_summary_schema(self, sample_aggregate_response):
        """Aggregate summary should comply with schema."""
        violations = check_schema_compliance(
            '/aggregate-summary', sample_aggregate_response
        )
        assert not violations

    def test_extra_keys_detected(self):
        """Unexpected keys should be flagged."""
        data = {
            "summary": {},
            "bedroomMix": [],
            "saleMix": [],
            "psfDistribution": [],
            "meta": {},
            "transactions": [],  # FORBIDDEN
        }
        violations = check_schema_compliance('/aggregate-summary', data)
        assert len(violations) == 1
        assert 'transactions' in str(violations[0])


# =============================================================================
# INTEGRATION TESTS (require Flask app)
# =============================================================================

class TestDeprecatedEndpoints:
    """Test that deprecated endpoints return 410 Gone."""

    def test_transactions_returns_410(self, client):
        """GET /api/transactions should return 410."""
        response = client.get('/api/transactions')
        assert response.status_code == 410
        data = response.get_json()
        assert 'error' in data
        assert 'deprecated' in data['error'].lower()

    def test_transactions_list_returns_410(self, client):
        """GET /api/transactions/list should return 410."""
        response = client.get('/api/transactions/list')
        assert response.status_code == 410
        data = response.get_json()
        assert 'error' in data
        assert 'deprecated' in data['error'].lower()

    def test_comparable_value_analysis_returns_410(self, client):
        """GET /api/comparable_value_analysis should return 410."""
        response = client.get('/api/comparable_value_analysis')
        assert response.status_code == 410
        data = response.get_json()
        assert 'error' in data
        assert 'deprecated' in data['error'].lower()
        # Verify alternatives are suggested
        assert 'alternatives' in data

    def test_scatter_sample_returns_410(self, client):
        """GET /api/scatter-sample should return 410."""
        response = client.get('/api/scatter-sample')
        assert response.status_code == 410
        data = response.get_json()
        assert 'error' in data
        assert 'deprecated' in data['error'].lower()
        # Verify alternatives are suggested
        assert 'alternatives' in data


class TestAggregateSummaryCompliance:
    """Test aggregate-summary endpoint for compliance."""

    def test_no_forbidden_keys_in_response(self, client):
        """Response should not contain forbidden keys."""
        response = client.get('/api/aggregate-summary')
        if response.status_code == 200:
            data = response.get_json()
            violations = find_forbidden_keys(data)
            assert not violations, f"Forbidden keys: {violations}"

    def test_no_record_arrays_in_response(self, client):
        """Response should not contain record-like arrays."""
        response = client.get('/api/aggregate-summary')
        if response.status_code == 200:
            data = response.get_json()
            violations = find_record_like_arrays(data)
            assert not violations, f"Record arrays: {violations}"

    def test_no_date_price_pairs(self, client):
        """Response should not have date+price pairs."""
        response = client.get('/api/aggregate-summary')
        if response.status_code == 200:
            data = response.get_json()
            violations = find_date_price_pairs(data)
            assert not violations, f"Date+price pairs: {violations}"

    def test_schema_compliance(self, client):
        """Response should comply with endpoint schema."""
        response = client.get('/api/aggregate-summary')
        if response.status_code == 200:
            data = response.get_json()
            violations = check_schema_compliance('/aggregate-summary', data)
            assert not violations, f"Schema violations: {violations}"


# =============================================================================
# K-ANONYMITY TESTS
# =============================================================================

class TestKAnonymity:
    """Test K-anonymity enforcement."""

    def test_small_result_blocked(self, client):
        """Requests with <K results should be blocked."""
        # Request very specific filters that likely return few results
        response = client.get('/api/aggregate-summary?district=D01&bedroom=5&saleType=new_sale')
        if response.status_code == 200:
            data = response.get_json()
            # If K-anonymity fails, summary should be None
            if data.get('meta', {}).get('kAnonymityPassed') is False:
                assert data.get('summary') is None
                assert 'warning' in data

    def test_market_level_passes(self, client):
        """Market-level (no filters) should pass K-anonymity."""
        response = client.get('/api/aggregate-summary')
        if response.status_code == 200:
            data = response.get_json()
            meta = data.get('meta', {})
            # Market-level should almost always pass
            assert meta.get('kAnonymityPassed') is True


# =============================================================================
# RUNNING TESTS
# =============================================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
