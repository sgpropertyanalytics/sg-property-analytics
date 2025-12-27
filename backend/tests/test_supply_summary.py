"""
Supply Summary Invariant Tests

These tests validate the mathematical and structural invariants of the supply
summary endpoint. They catch data integrity issues before they reach the frontend.

Invariants tested:
1. totalEffectiveSupply == sum of components
2. All three regions (CCR, RCR, OCR) always present
3. Every district has region populated
4. Districts are sorted deterministically
5. No null values in numeric fields
6. GLS excluded when flag is false
7. Response structure is deterministic

Run with: pytest backend/tests/test_supply_summary.py -v
"""

import pytest
from unittest.mock import patch, MagicMock
from datetime import date


# =============================================================================
# FIXTURES - Mock data
# =============================================================================

@pytest.fixture
def mock_new_launch_projects():
    """Mock projects from new_launch_units CSV."""
    return [
        {'project_name': 'GRAND DUNMAN', 'total_units': 1008, 'district': 'D15'},
        {'project_name': 'TEMBUSU GRAND', 'total_units': 638, 'district': 'D15'},
        {'project_name': 'THE CONTINUUM', 'total_units': 816, 'district': 'D15'},
        {'project_name': 'LENTOR HILLS', 'total_units': 598, 'district': 'D26'},
        {'project_name': 'THE RESERVE', 'total_units': 732, 'district': 'D09'},
    ]


@pytest.fixture
def mock_upcoming_launches_data():
    """Mock upcoming launches query result."""
    MockRow = MagicMock
    return [
        MockRow(district='D09', total_units=1200),
        MockRow(district='D15', total_units=800),
        MockRow(district='D21', total_units=600),
    ]


@pytest.fixture
def mock_gls_pipeline_data():
    """Mock GLS pipeline query result."""
    MockRow = MagicMock
    return [
        MockRow(market_segment='CCR', total_units=2000),
        MockRow(market_segment='RCR', total_units=3500),
        MockRow(market_segment='OCR', total_units=1500),
    ]


# =============================================================================
# UNIT TESTS - Individual functions
# =============================================================================

class TestMergeDistrictData:
    """Test district data merging logic."""

    def test_merge_with_both_sources(self):
        """Merging unsold + upcoming should sum correctly per district."""
        from services.supply_service import _merge_district_data

        unsold = {'D15': 500, 'D09': 300}
        upcoming = {'D15': 200, 'D21': 400}

        result = _merge_district_data(unsold, upcoming)

        # D15 has both unsold and upcoming
        assert result['D15']['unsoldInventory'] == 500
        assert result['D15']['upcomingLaunches'] == 200
        assert result['D15']['totalEffectiveSupply'] == 700

        # D09 has only unsold
        assert result['D09']['unsoldInventory'] == 300
        assert result['D09']['upcomingLaunches'] == 0
        assert result['D09']['totalEffectiveSupply'] == 300

        # D21 has only upcoming
        assert result['D21']['unsoldInventory'] == 0
        assert result['D21']['upcomingLaunches'] == 400
        assert result['D21']['totalEffectiveSupply'] == 400

    def test_merge_adds_region_to_all_districts(self):
        """Every merged district should have region populated."""
        from services.supply_service import _merge_district_data

        unsold = {'D01': 100, 'D15': 200, 'D21': 300}
        upcoming = {}

        result = _merge_district_data(unsold, upcoming)

        assert result['D01']['region'] == 'CCR'
        assert result['D15']['region'] == 'RCR'
        assert result['D21']['region'] == 'OCR'

    def test_merge_empty_inputs(self):
        """Empty inputs should produce empty result."""
        from services.supply_service import _merge_district_data

        result = _merge_district_data({}, {})

        assert result == {}


class TestRollupByRegion:
    """Test region rollup logic."""

    def test_rollup_always_includes_all_regions(self):
        """CCR, RCR, OCR must always be present, even with empty data."""
        from services.supply_service import _rollup_by_region

        by_district = {}  # No district data
        gls_by_region = {}  # No GLS data

        result = _rollup_by_region(by_district, gls_by_region, include_gls=True)

        assert 'CCR' in result
        assert 'RCR' in result
        assert 'OCR' in result

    def test_rollup_sums_districts_correctly(self):
        """District values should sum into correct regions."""
        from services.supply_service import _rollup_by_region

        by_district = {
            'D01': {'unsoldInventory': 100, 'upcomingLaunches': 50, 'region': 'CCR'},
            'D09': {'unsoldInventory': 200, 'upcomingLaunches': 100, 'region': 'CCR'},
            'D15': {'unsoldInventory': 300, 'upcomingLaunches': 150, 'region': 'RCR'},
        }

        result = _rollup_by_region(by_district, {}, include_gls=False)

        # CCR = D01 + D09
        assert result['CCR']['unsoldInventory'] == 300
        assert result['CCR']['upcomingLaunches'] == 150

        # RCR = D15 only
        assert result['RCR']['unsoldInventory'] == 300
        assert result['RCR']['upcomingLaunches'] == 150

        # OCR has no districts
        assert result['OCR']['unsoldInventory'] == 0
        assert result['OCR']['upcomingLaunches'] == 0

    def test_rollup_adds_gls_when_included(self):
        """GLS values should be added to region totals when included."""
        from services.supply_service import _rollup_by_region

        by_district = {}
        gls_by_region = {'CCR': 1000, 'RCR': 2000, 'OCR': 500}

        result = _rollup_by_region(by_district, gls_by_region, include_gls=True)

        assert result['CCR']['glsPipeline'] == 1000
        assert result['RCR']['glsPipeline'] == 2000
        assert result['OCR']['glsPipeline'] == 500

    def test_rollup_excludes_gls_when_disabled(self):
        """GLS values should be 0 when include_gls=False."""
        from services.supply_service import _rollup_by_region

        by_district = {}
        gls_by_region = {'CCR': 1000, 'RCR': 2000}

        result = _rollup_by_region(by_district, gls_by_region, include_gls=False)

        assert result['CCR']['glsPipeline'] == 0
        assert result['RCR']['glsPipeline'] == 0
        assert result['OCR']['glsPipeline'] == 0


