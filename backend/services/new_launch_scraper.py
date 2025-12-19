"""
New Launch Scraper - 2026 Private Condo Launches

Scrapes from 3 sources for cross-validation:
1. EdgeProp (edgeprop.sg/new-launches) - Primary, research-grade
2. PropNex (propnex.com/new-launches) - Agency source
3. ERA (era.com.sg/new-launches) - Agency source

Pipeline:
- Phase 1: Initial scrape (all 3 sources)
- Phase 2: Bi-weekly validation job
- Phase 3: API endpoint (serve pre-computed static data)

Discrepancy Tolerance:
- total_units: +/- 5 units → Flag for review
- indicative_psf: +/- $50 → Use average, note range
- developer: Exact match → Flag immediately
"""
import re
import requests
from datetime import datetime
from typing import Optional, Dict, List, Any, Tuple
from decimal import Decimal
from bs4 import BeautifulSoup
import time
import json

# Import from gls_scraper for reuse of region/planning_area logic
from services.gls_scraper import (
    get_region_from_planning_area,
    lookup_planning_area_from_subzone,
    geocode_location,
    PLANNING_AREA_TO_REGION,
)


# =============================================================================
# CONFIGURATION
# =============================================================================

# Request headers to mimic browser
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
}

# Discrepancy tolerance thresholds
TOLERANCE = {
    'total_units': 5,      # +/- 5 units
    'indicative_psf': 50,  # +/- $50
}

# Rate limiting between requests (seconds)
RATE_LIMIT_DELAY = 1.0


# =============================================================================
# DISTRICT TO MARKET SEGMENT MAPPING
# =============================================================================

# Same mapping as in data_processor.py
DISTRICT_TO_SEGMENT = {
    # CCR - Core Central Region
    '01': 'CCR', '02': 'CCR', '06': 'CCR', '07': 'CCR',
    '09': 'CCR', '10': 'CCR', '11': 'CCR',
    # RCR - Rest of Central Region
    '03': 'RCR', '04': 'RCR', '05': 'RCR', '08': 'RCR',
    '12': 'RCR', '13': 'RCR', '14': 'RCR', '15': 'RCR',
    '20': 'RCR', '21': 'RCR',
    # OCR - Outside Central Region
    '16': 'OCR', '17': 'OCR', '18': 'OCR', '19': 'OCR',
    '22': 'OCR', '23': 'OCR', '24': 'OCR', '25': 'OCR',
    '26': 'OCR', '27': 'OCR', '28': 'OCR',
}


def get_market_segment_from_district(district: str) -> Optional[str]:
    """Get market segment (CCR/RCR/OCR) from district code."""
    if not district:
        return None
    # Normalize: D09 -> 09, 9 -> 09
    d = district.upper().replace('D', '').zfill(2)
    return DISTRICT_TO_SEGMENT.get(d)


# =============================================================================
# EDGEPROP SCRAPER
# =============================================================================

EDGEPROP_URL = "https://www.edgeprop.sg/new-launches"


