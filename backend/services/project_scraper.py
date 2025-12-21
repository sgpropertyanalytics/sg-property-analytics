"""
Project Data Scraper - Multi-source scraper for Singapore condo project data

Scrapes total_units and project details from 10 reputable sources:
1. EdgeProp Singapore
2. 99.co
3. PropertyGuru
4. SRX Property
5. PropNex
6. ERA Singapore
7. Huttons
8. OrangeTee
9. StraitsTimes Property
10. URA (official government source)

Cross-validates data between sources for increased confidence.
Stores results in project_inventory table.

Usage:
    from services.project_scraper import ProjectScraper
    scraper = ProjectScraper()
    result = scraper.scrape_project("NORMANTON PARK")
    # or
    results = scraper.scrape_all_new_launches()
"""
import os
import re
import time
import requests
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from bs4 import BeautifulSoup
from urllib.parse import quote, urljoin
import json

# Rate limiting
REQUEST_DELAY = 1.0  # seconds between requests to same source
TIMEOUT = 30  # request timeout in seconds


@dataclass
class SourceResult:
    """Result from a single source."""
    source_name: str
    total_units: Optional[int] = None
    developer: Optional[str] = None
    tenure: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    expected_top: Optional[str] = None
    source_url: Optional[str] = None
    raw_data: Dict = field(default_factory=dict)
    error: Optional[str] = None
    scraped_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class CrossValidatedResult:
    """Cross-validated result from multiple sources."""
    project_name: str
    total_units: Optional[int] = None
    total_units_confidence: str = "none"  # high, medium, low, none
    total_units_sources: List[str] = field(default_factory=list)
    developer: Optional[str] = None
    tenure: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    source_results: List[SourceResult] = field(default_factory=list)
    sources_checked: int = 0
    sources_with_data: int = 0
    discrepancies: List[str] = field(default_factory=list)


# =============================================================================
# SOURCE CONFIGURATIONS
# =============================================================================

SOURCES = {
    "edgeprop": {
        "name": "EdgeProp Singapore",
        "base_url": "https://www.edgeprop.sg",
        "search_url": "https://www.edgeprop.sg/search?q={query}",
        "priority": 1,  # Higher priority = more trusted
        "enabled": True,
    },
    "99co": {
        "name": "99.co",
        "base_url": "https://www.99.co",
        "search_url": "https://www.99.co/singapore/condos-apartments?search_text={query}",
        "priority": 2,
        "enabled": True,
    },
    "propertyguru": {
        "name": "PropertyGuru",
        "base_url": "https://www.propertyguru.com.sg",
        "search_url": "https://www.propertyguru.com.sg/property-for-sale?freetext={query}",
        "priority": 2,
        "enabled": True,
    },
    "srx": {
        "name": "SRX Property",
        "base_url": "https://www.srx.com.sg",
        "search_url": "https://www.srx.com.sg/search?q={query}",
        "priority": 3,
        "enabled": True,
    },
    "propnex": {
        "name": "PropNex",
        "base_url": "https://www.propnex.com",
        "search_url": "https://www.propnex.com/new-launch?q={query}",
        "priority": 3,
        "enabled": True,
    },
    "era": {
        "name": "ERA Singapore",
        "base_url": "https://www.era.com.sg",
        "search_url": "https://www.era.com.sg/new-launches/?s={query}",
        "priority": 3,
        "enabled": True,
    },
    "huttons": {
        "name": "Huttons",
        "base_url": "https://www.huttons.com.sg",
        "search_url": "https://www.huttons.com.sg/new-launches/?s={query}",
        "priority": 4,
        "enabled": True,
    },
    "orangetee": {
        "name": "OrangeTee",
        "base_url": "https://www.orangetee.com",
        "search_url": "https://www.orangetee.com/new-launches/?s={query}",
        "priority": 4,
        "enabled": True,
    },
    "stproperty": {
        "name": "StraitsTimes Property",
        "base_url": "https://www.stproperty.sg",
        "search_url": "https://www.stproperty.sg/search?q={query}",
        "priority": 4,
        "enabled": True,
    },
    "ura": {
        "name": "URA Developer Sales",
        "base_url": "https://www.ura.gov.sg",
        "search_url": None,  # Uses API instead
        "priority": 1,  # Official source = highest priority
        "enabled": True,
    },
}


