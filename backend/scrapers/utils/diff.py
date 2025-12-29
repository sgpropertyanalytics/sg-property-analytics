"""
Diff Detection Module - Compares incoming data against existing domain data.

Outputs:
- unchanged: No change from existing record
- changed: Values differ (with field-level detail)
- new: Record doesn't exist yet
- missing: Record exists in DB but not in source

Also detects conflicts (suspicious changes that should block promotion).
"""
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Set, Tuple


class DiffStatus(Enum):
    """Status of a record in the diff."""
    UNCHANGED = "unchanged"
    CHANGED = "changed"
    NEW = "new"
    MISSING = "missing"


class ConflictSeverity(Enum):
    """Severity of a detected conflict."""
    WARNING = "warning"  # Suspicious but can proceed
    BLOCK = "block"      # Must be reviewed before promotion


@dataclass
class FieldChange:
    """Details of a single field change."""
    field_name: str
    old_value: Any
    new_value: Any
    change_type: str  # 'value_change', 'null_to_value', 'value_to_null', 'type_change'
    is_conflict: bool = False
    conflict_reason: Optional[str] = None
    conflict_severity: Optional[ConflictSeverity] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field": self.field_name,
            "old": self._serialize(self.old_value),
            "new": self._serialize(self.new_value),
            "change_type": self.change_type,
            "is_conflict": self.is_conflict,
            "conflict_reason": self.conflict_reason,
            "conflict_severity": self.conflict_severity.value if self.conflict_severity else None,
        }

    def _serialize(self, value: Any) -> Any:
        """Serialize value for JSON."""
        if isinstance(value, Decimal):
            return float(value)
        if isinstance(value, datetime):
            return value.isoformat()
        return value


@dataclass
class EntityDiff:
    """Diff result for a single entity."""
    entity_key: str
    entity_type: str
    status: DiffStatus
    changes: List[FieldChange] = field(default_factory=list)
    has_conflicts: bool = False
    blocking_conflicts: int = 0
    warning_conflicts: int = 0

    # For new records
    new_data: Optional[Dict[str, Any]] = None

    # For matching
    existing_id: Optional[int] = None
    incoming_data: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity_key": self.entity_key,
            "entity_type": self.entity_type,
            "status": self.status.value,
            "changes": [c.to_dict() for c in self.changes],
            "has_conflicts": self.has_conflicts,
            "blocking_conflicts": self.blocking_conflicts,
            "warning_conflicts": self.warning_conflicts,
        }

    @property
    def changed_fields(self) -> List[str]:
        """List of field names that changed."""
        return [c.field_name for c in self.changes]

    @property
    def can_auto_promote(self) -> bool:
        """Whether this diff can be auto-promoted (no blocking conflicts)."""
        return self.blocking_conflicts == 0