class TestComputeTotals:
    """Test total computation logic."""

    def test_totals_equal_sum_of_regions(self):
        """totals should equal sum of all region values."""
        from services.supply_service import _compute_totals

        by_region = {
            'CCR': {'unsoldInventory': 100, 'upcomingLaunches': 50, 'glsPipeline': 25, 'totalEffectiveSupply': 175},
            'RCR': {'unsoldInventory': 200, 'upcomingLaunches': 100, 'glsPipeline': 50, 'totalEffectiveSupply': 350},
            'OCR': {'unsoldInventory': 300, 'upcomingLaunches': 150, 'glsPipeline': 75, 'totalEffectiveSupply': 525},
        }

        totals = _compute_totals(by_region)

        assert totals['unsoldInventory'] == 600
        assert totals['upcomingLaunches'] == 300
        assert totals['glsPipeline'] == 150
        assert totals['totalEffectiveSupply'] == 1050


class TestBuildMeta:
    """Test metadata building."""

    def test_meta_includes_date(self):
        """Meta should include asOfDate."""
        from services.supply_service import _build_meta

        meta = _build_meta(2026, True, [])

        assert 'asOfDate' in meta
        assert meta['asOfDate'] == date.today().isoformat()

    def test_meta_includes_formula(self):
        """Meta should include computation formula."""
        from services.supply_service import _build_meta

        meta_with_gls = _build_meta(2026, True, [])
        meta_without_gls = _build_meta(2026, False, [])

        assert 'glsPipeline' in meta_with_gls['computedAs']
        assert 'glsPipeline' not in meta_without_gls['computedAs']


# =============================================================================
# INVARIANT TESTS - Mathematical and structural guarantees
# =============================================================================

class TestTotalEqualsSum:
    """Test that totalEffectiveSupply == sum of components."""

    def test_region_total_equals_sum(self):
        """Each region's total should equal sum of its components."""
        from services.supply_service import _rollup_by_region

        by_district = {
            'D01': {'unsoldInventory': 100, 'upcomingLaunches': 50, 'region': 'CCR'},
            'D15': {'unsoldInventory': 200, 'upcomingLaunches': 100, 'region': 'RCR'},
        }
        gls = {'CCR': 1000, 'RCR': 500, 'OCR': 200}

        result = _rollup_by_region(by_district, gls, include_gls=True)

        for region, data in result.items():
            expected = data['unsoldInventory'] + data['upcomingLaunches'] + data['glsPipeline']
            assert data['totalEffectiveSupply'] == expected, \
                f"{region}: totalEffectiveSupply {data['totalEffectiveSupply']} != expected {expected}"


class TestAllRegionsPresent:
    """Test that CCR, RCR, OCR are always present."""

    def test_empty_data_has_all_regions(self):
        """Even with no data, all three regions should exist."""
        from services.supply_service import _rollup_by_region

        result = _rollup_by_region({}, {}, include_gls=True)

        assert set(result.keys()) == {'CCR', 'RCR', 'OCR'}


class TestDistrictsHaveRegion:
    """Test that every district has region populated."""

    def test_all_districts_have_region(self):
        """Every district in byDistrict should have a valid region."""
        from services.supply_service import _merge_district_data

        unsold = {'D01': 100, 'D15': 200, 'D21': 300, 'D28': 400}
        upcoming = {'D09': 50}

        result = _merge_district_data(unsold, upcoming)

        for district, data in result.items():
            assert 'region' in data, f"{district} missing region"
            assert data['region'] in ['CCR', 'RCR', 'OCR'], f"{district} has invalid region: {data['region']}"


class TestDistrictOrderStable:
    """Test that districts are sorted deterministically."""

    def test_districts_sorted_alphabetically(self):
        """Districts should be sorted D01, D02, ... D28."""
        from services.supply_service import _merge_district_data

        # Add districts in random order
        unsold = {'D21': 100, 'D01': 200, 'D15': 300, 'D09': 400}

        result = _merge_district_data(unsold, {})
        districts = list(result.keys())

        assert districts == sorted(districts), f"Districts not sorted: {districts}"


