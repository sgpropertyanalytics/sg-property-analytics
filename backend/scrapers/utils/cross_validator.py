"""
Cross-Validation Logic - Compares data across multiple Tier B sources.

Core functionality:
1. Source agreement detection (do sources agree on a value?)
2. Confidence scoring based on source count and tier
3. Mismatch categorization (exact, within tolerance, conflict)
4. Recommended action generation

Key rule: Minimum 3 sources must agree for auto-confirmation.
"""
from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

from ..adapters.verification_base import VerificationResult, VerificationConfidence


# =============================================================================
# CONSTANTS
# =============================================================================

# Minimum number of agreeing sources for auto-confirmation
MIN_SOURCES_FOR_AUTO_CONFIRM = 3

# Field-specific tolerances for comparison
# 0.0 = exact match required, 0.05 = 5% tolerance
FIELD_TOLERANCES = {
    "total_units": 0.0,           # Must be exact
    "indicative_psf_low": 0.05,   # 5% tolerance
    "indicative_psf_high": 0.05,  # 5% tolerance
    "site_area_sqft": 0.02,       # 2% tolerance
    "estimated_units": 0.10,      # 10% tolerance (estimates vary)
    "latitude": 0.001,            # ~100m at equator
    "longitude": 0.001,
}

# Fields that must match exactly (no tolerance)
EXACT_MATCH_FIELDS = {"developer", "tenure", "district", "market_segment", "launch_status"}


class VerificationStatus(Enum):
    """Status of a verification result."""
    PENDING = "pending"          # Awaiting processing
    CONFIRMED = "confirmed"      # Verified matches current
    MISMATCH = "mismatch"        # Verified differs from current
    UNVERIFIED = "unverified"    # Insufficient sources (< 3)
    CONFLICT = "conflict"        # Sources disagree with each other


class RecommendedAction(Enum):
    """Recommended action based on verification result."""
    CONFIRM = "confirm"              # Auto-confirm (3+ sources agree, matches current)
    REVIEW = "review"                # Manual review required
    UPDATE = "update"                # Consider updating to verified value
    INVESTIGATE = "investigate"      # Investigate discrepancy


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class FieldComparisonResult:
    """Result of comparing a single field across sources."""
    field_name: str
    current_value: Any
    verified_value: Any            # Consensus or most common value
    sources_agree: bool
    source_values: Dict[str, Any]  # {source_domain: value}
    confidence_score: float
    is_mismatch: bool
    delta: Optional[float] = None  # Absolute difference (for numeric fields)
    delta_pct: Optional[float] = None  # Percentage difference
    tolerance: Optional[float] = None  # Tolerance used for comparison
    within_tolerance: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "field": self.field_name,
            "current": self.current_value,
            "verified": self.verified_value,
            "sources_agree": self.sources_agree,
            "source_values": self.source_values,
            "confidence_score": self.confidence_score,
            "is_mismatch": self.is_mismatch,
            "delta": self.delta,
            "delta_pct": self.delta_pct,
            "tolerance": self.tolerance,
            "within_tolerance": self.within_tolerance,
        }


@dataclass
class CrossValidationResult:
    """Result of cross-validating a project against multiple sources."""
    project_name: str
    entity_type: str
    verification_status: VerificationStatus
    confidence_score: float
    agreeing_source_count: int
    total_source_count: int
    field_results: List[FieldComparisonResult] = field(default_factory=list)
    recommended_action: RecommendedAction = RecommendedAction.REVIEW
    sources_used: List[str] = field(default_factory=list)
    can_auto_confirm: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "project_name": self.project_name,
            "entity_type": self.entity_type,
            "verification_status": self.verification_status.value,
            "confidence_score": self.confidence_score,
            "agreeing_source_count": self.agreeing_source_count,
            "total_source_count": self.total_source_count,
            "field_results": [f.to_dict() for f in self.field_results],
            "recommended_action": self.recommended_action.value,
            "sources_used": self.sources_used,
            "can_auto_confirm": self.can_auto_confirm,
        }

    @property
    def has_mismatches(self) -> bool:
        return any(f.is_mismatch for f in self.field_results)

    @property
    def mismatch_fields(self) -> List[str]:
        return [f.field_name for f in self.field_results if f.is_mismatch]


