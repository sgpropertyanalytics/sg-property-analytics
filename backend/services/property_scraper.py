"""
Property Scraper - Unified multi-source scraper for Singapore property data

Consolidates scraping for both:
1. LAUNCHED projects (Active New Sales) → project_inventory table
2. UPCOMING launches (Pre-launch 2026+) → new_launches table

Data Sources (10 total):
1. EdgeProp Singapore (priority 1)
2. 99.co (priority 2)
3. PropertyGuru (priority 2)
4. SRX Property (priority 3)
5. PropNex (priority 3)
6. ERA Singapore (priority 3)
7. Huttons (priority 4)
8. OrangeTee (priority 4)
9. StraitsTimes Property (priority 4)
10. URA Developer Sales API (priority 1, if configured)

Cross-validates data between sources for increased confidence.

Usage:
    from services.property_scraper import PropertyScraper

    scraper = PropertyScraper()

    # For launched projects (Active New Sales)
    result = scraper.scrape_project("NORMANTON PARK")
    scraper.save_to_inventory("NORMANTON PARK", result)

    # For upcoming launches
    launches = scraper.scrape_upcoming_launches()
    scraper.save_upcoming_launches(launches, target_year=2026)
"""
import os
import re
import time
import requests
from datetime import datetime, date
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from bs4 import BeautifulSoup
from urllib.parse import quote, urljoin
import json


# =============================================================================
# CONFIGURATION
# =============================================================================

REQUEST_DELAY = 1.0  # seconds between requests to same source
TIMEOUT = 30  # request timeout in seconds

