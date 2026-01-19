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

    def test_persist_comparison_uses_jsonb_bindparams(self):
        """Verify _persist_comparison uses JSONB bindparams."""
        import inspect
        from services.ura_sync_engine import URASyncEngine

        source = inspect.getsource(URASyncEngine._persist_comparison)

        assert 'bindparam' in source, "_persist_comparison should use bindparam"
        assert 'JSONB' in source, "_persist_comparison should bind JSONB type"
        assert "bindparam('results', type_=JSONB)" in source


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


class TestComparisonFailureHandling:
    """Tests for comparison failure handling."""

    def test_comparison_failure_raises_exception(self):
        """Verify comparison failure raises instead of returning None."""
        import inspect
        from services.ura_sync_engine import URASyncEngine

        source = inspect.getsource(URASyncEngine._run_comparison)

        # Must raise RuntimeError on exception (not swallow and return None)
        assert 'raise RuntimeError' in source, \
            "_run_comparison should raise RuntimeError on failure"

        # Exception handler should NOT return None
        # Find the except block and verify it raises
        assert 'except Exception as e:' in source
        except_block_start = source.find('except Exception as e:')
        except_block = source[except_block_start:except_block_start + 300]
        assert 'raise RuntimeError' in except_block, \
            "Exception handler should raise, not return None"

    @patch('services.ura_sync_engine.validate_sync_config')
    @patch('services.ura_sync_engine.get_database_engine')
    @patch('services.ura_sync_engine.URAAPIClient')
    @patch('services.ura_sync_engine.URAShadowComparator')
    @patch('services.ura_sync_engine.scoped_session')
    def test_comparison_exception_fails_sync(
        self,
        mock_session,
        mock_comparator,
        mock_api_client,
        mock_db_engine,
        mock_validate
    ):
        """Test that comparison exception causes sync failure."""
        from datetime import date, timedelta

        # Setup mocks
        mock_validate.return_value = (True, None)
        mock_db_engine.return_value = MagicMock()

        # Mock session with valid baseline
        session_mock = MagicMock()
        baseline_result_mock = MagicMock()
        baseline_result_mock.fetchone.return_value = MagicMock(
            cnt=5000,
            latest_month=date.today() - timedelta(days=30)
        )
        session_mock.execute.return_value = baseline_result_mock
        mock_session.return_value.return_value = session_mock

        # Mock API client - return empty for speed
        client_instance = MagicMock()
        client_instance.fetch_all_transactions.return_value = iter([])
        mock_api_client.return_value = client_instance

        # Mock comparator to raise exception
        comparator_instance = MagicMock()
        comparator_instance.compare_run_vs_csv.side_effect = Exception("DB connection lost")
        mock_comparator.return_value = comparator_instance

        # Run sync
        engine = URASyncEngine(mode='shadow')
        result = engine.run()

        # Verify failure due to comparison exception
        assert not result.success
        assert result.error_stage == 'sync'
        assert 'Comparison failed' in result.error_message


# =============================================================================
# SQL Injection Prevention Tests (Comparator)
# =============================================================================

