"""
Tests for URA Sync Configuration

Tests kill switch, mode selection, and upsert SQL generation.
"""

import pytest
from datetime import date
from dateutil.relativedelta import relativedelta
import os

from services.ura_sync_config import (
    is_sync_enabled,
    get_sync_mode,
    get_revision_window_months,
    get_cutoff_date,
    get_revision_window_date,
    build_upsert_sql,
    validate_sync_config,
    SyncStats,
    UPDATABLE_FIELDS,
    INSERT_FIELDS,
)


# =============================================================================
# Kill Switch Tests
# =============================================================================

class TestKillSwitch:
    """Tests for the URA_SYNC_ENABLED kill switch."""

    def test_enabled_by_default(self, monkeypatch):
        """Sync should be enabled when env var not set."""
        monkeypatch.delenv('URA_SYNC_ENABLED', raising=False)
        assert is_sync_enabled() is True

    def test_enabled_when_true(self, monkeypatch):
        """Sync enabled when explicitly true."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'true')
        assert is_sync_enabled() is True

    def test_disabled_when_false(self, monkeypatch):
        """Sync disabled when false."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'false')
        assert is_sync_enabled() is False

    def test_disabled_when_zero(self, monkeypatch):
        """Sync disabled when '0'."""
        monkeypatch.setenv('URA_SYNC_ENABLED', '0')
        assert is_sync_enabled() is False

    def test_disabled_when_no(self, monkeypatch):
        """Sync disabled when 'no'."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'no')
        assert is_sync_enabled() is False

    def test_disabled_when_off(self, monkeypatch):
        """Sync disabled when 'off'."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'off')
        assert is_sync_enabled() is False

    def test_disabled_case_insensitive(self, monkeypatch):
        """Kill switch is case insensitive."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'FALSE')
        assert is_sync_enabled() is False


# =============================================================================
# Sync Mode Tests
# =============================================================================

class TestSyncMode:
    """Tests for URA_SYNC_MODE."""

    def test_default_is_shadow(self, monkeypatch):
        """Default mode should be shadow."""
        monkeypatch.delenv('URA_SYNC_MODE', raising=False)
        assert get_sync_mode() == 'shadow'

    def test_shadow_mode(self, monkeypatch):
        """Shadow mode when set."""
        monkeypatch.setenv('URA_SYNC_MODE', 'shadow')
        assert get_sync_mode() == 'shadow'

    def test_production_mode(self, monkeypatch):
        """Production mode when set."""
        monkeypatch.setenv('URA_SYNC_MODE', 'production')
        assert get_sync_mode() == 'production'

    def test_dry_run_mode(self, monkeypatch):
        """Dry run mode when set."""
        monkeypatch.setenv('URA_SYNC_MODE', 'dry_run')
        assert get_sync_mode() == 'dry_run'

    def test_invalid_mode_defaults_to_shadow(self, monkeypatch):
        """Invalid mode defaults to shadow."""
        monkeypatch.setenv('URA_SYNC_MODE', 'invalid')
        assert get_sync_mode() == 'shadow'


# =============================================================================
# Revision Window Tests
# =============================================================================

class TestRevisionWindow:
    """Tests for revision window configuration."""

    def test_default_revision_window(self, monkeypatch):
        """Default revision window is 3 months."""
        monkeypatch.delenv('URA_REVISION_WINDOW_MONTHS', raising=False)
        assert get_revision_window_months() == 3

    def test_custom_revision_window(self, monkeypatch):
        """Custom revision window."""
        monkeypatch.setenv('URA_REVISION_WINDOW_MONTHS', '6')
        assert get_revision_window_months() == 6

    def test_invalid_revision_window_defaults(self, monkeypatch):
        """Invalid revision window defaults to 3."""
        monkeypatch.setenv('URA_REVISION_WINDOW_MONTHS', 'invalid')
        assert get_revision_window_months() == 3

    def test_revision_window_date(self, monkeypatch):
        """Revision window date is correct."""
        monkeypatch.setenv('URA_REVISION_WINDOW_MONTHS', '3')
        expected = date.today() - relativedelta(months=3)
        assert get_revision_window_date() == expected


# =============================================================================
# Cutoff Date Tests
# =============================================================================

class TestCutoffDate:
    """Tests for cutoff date configuration."""

    def test_default_cutoff_years(self, monkeypatch):
        """Default cutoff is 5 years."""
        monkeypatch.delenv('URA_CUTOFF_YEARS', raising=False)
        expected = date.today() - relativedelta(years=5)
        assert get_cutoff_date() == expected

    def test_custom_cutoff_years(self, monkeypatch):
        """Custom cutoff years."""
        monkeypatch.setenv('URA_CUTOFF_YEARS', '3')
        expected = date.today() - relativedelta(years=3)
        assert get_cutoff_date() == expected


# =============================================================================
# Upsert SQL Tests
# =============================================================================

class TestUpsertSQL:
    """Tests for upsert SQL generation."""

    def test_upsert_sql_has_insert(self):
        """Upsert SQL includes INSERT."""
        sql = build_upsert_sql()
        assert 'INSERT INTO transactions' in sql

    def test_upsert_sql_has_on_conflict(self):
        """Upsert SQL includes ON CONFLICT."""
        sql = build_upsert_sql()
        assert 'ON CONFLICT (row_hash)' in sql

    def test_upsert_sql_has_do_update(self):
        """Upsert SQL uses DO UPDATE not DO NOTHING."""
        sql = build_upsert_sql()
        assert 'DO UPDATE SET' in sql
        assert 'DO NOTHING' not in sql

    def test_upsert_sql_updates_price(self):
        """Upsert SQL updates price field."""
        sql = build_upsert_sql()
        assert 'price = EXCLUDED.price' in sql

    def test_upsert_sql_updates_psf(self):
        """Upsert SQL updates psf field."""
        sql = build_upsert_sql()
        assert 'psf = EXCLUDED.psf' in sql

    def test_upsert_sql_updates_area(self):
        """Upsert SQL updates area_sqft field."""
        sql = build_upsert_sql()
        assert 'area_sqft = EXCLUDED.area_sqft' in sql

    def test_upsert_sql_returns_was_inserted(self):
        """Upsert SQL returns whether row was inserted."""
        sql = build_upsert_sql()
        assert 'was_inserted' in sql

    def test_updatable_fields_includes_key_fields(self):
        """Updatable fields include key revision fields."""
        assert 'price' in UPDATABLE_FIELDS
        assert 'area_sqft' in UPDATABLE_FIELDS
        assert 'psf' in UPDATABLE_FIELDS
        assert 'floor_range' in UPDATABLE_FIELDS
        assert 'sale_type' in UPDATABLE_FIELDS
        assert 'district' in UPDATABLE_FIELDS
        assert 'nett_price' in UPDATABLE_FIELDS

    def test_insert_fields_includes_all_required(self):
        """Insert fields include all required columns."""
        assert 'project_name' in INSERT_FIELDS
        assert 'transaction_date' in INSERT_FIELDS
        assert 'price' in INSERT_FIELDS
        assert 'row_hash' in INSERT_FIELDS
        assert 'source' in INSERT_FIELDS
        assert 'run_id' in INSERT_FIELDS


# =============================================================================
# SyncStats Tests
# =============================================================================

class TestSyncStats:
    """Tests for SyncStats tracking."""

    def test_stats_initialized_to_zero(self):
        """Stats start at zero."""
        stats = SyncStats()
        assert stats.raw_projects == 0
        assert stats.mapped_rows == 0
        assert stats.inserted_rows == 0
        assert stats.updated_rows == 0

    def test_stats_to_dict(self):
        """Stats can be converted to dict."""
        stats = SyncStats()
        stats.raw_projects = 100
        stats.inserted_rows = 50
        stats.updated_rows = 10

        d = stats.to_dict()
        assert d['raw_projects'] == 100
        assert d['inserted_rows'] == 50
        assert d['updated_rows'] == 10

    def test_stats_add_mapper_stats(self):
        """Can add mapper skip counters."""
        stats = SyncStats()
        mapper_stats = {
            'skip_invalid_date': 5,
            'skip_invalid_price': 3,
            'transactions_processed': 100,  # not a skip counter
        }
        stats.add_mapper_stats(mapper_stats)

        assert stats.skip_counters['skip_invalid_date'] == 5
        assert stats.skip_counters['skip_invalid_price'] == 3
        assert 'transactions_processed' not in stats.skip_counters


# =============================================================================
# Validation Tests
# =============================================================================

class TestValidation:
    """Tests for sync config validation."""

    def test_validation_fails_when_disabled(self, monkeypatch):
        """Validation fails when sync disabled."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'false')
        is_valid, error = validate_sync_config()
        assert is_valid is False
        assert 'disabled' in error.lower()

    def test_validation_fails_without_access_key(self, monkeypatch):
        """Validation fails without URA_ACCESS_KEY."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'true')
        monkeypatch.delenv('URA_ACCESS_KEY', raising=False)
        is_valid, error = validate_sync_config()
        assert is_valid is False
        assert 'URA_ACCESS_KEY' in error

    def test_validation_passes_with_config(self, monkeypatch):
        """Validation passes with proper config."""
        monkeypatch.setenv('URA_SYNC_ENABLED', 'true')
        monkeypatch.setenv('URA_ACCESS_KEY', 'test-key')
        is_valid, error = validate_sync_config()
        assert is_valid is True
        assert error is None