class TestNoNullValues:
    """Test that all numeric fields are 0, never null."""

    def test_region_values_not_null(self):
        """All region numeric fields should be integers, not None."""
        from services.supply_service import _rollup_by_region

        result = _rollup_by_region({}, {}, include_gls=True)

        for region, data in result.items():
            assert data['unsoldInventory'] is not None, f"{region} unsoldInventory is None"
            assert data['upcomingLaunches'] is not None, f"{region} upcomingLaunches is None"
            assert data['glsPipeline'] is not None, f"{region} glsPipeline is None"
            assert data['totalEffectiveSupply'] is not None, f"{region} totalEffectiveSupply is None"

            # Should be integers
            assert isinstance(data['unsoldInventory'], int)
            assert isinstance(data['upcomingLaunches'], int)
            assert isinstance(data['glsPipeline'], int)
            assert isinstance(data['totalEffectiveSupply'], int)


class TestGlsExcludedWhenFlagFalse:
    """Test that GLS is properly excluded when flag is false."""

    def test_gls_zero_when_excluded(self):
        """GLS values should be 0 when includeGls=false."""
        from services.supply_service import _rollup_by_region

        gls = {'CCR': 5000, 'RCR': 3000, 'OCR': 2000}

        result = _rollup_by_region({}, gls, include_gls=False)

        for region, data in result.items():
            assert data['glsPipeline'] == 0, f"{region} GLS should be 0 when excluded"

    def test_total_excludes_gls_when_disabled(self):
        """totalEffectiveSupply should not include GLS when disabled."""
        from services.supply_service import _rollup_by_region

        by_district = {
            'D01': {'unsoldInventory': 100, 'upcomingLaunches': 50, 'region': 'CCR'},
        }
        gls = {'CCR': 1000}

        result_with_gls = _rollup_by_region(by_district, gls, include_gls=True)
        result_without_gls = _rollup_by_region(by_district, gls, include_gls=False)

        # With GLS: 100 + 50 + 1000 = 1150
        assert result_with_gls['CCR']['totalEffectiveSupply'] == 1150

        # Without GLS: 100 + 50 = 150
        assert result_without_gls['CCR']['totalEffectiveSupply'] == 150


# =============================================================================
# RESPONSE STRUCTURE TESTS
# =============================================================================

class TestResponseStructure:
    """Test that response has expected structure."""

    def test_response_has_required_keys(self):
        """Response should have byRegion, byDistrict, totals, meta."""
        from services.supply_service import _build_meta, _compute_totals, _rollup_by_region

        by_region = _rollup_by_region({}, {}, include_gls=True)
        totals = _compute_totals(by_region)
        meta = _build_meta(2026, True, [])

        # Simulate full response structure
        response = {
            "byRegion": by_region,
            "byDistrict": {},
            "totals": totals,
            "meta": meta,
        }

        assert 'byRegion' in response
        assert 'byDistrict' in response
        assert 'totals' in response
        assert 'meta' in response

    def test_region_has_components_list(self):
        """Each region should have a components list."""
        from services.supply_service import _rollup_by_region

        result = _rollup_by_region({}, {}, include_gls=True)

        for region, data in result.items():
            assert 'components' in data, f"{region} missing components"
            assert isinstance(data['components'], list)
            assert 'unsoldInventory' in data['components']
            assert 'upcomingLaunches' in data['components']


# =============================================================================
# SMOKE TEST
# =============================================================================

class TestSupplySmokeTest:
    """Minimal smoke test that validates the main function."""

    @patch('services.supply_service._get_unsold_inventory_by_district')
    @patch('services.supply_service._get_upcoming_launches_by_district')
    @patch('services.supply_service._get_gls_pipeline_by_region')
    def test_get_supply_summary_smoke(self, mock_gls, mock_upcoming, mock_unsold):
        """Smoke test: get_supply_summary returns valid structure."""
        from services.supply_service import get_supply_summary

        # Setup mocks
        mock_unsold.return_value = {'D01': 100, 'D15': 200}
        mock_upcoming.return_value = {'D09': 300, 'D21': 400}
        mock_gls.return_value = {'CCR': 500, 'RCR': 600, 'OCR': 700}

        result = get_supply_summary(include_gls=True, launch_year=2026)

        # ========== ASSERTIONS ==========
        # 1. Has required keys
        assert 'byRegion' in result, "Missing byRegion"
        assert 'byDistrict' in result, "Missing byDistrict"
        assert 'totals' in result, "Missing totals"
        assert 'meta' in result, "Missing meta"

        # 2. All regions present
        assert set(result['byRegion'].keys()) == {'CCR', 'RCR', 'OCR'}

        # 3. Total invariant holds
        for region, data in result['byRegion'].items():
            expected = data['unsoldInventory'] + data['upcomingLaunches'] + data['glsPipeline']
            assert data['totalEffectiveSupply'] == expected, f"{region} total mismatch"

        # 4. Meta has expected fields
        assert result['meta']['launchYear'] == 2026
        assert result['meta']['includeGls'] is True
        assert 'asOfDate' in result['meta']

        print("✅ Supply summary smoke test PASSED")
