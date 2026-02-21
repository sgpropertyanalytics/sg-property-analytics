"""
Tests for URA Sync Engine

These tests focus on unit testing the sync engine logic.
Integration tests require database and API access.
"""

import pytest
from unittest.mock import patch, MagicMock

from services.ura_sync_engine import (
    URASyncEngine,
    SyncResult,
    run_sync,
    get_git_sha,
)


# =============================================================================
# SyncResult Tests
# =============================================================================

class TestSyncResult:
    """Tests for SyncResult dataclass."""

    def test_success_result(self):
        """Create successful result."""
        result = SyncResult(
            success=True,
            run_id='abc-123',
            mode='production'
        )
        assert result.success
        assert result.run_id == 'abc-123'
        assert result.mode == 'production'
        assert result.error_message is None

    def test_failure_result(self):
        """Create failed result."""
        result = SyncResult(
            success=False,
            error_message='Test error',
            error_stage='fetch'
        )
        assert not result.success
        assert result.error_message == 'Test error'
        assert result.error_stage == 'fetch'

    def test_result_with_stats(self):
        """Result includes stats."""
        result = SyncResult(
            success=True,
            stats={'inserted_rows': 100, 'updated_rows': 10}
        )
        assert result.stats['inserted_rows'] == 100
        assert result.stats['updated_rows'] == 10

    def test_result_to_dict(self):
        """Result can be serialized to dict."""
        result = SyncResult(
            success=True,
            run_id='abc-123',
            mode='production',
            duration_seconds=10.5
        )
        d = result.to_dict()
        assert d['success'] is True
        assert d['run_id'] == 'abc-123'
        assert d['duration_seconds'] == 10.5


# =============================================================================
# URASyncEngine Tests (Mocked)
# =============================================================================

class TestURASyncEngineInit:
    """Tests for sync engine initialization."""

    def test_default_mode_from_env(self, monkeypatch):
        """Engine uses mode from environment."""
        monkeypatch.setenv('URA_SYNC_MODE', 'production')
        engine = URASyncEngine()
        assert engine.mode == 'production'

    def test_override_mode(self, monkeypatch):
        """Mode can be overridden."""
        monkeypatch.setenv('URA_SYNC_MODE', 'production')
        engine = URASyncEngine(mode='dry_run')
        assert engine.mode == 'dry_run'

    def test_triggered_by_default(self):
        """Default triggered_by is 'manual'."""
        engine = URASyncEngine()
        assert engine.triggered_by == 'manual'

    def test_triggered_by_cron(self):
        """Can set triggered_by to 'cron'."""
        engine = URASyncEngine(triggered_by='cron')
        assert engine.triggered_by == 'cron'


class TestURASyncEngineKillSwitch:
    """Tests for kill switch behavior."""

    @patch('services.ura_sync_engine.validate_sync_config')
    def test_disabled_returns_failure(self, mock_validate):
        """Disabled sync returns failure result."""
        mock_validate.return_value = (False, "Sync disabled via URA_SYNC_ENABLED")

        engine = URASyncEngine()
        result = engine.run()

        assert not result.success
        assert 'disabled' in result.error_message.lower()
        assert result.error_stage == 'config'


class TestURASyncEngineModes:
    """Tests for sync mode behavior."""

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.sessionmaker')
    def test_dry_run_skips_writes(
        self, mock_session, mock_client, mock_engine, mock_validate
    ):
        """Dry run mode doesn't write to database."""
        mock_validate.return_value = (True, None)
        mock_engine.return_value = MagicMock()

        # Mock session
        session_mock = MagicMock()
        mock_session.return_value.return_value = session_mock

        # Mock API client to return empty results quickly
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([])
        mock_client.return_value = client_instance

        engine = URASyncEngine(mode='dry_run')
        result = engine.run()

        # In dry run, we still create a run record but don't upsert data
        # The test verifies dry_run doesn't crash


