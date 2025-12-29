"""
Unit tests for CSV diff detection in the ingestion orchestrator.

Tests:
- compute_diff_for_upcoming_launches()
- compute_diff_for_new_launch_units()
- run_csv_upload_with_diff()
- CSV transformation methods
- Promotion with conflict gating
"""

import pytest
import tempfile
import os
from unittest.mock import MagicMock, patch
from datetime import date

import sys
from pathlib import Path
backend_path = Path(__file__).parent.parent
if str(backend_path) not in sys.path:
    sys.path.insert(0, str(backend_path))

from scrapers.utils.diff import (
    DiffStatus,
    ConflictSeverity,
    DiffReport,
    EntityDiff,
    FieldChange,
    compute_entity_diff,
    compute_diff_report,
)


class TestDiffStatus:
    """Tests for DiffStatus enum"""

    def test_status_values(self):
        assert DiffStatus.UNCHANGED.value == "unchanged"
        assert DiffStatus.CHANGED.value == "changed"
        assert DiffStatus.NEW.value == "new"
        assert DiffStatus.MISSING.value == "missing"


class TestConflictSeverity:
    """Tests for ConflictSeverity enum"""

    def test_severity_values(self):
        assert ConflictSeverity.WARNING.value == "warning"
        assert ConflictSeverity.BLOCK.value == "block"


class TestComputeEntityDiff:
    """Tests for compute_entity_diff()"""

    def test_unchanged_record(self):
        """Records with identical values should be UNCHANGED"""
        existing_data = {"name": "Test", "units": 100, "district": "D01"}
        incoming_data = {"name": "Test", "units": 100, "district": "D01"}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=existing_data,
            compare_fields={"name", "units", "district"},
        )

        assert diff.status == DiffStatus.UNCHANGED
        assert len(diff.changes) == 0
        assert not diff.has_conflicts

    def test_changed_record(self):
        """Records with different values should be CHANGED"""
        existing_data = {"name": "Test", "units": 100, "district": "D01"}
        incoming_data = {"name": "Test", "units": 150, "district": "D01"}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=existing_data,
            compare_fields={"name", "units", "district"},
        )

        assert diff.status == DiffStatus.CHANGED
        assert len(diff.changes) == 1
        assert diff.changes[0].field_name == "units"
        assert diff.changes[0].old_value == 100
        assert diff.changes[0].new_value == 150

    def test_new_record(self):
        """Record with no existing should be NEW"""
        incoming_data = {"name": "Test", "units": 100, "district": "D01"}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=None,
            compare_fields={"name", "units", "district"},
        )

        assert diff.status == DiffStatus.NEW
        assert len(diff.changes) == 0

    def test_multiple_field_changes(self):
        """Multiple field changes should all be tracked"""
        existing_data = {"name": "Old Name", "units": 100, "district": "D01"}
        incoming_data = {"name": "New Name", "units": 150, "district": "D02"}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=existing_data,
            compare_fields={"name", "units", "district"},
        )

        assert diff.status == DiffStatus.CHANGED
        assert len(diff.changes) == 3

        field_names = {c.field_name for c in diff.changes}
        assert field_names == {"name", "units", "district"}

    def test_null_to_value_change(self):
        """Null to value should be tracked as change"""
        existing_data = {"name": "Test", "units": None}
        incoming_data = {"name": "Test", "units": 100}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=existing_data,
            compare_fields={"name", "units"},
        )

        assert diff.status == DiffStatus.CHANGED
        assert len(diff.changes) == 1
        assert diff.changes[0].change_type == "null_to_value"

    def test_value_to_null_change(self):
        """Value to null should be tracked as change"""
        existing_data = {"name": "Test", "units": 100}
        incoming_data = {"name": "Test", "units": None}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=existing_data,
            compare_fields={"name", "units"},
        )

        assert diff.status == DiffStatus.CHANGED
        assert len(diff.changes) == 1
        assert diff.changes[0].change_type == "value_to_null"

    def test_only_compare_specified_fields(self):
        """Only specified fields should be compared"""
        existing_data = {"name": "Test", "units": 100, "extra": "old"}
        incoming_data = {"name": "Test", "units": 100, "extra": "new"}

        diff = compute_entity_diff(
            entity_key="test-1",
            entity_type="upcoming_launch",
            incoming_data=incoming_data,
            existing_data=existing_data,
            compare_fields={"name", "units"},  # 'extra' not included
        )

        assert diff.status == DiffStatus.UNCHANGED
        assert len(diff.changes) == 0