class ProjectScraper:
    """Multi-source scraper for Singapore condo project data."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        self._last_request_time: Dict[str, float] = {}

    def _rate_limit(self, source_key: str):
        """Enforce rate limiting per source."""
        now = time.time()
        last_time = self._last_request_time.get(source_key, 0)
        elapsed = now - last_time
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        self._last_request_time[source_key] = time.time()

    def _fetch_url(self, url: str, source_key: str) -> Optional[str]:
        """Fetch URL with rate limiting and error handling."""
        self._rate_limit(source_key)
        try:
            response = self.session.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            return response.text
        except requests.RequestException as e:
            print(f"  [{source_key}] Request failed: {e}")
            return None

    def _normalize_project_name(self, name: str) -> str:
        """Normalize project name for matching."""
        if not name:
            return ""
        normalized = name.upper().strip()
        # Remove common suffixes
        for suffix in [" (EC)", " EC", " CONDO", " CONDOMINIUM", " RESIDENCES", " RESIDENCE"]:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
        return normalized

    def _extract_number(self, text: str) -> Optional[int]:
        """Extract first number from text."""
        if not text:
            return None
        # Remove commas and find digits
        cleaned = re.sub(r'[,\s]', '', str(text))
        match = re.search(r'(\d+)', cleaned)
        if match:
            return int(match.group(1))
        return None

    # =========================================================================
    # INDIVIDUAL SOURCE SCRAPERS
    # =========================================================================

    def _scrape_edgeprop(self, project_name: str) -> SourceResult:
        """Scrape EdgeProp for project data."""
        source_key = "edgeprop"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            # Search for project
            search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)
            if not html:
                result.error = "Failed to fetch search page"
                return result

            soup = BeautifulSoup(html, 'html.parser')

            # Look for project card or listing
            # EdgeProp uses various selectors for project info
            project_cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|listing|property', re.I))

            for card in project_cards:
                card_text = card.get_text().lower()
                if self._normalize_project_name(project_name).lower() in card_text:
                    # Found matching project, extract data
                    # Look for unit count patterns
                    units_patterns = [
                        r'(\d+)\s*(?:units?|residential)',
                        r'total\s*(?:of\s*)?(\d+)\s*units?',
                        r'(\d+)\s*unit\s*development',
                    ]
                    for pattern in units_patterns:
                        match = re.search(pattern, card_text)
                        if match:
                            result.total_units = int(match.group(1))
                            break

                    # Look for links to project page
                    link = card.find('a', href=True)
                    if link:
                        result.source_url = urljoin(SOURCES[source_key]["base_url"], link['href'])
                    break

            # If found a project page URL, scrape it for more details
            if result.source_url:
                detail_html = self._fetch_url(result.source_url, source_key)
                if detail_html:
                    detail_soup = BeautifulSoup(detail_html, 'html.parser')
                    detail_text = detail_soup.get_text()

                    # Extract total units from detail page
                    if not result.total_units:
                        for pattern in [r'(\d+)\s*units', r'total\s*units?\s*:?\s*(\d+)']:
                            match = re.search(pattern, detail_text.lower())
                            if match:
                                result.total_units = int(match.group(1))
                                break

                    # Extract developer
                    dev_match = re.search(r'developer\s*:?\s*([A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?|Limited)?)', detail_text, re.I)
                    if dev_match:
                        result.developer = dev_match.group(1).strip()

                    # Extract tenure
                    tenure_match = re.search(r'(freehold|99[\s-]*year|999[\s-]*year)', detail_text, re.I)
                    if tenure_match:
                        result.tenure = tenure_match.group(1)

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_99co(self, project_name: str) -> SourceResult:
        """Scrape 99.co for project data."""
        source_key = "99co"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            # 99.co has a structured new launches section
            search_url = f"https://www.99.co/singapore/new-launches/{quote(project_name.lower().replace(' ', '-'))}"
            html = self._fetch_url(search_url, source_key)

            if html:
                soup = BeautifulSoup(html, 'html.parser')
                page_text = soup.get_text()

                # Extract total units
                units_patterns = [
                    r'(\d+)\s*units?\s*(?:in\s*total|total)',
                    r'total\s*(?:of\s*)?(\d+)\s*units?',
                    r'(\d+)\s*residential\s*units?',
                ]
                for pattern in units_patterns:
                    match = re.search(pattern, page_text.lower())
                    if match:
                        result.total_units = int(match.group(1))
                        result.source_url = search_url
                        break

                # Extract developer
                dev_match = re.search(r'developer\s*:?\s*([A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?)?)', page_text, re.I)
                if dev_match:
                    result.developer = dev_match.group(1).strip()

            # Fallback to search
            if not result.total_units:
                search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
                html = self._fetch_url(search_url, source_key)
                if html:
                    soup = BeautifulSoup(html, 'html.parser')
                    # Look for project listings
                    for listing in soup.find_all('div', class_=re.compile(r'listing|card|property', re.I)):
                        if self._normalize_project_name(project_name).lower() in listing.get_text().lower():
                            units_match = re.search(r'(\d+)\s*units?', listing.get_text().lower())
                            if units_match:
                                result.total_units = int(units_match.group(1))
                            link = listing.find('a', href=True)
                            if link:
                                result.source_url = urljoin(SOURCES[source_key]["base_url"], link['href'])
                            break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_propertyguru(self, project_name: str) -> SourceResult:
        """Scrape PropertyGuru for project data."""
        source_key = "propertyguru"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            # PropertyGuru new launches section
            slug = project_name.lower().replace(' ', '-').replace("'", "")
            search_url = f"https://www.propertyguru.com.sg/new-launch/{slug}"
            html = self._fetch_url(search_url, source_key)

            if html and "404" not in html[:500]:
                soup = BeautifulSoup(html, 'html.parser')
                page_text = soup.get_text()

                # Extract total units
                for pattern in [r'(\d+)\s*units?', r'total\s*units?\s*:?\s*(\d+)']:
                    match = re.search(pattern, page_text.lower())
                    if match:
                        units = int(match.group(1))
                        # Validate: units should be reasonable (10-5000)
                        if 10 <= units <= 5000:
                            result.total_units = units
                            result.source_url = search_url
                            break

                # Extract developer
                dev_match = re.search(r'developer[:\s]+([A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?)?)', page_text, re.I)
                if dev_match:
                    result.developer = dev_match.group(1).strip()

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_srx(self, project_name: str) -> SourceResult:
        """Scrape SRX Property for project data."""
        source_key = "srx"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            # SRX has detailed project pages
            slug = project_name.lower().replace(' ', '-')
            urls_to_try = [
                f"https://www.srx.com.sg/new-launches/{slug}",
                f"https://www.srx.com.sg/project/{slug}",
            ]

            for url in urls_to_try:
                html = self._fetch_url(url, source_key)
                if html and "404" not in html[:500] and "not found" not in html.lower()[:500]:
                    soup = BeautifulSoup(html, 'html.parser')
                    page_text = soup.get_text()

                    # Look for unit info in structured data
                    for pattern in [r'(\d+)\s*units?', r'no\.\s*of\s*units?\s*:?\s*(\d+)']:
                        match = re.search(pattern, page_text.lower())
                        if match:
                            units = int(match.group(1))
                            if 10 <= units <= 5000:
                                result.total_units = units
                                result.source_url = url
                                break
                    if result.total_units:
                        break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_propnex(self, project_name: str) -> SourceResult:
        """Scrape PropNex for project data."""
        source_key = "propnex"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)

            if html:
                soup = BeautifulSoup(html, 'html.parser')

                # Look for project cards
                for card in soup.find_all(['div', 'article'], class_=re.compile(r'project|listing|card', re.I)):
                    if self._normalize_project_name(project_name).lower() in card.get_text().lower():
                        units_match = re.search(r'(\d+)\s*units?', card.get_text().lower())
                        if units_match:
                            units = int(units_match.group(1))
                            if 10 <= units <= 5000:
                                result.total_units = units

                        link = card.find('a', href=True)
                        if link:
                            result.source_url = urljoin(SOURCES[source_key]["base_url"], link['href'])
                        break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_era(self, project_name: str) -> SourceResult:
        """Scrape ERA Singapore for project data."""
        source_key = "era"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)

            if html:
                soup = BeautifulSoup(html, 'html.parser')
                page_text = soup.get_text()

                # ERA often has structured project info
                if self._normalize_project_name(project_name).lower() in page_text.lower():
                    for pattern in [r'(\d+)\s*units?', r'total\s*units?\s*:?\s*(\d+)']:
                        match = re.search(pattern, page_text.lower())
                        if match:
                            units = int(match.group(1))
                            if 10 <= units <= 5000:
                                result.total_units = units
                                result.source_url = search_url
                                break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_huttons(self, project_name: str) -> SourceResult:
        """Scrape Huttons for project data."""
        source_key = "huttons"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)

            if html:
                soup = BeautifulSoup(html, 'html.parser')
                page_text = soup.get_text()

                if self._normalize_project_name(project_name).lower() in page_text.lower():
                    for pattern in [r'(\d+)\s*units?', r'total\s*units?\s*:?\s*(\d+)']:
                        match = re.search(pattern, page_text.lower())
                        if match:
                            units = int(match.group(1))
                            if 10 <= units <= 5000:
                                result.total_units = units
                                result.source_url = search_url
                                break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_orangetee(self, project_name: str) -> SourceResult:
        """Scrape OrangeTee for project data."""
        source_key = "orangetee"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)

            if html:
                soup = BeautifulSoup(html, 'html.parser')
                page_text = soup.get_text()

                if self._normalize_project_name(project_name).lower() in page_text.lower():
                    for pattern in [r'(\d+)\s*units?', r'total\s*units?\s*:?\s*(\d+)']:
                        match = re.search(pattern, page_text.lower())
                        if match:
                            units = int(match.group(1))
                            if 10 <= units <= 5000:
                                result.total_units = units
                                result.source_url = search_url
                                break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_stproperty(self, project_name: str) -> SourceResult:
        """Scrape StraitsTimes Property for project data."""
        source_key = "stproperty"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            search_url = SOURCES[source_key]["search_url"].format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)

            if html:
                soup = BeautifulSoup(html, 'html.parser')
                page_text = soup.get_text()

                if self._normalize_project_name(project_name).lower() in page_text.lower():
                    for pattern in [r'(\d+)\s*units?', r'total\s*units?\s*:?\s*(\d+)']:
                        match = re.search(pattern, page_text.lower())
                        if match:
                            units = int(match.group(1))
                            if 10 <= units <= 5000:
                                result.total_units = units
                                result.source_url = search_url
                                break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_ura(self, project_name: str) -> SourceResult:
        """Get data from URA Developer Sales API (if configured)."""
        source_key = "ura"
        result = SourceResult(source_name=SOURCES[source_key]["name"])

        try:
            # Check if URA API is configured
            access_key = os.getenv('URA_API_ACCESS_KEY')
            if not access_key:
                result.error = "URA API key not configured"
                return result

            # Get token
            token_response = self.session.get(
                "https://www.ura.gov.sg/uraDataService/insertNewToken.action",
                headers={"AccessKey": access_key},
                timeout=TIMEOUT
            )
            if token_response.status_code != 200:
                result.error = "Failed to get URA token"
                return result

            token = token_response.json().get("Result")
            if not token:
                result.error = "No token returned from URA"
                return result

            # Fetch developer sales data
            self._rate_limit(source_key)
            data_response = self.session.get(
                "https://www.ura.gov.sg/uraDataService/invokeUraDS",
                params={"service": "PMI_Resi_Developer_Sales"},
                headers={"AccessKey": access_key, "Token": token},
                timeout=TIMEOUT
            )

            if data_response.status_code == 200:
                ura_data = data_response.json().get("Result", [])

                # Find matching project
                normalized_name = self._normalize_project_name(project_name)
                for project in ura_data:
                    ura_project_name = project.get("project", "")
                    if self._normalize_project_name(ura_project_name) == normalized_name:
                        result.total_units = project.get("launchedToDate")
                        result.developer = project.get("developer")
                        result.source_url = "https://www.ura.gov.sg/maps/"
                        result.raw_data = project
                        break

                    # Fuzzy match
                    similarity = SequenceMatcher(None, normalized_name, self._normalize_project_name(ura_project_name)).ratio()
                    if similarity > 0.85:
                        result.total_units = project.get("launchedToDate")
                        result.developer = project.get("developer")
                        result.source_url = "https://www.ura.gov.sg/maps/"
                        result.raw_data = project
                        break

        except Exception as e:
            result.error = str(e)

        return result

    # =========================================================================
    # CROSS-VALIDATION
    # =========================================================================

    def _cross_validate(self, results: List[SourceResult], project_name: str) -> CrossValidatedResult:
        """
        Cross-validate results from multiple sources.

        Confidence levels:
        - high: 3+ sources agree on total_units (within 5% tolerance)
        - medium: 2 sources agree OR 1 high-priority source (URA, EdgeProp)
        - low: Only 1 lower-priority source
        - none: No data found
        """
        validated = CrossValidatedResult(project_name=project_name)
        validated.source_results = results
        validated.sources_checked = len(results)

        # Collect all total_units values with their sources
        units_by_source: Dict[str, int] = {}
        for r in results:
            if r.total_units and not r.error:
                units_by_source[r.source_name] = r.total_units
                validated.sources_with_data += 1

        if not units_by_source:
            validated.total_units_confidence = "none"
            return validated

        # Group similar values (within 5% tolerance)
        value_groups: Dict[int, List[str]] = {}
        for source, units in units_by_source.items():
            matched = False
            for base_value in value_groups:
                # Check if within 5% of existing group
                if abs(units - base_value) / base_value <= 0.05:
                    value_groups[base_value].append(source)
                    matched = True
                    break
            if not matched:
                value_groups[units] = [source]

        # Find the most agreed-upon value
        best_value = None
        best_sources = []
        for value, sources in value_groups.items():
            if len(sources) > len(best_sources):
                best_value = value
                best_sources = sources

        validated.total_units = best_value
        validated.total_units_sources = best_sources

        # Determine confidence
        if len(best_sources) >= 3:
            validated.total_units_confidence = "high"
        elif len(best_sources) >= 2:
            validated.total_units_confidence = "medium"
        elif len(best_sources) == 1:
            # Check if it's a high-priority source
            high_priority_sources = {"URA Developer Sales", "EdgeProp Singapore", "99.co", "PropertyGuru"}
            if best_sources[0] in high_priority_sources:
                validated.total_units_confidence = "medium"
            else:
                validated.total_units_confidence = "low"
        else:
            validated.total_units_confidence = "none"

        # Note discrepancies
        if len(value_groups) > 1:
            for value, sources in value_groups.items():
                if value != best_value:
                    validated.discrepancies.append(
                        f"{', '.join(sources)} report {value} units (vs {best_value})"
                    )

        # Extract other fields from highest priority source with data
        for r in sorted(results, key=lambda x: SOURCES.get(x.source_name.lower().replace(' ', ''), {}).get('priority', 99)):
            if r.developer and not validated.developer:
                validated.developer = r.developer
            if r.tenure and not validated.tenure:
                validated.tenure = r.tenure
            if r.district and not validated.district:
                validated.district = r.district
            if r.address and not validated.address:
                validated.address = r.address

        return validated

    # =========================================================================
    # PUBLIC API
    # =========================================================================

    def scrape_project(self, project_name: str, sources: Optional[List[str]] = None) -> CrossValidatedResult:
        """
        Scrape all sources for a single project.

        Args:
            project_name: Name of the project to search for
            sources: Optional list of source keys to use (default: all enabled)

        Returns:
            CrossValidatedResult with aggregated and validated data
        """
        print(f"Scraping project: {project_name}")

        if sources is None:
            sources = [k for k, v in SOURCES.items() if v.get("enabled", True)]

        results = []
        for source_key in sources:
            if source_key not in SOURCES:
                continue

            print(f"  Checking {SOURCES[source_key]['name']}...")

            # Call appropriate scraper
            scraper_method = getattr(self, f"_scrape_{source_key}", None)
            if scraper_method:
                result = scraper_method(project_name)
                results.append(result)

                if result.total_units:
                    print(f"    Found: {result.total_units} units")
                elif result.error:
                    print(f"    Error: {result.error}")
                else:
                    print(f"    No data found")

        # Cross-validate results
        validated = self._cross_validate(results, project_name)
        print(f"  Result: {validated.total_units} units (confidence: {validated.total_units_confidence})")
        if validated.discrepancies:
            print(f"  Discrepancies: {validated.discrepancies}")

        return validated

    def scrape_and_save(self, project_name: str) -> Dict[str, Any]:
        """
        Scrape project and save to database.

        Returns:
            Dict with status and saved data
        """
        from models.project_inventory import ProjectInventory
        from models.database import db

        result = self.scrape_project(project_name)

        if result.total_units and result.total_units_confidence in ["high", "medium"]:
            # Save to database
            try:
                record = ProjectInventory.query.filter_by(project_name=project_name).first()
                if not record:
                    record = ProjectInventory(project_name=project_name)
                    db.session.add(record)

                record.total_units = result.total_units
                record.data_source = f"SCRAPED ({result.total_units_confidence})"
                record.manual_source_url = result.source_results[0].source_url if result.source_results else None
                record.last_synced = datetime.utcnow()

                db.session.commit()

                return {
                    "status": "saved",
                    "project_name": project_name,
                    "total_units": result.total_units,
                    "confidence": result.total_units_confidence,
                    "sources": result.total_units_sources,
                }
            except Exception as e:
                db.session.rollback()
                return {
                    "status": "error",
                    "error": str(e),
                    "project_name": project_name,
                }
        elif result.total_units:
            return {
                "status": "low_confidence",
                "project_name": project_name,
                "total_units": result.total_units,
                "confidence": result.total_units_confidence,
                "message": "Data found but confidence too low to save automatically",
            }
        else:
            return {
                "status": "not_found",
                "project_name": project_name,
                "sources_checked": result.sources_checked,
            }


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def scrape_project(project_name: str) -> CrossValidatedResult:
    """Convenience function to scrape a single project."""
    scraper = ProjectScraper()
    return scraper.scrape_project(project_name)


def scrape_and_save_project(project_name: str) -> Dict[str, Any]:
    """Convenience function to scrape and save a project."""
    scraper = ProjectScraper()
    return scraper.scrape_and_save(project_name)


def scrape_missing_projects(limit: int = 50) -> Dict[str, Any]:
    """
    Scrape total_units for projects that are missing this data.

    Args:
        limit: Maximum number of projects to scrape

    Returns:
        Dict with statistics
    """
    from models.database import db
    from models.transaction import Transaction
    from models.project_inventory import ProjectInventory
    from sqlalchemy import func

    # Get projects with New Sale transactions but no inventory data
    projects_with_sales = db.session.query(
        Transaction.project_name,
        func.count(Transaction.id).label('sales_count')
    ).filter(
        Transaction.sale_type == 'New Sale',
        Transaction.is_outlier == False
    ).group_by(Transaction.project_name).subquery()

    # Find projects without inventory
    missing_projects = db.session.query(projects_with_sales.c.project_name).outerjoin(
        ProjectInventory,
        projects_with_sales.c.project_name == ProjectInventory.project_name
    ).filter(
        ProjectInventory.id.is_(None)
    ).order_by(
        projects_with_sales.c.sales_count.desc()
    ).limit(limit).all()

    print(f"Found {len(missing_projects)} projects missing inventory data")

    scraper = ProjectScraper()
    stats = {"scraped": 0, "saved": 0, "low_confidence": 0, "not_found": 0, "errors": []}

    for (project_name,) in missing_projects:
        result = scraper.scrape_and_save(project_name)
        stats["scraped"] += 1

        if result["status"] == "saved":
            stats["saved"] += 1
        elif result["status"] == "low_confidence":
            stats["low_confidence"] += 1
        elif result["status"] == "not_found":
            stats["not_found"] += 1
        elif result["status"] == "error":
            stats["errors"].append(result)

    return stats