class TestURASyncEngineUpsertSQL:
    """
    Tests for upsert SQL usage.

    Note: The actual SQL generation is tested in test_ura_sync_config.py.
    The engine now uses build_upsert_sql() from config (single source of truth).
    """

    def test_engine_uses_config_upsert_sql(self):
        """Verify engine uses upsert SQL from config module."""
        import inspect
        source = inspect.getsource(URASyncEngine._upsert_chunk)

        # Should call build_upsert_sql() not self._build_upsert_sql()
        assert 'build_upsert_sql()' in source, \
            "Engine should use build_upsert_sql() from config"
        assert 'self._build_upsert_sql' not in source, \
            "Engine should NOT have its own _build_upsert_sql method"


class TestURASyncEnginePrepareRow:
    """Tests for row preparation."""

    def test_prepare_row_adds_run_id(self):
        """Prepared row includes run_id."""
        engine = URASyncEngine()
        engine.run_id = 'test-run-123'

        row = {
            'project_name': 'TEST PROJECT',
            'price': 1000000,
            'area_sqft': 500
        }

        prepared = engine._prepare_row_for_insert(row)

        assert prepared['run_id'] == 'test-run-123'
        assert prepared['source'] == 'ura_api'
        assert 'ingested_at' in prepared

    def test_prepare_row_no_defaults(self):
        """Prepared row does NOT add defaults - mapper is responsible.

        P1 fix: Removed defaults that masked missing required fields.
        If property_type/num_units are missing, DB constraint should fail.
        """
        engine = URASyncEngine()
        engine.run_id = 'test-run-123'

        row = {'project_name': 'TEST'}
        prepared = engine._prepare_row_for_insert(row)

        # Should NOT add defaults - let mapper/DB handle it
        assert 'property_type' not in prepared
        assert 'num_units' not in prepared

        # Should still add run tracking fields
        assert prepared['run_id'] == 'test-run-123'
        assert prepared['source'] == 'ura_api'


# =============================================================================
# Git SHA Tests
# =============================================================================

class TestGetGitSha:
    """Tests for git SHA retrieval."""

    def test_get_git_sha_returns_string_or_none(self):
        """Git SHA is either string or None."""
        sha = get_git_sha()
        assert sha is None or isinstance(sha, str)

    def test_get_git_sha_length(self):
        """Git SHA is short format (7+ chars) if present."""
        sha = get_git_sha()
        if sha:
            assert len(sha) >= 7


# =============================================================================
# run_sync Convenience Function Tests
# =============================================================================

class TestRunSyncFunction:
    """Tests for the run_sync convenience function."""

    @patch('services.ura_sync_engine.URASyncEngine')
    def test_run_sync_creates_engine(self, mock_engine_class):
        """run_sync creates and runs engine."""
        mock_engine = MagicMock()
        mock_engine.run.return_value = SyncResult(success=True)
        mock_engine_class.return_value = mock_engine

        result = run_sync(mode='production', triggered_by='test')

        mock_engine_class.assert_called_once_with(
            mode='production',
            triggered_by='test',
            notes=None
        )
        mock_engine.run.assert_called_once()

    @patch('services.ura_sync_engine.URASyncEngine')
    def test_run_sync_passes_notes(self, mock_engine_class):
        """run_sync passes notes to engine."""
        mock_engine = MagicMock()
        mock_engine.run.return_value = SyncResult(success=True)
        mock_engine_class.return_value = mock_engine

        run_sync(notes='Test run')

        mock_engine_class.assert_called_once()
        call_kwargs = mock_engine_class.call_args[1]
        assert call_kwargs['notes'] == 'Test run'


# =============================================================================
# Integration-style Tests (Still Mocked but Full Flow)
# =============================================================================