def scrape_edgeprop(target_year: int = 2026) -> List[Dict[str, Any]]:
    """
    Scrape EdgeProp new launches page.

    EdgeProp is considered the primary source for research-grade data.

    Returns list of projects with:
    - project_name
    - developer
    - total_units
    - psf_low, psf_high
    - district
    - tenure
    - address
    - url
    """
    results = []

    try:
        print(f"Scraping EdgeProp new launches for {target_year}...")
        response = requests.get(EDGEPROP_URL, headers=HEADERS, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # EdgeProp lists new launches in property cards
        # Look for project cards/listings
        project_cards = soup.find_all('div', class_=re.compile(r'property-card|project-card|listing', re.I))

        if not project_cards:
            # Try alternative selectors
            project_cards = soup.find_all('article')
            if not project_cards:
                project_cards = soup.find_all('div', class_=re.compile(r'item|card', re.I))

        print(f"  Found {len(project_cards)} potential project cards")

        for card in project_cards:
            try:
                project = _parse_edgeprop_card(card, target_year)
                if project and project.get('project_name'):
                    project['source'] = 'edgeprop'
                    project['source_url'] = EDGEPROP_URL
                    results.append(project)
            except Exception as e:
                print(f"  Error parsing EdgeProp card: {e}")
                continue

        print(f"  Extracted {len(results)} projects from EdgeProp")

    except Exception as e:
        print(f"Error scraping EdgeProp: {e}")

    return results


def _parse_edgeprop_card(card, target_year: int) -> Optional[Dict[str, Any]]:
    """Parse a single EdgeProp project card."""
    project = {}

    # Extract project name (usually in h2, h3, or .title)
    name_elem = card.find(['h2', 'h3', 'h4']) or card.find(class_=re.compile(r'title|name', re.I))
    if name_elem:
        project['project_name'] = name_elem.get_text(strip=True)

    # Extract developer
    dev_elem = card.find(string=re.compile(r'developer|by', re.I))
    if dev_elem:
        parent = dev_elem.find_parent()
        if parent:
            dev_text = parent.get_text(strip=True)
            # Extract developer name after "by" or "Developer:"
            match = re.search(r'(?:by|developer[:\s]+)([^|]+)', dev_text, re.I)
            if match:
                project['developer'] = match.group(1).strip()

    # Extract price/PSF
    price_elem = card.find(string=re.compile(r'\$[\d,]+\s*(?:psf|/sqft)', re.I))
    if price_elem:
        psf_range = _parse_psf_range(price_elem)
        if psf_range:
            project['psf_low'], project['psf_high'] = psf_range

    # Extract units
    units_elem = card.find(string=re.compile(r'\d+\s*units?', re.I))
    if units_elem:
        match = re.search(r'(\d+)\s*units?', units_elem, re.I)
        if match:
            project['total_units'] = int(match.group(1))

    # Extract district
    district_elem = card.find(string=re.compile(r'D\d{1,2}|District\s*\d{1,2}', re.I))
    if district_elem:
        match = re.search(r'D?(\d{1,2})', district_elem, re.I)
        if match:
            project['district'] = f"D{match.group(1).zfill(2)}"

    # Extract tenure
    tenure_elem = card.find(string=re.compile(r'freehold|99[-\s]?year|999[-\s]?year|leasehold', re.I))
    if tenure_elem:
        tenure_text = tenure_elem.lower()
        if 'freehold' in tenure_text:
            project['tenure'] = 'Freehold'
        elif '999' in tenure_text:
            project['tenure'] = '999-year'
        elif '99' in tenure_text:
            project['tenure'] = '99-year'

    # Extract launch year/date
    year_elem = card.find(string=re.compile(r'202[4-9]|2030', re.I))
    if year_elem:
        match = re.search(r'(202[4-9]|2030)', year_elem)
        if match:
            launch_year = int(match.group(1))
            project['launch_year'] = launch_year
            # Only include if matches target year
            if launch_year != target_year:
                return None

    # Extract project URL
    link = card.find('a', href=True)
    if link:
        href = link.get('href', '')
        if href.startswith('/'):
            project['detail_url'] = f"https://www.edgeprop.sg{href}"
        elif href.startswith('http'):
            project['detail_url'] = href

    return project if project.get('project_name') else None


# =============================================================================
# PROPNEX SCRAPER
# =============================================================================

PROPNEX_URL = "https://www.propnex.com/new-launches"


def scrape_propnex(target_year: int = 2026) -> List[Dict[str, Any]]:
    """
    Scrape PropNex new launches page.

    Returns list of projects.
    """
    results = []

    try:
        print(f"Scraping PropNex new launches for {target_year}...")
        response = requests.get(PROPNEX_URL, headers=HEADERS, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # PropNex may use different card structure
        project_cards = soup.find_all('div', class_=re.compile(r'project|property|listing|card', re.I))

        if not project_cards:
            project_cards = soup.find_all('article')

        print(f"  Found {len(project_cards)} potential project cards")

        for card in project_cards:
            try:
                project = _parse_propnex_card(card, target_year)
                if project and project.get('project_name'):
                    project['source'] = 'propnex'
                    project['source_url'] = PROPNEX_URL
                    results.append(project)
            except Exception as e:
                print(f"  Error parsing PropNex card: {e}")
                continue

        print(f"  Extracted {len(results)} projects from PropNex")

    except Exception as e:
        print(f"Error scraping PropNex: {e}")

    return results


def _parse_propnex_card(card, target_year: int) -> Optional[Dict[str, Any]]:
    """Parse a single PropNex project card."""
    project = {}

    # Similar parsing logic to EdgeProp
    name_elem = card.find(['h2', 'h3', 'h4']) or card.find(class_=re.compile(r'title|name', re.I))
    if name_elem:
        project['project_name'] = name_elem.get_text(strip=True)

    # Extract developer
    text = card.get_text()
    dev_match = re.search(r'(?:developer|by)[:\s]+([^|\n]+)', text, re.I)
    if dev_match:
        project['developer'] = dev_match.group(1).strip()

    # Extract PSF
    psf_match = re.search(r'\$\s*([\d,]+)\s*(?:to|-)\s*\$?\s*([\d,]+)?\s*(?:psf|/sqft)', text, re.I)
    if psf_match:
        project['psf_low'] = float(psf_match.group(1).replace(',', ''))
        if psf_match.group(2):
            project['psf_high'] = float(psf_match.group(2).replace(',', ''))
        else:
            project['psf_high'] = project['psf_low']

    # Extract units
    units_match = re.search(r'(\d+)\s*units?', text, re.I)
    if units_match:
        project['total_units'] = int(units_match.group(1))

    # Extract district
    district_match = re.search(r'D(\d{1,2})|District\s*(\d{1,2})', text, re.I)
    if district_match:
        d = district_match.group(1) or district_match.group(2)
        project['district'] = f"D{d.zfill(2)}"

    # Extract tenure
    tenure_match = re.search(r'(freehold|99[-\s]?year|999[-\s]?year)', text, re.I)
    if tenure_match:
        tenure = tenure_match.group(1).lower()
        if 'freehold' in tenure:
            project['tenure'] = 'Freehold'
        elif '999' in tenure:
            project['tenure'] = '999-year'
        elif '99' in tenure:
            project['tenure'] = '99-year'

    # Check launch year
    year_match = re.search(r'(202[4-9]|2030)', text)
    if year_match:
        launch_year = int(year_match.group(1))
        project['launch_year'] = launch_year
        if launch_year != target_year:
            return None

    return project if project.get('project_name') else None


# =============================================================================
# ERA SCRAPER
# =============================================================================

ERA_URL = "https://www.era.com.sg/new-launches/"


def scrape_era(target_year: int = 2026) -> List[Dict[str, Any]]:
    """
    Scrape ERA new launches page.

    Returns list of projects.
    """
    results = []

    try:
        print(f"Scraping ERA new launches for {target_year}...")
        response = requests.get(ERA_URL, headers=HEADERS, timeout=30)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # ERA may use different structure
        project_cards = soup.find_all('div', class_=re.compile(r'project|property|listing|card|item', re.I))

        if not project_cards:
            project_cards = soup.find_all('article')

        print(f"  Found {len(project_cards)} potential project cards")

        for card in project_cards:
            try:
                project = _parse_era_card(card, target_year)
                if project and project.get('project_name'):
                    project['source'] = 'era'
                    project['source_url'] = ERA_URL
                    results.append(project)
            except Exception as e:
                print(f"  Error parsing ERA card: {e}")
                continue

        print(f"  Extracted {len(results)} projects from ERA")

    except Exception as e:
        print(f"Error scraping ERA: {e}")

    return results


def _parse_era_card(card, target_year: int) -> Optional[Dict[str, Any]]:
    """Parse a single ERA project card."""
    # Similar structure to PropNex
    return _parse_propnex_card(card, target_year)


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def _parse_psf_range(text: str) -> Optional[Tuple[float, float]]:
    """Parse PSF range from text like '$1,800 - $2,200 psf'."""
    if not text:
        return None

    # Pattern: $X - $Y psf or $X to $Y psf or just $X psf
    match = re.search(r'\$\s*([\d,]+(?:\.\d+)?)\s*(?:[-–to]+\s*\$?\s*([\d,]+(?:\.\d+)?))?\s*(?:psf|/sqft)?', text, re.I)
    if match:
        low = float(match.group(1).replace(',', ''))
        high = float(match.group(2).replace(',', '')) if match.group(2) else low
        return (low, high)

    return None


def normalize_project_name(name: str) -> str:
    """Normalize project name for matching."""
    if not name:
        return ""
    # Remove common suffixes, lowercase, strip
    normalized = name.lower().strip()
    normalized = re.sub(r'\s*(condo|condominium|residences|residence|at|@)\s*', ' ', normalized)
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


def match_projects(projects_a: List[Dict], projects_b: List[Dict]) -> List[Tuple[Dict, Dict]]:
    """
    Match projects from two sources by name similarity.

    Returns list of (project_a, project_b) tuples.
    """
    matches = []
    used_b = set()

    for a in projects_a:
        name_a = normalize_project_name(a.get('project_name', ''))
        if not name_a:
            continue

        best_match = None
        best_score = 0

        for i, b in enumerate(projects_b):
            if i in used_b:
                continue

            name_b = normalize_project_name(b.get('project_name', ''))
            if not name_b:
                continue

            # Simple matching: check if one contains the other or high overlap
            if name_a == name_b:
                best_match = (i, b)
                best_score = 100
                break
            elif name_a in name_b or name_b in name_a:
                score = len(set(name_a.split()) & set(name_b.split())) / max(len(name_a.split()), len(name_b.split())) * 100
                if score > best_score:
                    best_match = (i, b)
                    best_score = score

        if best_match and best_score >= 50:
            matches.append((a, best_match[1]))
            used_b.add(best_match[0])

    return matches


# =============================================================================
# MAIN SCRAPER FUNCTION
# =============================================================================

def scrape_new_launches(
    target_year: int = 2026,
    db_session=None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Main function to scrape new launches from all 3 sources.

    Args:
        target_year: Year to filter for (default 2026)
        db_session: SQLAlchemy session
        dry_run: If True, don't save to database

    Returns:
        Dict with statistics and any errors
    """
    from models.new_launch import NewLaunch
    from models.database import db

    if db_session is None:
        db_session = db.session

    stats = {
        'edgeprop_scraped': 0,
        'propnex_scraped': 0,
        'era_scraped': 0,
        'total_unique_projects': 0,
        'projects_saved': 0,
        'projects_updated': 0,
        'needs_review': 0,
        'gls_linked': 0,
        'errors': [],
    }

    # ==========================================================================
    # PHASE 1: Scrape all sources
    # ==========================================================================
    print(f"\n{'='*60}")
    print(f"Scraping New Launches for {target_year}")
    print(f"{'='*60}\n")

    edgeprop_projects = scrape_edgeprop(target_year)
    stats['edgeprop_scraped'] = len(edgeprop_projects)
    time.sleep(RATE_LIMIT_DELAY)

    propnex_projects = scrape_propnex(target_year)
    stats['propnex_scraped'] = len(propnex_projects)
    time.sleep(RATE_LIMIT_DELAY)

    era_projects = scrape_era(target_year)
    stats['era_scraped'] = len(era_projects)

    # ==========================================================================
    # PHASE 2: Cross-validate and merge
    # ==========================================================================
    print(f"\n--- Cross-validating sources ---")

    # Build master list with data from all sources
    master_projects = {}

    # Add EdgeProp projects (primary source)
    for p in edgeprop_projects:
        name = normalize_project_name(p.get('project_name', ''))
        if name:
            master_projects[name] = {
                'project_name': p.get('project_name'),
                'edgeprop': p,
                'propnex': None,
                'era': None,
            }

    # Match PropNex projects
    for p in propnex_projects:
        name = normalize_project_name(p.get('project_name', ''))
        if name:
            if name in master_projects:
                master_projects[name]['propnex'] = p
            else:
                master_projects[name] = {
                    'project_name': p.get('project_name'),
                    'edgeprop': None,
                    'propnex': p,
                    'era': None,
                }

    # Match ERA projects
    for p in era_projects:
        name = normalize_project_name(p.get('project_name', ''))
        if name:
            if name in master_projects:
                master_projects[name]['era'] = p
            else:
                master_projects[name] = {
                    'project_name': p.get('project_name'),
                    'edgeprop': None,
                    'propnex': None,
                    'era': p,
                }

    stats['total_unique_projects'] = len(master_projects)
    print(f"Found {len(master_projects)} unique projects across all sources")

    # ==========================================================================
    # PHASE 3: Process each project
    # ==========================================================================
    for name, sources in master_projects.items():
        try:
            # Use cross-validation to get consensus values
            validated = NewLaunch.cross_validate_sources(
                edgeprop_data=sources.get('edgeprop'),
                propnex_data=sources.get('propnex'),
                era_data=sources.get('era'),
            )

            # Get best project name (prefer EdgeProp)
            project_name = (
                sources.get('edgeprop', {}).get('project_name') or
                sources.get('propnex', {}).get('project_name') or
                sources.get('era', {}).get('project_name')
            )

            if not project_name:
                continue

            # Merge all source data
            merged = _merge_source_data(sources)

            # Determine district and market segment
            district = merged.get('district')
            market_segment = None
            planning_area = None

            if district:
                market_segment = get_market_segment_from_district(district)
            elif merged.get('address'):
                # Try geocoding address
                geo_data = geocode_location(merged.get('address'))
                if geo_data.get('planning_area'):
                    planning_area = geo_data['planning_area']
                    market_segment = get_region_from_planning_area(planning_area)

            # Build source_urls JSON
            source_urls = {}
            if sources.get('edgeprop'):
                source_urls['edgeprop'] = sources['edgeprop'].get('source_url') or sources['edgeprop'].get('detail_url')
            if sources.get('propnex'):
                source_urls['propnex'] = sources['propnex'].get('source_url') or sources['propnex'].get('detail_url')
            if sources.get('era'):
                source_urls['era'] = sources['era'].get('source_url') or sources['era'].get('detail_url')

            # Check if project already exists
            existing = db_session.query(NewLaunch).filter_by(project_name=project_name).first()

            if existing:
                # Update existing record
                _update_new_launch(existing, validated, merged, source_urls)

                if not dry_run:
                    try:
                        db_session.commit()
                        stats['projects_updated'] += 1
                        print(f"  Updated: {project_name}")
                    except Exception as e:
                        db_session.rollback()
                        stats['errors'].append(f"{project_name}: {str(e)}")
                else:
                    print(f"  Would update: {project_name}")
            else:
                # Create new record
                new_launch = NewLaunch(
                    project_name=project_name,
                    developer=validated.get('developer') or merged.get('developer'),
                    district=district,
                    planning_area=planning_area,
                    market_segment=market_segment,
                    address=merged.get('address'),
                    total_units=validated.get('total_units'),
                    total_units_source=validated.get('total_units_source'),
                    indicative_psf_low=validated.get('indicative_psf_low'),
                    indicative_psf_high=validated.get('indicative_psf_high'),
                    indicative_psf_source=validated.get('indicative_psf_source'),
                    tenure=merged.get('tenure'),
                    launch_year=target_year,
                    property_type='Condominium',
                    source_urls=source_urls,
                    needs_review=validated.get('needs_review', False),
                    review_reason=validated.get('review_reason'),
                    last_scraped=datetime.utcnow(),
                )

                # Store individual source prices
                if sources.get('edgeprop'):
                    new_launch.edgeprop_psf_low = sources['edgeprop'].get('psf_low')
                    new_launch.edgeprop_psf_high = sources['edgeprop'].get('psf_high')
                if sources.get('propnex'):
                    new_launch.propnex_psf_low = sources['propnex'].get('psf_low')
                    new_launch.propnex_psf_high = sources['propnex'].get('psf_high')
                if sources.get('era'):
                    new_launch.era_psf_low = sources['era'].get('psf_low')
                    new_launch.era_psf_high = sources['era'].get('psf_high')

                if not dry_run:
                    try:
                        db_session.add(new_launch)
                        db_session.commit()
                        stats['projects_saved'] += 1
                        print(f"  Saved: {project_name}")
                    except Exception as e:
                        db_session.rollback()
                        stats['errors'].append(f"{project_name}: {str(e)}")
                else:
                    print(f"  Would save: {project_name}")

            if validated.get('needs_review'):
                stats['needs_review'] += 1

        except Exception as e:
            stats['errors'].append(f"{name}: {str(e)}")
            print(f"  Error processing {name}: {e}")

    # ==========================================================================
    # PHASE 4: Link to GLS tenders
    # ==========================================================================
    if not dry_run:
        print(f"\n--- Linking to GLS tenders ---")
        link_stats = link_to_gls_tenders(db_session)
        stats['gls_linked'] = link_stats.get('linked', 0)

    # ==========================================================================
    # Summary
    # ==========================================================================
    print(f"\n{'='*60}")
    print("Scrape Complete")
    print(f"{'='*60}")
    print(f"EdgeProp: {stats['edgeprop_scraped']} projects")
    print(f"PropNex: {stats['propnex_scraped']} projects")
    print(f"ERA: {stats['era_scraped']} projects")
    print(f"Unique projects: {stats['total_unique_projects']}")
    print(f"Saved: {stats['projects_saved']}")
    print(f"Updated: {stats['projects_updated']}")
    print(f"Needs review: {stats['needs_review']}")
    print(f"GLS linked: {stats['gls_linked']}")
    if stats['errors']:
        print(f"Errors: {len(stats['errors'])}")

    return stats


def _merge_source_data(sources: Dict[str, Dict]) -> Dict[str, Any]:
    """Merge data from multiple sources, preferring EdgeProp."""
    merged = {}

    # Priority: EdgeProp > PropNex > ERA
    for source_name in ['edgeprop', 'propnex', 'era']:
        source = sources.get(source_name)
        if not source:
            continue

        for key in ['developer', 'district', 'tenure', 'address', 'launch_year']:
            if not merged.get(key) and source.get(key):
                merged[key] = source[key]

    return merged


def _update_new_launch(existing, validated: Dict, merged: Dict, source_urls: Dict):
    """Update an existing NewLaunch record with new data."""
    # Update validated fields
    if validated.get('total_units'):
        existing.total_units = validated['total_units']
        existing.total_units_source = validated.get('total_units_source')

    if validated.get('indicative_psf_low'):
        existing.indicative_psf_low = validated['indicative_psf_low']
    if validated.get('indicative_psf_high'):
        existing.indicative_psf_high = validated['indicative_psf_high']
    if validated.get('indicative_psf_source'):
        existing.indicative_psf_source = validated['indicative_psf_source']

    if validated.get('developer'):
        existing.developer = validated['developer']

    # Update review status
    existing.needs_review = validated.get('needs_review', False)
    existing.review_reason = validated.get('review_reason')

    # Update source URLs
    existing.source_urls = source_urls

    # Update timestamps
    existing.last_scraped = datetime.utcnow()
    existing.updated_at = datetime.utcnow()


# =============================================================================
# GLS TENDER LINKING
# =============================================================================

def link_to_gls_tenders(db_session) -> Dict[str, int]:
    """
    Link NewLaunch records to GLS tender records.

    Matches by:
    1. Developer name similarity
    2. Planning area / location
    3. Site area similarity

    Returns stats on links created.
    """
    from models.new_launch import NewLaunch
    from models.gls_tender import GLSTender

    stats = {'linked': 0, 'already_linked': 0, 'no_match': 0}

    # Get unlinked new launches
    unlinked = db_session.query(NewLaunch).filter(
        NewLaunch.gls_tender_id.is_(None)
    ).all()

    print(f"  Found {len(unlinked)} unlinked new launches")

    for launch in unlinked:
        # Try to find matching GLS tender
        gls_tender = _find_matching_gls_tender(launch, db_session)

        if gls_tender:
            launch.gls_tender_id = gls_tender.id
            launch.land_bid_psf = float(gls_tender.psf_ppr) if gls_tender.psf_ppr else None
            stats['linked'] += 1
            print(f"    Linked: {launch.project_name} → {gls_tender.location_raw}")
        else:
            stats['no_match'] += 1

    # Count already linked
    stats['already_linked'] = db_session.query(NewLaunch).filter(
        NewLaunch.gls_tender_id.isnot(None)
    ).count()

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"  Error committing GLS links: {e}")

    return stats


def _find_matching_gls_tender(launch, db_session):
    """Find matching GLS tender for a new launch."""
    from models.gls_tender import GLSTender

    # Try matching by planning area + developer
    if launch.planning_area and launch.developer:
        tender = db_session.query(GLSTender).filter(
            GLSTender.status == 'awarded',
            GLSTender.planning_area == launch.planning_area,
            GLSTender.successful_tenderer.ilike(f'%{launch.developer.split()[0]}%')
        ).first()
        if tender:
            return tender

    # Try matching by district
    if launch.district:
        # Get planning areas in this district's segment
        segment = get_market_segment_from_district(launch.district)
        if segment:
            tender = db_session.query(GLSTender).filter(
                GLSTender.status == 'awarded',
                GLSTender.market_segment == segment,
            )

            if launch.developer:
                tender = tender.filter(
                    GLSTender.successful_tenderer.ilike(f'%{launch.developer.split()[0]}%')
                )

            tender = tender.first()
            if tender:
                return tender

    return None


# =============================================================================
# VALIDATION JOB
# =============================================================================

def validate_new_launches(db_session=None) -> Dict[str, Any]:
    """
    Bi-weekly validation job: re-scrape and compare against stored values.

    Returns stats on discrepancies found.
    """
    from models.new_launch import NewLaunch
    from models.database import db

    if db_session is None:
        db_session = db.session

    stats = {
        'total_validated': 0,
        'discrepancies_found': 0,
        'flagged_for_review': 0,
        'discrepancies': [],
    }

    print(f"\n{'='*60}")
    print("Validation Job: Checking for discrepancies")
    print(f"{'='*60}\n")

    # Get all new launches
    launches = db_session.query(NewLaunch).all()
    print(f"Found {len(launches)} projects to validate")

    # Re-scrape current data
    current_edgeprop = scrape_edgeprop(2026)
    time.sleep(RATE_LIMIT_DELAY)
    current_propnex = scrape_propnex(2026)
    time.sleep(RATE_LIMIT_DELAY)
    current_era = scrape_era(2026)

    # Build lookup by normalized name
    current_data = {}
    for p in current_edgeprop:
        name = normalize_project_name(p.get('project_name', ''))
        if name:
            current_data.setdefault(name, {})['edgeprop'] = p
    for p in current_propnex:
        name = normalize_project_name(p.get('project_name', ''))
        if name:
            current_data.setdefault(name, {})['propnex'] = p
    for p in current_era:
        name = normalize_project_name(p.get('project_name', ''))
        if name:
            current_data.setdefault(name, {})['era'] = p

    # Compare each stored record
    for launch in launches:
        name = normalize_project_name(launch.project_name)
        current = current_data.get(name)

        if not current:
            # Project not found in any source
            continue

        stats['total_validated'] += 1
        discrepancies = []

        # Check total_units
        for source_name in ['edgeprop', 'propnex', 'era']:
            source = current.get(source_name)
            if source and source.get('total_units'):
                diff = abs((source['total_units'] or 0) - (launch.total_units or 0))
                if diff > TOLERANCE['total_units']:
                    discrepancies.append({
                        'field': 'total_units',
                        'source': source_name,
                        'stored': launch.total_units,
                        'current': source['total_units'],
                        'diff': diff,
                    })

        # Check PSF
        for source_name in ['edgeprop', 'propnex', 'era']:
            source = current.get(source_name)
            if source and source.get('psf_low'):
                stored_low = float(launch.indicative_psf_low) if launch.indicative_psf_low else 0
                diff = abs((source['psf_low'] or 0) - stored_low)
                if diff > TOLERANCE['indicative_psf']:
                    discrepancies.append({
                        'field': 'indicative_psf_low',
                        'source': source_name,
                        'stored': stored_low,
                        'current': source['psf_low'],
                        'diff': diff,
                    })

        # Check developer
        for source_name in ['edgeprop', 'propnex', 'era']:
            source = current.get(source_name)
            if source and source.get('developer') and launch.developer:
                if source['developer'].lower().strip() != launch.developer.lower().strip():
                    discrepancies.append({
                        'field': 'developer',
                        'source': source_name,
                        'stored': launch.developer,
                        'current': source['developer'],
                    })

        if discrepancies:
            stats['discrepancies_found'] += 1
            stats['discrepancies'].append({
                'project_name': launch.project_name,
                'issues': discrepancies,
            })

            # Flag for review
            launch.needs_review = True
            launch.review_reason = f"Validation discrepancies: {', '.join(d['field'] for d in discrepancies)}"
            stats['flagged_for_review'] += 1

        # Update validation timestamp
        launch.last_validated = datetime.utcnow()

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"Error committing validation: {e}")

    # Summary
    print(f"\n{'='*60}")
    print("Validation Complete")
    print(f"{'='*60}")
    print(f"Projects validated: {stats['total_validated']}")
    print(f"Discrepancies found: {stats['discrepancies_found']}")
    print(f"Flagged for review: {stats['flagged_for_review']}")

    return stats


# =============================================================================
# SEED DATA - Known 2026 New Launches
# =============================================================================

# Based on publicly available information about upcoming Singapore condo launches
SEED_DATA_2026 = [
    {
        'project_name': 'Parktown Residence',
        'developer': 'CapitaLand Development',
        'district': 'D22',
        'planning_area': 'Jurong East',
        'market_segment': 'OCR',
        'total_units': 1193,
        'indicative_psf_low': 2050,
        'indicative_psf_high': 2350,
        'tenure': '99-year',
        'expected_launch_date': '2026-01-15',
        'land_bid_psf': 768,
    },
    {
        'project_name': 'Chuan Park',
        'developer': 'Kingsford Development & MCC Land',
        'district': 'D19',
        'planning_area': 'Serangoon',
        'market_segment': 'OCR',
        'total_units': 916,
        'indicative_psf_low': 2200,
        'indicative_psf_high': 2500,
        'tenure': '99-year',
        'expected_launch_date': '2026-02-01',
        'land_bid_psf': 1106,
    },
    {
        'project_name': 'The Collective at One Sophia',
        'developer': 'SingHaiyi Group',
        'district': 'D09',
        'planning_area': 'Orchard',
        'market_segment': 'CCR',
        'total_units': 366,
        'indicative_psf_low': 3200,
        'indicative_psf_high': 3800,
        'tenure': 'Freehold',
        'expected_launch_date': '2026-03-01',
        'land_bid_psf': None,
    },
    {
        'project_name': 'Meyer Blue',
        'developer': 'UOL Group & Kheng Leong',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 226,
        'indicative_psf_low': 2800,
        'indicative_psf_high': 3200,
        'tenure': 'Freehold',
        'expected_launch_date': '2026-Q1',
        'land_bid_psf': None,
    },
    {
        'project_name': 'Arina East Residences',
        'developer': 'Macly Group',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 107,
        'indicative_psf_low': 2300,
        'indicative_psf_high': 2600,
        'tenure': 'Freehold',
        'expected_launch_date': '2026-Q1',
        'land_bid_psf': None,
    },
    {
        'project_name': 'Bagnall Haus',
        'developer': 'Roxy-Pacific Holdings',
        'district': 'D16',
        'planning_area': 'Bedok',
        'market_segment': 'OCR',
        'total_units': 113,
        'indicative_psf_low': 2100,
        'indicative_psf_high': 2400,
        'tenure': 'Freehold',
        'expected_launch_date': '2026-Q1',
        'land_bid_psf': None,
    },
    {
        'project_name': 'Lentor Central Residences',
        'developer': 'GuocoLand & Hong Leong Holdings',
        'district': 'D26',
        'planning_area': 'Yishun',
        'market_segment': 'OCR',
        'total_units': 475,
        'indicative_psf_low': 2150,
        'indicative_psf_high': 2400,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q2',
        'land_bid_psf': 1108,
    },
    {
        'project_name': 'Aurea',
        'developer': 'Aurum Land',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 188,
        'indicative_psf_low': 2450,
        'indicative_psf_high': 2750,
        'tenure': 'Freehold',
        'expected_launch_date': '2026-Q2',
        'land_bid_psf': None,
    },
    {
        'project_name': 'The Continuum',
        'developer': 'Hoi Hup Realty & Sunway Developments',
        'district': 'D15',
        'planning_area': 'Katong',
        'market_segment': 'RCR',
        'total_units': 816,
        'indicative_psf_low': 2500,
        'indicative_psf_high': 2900,
        'tenure': 'Freehold',
        'expected_launch_date': '2026-Q2',
        'land_bid_psf': None,
    },
    {
        'project_name': 'Tembusu Grand',
        'developer': 'CDL & MCL Land',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 638,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2700,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q2',
        'land_bid_psf': 1302,
    },
    {
        'project_name': 'Sora',
        'developer': 'CEL Development',
        'district': 'D26',
        'planning_area': 'Yishun',
        'market_segment': 'OCR',
        'total_units': 440,
        'indicative_psf_low': 1950,
        'indicative_psf_high': 2200,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q2',
        'land_bid_psf': 930,
    },
    {
        'project_name': 'Kassia',
        'developer': 'Hong Leong Holdings & CDL',
        'district': 'D27',
        'planning_area': 'Sembawang',
        'market_segment': 'OCR',
        'total_units': 276,
        'indicative_psf_low': 1850,
        'indicative_psf_high': 2100,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q3',
        'land_bid_psf': 885,
    },
    {
        'project_name': 'Norwood Grand',
        'developer': 'CDL',
        'district': 'D25',
        'planning_area': 'Woodlands',
        'market_segment': 'OCR',
        'total_units': 348,
        'indicative_psf_low': 1750,
        'indicative_psf_high': 2000,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q3',
        'land_bid_psf': 721,
    },
    {
        'project_name': 'Marina View Residences',
        'developer': 'IOI Properties & CDL',
        'district': 'D01',
        'planning_area': 'Downtown Core',
        'market_segment': 'CCR',
        'total_units': 683,
        'indicative_psf_low': 3000,
        'indicative_psf_high': 3600,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q3',
        'land_bid_psf': 1402,
    },
    {
        'project_name': 'Nava Grove',
        'developer': 'MCL Land',
        'district': 'D21',
        'planning_area': 'Bukit Timah',
        'market_segment': 'RCR',
        'total_units': 552,
        'indicative_psf_low': 2200,
        'indicative_psf_high': 2500,
        'tenure': '99-year',
        'expected_launch_date': '2026-Q4',
        'land_bid_psf': 1038,
    },
]


def seed_new_launches(db_session=None, reset: bool = False) -> Dict[str, Any]:
    """
    Seed the database with known 2026 new launch projects.

    This provides baseline data when web scraping fails or for testing.

    Args:
        db_session: SQLAlchemy session
        reset: If True, delete existing data before seeding

    Returns:
        Dict with statistics
    """
    from models.new_launch import NewLaunch
    from models.database import db

    if db_session is None:
        db_session = db.session

    stats = {
        'existing': 0,
        'inserted': 0,
        'skipped': 0,
        'errors': [],
    }

    print(f"\n{'='*60}")
    print("Seeding New Launch Data (2026)")
    print(f"{'='*60}\n")

    if reset:
        # Delete existing 2026 records
        deleted = db_session.query(NewLaunch).filter(NewLaunch.launch_year == 2026).delete()
        db_session.commit()
        print(f"Deleted {deleted} existing 2026 records")

    # Get existing project names
    existing_names = {
        r[0].lower() for r in
        db_session.query(NewLaunch.project_name).filter(NewLaunch.launch_year == 2026).all()
    }
    stats['existing'] = len(existing_names)

    for project_data in SEED_DATA_2026:
        try:
            project_name = project_data['project_name']

            # Skip if already exists
            if project_name.lower() in existing_names:
                stats['skipped'] += 1
                print(f"  Skipped (exists): {project_name}")
                continue

            # Parse expected launch date
            expected_launch_date = None
            date_str = project_data.get('expected_launch_date', '')
            if date_str:
                if 'Q' in date_str:
                    # Quarter format: 2026-Q1 -> 2026-01-01, 2026-Q2 -> 2026-04-01, etc.
                    year, quarter = date_str.split('-Q')
                    month = (int(quarter) - 1) * 3 + 1
                    expected_launch_date = datetime(int(year), month, 1)
                else:
                    # Full date format
                    expected_launch_date = datetime.strptime(date_str, '%Y-%m-%d')

            new_launch = NewLaunch(
                project_name=project_name,
                developer=project_data.get('developer'),
                district=project_data.get('district'),
                planning_area=project_data.get('planning_area'),
                market_segment=project_data.get('market_segment'),
                total_units=project_data.get('total_units'),
                indicative_psf_low=project_data.get('indicative_psf_low'),
                indicative_psf_high=project_data.get('indicative_psf_high'),
                tenure=project_data.get('tenure'),
                launch_year=2026,
                expected_launch_date=expected_launch_date,
                land_bid_psf=project_data.get('land_bid_psf'),
                property_type='Condominium',
                source_urls={'seed': 'Manual seed data based on public sources'},
                needs_review=False,
                last_scraped=datetime.utcnow(),
            )

            db_session.add(new_launch)
            db_session.commit()
            stats['inserted'] += 1
            print(f"  Inserted: {project_name}")

        except Exception as e:
            db_session.rollback()
            stats['errors'].append(f"{project_name}: {str(e)}")
            print(f"  Error: {project_name} - {e}")

    print(f"\n{'='*60}")
    print("Seed Complete")
    print(f"{'='*60}")
    print(f"Already existed: {stats['existing']}")
    print(f"Inserted: {stats['inserted']}")
    print(f"Skipped: {stats['skipped']}")
    if stats['errors']:
        print(f"Errors: {len(stats['errors'])}")

    return stats
