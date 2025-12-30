"""Scraper/Ingestion SQLAlchemy Models."""

from .ingestion_run import IngestionRun, ScrapeRun, SourceType
from .scraped_entity import ScrapedEntity
from .canonical_entity import CanonicalEntity
from .entity_candidate import EntityCandidate
from .schema_change import ScraperSchemaChange
from .discovered_link import DiscoveredLink
from .verification_candidate import VerificationCandidate, MIN_SOURCES_FOR_AUTO_CONFIRM

__all__ = [
    # Primary models
    "IngestionRun",
    "SourceType",
    "ScrapedEntity",
    "CanonicalEntity",
    "EntityCandidate",
    "ScraperSchemaChange",
    "DiscoveredLink",
    "VerificationCandidate",
    "MIN_SOURCES_FOR_AUTO_CONFIRM",
    # Backwards compatibility
    "ScrapeRun",  # Alias for IngestionRun
]
