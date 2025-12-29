"""
Schema Change Detection

Detects structural and value changes between scraped entities
for alerting and audit purposes.
"""
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set
from enum import Enum


class ChangeType(Enum):
    """Types of schema changes detected."""
    NEW_FIELDS = "new_fields"
    REMOVED_FIELDS = "removed_fields"
    VALUE_CHANGE = "value_change"
    TYPE_CHANGE = "type_change"
    STRUCTURE_CHANGE = "structure_change"


@dataclass
class SchemaChange:
    """Represents a detected schema change."""
    change_type: ChangeType
    added_fields: List[str]
    removed_fields: List[str]
    changed_fields: Dict[str, Dict[str, Any]]  # field -> {old, new, reason}

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON storage."""
        return {
            "type": self.change_type.value,
            "added_fields": self.added_fields,
            "removed_fields": self.removed_fields,
            "changed_fields": self.changed_fields,
        }


def detect_schema_changes(
    previous: Dict[str, Any],
    current: Dict[str, Any],
    ignore_fields: Optional[Set[str]] = None
) -> Optional[SchemaChange]:
    """
    Detect schema changes between two extracted entities.

    Args:
        previous: Previously extracted data
        current: Currently extracted data
        ignore_fields: Fields to ignore in comparison

    Returns:
        SchemaChange if changes detected, None otherwise
    """
    ignore_fields = ignore_fields or set()

    prev_keys = set(previous.keys()) - ignore_fields
    curr_keys = set(current.keys()) - ignore_fields

    added_fields = list(curr_keys - prev_keys)
    removed_fields = list(prev_keys - curr_keys)
    changed_fields: Dict[str, Dict[str, Any]] = {}

    # Check common fields for changes
    common_keys = prev_keys & curr_keys
    for key in common_keys:
        old_val = previous[key]
        new_val = current[key]

        if old_val != new_val:
            change_reason = _determine_change_reason(old_val, new_val)
            changed_fields[key] = {
                "old": _safe_repr(old_val),
                "new": _safe_repr(new_val),
                "reason": change_reason,
            }

    # Determine overall change type
    if not added_fields and not removed_fields and not changed_fields:
        return None

    if added_fields and removed_fields:
        change_type = ChangeType.STRUCTURE_CHANGE
    elif added_fields:
        change_type = ChangeType.NEW_FIELDS
    elif removed_fields:
        change_type = ChangeType.REMOVED_FIELDS
    elif any(c.get("reason") == "type_change" for c in changed_fields.values()):
        change_type = ChangeType.TYPE_CHANGE
    else:
        change_type = ChangeType.VALUE_CHANGE

    return SchemaChange(
        change_type=change_type,
        added_fields=added_fields,
        removed_fields=removed_fields,
        changed_fields=changed_fields,
    )


def _determine_change_reason(old_val: Any, new_val: Any) -> str:
    """Determine why a value changed."""
    old_type = type(old_val).__name__
    new_type = type(new_val).__name__

    if old_type != new_type:
        return "type_change"

    if isinstance(old_val, dict) and isinstance(new_val, dict):
        return "nested_change"

    if isinstance(old_val, list) and isinstance(new_val, list):
        if len(old_val) != len(new_val):
            return "list_length_change"
        return "list_content_change"

    return "value_change"


def _safe_repr(val: Any, max_len: int = 100) -> str:
    """
    Safe string representation for logging/storage.

    Truncates long values to prevent log bloat.
    """
    repr_str = repr(val)
    if len(repr_str) > max_len:
        return repr_str[:max_len] + "..."
    return repr_str


def summarize_changes(changes: List[SchemaChange]) -> Dict[str, Any]:
    """
    Summarize multiple schema changes into a report.

    Args:
        changes: List of detected changes

    Returns:
        Summary dictionary
    """
    if not changes:
        return {"total": 0, "by_type": {}}

    by_type: Dict[str, int] = {}
    all_added: Set[str] = set()
    all_removed: Set[str] = set()
    all_changed: Set[str] = set()

    for change in changes:
        type_name = change.change_type.value
        by_type[type_name] = by_type.get(type_name, 0) + 1
        all_added.update(change.added_fields)
        all_removed.update(change.removed_fields)
        all_changed.update(change.changed_fields.keys())

    return {
        "total": len(changes),
        "by_type": by_type,
        "unique_added_fields": list(all_added),
        "unique_removed_fields": list(all_removed),
        "unique_changed_fields": list(all_changed),
    }