SOURCES = {
    "edgeprop": {
        "name": "EdgeProp Singapore",
        "base_url": "https://www.edgeprop.sg",
        "search_url": "https://www.edgeprop.sg/search?q={query}",
        "new_launches_url": "https://www.edgeprop.sg/new-launches",
        "priority": 1,
        "enabled": True,
    },
    "99co": {
        "name": "99.co",
        "base_url": "https://www.99.co",
        "search_url": "https://www.99.co/singapore/condos-apartments?search_text={query}",
        "new_launches_url": "https://www.99.co/singapore/new-launches",
        "priority": 2,
        "enabled": True,
    },
    "propertyguru": {
        "name": "PropertyGuru",
        "base_url": "https://www.propertyguru.com.sg",
        "search_url": "https://www.propertyguru.com.sg/property-for-sale?freetext={query}",
        "new_launches_url": "https://www.propertyguru.com.sg/new-launch/",
        "priority": 2,
        "enabled": True,
    },
    "srx": {
        "name": "SRX Property",
        "base_url": "https://www.srx.com.sg",
        "search_url": "https://www.srx.com.sg/search?q={query}",
        "new_launches_url": "https://www.srx.com.sg/new-launches",
        "priority": 3,
        "enabled": True,
    },
    "propnex": {
        "name": "PropNex",
        "base_url": "https://www.propnex.com",
        "search_url": "https://www.propnex.com/new-launch?q={query}",
        "new_launches_url": "https://www.propnex.com/new-launch",
        "priority": 3,
        "enabled": True,
    },
    "era": {
        "name": "ERA Singapore",
        "base_url": "https://www.era.com.sg",
        "search_url": "https://www.era.com.sg/new-launches/?s={query}",
        "new_launches_url": "https://www.era.com.sg/new-launches/",
        "priority": 3,
        "enabled": True,
    },
    "huttons": {
        "name": "Huttons",
        "base_url": "https://www.huttons.com.sg",
        "search_url": "https://www.huttons.com.sg/new-launches/?s={query}",
        "new_launches_url": "https://www.huttons.com.sg/new-launches/",
        "priority": 4,
        "enabled": True,
    },
    "orangetee": {
        "name": "OrangeTee",
        "base_url": "https://www.orangetee.com",
        "search_url": "https://www.orangetee.com/new-launches/?s={query}",
        "new_launches_url": "https://www.orangetee.com/new-launches/",
        "priority": 4,
        "enabled": True,
    },
    "stproperty": {
        "name": "StraitsTimes Property",
        "base_url": "https://www.stproperty.sg",
        "search_url": "https://www.stproperty.sg/search?q={query}",
        "new_launches_url": "https://www.stproperty.sg/new-launches",
        "priority": 4,
        "enabled": True,
    },
    "ura": {
        "name": "URA Developer Sales",
        "base_url": "https://www.ura.gov.sg",
        "search_url": None,  # Uses API instead
        "new_launches_url": None,
        "priority": 1,
        "enabled": True,
    },
}


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class SourceResult:
    """Result from a single source scrape."""
    source_name: str
    total_units: Optional[int] = None
    developer: Optional[str] = None
    tenure: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    indicative_psf_low: Optional[float] = None
    indicative_psf_high: Optional[float] = None
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
    Unified multi-source scraper for Singapore property data.

    Handles both:
    - Launched projects (scrape_project) → project_inventory
    - Upcoming launches (scrape_upcoming_launches) → new_launches
    """

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        })
        self._last_request_time: Dict[str, float] = {}
        self._ura_cache: Optional[List] = None

    # =========================================================================
    # SHARED UTILITIES
    # =========================================================================

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

    def _normalize_name(self, name: str) -> str:
        """Normalize project name for matching."""
        if not name:
            return ""
        normalized = name.upper().strip()
        for suffix in [" (EC)", " EC", " CONDO", " CONDOMINIUM", " RESIDENCES", " RESIDENCE"]:
            if normalized.endswith(suffix):
                normalized = normalized[:-len(suffix)]
        return normalized

    def _extract_number(self, text: str) -> Optional[int]:
        """Extract first number from text."""
        if not text:
            return None
        cleaned = re.sub(r'[,\s]', '', str(text))
        match = re.search(r'(\d+)', cleaned)
        return int(match.group(1)) if match else None

    def _extract_district(self, text: str) -> Optional[str]:
        """Extract district code from text."""
        if not text:
            return None
        match = re.search(r'D?(\d{1,2})\b', text, re.I)
        if match:
            district_num = int(match.group(1))
            if 1 <= district_num <= 28:
                return f"D{district_num:02d}"
        return None

    def _extract_psf(self, text: str) -> Tuple[Optional[float], Optional[float]]:
        """Extract PSF range from text."""
        if not text:
            return None, None

        text = text.replace(',', '').lower()

        # Range pattern: "$1,800 - $2,200"
        match = re.search(r'\$?(\d+(?:\.\d+)?)\s*(?:-|to)\s*\$?(\d+(?:\.\d+)?)', text)
        if match:
            return float(match.group(1)), float(match.group(2))

        # Single value: "From $1,800 psf"
        match = re.search(r'\$?(\d+(?:\.\d+)?)\s*(?:psf|per\s*sq)', text)
        if match:
            psf = float(match.group(1))
            return psf, psf

        return None, None

    def _get_market_segment(self, district: str) -> Optional[str]:
        """Get market segment (CCR/RCR/OCR) from district."""
        try:
            from constants import get_region_for_district
            return get_region_for_district(district) if district else None
        except ImportError:
            # Fallback mapping
            ccr = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11']
            rcr = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
            if district in ccr:
                return 'CCR'
            elif district in rcr:
                return 'RCR'
            elif district:
                return 'OCR'
            return None

    def _extract_units_from_text(self, text: str) -> Optional[int]:
        """Extract unit count from text using common patterns."""
        if not text:
            return None

        text_lower = text.lower()
        patterns = [
            r'(\d+)\s*(?:units?|residential)',
            r'total\s*(?:of\s*)?(\d+)\s*units?',
            r'(\d+)\s*unit\s*development',
            r'no\.\s*of\s*units?\s*:?\s*(\d+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                units = int(match.group(1))
                # Validate: units should be reasonable (10-5000)
                if 10 <= units <= 5000:
                    return units
        return None

    def _extract_developer(self, text: str) -> Optional[str]:
        """Extract developer name from text."""
        if not text:
            return None
        match = re.search(r'developer[:\s]+([A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?)?)', text, re.I)
        if match:
            return match.group(1).strip()
        return None

    def _extract_tenure(self, text: str) -> Optional[str]:
        """Extract tenure from text."""
        if not text:
            return None
        text_lower = text.lower()
        if 'freehold' in text_lower:
            return 'Freehold'
        elif '999' in text_lower:
            return '999-year'
        elif '99' in text_lower:
            return '99-year'
        return None

    # =========================================================================
    # SOURCE-SPECIFIC SCRAPERS
    # =========================================================================

    def _scrape_source(self, source_key: str, project_name: str) -> SourceResult:
        """Generic scraper for a single source."""
        result = SourceResult(source_name=SOURCES[source_key]["name"])
        config = SOURCES.get(source_key, {})

        if not config.get("enabled", True):
            result.error = "Source disabled"
            return result

        try:
            # Special handling for URA API
            if source_key == "ura":
                return self._scrape_ura(project_name)

            # Build search URL
            search_url_template = config.get("search_url")
            if not search_url_template:
                result.error = "No search URL configured"
                return result

            search_url = search_url_template.format(query=quote(project_name))
            html = self._fetch_url(search_url, source_key)

            if not html:
                result.error = "Failed to fetch search page"
                return result

            soup = BeautifulSoup(html, 'html.parser')
            page_text = soup.get_text()

            # Check if project name appears in results
            if self._normalize_name(project_name).lower() not in page_text.lower():
                return result  # Project not found

            # Extract data
            result.total_units = self._extract_units_from_text(page_text)
            result.developer = self._extract_developer(page_text)
            result.tenure = self._extract_tenure(page_text)
            result.district = self._extract_district(page_text)
            result.indicative_psf_low, result.indicative_psf_high = self._extract_psf(page_text)

            # Try to find project detail link
            for card in soup.find_all(['div', 'article', 'a'], class_=re.compile(r'project|listing|card|property', re.I)):
                if self._normalize_name(project_name).lower() in card.get_text().lower():
                    link = card.find('a', href=True) if card.name != 'a' else card
                    if link and link.get('href'):
                        result.source_url = urljoin(config["base_url"], link['href'])
                        break

            # If we found a detail page, scrape it for more info
            if result.source_url and not result.total_units:
                detail_html = self._fetch_url(result.source_url, source_key)
                if detail_html:
                    detail_text = BeautifulSoup(detail_html, 'html.parser').get_text()
                    if not result.total_units:
                        result.total_units = self._extract_units_from_text(detail_text)
                    if not result.developer:
                        result.developer = self._extract_developer(detail_text)
                    if not result.tenure:
                        result.tenure = self._extract_tenure(detail_text)

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_ura(self, project_name: str) -> SourceResult:
        """Scrape from URA Developer Sales API."""
        result = SourceResult(source_name=SOURCES["ura"]["name"])

        try:
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
            self._rate_limit("ura")
            data_response = self.session.get(
                "https://www.ura.gov.sg/uraDataService/invokeUraDS",
                params={"service": "PMI_Resi_Developer_Sales"},
                headers={"AccessKey": access_key, "Token": token},
                timeout=TIMEOUT
            )

            if data_response.status_code == 200:
                ura_data = data_response.json().get("Result", [])
                normalized_name = self._normalize_name(project_name)

                for project in ura_data:
                    ura_project_name = project.get("project", "")
                    ura_normalized = self._normalize_name(ura_project_name)

                    # Exact or fuzzy match
                    if ura_normalized == normalized_name:
                        match = project
                    elif SequenceMatcher(None, normalized_name, ura_normalized).ratio() > 0.85:
                        match = project
                    else:
                        continue

                    result.total_units = match.get("launchedToDate")
                    result.developer = match.get("developer")
                    result.source_url = "https://www.ura.gov.sg/maps/"
                    result.raw_data = match
                    break

        except Exception as e:
            result.error = str(e)

        return result

    def _scrape_upcoming_from_source(self, source_key: str) -> List[SourceResult]:
        """Scrape all upcoming launches from a source's listing page."""
        results = []
        config = SOURCES.get(source_key, {})

        if not config.get("enabled", True):
            return results

        new_launches_url = config.get("new_launches_url")
        if not new_launches_url:
            return results

        try:
            html = self._fetch_url(new_launches_url, source_key)
            if not html:
                return results

            soup = BeautifulSoup(html, 'html.parser')

            # Find project cards
            cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|property|listing|card|launch', re.I))

            for card in cards:
                try:
                    # Extract project name
                    name_elem = card.find(['h2', 'h3', 'h4', 'a', 'span'],
                                          class_=re.compile(r'title|name|heading|project', re.I))
                    if not name_elem:
                        name_elem = card.find(['h2', 'h3', 'h4'])
                    if not name_elem:
                        continue

                    project_name = name_elem.get_text().strip()
                    if not project_name or len(project_name) < 3:
                        continue

                    result = SourceResult(source_name=config["name"])
                    card_text = card.get_text()

                    result.total_units = self._extract_units_from_text(card_text)
                    result.developer = self._extract_developer(card_text)
                    result.tenure = self._extract_tenure(card_text)
                    result.district = self._extract_district(card_text)
                    result.indicative_psf_low, result.indicative_psf_high = self._extract_psf(card_text)

                    # Get link
                    link = card.find('a', href=True)
                    if link:
                        result.source_url = urljoin(config["base_url"], link['href'])

                    # Store project name in raw_data
                    result.raw_data = {"project_name": project_name}
                    results.append(result)

                except Exception:
                    continue

        except Exception as e:
            print(f"  {source_key} upcoming scrape error: {e}")

        return results

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
            for base_value in list(value_groups.keys()):
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
        high_priority_sources = {"URA Developer Sales", "EdgeProp Singapore", "99.co", "PropertyGuru"}

        if len(best_sources) >= 3:
            validated.total_units_confidence = "high"
        elif len(best_sources) >= 2:
            validated.total_units_confidence = "medium"
        elif len(best_sources) == 1:
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

        # Extract other fields from highest priority source
        for r in sorted(results, key=lambda x: SOURCES.get(
                x.source_name.lower().replace(' ', '').replace('singapore', ''),
                {}).get('priority', 99)):
            if r.developer and not validated.developer:
                validated.developer = r.developer
            if r.tenure and not validated.tenure:
                validated.tenure = r.tenure
            if r.district and not validated.district:
                validated.district = r.district
            if r.address and not validated.address:
                validated.address = r.address
            if r.indicative_psf_low and not validated.indicative_psf_low:
                validated.indicative_psf_low = r.indicative_psf_low
                validated.indicative_psf_high = r.indicative_psf_high

        # Set market segment from district
        if validated.district:
            validated.market_segment = self._get_market_segment(validated.district)

        return validated

    # =========================================================================
    # PUBLIC API - LAUNCHED PROJECTS (project_inventory)
    # =========================================================================

    def scrape_project(self, project_name: str, sources: Optional[List[str]] = None) -> CrossValidatedResult:
        """
        Scrape all sources for a specific launched project.

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
            result = self._scrape_source(source_key, project_name)
            results.append(result)

            if result.total_units:
                print(f"    Found: {result.total_units} units")
            elif result.error:
                print(f"    Error: {result.error}")
            else:
                print(f"    No data found")

        validated = self._cross_validate(results, project_name)
        print(f"  Result: {validated.total_units} units (confidence: {validated.total_units_confidence})")
        if validated.discrepancies:
            print(f"  Discrepancies: {validated.discrepancies}")

        return validated

    def save_to_inventory(self, project_name: str, result: CrossValidatedResult) -> Dict[str, Any]:
        """
        Save scraped result to project_inventory table.

        Args:
            project_name: Project name
            result: CrossValidatedResult from scrape_project

        Returns:
            Dict with status and saved data
        """
        from models.project_inventory import ProjectInventory
        from models.database import db

        if result.total_units and result.total_units_confidence in ["high", "medium"]:
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
                return {"status": "error", "error": str(e), "project_name": project_name}

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

    def scrape_and_save(self, project_name: str) -> Dict[str, Any]:
        """Convenience method to scrape and save in one call."""
        result = self.scrape_project(project_name)
        return self.save_to_inventory(project_name, result)

    # =========================================================================
    # PUBLIC API - UPCOMING LAUNCHES (new_launches)
    # =========================================================================

    def scrape_upcoming_launches(self, sources: Optional[List[str]] = None) -> List[Dict]:
        """
        Scrape all sources for upcoming launch projects.

        Args:
            sources: Optional list of source keys (default: all with new_launches_url)

        Returns:
            List of validated project data dicts
        """
        print("Scraping upcoming launches from all sources...")

        if sources is None:
            sources = [k for k, v in SOURCES.items()
                      if v.get("enabled", True) and v.get("new_launches_url")]

        all_results: List[SourceResult] = []

        for source_key in sources:
            print(f"  Scraping {SOURCES[source_key]['name']}...")
            try:
                results = self._scrape_upcoming_from_source(source_key)
                print(f"    Found {len(results)} projects")
                all_results.extend(results)
            except Exception as e:
                print(f"    Error: {e}")

        print(f"\nTotal scraped: {len(all_results)} entries")

        # Group by project name and cross-validate
        projects: Dict[str, List[SourceResult]] = {}
        for result in all_results:
            project_name = result.raw_data.get("project_name", "")
            if not project_name:
                continue
            key = self._normalize_name(project_name)
            if key:
                projects.setdefault(key, []).append(result)

        # Merge and validate each project
        validated = []
        for normalized_name, results in projects.items():
            project_name = results[0].raw_data.get("project_name", normalized_name)
            sources_list = [r.source_name for r in results]

            merged = {
                "project_name": project_name,
                "sources": sources_list,
                "source_count": len(results),
                "confidence": "high" if len(results) >= 3 else "medium" if len(results) >= 2 else "low",
                "district": None,
                "market_segment": None,
                "total_units": None,
                "developer": None,
                "tenure": None,
                "indicative_psf_low": None,
                "indicative_psf_high": None,
                "source_urls": [],
            }

            # Aggregate data - prioritize by source priority
            for result in sorted(results, key=lambda x: SOURCES.get(
                    x.source_name.lower().replace(' ', ''), {}).get('priority', 99)):
                if result.district and not merged["district"]:
                    merged["district"] = result.district
                if result.total_units and not merged["total_units"]:
                    merged["total_units"] = result.total_units
                if result.developer and not merged["developer"]:
                    merged["developer"] = result.developer
                if result.tenure and not merged["tenure"]:
                    merged["tenure"] = result.tenure
                if result.indicative_psf_low and not merged["indicative_psf_low"]:
                    merged["indicative_psf_low"] = result.indicative_psf_low
                    merged["indicative_psf_high"] = result.indicative_psf_high
                if result.source_url:
                    merged["source_urls"].append(result.source_url)

            # Set market segment
            if merged["district"]:
                merged["market_segment"] = self._get_market_segment(merged["district"])

            validated.append(merged)

        print(f"Validated: {len(validated)} unique projects")
        return validated

    def save_upcoming_launches(self, validated: List[Dict], target_year: int = 2026) -> Dict[str, Any]:
        """
        Save validated upcoming launches to new_launches table.

        Args:
            validated: List of validated project data from scrape_upcoming_launches
            target_year: Launch year to assign (default 2026)

        Returns:
            Statistics dict
        """
        from models.new_launch import NewLaunch
        from models.database import db

        stats = {"created": 0, "updated": 0, "skipped": 0, "errors": []}

        for project in validated:
            try:
                existing = NewLaunch.query.filter_by(
                    project_name=project["project_name"]
                ).first()

                if existing:
                    # Update if we have more sources
                    if project["source_count"] > len((existing.data_source or "").split(",")):
                        existing.district = project.get("district") or existing.district
                        existing.market_segment = project.get("market_segment") or existing.market_segment
                        existing.total_units = project.get("total_units") or existing.total_units
                        existing.developer = project.get("developer") or existing.developer
                        existing.tenure = project.get("tenure") or existing.tenure
                        existing.indicative_psf_low = project.get("indicative_psf_low") or existing.indicative_psf_low
                        existing.indicative_psf_high = project.get("indicative_psf_high") or existing.indicative_psf_high
                        existing.data_source = ", ".join(project["sources"])
                        existing.data_confidence = project["confidence"]
                        existing.updated_at = datetime.utcnow()
                        stats["updated"] += 1
                    else:
                        stats["skipped"] += 1
                else:
                    new_launch = NewLaunch(
                        project_name=project["project_name"],
                        district=project.get("district"),
                        market_segment=project.get("market_segment"),
                        total_units=project.get("total_units"),
                        developer=project.get("developer"),
                        tenure=project.get("tenure"),
                        indicative_psf_low=project.get("indicative_psf_low"),
                        indicative_psf_high=project.get("indicative_psf_high"),
                        launch_year=target_year,
                        data_source=", ".join(project["sources"]),
                        data_confidence=project["confidence"],
                        needs_review=project["confidence"] == "low",
                    )
                    db.session.add(new_launch)
                    stats["created"] += 1

            except Exception as e:
                stats["errors"].append({"project": project["project_name"], "error": str(e)})

        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            stats["errors"].append({"commit_error": str(e)})

        return stats


# =============================================================================
# CONVENIENCE FUNCTIONS (backward compatibility)
# =============================================================================

def scrape_project(project_name: str) -> CrossValidatedResult:
    """Scrape a single launched project."""
    return PropertyScraper().scrape_project(project_name)


def scrape_and_save_project(project_name: str) -> Dict[str, Any]:
    """Scrape and save a launched project to inventory."""
    return PropertyScraper().scrape_and_save(project_name)


def scrape_missing_projects(limit: int = 50) -> Dict[str, Any]:
    """
    Scrape total_units for projects missing inventory data.

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

    missing_projects = db.session.query(projects_with_sales.c.project_name).outerjoin(
        ProjectInventory,
        projects_with_sales.c.project_name == ProjectInventory.project_name
    ).filter(
        ProjectInventory.id.is_(None)
    ).order_by(
        projects_with_sales.c.sales_count.desc()
    ).limit(limit).all()

    print(f"Found {len(missing_projects)} projects missing inventory data")

    scraper = PropertyScraper()
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


