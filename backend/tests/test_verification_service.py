"""
Tests for Verification Service

Test cases:
1. Unit verification with exact match
2. Unit verification with mismatch
3. Multi-source agreement scoring
4. Confidence calculation
5. Report generation
6. API endpoints
"""
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from decimal import Decimal

from scrapers.models import VerificationCandidate, MIN_SOURCES_FOR_AUTO_CONFIRM
from scrapers.adapters.verification_base import (
    VerificationResult,
    VerificationConfidence,
)
from scrapers.utils.cross_validator import (
    cross_validate_project,
    CrossValidationResult,
    VerificationStatus,
    RecommendedAction,
    compute_confidence_score,
    can_auto_confirm,
    MIN_SOURCES_FOR_AUTO_CONFIRM as CV_MIN_SOURCES,
)


class TestCrossValidator:
    """Tests for cross_validator module."""

    def test_confidence_score_three_sources_agree(self):
        """3+ sources agreeing should give HIGH confidence (0.9+)."""
        score = compute_confidence_score(
            total_source_count=3,
            agreeing_source_count=3,
            field_results=[],
        )
        assert score >= 0.9

    def test_confidence_score_two_sources_agree(self):
        """2 sources agreeing should give MEDIUM confidence (0.7-0.9)."""
        score = compute_confidence_score(
            total_source_count=2,
            agreeing_source_count=2,
            field_results=[],
        )
        assert 0.7 <= score < 0.9

    def test_confidence_score_single_source(self):
        """1 source should give LOW confidence (<0.5)."""
        score = compute_confidence_score(
            total_source_count=1,
            agreeing_source_count=1,
            field_results=[],
        )
        assert score <= 0.5

    def test_cross_validate_with_matching_values(self):
        """Cross-validation should return CONFIRMED when values match."""
        current_data = {"total_units": 1040, "developer": "CDL"}

        verification_results = [
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="propertyguru.com.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1040, "developer": "CDL"},
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="edgeprop.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1040, "developer": "CDL"},
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="99.co",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1040, "developer": "CDL"},
                confidence=VerificationConfidence.HIGH,
            ),
        ]

        result = cross_validate_project(
            project_name="TEST PROJECT",
            entity_type="unit_count",
            current_data=current_data,
            verification_results=verification_results,
        )

        assert result.verification_status == VerificationStatus.CONFIRMED
        assert result.agreeing_source_count >= 3
        assert result.can_auto_confirm is True

    def test_cross_validate_with_mismatch(self):
        """Cross-validation should return MISMATCH when values differ."""
        current_data = {"total_units": 1040}

        verification_results = [
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="propertyguru.com.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1050},  # Different!
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="edgeprop.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1050},
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="99.co",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1050},
                confidence=VerificationConfidence.HIGH,
            ),
        ]

        result = cross_validate_project(
            project_name="TEST PROJECT",
            entity_type="unit_count",
            current_data=current_data,
            verification_results=verification_results,
        )

        assert result.verification_status == VerificationStatus.MISMATCH
        assert result.has_mismatches is True
        assert "total_units" in result.mismatch_fields
        assert result.can_auto_confirm is False

    def test_cross_validate_insufficient_sources(self):
        """Cross-validation should return UNVERIFIED with < 3 sources."""
        current_data = {"total_units": 1040}

        verification_results = [
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="propertyguru.com.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1040},
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="edgeprop.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1040},
                confidence=VerificationConfidence.HIGH,
            ),
        ]

        result = cross_validate_project(
            project_name="TEST PROJECT",
            entity_type="unit_count",
            current_data=current_data,
            verification_results=verification_results,
        )

        # Even if values match, < 3 sources = UNVERIFIED
        assert result.verification_status == VerificationStatus.UNVERIFIED
        assert result.can_auto_confirm is False

    def test_cross_validate_sources_disagree(self):
        """Cross-validation should return CONFLICT when sources disagree."""
        current_data = {"total_units": 1040}

        verification_results = [
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="propertyguru.com.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1040},
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="edgeprop.sg",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1050},  # Different!
                confidence=VerificationConfidence.HIGH,
            ),
            VerificationResult(
                project_name="TEST PROJECT",
                source_domain="99.co",
                source_url="https://example.com",
                found=True,
                data={"total_units": 1060},  # Also different!
                confidence=VerificationConfidence.HIGH,
            ),
        ]

        result = cross_validate_project(
            project_name="TEST PROJECT",
            entity_type="unit_count",
            current_data=current_data,
            verification_results=verification_results,
        )

        assert result.verification_status == VerificationStatus.CONFLICT
        assert result.can_auto_confirm is False

    def test_can_auto_confirm_requires_three_sources(self):
        """Auto-confirm should require 3+ agreeing sources."""
        # Create a result with only 2 sources
        result = CrossValidationResult(
            project_name="TEST",
            entity_type="unit_count",
            verification_status=VerificationStatus.CONFIRMED,
            confidence_score=0.95,
            agreeing_source_count=2,
            total_source_count=2,
        )

        assert can_auto_confirm(result) is False

        # Now with 3 sources
        result.agreeing_source_count = 3
        result.total_source_count = 3

        assert can_auto_confirm(result) is True