# =============================================================================
# CORE FUNCTIONS
# =============================================================================

def cross_validate_project(
    project_name: str,
    entity_type: str,
    current_data: Dict[str, Any],
    verification_results: List[VerificationResult],
    tolerance_rules: Optional[Dict[str, float]] = None,
) -> CrossValidationResult:
    """
    Cross-validate a project against multiple verification sources.

    Args:
        project_name: Name of the project being verified
        entity_type: Type of entity ('unit_count', 'upcoming_launch', etc.)
        current_data: Current data from our system
        verification_results: Results from Tier B verification adapters
        tolerance_rules: Optional custom tolerance rules (overrides defaults)

    Returns:
        CrossValidationResult with status, confidence, and field-level details
    """
    tolerances = {**FIELD_TOLERANCES, **(tolerance_rules or {})}

    # Filter to only found results
    found_results = [r for r in verification_results if r.found and not r.error]
    total_source_count = len(found_results)
    sources_used = [r.source_domain for r in found_results]

    # Handle insufficient sources
    if total_source_count == 0:
        return CrossValidationResult(
            project_name=project_name,
            entity_type=entity_type,
            verification_status=VerificationStatus.UNVERIFIED,
            confidence_score=0.0,
            agreeing_source_count=0,
            total_source_count=0,
            recommended_action=RecommendedAction.INVESTIGATE,
            sources_used=[],
        )

    # Aggregate field values from all sources
    field_values = aggregate_field_values(found_results)

    # Compare each field
    field_results = []
    for field_name, source_values in field_values.items():
        current_value = current_data.get(field_name)
        tolerance = tolerances.get(field_name, 0.0)

        field_result = compare_field(
            field_name=field_name,
            current_value=current_value,
            source_values=source_values,
            tolerance=tolerance,
        )
        field_results.append(field_result)

    # Calculate overall source agreement
    agreeing_count, all_agree = calculate_source_agreement(field_results)

    # Calculate overall confidence score
    confidence = compute_confidence_score(
        total_source_count=total_source_count,
        agreeing_source_count=agreeing_count,
        field_results=field_results,
    )

    # Determine verification status
    has_mismatches = any(f.is_mismatch for f in field_results)
    sources_conflict = not all_agree

    if sources_conflict:
        status = VerificationStatus.CONFLICT
    elif total_source_count < MIN_SOURCES_FOR_AUTO_CONFIRM:
        status = VerificationStatus.UNVERIFIED
    elif has_mismatches:
        status = VerificationStatus.MISMATCH
    else:
        status = VerificationStatus.CONFIRMED

    # Determine recommended action
    action = determine_recommended_action(
        status=status,
        agreeing_count=agreeing_count,
        has_mismatches=has_mismatches,
        confidence=confidence,
    )

    # Can auto-confirm?
    can_auto = (
        agreeing_count >= MIN_SOURCES_FOR_AUTO_CONFIRM
        and status == VerificationStatus.CONFIRMED
        and not has_mismatches
    )

    return CrossValidationResult(
        project_name=project_name,
        entity_type=entity_type,
        verification_status=status,
        confidence_score=confidence,
        agreeing_source_count=agreeing_count,
        total_source_count=total_source_count,
        field_results=field_results,
        recommended_action=action,
        sources_used=sources_used,
        can_auto_confirm=can_auto,
    )


def aggregate_field_values(
    verification_results: List[VerificationResult],
) -> Dict[str, Dict[str, Any]]:
    """
    Aggregate field values from multiple verification results.

    Args:
        verification_results: List of VerificationResult objects

    Returns:
        Dict mapping field_name to {source_domain: value}
    """
    field_values: Dict[str, Dict[str, Any]] = {}

    for result in verification_results:
        if not result.found or result.error:
            continue

        for field_name, value in result.data.items():
            if value is None:
                continue

            if field_name not in field_values:
                field_values[field_name] = {}

            field_values[field_name][result.source_domain] = value

    return field_values