@dataclass
class DiffReport:
    """Complete diff report for an ingestion run."""
    source_name: str
    source_type: str  # 'scrape', 'csv_upload', 'api'
    run_id: str
    computed_at: datetime = field(default_factory=datetime.utcnow)

    # Diff results
    diffs: List[EntityDiff] = field(default_factory=list)

    # Summary counts
    unchanged_count: int = 0
    changed_count: int = 0
    new_count: int = 0
    missing_count: int = 0

    # Conflict summary
    total_conflicts: int = 0
    blocking_conflicts: int = 0
    warning_conflicts: int = 0

    # Lists for easy access
    unchanged: List[str] = field(default_factory=list)
    changed: List[str] = field(default_factory=list)
    new: List[str] = field(default_factory=list)
    missing: List[str] = field(default_factory=list)
    conflicts: List[EntityDiff] = field(default_factory=list)

    def add_diff(self, diff: EntityDiff):
        """Add a diff to the report and update counts."""
        self.diffs.append(diff)

        if diff.status == DiffStatus.UNCHANGED:
            self.unchanged_count += 1
            self.unchanged.append(diff.entity_key)
        elif diff.status == DiffStatus.CHANGED:
            self.changed_count += 1
            self.changed.append(diff.entity_key)
        elif diff.status == DiffStatus.NEW:
            self.new_count += 1
            self.new.append(diff.entity_key)
        elif diff.status == DiffStatus.MISSING:
            self.missing_count += 1
            self.missing.append(diff.entity_key)

        if diff.has_conflicts:
            self.conflicts.append(diff)
            self.total_conflicts += diff.blocking_conflicts + diff.warning_conflicts
            self.blocking_conflicts += diff.blocking_conflicts
            self.warning_conflicts += diff.warning_conflicts

    @property
    def total_count(self) -> int:
        return len(self.diffs)

    @property
    def can_auto_promote(self) -> bool:
        """Whether the entire batch can be auto-promoted."""
        return self.blocking_conflicts == 0

    @property
    def promotable_count(self) -> int:
        """Number of diffs that can be promoted."""
        return sum(1 for d in self.diffs if d.can_auto_promote and d.status != DiffStatus.MISSING)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_name": self.source_name,
            "source_type": self.source_type,
            "run_id": self.run_id,
            "computed_at": self.computed_at.isoformat(),
            "summary": {
                "total": self.total_count,
                "unchanged": self.unchanged_count,
                "changed": self.changed_count,
                "new": self.new_count,
                "missing": self.missing_count,
            },
            "conflicts": {
                "total": self.total_conflicts,
                "blocking": self.blocking_conflicts,
                "warning": self.warning_conflicts,
            },
            "can_auto_promote": self.can_auto_promote,
            "promotable_count": self.promotable_count,
            "diffs": [d.to_dict() for d in self.diffs if d.status != DiffStatus.UNCHANGED],
        }

    def to_markdown(self) -> str:
        """Generate a markdown report."""
        lines = [
            f"# Diff Report: {self.source_name}",
            "",
            f"**Source Type:** {self.source_type}",
            f"**Run ID:** `{self.run_id}`",
            f"**Computed:** {self.computed_at.strftime('%Y-%m-%d %H:%M:%S')}",
            "",
            "## Summary",
            "",
            "| Status | Count |",
            "|--------|-------|",
            f"| Unchanged | {self.unchanged_count} |",
            f"| Changed | {self.changed_count} |",
            f"| New | {self.new_count} |",
            f"| Missing | {self.missing_count} |",
            f"| **Total** | **{self.total_count}** |",
            "",
        ]

        if self.conflicts:
            lines.extend([
                "## Conflicts",
                "",
                f"**Blocking:** {self.blocking_conflicts} | **Warning:** {self.warning_conflicts}",
                "",
                "| Entity | Field | Old | New | Reason | Severity |",
                "|--------|-------|-----|-----|--------|----------|",
            ])
            for diff in self.conflicts:
                for change in diff.changes:
                    if change.is_conflict:
                        lines.append(
                            f"| {diff.entity_key} | {change.field_name} | "
                            f"{change.old_value} | {change.new_value} | "
                            f"{change.conflict_reason} | {change.conflict_severity.value if change.conflict_severity else 'N/A'} |"
                        )
            lines.append("")

        if self.changed:
            lines.extend([
                "## Changed Records",
                "",
            ])
            for diff in self.diffs:
                if diff.status == DiffStatus.CHANGED and not diff.has_conflicts:
                    fields = ", ".join(diff.changed_fields[:5])
                    if len(diff.changed_fields) > 5:
                        fields += f" (+{len(diff.changed_fields) - 5} more)"
                    lines.append(f"- `{diff.entity_key}`: {fields}")
            lines.append("")

        if self.new:
            lines.extend([
                "## New Records",
                "",
            ])
            for key in self.new[:20]:
                lines.append(f"- `{key}`")
            if len(self.new) > 20:
                lines.append(f"- ... and {len(self.new) - 20} more")
            lines.append("")

        if self.missing:
            lines.extend([
                "## Missing Records (in DB but not in source)",
                "",
            ])
            for key in self.missing[:20]:
                lines.append(f"- `{key}`")
            if len(self.missing) > 20:
                lines.append(f"- ... and {len(self.missing) - 20} more")
            lines.append("")

        # Promotion recommendation
        lines.extend([
            "## Recommendation",
            "",
        ])
        if self.can_auto_promote:
            lines.append(f"✅ **Safe to auto-promote** ({self.promotable_count} records)")
        else:
            lines.append(f"⛔ **Review required** - {self.blocking_conflicts} blocking conflict(s)")

        return "\n".join(lines)


