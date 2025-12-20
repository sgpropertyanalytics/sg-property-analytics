#!/usr/bin/env python3
"""
Tests for floor level classification

Run with: pytest tests/test_floor_level_classification.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from services.classifier_extended import classify_floor_level


class TestFloorLevelClassification:
    """Test the classify_floor_level function."""

    def test_low_floors(self):
        """Test floors 01-05 are classified as Low."""
        assert classify_floor_level("01 to 05") == "Low"
        assert classify_floor_level("02 to 05") == "Low"
        assert classify_floor_level("03 to 05") == "Low"
        assert classify_floor_level("04 to 05") == "Low"
        assert classify_floor_level("05 to 05") == "Low"

    def test_mid_low_floors(self):
        """Test floors 06-10 are classified as Mid-Low."""
        assert classify_floor_level("06 to 10") == "Mid-Low"
        assert classify_floor_level("07 to 10") == "Mid-Low"
        assert classify_floor_level("08 to 10") == "Mid-Low"
        assert classify_floor_level("09 to 10") == "Mid-Low"
        assert classify_floor_level("10 to 10") == "Mid-Low"

    def test_mid_floors(self):
        """Test floors 11-20 are classified as Mid."""
        assert classify_floor_level("11 to 15") == "Mid"
        assert classify_floor_level("12 to 15") == "Mid"
        assert classify_floor_level("15 to 15") == "Mid"
        assert classify_floor_level("16 to 20") == "Mid"
        assert classify_floor_level("18 to 20") == "Mid"
        assert classify_floor_level("20 to 20") == "Mid"

    def test_mid_high_floors(self):
        """Test floors 21-30 are classified as Mid-High."""
        assert classify_floor_level("21 to 25") == "Mid-High"
        assert classify_floor_level("25 to 30") == "Mid-High"
        assert classify_floor_level("26 to 30") == "Mid-High"
        assert classify_floor_level("30 to 30") == "Mid-High"

    def test_high_floors(self):
        """Test floors 31-40 are classified as High."""
        assert classify_floor_level("31 to 35") == "High"
        assert classify_floor_level("35 to 40") == "High"
        assert classify_floor_level("36 to 40") == "High"
        assert classify_floor_level("40 to 40") == "High"

    def test_luxury_floors(self):
        """Test floors 41+ are classified as Luxury."""
        assert classify_floor_level("41 to 45") == "Luxury"
        assert classify_floor_level("45 to 50") == "Luxury"
        assert classify_floor_level("50 to 55") == "Luxury"
        assert classify_floor_level("60 to 65") == "Luxury"

    def test_edge_cases(self):
        """Test edge cases and boundary values."""
        # Exact boundaries
        assert classify_floor_level("05 to 05") == "Low"  # Upper bound of Low
        assert classify_floor_level("06 to 06") == "Mid-Low"  # Lower bound of Mid-Low
        assert classify_floor_level("10 to 10") == "Mid-Low"  # Upper bound of Mid-Low
        assert classify_floor_level("11 to 11") == "Mid"  # Lower bound of Mid
        assert classify_floor_level("20 to 20") == "Mid"  # Upper bound of Mid
        assert classify_floor_level("21 to 21") == "Mid-High"  # Lower bound of Mid-High
        assert classify_floor_level("30 to 30") == "Mid-High"  # Upper bound of Mid-High
        assert classify_floor_level("31 to 31") == "High"  # Lower bound of High
        assert classify_floor_level("40 to 40") == "High"  # Upper bound of High
        assert classify_floor_level("41 to 41") == "Luxury"  # Lower bound of Luxury

    def test_alternative_formats(self):
        """Test alternative floor range formats."""
        # Hyphen format
        assert classify_floor_level("01-05") == "Low"
        assert classify_floor_level("16-20") == "Mid"

        # With spaces around hyphen
        assert classify_floor_level("01 - 05") == "Low"

        # Single floor
        assert classify_floor_level("01") == "Low"
        assert classify_floor_level("35") == "High"

    def test_basement_handling(self):
        """Test basement floor handling."""
        assert classify_floor_level("B1") == "Low"
        assert classify_floor_level("B2") == "Low"
        assert classify_floor_level("B1 to B2") == "Low"

    def test_invalid_inputs(self):
        """Test handling of invalid inputs."""
        assert classify_floor_level(None) == "Unknown"
        assert classify_floor_level("") == "Unknown"
        assert classify_floor_level("nan") == "Unknown"
        assert classify_floor_level("invalid") == "Unknown"
        assert classify_floor_level("ABC") == "Unknown"

    def test_whitespace_handling(self):
        """Test handling of extra whitespace."""
        assert classify_floor_level("  01 to 05  ") == "Low"
        assert classify_floor_level("16 to 20 ") == "Mid"
        assert classify_floor_level(" 31 to 35") == "High"


class TestFloorLevelDistribution:
    """Test that floor level distribution makes sense."""

    def test_classification_covers_all_floors(self):
        """Verify all floor numbers 1-100 are classified."""
        for floor in range(1, 101):
            floor_range = f"{floor:02d} to {floor:02d}"
            result = classify_floor_level(floor_range)
            assert result != "Unknown", f"Floor {floor} should be classified, got Unknown"

    def test_classification_is_monotonic(self):
        """Verify floor classifications progress in order."""
        order = ["Low", "Mid-Low", "Mid", "Mid-High", "High", "Luxury"]

        prev_idx = 0
        for floor in range(1, 50):
            floor_range = f"{floor:02d} to {floor:02d}"
            result = classify_floor_level(floor_range)
            idx = order.index(result)
            assert idx >= prev_idx, f"Floor {floor} ({result}) should be >= previous classification"
            prev_idx = idx


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
