"""
Tests for URA Sync Engine

These tests focus on unit testing the sync engine logic.
Integration tests require database and API access.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import date, datetime
import json

from services.ura_sync_engine import (
    URASyncEngine,
    SyncResult,
    run_sync,
    get_database_engine,
    get_git_sha,
)
from services.ura_sync_config import SyncStats


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
            mode='shadow'
        )
        assert result.success
        assert result.run_id == 'abc-123'
        assert result.mode == 'shadow'
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
            mode='shadow',
            duration_seconds=10.5
        )
        d = result.to_dict()
        assert d['success'] is True
        assert d['run_id'] == 'abc-123'
        assert d['duration_seconds'] == 10.5


# =============================================================================
# SyncStats Tests
# =============================================================================

class TestSyncStats:
    """Tests for SyncStats tracking."""

    def test_stats_initialization(self):
        """Stats start at zero."""
        stats = SyncStats()
        assert stats.raw_projects == 0
        assert stats.mapped_rows == 0
        assert stats.inserted_rows == 0
        assert stats.updated_rows == 0
        assert stats.failed_rows == 0

    def test_stats_accumulation(self):
        """Stats can be accumulated."""
        stats = SyncStats()
        stats.raw_projects = 100
        stats.raw_transactions = 5000
        stats.mapped_rows = 4900
        stats.inserted_rows = 4000
        stats.updated_rows = 800
        stats.unchanged_rows = 100

        d = stats.to_dict()
        assert d['raw_projects'] == 100
        assert d['raw_transactions'] == 5000
        assert d['inserted_rows'] == 4000


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
        monkeypatch.setenv('URA_SYNC_MODE', 'shadow')
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
    @patch('services.ura_sync_engine.scoped_session')
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
        # Full integration test would verify no actual writes


class TestURASyncEngineUpsertSQL:
    """Tests for upsert SQL generation."""

    def test_upsert_sql_generation(self):
        """Upsert SQL is valid."""
        engine = URASyncEngine()
        sql = engine._build_upsert_sql()

        # Check it has key components
        assert 'INSERT INTO transactions' in sql
        assert 'ON CONFLICT (row_hash)' in sql
        assert 'DO UPDATE SET' in sql
        assert 'RETURNING' in sql
        assert 'was_inserted' in sql

    def test_upsert_sql_updates_price(self):
        """Upsert SQL updates price field."""
        engine = URASyncEngine()
        sql = engine._build_upsert_sql()
        assert 'price = EXCLUDED.price' in sql

    def test_upsert_sql_updates_run_id(self):
        """Upsert SQL updates run_id field."""
        engine = URASyncEngine()
        sql = engine._build_upsert_sql()
        assert 'run_id = EXCLUDED.run_id' in sql


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

    def test_prepare_row_defaults(self):
        """Prepared row has defaults for optional fields."""
        engine = URASyncEngine()
        engine.run_id = 'test-run-123'

        row = {'project_name': 'TEST'}
        prepared = engine._prepare_row_for_insert(row)

        assert prepared['property_type'] == 'Condominium'
        assert prepared['num_units'] == 1


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

        result = run_sync(mode='shadow', triggered_by='test')

        mock_engine_class.assert_called_once_with(
            mode='shadow',
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
    @patch('services.ura_sync_engine.URAShadowComparator')
    @patch('services.ura_sync_engine.scoped_session')
    def test_successful_sync_flow(
        self,
        mock_session,
        mock_comparator,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test successful sync flow end-to-end (mocked)."""
        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session - need to return proper value for baseline check
        from datetime import date, timedelta
        session_mock = MagicMock()
        # Mock execute to return baseline count >= 1000 and fresh data
        baseline_result_mock = MagicMock()
        baseline_result_mock.fetchone.return_value = MagicMock(
            cnt=5000,  # Sufficient baseline
            latest_month=date.today() - timedelta(days=30)  # Fresh data
        )
        session_mock.execute.return_value = baseline_result_mock
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

        # Mock comparator
        from services.ura_shadow_comparator import ComparisonReport
        mock_report = ComparisonReport(
            current_source='test-run',
            baseline_source='csv',
            is_acceptable=True
        )
        comparator_instance = MagicMock()
        comparator_instance.compare_run_vs_csv.return_value = mock_report
        mock_comparator.return_value = comparator_instance

        # Run sync
        engine = URASyncEngine(mode='shadow', triggered_by='test')
        result = engine.run()

        # Verify
        assert result.success
        assert result.mode == 'shadow'
        assert result.run_id is not None

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.URAShadowComparator')
    @patch('services.ura_sync_engine.scoped_session')
    def test_threshold_exceeded_marks_failed(
        self,
        mock_session,
        mock_comparator,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test that threshold exceeded marks run as failed."""
        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session - need to return proper value for baseline check
        from datetime import date, timedelta
        session_mock = MagicMock()
        baseline_result_mock = MagicMock()
        baseline_result_mock.fetchone.return_value = MagicMock(
            cnt=5000,  # Sufficient baseline
            latest_month=date.today() - timedelta(days=30)  # Fresh data
        )
        session_mock.execute.return_value = baseline_result_mock
        mock_session.return_value.return_value = session_mock

        # Mock API client - return empty for speed
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([])
        mock_api_client.return_value = client_instance

        # Mock comparator - return unacceptable report
        from services.ura_shadow_comparator import ComparisonReport
        mock_report = ComparisonReport(
            current_source='test-run',
            baseline_source='csv',
            is_acceptable=False,
            issues=['Row count diff 10% exceeds threshold']
        )
        comparator_instance = MagicMock()
        comparator_instance.compare_run_vs_csv.return_value = mock_report
        mock_comparator.return_value = comparator_instance

        # Run sync
        engine = URASyncEngine(mode='shadow')
        result = engine.run()

        # Verify failure
        assert not result.success
        assert result.error_stage == 'compare'
        assert 'Thresholds exceeded' in result.error_message

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.scoped_session')
    def test_baseline_missing_marks_failed(
        self,
        mock_session,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test that missing baseline marks run as failed."""
        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session - return 0 rows for baseline check
        session_mock = MagicMock()
        baseline_result_mock = MagicMock()
        baseline_result_mock.fetchone.return_value = MagicMock(
            cnt=0,  # No baseline data
            latest_month=None
        )
        session_mock.execute.return_value = baseline_result_mock
        mock_session.return_value.return_value = session_mock

        # Mock API client - return empty for speed
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([])
        mock_api_client.return_value = client_instance

        # Run sync
        engine = URASyncEngine(mode='shadow')
        result = engine.run()

        # Verify failure due to missing baseline
        assert not result.success
        assert result.error_stage == 'sync'
        assert 'Baseline unavailable' in result.error_message

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.scoped_session')
    def test_baseline_too_small_marks_failed(
        self,
        mock_session,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test that insufficient baseline marks run as failed."""
        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session - return < 1000 rows for baseline check
        from datetime import date, timedelta
        session_mock = MagicMock()
        baseline_result_mock = MagicMock()
        baseline_result_mock.fetchone.return_value = MagicMock(
            cnt=500,  # Insufficient baseline
            latest_month=date.today() - timedelta(days=30)
        )
        session_mock.execute.return_value = baseline_result_mock
        mock_session.return_value.return_value = session_mock

        # Mock API client - return empty for speed
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([])
        mock_api_client.return_value = client_instance

        # Run sync
        engine = URASyncEngine(mode='shadow')
        result = engine.run()

        # Verify failure due to insufficient baseline
        assert not result.success
        assert result.error_stage == 'sync'
        assert 'minimum' in result.error_message.lower()

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.scoped_session')
    def test_baseline_stale_marks_failed(
        self,
        mock_session,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test that stale baseline marks run as failed."""
        from datetime import date, timedelta

        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session - return stale data (>6 months old)
        session_mock = MagicMock()
        baseline_result_mock = MagicMock()
        stale_date = date.today() - timedelta(days=200)  # ~7 months ago
        baseline_result_mock.fetchone.return_value = MagicMock(
            cnt=5000,
            latest_month=stale_date
        )
        session_mock.execute.return_value = baseline_result_mock
        mock_session.return_value.return_value = session_mock

        # Mock API client - return empty for speed
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([])
        mock_api_client.return_value = client_instance

        # Run sync
        engine = URASyncEngine(mode='shadow')
        result = engine.run()

        # Verify failure due to stale baseline
        assert not result.success
        assert result.error_stage == 'sync'
        assert 'stale' in result.error_message.lower()