# =============================================================================
# CONFLICT DETECTION RULES
# =============================================================================

# Fields where large swings are suspicious
NUMERIC_SWING_THRESHOLDS = {
    "tendered_price_sgd": 0.20,  # 20% change
    "psf_ppr": 0.15,             # 15% change
    "estimated_units": 0.30,     # 30% change
    "site_area_sqm": 0.10,       # 10% change
    "max_gfa_sqm": 0.10,         # 10% change
}

# Invalid state transitions
INVALID_STATUS_TRANSITIONS = {
    ("awarded", "launched"),  # Can't go back from awarded to launched
}

# Fields that should never go from value to null
PROTECTED_FROM_NULL = {
    "release_id",
    "location_raw",
    "status",
}


def _detect_field_conflict(
    field_name: str,
    old_value: Any,
    new_value: Any,
    entity_type: str,
) -> Tuple[bool, Optional[str], Optional[ConflictSeverity]]:
    """
    Detect if a field change is a conflict.

    Returns:
        Tuple of (is_conflict, reason, severity)
    """
    # Status regression
    if field_name == "status":
        transition = (old_value, new_value)
        if transition in INVALID_STATUS_TRANSITIONS:
            return True, f"Invalid status transition: {old_value} → {new_value}", ConflictSeverity.BLOCK

    # Protected fields going to null
    if field_name in PROTECTED_FROM_NULL and new_value is None and old_value is not None:
        return True, f"Protected field {field_name} would become null", ConflictSeverity.BLOCK

    # Large numeric swings
    if field_name in NUMERIC_SWING_THRESHOLDS:
        threshold = NUMERIC_SWING_THRESHOLDS[field_name]
        if old_value and new_value:
            try:
                old_num = float(old_value)
                new_num = float(new_value)
                if old_num > 0:
                    pct_change = abs(new_num - old_num) / old_num
                    if pct_change > threshold:
                        return (
                            True,
                            f"{field_name} changed by {pct_change:.1%} (threshold: {threshold:.0%})",
                            ConflictSeverity.WARNING,
                        )
            except (ValueError, TypeError):
                pass

    return False, None, None


