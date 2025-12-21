"""
Property Scraper - Playwright-based scraper with network interception

Uses headless browser to handle JavaScript-rendered pages.
Captures XHR/Fetch API responses for reliable data extraction.

Data Sources (12 total):
1. EdgeProp Singapore
2. 99.co
3. PropertyGuru
4. SRX Property
5. PropNex
6. ERA Singapore
7. Huttons
8. OrangeTee
9. StraitsTimes Property
10. URA Developer Sales API
11. Stacked Homes (NEW)
12. Decoupling.co (NEW)

Usage:
    from services.property_scraper import PropertyScraper

    scraper = PropertyScraper()
    result = await scraper.scrape_project("NORMANTON PARK")

    # Or sync wrapper:
    result = scrape_project_sync("NORMANTON PARK")
"""
import os
import re
import json
import asyncio
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from urllib.parse import quote, urljoin
import requests

# Playwright imports - with fallback
try:
    from playwright.async_api import async_playwright, Page, Response
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    print("Warning: Playwright not installed. Using requests fallback.")

# BeautifulSoup for HTML parsing
from bs4 import BeautifulSoup


# =============================================================================
# CONFIGURATION
# =============================================================================

REQUEST_DELAY = 1.5  # seconds between requests
TIMEOUT = 30000  # milliseconds for Playwright
PAGE_LOAD_TIMEOUT = 15000  # milliseconds to wait for page load

