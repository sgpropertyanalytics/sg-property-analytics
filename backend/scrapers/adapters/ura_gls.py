"""
URA GLS Adapter - Wraps existing gls_scraper.py

This adapter provides the orchestrator interface while delegating
to the existing, working gls_scraper.py functions.

Integration approach: WRAP, don't rewrite.
"""
import re
import logging
from datetime import datetime
from typing import Any, Dict, Generator, List, Optional

from ..base import BaseScraper, ScrapeResult

logger = logging.getLogger(__name__)


class URAGLSAdapter(BaseScraper):
    """
    Adapter for existing URA GLS scraper.

    Wraps the functions in backend/services/gls_scraper.py to integrate
    with the new orchestrator infrastructure.
    """

    SCRAPER_NAME = "ura_gls"
    SOURCE_DOMAIN = "ura.gov.sg"
    SUPPORTED_ENTITY_TYPES = ["gls_tender"]

    def __init__(self, db_session, rate_limiter=None, cache=None):
        super().__init__(db_session, rate_limiter, cache)
        self._year = datetime.now().year
        self._include_prior_year = True
        self._gls_scraper = None

    def _get_gls_scraper(self):
        """Lazy load the existing gls_scraper module."""
        if self._gls_scraper is None:
            try:
                from services import gls_scraper
                self._gls_scraper = gls_scraper
            except ImportError:
                from backend.services import gls_scraper
                self._gls_scraper = gls_scraper
        return self._gls_scraper

    def configure(
        self,
        year: int = None,
        include_prior_year: bool = True,
    ) -> "URAGLSAdapter":
        """
        Configure scrape parameters.

        Args:
            year: Year to scrape (default: current year)
            include_prior_year: Include prior year releases

        Returns:
            self for chaining
        """
        if year:
            self._year = year
        self._include_prior_year = include_prior_year
        return self

    def get_urls_to_scrape(self, **kwargs) -> Generator[str, None, None]:
        """
        Get URLs from URA media releases.

        Delegates to existing get_media_release_links() function.
        """
        gls = self._get_gls_scraper()

        # Override with kwargs if provided
        year = kwargs.get("year", self._year)
        include_prior = kwargs.get("include_prior_year", self._include_prior_year)

        # Get current year releases
        try:
            releases = gls.get_media_release_links(year)
            logger.info(f"Found {len(releases)} releases for {year}")
        except Exception as e:
            logger.error(f"Failed to get releases for {year}: {e}")
            releases = []

        # Optionally get prior year
        if include_prior:
            try:
                prior_releases = gls.get_media_release_links(year - 1)
                seen_ids = {r.get("release_id") for r in releases}
                for r in prior_releases:
                    if r.get("release_id") not in seen_ids:
                        releases.append(r)
                logger.info(f"Added {len(prior_releases)} releases from {year - 1}")
            except Exception as e:
                logger.warning(f"Failed to get prior year releases: {e}")

        for release in releases:
            yield release.get("url")

    def parse_page(self, url: str, html: str) -> List[ScrapeResult]:
        """
        Parse a URA media release page.

        Note: This adapter fetches and parses in one step using the existing
        gls_scraper.py functions, since that's how it was designed.
        """
        gls = self._get_gls_scraper()

        # Extract release_id from URL
        match = re.search(r"(pr\d+-\d+)", url, re.IGNORECASE)
        release_id = match.group(1).lower() if match else "unknown"

        results = []

        try:
            # Use existing parser (it fetches + parses)
            # Note: The existing scraper fetches the page itself
            tender_data_list = gls.parse_media_release(url, release_id)

            for data in tender_data_list:
                # Geocode location if not already done
                location = data.get("location_raw", "")
                if location and not data.get("latitude"):
                    try:
                        geo_data = gls.geocode_location(location)
                        data["latitude"] = geo_data.get("latitude")
                        data["longitude"] = geo_data.get("longitude")
                        data["postal_code"] = geo_data.get("postal_code")
                        data["planning_area"] = geo_data.get("planning_area")
                    except Exception as e:
                        logger.warning(f"Geocoding failed for {location}: {e}")

                # Derive district and segment using constants
                self._derive_district_segment(data)

                # Add source URL to data
                data["source_url"] = url

                results.append(ScrapeResult(
                    entity_type="gls_tender",
                    entity_key=data.get("release_id", release_id),
                    extracted=data,
                    source_url=url,
                    parse_status="success",
                ))

        except Exception as e:
            logger.error(f"Failed to parse {url}: {e}")
            results.append(ScrapeResult(
                entity_type="gls_tender",
                entity_key=release_id,
                extracted={},
                source_url=url,
                parse_status="failed",
                parse_errors=[str(e)],
            ))

        return results

    def _derive_district_segment(self, data: Dict[str, Any]):
        """Derive postal_district and market_segment from location data."""
        try:
            from constants import (
                get_district_from_postal_code,
                get_district_from_planning_area,
                get_region_for_district,
            )
        except ImportError:
            from backend.constants import (
                get_district_from_postal_code,
                get_district_from_planning_area,
                get_region_for_district,
            )

        postal_district = None
        market_segment = None

        # Try postal code first (most accurate)
        if data.get("postal_code"):
            postal_district = get_district_from_postal_code(data["postal_code"])
            if postal_district:
                market_segment = get_region_for_district(postal_district)

        # Fallback to planning area
        if not postal_district and data.get("planning_area"):
            postal_district = get_district_from_planning_area(data["planning_area"])
            if postal_district:
                market_segment = get_region_for_district(postal_district)

        data["postal_district"] = postal_district
        data["market_segment"] = market_segment

    def fetch_page(self, url: str) -> str:
        """
        Override fetch_page since existing scraper fetches internally.

        The parse_page method handles fetching via the existing scraper.
        """
        # Rate limit but return empty - actual fetch happens in parse_page
        if self.rate_limiter:
            self.rate_limiter.wait(self.SOURCE_DOMAIN)
        self.increment_stat("pages_fetched")
        return ""
