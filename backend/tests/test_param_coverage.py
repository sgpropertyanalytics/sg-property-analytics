"""
Param Coverage Tests - Prevent silent param dropping.

This test was added after discovering on Jan 2, 2026 that the `timeframe` param
was being silently dropped because AGGREGATE_PARAM_SCHEMA didn't define the field.
Frontend sent `timeframe=M6`, backend dropped it, and defaulted to Y1.

The root cause: normalize_params() only processes fields defined in schema.fields.
If a param isn't in the schema, it's silently dropped - no warning, no error.

These tests ensure that every param the frontend sends has a corresponding
field (or alias) in the backend schema.
"""
import pytest

from api.contracts.schemas.aggregate import AGGREGATE_PARAM_SCHEMA
from api.contracts.schemas.insights import (
    DISTRICT_PSF_PARAM_SCHEMA,
    DISTRICT_LIQUIDITY_PARAM_SCHEMA,
)


class TestAggregateParamCoverage:
    """Tests that AGGREGATE_PARAM_SCHEMA covers all frontend params."""

    # All params that buildApiParamsFromState can send to /api/aggregate
    FRONTEND_PARAMS = [
        # Filters
        "district",
        "bedroom",
        "segment",
        "region",
        "sale_type",
        "tenure",
        "project",
        "project_exact",
        # Ranges
        "psf_min",
        "psf_max",
        "size_min",
        "size_max",
        # Dates & timeframe
        "date_from",
        "date_to",
        "timeframe",  # <-- This was the missing field that caused the bug
        # Query params
        "group_by",
        "metrics",
        "limit",
        "skip_cache",
    ]

    # camelCase params frontend might send (should have aliases)
    FRONTEND_CAMEL_PARAMS = [
        "saleType",
        "dateFrom",
        "dateTo",
        "psfMin",
        "psfMax",
        "sizeMin",
        "sizeMax",
        "groupBy",
        "skipCache",
        "projectExact",
    ]

    def test_timeframe_in_schema(self):
        """
        CRITICAL: Timeframe must be defined in aggregate schema.

        This test specifically guards against the Jan 2026 bug where
        timeframe was silently dropped.
        """
        assert "timeframe" in AGGREGATE_PARAM_SCHEMA.fields, (
            "CRITICAL: timeframe field missing from AGGREGATE_PARAM_SCHEMA!\n"
            "Frontend sends timeframe=M6, but without schema field it will be dropped.\n"
            "See: backend/api/contracts/normalize.py:normalize_params()"
        )

    def test_all_frontend_params_have_schema_fields(self):
        """Every param frontend can send must have a schema field."""
        schema_fields = set(AGGREGATE_PARAM_SCHEMA.fields.keys())

        missing = [p for p in self.FRONTEND_PARAMS if p not in schema_fields]

        assert not missing, (
            f"Frontend params missing from AGGREGATE_PARAM_SCHEMA: {missing}\n"
            "These params will be SILENTLY DROPPED by normalize_params().\n"
            "Add them to backend/api/contracts/schemas/aggregate.py"
        )

    def test_camelcase_aliases_exist(self):
        """camelCase params must have snake_case aliases."""
        aliases = AGGREGATE_PARAM_SCHEMA.aliases

        missing = [p for p in self.FRONTEND_CAMEL_PARAMS if p not in aliases]

        assert not missing, (
            f"camelCase params missing aliases: {missing}\n"
            "Frontend may send camelCase, need aliases to snake_case.\n"
            "Add to AGGREGATE_PARAM_SCHEMA.aliases in aggregate.py"
        )

    def test_alias_targets_are_valid_fields(self):
        """Every alias target must be a valid schema field."""
        schema_fields = set(AGGREGATE_PARAM_SCHEMA.fields.keys())
        aliases = AGGREGATE_PARAM_SCHEMA.aliases

        invalid = [
            (alias, target)
            for alias, target in aliases.items()
            if target not in schema_fields
        ]

        assert not invalid, (
            f"Aliases point to non-existent fields: {invalid}\n"
            "Each alias target must be a defined schema field."
        )


class TestInsightsParamCoverage:
    """Tests that insights schemas cover all frontend params."""

    INSIGHTS_PARAMS = [
        "timeframe",
        "period",  # Legacy, deprecated
        "bed",
        "age",
        "sale_type",
    ]

    def test_timeframe_in_district_psf_schema(self):
        """Timeframe must be in district-psf schema."""
        assert "timeframe" in DISTRICT_PSF_PARAM_SCHEMA.fields, (
            "timeframe field missing from DISTRICT_PSF_PARAM_SCHEMA"
        )

    def test_timeframe_in_district_liquidity_schema(self):
        """Timeframe must be in district-liquidity schema."""
        assert "timeframe" in DISTRICT_LIQUIDITY_PARAM_SCHEMA.fields, (
            "timeframe field missing from DISTRICT_LIQUIDITY_PARAM_SCHEMA"
        )


class TestParamCoverageConsistency:
    """Tests that timeframe handling is consistent across schemas."""

    def test_timeframe_in_all_time_aware_schemas(self):
        """
        Any schema that could receive timeframe must define it.

        This prevents the "works for /insights, fails for /aggregate" bug.
        """
        time_aware_schemas = [
            ("AGGREGATE_PARAM_SCHEMA", AGGREGATE_PARAM_SCHEMA),
            ("DISTRICT_PSF_PARAM_SCHEMA", DISTRICT_PSF_PARAM_SCHEMA),
            ("DISTRICT_LIQUIDITY_PARAM_SCHEMA", DISTRICT_LIQUIDITY_PARAM_SCHEMA),
        ]

        missing = []
        for name, schema in time_aware_schemas:
            if "timeframe" not in schema.fields:
                missing.append(name)

        assert not missing, (
            f"Schemas missing timeframe field: {missing}\n"
            "All time-aware endpoints must accept timeframe param."
        )