SOURCES = {
    "edgeprop": {
        "name": "EdgeProp Singapore",
        "base_url": "https://www.edgeprop.sg",
        "project_url": "https://www.edgeprop.sg/condo/{slug}",
        "search_url": "https://www.edgeprop.sg/search?q={query}",
        "api_pattern": r"api\.edgeprop\.sg",
        "priority": 1,
        "enabled": True,
    },
    "99co": {
        "name": "99.co",
        "base_url": "https://www.99.co",
        "project_url": "https://www.99.co/singapore/condos-apartments/{slug}",
        "search_url": "https://www.99.co/singapore/s?query_text={query}&query_type=project",
        "api_pattern": r"api\.99\.co|cdn\.99\.co",
        "priority": 1,
        "enabled": True,
    },
    "propertyguru": {
        "name": "PropertyGuru",
        "base_url": "https://www.propertyguru.com.sg",
        "project_url": "https://www.propertyguru.com.sg/project/{slug}",
        "search_url": "https://www.propertyguru.com.sg/property-for-sale?freetext={query}",
        "api_pattern": r"api\.propertyguru|gateway\.propertyguru",
        "priority": 1,
        "enabled": True,
    },
    "srx": {
        "name": "SRX Property",
        "base_url": "https://www.srx.com.sg",
        "project_url": "https://www.srx.com.sg/project/{slug}",
        "search_url": "https://www.srx.com.sg/search/sale/residential?search={query}",
        "api_pattern": r"api\.srx\.com\.sg",
        "priority": 2,
        "enabled": True,
    },
    "propnex": {
        "name": "PropNex",
        "base_url": "https://www.propnex.com",
        "project_url": "https://www.propnex.com/new-launch/{slug}",
        "api_pattern": r"api\.propnex",
        "priority": 2,
        "enabled": True,
    },
    "era": {
        "name": "ERA Singapore",
        "base_url": "https://www.era.com.sg",
        "project_url": "https://www.era.com.sg/property/{slug}",
        "api_pattern": r"api\.era\.com\.sg",
        "priority": 2,
        "enabled": True,
    },
    "huttons": {
        "name": "Huttons",
        "base_url": "https://www.huttons.com.sg",
        "project_url": "https://www.huttons.com.sg/new-launches/{slug}",
        "api_pattern": r"api\.huttons",
        "priority": 3,
        "enabled": True,
    },
    "orangetee": {
        "name": "OrangeTee",
        "base_url": "https://www.orangetee.com",
        "project_url": "https://www.orangetee.com/new-launch/{slug}",
        "api_pattern": r"api\.orangetee",
        "priority": 3,
        "enabled": True,
    },
    "stproperty": {
        "name": "StraitsTimes Property",
        "base_url": "https://www.stproperty.sg",
        "project_url": "https://www.stproperty.sg/condo-directory/{slug}",
        "api_pattern": r"api\.stproperty",
        "priority": 3,
        "enabled": True,
    },
    "stackedhomes": {
        "name": "Stacked Homes",
        "base_url": "https://stackedhomes.com",
        "project_url": "https://stackedhomes.com/editorial/{slug}-review",
        "search_url": "https://stackedhomes.com/?s={query}",
        "api_pattern": r"api\.stackedhomes|stackedhomes\.com/wp-json",
        "priority": 1,  # High quality reviews with unit counts
        "enabled": True,
    },
    "decoupling": {
        "name": "Decoupling.co",
        "base_url": "https://www.decoupling.co",
        "project_url": "https://www.decoupling.co/project/{slug}",
        "search_url": "https://www.decoupling.co/search?q={query}",
        "api_pattern": r"api\.decoupling|decoupling\.co/api",
        "priority": 2,
        "enabled": True,
    },
    "ura": {
        "name": "URA Developer Sales",
        "base_url": "https://www.ura.gov.sg",
        "api_url": "https://www.ura.gov.sg/uraDataService/invokeUraDS",
        "priority": 1,  # Official government source
        "enabled": True,
    },
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class SourceResult:
    """Result from a single source."""
    source_name: str
    total_units: Optional[int] = None
    developer: Optional[str] = None
    tenure: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    indicative_psf_low: Optional[float] = None
    indicative_psf_high: Optional[float] = None
    completion_year: Optional[int] = None
    source_url: Optional[str] = None
    raw_data: Dict = field(default_factory=dict)
    error: Optional[str] = None
    method: str = "unknown"  # "api", "html", "network"
    scraped_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class CrossValidatedResult:
    """Cross-validated result from multiple sources."""
    project_name: str
    total_units: Optional[int] = None
    total_units_confidence: str = "none"
    total_units_sources: List[str] = field(default_factory=list)
    developer: Optional[str] = None
    tenure: Optional[str] = None
    district: Optional[str] = None
    market_segment: Optional[str] = None
    address: Optional[str] = None
    indicative_psf_low: Optional[float] = None
    indicative_psf_high: Optional[float] = None
    source_results: List[SourceResult] = field(default_factory=list)
    sources_checked: int = 0
    sources_with_data: int = 0
    discrepancies: List[str] = field(default_factory=list)


# =============================================================================
# PROPERTY SCRAPER
# =============================================================================

class PropertyScraper:
    """
    Playwright-based scraper with network interception.

    Captures API responses for reliable data extraction instead of
    parsing rendered HTML.
    """

    def __init__(self):
        self._browser = None
        self._context = None
        self._last_request_time: Dict[str, float] = {}
        self._captured_responses: Dict[str, Any] = {}

        # Fallback session for simple requests
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })

    # =========================================================================
    # UTILITIES
    # =========================================================================

    def _rate_limit(self, source_key: str):
        """Enforce rate limiting."""
        now = time.time()
        last_time = self._last_request_time.get(source_key, 0)
        elapsed = now - last_time
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        self._last_request_time[source_key] = time.time()

    def _normalize_name(self, name: str) -> str:
        """Normalize project name for matching."""
        if not name:
            return ""
        normalized = name.upper().strip()
        for suffix in [" (EC)", " EC", " CONDO", " CONDOMINIUM", " RESIDENCES", " RESIDENCE"]:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
        return normalized

    def _to_slug(self, name: str) -> str:
        """Convert project name to URL slug."""
        slug = name.lower().strip()
        slug = re.sub(r"[^\w\s-]", "", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        return slug

    def _extract_number(self, text: str) -> Optional[int]:
        """Extract number from text."""
        if not text:
            return None
        cleaned = re.sub(r'[,\s]', '', str(text))
        match = re.search(r'(\d+)', cleaned)
        return int(match.group(1)) if match else None

    def _extract_units_from_json(self, data: Any, keys: List[str] = None) -> Optional[int]:
        """Extract unit count from JSON data."""
        if keys is None:
            keys = ['totalUnits', 'total_units', 'numberOfUnits', 'units', 'unitCount',
                    'totalUnit', 'noOfUnits', 'num_units', 'residential_units']

        if isinstance(data, dict):
            for key in keys:
                if key in data:
                    val = data[key]
                    if isinstance(val, int):
                        return val
                    elif isinstance(val, str):
                        return self._extract_number(val)
            # Recursive search
            for v in data.values():
                result = self._extract_units_from_json(v, keys)
                if result:
                    return result
        elif isinstance(data, list):
            for item in data:
                result = self._extract_units_from_json(item, keys)
                if result:
                    return result
        return None

    def _extract_units_from_text(self, text: str) -> Optional[int]:
        """Extract unit count from text using patterns."""
        if not text:
            return None

        text_lower = text.lower()
        patterns = [
            r'(\d{2,4})\s*(?:residential\s*)?units?\s*(?:in\s*total|total)?',
            r'total\s*(?:of\s*)?(\d{2,4})\s*(?:residential\s*)?units?',
            r'comprising\s*(?:of\s*)?(\d{2,4})\s*units?',
            r'development\s*(?:of|with)\s*(\d{2,4})\s*units?',
            r'(\d{2,4})\s*unit\s*(?:residential\s*)?development',
        ]

        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                units = int(match.group(1))
                if 10 <= units <= 5000:  # Reasonable range
                    return units
        return None

    def _get_market_segment(self, district: str) -> Optional[str]:
        """Get market segment from district."""
        try:
            from constants import get_region_for_district
            return get_region_for_district(district) if district else None
        except ImportError:
            ccr = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11']
            rcr = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
            if district in ccr:
                return 'CCR'
            elif district in rcr:
                return 'RCR'
            elif district:
                return 'OCR'
            return None

    # =========================================================================
    # PLAYWRIGHT BROWSER MANAGEMENT
    # =========================================================================

    async def _get_browser(self):
        """Get or create browser instance."""
        if not PLAYWRIGHT_AVAILABLE:
            raise RuntimeError("Playwright not installed")

        if self._browser is None:
            playwright = await async_playwright().start()
            self._browser = await playwright.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-setuid-sandbox']
            )
            self._context = await self._browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={'width': 1920, 'height': 1080}
            )
        return self._browser, self._context

    async def _close_browser(self):
        """Close browser instance."""
        if self._context:
            await self._context.close()
            self._context = None
        if self._browser:
            await self._browser.close()
            self._browser = None

    async def _scrape_with_network(self, url: str, source_key: str,
                                    api_pattern: str = None) -> Tuple[str, Dict]:
        """
        Scrape page with network interception.

        Returns:
            Tuple of (page_html, captured_api_responses)
        """
        self._rate_limit(source_key)

        _, context = await self._get_browser()
        page = await context.new_page()

        captured = {}

        async def handle_response(response: Response):
            """Capture API responses."""
            url = response.url
            if api_pattern and re.search(api_pattern, url):
                try:
                    content_type = response.headers.get('content-type', '')
                    if 'json' in content_type:
                        body = await response.json()
                        captured[url] = body
                except:
                    pass
            # Also capture any JSON response
            elif 'api' in url.lower() or 'json' in url.lower():
                try:
                    content_type = response.headers.get('content-type', '')
                    if 'json' in content_type:
                        body = await response.json()
                        captured[url] = body
                except:
                    pass

        page.on('response', handle_response)

        try:
            await page.goto(url, wait_until='networkidle', timeout=PAGE_LOAD_TIMEOUT)
            await page.wait_for_timeout(2000)  # Extra wait for dynamic content
            html = await page.content()
            return html, captured
        except Exception as e:
            print(f"  [{source_key}] Page load error: {e}")
            return "", {}
        finally:
            await page.close()

    # =========================================================================
    # SOURCE-SPECIFIC SCRAPERS
    # =========================================================================

    async def _scrape_edgeprop(self, project_name: str) -> SourceResult:
        """Scrape EdgeProp with network interception."""
        source_key = "edgeprop"
        config = SOURCES[source_key]
        result = SourceResult(source_name=config["name"])

        try:
            slug = self._to_slug(project_name)
            url = config["project_url"].format(slug=slug)
            result.source_url = url

            html, api_data = await self._scrape_with_network(
                url, source_key, config.get("api_pattern")
            )

            # Try API data first
            for api_url, data in api_data.items():
                units = self._extract_units_from_json(data)
                if units:
                    result.total_units = units
                    result.method = "api"
                    result.raw_data = data
                    break

            # Fallback to HTML parsing
            if not result.total_units and html:
                soup = BeautifulSoup(html, 'html.parser')
                text = soup.get_text()

                if self._normalize_name(project_name).lower() in text.lower():
                    result.total_units = self._extract_units_from_text(text)
                    result.method = "html"

        except Exception as e:
            result.error = str(e)

        return result

    async def _scrape_99co(self, project_name: str) -> SourceResult:
        """Scrape 99.co with network interception."""
        source_key = "99co"
        config = SOURCES[source_key]
        result = SourceResult(source_name=config["name"])

        try:
            slug = self._to_slug(project_name)
            url = config["project_url"].format(slug=slug)
            result.source_url = url

            html, api_data = await self._scrape_with_network(
                url, source_key, config.get("api_pattern")
            )

            # 99.co often has project data in window.__INITIAL_STATE__ or API
            for api_url, data in api_data.items():
                units = self._extract_units_from_json(data)
                if units:
                    result.total_units = units
                    result.method = "api"
                    break

            # Try extracting from script tags
            if not result.total_units and html:
                soup = BeautifulSoup(html, 'html.parser')
                for script in soup.find_all('script'):
                    if script.string and 'totalUnits' in script.string:
                        match = re.search(r'"totalUnits":\s*(\d+)', script.string)
                        if match:
                            result.total_units = int(match.group(1))
                            result.method = "script"
                            break

                # Fallback to text
                if not result.total_units:
                    text = soup.get_text()
                    if self._normalize_name(project_name).lower() in text.lower():
                        result.total_units = self._extract_units_from_text(text)
                        result.method = "html"

        except Exception as e:
            result.error = str(e)

        return result

    async def _scrape_propertyguru(self, project_name: str) -> SourceResult:
        """Scrape PropertyGuru with network interception."""
        source_key = "propertyguru"
        config = SOURCES[source_key]
        result = SourceResult(source_name=config["name"])

        try:
            slug = self._to_slug(project_name)
            # PropertyGuru uses numeric IDs, try search instead
            url = config["search_url"].format(query=quote(project_name))
            result.source_url = url

            html, api_data = await self._scrape_with_network(
                url, source_key, config.get("api_pattern")
            )

            # Check API responses
            for api_url, data in api_data.items():
                if isinstance(data, dict):
                    # PropertyGuru's API returns listings
                    listings = data.get('listings', data.get('results', []))
                    if isinstance(listings, list):
                        for listing in listings:
                            name = listing.get('project', {}).get('name', '') or listing.get('name', '')
                            if self._normalize_name(name) == self._normalize_name(project_name):
                                units = self._extract_units_from_json(listing)
                                if units:
                                    result.total_units = units
                                    result.method = "api"
                                    result.raw_data = listing
                                    break

            # HTML fallback
            if not result.total_units and html:
                soup = BeautifulSoup(html, 'html.parser')
                text = soup.get_text()
                if self._normalize_name(project_name).lower() in text.lower():
                    result.total_units = self._extract_units_from_text(text)
                    result.method = "html"

        except Exception as e:
            result.error = str(e)

        return result

    async def _scrape_stackedhomes(self, project_name: str) -> SourceResult:
        """Scrape Stacked Homes - known for detailed condo reviews."""
        source_key = "stackedhomes"
        config = SOURCES[source_key]
        result = SourceResult(source_name=config["name"])

        try:
            slug = self._to_slug(project_name)
            url = config["project_url"].format(slug=slug)
            result.source_url = url

            html, api_data = await self._scrape_with_network(
                url, source_key, config.get("api_pattern")
            )

            # Stacked Homes reviews typically have structured project info
            if html:
                soup = BeautifulSoup(html, 'html.parser')
                text = soup.get_text()

                # Look for project info table/section
                patterns = [
                    r'total\s*(?:no\.?\s*of\s*)?units?\s*:?\s*(\d{2,4})',
                    r'(\d{2,4})\s*units?\s*across',
                    r'comprises?\s*(\d{2,4})\s*units?',
                ]

                for pattern in patterns:
                    match = re.search(pattern, text.lower())
                    if match:
                        result.total_units = int(match.group(1))
                        result.method = "html"
                        break

        except Exception as e:
            result.error = str(e)

        return result

    async def _scrape_decoupling(self, project_name: str) -> SourceResult:
        """Scrape Decoupling.co for project data."""
        source_key = "decoupling"
        config = SOURCES[source_key]
        result = SourceResult(source_name=config["name"])

        try:
            slug = self._to_slug(project_name)
            url = config["project_url"].format(slug=slug)
            result.source_url = url

            html, api_data = await self._scrape_with_network(
                url, source_key, config.get("api_pattern")
            )

            # Check API data
            for api_url, data in api_data.items():
                units = self._extract_units_from_json(data)
                if units:
                    result.total_units = units
                    result.method = "api"
                    break

            # HTML fallback
            if not result.total_units and html:
                soup = BeautifulSoup(html, 'html.parser')
                text = soup.get_text()
                if self._normalize_name(project_name).lower() in text.lower():
                    result.total_units = self._extract_units_from_text(text)
                    result.method = "html"

        except Exception as e:
            result.error = str(e)

        return result

    async def _scrape_ura_api(self, project_name: str) -> SourceResult:
        """Query URA Developer Sales API."""
        source_key = "ura"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            access_key = os.getenv('URA_API_ACCESS_KEY')
            if not access_key:
                result.error = "URA API key not configured"
                return result

            # Get token
            token_resp = self._session.get(
                "https://www.ura.gov.sg/uraDataService/insertNewToken.action",
                headers={"AccessKey": access_key},
                timeout=30
            )
            if token_resp.status_code != 200:
                result.error = "Failed to get URA token"
                return result

            token = token_resp.json().get("Result")
            if not token:
                result.error = "No token from URA"
                return result

            self._rate_limit(source_key)

            # Fetch data
            data_resp = self._session.get(
                "https://www.ura.gov.sg/uraDataService/invokeUraDS",
                params={"service": "PMI_Resi_Developer_Sales"},
                headers={"AccessKey": access_key, "Token": token},
                timeout=60
            )

            if data_resp.status_code == 200:
                ura_data = data_resp.json().get("Result", [])
                normalized = self._normalize_name(project_name)

                for project in ura_data:
                    ura_name = project.get("project", "")
                    if self._normalize_name(ura_name) == normalized:
                        result.total_units = project.get("launchedToDate")
                        result.developer = project.get("developer")
                        result.method = "api"
                        result.raw_data = project
                        break
                    elif SequenceMatcher(None, normalized, self._normalize_name(ura_name)).ratio() > 0.85:
                        result.total_units = project.get("launchedToDate")
                        result.developer = project.get("developer")
                        result.method = "api"
                        result.raw_data = project
                        break

        except Exception as e:
            result.error = str(e)

        return result

    async def _scrape_generic(self, source_key: str, project_name: str) -> SourceResult:
        """Generic scraper for other sources."""
        config = SOURCES.get(source_key, {})
        result = SourceResult(source_name=config.get("name", source_key))

        if not config.get("enabled", True):
            result.error = "Source disabled"
            return result

        try:
            slug = self._to_slug(project_name)

            # Try project URL first
            if "project_url" in config:
                url = config["project_url"].format(slug=slug)
                result.source_url = url

                html, api_data = await self._scrape_with_network(
                    url, source_key, config.get("api_pattern")
                )

                # Check API data
                for api_url, data in api_data.items():
                    units = self._extract_units_from_json(data)
                    if units:
                        result.total_units = units
                        result.method = "api"
                        break

                # HTML fallback
                if not result.total_units and html:
                    soup = BeautifulSoup(html, 'html.parser')
                    text = soup.get_text()
                    if self._normalize_name(project_name).lower() in text.lower():
                        result.total_units = self._extract_units_from_text(text)
                        result.method = "html"

        except Exception as e:
            result.error = str(e)

        return result

    # =========================================================================
    # CROSS-VALIDATION
    # =========================================================================

    def _cross_validate(self, results: List[SourceResult], project_name: str) -> CrossValidatedResult:
        """Cross-validate results from multiple sources."""
        validated = CrossValidatedResult(project_name=project_name)
        validated.source_results = results
        validated.sources_checked = len(results)

        # Collect units by source
        units_by_source: Dict[str, int] = {}
        for r in results:
            if r.total_units and not r.error:
                units_by_source[r.source_name] = r.total_units
                validated.sources_with_data += 1

        if not units_by_source:
            validated.total_units_confidence = "none"
            return validated

        # Group similar values (5% tolerance)
        value_groups: Dict[int, List[str]] = {}
        for source, units in units_by_source.items():
            matched = False
            for base in list(value_groups.keys()):
                if abs(units - base) / base <= 0.05:
                    value_groups[base].append(source)
                    matched = True
                    break
            if not matched:
                value_groups[units] = [source]

        # Find best value
        best_value = None
        best_sources = []
        for value, sources in value_groups.items():
            if len(sources) > len(best_sources):
                best_value = value
                best_sources = sources

        validated.total_units = best_value
        validated.total_units_sources = best_sources

        # Determine confidence
        high_priority = {"URA Developer Sales", "EdgeProp Singapore", "99.co",
                        "PropertyGuru", "Stacked Homes"}

        if len(best_sources) >= 3:
            validated.total_units_confidence = "high"
        elif len(best_sources) >= 2:
            validated.total_units_confidence = "medium"
        elif len(best_sources) == 1 and best_sources[0] in high_priority:
            validated.total_units_confidence = "medium"
        elif len(best_sources) == 1:
            validated.total_units_confidence = "low"
        else:
            validated.total_units_confidence = "none"

        # Note discrepancies
        for value, sources in value_groups.items():
            if value != best_value:
                validated.discrepancies.append(
                    f"{', '.join(sources)}: {value} units (vs {best_value})"
                )

        # Get other fields from results
        for r in sorted(results, key=lambda x: SOURCES.get(
                x.source_name.lower().replace(' ', ''), {}).get('priority', 99)):
            if r.developer and not validated.developer:
                validated.developer = r.developer
            if r.tenure and not validated.tenure:
                validated.tenure = r.tenure
            if r.district and not validated.district:
                validated.district = r.district

        if validated.district:
            validated.market_segment = self._get_market_segment(validated.district)

        return validated

    # =========================================================================
    # PUBLIC API
    # =========================================================================

    async def scrape_project(self, project_name: str,
                             sources: Optional[List[str]] = None) -> CrossValidatedResult:
        """
        Scrape multiple sources for a project.

        Args:
            project_name: Project name to search
            sources: Optional list of source keys (default: all enabled)

        Returns:
            CrossValidatedResult with validated data
        """
        print(f"Scraping project: {project_name}")

        if sources is None:
            sources = [k for k, v in SOURCES.items() if v.get("enabled", True)]

        results = []

        try:
            for source_key in sources:
                if source_key not in SOURCES:
                    continue

                print(f"  Checking {SOURCES[source_key]['name']}...")

                # Use source-specific scraper if available
                if source_key == "edgeprop":
                    result = await self._scrape_edgeprop(project_name)
                elif source_key == "99co":
                    result = await self._scrape_99co(project_name)
                elif source_key == "propertyguru":
                    result = await self._scrape_propertyguru(project_name)
                elif source_key == "stackedhomes":
                    result = await self._scrape_stackedhomes(project_name)
                elif source_key == "decoupling":
                    result = await self._scrape_decoupling(project_name)
                elif source_key == "ura":
                    result = await self._scrape_ura_api(project_name)
                else:
                    result = await self._scrape_generic(source_key, project_name)

                results.append(result)

                if result.total_units:
                    print(f"    Found: {result.total_units} units ({result.method})")
                elif result.error:
                    print(f"    Error: {result.error}")
                else:
                    print(f"    No data found")

        finally:
            await self._close_browser()

        validated = self._cross_validate(results, project_name)
        print(f"  Result: {validated.total_units} units (confidence: {validated.total_units_confidence})")

        return validated

    def scrape_project_sync(self, project_name: str,
                           sources: Optional[List[str]] = None) -> CrossValidatedResult:
        """Synchronous wrapper for scrape_project."""
        return asyncio.run(self.scrape_project(project_name, sources))

    async def save_to_inventory(self, result: CrossValidatedResult) -> Dict[str, Any]:
        """Save result to project_inventory table."""
        from models.project_inventory import ProjectInventory
        from models.database import db

        if result.total_units and result.total_units_confidence in ["high", "medium"]:
            try:
                record = ProjectInventory.query.filter_by(
                    project_name=result.project_name
                ).first()

                if not record:
                    record = ProjectInventory(project_name=result.project_name)
                    db.session.add(record)

                record.total_units = result.total_units
                record.data_source = f"SCRAPED ({result.total_units_confidence})"
                if result.source_results:
                    record.manual_source_url = result.source_results[0].source_url
                record.last_synced = datetime.utcnow()

                db.session.commit()

                return {
                    "status": "saved",
                    "project_name": result.project_name,
                    "total_units": result.total_units,
                    "confidence": result.total_units_confidence,
                    "sources": result.total_units_sources,
                }
            except Exception as e:
                db.session.rollback()
                return {"status": "error", "error": str(e)}

        elif result.total_units:
            return {
                "status": "low_confidence",
                "project_name": result.project_name,
                "total_units": result.total_units,
                "confidence": result.total_units_confidence,
            }
        else:
            return {
                "status": "not_found",
                "project_name": result.project_name,
                "sources_checked": result.sources_checked,
            }

    async def scrape_and_save(self, project_name: str) -> Dict[str, Any]:
        """Scrape project and save to inventory."""
        result = await self.scrape_project(project_name)
        return await self.save_to_inventory(result)


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def scrape_project_sync(project_name: str) -> CrossValidatedResult:
    """Synchronous function to scrape a project."""
    scraper = PropertyScraper()
    return scraper.scrape_project_sync(project_name)


