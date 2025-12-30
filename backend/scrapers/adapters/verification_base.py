"""
Verification Adapter Base - Template for Tier B source verification adapters.

Unlike scraping adapters that extract raw data from pages, verification adapters:
1. Look up specific projects by name (targeted search)
2. Extract key fields for comparison (units, pricing, status)
3. Return structured verification data for cross-validation

Verification adapters are designed for periodic data quality checks, not bulk ingestion.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Generator, List, Optional, Tuple

from ..tier_system import SourceTier, get_tier_for_domain


class VerificationConfidence(Enum):
    """Confidence level of verification data from a source."""
    HIGH = "high"      # Direct match on project page
    MEDIUM = "medium"  # Search result match
    LOW = "low"        # Fuzzy match or partial data


@dataclass
class VerificationResult:
    """
    Result from a verification lookup for a single project.

    Represents data from ONE source for ONE project.
    Multiple VerificationResults are aggregated for cross-validation.
    """
    project_name: str
    source_domain: str
    source_url: Optional[str]
    found: bool
    data: Dict[str, Any]  # {total_units: 1040, developer: 'CDL', ...}
    confidence: VerificationConfidence
    scraped_at: datetime = field(default_factory=datetime.utcnow)
    match_score: float = 1.0  # 0.0 to 1.0, how well the name matched
    error: Optional[str] = None  # Error message if lookup failed

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "project_name": self.project_name,
            "source_domain": self.source_domain,
            "source_url": self.source_url,
            "found": self.found,
            "data": self.data,
            "confidence": self.confidence.value,
            "scraped_at": self.scraped_at.isoformat(),
            "match_score": self.match_score,
            "error": self.error,
        }

    @classmethod
    def not_found(cls, project_name: str, source_domain: str) -> "VerificationResult":
        """Create a not-found result."""
        return cls(
            project_name=project_name,
            source_domain=source_domain,
            source_url=None,
            found=False,
            data={},
            confidence=VerificationConfidence.LOW,
        )

    @classmethod
    def error_result(cls, project_name: str, source_domain: str, error: str) -> "VerificationResult":
        """Create an error result."""
        return cls(
            project_name=project_name,
            source_domain=source_domain,
            source_url=None,
            found=False,
            data={},
            confidence=VerificationConfidence.LOW,
            error=error,
        )


@dataclass
class VerificationStats:
    """Statistics from a verification run."""
    total_projects: int = 0
    found_count: int = 0
    not_found_count: int = 0
    error_count: int = 0
    high_confidence_count: int = 0
    medium_confidence_count: int = 0
    low_confidence_count: int = 0

    def record_result(self, result: VerificationResult):
        """Update stats based on a result."""
        self.total_projects += 1
        if result.error:
            self.error_count += 1
        elif result.found:
            self.found_count += 1
            if result.confidence == VerificationConfidence.HIGH:
                self.high_confidence_count += 1
            elif result.confidence == VerificationConfidence.MEDIUM:
                self.medium_confidence_count += 1
            else:
                self.low_confidence_count += 1
        else:
            self.not_found_count += 1

    def to_dict(self) -> Dict[str, int]:
        return {
            "total_projects": self.total_projects,
            "found_count": self.found_count,
            "not_found_count": self.not_found_count,
            "error_count": self.error_count,
            "high_confidence_count": self.high_confidence_count,
            "medium_confidence_count": self.medium_confidence_count,
            "low_confidence_count": self.low_confidence_count,
        }


class BaseVerificationAdapter(ABC):
    """
    Abstract base class for verification adapters.

    Verification adapters look up specific projects and extract key fields
    for cross-validation against our existing data.

    Subclasses must implement:
    - verify_project(): Look up a single project by name
    - search_project(): Search for a project (may return multiple matches)

    Subclasses should set class attributes:
    - SOURCE_DOMAIN: Primary domain being queried
    - SOURCE_NAME: Human-readable source name
    - SUPPORTED_FIELDS: List of fields this source can verify
    """

    # Override in subclass
    SOURCE_DOMAIN: str = ""
    SOURCE_NAME: str = ""
    SOURCE_TIER: SourceTier = SourceTier.B

    # Fields this source can reliably provide
    SUPPORTED_FIELDS: List[str] = [
        "total_units",
        "developer",
        "tenure",
        "district",
    ]

    def __init__(self, rate_limiter=None, cache=None):
        """
        Initialize verification adapter.

        Args:
            rate_limiter: Optional rate limiter instance
            cache: Optional cache for HTTP responses
        """
        self.rate_limiter = rate_limiter
        self.cache = cache
        self._stats = VerificationStats()

    @property
    def source_tier(self) -> SourceTier:
        """Get source tier based on domain."""
        return get_tier_for_domain(self.SOURCE_DOMAIN)

    @abstractmethod
    def verify_project(self, project_name: str) -> VerificationResult:
        """
        Verify data for a single project.

        This is the primary method for verification. It should:
        1. Search for the project on the source
        2. Extract relevant fields (units, developer, etc.)
        3. Return a VerificationResult with the data

        Args:
            project_name: Exact project name to look up

        Returns:
            VerificationResult with found data or not_found status
        """
        pass

    @abstractmethod
    def search_project(self, project_name: str) -> List[Tuple[str, float]]:
        """
        Search for a project and return potential matches.

        Used for fuzzy matching when exact lookup fails.

        Args:
            project_name: Project name to search for

        Returns:
            List of (matched_name, match_score) tuples, sorted by score descending
        """
        pass

    def verify_batch(self, project_names: List[str]) -> List[VerificationResult]:
        """
        Verify multiple projects.

        Default implementation calls verify_project for each.
        Subclasses can override for more efficient batch lookups.

        Args:
            project_names: List of project names to verify

        Returns:
            List of VerificationResult objects
        """
        results = []
        for name in project_names:
            try:
                result = self.verify_project(name)
                self._stats.record_result(result)
                results.append(result)
            except Exception as e:
                result = VerificationResult.error_result(
                    project_name=name,
                    source_domain=self.SOURCE_DOMAIN,
                    error=str(e),
                )
                self._stats.record_result(result)
                results.append(result)
        return results

    def get_stats(self) -> VerificationStats:
        """Get current verification statistics."""
        return self._stats

    def reset_stats(self):
        """Reset verification statistics."""
        self._stats = VerificationStats()

    def fetch_page(self, url: str) -> str:
        """
        Fetch a page with rate limiting and caching.

        Args:
            url: URL to fetch

        Returns:
            HTML/JSON content as string
        """
        import requests

        # Check cache first
        if self.cache:
            cached = self.cache.get(url)
            if cached:
                return cached

        # Apply rate limiting
        if self.rate_limiter:
            self.rate_limiter.wait(self.SOURCE_DOMAIN)

        # Fetch
        response = requests.get(
            url,
            timeout=30,
            headers={
                "User-Agent": "SGPropertyAnalytics/1.0 (research purposes)",
                "Accept": "text/html,application/xhtml+xml,application/json",
                "Accept-Language": "en-SG,en;q=0.9",
            },
        )
        response.raise_for_status()
        content = response.text

        # Cache response
        if self.cache:
            self.cache.set(url, content, f"verify_{self.SOURCE_DOMAIN}")

        return content

    def normalize_project_name(self, name: str) -> str:
        """
        Normalize a project name for matching.

        Removes common variations like "The", parenthetical suffixes, etc.

        Args:
            name: Raw project name

        Returns:
            Normalized name for comparison
        """
        import re

        if not name:
            return ""

        normalized = name.strip().upper()

        # Remove "THE " prefix
        if normalized.startswith("THE "):
            normalized = normalized[4:]

        # Remove parenthetical content
        normalized = re.sub(r"\s*\([^)]*\)", "", normalized)

        # Remove special characters
        normalized = re.sub(r"[^\w\s]", " ", normalized)

        # Collapse whitespace
        normalized = re.sub(r"\s+", " ", normalized).strip()

        return normalized

    def compute_match_score(self, name1: str, name2: str) -> float:
        """
        Compute similarity score between two project names.

        Uses normalized Levenshtein distance.

        Args:
            name1: First project name
            name2: Second project name

        Returns:
            Float between 0.0 (no match) and 1.0 (exact match)
        """
        from difflib import SequenceMatcher

        n1 = self.normalize_project_name(name1)
        n2 = self.normalize_project_name(name2)

        if not n1 or not n2:
            return 0.0

        # Exact match after normalization
        if n1 == n2:
            return 1.0

        # Use SequenceMatcher for fuzzy matching
        return SequenceMatcher(None, n1, n2).ratio()

    def __repr__(self):
        return f"<{self.__class__.__name__} source={self.SOURCE_DOMAIN}>"


# =============================================================================
# VERIFICATION FIELD DEFINITIONS
# =============================================================================

# Fields that can be verified from Tier B sources
VERIFICATION_FIELDS = {
    "total_units": {
        "type": int,
        "tolerance": 0.0,  # Must be exact
        "required_for": ["upcoming_launch", "unit_count"],
    },
    "developer": {
        "type": str,
        "tolerance": None,  # String comparison
        "required_for": ["upcoming_launch"],
    },
    "tenure": {
        "type": str,
        "tolerance": None,
        "required_for": ["upcoming_launch"],
    },
    "district": {
        "type": str,
        "tolerance": None,
        "required_for": ["upcoming_launch", "project_location"],
    },
    "indicative_psf_low": {
        "type": float,
        "tolerance": 0.05,  # 5% tolerance
        "required_for": ["upcoming_launch"],
    },
    "indicative_psf_high": {
        "type": float,
        "tolerance": 0.05,
        "required_for": ["upcoming_launch"],
    },
    "launch_status": {
        "type": str,
        "tolerance": None,
        "required_for": ["upcoming_launch"],
    },
    "address": {
        "type": str,
        "tolerance": None,
        "required_for": ["project_location"],
    },
    "latitude": {
        "type": float,
        "tolerance": 0.001,  # ~100m at equator
        "required_for": ["project_location"],
    },
    "longitude": {
        "type": float,
        "tolerance": 0.001,
        "required_for": ["project_location"],
    },
}
