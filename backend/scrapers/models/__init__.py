"""Scraper/Ingestion SQLAlchemy Models."""

from .ingestion_run import IngestionRun, ScrapeRun, SourceType
from .scraped_entity import ScrapedEntity
from .canonical_entity import CanonicalEntity
from .entity_candidate import EntityCandidate
from .schema_change import ScraperSchemaChange
from .discovered_link import DiscoveredLink

__all__ = [
    # Primary models
    "IngestionRun",
    "SourceType",
    "ScrapedEntity",
    "CanonicalEntity",
    "EntityCandidate",
    "ScraperSchemaChange",
    "DiscoveredLink",
    # Backwards compatibility
    "ScrapeRun",  # Alias for IngestionRun
]
