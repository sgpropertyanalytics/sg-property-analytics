"""
ETL Rule Registry

Wraps canonical classifiers from the codebase.
NEVER duplicates logic - always calls existing modules.

Usage:
    from constants import SALE_TYPE_RESALE
    registry = get_rule_registry()
    bedroom = registry.apply('bedroom', area_sqft=800, sale_type=SALE_TYPE_RESALE, transaction_date=date.today())
    rules_version = registry.get_version()
"""
import hashlib
import subprocess
from dataclasses import dataclass
from typing import Callable, Dict, Any, Optional, List
from pathlib import Path
from datetime import date


@dataclass
class RuleSpec:
    """Specification for a classification rule."""
    name: str
    function: Callable
    inputs: List[str]
    source_module: str
    description: str = ""


class RuleRegistry:
    """
    Central registry for all ETL classification rules.

    All rules delegate to canonical implementations in the codebase.
    No business logic is duplicated here.
    """

    def __init__(self):
        self._rules: Dict[str, RuleSpec] = {}
        self._register_all()

    def _register_all(self):
        """Register all canonical rules from existing modules."""
        # Import here to avoid circular imports
        from services.classifier import classify_bedroom_three_tier, classify_bedroom
        from services.classifier_extended import (
            classify_floor_level,
            extract_lease_start_year,
            calculate_remaining_lease,
            classify_tenure
        )
        from constants import (
            get_region_for_district,
            get_district_from_postal_code,
            get_district_from_planning_area
        )

        # Bedroom classification (three-tier: post/pre harmonization, resale)
        self._rules['bedroom'] = RuleSpec(
            name='bedroom',
            function=classify_bedroom_three_tier,
            inputs=['area_sqft', 'sale_type', 'transaction_date'],
            source_module='services.classifier',
            description='Three-tier bedroom classification based on area, sale type, and date'
        )

        # Simple bedroom classification (fallback when sale_type/date unavailable)
        self._rules['bedroom_simple'] = RuleSpec(
            name='bedroom_simple',
            function=classify_bedroom,
            inputs=['area_sqft'],
            source_module='services.classifier',
            description='Simple bedroom classification based on area only (fallback)'
        )

        # Floor level classification
        self._rules['floor_level'] = RuleSpec(
            name='floor_level',
            function=classify_floor_level,
            inputs=['floor_range'],
            source_module='services.classifier_extended',
            description='Floor tier (Low, Mid-Low, Mid, Mid-High, High, Luxury)'
        )

        # Tenure classification
        self._rules['tenure'] = RuleSpec(
            name='tenure',
            function=classify_tenure,
            inputs=['tenure_str'],
            source_module='services.classifier_extended',
            description='Tenure type (Freehold, 99-year, 999-year)'
        )

        # Lease start year extraction
        self._rules['lease_start_year'] = RuleSpec(
            name='lease_start_year',
            function=extract_lease_start_year,
            inputs=['tenure_str'],
            source_module='services.classifier_extended',
            description='Extract lease commencement year from tenure string'
        )

        # Remaining lease calculation
        self._rules['remaining_lease'] = RuleSpec(
            name='remaining_lease',
            function=calculate_remaining_lease,
            inputs=['tenure_str', 'transaction_date'],
            source_module='services.classifier_extended',
            description='Calculate remaining lease years'
        )

        # Region from district
        self._rules['region'] = RuleSpec(
            name='region',
            function=get_region_for_district,
            inputs=['district'],
            source_module='constants',
            description='Map district to region (CCR/RCR/OCR)'
        )

        # District from postal code
        self._rules['district_from_postal'] = RuleSpec(
            name='district_from_postal',
            function=get_district_from_postal_code,
            inputs=['postal_code'],
            source_module='constants',
            description='Map postal code to district'
        )

        # District from planning area
        self._rules['district_from_planning_area'] = RuleSpec(
            name='district_from_planning_area',
            function=get_district_from_planning_area,
            inputs=['planning_area'],
            source_module='constants',
            description='Map planning area to district (fallback)'
        )

    def apply(self, rule_name: str, **kwargs) -> Any:
        """
        Apply a classification rule.

        Args:
            rule_name: Name of the rule to apply
            **kwargs: Input values for the rule

        Returns:
            Classification result

        Raises:
            KeyError: If rule not found
            TypeError: If required inputs missing
        """
        if rule_name not in self._rules:
            available = list(self._rules.keys())
            raise KeyError(f"Unknown rule: {rule_name}. Available: {available}")

        spec = self._rules[rule_name]

        # Handle None/missing inputs gracefully
        try:
            return spec.function(**kwargs)
        except TypeError as e:
            # Add context about which rule failed
            raise TypeError(f"Rule '{rule_name}' failed: {e}") from e

    def apply_safe(self, rule_name: str, default: Any = None, **kwargs) -> Any:
        """
        Apply a classification rule with fallback for errors.

        Args:
            rule_name: Name of the rule to apply
            default: Value to return if rule fails
            **kwargs: Input values for the rule

        Returns:
            Classification result or default value
        """
        try:
            return self.apply(rule_name, **kwargs)
        except (KeyError, TypeError, ValueError, AttributeError):
            return default

    def get_version(self) -> str:
        """
        Get reproducible version hash of all rules.

        Tries git hash first, falls back to hashing source files.
        This ensures every batch can be traced to exact rule versions.
        """
        # Try git hash first (most accurate)
        try:
            result = subprocess.run(
                ['git', 'rev-parse', 'HEAD'],
                capture_output=True,
                text=True,
                timeout=5,
                cwd=Path(__file__).parent.parent.parent  # backend/
            )
            if result.returncode == 0:
                return result.stdout.strip()[:12]
        except Exception:
            pass

        # Fallback: hash source files
        return self._compute_source_hash()

    def _compute_source_hash(self) -> str:
        """Compute hash from source file contents."""
        backend_dir = Path(__file__).parent.parent.parent
        source_files = [
            backend_dir / 'services' / 'classifier.py',
            backend_dir / 'services' / 'classifier_extended.py',
            backend_dir / 'constants.py',
            backend_dir / 'api' / 'contracts' / 'contract_schema.py',
        ]

        combined = ""
        for f in source_files:
            if f.exists():
                combined += f.read_text()

        return hashlib.sha256(combined.encode()).hexdigest()[:12]

    def get_rule_info(self, rule_name: str) -> Dict[str, Any]:
        """Get metadata about a rule."""
        if rule_name not in self._rules:
            raise KeyError(f"Unknown rule: {rule_name}")

        spec = self._rules[rule_name]
        return {
            'name': spec.name,
            'inputs': spec.inputs,
            'description': spec.description,
            'source_module': spec.source_module
        }

    def list_rules(self) -> List[str]:
        """List all registered rule names."""
        return list(self._rules.keys())

    def get_all_rules_info(self) -> Dict[str, Dict[str, Any]]:
        """Get metadata for all rules."""
        return {name: self.get_rule_info(name) for name in self._rules}


# Singleton instance
_registry: Optional[RuleRegistry] = None


def get_rule_registry() -> RuleRegistry:
    """
    Get the singleton rule registry instance.

    Usage:
        from constants import SALE_TYPE_RESALE
        registry = get_rule_registry()
        bedroom = registry.apply('bedroom', area_sqft=800, sale_type=SALE_TYPE_RESALE, transaction_date=date.today())
    """
    global _registry
    if _registry is None:
        _registry = RuleRegistry()
    return _registry