def scrape_new_launches(target_year: int = 2026, dry_run: bool = False) -> Dict[str, Any]:
    """
    Scrape upcoming launches and optionally save to database.

    Args:
        target_year: Launch year to assign
        dry_run: If True, don't save to database

    Returns:
        Statistics dict
    """
    scraper = PropertyScraper()
    validated = scraper.scrape_upcoming_launches()

    stats = {
        "scraped": len(validated),
        "high_confidence": len([v for v in validated if v["confidence"] == "high"]),
        "medium_confidence": len([v for v in validated if v["confidence"] == "medium"]),
        "low_confidence": len([v for v in validated if v["confidence"] == "low"]),
    }

    if not dry_run:
        save_stats = scraper.save_upcoming_launches(validated, target_year)
        stats.update(save_stats)

    return stats


def validate_new_launches() -> Dict[str, Any]:
    """
    Re-validate existing new launches against fresh scrapes.

    Returns:
        Validation statistics
    """
    from models.new_launch import NewLaunch
    from models.database import db

    scraper = PropertyScraper()
    fresh_data = scraper.scrape_upcoming_launches()

    # Create lookup by normalized name
    fresh_lookup = {}
    for project in fresh_data:
        key = scraper._normalize_name(project["project_name"])
        fresh_lookup[key] = project

    stats = {"validated": 0, "discrepancies": 0, "not_found": 0, "errors": []}
    existing = NewLaunch.query.all()

    for record in existing:
        key = scraper._normalize_name(record.project_name)
        fresh = fresh_lookup.get(key)

        if not fresh:
            stats["not_found"] += 1
            continue

        has_discrepancy = False

        if fresh.get("total_units") and record.total_units:
            if abs(fresh["total_units"] - record.total_units) > record.total_units * 0.1:
                has_discrepancy = True
                record.review_reason = f"Units mismatch: DB={record.total_units}, Fresh={fresh['total_units']}"

        if has_discrepancy:
            record.needs_review = True
            stats["discrepancies"] += 1
        else:
            stats["validated"] += 1

    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        stats["errors"].append(str(e))

    return stats
