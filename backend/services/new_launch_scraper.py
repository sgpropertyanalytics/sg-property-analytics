"""
New Launch Scraper - Scrapes UPCOMING (pre-launch) condo projects

For 2026+ new private condo launches that haven't launched yet.
Cross-validates data from EdgeProp, PropNex, ERA.

DISTINCTION:
- new_launch_scraper.py: UPCOMING launches (pre-sale, not yet launched)
- project_scraper.py: LAUNCHED projects (need total_units for sales progress)

Data Sources:
1. EdgeProp New Launches
2. PropNex New Launches
3. ERA New Launches
4. PropertyGuru New Launches
5. SRX New Developments
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

from models.database import db
from models.new_launch import NewLaunch

# Rate limiting
REQUEST_DELAY = 1.5  # seconds between requests to same source
TIMEOUT = 30  # request timeout in seconds


@dataclass
class LaunchData:
    """Data for an upcoming launch project."""
    project_name: str
    source_name: str
    developer: Optional[str] = None
    district: Optional[str] = None
    market_segment: Optional[str] = None  # CCR/RCR/OCR
    address: Optional[str] = None
    total_units: Optional[int] = None
    tenure: Optional[str] = None
    indicative_psf_low: Optional[float] = None
    indicative_psf_high: Optional[float] = None
    expected_launch_date: Optional[date] = None
    expected_top_date: Optional[date] = None
    source_url: Optional[str] = None
    raw_data: Dict = field(default_factory=dict)
    error: Optional[str] = None
    scraped_at: datetime = field(default_factory=datetime.utcnow)


# Source configurations
SOURCES = {
    "edgeprop": {
        "name": "EdgeProp",
        "new_launches_url": "https://www.edgeprop.sg/new-launches",
        "priority": 1,
        "enabled": True,
    },
    "propnex": {
        "name": "PropNex",
        "new_launches_url": "https://www.propnex.com/new-launch",
        "priority": 2,
        "enabled": True,
    },
    "era": {
        "name": "ERA Singapore",
        "new_launches_url": "https://www.era.com.sg/new-launches/",
        "priority": 2,
        "enabled": True,
    },
    "propertyguru": {
        "name": "PropertyGuru",
        "new_launches_url": "https://www.propertyguru.com.sg/new-launch/",
        "priority": 2,
        "enabled": True,
    },
    "srx": {
        "name": "SRX Property",
        "new_launches_url": "https://www.srx.com.sg/new-launches",
        "priority": 3,
        "enabled": True,
    },
}


class NewLaunchScraper:
    """Scraper for upcoming new launch projects."""

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

        # Pattern: "$1,800 - $2,200" or "From $1,800 psf"
        text = text.replace(',', '').lower()

        # Range pattern
        match = re.search(r'\$?(\d+(?:\.\d+)?)\s*(?:-|to)\s*\$?(\d+(?:\.\d+)?)', text)
        if match:
            return float(match.group(1)), float(match.group(2))

        # Single value pattern
        match = re.search(r'\$?(\d+(?:\.\d+)?)\s*(?:psf|per\s*sq)', text)
        if match:
            psf = float(match.group(1))
            return psf, psf

        return None, None

    def _get_market_segment(self, district: str) -> Optional[str]:
        """Get market segment from district."""
        from constants import get_region_for_district
        if district:
            return get_region_for_district(district)
        return None

    # =========================================================================
    # INDIVIDUAL SOURCE SCRAPERS
    # =========================================================================

    def _scrape_edgeprop(self) -> List[LaunchData]:
        """Scrape EdgeProp new launches."""
        source_key = "edgeprop"
        results = []

        try:
            url = SOURCES[source_key]["new_launches_url"]
            html = self._fetch_url(url, source_key)
            if not html:
                return results

            soup = BeautifulSoup(html, 'html.parser')

            # Look for project cards
            cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|property|listing|card', re.I))

            for card in cards:
                try:
                    # Extract project name
                    name_elem = card.find(['h2', 'h3', 'h4', 'a'], class_=re.compile(r'title|name|heading', re.I))
                    if not name_elem:
                        continue

                    project_name = name_elem.get_text().strip()
                    if not project_name or len(project_name) < 3:
                        continue

                    launch = LaunchData(
                        project_name=project_name,
                        source_name=SOURCES[source_key]["name"]
                    )

                    card_text = card.get_text().lower()

                    # Extract district
                    district_match = re.search(r'd(istrict)?\s*(\d{1,2})', card_text)
                    if district_match:
                        launch.district = f"D{int(district_match.group(2)):02d}"

                    # Extract total units
                    units_match = re.search(r'(\d+)\s*units?', card_text)
                    if units_match:
                        launch.total_units = int(units_match.group(1))

                    # Extract tenure
                    if 'freehold' in card_text:
                        launch.tenure = 'Freehold'
                    elif '999' in card_text:
                        launch.tenure = '999-year'
                    elif '99' in card_text:
                        launch.tenure = '99-year'

                    # Extract developer
                    dev_match = re.search(r'developer[:\s]+([A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?)?)', card_text, re.I)
                    if dev_match:
                        launch.developer = dev_match.group(1).strip()

                    # Get link
                    link = card.find('a', href=True)
                    if link:
                        launch.source_url = urljoin(SOURCES[source_key]["new_launches_url"], link['href'])

                    # Set market segment
                    if launch.district:
                        launch.market_segment = self._get_market_segment(launch.district)

                    results.append(launch)

                except Exception as e:
                    print(f"  Error parsing EdgeProp card: {e}")
                    continue

        except Exception as e:
            print(f"  EdgeProp scrape error: {e}")

        return results

    def _scrape_propnex(self) -> List[LaunchData]:
        """Scrape PropNex new launches."""
        source_key = "propnex"
        results = []

        try:
            url = SOURCES[source_key]["new_launches_url"]
            html = self._fetch_url(url, source_key)
            if not html:
                return results

            soup = BeautifulSoup(html, 'html.parser')

            # PropNex typically lists projects in cards or grid
            cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|launch|property|card', re.I))

            for card in cards:
                try:
                    name_elem = card.find(['h2', 'h3', 'h4', 'a', 'span'], class_=re.compile(r'title|name|project', re.I))
                    if not name_elem:
                        continue

                    project_name = name_elem.get_text().strip()
                    if not project_name or len(project_name) < 3:
                        continue

                    launch = LaunchData(
                        project_name=project_name,
                        source_name=SOURCES[source_key]["name"]
                    )

                    card_text = card.get_text()

                    # Extract district
                    launch.district = self._extract_district(card_text)

                    # Extract units
                    launch.total_units = self._extract_number(
                        re.search(r'(\d+)\s*units?', card_text.lower()).group(0)
                        if re.search(r'(\d+)\s*units?', card_text.lower()) else None
                    )

                    # Extract PSF
                    launch.indicative_psf_low, launch.indicative_psf_high = self._extract_psf(card_text)

                    # Extract tenure
                    if 'freehold' in card_text.lower():
                        launch.tenure = 'Freehold'
                    elif '99-year' in card_text.lower() or '99 year' in card_text.lower():
                        launch.tenure = '99-year'

                    # Get link
                    link = card.find('a', href=True)
                    if link:
                        launch.source_url = urljoin(SOURCES[source_key]["new_launches_url"], link['href'])

                    # Set market segment
                    if launch.district:
                        launch.market_segment = self._get_market_segment(launch.district)

                    results.append(launch)

                except Exception as e:
                    continue

        except Exception as e:
            print(f"  PropNex scrape error: {e}")

        return results

    def _scrape_era(self) -> List[LaunchData]:
        """Scrape ERA new launches."""
        source_key = "era"
        results = []

        try:
            url = SOURCES[source_key]["new_launches_url"]
            html = self._fetch_url(url, source_key)
            if not html:
                return results

            soup = BeautifulSoup(html, 'html.parser')

            # ERA lists projects
            cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|property|listing', re.I))

            for card in cards:
                try:
                    name_elem = card.find(['h2', 'h3', 'h4', 'a'])
                    if not name_elem:
                        continue

                    project_name = name_elem.get_text().strip()
                    if not project_name or len(project_name) < 3:
                        continue

                    launch = LaunchData(
                        project_name=project_name,
                        source_name=SOURCES[source_key]["name"]
                    )

                    card_text = card.get_text()
                    launch.district = self._extract_district(card_text)

                    units_match = re.search(r'(\d+)\s*units?', card_text.lower())
                    if units_match:
                        launch.total_units = int(units_match.group(1))

                    launch.indicative_psf_low, launch.indicative_psf_high = self._extract_psf(card_text)

                    link = card.find('a', href=True)
                    if link:
                        launch.source_url = urljoin(SOURCES[source_key]["new_launches_url"], link['href'])

                    if launch.district:
                        launch.market_segment = self._get_market_segment(launch.district)

                    results.append(launch)

                except Exception:
                    continue

        except Exception as e:
            print(f"  ERA scrape error: {e}")

        return results

    def _scrape_propertyguru(self) -> List[LaunchData]:
        """Scrape PropertyGuru new launches."""
        source_key = "propertyguru"
        results = []

        try:
            url = SOURCES[source_key]["new_launches_url"]
            html = self._fetch_url(url, source_key)
            if not html:
                return results

            soup = BeautifulSoup(html, 'html.parser')

            cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|listing|card', re.I))

            for card in cards:
                try:
                    name_elem = card.find(['h2', 'h3', 'h4', 'a'])
                    if not name_elem:
                        continue

                    project_name = name_elem.get_text().strip()
                    if not project_name or len(project_name) < 3:
                        continue

                    launch = LaunchData(
                        project_name=project_name,
                        source_name=SOURCES[source_key]["name"]
                    )

                    card_text = card.get_text()
                    launch.district = self._extract_district(card_text)

                    units_match = re.search(r'(\d+)\s*units?', card_text.lower())
                    if units_match:
                        launch.total_units = int(units_match.group(1))

                    launch.indicative_psf_low, launch.indicative_psf_high = self._extract_psf(card_text)

                    link = card.find('a', href=True)
                    if link:
                        launch.source_url = urljoin(SOURCES[source_key]["new_launches_url"], link['href'])

                    if launch.district:
                        launch.market_segment = self._get_market_segment(launch.district)

                    results.append(launch)

                except Exception:
                    continue

        except Exception as e:
            print(f"  PropertyGuru scrape error: {e}")

        return results

    def _scrape_srx(self) -> List[LaunchData]:
        """Scrape SRX new launches."""
        source_key = "srx"
        results = []

        try:
            url = SOURCES[source_key]["new_launches_url"]
            html = self._fetch_url(url, source_key)
            if not html:
                return results

            soup = BeautifulSoup(html, 'html.parser')

            cards = soup.find_all(['div', 'article'], class_=re.compile(r'project|listing|card', re.I))

            for card in cards:
                try:
                    name_elem = card.find(['h2', 'h3', 'h4', 'a'])
                    if not name_elem:
                        continue

                    project_name = name_elem.get_text().strip()
                    if not project_name or len(project_name) < 3:
                        continue

                    launch = LaunchData(
                        project_name=project_name,
                        source_name=SOURCES[source_key]["name"]
                    )

                    card_text = card.get_text()
                    launch.district = self._extract_district(card_text)

                    units_match = re.search(r'(\d+)\s*units?', card_text.lower())
                    if units_match:
                        launch.total_units = int(units_match.group(1))

                    link = card.find('a', href=True)
                    if link:
                        launch.source_url = urljoin(SOURCES[source_key]["new_launches_url"], link['href'])

                    if launch.district:
                        launch.market_segment = self._get_market_segment(launch.district)

                    results.append(launch)

                except Exception:
                    continue

        except Exception as e:
            print(f"  SRX scrape error: {e}")

        return results

    # =========================================================================
    # CROSS-VALIDATION
    # =========================================================================

    def _cross_validate(self, all_launches: List[LaunchData]) -> List[Dict]:
        """
        Cross-validate launches from multiple sources.
        Group by project name and merge data.
        """
        # Group by normalized project name
        projects: Dict[str, List[LaunchData]] = {}

        for launch in all_launches:
            key = self._normalize_name(launch.project_name)
            if key:
                projects.setdefault(key, []).append(launch)

        # Merge and validate
        validated = []
        for normalized_name, launches in projects.items():
            # Use first project name as canonical
            project_name = launches[0].project_name
            sources = [l.source_name for l in launches]

            merged = {
                "project_name": project_name,
                "sources": sources,
                "source_count": len(launches),
                "confidence": "high" if len(launches) >= 3 else "medium" if len(launches) >= 2 else "low",
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
            sorted_launches = sorted(launches, key=lambda x: SOURCES.get(x.source_name.lower(), {}).get('priority', 99))

            for launch in sorted_launches:
                if launch.district and not merged["district"]:
                    merged["district"] = launch.district
                if launch.market_segment and not merged["market_segment"]:
                    merged["market_segment"] = launch.market_segment
                if launch.total_units and not merged["total_units"]:
                    merged["total_units"] = launch.total_units
                if launch.developer and not merged["developer"]:
                    merged["developer"] = launch.developer
                if launch.tenure and not merged["tenure"]:
                    merged["tenure"] = launch.tenure
                if launch.indicative_psf_low and not merged["indicative_psf_low"]:
                    merged["indicative_psf_low"] = launch.indicative_psf_low
                    merged["indicative_psf_high"] = launch.indicative_psf_high
                if launch.source_url:
                    merged["source_urls"].append(launch.source_url)

            validated.append(merged)

        return validated

    # =========================================================================
    # PUBLIC API
    # =========================================================================

    def scrape_all(self) -> List[Dict]:
        """
        Scrape all sources and return cross-validated results.

        Returns:
            List of validated project data dicts
        """
        print("Scraping new launches from all sources...")

        all_launches = []

        # Scrape each enabled source
        for source_key, config in SOURCES.items():
            if not config.get("enabled", True):
                continue

            print(f"  Scraping {config['name']}...")
            scraper_method = getattr(self, f"_scrape_{source_key}", None)
            if scraper_method:
                try:
                    launches = scraper_method()
                    print(f"    Found {len(launches)} projects")
                    all_launches.extend(launches)
                except Exception as e:
                    print(f"    Error: {e}")

        print(f"\nTotal scraped: {len(all_launches)} projects")

        # Cross-validate
        validated = self._cross_validate(all_launches)
        print(f"Validated: {len(validated)} unique projects")

        return validated

    def save_to_database(self, validated: List[Dict], target_year: int = 2026) -> Dict[str, Any]:
        """
        Save validated launches to database.

        Args:
            validated: List of validated project data
            target_year: Launch year to assign (default 2026)

        Returns:
            Statistics dict
        """
        stats = {"created": 0, "updated": 0, "skipped": 0, "errors": []}

        for project in validated:
            try:
                # Check if exists
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
                    # Create new
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
# PUBLIC FUNCTIONS (used by routes)
# =============================================================================

def scrape_new_launches(target_year: int = 2026, dry_run: bool = False) -> Dict[str, Any]:
    """
    Scrape new launches and optionally save to database.

    Args:
        target_year: Launch year to assign
        dry_run: If True, don't save to database

    Returns:
        Statistics dict
    """
    scraper = NewLaunchScraper()
    validated = scraper.scrape_all()

    stats = {
        "scraped": len(validated),
        "high_confidence": len([v for v in validated if v["confidence"] == "high"]),
        "medium_confidence": len([v for v in validated if v["confidence"] == "medium"]),
        "low_confidence": len([v for v in validated if v["confidence"] == "low"]),
    }

    if not dry_run:
        save_stats = scraper.save_to_database(validated, target_year)
        stats.update(save_stats)

    return stats


def validate_new_launches() -> Dict[str, Any]:
    """
    Re-validate existing new launches against fresh scrapes.
    Flags discrepancies for review.

    Returns:
        Validation statistics
    """
    scraper = NewLaunchScraper()
    fresh_data = scraper.scrape_all()

    # Create lookup by normalized name
    fresh_lookup = {}
    for project in fresh_data:
        key = scraper._normalize_name(project["project_name"])
        fresh_lookup[key] = project

    # Check existing records
    stats = {"validated": 0, "discrepancies": 0, "not_found": 0, "errors": []}
    existing = NewLaunch.query.all()

    for record in existing:
        key = scraper._normalize_name(record.project_name)
        fresh = fresh_lookup.get(key)

        if not fresh:
            stats["not_found"] += 1
            continue

        # Check for discrepancies
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
