"""
Base Scraper - Abstract template for all scrapers.

Provides common functionality:
- Run lifecycle management
- Rate limiting integration
- Entity saving
- Error handling
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Generator, List, Optional

from .tier_system import SourceTier, get_tier_for_domain
from .utils.hashing import compute_json_hash


class ScrapeMode(Enum):
    """Scraping modes with different behaviors."""
    DISCOVERY = "discovery"  # Find URLs only, no canonical writes
    CANDIDATE_INGEST = "candidate"  # Tier C - creates candidates only
    CANONICAL_INGEST = "canonical"  # Tier A/B - can update canonical


@dataclass
class ScrapeResult:
    """Result from parsing a single entity from a page."""
    entity_type: str
    entity_key: str
    extracted: Dict[str, Any]
    source_url: str
    parse_status: str = "success"  # success, partial, failed
    parse_errors: Optional[List[str]] = field(default_factory=list)

    def __post_init__(self):
        if self.parse_errors is None:
            self.parse_errors = []


class BaseScraper(ABC):
    """
    Abstract base class for all scrapers.

    Subclasses must implement:
    - get_urls_to_scrape(): Generator of URLs to scrape
    - parse_page(): Parse HTML and return ScrapeResult list

    Subclasses should set class attributes:
    - SCRAPER_NAME: Unique scraper identifier
    - SOURCE_DOMAIN: Primary domain being scraped
    - SUPPORTED_ENTITY_TYPES: List of entity types this scraper produces
    """

    # Override in subclass
    SCRAPER_NAME: str = "base"
    SOURCE_DOMAIN: str = ""
    SUPPORTED_ENTITY_TYPES: List[str] = []

    def __init__(self, db_session, rate_limiter=None, cache=None):
        """
        Initialize scraper.

        Args:
            db_session: SQLAlchemy database session
            rate_limiter: Optional rate limiter instance
            cache: Optional cache for HTTP responses
        """
        self.db_session = db_session
        self.rate_limiter = rate_limiter
        self.cache = cache
        self._run = None
        self._stats = {
            "pages_fetched": 0,
            "items_extracted": 0,
            "items_promoted": 0,
            "errors_count": 0,
        }

    @property
    def source_tier(self) -> SourceTier:
        """Get source tier based on domain."""
        return get_tier_for_domain(self.SOURCE_DOMAIN)

    @abstractmethod
    def get_urls_to_scrape(self, **kwargs) -> Generator[str, None, None]:
        """
        Yield URLs to scrape.

        Args:
            **kwargs: Scraper-specific configuration

        Yields:
            str: URLs to fetch and parse
        """
        pass

    @abstractmethod
    def parse_page(self, url: str, html: str) -> List[ScrapeResult]:
        """
        Parse a page and return extracted entities.

        Args:
            url: URL that was fetched
            html: Raw HTML content

        Returns:
            List of ScrapeResult objects
        """
        pass

    def start_run(
        self,
        config: Dict[str, Any],
        triggered_by: str = "manual",
        source_type: str = "scrape",
    ):
        """
        Start a new ingestion run.

        Args:
            config: Run configuration
            triggered_by: 'manual', 'cron', or 'webhook'
            source_type: 'scrape', 'csv_upload', 'api', or 'manual'

        Returns:
            IngestionRun model instance
        """
        from .models import IngestionRun

        self._run = IngestionRun(
            scraper_name=self.SCRAPER_NAME,
            source_domain=self.SOURCE_DOMAIN,
            source_tier=self.source_tier.value,
            source_type=source_type,
            config_snapshot=config,
            triggered_by=triggered_by,
        )
        self._run.start()
        self.db_session.add(self._run)
        self.db_session.commit()

        # Reset stats
        self._stats = {
            "pages_fetched": 0,
            "items_extracted": 0,
            "items_promoted": 0,
            "errors_count": 0,
        }

        return self._run

    def complete_run(self, error: Optional[Exception] = None):
        """
        Complete the current run.

        Args:
            error: Exception if run failed
        """
        if not self._run:
            return

        if error:
            self._run.fail(error)
        else:
            self._run.complete(self._stats)

        self.db_session.commit()

    def save_entity(self, result: ScrapeResult):
        """
        Save an extracted entity to the staging table.

        Args:
            result: ScrapeResult from parse_page

        Returns:
            ScrapedEntity model instance
        """
        from .models import ScrapedEntity

        entity = ScrapedEntity(
            entity_type=result.entity_type,
            entity_key=result.entity_key,
            source_domain=self.SOURCE_DOMAIN,
            source_url=result.source_url,
            source_tier=self.source_tier.value,
            extracted=result.extracted,
            extracted_hash=compute_json_hash(result.extracted),
            run_id=self._run.run_id,
            parse_status=result.parse_status,
            parse_errors=result.parse_errors,
        )

        # Handle upsert (update if exists, insert if not)
        existing = self.db_session.query(ScrapedEntity).filter_by(
            entity_type=result.entity_type,
            entity_key=result.entity_key,
            source_domain=self.SOURCE_DOMAIN,
        ).first()

        if existing:
            # Update existing
            existing.source_url = result.source_url
            existing.extracted = result.extracted
            existing.extracted_hash = compute_json_hash(result.extracted)
            existing.run_id = self._run.run_id
            existing.scraped_at = datetime.utcnow()
            existing.parse_status = result.parse_status
            existing.parse_errors = result.parse_errors
            return existing
        else:
            self.db_session.add(entity)
            return entity

    def increment_stat(self, stat_name: str, amount: int = 1):
        """Increment a run statistic."""
        if stat_name in self._stats:
            self._stats[stat_name] += amount

    def fetch_page(self, url: str) -> str:
        """
        Fetch a page with rate limiting and caching.

        Args:
            url: URL to fetch

        Returns:
            HTML content as string
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
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
                "Accept-Language": "en-SG,en;q=0.9",
            },
        )
        response.raise_for_status()
        html = response.text

        # Cache response
        if self.cache:
            self.cache.set(url, html, self.SCRAPER_NAME)

        self.increment_stat("pages_fetched")
        return html

    def run(
        self,
        mode: ScrapeMode = ScrapeMode.CANONICAL_INGEST,
        config: Optional[Dict[str, Any]] = None,
        triggered_by: str = "manual",
    ):
        """
        Execute the full scraping pipeline.

        Args:
            mode: Scraping mode
            config: Scraper-specific configuration
            triggered_by: What triggered this run

        Returns:
            ScrapeRun model instance
        """
        config = config or {}
        config["mode"] = mode.value

        # Start run
        self.start_run(config, triggered_by)

        try:
            # Iterate through URLs
            for url in self.get_urls_to_scrape(**config):
                try:
                    # Fetch page
                    html = self.fetch_page(url)

                    # Parse page
                    results = self.parse_page(url, html)

                    # Save each result
                    for result in results:
                        self.save_entity(result)
                        self.increment_stat("items_extracted")

                    self.db_session.commit()

                except Exception as e:
                    self.increment_stat("errors_count")
                    self.db_session.rollback()
                    # Log but continue
                    print(f"Error processing {url}: {e}")

            # Complete run
            self.complete_run()

        except Exception as e:
            self.complete_run(error=e)
            raise

        return self._run