def scrape_project(project_name: str) -> CrossValidatedResult:
    """Alias for scrape_project_sync."""
    return scrape_project_sync(project_name)


def scrape_and_save_project(project_name: str) -> Dict[str, Any]:
    """Scrape and save a project synchronously."""
    scraper = PropertyScraper()
    return asyncio.run(scraper.scrape_and_save(project_name))


def scrape_missing_projects(limit: int = 50) -> Dict[str, Any]:
    """Scrape projects missing inventory data."""
    from models.database import db
    from models.transaction import Transaction
    from models.project_inventory import ProjectInventory
    from sqlalchemy import func

    projects_with_sales = db.session.query(
        Transaction.project_name,
        func.count(Transaction.id).label('sales_count')
    ).filter(
        Transaction.sale_type == 'New Sale',
        Transaction.is_outlier == False
    ).group_by(Transaction.project_name).subquery()

    missing = db.session.query(projects_with_sales.c.project_name).outerjoin(
        ProjectInventory,
        projects_with_sales.c.project_name == ProjectInventory.project_name
    ).filter(
        ProjectInventory.id.is_(None)
    ).order_by(
        projects_with_sales.c.sales_count.desc()
    ).limit(limit).all()

    print(f"Found {len(missing)} projects missing inventory")

    scraper = PropertyScraper()
    stats = {"scraped": 0, "saved": 0, "low_confidence": 0, "not_found": 0, "errors": []}

    async def scrape_all():
        for (project_name,) in missing:
            result = await scraper.scrape_and_save(project_name)
            stats["scraped"] += 1

            if result["status"] == "saved":
                stats["saved"] += 1
            elif result["status"] == "low_confidence":
                stats["low_confidence"] += 1
            elif result["status"] == "not_found":
                stats["not_found"] += 1
            else:
                stats["errors"].append(result)

    asyncio.run(scrape_all())
    return stats


def scrape_new_launches(target_year: int = 2026, dry_run: bool = False) -> Dict[str, Any]:
    """Scrape upcoming launches."""
    # For upcoming launches, use simpler approach for now
    return {
        "scraped": 0,
        "message": "Upcoming launch scraping not yet implemented with Playwright",
    }


def validate_new_launches() -> Dict[str, Any]:
    """Validate existing launches."""
    return {
        "validated": 0,
        "message": "Validation not yet implemented with Playwright",
    }