class TestComparatorSQLInjectionPrevention:
    """
    Regression tests to prevent SQL injection in shadow comparator.

    These tests verify the architectural fix: SourceFilter + parameterized queries.
    """

    def test_source_filter_dataclass_exists(self):
        """Verify SourceFilter dataclass is used instead of raw strings."""
        from services.ura_shadow_comparator import SourceFilter, FilterType

        # Create filters - should not raise
        run_filter = SourceFilter.for_run('abc-123')
        source_filter = SourceFilter.for_source('csv')

        assert run_filter.filter_type == FilterType.RUN_ID
        assert run_filter.value == 'abc-123'
        assert source_filter.filter_type == FilterType.SOURCE
        assert source_filter.value == 'csv'

    def test_compare_methods_use_source_filter(self):
        """Verify compare methods use SourceFilter, not string interpolation."""
        import inspect
        from services.ura_shadow_comparator import URAShadowComparator

        # Check compare_run_vs_csv
        source = inspect.getsource(URAShadowComparator.compare_run_vs_csv)
        assert "SourceFilter.for_run" in source, \
            "compare_run_vs_csv should use SourceFilter.for_run"
        assert "f\"run_id = " not in source, \
            "compare_run_vs_csv should NOT use f-string SQL"

        # Check compare_runs
        source = inspect.getsource(URAShadowComparator.compare_runs)
        assert "SourceFilter.for_run" in source, \
            "compare_runs should use SourceFilter.for_run"
        assert "f\"run_id = " not in source, \
            "compare_runs should NOT use f-string SQL"

    def test_helper_methods_use_parameterized_queries(self):
        """Verify helper methods build parameterized queries."""
        import inspect
        from services.ura_shadow_comparator import URAShadowComparator

        # Check _get_count uses parameters
        source = inspect.getsource(URAShadowComparator._get_count)
        assert "conn.execute(query, params)" in source, \
            "_get_count should pass params to execute"
        assert "_build_source_condition" in source, \
            "_get_count should use _build_source_condition helper"

        # Check _get_count_by_dimension
        source = inspect.getsource(URAShadowComparator._get_count_by_dimension)
        assert "allowed_dimensions" in source, \
            "_get_count_by_dimension should validate dimension against allowlist"
        assert "_build_source_condition" in source, \
            "_get_count_by_dimension should use parameterized conditions"

    def test_property_types_validated_against_allowlist(self):
        """Verify property_types are validated, not directly interpolated."""
        import inspect
        from services.ura_shadow_comparator import URAShadowComparator

        source = inspect.getsource(URAShadowComparator._compare)

        # Must validate against allowlist
        assert "allowed_types" in source, \
            "_compare should validate property_types against allowlist"
        assert "Condominium" in source and "Apartment" in source, \
            "_compare should have property type allowlist"

        # Must NOT use f-string interpolation for property_types
        assert "f\"'{t}'\"" not in source, \
            "_compare should NOT use f-string to build property_type IN clause"

    def test_build_source_condition_returns_parameterized_query(self):
        """Verify _build_source_condition returns SQL with :param placeholders."""
        from services.ura_shadow_comparator import URAShadowComparator, SourceFilter
        from unittest.mock import MagicMock

        comparator = URAShadowComparator(MagicMock())

        # Test run_id filter
        run_filter = SourceFilter.for_run('test-uuid-123')
        sql, params = comparator._build_source_condition(run_filter, 'current')

        assert ':current_value' in sql, "SQL should use :param placeholder"
        assert params['current_value'] == 'test-uuid-123', "Params should contain the value"
        assert 'test-uuid-123' not in sql, "Value should NOT be in SQL string"

        # Test source filter
        source_filter = SourceFilter.for_source('csv')
        sql, params = comparator._build_source_condition(source_filter, 'baseline')

        assert ':baseline_value' in sql, "SQL should use :param placeholder"
        assert params['baseline_value'] == 'csv', "Params should contain the value"
        assert "'csv'" not in sql, "Value should NOT be quoted in SQL string"

    def test_table_alias_generates_correct_sql(self):
        """
        Test that table_alias parameter generates correct prefixed SQL.

        Verifies:
        1. Column names are prefixed with alias (e.g., "b.transaction_month")
        2. Parameter names are NOT affected (e.g., ":property_types" stays unchanged)
        """
        from services.ura_shadow_comparator import URAShadowComparator, SourceFilter
        from unittest.mock import MagicMock
        from datetime import date

        comparator = URAShadowComparator(MagicMock())

        # Test _build_source_condition with table_alias
        run_filter = SourceFilter.for_run('test-uuid')
        sql, params = comparator._build_source_condition(run_filter, 'current', table_alias='c')

        assert 'c.run_id' in sql, "SQL should have table-aliased column"
        assert ':current_value' in sql, "Parameter name should NOT have alias"
        assert params['current_value'] == 'test-uuid'

        # Test _build_common_conditions with table_alias
        common_params = {
            'date_start': date(2021, 1, 1),
            'date_end': date(2025, 1, 1),
            'property_types': ('Condominium', 'Apartment'),
        }
        sql, params = comparator._build_common_conditions(common_params, table_alias='b')

        # Column names should be prefixed
        assert 'b.is_outlier' in sql, "is_outlier should have table alias"
        assert 'b.transaction_month' in sql, "transaction_month should have table alias"
        assert 'b.property_type' in sql, "property_type should have table alias"

        # Parameter names should NOT be prefixed - this was the bug!
        assert ':date_start' in sql, "date_start param should NOT have alias"
        assert ':date_end' in sql, "date_end param should NOT have alias"
        assert ':property_types' in sql, "property_types param should NOT have alias"
        assert 'b.property_types' not in sql, "param name should NOT get alias prefix"

        # Params dict keys should be unchanged
        assert 'date_start' in params
        assert 'date_end' in params
        assert 'property_types' in params

    def test_table_alias_none_default_unchanged(self):
        """
        Test that table_alias=None (default) produces unaliased SQL.

        Ensures backward compatibility with existing call sites.
        """
        from services.ura_shadow_comparator import URAShadowComparator
        from unittest.mock import MagicMock
        from datetime import date

        comparator = URAShadowComparator(MagicMock())

        common_params = {
            'date_start': date(2021, 1, 1),
            'date_end': date(2025, 1, 1),
        }

        # Without table_alias (default behavior)
        sql, params = comparator._build_common_conditions(common_params)

        # Should NOT have any table prefix
        assert 'COALESCE(is_outlier' in sql, "Should have no prefix when alias is None"
        assert 'transaction_month >=' in sql, "Should have no prefix when alias is None"
        assert 'b.' not in sql and 'c.' not in sql, "No table aliases in default mode"