def compare_field(
    field_name: str,
    current_value: Any,
    source_values: Dict[str, Any],
    tolerance: float = 0.0,
) -> FieldComparisonResult:
    """
    Compare a single field against multiple source values.

    Args:
        field_name: Name of the field
        current_value: Current value in our system
        source_values: Dict of {source_domain: value}
        tolerance: Allowed tolerance for numeric comparisons (0.0 = exact)

    Returns:
        FieldComparisonResult with comparison details
    """
    # Get consensus value (most common value)
    verified_value, sources_agree = get_consensus_value(source_values)

    # Calculate confidence based on source agreement
    values = list(source_values.values())
    confidence = calculate_field_confidence(values, field_name)

    # Check for mismatch
    is_mismatch = False
    delta = None
    delta_pct = None
    within_tolerance = True

    if current_value is not None and verified_value is not None:
        # Numeric comparison
        if isinstance(current_value, (int, float, Decimal)) and isinstance(verified_value, (int, float, Decimal)):
            current_num = float(current_value)
            verified_num = float(verified_value)

            if current_num != 0:
                delta = abs(verified_num - current_num)
                delta_pct = delta / abs(current_num)
                within_tolerance = delta_pct <= tolerance
                is_mismatch = not within_tolerance
            elif verified_num != 0:
                # Current is 0, verified is not
                is_mismatch = True
                delta = verified_num
                delta_pct = 1.0

        # String comparison (exact match required for non-numeric)
        elif isinstance(current_value, str) and isinstance(verified_value, str):
            # Normalize for comparison
            current_norm = current_value.strip().upper()
            verified_norm = verified_value.strip().upper()
            is_mismatch = current_norm != verified_norm

    return FieldComparisonResult(
        field_name=field_name,
        current_value=current_value,
        verified_value=verified_value,
        sources_agree=sources_agree,
        source_values=source_values,
        confidence_score=confidence,
        is_mismatch=is_mismatch,
        delta=delta,
        delta_pct=delta_pct,
        tolerance=tolerance,
        within_tolerance=within_tolerance,
    )


def get_consensus_value(source_values: Dict[str, Any]) -> Tuple[Any, bool]:
    """
    Get the consensus value from multiple sources.

    For numeric values: use mode (most common), fall back to median
    For string values: use mode (most common)

    Args:
        source_values: Dict of {source_domain: value}

    Returns:
        Tuple of (consensus_value, all_sources_agree)
    """
    if not source_values:
        return None, True

    values = list(source_values.values())

    # Check if all values agree
    unique_values = set()
    for v in values:
        if isinstance(v, (int, float, Decimal)):
            unique_values.add(float(v))
        else:
            unique_values.add(str(v).strip().upper() if v else None)

    all_agree = len(unique_values) == 1

    # Get most common value
    counter = Counter()
    for v in values:
        if isinstance(v, (int, float, Decimal)):
            counter[float(v)] += 1
        else:
            counter[str(v).strip() if v else None] += 1

    most_common = counter.most_common(1)
    if most_common:
        consensus = most_common[0][0]
        # Convert back to int if all values were integers
        if isinstance(consensus, float) and all(isinstance(v, int) for v in values):
            consensus = int(consensus)
        return consensus, all_agree

    return values[0], all_agree


def calculate_field_confidence(values: List[Any], field_name: str) -> float:
    """
    Calculate confidence score for a field based on source agreement.

    Args:
        values: List of values from different sources
        field_name: Name of the field

    Returns:
        Confidence score between 0.0 and 1.0
    """
    if not values:
        return 0.0

    n = len(values)

    # Single source = low confidence
    if n == 1:
        return 0.5

    # Check agreement
    unique_values = set()
    for v in values:
        if isinstance(v, (int, float, Decimal)):
            unique_values.add(float(v))
        else:
            unique_values.add(str(v).strip().upper() if v else None)

    agreement_ratio = 1.0 / len(unique_values) if unique_values else 0.0

    # Base confidence on source count and agreement
    if n >= 3 and agreement_ratio == 1.0:
        return 0.95  # 3+ sources all agree = HIGH
    elif n >= 2 and agreement_ratio == 1.0:
        return 0.8   # 2 sources agree = MEDIUM
    elif n >= 3:
        return 0.6   # 3+ sources, some disagree
    else:
        return 0.4   # 1-2 sources, disagreement