class TestComputeDiffReport:
    """Tests for compute_diff_report()"""

    def test_empty_incoming(self):
        """Empty incoming should mark all existing as MISSING"""
        existing = {
            "proj-1": {"name": "Project 1", "units": 100},
            "proj-2": {"name": "Project 2", "units": 200},
        }

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=[],
            existing_records=existing,
            key_field="name",
            id_field="id",
            compare_fields={"name", "units"},
        )

        assert report.missing_count == 2
        assert report.unchanged_count == 0
        assert report.changed_count == 0
        assert report.new_count == 0

    def test_empty_existing(self):
        """Empty existing should mark all incoming as NEW"""
        incoming = [
            {"name": "Project 1", "units": 100},
            {"name": "Project 2", "units": 200},
        ]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records={},
            key_field="name",
            id_field="id",
            compare_fields={"name", "units"},
        )

        assert report.new_count == 2
        assert report.missing_count == 0
        assert report.unchanged_count == 0
        assert report.changed_count == 0

    def test_mixed_diff_report(self):
        """Test report with mixed statuses"""
        # Keys in existing_records must match what key_field extracts from incoming
        existing = {
            "Project A": {"id": 1, "name": "Project A", "units": 100},
            "Project B": {"id": 2, "name": "Project B", "units": 200},
            "Project C": {"id": 3, "name": "Project C", "units": 300},
        }

        incoming = [
            {"name": "Project A", "units": 100},  # Unchanged
            {"name": "Project B", "units": 250},  # Changed
            {"name": "Project D", "units": 400},  # New
        ]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records=existing,
            key_field="name",
            id_field="id",
            compare_fields={"name", "units"},
        )

        assert report.unchanged_count == 1
        assert report.changed_count == 1
        assert report.new_count == 1
        assert report.missing_count == 1  # Project C

    def test_can_auto_promote_no_conflicts(self):
        """Report without conflicts should allow auto-promote"""
        existing = {"proj-1": {"name": "Project 1", "units": 100}}
        incoming = [{"name": "Project 1", "units": 150}]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records=existing,
            key_field="name",
            id_field="id",
            compare_fields={"name", "units"},
        )

        assert report.can_auto_promote is True
        assert report.blocking_conflicts == 0

    def test_custom_key_field(self):
        """Test using custom key field"""
        existing = {
            "KEY-001": {"id": 1, "project_id": "KEY-001", "units": 100},
        }
        incoming = [
            {"_key": "KEY-001", "project_id": "KEY-001", "units": 150},
        ]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records=existing,
            key_field="_key",
            id_field="id",
            compare_fields={"project_id", "units"},
        )

        assert report.changed_count == 1
        assert report.diffs[0].entity_key == "KEY-001"


class TestDiffReportOutput:
    """Tests for DiffReport output methods"""

    def test_to_dict(self):
        """Test to_dict() serialization"""
        # Key in existing_records must match what key_field extracts from incoming
        existing = {"Project 1": {"id": 1, "name": "Project 1", "units": 100}}
        incoming = [{"name": "Project 1", "units": 150}]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records=existing,
            key_field="name",
            id_field="id",
            compare_fields={"name", "units"},
        )

        result = report.to_dict()

        assert result["source_name"] == "test"
        assert result["source_type"] == "csv_upload"
        assert result["run_id"] == "test-run-1"
        assert result["summary"]["unchanged"] == 0
        assert result["summary"]["changed"] == 1
        assert "diffs" in result

    def test_to_markdown(self):
        """Test to_markdown() output"""
        # Key in existing_records must match what key_field extracts from incoming
        existing = {"Project 1": {"id": 1, "name": "Project 1", "units": 100}}
        incoming = [{"name": "Project 1", "units": 150}]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records=existing,
            key_field="name",
            id_field="id",
            compare_fields={"name", "units"},
        )

        md = report.to_markdown()

        assert "# Diff Report" in md  # Updated to match actual output
        assert "test" in md
        assert "csv_upload" in md


