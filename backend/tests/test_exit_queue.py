"""
Tests for Exit Queue Risk Analysis

Tests:
1. Integration test - known project returns non-empty exit queue metrics
2. Contract test - v2 keys + enum formats
3. Null-handling test - graceful handling of missing data
"""

import pytest
from datetime import date
from dataclasses import dataclass

# Import service components
from services.exit_queue_service import (
    BasicStats,
    UnitData,
    DataQuality,
    PropertyFundamentals,
    ResaleMetrics,
    RiskAssessment,
    GatingFlags,
    ExitQueueResult,
    calculate_property_age,
    calculate_turnover_metrics,
    get_liquidity_zone,
    get_overall_risk,
    generate_interpretation,
    calculate_gating_flags,
    generate_warnings,
)

# Import serializers from api_contract
from api.contracts.contract_schema import (
    serialize_exit_queue_v2,
    ExitQueueFields,
    LiquidityZone,
    OverallRisk,
)


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_result():
    """Create a sample ExitQueueResult for testing (no total_units data)."""
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
            total_resale_transactions=267,
            resales_12m=47,
            market_turnover_pct=None,
            recent_turnover_pct=None
        ),
        risk_assessment=RiskAssessment(
            market_turnover_zone="unknown",
            recent_turnover_zone="unknown",
            overall_risk="unknown",
            interpretation="Turnover data unavailable. Total units information required for calculation."
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
    """Create a complete ExitQueueResult with all data available (healthy liquidity)."""
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
            total_resale_transactions=147,  # 10 per 100 units (healthy)
            resales_12m=44,  # 3 per 100 units (low)
            market_turnover_pct=10.0,  # healthy range (5-15)
            recent_turnover_pct=3.0  # low range (<5)
        ),
        risk_assessment=RiskAssessment(
            market_turnover_zone="healthy",  # 5-15 = healthy
            recent_turnover_zone="low",  # <5 = low
            overall_risk="low",  # healthy market = low risk
            interpretation="This is a balanced resale market with 10.0 transactions per 100 units. Favorable conditions for both buying and selling."
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

    def test_calculate_turnover_metrics_with_units(self):
        """Turnover calculated correctly when total_units available."""
        market, recent = calculate_turnover_metrics(150, 30, 1000)
        assert market == 15.0  # 150/1000 * 100
        assert recent == 3.0   # 30/1000 * 100

    def test_calculate_turnover_metrics_without_units(self):
        """Returns None when total_units not available."""
        market, recent = calculate_turnover_metrics(150, 30, None)
        assert market is None
        assert recent is None

    def test_liquidity_zone_low(self):
        """<5 returns low (Low Liquidity)."""
        assert get_liquidity_zone(3.0) == "low"
        assert get_liquidity_zone(4.9) == "low"

    def test_liquidity_zone_healthy(self):
        """5-15 returns healthy (Healthy Liquidity)."""
        assert get_liquidity_zone(5.0) == "healthy"
        assert get_liquidity_zone(10.0) == "healthy"
        assert get_liquidity_zone(15.0) == "healthy"

    def test_liquidity_zone_high(self):
        """>15 returns high (Elevated Turnover)."""
        assert get_liquidity_zone(15.1) == "high"
        assert get_liquidity_zone(25.0) == "high"

    def test_liquidity_zone_unknown(self):
        """None returns unknown."""
        assert get_liquidity_zone(None) == "unknown"

    def test_overall_risk_healthy_market(self):
        """Healthy market zone returns low risk."""
        risk = get_overall_risk("healthy", "healthy")
        assert risk == "low"
        risk = get_overall_risk("healthy", "low")
        assert risk == "low"
        risk = get_overall_risk("healthy", "high")
        assert risk == "low"

    def test_overall_risk_low_market(self):
        """Low market zone returns moderate or elevated risk."""
        risk = get_overall_risk("low", "healthy")
        assert risk == "moderate"
        risk = get_overall_risk("low", "low")
        assert risk == "elevated"

    def test_overall_risk_high_market(self):
        """High market zone returns moderate or elevated risk."""
        risk = get_overall_risk("high", "healthy")
        assert risk == "moderate"
        risk = get_overall_risk("high", "high")
        assert risk == "elevated"

    def test_overall_risk_unknown(self):
        """Unknown zone returns unknown risk."""
        assert get_overall_risk("unknown", "healthy") == "unknown"
        assert get_overall_risk("healthy", "unknown") == "unknown"


class TestGatingFlags:
    """Tests for gating flag calculations."""

    def test_is_boutique_true(self):
        """Projects with <50 units are boutique."""
        flags = calculate_gating_flags(45, 5, 2500.0, "D15", 20, 3)
        assert flags.is_boutique is True

    def test_is_boutique_false(self):
        """Projects with >=50 units are not boutique."""
        flags = calculate_gating_flags(100, 5, 2500.0, "D15", 20, 3)
        assert flags.is_boutique is False

    def test_is_brand_new_true(self):
        """Projects <2 years old are brand new."""
        flags = calculate_gating_flags(100, 1, 2500.0, "D15", 20, 3)
        assert flags.is_brand_new is True

    def test_is_ultra_luxury_by_psf(self):
        """Projects with median PSF >3000 are ultra-luxury."""
        flags = calculate_gating_flags(100, 5, 3500.0, "D15", 20, 3)
        assert flags.is_ultra_luxury is True

    def test_is_ultra_luxury_by_district(self):
        """Projects in D09/D10/D11 are ultra-luxury."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D09", 20, 3)
        assert flags.is_ultra_luxury is True

    def test_is_thin_data_true(self):
        """Projects with <10 total resale transactions have thin data."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 5, 3)
        assert flags.is_thin_data is True

    def test_is_thin_data_false(self):
        """Projects with >=10 total resale transactions don't have thin data."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 15, 3)
        assert flags.is_thin_data is False

    def test_unit_type_mixed(self):
        """Projects with >1 bedroom type are mixed."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 20, 3)
        assert flags.unit_type_mixed is True

    def test_unit_type_not_mixed(self):
        """Projects with 1 bedroom type are not mixed."""
        flags = calculate_gating_flags(100, 5, 2000.0, "D15", 20, 1)
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

        assert "totalResaleTransactions" in rm
        assert "resales12m" in rm
        assert "marketTurnoverPct" in rm
        assert "recentTurnoverPct" in rm

    def test_v2_risk_assessment_fields(self, sample_result):
        """v2 riskAssessment has correct camelCase fields."""
        v2 = serialize_exit_queue_v2(sample_result)
        ra = v2["riskAssessment"]

        assert "marketTurnoverZone" in ra
        assert "recentTurnoverZone" in ra
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

    def test_v2_liquidity_zone_enum_values(self, complete_result):
        """v2 liquidity zones use correct enum values."""
        v2 = serialize_exit_queue_v2(complete_result)
        ra = v2["riskAssessment"]

        # Market turnover of 10.0 = healthy zone
        assert ra["marketTurnoverZone"] == "healthy"

        # Recent turnover of 3.0 = low zone
        assert ra["recentTurnoverZone"] == "low"

    def test_v2_overall_risk_enum_values(self, complete_result):
        """v2 overall risk uses correct enum values."""
        v2 = serialize_exit_queue_v2(complete_result)
        ra = v2["riskAssessment"]

        # Healthy market = low risk
        assert ra["overallRisk"] == OverallRisk.LOW


# =============================================================================
# NULL HANDLING TESTS
# =============================================================================

class TestNullHandling:
    """Tests for graceful null/None handling."""

    def test_null_total_units(self, sample_result):
        """Handles null total_units gracefully."""
        v2 = serialize_exit_queue_v2(sample_result)

        assert v2["fundamentals"]["totalUnits"] is None
        assert v2["resaleMetrics"]["marketTurnoverPct"] is None
        assert v2["resaleMetrics"]["recentTurnoverPct"] is None

    def test_null_first_resale_date(self):
        """Handles null first_resale_date gracefully."""
        result = ExitQueueResult(
            project_name="TEST",
            data_quality=DataQuality(False, False, "partial", 0, []),
            fundamentals=PropertyFundamentals(None, None, None, "insufficient_data", None, "D01", None, None),
            resale_metrics=ResaleMetrics(0, 0, None, None),
            risk_assessment=RiskAssessment("unknown", "unknown", "unknown", ""),
            gating_flags=GatingFlags(False, False, False, True, False)
        )

        v2 = serialize_exit_queue_v2(result)
        assert v2["fundamentals"]["firstResaleDate"] is None

    def test_null_turnover_metrics(self, sample_result):
        """Handles null turnover metrics gracefully."""
        result = ExitQueueResult(
            project_name="TEST",
            data_quality=sample_result.data_quality,
            fundamentals=sample_result.fundamentals,
            resale_metrics=ResaleMetrics(20, 5, None, None),
            risk_assessment=sample_result.risk_assessment,
            gating_flags=sample_result.gating_flags
        )

        v2 = serialize_exit_queue_v2(result)
        assert v2["resaleMetrics"]["marketTurnoverPct"] is None
        assert v2["resaleMetrics"]["recentTurnoverPct"] is None

    def test_warnings_list_handling(self, sample_result):
        """Warnings list is correctly serialized."""
        v2 = serialize_exit_queue_v2(sample_result)

        assert isinstance(v2["dataQuality"]["warnings"], list)
        assert len(v2["dataQuality"]["warnings"]) == 1


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