def calculate_source_agreement(field_results: List[FieldComparisonResult]) -> Tuple[int, bool]:
    """
    Calculate overall source agreement across all fields.

    Args:
        field_results: List of FieldComparisonResult

    Returns:
        Tuple of (agreeing_source_count, all_agree)
    """
    if not field_results:
        return 0, True

    # Count how many fields have all sources agreeing
    fields_with_agreement = sum(1 for f in field_results if f.sources_agree)
    all_agree = fields_with_agreement == len(field_results)

    # Get minimum source count across fields
    min_sources = min(len(f.source_values) for f in field_results) if field_results else 0

    return min_sources, all_agree


def compute_confidence_score(
    total_source_count: int,
    agreeing_source_count: int,
    field_results: List[FieldComparisonResult],
) -> float:
    """
    Compute overall confidence score for a verification.

    Rules (STRICT - 3 source minimum):
    - 3+ sources agree: 0.9+ (HIGH) → Can auto-confirm
    - 2 sources agree: 0.7-0.8 (MEDIUM) → Goes to review
    - 1 source only: 0.5 (LOW) → Goes to review
    - Sources disagree: 0.3 (CONFLICT) → Goes to review

    Args:
        total_source_count: Total number of sources
        agreeing_source_count: Number of sources that agree
        field_results: List of FieldComparisonResult

    Returns:
        Confidence score between 0.0 and 1.0
    """
    if total_source_count == 0:
        return 0.0

    # Average field confidence
    if field_results:
        avg_field_confidence = sum(f.confidence_score for f in field_results) / len(field_results)
    else:
        avg_field_confidence = 0.5

    # Check if all fields agree
    all_agree = all(f.sources_agree for f in field_results) if field_results else True

    # Base confidence on source count
    if total_source_count >= 3 and all_agree:
        base_confidence = 0.95
    elif total_source_count >= 2 and all_agree:
        base_confidence = 0.80
    elif total_source_count >= 3:
        base_confidence = 0.60  # Some disagreement
    elif total_source_count == 2:
        base_confidence = 0.50
    else:
        base_confidence = 0.30  # Single source

    # Weight with field confidence
    final_confidence = (base_confidence * 0.7) + (avg_field_confidence * 0.3)

    return round(final_confidence, 4)


def determine_recommended_action(
    status: VerificationStatus,
    agreeing_count: int,
    has_mismatches: bool,
    confidence: float,
) -> RecommendedAction:
    """
    Determine the recommended action based on verification result.

    Args:
        status: Verification status
        agreeing_count: Number of agreeing sources
        has_mismatches: Whether there are field mismatches
        confidence: Confidence score

    Returns:
        RecommendedAction enum value
    """
    # Auto-confirm only if 3+ sources agree and no mismatches
    if (
        agreeing_count >= MIN_SOURCES_FOR_AUTO_CONFIRM
        and status == VerificationStatus.CONFIRMED
        and not has_mismatches
    ):
        return RecommendedAction.CONFIRM

    # Conflict between sources = investigate
    if status == VerificationStatus.CONFLICT:
        return RecommendedAction.INVESTIGATE

    # Mismatch with high confidence = consider updating
    if has_mismatches and confidence >= 0.8:
        return RecommendedAction.UPDATE

    # Default to review
    return RecommendedAction.REVIEW


def can_auto_confirm(result: CrossValidationResult) -> bool:
    """
    Check if a verification result can be auto-confirmed.

    Requires:
    1. At least 3 sources agree
    2. No mismatches with current value
    3. Confidence >= 0.9

    Args:
        result: CrossValidationResult

    Returns:
        True if can be auto-confirmed
    """
    return (
        result.agreeing_source_count >= MIN_SOURCES_FOR_AUTO_CONFIRM
        and result.verification_status == VerificationStatus.CONFIRMED
        and not result.has_mismatches
        and result.confidence_score >= 0.9
    )