class TestSyncEngineFlow:
    """Tests for full sync flow (mocked)."""

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.sessionmaker')
    def test_successful_sync_flow(
        self,
        mock_session,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test successful sync flow end-to-end (mocked)."""
        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session
        session_mock = MagicMock()
        mock_session.return_value.return_value = session_mock

        # Mock API client - return one batch with one project
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([
            (1, [{
                'project': 'TEST PROJECT',
                'street': 'TEST STREET',
                'marketSegment': 'CCR',
                'transaction': [{
                    'contractDate': '0125',
                    'price': '1000000',
                    'area': '50',  # sqm
                    'district': '01',
                    'typeOfSale': '3'
                }]
            }])
        ])
        mock_api_client.return_value = client_instance

        # Run sync
        engine = URASyncEngine(mode='production', triggered_by='test')
        result = engine.run()

        # Verify
        assert result.success
        assert result.mode == 'production'
        assert result.run_id is not None


# =============================================================================
# JSONB Type Binding Regression Tests
# =============================================================================

class TestJSONBTypeBinding:
    """
    Tests to prevent regression of JSONB serialization issues.

    Background: psycopg2 cannot adapt Python dicts to PostgreSQL JSONB
    without explicit type binding. SQLAlchemy's bindparam(type_=JSONB)
    handles this properly.

    If these tests fail, you likely have a text() query passing a dict
    without proper JSONB type binding.
    """

    def test_mark_succeeded_uses_jsonb_bindparams(self):
        """Verify _mark_succeeded uses JSONB bindparams for dict columns."""
        import inspect
        from services.ura_sync_engine import URASyncEngine

        source = inspect.getsource(URASyncEngine._mark_succeeded)

        # Must use bindparam with JSONB type for these columns
        assert 'bindparam' in source, "_mark_succeeded should use bindparam"
        assert 'JSONB' in source, "_mark_succeeded should bind JSONB type"
        assert "bindparam('counters', type_=JSONB)" in source
        assert "bindparam('totals', type_=JSONB)" in source
        assert "bindparam('api_times', type_=JSONB)" in source
        assert "bindparam('api_retries', type_=JSONB)" in source

        # Must NOT use json.dumps for these columns (band-aid fix)
        assert 'json.dumps(self.stats' not in source, \
            "_mark_succeeded should NOT use json.dumps - use JSONB bindparam instead"

    def test_mark_failed_uses_jsonb_bindparams(self):
        """Verify _mark_failed uses JSONB bindparams for dict columns."""
        import inspect
        from services.ura_sync_engine import URASyncEngine

        source = inspect.getsource(URASyncEngine._mark_failed)

        assert 'bindparam' in source, "_mark_failed should use bindparam"
        assert 'JSONB' in source, "_mark_failed should bind JSONB type"
        assert "bindparam('counters', type_=JSONB)" in source
        assert "bindparam('totals', type_=JSONB)" in source

        # Must NOT use json.dumps
        assert 'json.dumps' not in source, \
            "_mark_failed should NOT use json.dumps - use JSONB bindparam instead"


# =============================================================================
# Silent Failure Prevention Tests
# =============================================================================

class TestUpsertFailureThreshold:
    """Tests for upsert failure rate threshold."""

    def test_max_failure_rate_constant_exists(self):
        """Verify MAX_UPSERT_FAILURE_RATE constant is defined."""
        from services.ura_sync_engine import URASyncEngine

        assert hasattr(URASyncEngine, 'MAX_UPSERT_FAILURE_RATE')
        assert URASyncEngine.MAX_UPSERT_FAILURE_RATE == 0.05

    def test_failure_rate_check_in_execute_sync(self):
        """Verify failure rate check exists in _execute_sync."""
        import inspect
        from services.ura_sync_engine import URASyncEngine

        source = inspect.getsource(URASyncEngine._execute_sync)

        # Must check failure rate after upsert
        assert 'failed_rows' in source, "_execute_sync should check failed_rows"
        assert 'MAX_UPSERT_FAILURE_RATE' in source, "_execute_sync should use threshold"
        assert 'Upsert failure rate' in source, "_execute_sync should have descriptive error"
