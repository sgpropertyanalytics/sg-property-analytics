"""Scraper utility functions."""

from .hashing import compute_json_hash, normalize_json_for_hash
from .schema_diff import detect_schema_changes, SchemaChange
from .diff import (
    DiffStatus,
    ConflictSeverity,
    FieldChange,
    EntityDiff,
    DiffReport,
    compute_entity_diff,
    compute_diff_report,
)

__all__ = [
    "compute_json_hash",
    "normalize_json_for_hash",
    "detect_schema_changes",
    "SchemaChange",
    "DiffStatus",
    "ConflictSeverity",
    "FieldChange",
    "EntityDiff",
    "DiffReport",
    "compute_entity_diff",
    "compute_diff_report",
]