class TestTransformUpcomingLaunchesCSV:
    """Tests for _transform_upcoming_launches_csv()"""

    def test_basic_transformation(self):
        """Test basic CSV row transformation"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        rows = [
            {
                "project_name": "Test Project",
                "developer": "Test Dev",
                "district": "D01",
                "market_segment": "ccr",
                "total_units": "100",
                "psf_min": "2000",
                "psf_max": "2500",
                "tenure": "99-year",
                "source": "URA",
                "confidence": "high",
            }
        ]

        result = orchestrator._transform_upcoming_launches_csv(rows)

        assert len(result) == 1
        assert result[0]["project_name"] == "Test Project"
        assert result[0]["developer"] == "Test Dev"
        assert result[0]["district"] == "D01"
        assert result[0]["market_segment"] == "CCR"
        assert result[0]["total_units"] == 100
        assert result[0]["indicative_psf_low"] == 2000.0
        assert result[0]["indicative_psf_high"] == 2500.0
        assert result[0]["tenure"] == "99-year"
        assert result[0]["data_source"] == "URA"
        assert result[0]["data_confidence"] == "high"

    def test_district_normalization(self):
        """Test district format normalization"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        rows = [
            {"project_name": "Test 1", "district": "1"},
            {"project_name": "Test 2", "district": "01"},
            {"project_name": "Test 3", "district": "D01"},
            {"project_name": "Test 4", "district": "d15"},
        ]

        result = orchestrator._transform_upcoming_launches_csv(rows)

        assert result[0]["district"] == "D01"
        assert result[1]["district"] == "D01"
        assert result[2]["district"] == "D01"
        assert result[3]["district"] == "D15"

    def test_handles_missing_optional_fields(self):
        """Test handling of missing optional fields"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        rows = [
            {
                "project_name": "Minimal Project",
                "district": "D01",
                "total_units": "50",
            }
        ]

        result = orchestrator._transform_upcoming_launches_csv(rows)

        assert len(result) == 1
        assert result[0]["project_name"] == "Minimal Project"
        assert result[0]["total_units"] == 50
        assert result[0]["developer"] is None
        assert result[0]["indicative_psf_low"] is None
        assert result[0]["land_bid_psf"] is None

    def test_handles_invalid_numeric_fields(self):
        """Test handling of invalid numeric values"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        rows = [
            {
                "project_name": "Test Project",
                "total_units": "not-a-number",
                "psf_min": "invalid",
                "launch_year": "abc",
            }
        ]

        result = orchestrator._transform_upcoming_launches_csv(rows)

        assert len(result) == 1
        assert result[0]["total_units"] is None
        assert result[0]["indicative_psf_low"] is None
        assert result[0]["launch_year"] is None


class TestTransformNewLaunchUnitsCSV:
    """Tests for _transform_new_launch_units_csv()"""

    def test_basic_transformation(self):
        """Test basic CSV row transformation"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        rows = [
            {
                "project_name": "Test Project",
                "total_units": "500",
                "developer": "Test Dev",
                "tenure": "Freehold",
                "top": "2025",
                "district": "D10",
                "source": "URA",
            }
        ]

        result = orchestrator._transform_new_launch_units_csv(rows)

        assert len(result) == 1
        assert result[0]["project_name"] == "TEST PROJECT"  # Uppercased
        assert result[0]["total_units"] == 500
        assert result[0]["developer"] == "Test Dev"
        assert result[0]["tenure"] == "Freehold"
        assert result[0]["top"] == 2025
        assert result[0]["district"] == "D10"
        assert result[0]["source"] == "URA"

    def test_uppercase_project_name(self):
        """Test that project names are uppercased for matching"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        rows = [
            {"project_name": "The Sail @ Marina Bay"},
            {"project_name": "d'leedon"},
            {"project_name": "REFLECTIONS AT KEPPEL BAY"},
        ]

        result = orchestrator._transform_new_launch_units_csv(rows)

        assert result[0]["project_name"] == "THE SAIL @ MARINA BAY"
        assert result[1]["project_name"] == "D'LEEDON"
        assert result[2]["project_name"] == "REFLECTIONS AT KEPPEL BAY"


