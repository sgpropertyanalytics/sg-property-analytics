#!/usr/bin/env python3
"""
Regression test for IQR multiplier consistency.

This test ensures that the IQR multiplier used for outlier detection
is consistent between:
- scripts/upload.py (upload pipeline)
- backend/services/data_validation.py (validation service)

If these values differ, outlier detection will produce inconsistent results
depending on which code path is used.

Issue: B4 in DATA_PIPELINE_AUDIT.md

Run with: pytest tests/test_iqr_consistency.py -v
"""

import sys
import os
import re
import pytest

pytestmark = pytest.mark.integration

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest


class TestIQRMultiplierConsistency:
    """Test that IQR multiplier is consistent across codebase."""

    def test_iqr_multiplier_matches_upload_and_validation(self):
        """
        Verify IQR_MULTIPLIER in data_validation.py matches upload.py.

        This is critical for consistent outlier detection.
        """
        from services.data_validation import IQR_MULTIPLIER as validation_multiplier

        # Read upload.py and extract IQR_MULTIPLIER
        upload_path = os.path.join(
            os.path.dirname(__file__), '..', 'scripts', 'upload.py'
        )

        with open(upload_path, 'r') as f:
            upload_content = f.read()

        # Extract IQR_MULTIPLIER value from upload.py
        match = re.search(r'IQR_MULTIPLIER\s*=\s*([\d.]+)', upload_content)
        assert match, "Could not find IQR_MULTIPLIER in upload.py"

        upload_multiplier = float(match.group(1))

        assert validation_multiplier == upload_multiplier, (
            f"IQR_MULTIPLIER mismatch! "
            f"data_validation.py uses {validation_multiplier}, "
            f"upload.py uses {upload_multiplier}. "
            f"These MUST be identical for consistent outlier detection."
        )

    def test_iqr_multiplier_is_relaxed(self):
        """
        Verify IQR multiplier is relaxed (> 1.5) to include luxury condos.

        Standard IQR is 1.5x, but Singapore luxury market requires relaxed
        threshold to avoid flagging legitimate high-value transactions.
        """
        from services.data_validation import IQR_MULTIPLIER

        assert IQR_MULTIPLIER > 1.5, (
            f"IQR_MULTIPLIER should be > 1.5 (standard), "
            f"but got {IQR_MULTIPLIER}. "
            f"Relaxed multiplier needed for luxury condo market."
        )

        # Verify it's the expected 5.0
        assert IQR_MULTIPLIER == 5.0, (
            f"IQR_MULTIPLIER should be 5.0, but got {IQR_MULTIPLIER}"
        )

    def test_calculate_iqr_bounds_uses_constant(self):
        """
        Verify calculate_iqr_bounds uses the module constant, not hardcoded value.
        """
        import inspect
        from services.data_validation import calculate_iqr_bounds, IQR_MULTIPLIER

        # Get source code of the function
        source = inspect.getsource(calculate_iqr_bounds)

        # Should reference IQR_MULTIPLIER, not hardcoded 1.5
        assert 'IQR_MULTIPLIER' in source, (
            "calculate_iqr_bounds should use IQR_MULTIPLIER constant, "
            "not a hardcoded value"
        )

        assert '1.5 * iqr' not in source, (
            "calculate_iqr_bounds still has hardcoded '1.5 * iqr'. "
            "Should use IQR_MULTIPLIER constant instead."
        )


class TestIQRBoundsCalculation:
    """Test that IQR bounds are calculated correctly."""

    def test_bounds_use_correct_multiplier(self):
        """
        Verify calculated bounds use the 5x IQR multiplier.
        """
        from app import create_app
        from services.data_validation import calculate_iqr_bounds, IQR_MULTIPLIER

        app = create_app()

        with app.app_context():
            try:
                lower, upper, stats = calculate_iqr_bounds('price')
            except Exception as e:
                pytest.skip(f"Could not calculate IQR bounds: {e}")

            q1 = stats['q1']
            q3 = stats['q3']
            iqr = stats['iqr']

            # Verify bounds match expected formula
            expected_lower = q1 - IQR_MULTIPLIER * iqr
            expected_upper = q3 + IQR_MULTIPLIER * iqr

            assert abs(lower - expected_lower) < 0.01, (
                f"Lower bound {lower} doesn't match expected {expected_lower}"
            )
            assert abs(upper - expected_upper) < 0.01, (
                f"Upper bound {upper} doesn't match expected {expected_upper}"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
