"""
Field Authority Matrix - Controls which tiers can update which fields.

Implements the field-level permissions for the tiered source system:
- Some fields (coordinates) can only come from Tier A
- Some fields (indicative pricing) allow Tier B with "unverified" label
- Tier C cannot update any canonical fields directly
"""
from dataclasses import dataclass
from typing import Dict, Optional, Set
from enum import Enum

from .tier_system import SourceTier, is_tier_higher_or_equal


class FieldValidation(Enum):
    """How to validate field updates."""
    EXACT_MATCH = "exact_match"  # Must match exactly across sources
    TOLERANCE_5PCT = "tolerance_5pct"  # Allow 5% variance
    TOLERANCE_10PCT = "tolerance_10pct"  # Allow 10% variance
    LATEST_WINS = "latest_wins"  # Most recent update wins
    ALWAYS_UNVERIFIED = "always_unverified"  # Always marked as unverified


@dataclass
class FieldAuthority:
    """Configuration for a single field's authority rules."""
    field_name: str
    min_tier_required: SourceTier  # Minimum tier required to update
    tier_a_authoritative: bool  # Tier A is always trusted for this field
    tier_b_can_update: bool  # Tier B can update this field
    tier_c_can_update: bool  # Tier C can update this field
    requires_verification_label: bool  # Must be labeled as unverified
    verification_label: Optional[str]  # Label text (e.g., "indicative", "unverified")
    validation: FieldValidation  # How to validate across sources
    description: str


# Field authority rules by entity type
FIELD_AUTHORITY_RULES: Dict[str, Dict[str, FieldAuthority]] = {
    "gls_tender": {
        "postal_district": FieldAuthority(
            field_name="postal_district",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Critical location data - Tier A/B only",
        ),
        "coordinates": FieldAuthority(
            field_name="coordinates",
            min_tier_required=SourceTier.A,
            tier_a_authoritative=True,
            tier_b_can_update=False,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Geocoded coordinates - Tier A (OneMap) only",
        ),
        "latitude": FieldAuthority(
            field_name="latitude",
            min_tier_required=SourceTier.A,
            tier_a_authoritative=True,
            tier_b_can_update=False,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Latitude - Tier A (OneMap) only",
        ),
        "longitude": FieldAuthority(
            field_name="longitude",
            min_tier_required=SourceTier.A,
            tier_a_authoritative=True,
            tier_b_can_update=False,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Longitude - Tier A (OneMap) only",
        ),
        "tenure": FieldAuthority(
            field_name="tenure",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Lease tenure - from title deed (Tier A/B)",
        ),
        "market_segment": FieldAuthority(
            field_name="market_segment",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="CCR/RCR/OCR - derived from district (Tier A/B)",
        ),
        "tendered_price_sgd": FieldAuthority(
            field_name="tendered_price_sgd",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Official tender price - Tier A preferred, B can validate",
        ),
        "indicative_psf": FieldAuthority(
            field_name="indicative_psf",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=False,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=True,
            verification_label="indicative",
            validation=FieldValidation.TOLERANCE_5PCT,
            description="Indicative pricing - Tier B allowed with label",
        ),
    },
    "new_launch": {
        "postal_district": FieldAuthority(
            field_name="postal_district",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="District from address - Tier A/B only",
        ),
        "coordinates": FieldAuthority(
            field_name="coordinates",
            min_tier_required=SourceTier.A,
            tier_a_authoritative=True,
            tier_b_can_update=False,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Geocoded coordinates - Tier A only",
        ),
        "tenure": FieldAuthority(
            field_name="tenure",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Lease tenure - Tier A/B only",
        ),
        "total_units": FieldAuthority(
            field_name="total_units",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Official unit count - Tier A/B",
        ),
        "launch_status": FieldAuthority(
            field_name="launch_status",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=False,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.LATEST_WINS,
            description="Coming soon, launched, sold out - Tier B allowed",
        ),
        "promo_discounts": FieldAuthority(
            field_name="promo_discounts",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=False,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=True,
            verification_label="unverified",
            validation=FieldValidation.ALWAYS_UNVERIFIED,
            description="Marketing discounts - always labeled unverified",
        ),
        "unit_mix": FieldAuthority(
            field_name="unit_mix",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=False,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=True,
            verification_label="unverified",
            validation=FieldValidation.LATEST_WINS,
            description="Bedroom mix - Tier B allowed, labeled unverified",
        ),
        "indicative_psf_min": FieldAuthority(
            field_name="indicative_psf_min",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=False,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=True,
            verification_label="indicative",
            validation=FieldValidation.TOLERANCE_10PCT,
            description="Indicative min PSF - Tier B with label",
        ),
        "indicative_psf_max": FieldAuthority(
            field_name="indicative_psf_max",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=False,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=True,
            verification_label="indicative",
            validation=FieldValidation.TOLERANCE_10PCT,
            description="Indicative max PSF - Tier B with label",
        ),
    },
    "project": {
        "postal_district": FieldAuthority(
            field_name="postal_district",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="District - Tier A/B only",
        ),
        "coordinates": FieldAuthority(
            field_name="coordinates",
            min_tier_required=SourceTier.A,
            tier_a_authoritative=True,
            tier_b_can_update=False,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Geocoded coordinates - Tier A (OneMap) only",
        ),
        "developer": FieldAuthority(
            field_name="developer",
            min_tier_required=SourceTier.B,
            tier_a_authoritative=True,
            tier_b_can_update=True,
            tier_c_can_update=False,
            requires_verification_label=False,
            verification_label=None,
            validation=FieldValidation.EXACT_MATCH,
            description="Developer name - Tier A/B",
        ),
    },
}


