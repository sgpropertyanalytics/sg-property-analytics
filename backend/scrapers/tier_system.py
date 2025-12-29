"""
Source Tier System - Controls data authority and promotion rules.

Tier A (Authoritative): URA, OneMap, URA Space
- Can update canonical directly
- Full trust for all fields

Tier B (Institutional): EdgeProp, PropNex, ERA, PropertyGuru, 99.co
- Can update canonical with validation
- Cross-validate against Tier A where possible
- Restricted from coordinates, postal_district (Tier A only)

Tier C (Content/Discovery): StackedHomes, property blogs, news, social
- URL discovery and early signals
- Cannot update canonical
- Creates candidates only
"""
from enum import Enum
from dataclasses import dataclass
from typing import Set, Dict, FrozenSet


class SourceTier(Enum):
    """Source tier classification."""
    A = "A"  # Authoritative (Government)
    B = "B"  # Institutional (Portals, Agencies)
    C = "C"  # Content/Discovery (Blogs, News, Social)


@dataclass(frozen=True)
class TierConfig:
    """Configuration for a source tier."""
    tier: SourceTier
    can_update_canonical: bool
    can_create_canonical: bool
    requires_validation: bool
    fields_restricted: FrozenSet[str]  # Fields this tier cannot update
    description: str


# Tier configurations
TIER_CONFIGS: Dict[SourceTier, TierConfig] = {
    SourceTier.A: TierConfig(
        tier=SourceTier.A,
        can_update_canonical=True,
        can_create_canonical=True,
        requires_validation=False,
        fields_restricted=frozenset(),
        description="Authoritative government sources"
    ),
    SourceTier.B: TierConfig(
        tier=SourceTier.B,
        can_update_canonical=True,
        can_create_canonical=True,
        requires_validation=True,
        fields_restricted=frozenset({"coordinates"}),  # Only coordinates restricted
        description="Institutional property portals and agencies"
    ),
    SourceTier.C: TierConfig(
        tier=SourceTier.C,
        can_update_canonical=False,
        can_create_canonical=False,
        requires_validation=True,
        fields_restricted=frozenset({"*"}),  # All fields restricted
        description="Content/discovery sources (blogs, news, social)"
    ),
}


# Domain to tier mapping
DOMAIN_TIER_MAP: Dict[str, SourceTier] = {
    # =========================================================================
    # Tier A - Authoritative (Government)
    # =========================================================================
    "ura.gov.sg": SourceTier.A,
    "www.ura.gov.sg": SourceTier.A,
    "onemap.gov.sg": SourceTier.A,
    "www.onemap.gov.sg": SourceTier.A,
    "data.gov.sg": SourceTier.A,
    "www.data.gov.sg": SourceTier.A,

    # =========================================================================
    # Tier B - Institutional (Portals, Agencies)
    # =========================================================================
    # Property portals
    "edgeprop.sg": SourceTier.B,
    "www.edgeprop.sg": SourceTier.B,
    "propertyguru.com.sg": SourceTier.B,
    "www.propertyguru.com.sg": SourceTier.B,
    "99.co": SourceTier.B,
    "www.99.co": SourceTier.B,
    "srx.com.sg": SourceTier.B,
    "www.srx.com.sg": SourceTier.B,

    # Real estate agencies
    "propnex.com": SourceTier.B,
    "www.propnex.com": SourceTier.B,
    "era.com.sg": SourceTier.B,
    "www.era.com.sg": SourceTier.B,
    "orangetee.com": SourceTier.B,
    "www.orangetee.com": SourceTier.B,
    "huttons.com.sg": SourceTier.B,
    "www.huttons.com.sg": SourceTier.B,

    # =========================================================================
    # Tier C - Content/Discovery (Blogs, News, Social)
    # =========================================================================
    # Property blogs
    "stackedhomes.com": SourceTier.C,
    "www.stackedhomes.com": SourceTier.C,
    "propertysoul.com": SourceTier.C,
    "www.propertysoul.com": SourceTier.C,
    "sgpropertypicks.com": SourceTier.C,
    "www.sgpropertypicks.com": SourceTier.C,
    "newlaunchreview.com": SourceTier.C,
    "www.newlaunchreview.com": SourceTier.C,

    # News/Media
    "businesstimes.com.sg": SourceTier.C,
    "www.businesstimes.com.sg": SourceTier.C,
    "channelnewsasia.com": SourceTier.C,
    "www.channelnewsasia.com": SourceTier.C,
    "straitstimes.com": SourceTier.C,
    "www.straitstimes.com": SourceTier.C,

    # Forums/Social
    "reddit.com": SourceTier.C,
    "www.reddit.com": SourceTier.C,
    "hardwarezone.com.sg": SourceTier.C,
    "www.hardwarezone.com.sg": SourceTier.C,
    "facebook.com": SourceTier.C,
    "www.facebook.com": SourceTier.C,

    # Video/Social
    "tiktok.com": SourceTier.C,
    "www.tiktok.com": SourceTier.C,
    "youtube.com": SourceTier.C,
    "www.youtube.com": SourceTier.C,
}


def get_tier_for_domain(domain: str) -> SourceTier:
    """
    Get source tier for a domain.

    Args:
        domain: Domain name (e.g., 'ura.gov.sg')

    Returns:
        SourceTier: Tier A, B, or C (defaults to C for unknown domains)
    """
    domain = domain.lower().strip()
    # Remove www. prefix for lookup if not found with www
    if domain not in DOMAIN_TIER_MAP and domain.startswith("www."):
        domain = domain[4:]
    return DOMAIN_TIER_MAP.get(domain, SourceTier.C)


def get_tier_config(tier: SourceTier) -> TierConfig:
    """
    Get configuration for a tier.

    Args:
        tier: Source tier

    Returns:
        TierConfig: Configuration dataclass
    """
    return TIER_CONFIGS[tier]


def can_tier_update_field(tier: SourceTier, field_name: str) -> bool:
    """
    Check if a tier can update a specific field.

    Args:
        tier: Source tier
        field_name: Name of the field to check

    Returns:
        bool: True if tier can update the field
    """
    config = TIER_CONFIGS[tier]
    if "*" in config.fields_restricted:
        return False
    return field_name not in config.fields_restricted


def get_tier_priority(tier: SourceTier) -> int:
    """
    Get priority value for a tier (lower = higher priority).

    Args:
        tier: Source tier

    Returns:
        int: Priority value (A=1, B=2, C=3)
    """
    priority_map = {
        SourceTier.A: 1,
        SourceTier.B: 2,
        SourceTier.C: 3,
    }
    return priority_map.get(tier, 99)


def is_tier_higher_or_equal(tier1: SourceTier, tier2: SourceTier) -> bool:
    """
    Check if tier1 is higher or equal priority than tier2.

    Args:
        tier1: First tier to compare
        tier2: Second tier to compare

    Returns:
        bool: True if tier1 >= tier2 in authority
    """
    return get_tier_priority(tier1) <= get_tier_priority(tier2)