class TestVerificationCandidate:
    """Tests for VerificationCandidate model."""

    def test_can_auto_confirm_method(self):
        """Model method should respect 3-source minimum."""
        candidate = VerificationCandidate(
            entity_type="unit_count",
            entity_key="TEST PROJECT",
            current_value={"total_units": 1040},
            current_source="csv",
            verified_value={"total_units": 1040},
            verified_sources=[{"source": "pg"}, {"source": "ep"}, {"source": "99"}],
            agreeing_source_count=3,
            total_source_count=3,
            verification_status="confirmed",
            confidence_score=Decimal("0.95"),
            run_id="test-run-id",
        )

        assert candidate.can_auto_confirm() is True

        # With only 2 sources
        candidate.agreeing_source_count = 2
        assert candidate.can_auto_confirm() is False

    def test_auto_confirm_method(self):
        """Auto-confirm should set correct fields."""
        candidate = VerificationCandidate(
            entity_type="unit_count",
            entity_key="TEST PROJECT",
            current_value={"total_units": 1040},
            current_source="csv",
            verified_value={"total_units": 1040},
            verified_sources=[{"source": "pg"}, {"source": "ep"}, {"source": "99"}],
            agreeing_source_count=3,
            total_source_count=3,
            verification_status="confirmed",
            confidence_score=Decimal("0.95"),
            run_id="test-run-id",
        )

        result = candidate.auto_confirm()

        assert result is True
        assert candidate.review_status == "auto_confirmed"
        assert candidate.reviewed_at is not None
        assert "3 sources" in candidate.review_notes


class TestVerificationResult:
    """Tests for VerificationResult dataclass."""

    def test_not_found_factory(self):
        """not_found() should create correct result."""
        result = VerificationResult.not_found(
            project_name="TEST",
            source_domain="example.com",
        )

        assert result.found is False
        assert result.data == {}
        assert result.confidence == VerificationConfidence.LOW

    def test_error_result_factory(self):
        """error_result() should create correct result."""
        result = VerificationResult.error_result(
            project_name="TEST",
            source_domain="example.com",
            error="Connection timeout",
        )

        assert result.found is False
        assert result.error == "Connection timeout"


class TestMinSourcesConstant:
    """Tests for MIN_SOURCES_FOR_AUTO_CONFIRM constant."""

    def test_constant_is_three(self):
        """Constant should be 3 (strict requirement)."""
        assert MIN_SOURCES_FOR_AUTO_CONFIRM == 3
        assert CV_MIN_SOURCES == 3

    def test_constant_used_in_model(self):
        """Model should use the constant."""
        from scrapers.models.verification_candidate import MIN_SOURCES_FOR_AUTO_CONFIRM as MODEL_MIN
        assert MODEL_MIN == 3


# Integration test placeholder (requires database)
class TestVerificationServiceIntegration:
    """Integration tests for VerificationService (requires database)."""

    @pytest.mark.skip(reason="Requires database setup")
    def test_run_verification_end_to_end(self):
        """Full verification run with database."""
        pass

    @pytest.mark.skip(reason="Requires database setup")
    def test_approve_candidate_updates_domain(self):
        """Approving candidate with update should modify domain table."""
        pass


# API endpoint tests placeholder
class TestVerificationAPI:
    """Tests for verification API endpoints."""

    @pytest.mark.skip(reason="Requires Flask test client")
    def test_run_endpoint(self):
        """POST /api/verification/run should trigger verification."""
        pass

    @pytest.mark.skip(reason="Requires Flask test client")
    def test_candidates_list_endpoint(self):
        """GET /api/verification/candidates should return pending items."""
        pass

    @pytest.mark.skip(reason="Requires Flask test client")
    def test_approve_endpoint(self):
        """POST /api/verification/candidates/{id}/approve should approve."""
        pass