def _normalize_value(value: Any) -> Any:
    """Normalize value for comparison."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        return value.strip() if value.strip() else None
    return value


def _values_equal(old: Any, new: Any) -> bool:
    """Compare two values for equality, handling type differences."""
    old_norm = _normalize_value(old)
    new_norm = _normalize_value(new)

    # Both None
    if old_norm is None and new_norm is None:
        return True

    # One is None
    if old_norm is None or new_norm is None:
        return False

    # Numeric comparison with tolerance
    if isinstance(old_norm, (int, float)) and isinstance(new_norm, (int, float)):
        if old_norm == 0 and new_norm == 0:
            return True
        if old_norm == 0 or new_norm == 0:
            return abs(old_norm - new_norm) < 0.01
        return abs(old_norm - new_norm) / max(abs(old_norm), abs(new_norm)) < 0.001

    return old_norm == new_norm


def compute_entity_diff(
    entity_key: str,
    entity_type: str,
    incoming_data: Dict[str, Any],
    existing_data: Optional[Dict[str, Any]],
    existing_id: Optional[int] = None,
    compare_fields: Optional[Set[str]] = None,
) -> EntityDiff:
    """
    Compute diff for a single entity.

    Args:
        entity_key: Unique identifier for the entity
        entity_type: Type of entity (e.g., 'gls_tender')
        incoming_data: New data from scrape/upload
        existing_data: Current data from database (None if new)
        existing_id: Database ID of existing record
        compare_fields: Optional set of fields to compare (defaults to all)

    Returns:
        EntityDiff with status and changes
    """
    # New record
    if existing_data is None:
        return EntityDiff(
            entity_key=entity_key,
            entity_type=entity_type,
            status=DiffStatus.NEW,
            new_data=incoming_data,
            incoming_data=incoming_data,
        )

    # Compare fields
    changes = []
    blocking = 0
    warning = 0

    # Determine fields to compare
    if compare_fields:
        fields_to_check = compare_fields
    else:
        fields_to_check = set(incoming_data.keys()) | set(existing_data.keys())

    for field_name in fields_to_check:
        old_value = existing_data.get(field_name)
        new_value = incoming_data.get(field_name)

        if not _values_equal(old_value, new_value):
            # Determine change type
            if old_value is None:
                change_type = "null_to_value"
            elif new_value is None:
                change_type = "value_to_null"
            elif type(old_value) != type(new_value):
                change_type = "type_change"
            else:
                change_type = "value_change"

            # Check for conflicts
            is_conflict, reason, severity = _detect_field_conflict(
                field_name, old_value, new_value, entity_type
            )

            if is_conflict:
                if severity == ConflictSeverity.BLOCK:
                    blocking += 1
                else:
                    warning += 1

            changes.append(FieldChange(
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                change_type=change_type,
                is_conflict=is_conflict,
                conflict_reason=reason,
                conflict_severity=severity,
            ))

    if not changes:
        return EntityDiff(
            entity_key=entity_key,
            entity_type=entity_type,
            status=DiffStatus.UNCHANGED,
            existing_id=existing_id,
            incoming_data=incoming_data,
        )

    return EntityDiff(
        entity_key=entity_key,
        entity_type=entity_type,
        status=DiffStatus.CHANGED,
        changes=changes,
        has_conflicts=blocking > 0 or warning > 0,
        blocking_conflicts=blocking,
        warning_conflicts=warning,
        existing_id=existing_id,
        incoming_data=incoming_data,
    )


def compute_diff_report(
    source_name: str,
    source_type: str,
    run_id: str,
    entity_type: str,
    incoming_records: List[Dict[str, Any]],
    existing_records: Dict[str, Dict[str, Any]],
    key_field: str = "release_id",
    id_field: str = "id",
    compare_fields: Optional[Set[str]] = None,
) -> DiffReport:
    """
    Compute diff report comparing incoming records against existing.

    Args:
        source_name: Name of the data source
        source_type: Type of ingestion ('scrape', 'csv_upload', 'api')
        run_id: ID of the ingestion run
        entity_type: Type of entity being compared
        incoming_records: List of new records
        existing_records: Dict of existing records keyed by entity_key
        key_field: Field to use as entity key
        id_field: Field containing database ID
        compare_fields: Optional set of fields to compare

    Returns:
        DiffReport with all diffs and summary
    """
    report = DiffReport(
        source_name=source_name,
        source_type=source_type,
        run_id=run_id,
    )

    # Track which existing records we've seen
    seen_keys = set()

    # Process incoming records
    for record in incoming_records:
        entity_key = record.get(key_field)
        if not entity_key:
            continue

        seen_keys.add(entity_key)
        existing = existing_records.get(entity_key)
        existing_id = existing.get(id_field) if existing else None

        diff = compute_entity_diff(
            entity_key=entity_key,
            entity_type=entity_type,
            incoming_data=record,
            existing_data=existing,
            existing_id=existing_id,
            compare_fields=compare_fields,
        )
        report.add_diff(diff)

    # Find missing records (in DB but not in incoming)
    for entity_key in existing_records:
        if entity_key not in seen_keys:
            report.add_diff(EntityDiff(
                entity_key=entity_key,
                entity_type=entity_type,
                status=DiffStatus.MISSING,
                existing_id=existing_records[entity_key].get(id_field),
            ))

    return report