class FieldAuthorityChecker:
    """Checks field authority rules for updates."""

    def __init__(self, db_session=None):
        """
        Initialize checker.

        Args:
            db_session: Optional database session for loading rules from DB.
                       If None, uses hardcoded rules above.
        """
        self.db_session = db_session
        self._rules = FIELD_AUTHORITY_RULES

    def get_rule(
        self, entity_type: str, field_name: str
    ) -> Optional[FieldAuthority]:
        """
        Get authority rule for a field.

        Args:
            entity_type: Type of entity (gls_tender, new_launch, etc.)
            field_name: Name of the field

        Returns:
            FieldAuthority if rule exists, None otherwise
        """
        entity_rules = self._rules.get(entity_type, {})
        return entity_rules.get(field_name)

    def can_update(
        self,
        entity_type: str,
        field_name: str,
        tier: SourceTier,
        existing_tier: Optional[SourceTier] = None,
    ) -> bool:
        """
        Check if a tier can update a specific field.

        Args:
            entity_type: Type of entity
            field_name: Name of the field
            tier: Tier of the source attempting update
            existing_tier: Current highest tier in canonical (if exists)

        Returns:
            bool: True if update is allowed
        """
        rule = self.get_rule(entity_type, field_name)

        # If no rule, default based on tier
        if rule is None:
            # Unknown fields: Tier A/B can update, Tier C cannot
            return tier in (SourceTier.A, SourceTier.B)

        # Check tier-specific permissions
        if tier == SourceTier.A:
            return True  # Tier A can always update
        elif tier == SourceTier.B:
            if not rule.tier_b_can_update:
                return False
            # If existing data from Tier A, Tier B cannot override
            if existing_tier == SourceTier.A and rule.tier_a_authoritative:
                return False
            return True
        elif tier == SourceTier.C:
            return rule.tier_c_can_update

        return False

    def get_verification_label(
        self, entity_type: str, field_name: str
    ) -> Optional[str]:
        """
        Get verification label for a field (if required).

        Args:
            entity_type: Type of entity
            field_name: Name of the field

        Returns:
            Label string if required, None otherwise
        """
        rule = self.get_rule(entity_type, field_name)
        if rule and rule.requires_verification_label:
            return rule.verification_label
        return None

    def get_restricted_fields(
        self, entity_type: str, tier: SourceTier
    ) -> Set[str]:
        """
        Get all fields that a tier cannot update for an entity type.

        Args:
            entity_type: Type of entity
            tier: Source tier

        Returns:
            Set of field names that are restricted
        """
        entity_rules = self._rules.get(entity_type, {})
        restricted = set()

        for field_name, rule in entity_rules.items():
            if not self.can_update(entity_type, field_name, tier):
                restricted.add(field_name)

        return restricted

    def filter_allowed_fields(
        self,
        entity_type: str,
        tier: SourceTier,
        data: dict,
        existing_tier: Optional[SourceTier] = None,
    ) -> dict:
        """
        Filter data to only include fields the tier can update.

        Args:
            entity_type: Type of entity
            tier: Source tier
            data: Dictionary of field values
            existing_tier: Current highest tier in canonical

        Returns:
            Filtered dictionary with only allowed fields
        """
        return {
            field: value
            for field, value in data.items()
            if self.can_update(entity_type, field, tier, existing_tier)
        }
