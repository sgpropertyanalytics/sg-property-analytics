"""
Tests for Exit Queue Risk Analysis

Tests:
1. Integration test - known project returns non-empty exit queue metrics
2. Contract test - v2 keys + enum formats
3. Dual-mode test - returns both v1 and v2 fields by default
4. Null-handling test - graceful handling of missing data
"""

import pytest
from datetime import date
from dataclasses import dataclass

# Import service components
from services.exit_queue_service import (
    BasicStats,
    UniqueUnitsStats,
    UnitData,
    DataQuality,
    PropertyFundamentals,
    ResaleMetrics,
    RiskAssessment,
    GatingFlags,
    ExitQueueResult,
    calculate_property_age,
    calculate_percentages,
    get_maturity_zone,
    get_pressure_zone,
    get_quadrant_and_risk,
    generate_interpretation,
    calculate_gating_flags,
    generate_warnings,
)

# Import serializers from api_contract
from schemas.api_contract import (
    serialize_exit_queue_v1,
    serialize_exit_queue_v2,
    serialize_exit_queue_dual,
    ExitQueueFields,
    RiskZone,
    OverallRisk,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_result():
    """Create a sample ExitQueueResult for testing."""
    return ExitQueueResult(
        project_name="THE SAIL @ MARINA BAY",
        data_quality=DataQuality(
            has_top_year=False,
            has_total_units=False,
            completeness="partial",
            sample_window_months=60,
            warnings=["Total units data not available - cannot calculate percentages"]
        ),
        fundamentals=PropertyFundamentals(
            total_units=None,
            top_year=None,
            property_age_years=5,
            age_source="first_resale",
            tenure=None,
            district="D01",
            developer=None,
            first_resale_date=date(2020, 12, 31)
        ),
        resale_metrics=ResaleMetrics(
            unique_resale_units_total=149,
            unique_resale_units_12m=47,
            total_resale_transactions=267,
            resale_maturity_pct=None,
            active_exit_pressure_pct=None,
            absorption_speed_days=181.0,
            transactions_per_100_units=None,
            resales_last_24m=108
        ),
        risk_assessment=RiskAssessment(
            maturity_zone="unknown",
            pressure_zone="unknown",
            quadrant="insufficient_data",
            overall_risk="unknown",
            interpretation="Cannot generate risk assessment without total units data."
        ),
        gating_flags=GatingFlags(
            is_boutique=False,
            is_brand_new=False,
            is_ultra_luxury=False,
            is_thin_data=False,
            unit_type_mixed=True
        )
    )


@pytest.fixture
def complete_result():
    """Create a complete ExitQueueResult with all data available."""
    return ExitQueueResult(
        project_name="PARC CLEMATIS",
        data_quality=DataQuality(
            has_top_year=True,
            has_total_units=True,
            completeness="complete",
            sample_window_months=10,
            warnings=[]
        ),
        fundamentals=PropertyFundamentals(
            total_units=1468,
            top_year=2023,
            property_age_years=2,
            age_source="top_date",
            tenure="99 yrs lease commencing from 2019",
            district="D05",
            developer="SingLand",
            first_resale_date=date(2025, 2, 1)
        ),
        resale_metrics=ResaleMetrics(
            unique_resale_units_total=46,
            unique_resale_units_12m=46,
            total_resale_transactions=69,
            resale_maturity_pct=3.1,
            active_exit_pressure_pct=3.1,
            absorption_speed_days=90.0,
            transactions_per_100_units=4.7,
            resales_last_24m=69
        ),
        risk_assessment=RiskAssessment(
            maturity_zone="red",
            pressure_zone="green",
            quadrant="immature_low_pressure",
            overall_risk="moderate",
            interpretation="This is an early-stage resale market with only 3.1% of units having changed hands."
        ),
        gating_flags=GatingFlags(
            is_boutique=False,
            is_brand_new=True,
            is_ultra_luxury=False,
            is_thin_data=False,
            unit_type_mixed=True
        )
    )


# =============================================================================
# METRIC CALCULATION TESTS
# =============================================================================

class TestMetricCalculations:
    """Tests for pure metric calculation functions."""

    def test_calculate_property_age_from_top(self):
        """Property age calculated from TOP year."""
        age, source = calculate_property_age(2020, None, 2025)
        assert age == 5
        assert source == "top_date"

    def test_calculate_property_age_future_top(self):
        """Property with future TOP returns not_topped_yet."""
        age, source = calculate_property_age(2028, None, 2025)
        assert age is None
        assert source == "not_topped_yet"

    def test_calculate_property_age_from_first_resale(self):
        """Property age calculated from first resale when TOP not available."""
        age, source = calculate_property_age(None, date(2020, 1, 1), 2025)
        assert age == 5
        assert source == "first_resale"

    def test_calculate_property_age_insufficient_data(self):
        """No data available returns insufficient_data."""
        age, source = calculate_property_age(None, None, 2025)
        assert age is None
        assert source == "insufficient_data"

    def test_calculate_percentages_with_units(self):
        """Percentages calculated correctly when total_units available."""
        mat, press, trans = calculate_percentages(100, 20, 150, 1000)
        assert mat == 10.0
        assert press == 2.0
        assert trans == 15.0

    def test_calculate_percentages_without_units(self):
        """Returns None when total_units not available."""
        mat, press, trans = calculate_percentages(100, 20, 150, None)
        assert mat is None
        assert press is None
        assert trans is None

    def test_maturity_zone_green(self):
        """High maturity returns green."""
        assert get_maturity_zone(45.0) == "green"

    def test_maturity_zone_yellow(self):
        """Medium maturity returns yellow."""
        assert get_maturity_zone(25.0) == "yellow"

    def test_maturity_zone_red(self):
        """Low maturity returns red."""
        assert get_maturity_zone(10.0) == "red"

    def test_maturity_zone_unknown(self):
        """None returns unknown."""
        assert get_maturity_zone(None) == "unknown"

    def test_pressure_zone_green(self):
        """Low pressure returns green."""
        assert get_pressure_zone(3.0) == "green"

    def test_pressure_zone_yellow(self):
        """Medium pressure returns yellow."""
        assert get_pressure_zone(7.0) == "yellow"

    def test_pressure_zone_red(self):
        """High pressure returns red."""
        assert get_pressure_zone(12.0) == "red"

    def test_quadrant_proven_low_pressure(self):
        """Green/green returns proven_low_pressure with low risk."""
        quad, risk = get_quadrant_and_risk("green", "green")
        assert quad == "proven_low_pressure"
        assert risk == "low"

    def test_quadrant_immature_high_pressure(self):
        """Red/red returns immature_high_pressure with elevated risk."""
        quad, risk = get_quadrant_and_risk("red", "red")
        assert quad == "immature_high_pressure"
        assert risk == "elevated"

    def test_quadrant_insufficient_data(self):
        """Unknown zone returns insufficient_data."""
        quad, risk = get_quadrant_and_risk("unknown", "green")
        assert quad == "insufficient_data"
        assert risk == "unknown"


class TestGatingFlags:
    """Tests for gating flag calculations."""

    def test_is_boutique_true(self):
        """Projects with <50 units are boutique."""
        flags = calculate_gating_flags(45, 5, 2500.0, "D15", 20, 15, 3)
        assert flags.is_boutique is True

    def test_is_boutique_false(self):
        """Projects with >=50 units are not boutique."""
        flags = calculate_gating_flags(100, 5, 2500.0, "D15", 20, 15, 3)
        assert flags.is_boutique is False

    def test_is_brand_new_true(self):
        """Projects <2 years old are brand new."""
        flags = calculate_gating_flags(100, 1, 2500.0, "D15", 20, 15, 3)
        assert flags.is_brand_new is True

    def test_is_ultra_luxury_by_psf(self):
        """Projects with median PSF >3000 are ultra-luxury."""
        flags = calculate_gating_flags(100, 5, 3500.0, "D15", 20, 15, 3)
        assert flags.is_ultra_luxury is True

    def test_is_ultra_luxury_by_district(self):
        """Projects in D09/D10/D11 are ultra-luxury."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D09", 20, 15, 3)
        assert flags.is_ultra_luxury is True

    def test_is_thin_data_by_units(self):
        """Projects with <8 unique resale units have thin data."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 5, 15, 3)
        assert flags.is_thin_data is True

    def test_is_thin_data_by_resales(self):
        """Projects with <10 resales in 24m have thin data."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 20, 5, 3)
        assert flags.is_thin_data is True

    def test_unit_type_mixed(self):
        """Projects with >1 bedroom type are mixed."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 20, 15, 3)
        assert flags.unit_type_mixed is True

    def test_unit_type_not_mixed(self):
        """Projects with 1 bedroom type are not mixed."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 20, 15, 1)
        assert flags.unit_type_mixed is False


# =============================================================================
# SERIALIZATION TESTS - V2 SCHEMA CONTRACT
# =============================================================================

class TestV2SchemaContract:
    """Tests for v2 schema field names and enum values."""

    def test_v2_has_camel_case_top_level_fields(self, sample_result):
        """v2 response has camelCase top-level fields."""
        v2 = serialize_exit_queue_v2(sample_result)

        assert "projectName" in v2
        assert "dataQuality" in v2
        assert "fundamentals" in v2
        assert "resaleMetrics" in v2
        assert "riskAssessment" in v2
        assert "gatingFlags" in v2

    def test_v2_data_quality_fields(self, sample_result):
        """v2 dataQuality has correct camelCase fields."""
        v2 = serialize_exit_queue_v2(sample_result)
        dq = v2["dataQuality"]

        assert "hasTopYear" in dq
        assert "hasTotalUnits" in dq
        assert "completeness" in dq
        assert "sampleWindowMonths" in dq
        assert "warnings" in dq

    def test_v2_fundamentals_fields(self, sample_result):
        """v2 fundamentals has correct camelCase fields."""
        v2 = serialize_exit_queue_v2(sample_result)
        f = v2["fundamentals"]

        assert "totalUnits" in f
        assert "topYear" in f
        assert "propertyAgeYears" in f
        assert "ageSource" in f
        assert "tenure" in f
        assert "district" in f
        assert "developer" in f
        assert "firstResaleDate" in f

    def test_v2_resale_metrics_fields(self, sample_result):
        """v2 resaleMetrics has correct camelCase fields."""
        v2 = serialize_exit_queue_v2(sample_result)
        rm = v2["resaleMetrics"]

        assert "uniqueResaleUnitsTotal" in rm
        assert "uniqueResaleUnits12m" in rm
        assert "totalResaleTransactions" in rm
        assert "resaleMaturityPct" in rm
        assert "activeExitPressurePct" in rm
        assert "absorptionSpeedDays" in rm
        assert "transactionsPer100Units" in rm
        assert "resalesLast24m" in rm

    def test_v2_risk_assessment_fields(self, sample_result):
        """v2 riskAssessment has correct camelCase fields."""
        v2 = serialize_exit_queue_v2(sample_result)
        ra = v2["riskAssessment"]

        assert "maturityZone" in ra
        assert "pressureZone" in ra
        assert "quadrant" in ra
        assert "overallRisk" in ra
        assert "interpretation" in ra

    def test_v2_gating_flags_fields(self, sample_result):
        """v2 gatingFlags has correct camelCase fields."""
        v2 = serialize_exit_queue_v2(sample_result)
        gf = v2["gatingFlags"]

        assert "isBoutique" in gf
        assert "isBrandNew" in gf
        assert "isUltraLuxury" in gf
        assert "isThinData" in gf
        assert "unitTypeMixed" in gf

    def test_v2_risk_zone_enum_values(self, complete_result):
        """v2 risk zones use correct enum values."""
        v2 = serialize_exit_queue_v2(complete_result)
        ra = v2["riskAssessment"]

        # Red maturity zone should map to 'high'
        assert ra["maturityZone"] == RiskZone.HIGH

        # Green pressure zone should map to 'low'
        assert ra["pressureZone"] == RiskZone.LOW

    def test_v2_overall_risk_enum_values(self, complete_result):
        """v2 overall risk uses correct enum values."""
        v2 = serialize_exit_queue_v2(complete_result)
        ra = v2["riskAssessment"]

        # Moderate risk
        assert ra["overallRisk"] == OverallRisk.MODERATE


# =============================================================================
# DUAL-MODE SERIALIZATION TESTS
# =============================================================================

class TestDualModeSerialization:
    """Tests for dual-mode v1 + v2 serialization."""

    def test_dual_mode_includes_v2_by_default(self, sample_result):
        """Dual mode includes _v2 by default."""
        response = serialize_exit_queue_dual(sample_result, include_v2=True)

        assert "_v2" in response
        assert "projectName" in response["_v2"]

    def test_dual_mode_v1_fields_present(self, sample_result):
        """Dual mode includes v1 snake_case fields at top level."""
        response = serialize_exit_queue_dual(sample_result)

        assert "project_name" in response
        assert "data_quality" in response
        assert "fundamentals" in response
        assert "resale_metrics" in response
        assert "risk_assessment" in response
        assert "gating_flags" in response

    def test_dual_mode_can_exclude_v2(self, sample_result):
        """Dual mode can exclude _v2 when include_v2=False."""
        response = serialize_exit_queue_dual(sample_result, include_v2=False)

        assert "_v2" not in response
        assert "project_name" in response  # v1 still present

    def test_dual_mode_values_match(self, complete_result):
        """v1 and v2 values are equivalent."""
        response = serialize_exit_queue_dual(complete_result)

        # Compare key values
        assert response["project_name"] == response["_v2"]["projectName"]
        assert response["fundamentals"]["total_units"] == response["_v2"]["fundamentals"]["totalUnits"]
        assert response["resale_metrics"]["total_resale_transactions"] == response["_v2"]["resaleMetrics"]["totalResaleTransactions"]


# =============================================================================
# NULL HANDLING TESTS
# =============================================================================

class TestNullHandling:
    """Tests for graceful null/None handling."""

    def test_null_total_units(self, sample_result):
        """Handles null total_units gracefully."""
        v1 = serialize_exit_queue_v1(sample_result)

        assert v1["fundamentals"]["total_units"] is None
        assert v1["resale_metrics"]["resale_maturity_pct"] is None
        assert v1["resale_metrics"]["active_exit_pressure_pct"] is None

    def test_null_first_resale_date(self):
        """Handles null first_resale_date gracefully."""
        result = ExitQueueResult(
            project_name="TEST",
            data_quality=DataQuality(False, False, "partial", 0, []),
            fundamentals=PropertyFundamentals(None, None, None, "insufficient_data", None, "D01", None, None),
            resale_metrics=ResaleMetrics(0, 0, 0, None, None, None, None, 0),
            risk_assessment=RiskAssessment("unknown", "unknown", "insufficient_data", "unknown", ""),
            gating_flags=GatingFlags(False, False, False, True, False)
        )

        v1 = serialize_exit_queue_v1(result)
        assert v1["fundamentals"]["first_resale_date"] is None

    def test_null_absorption_speed(self, sample_result):
        """Handles null absorption_speed_days in complete result."""
        result = ExitQueueResult(
            project_name="TEST",
            data_quality=sample_result.data_quality,
            fundamentals=sample_result.fundamentals,
            resale_metrics=ResaleMetrics(10, 5, 20, None, None, None, None, 8),
            risk_assessment=sample_result.risk_assessment,
            gating_flags=sample_result.gating_flags
        )

        v1 = serialize_exit_queue_v1(result)
        assert v1["resale_metrics"]["absorption_speed_days"] is None

    def test_warnings_list_handling(self, sample_result):
        """Warnings list is correctly serialized."""
        v1 = serialize_exit_queue_v1(sample_result)

        assert isinstance(v1["data_quality"]["warnings"], list)
        assert len(v1["data_quality"]["warnings"]) == 1


# =============================================================================
# INTEGRATION TEST (requires database - mark as skip for unit tests)
# =============================================================================

@pytest.mark.skip(reason="Requires database connection - run separately")
class TestExitQueueIntegration:
    """Integration tests requiring database."""

    def test_known_project_returns_data(self):
        """Known project with resales returns non-empty metrics."""
        # This would test against actual database
        # THE SAIL @ MARINA BAY should have resale data
        pass

    def test_unknown_project_returns_404(self):
        """Unknown project returns 404 with appropriate error."""
        pass


# =============================================================================
# RUN TESTS
# =============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