class TestRunCSVUploadWithDiff:
    """Tests for run_csv_upload_with_diff()"""

    def test_file_not_found(self):
        """Test handling of missing CSV file"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        result = orchestrator.run_csv_upload_with_diff(
            csv_type="upcoming_launches",
            file_path="/nonexistent/path.csv",
        )

        assert "error" in result
        assert "not found" in result["error"]

    def test_unknown_csv_type(self):
        """Test handling of unknown CSV type"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        # Create temp CSV file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("project_name,units\n")
            f.write("Test,100\n")
            temp_path = f.name

        try:
            result = orchestrator.run_csv_upload_with_diff(
                csv_type="unknown_type",
                file_path=temp_path,
            )

            assert "error" in result
            assert "Unknown CSV type" in result["error"]
        finally:
            os.unlink(temp_path)

    @patch('scrapers.orchestrator.ScrapingOrchestrator.compute_diff_for_upcoming_launches')
    def test_dry_run_does_not_promote(self, mock_compute_diff):
        """Test that dry_run=True doesn't promote records"""
        from scrapers.orchestrator import ScrapingOrchestrator

        mock_session = MagicMock()
        orchestrator = ScrapingOrchestrator(mock_session)

        # Mock the diff report
        mock_report = MagicMock(spec=DiffReport)
        mock_report.to_dict.return_value = {"summary": {}}
        mock_report.to_markdown.return_value = "# Report"
        mock_report.unchanged_count = 0
        mock_report.changed_count = 1
        mock_report.new_count = 0
        mock_report.missing_count = 0
        mock_report.total_conflicts = 0
        mock_report.blocking_conflicts = 0
        mock_report.can_auto_promote = True
        mock_compute_diff.return_value = mock_report

        # Create temp CSV file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False) as f:
            f.write("project_name,developer,district,market_segment,total_units,psf_min,tenure,source,confidence,last_updated\n")
            f.write("Test,Dev,D01,CCR,100,2000,99-year,URA,high,2024-01-01\n")
            temp_path = f.name

        try:
            result = orchestrator.run_csv_upload_with_diff(
                csv_type="upcoming_launches",
                file_path=temp_path,
                auto_promote=True,
                dry_run=True,  # Should prevent promotion
            )

            # Promotion stats should be None since dry_run=True
            assert result.get("promotion_stats") is None
            assert result.get("diff_summary") is not None
        finally:
            os.unlink(temp_path)


class TestFieldChange:
    """Tests for FieldChange dataclass"""

    def test_basic_field_change(self):
        change = FieldChange(
            field_name="units",
            old_value=100,
            new_value=150,
            change_type="value_change",
        )

        assert change.field_name == "units"
        assert change.old_value == 100
        assert change.new_value == 150
        assert change.is_conflict is False

    def test_conflict_field_change(self):
        change = FieldChange(
            field_name="price",
            old_value=1000000,
            new_value=2000000,
            change_type="value_change",
            is_conflict=True,
            conflict_reason="Numeric swing > 50%",
            conflict_severity=ConflictSeverity.WARNING,
        )

        assert change.is_conflict is True
        assert change.conflict_severity == ConflictSeverity.WARNING
        assert "swing" in change.conflict_reason


class TestEntityDiff:
    """Tests for EntityDiff dataclass"""

    def test_entity_diff_no_conflicts(self):
        diff = EntityDiff(
            entity_key="proj-1",
            entity_type="upcoming_launch",
            status=DiffStatus.CHANGED,
            changes=[
                FieldChange("units", 100, 150, "value_change"),
                FieldChange("name", "Old", "New", "value_change"),
            ],
        )

        assert diff.entity_key == "proj-1"
        assert diff.status == DiffStatus.CHANGED
        assert len(diff.changes) == 2
        assert diff.has_conflicts is False
        assert diff.blocking_conflicts == 0

    def test_entity_diff_with_conflicts(self):
        diff = EntityDiff(
            entity_key="proj-1",
            entity_type="upcoming_launch",
            status=DiffStatus.CHANGED,
            changes=[
                FieldChange("units", 100, 150, "value_change"),
            ],
            has_conflicts=True,
            blocking_conflicts=1,
            warning_conflicts=0,
        )

        assert diff.has_conflicts is True
        assert diff.blocking_conflicts == 1


class TestCaseInsensitiveMatching:
    """Tests for case-insensitive key matching"""

    def test_upcoming_launches_case_insensitive(self):
        """Upcoming launches should match case-insensitively"""
        existing = {
            "the sail @ marina bay": {"id": 1, "project_name": "The Sail @ Marina Bay", "total_units": 100},
        }

        incoming = [
            {"project_name": "THE SAIL @ MARINA BAY", "_key": "the sail @ marina bay", "total_units": 100},
        ]

        report = compute_diff_report(
            source_name="test",
            source_type="csv_upload",
            run_id="test-run-1",
            entity_type="upcoming_launch",
            incoming_records=incoming,
            existing_records=existing,
            key_field="_key",
            id_field="id",
            compare_fields={"total_units"},
        )

        # Should match and be unchanged
        assert report.unchanged_count == 1
        assert report.new_count == 0
