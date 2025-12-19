"""
New Launch Scraper - 2026 Private Condo Launches

Scrapes from multiple sources for cross-validation:
1. EdgeProp (edgeprop.sg/new-launches) - Research-grade data
2. PropNex (propnex.com/new-launches) - Agency source
3. ERA (era.com.sg/new-launches) - Agency source

These sites use JavaScript rendering, so we use Playwright for browser automation.

Pipeline:
- Phase 1: Initial scrape with Playwright (JS rendering)
- Phase 2: Cross-validation between sources
- Phase 3: Store in database with review flags

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
import os

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
RATE_LIMIT_DELAY = 2.0

# Retry settings
MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 2  # Exponential backoff: 2s, 4s, 8s

# Cache settings
CACHE_DIR = "/tmp/scraper_cache"
CACHE_TTL_HOURS = 6  # Cache HTML for 6 hours

# Last-seen tracking
LAST_SEEN_FILE = "/tmp/scraper_cache/last_seen.json"


def _load_last_seen() -> Dict[str, Any]:
    """Load last-seen project data for change detection."""
    try:
        if os.path.exists(LAST_SEEN_FILE):
            with open(LAST_SEEN_FILE, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def _save_last_seen(data: Dict[str, Any]):
    """Save last-seen project data."""
    try:
        os.makedirs(os.path.dirname(LAST_SEEN_FILE), exist_ok=True)
        with open(LAST_SEEN_FILE, 'w') as f:
            json.dump(data, f, indent=2, default=str)
    except Exception:
        pass


def _detect_changes(current_projects: List[Dict], last_seen: Dict) -> Dict[str, List]:
    """Detect new, changed, and removed projects since last run."""
    changes = {'new': [], 'changed': [], 'removed': []}

    current_names = set()
    for proj in current_projects:
        name = normalize_project_name(proj.get('project_name', ''))
        current_names.add(name)

        if name not in last_seen:
            changes['new'].append(proj.get('project_name'))
        else:
            # Check for significant changes
            old = last_seen[name]
            if proj.get('total_units') and old.get('total_units'):
                if abs(proj['total_units'] - old['total_units']) > TOLERANCE['total_units']:
                    changes['changed'].append(proj.get('project_name'))

    # Check for removed projects
    for name in last_seen:
        if name not in current_names:
            changes['removed'].append(last_seen[name].get('project_name', name))

    return changes


def _request_with_retry(url: str, max_retries: int = MAX_RETRIES) -> Optional[requests.Response]:
    """Make HTTP request with exponential backoff retry."""
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=HEADERS, timeout=30)

            # Success
            if response.status_code == 200:
                return response

            # Rate limited - back off
            if response.status_code in (429, 503):
                wait_time = RETRY_BACKOFF_BASE ** (attempt + 1)
                print(f"  Rate limited (HTTP {response.status_code}), waiting {wait_time}s...")
                time.sleep(wait_time)
                continue

            # Other error - don't retry
            print(f"  HTTP error: {response.status_code}")
            return None

        except requests.exceptions.Timeout:
            wait_time = RETRY_BACKOFF_BASE ** (attempt + 1)
            print(f"  Timeout, retrying in {wait_time}s... (attempt {attempt + 1}/{max_retries})")
            time.sleep(wait_time)

        except requests.exceptions.RequestException as e:
            print(f"  Request error: {e}")
            if attempt < max_retries - 1:
                wait_time = RETRY_BACKOFF_BASE ** (attempt + 1)
                print(f"  Retrying in {wait_time}s...")
                time.sleep(wait_time)

    return None


def _get_cached_html(url: str) -> Optional[str]:
    """Get cached HTML if fresh enough."""
    import hashlib
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        cache_key = hashlib.md5(url.encode()).hexdigest()
        cache_file = f"{CACHE_DIR}/{cache_key}.html"

        if os.path.exists(cache_file):
            age_hours = (time.time() - os.path.getmtime(cache_file)) / 3600
            if age_hours < CACHE_TTL_HOURS:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    print(f"  Using cached HTML ({age_hours:.1f}h old)")
                    return f.read()
    except Exception:
        pass
    return None


def _save_to_cache(url: str, html: str):
    """Save HTML to cache."""
    import hashlib
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        cache_key = hashlib.md5(url.encode()).hexdigest()
        cache_file = f"{CACHE_DIR}/{cache_key}.html"
        with open(cache_file, 'w', encoding='utf-8') as f:
            f.write(html)
    except Exception:
        pass

# Playwright availability flag
PLAYWRIGHT_AVAILABLE = False
try:
    from playwright.sync_api import sync_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    print("Note: Playwright not installed. Install with: pip install playwright && playwright install chromium")


# =============================================================================
# DISTRICT TO MARKET SEGMENT MAPPING
# =============================================================================

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
    d = district.upper().replace('D', '').zfill(2)
    return DISTRICT_TO_SEGMENT.get(d)


# =============================================================================
# PLAYWRIGHT-BASED SCRAPER (for JS-rendered sites)
# =============================================================================

def fetch_with_playwright(url: str, wait_selector: str = None, wait_time: int = 3000) -> Optional[str]:
    """
    Fetch a URL using Playwright to render JavaScript content.

    Args:
        url: The URL to fetch
        wait_selector: CSS selector to wait for before extracting HTML
        wait_time: Additional time to wait in ms after page load

    Returns:
        Rendered HTML content or None if failed
    """
    if not PLAYWRIGHT_AVAILABLE:
        print(f"  Playwright not available, cannot render JS for {url}")
        return None

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=HEADERS['User-Agent'],
                viewport={'width': 1920, 'height': 1080}
            )
            page = context.new_page()

            print(f"  Loading page with Playwright: {url}")
            page.goto(url, wait_until='networkidle', timeout=30000)

            # Wait for specific element if provided
            if wait_selector:
                try:
                    page.wait_for_selector(wait_selector, timeout=10000)
                except:
                    print(f"  Warning: Selector '{wait_selector}' not found, continuing...")

            # Additional wait for dynamic content
            page.wait_for_timeout(wait_time)

            # Get the rendered HTML
            html = page.content()

            browser.close()

            print(f"  Fetched {len(html)} bytes of rendered HTML")
            return html

    except Exception as e:
        print(f"  Playwright error for {url}: {e}")
        return None


def fetch_page(url: str, use_playwright: bool = True, wait_selector: str = None, use_cache: bool = True) -> Optional[str]:
    """
    Fetch a page, using Playwright for JS rendering if available.
    Falls back to requests if Playwright fails or is unavailable.

    Args:
        url: URL to fetch
        use_playwright: Whether to use Playwright for JS rendering
        wait_selector: CSS selector to wait for (Playwright only)
        use_cache: Whether to use cached HTML if available
    """
    # Check cache first
    if use_cache:
        cached = _get_cached_html(url)
        if cached:
            return cached

    html = None

    # Try Playwright first for JS-rendered content
    if use_playwright and PLAYWRIGHT_AVAILABLE:
        html = fetch_with_playwright(url, wait_selector)

    # Fallback to requests with retry
    if not html:
        print(f"  Fetching with requests: {url}")
        response = _request_with_retry(url)
        if response:
            print(f"  Status: {response.status_code}, Length: {len(response.text)}")
            html = response.text

    # Save to cache if successful
    if html and use_cache:
        _save_to_cache(url, html)

    return html


# =============================================================================
# EDGEPROP SCRAPER
# =============================================================================

# Use the listing page, NOT the marketing page
# Marketing page: https://www.edgeprop.sg/new-launches (less data)
# Listing page: https://www.edgeprop.sg/new-launches/all-new-property-launches (full listings, server-rendered)
EDGEPROP_URL = "https://www.edgeprop.sg/new-launches/all-new-property-launches"


def scrape_edgeprop(target_year: int = 2026) -> List[Dict[str, Any]]:
    """
    Scrape EdgeProp new launches listing page.

    EdgeProp's listing page contains server-rendered HTML with project cards.
    No Playwright needed - direct HTML fetch should work.
    """
    results = []

    print(f"\nScraping EdgeProp new launches for {target_year}...")

    # EdgeProp listing page is server-rendered, try direct HTML first (faster)
    html = fetch_page(
        EDGEPROP_URL,
        use_playwright=False,  # Try without Playwright first
        wait_selector=None
    )

    # If direct fetch failed or got minimal HTML, try with Playwright
    if not html or len(html) < 10000:
        print("  Direct fetch insufficient, trying Playwright...")
        html = fetch_page(
            EDGEPROP_URL,
            use_playwright=True,
            wait_selector='.project-card, .property-card, article'
        )

    if not html:
        print("  Failed to fetch EdgeProp page")
        return results

    # Debug: Save HTML for inspection
    _debug_save_html(html, "edgeprop")

    soup = BeautifulSoup(html, 'html.parser')

    # Try multiple selectors (sites change structure)
    selectors = [
        'div[class*="property-card"]',
        'div[class*="project-card"]',
        'div[class*="listing"]',
        'article[class*="property"]',
        'div[class*="new-launch"]',
        '.card',
    ]

    project_cards = []
    for selector in selectors:
        cards = soup.select(selector)
        if cards:
            print(f"  Found {len(cards)} cards with selector: {selector}")
            project_cards = cards
            break

    if not project_cards:
        # Try finding any reasonable container
        project_cards = soup.find_all('div', class_=re.compile(r'card|listing|property|project', re.I))
        print(f"  Fallback: Found {len(project_cards)} potential cards")

    for card in project_cards:
        try:
            project = _parse_property_card(card, target_year, 'edgeprop')
            if project and project.get('project_name'):
                project['source'] = 'edgeprop'
                project['source_url'] = EDGEPROP_URL
                results.append(project)
        except Exception as e:
            print(f"  Error parsing card: {e}")
            continue

    print(f"  Extracted {len(results)} projects from EdgeProp")
    return results


def _try_edgeprop_api(target_year: int) -> Optional[List[Dict[str, Any]]]:
    """Try to fetch data from EdgeProp's JSON API if it exists."""
    try:
        # Common API patterns to try
        api_urls = [
            f"https://www.edgeprop.sg/api/new-launches?year={target_year}",
            "https://www.edgeprop.sg/api/v1/projects?type=new-launch",
            "https://www.edgeprop.sg/api/properties?category=new-launch",
        ]

        for api_url in api_urls:
            try:
                response = requests.get(api_url, headers=HEADERS, timeout=10)
                if response.status_code == 200:
                    data = response.json()
                    if data and isinstance(data, (list, dict)):
                        print(f"  Found API endpoint: {api_url}")
                        return _parse_api_response(data, target_year)
            except:
                continue

    except Exception as e:
        pass  # API not available, fall back to HTML scraping

    return None


def _parse_api_response(data: Any, target_year: int) -> List[Dict[str, Any]]:
    """Parse JSON API response into project list."""
    results = []

    # Handle different API response structures
    items = data if isinstance(data, list) else data.get('data', data.get('projects', data.get('results', [])))

    for item in items:
        if not isinstance(item, dict):
            continue

        project = {
            'project_name': item.get('name') or item.get('project_name') or item.get('title'),
            'developer': item.get('developer') or item.get('developer_name'),
            'total_units': item.get('units') or item.get('total_units'),
            'district': item.get('district'),
            'tenure': item.get('tenure'),
            'address': item.get('address') or item.get('location'),
            'source': 'edgeprop',
        }

        # Parse PSF
        psf = item.get('psf') or item.get('indicative_psf') or item.get('price_psf')
        if psf:
            if isinstance(psf, dict):
                project['psf_low'] = psf.get('min') or psf.get('low')
                project['psf_high'] = psf.get('max') or psf.get('high')
            else:
                project['psf_low'] = project['psf_high'] = float(psf)

        if project.get('project_name'):
            results.append(project)

    return results


# =============================================================================
# PROPNEX SCRAPER
# =============================================================================

PROPNEX_URL = "https://www.propnex.com/new-launches"


def scrape_propnex(target_year: int = 2026) -> List[Dict[str, Any]]:
    """Scrape PropNex new launches page."""
    results = []

    print(f"\nScraping PropNex new launches for {target_year}...")

    html = fetch_page(
        PROPNEX_URL,
        use_playwright=True,
        wait_selector='.property-card, .project-item, .listing, article'
    )

    if not html:
        print("  Failed to fetch PropNex page")
        return results

    _debug_save_html(html, "propnex")

    soup = BeautifulSoup(html, 'html.parser')

    # Try multiple selectors
    selectors = [
        'div[class*="project"]',
        'div[class*="property"]',
        'div[class*="listing"]',
        'article',
        '.card',
    ]

    project_cards = []
    for selector in selectors:
        cards = soup.select(selector)
        if cards:
            print(f"  Found {len(cards)} cards with selector: {selector}")
            project_cards = cards
            break

    for card in project_cards:
        try:
            project = _parse_property_card(card, target_year, 'propnex')
            if project and project.get('project_name'):
                project['source'] = 'propnex'
                project['source_url'] = PROPNEX_URL
                results.append(project)
        except Exception as e:
            print(f"  Error parsing card: {e}")
            continue

    print(f"  Extracted {len(results)} projects from PropNex")
    return results


# =============================================================================
# ERA SCRAPER
# =============================================================================

# ERA property portal - JS-driven, needs Playwright or XHR endpoint discovery
# Main site: https://www.era.com.sg/new-launches/ (marketing)
# Portal: https://propertyportal.era.com.sg/new-launches (actual listings, JS-driven)
ERA_URL = "https://propertyportal.era.com.sg/new-launches"


def scrape_era(target_year: int = 2026) -> List[Dict[str, Any]]:
    """
    Scrape ERA property portal new launches.

    ERA's portal is JS-driven - the raw HTML is mostly shell/filters.
    Needs Playwright to render, or ideally discover XHR endpoint.
    """
    results = []

    print(f"\nScraping ERA new launches for {target_year}...")

    # ERA portal is JS-driven, needs Playwright
    html = fetch_page(
        ERA_URL,
        use_playwright=True,
        wait_selector='.property-card, .project-card, .listing-item, [class*="property"]'
    )

    if not html:
        print("  Failed to fetch ERA page")
        return results

    _debug_save_html(html, "era")

    soup = BeautifulSoup(html, 'html.parser')

    # Try multiple selectors
    selectors = [
        'div[class*="project"]',
        'div[class*="property"]',
        'div[class*="listing"]',
        'article',
        '.card',
    ]

    project_cards = []
    for selector in selectors:
        cards = soup.select(selector)
        if cards:
            print(f"  Found {len(cards)} cards with selector: {selector}")
            project_cards = cards
            break

    for card in project_cards:
        try:
            project = _parse_property_card(card, target_year, 'era')
            if project and project.get('project_name'):
                project['source'] = 'era'
                project['source_url'] = ERA_URL
                results.append(project)
        except Exception as e:
            print(f"  Error parsing card: {e}")
            continue

    print(f"  Extracted {len(results)} projects from ERA")
    return results


# =============================================================================
# GENERIC PROPERTY CARD PARSER
# =============================================================================

def _parse_property_card(card, target_year: int, source: str) -> Optional[Dict[str, Any]]:
    """
    Parse a property card element to extract project details.
    Works with various HTML structures from different sites.
    """
    project = {}

    # Get all text for pattern matching
    text = card.get_text(separator=' ', strip=True)

    # Extract project name (try multiple approaches)
    name_elem = (
        card.find(['h1', 'h2', 'h3', 'h4']) or
        card.find(class_=re.compile(r'title|name|heading', re.I)) or
        card.find('a', class_=re.compile(r'title|name', re.I))
    )
    if name_elem:
        name = name_elem.get_text(strip=True)
        # Clean up name
        name = re.sub(r'\s+', ' ', name).strip()
        if len(name) > 3 and len(name) < 100:
            project['project_name'] = name

    # Extract developer
    dev_patterns = [
        r'(?:by|developer|developed by)[:\s]+([A-Z][A-Za-z\s&,]+?)(?:\.|,|\n|$|\d)',
        r'Developer[:\s]+([^\n|]+)',
    ]
    for pattern in dev_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            dev = match.group(1).strip()
            if len(dev) > 2 and len(dev) < 80:
                project['developer'] = dev
                break

    # Extract total units
    units_match = re.search(r'(\d{2,4})\s*(?:units?|residential)', text, re.I)
    if units_match:
        project['total_units'] = int(units_match.group(1))

    # Extract district
    district_match = re.search(r'(?:District|D)\s*(\d{1,2})\b', text, re.I)
    if district_match:
        project['district'] = f"D{district_match.group(1).zfill(2)}"

    # Extract tenure
    if re.search(r'\bfreehold\b', text, re.I):
        project['tenure'] = 'Freehold'
    elif re.search(r'999[-\s]?year', text, re.I):
        project['tenure'] = '999-year'
    elif re.search(r'99[-\s]?year', text, re.I):
        project['tenure'] = '99-year'
    elif re.search(r'leasehold', text, re.I):
        project['tenure'] = '99-year'  # Default leasehold

    # Extract PSF range
    psf_patterns = [
        r'\$\s*([\d,]+)\s*(?:to|-|–)\s*\$?\s*([\d,]+)\s*(?:psf|per sq ft|/sqft)',
        r'(?:from|starting)\s*\$\s*([\d,]+)\s*(?:psf|per sq ft)',
        r'\$\s*([\d,]+)\s*(?:psf|per sq ft|/sqft)',
    ]

    for pattern in psf_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            project['psf_low'] = float(match.group(1).replace(',', ''))
            if match.lastindex >= 2 and match.group(2):
                project['psf_high'] = float(match.group(2).replace(',', ''))
            else:
                project['psf_high'] = project['psf_low']
            break

    # Extract address
    addr_match = re.search(
        r'(?:at|along|located)\s+([A-Z][A-Za-z\s]+(?:Road|Street|Avenue|Drive|Lane|Way|Walk|Rise|Crescent|Close))',
        text, re.I
    )
    if addr_match:
        project['address'] = addr_match.group(1).strip()

    # Extract launch year / TOP year
    year_patterns = [
        r'(?:launch|launching|TOP|completion|ready)\s*(?:in|by|around)?\s*(202[4-9]|2030)',
        r'(202[4-9]|2030)\s*(?:launch|TOP|completion)',
    ]
    for pattern in year_patterns:
        match = re.search(pattern, text, re.I)
        if match:
            project['launch_year'] = int(match.group(1))
            break

    # Extract URL if available
    link = card.find('a', href=True)
    if link:
        href = link.get('href', '')
        if href.startswith('/'):
            # Determine base URL based on source
            base_urls = {
                'edgeprop': 'https://www.edgeprop.sg',
                'propnex': 'https://www.propnex.com',
                'era': 'https://www.era.com.sg',
            }
            project['detail_url'] = base_urls.get(source, '') + href
        elif href.startswith('http'):
            project['detail_url'] = href

    return project if project.get('project_name') else None


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def _debug_save_html(html: str, source: str):
    """Save HTML to file for debugging."""
    debug_dir = "/tmp/scraper_debug"
    try:
        os.makedirs(debug_dir, exist_ok=True)
        filepath = f"{debug_dir}/{source}_raw.html"
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(html)
        print(f"  Debug: Saved HTML to {filepath}")

        # Check for common content indicators
        has_listings = any(x in html.lower() for x in ['project', 'property', 'condo', 'residence', 'units'])
        print(f"  Debug: HTML contains listing keywords: {has_listings}")
    except Exception as e:
        pass


def normalize_project_name(name: str) -> str:
    """
    Normalize project name for matching.

    Handles variations like:
    - "AMO Residence" vs "Amo Residence" vs "AMO RESIDENCE"
    - "The Botany at Dairy Farm" vs "Botany @ Dairy Farm"
    - "CanningHill Piers" vs "Canning Hill Piers"
    """
    if not name:
        return ""
    normalized = name.lower().strip()
    # Remove common suffixes/prefixes
    normalized = re.sub(r'\b(the|condo|condominium|residences|residence|at|@)\b', ' ', normalized)
    # Normalize spacing
    normalized = re.sub(r'\s+', ' ', normalized).strip()
    # Remove punctuation
    normalized = re.sub(r'[^\w\s]', '', normalized)
    return normalized


def fuzzy_match_score(name_a: str, name_b: str) -> float:
    """
    Calculate fuzzy match score between two project names.
    Returns score from 0.0 to 1.0 (1.0 = exact match).

    Uses token-based matching for better results with name variations.
    """
    if not name_a or not name_b:
        return 0.0

    # Exact match
    if name_a == name_b:
        return 1.0

    # Token-based matching
    tokens_a = set(name_a.split())
    tokens_b = set(name_b.split())

    if not tokens_a or not tokens_b:
        return 0.0

    # Jaccard similarity
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    jaccard = intersection / union if union > 0 else 0

    # Also check if one contains most of the other (for partial matches)
    containment_a = intersection / len(tokens_a) if tokens_a else 0
    containment_b = intersection / len(tokens_b) if tokens_b else 0
    containment = max(containment_a, containment_b)

    # Combined score (weight towards containment for partial matches)
    return max(jaccard, containment * 0.9)


def match_projects(projects_a: List[Dict], projects_b: List[Dict], threshold: float = 0.6) -> List[Tuple[Dict, Dict]]:
    """
    Match projects from two sources using fuzzy name matching.

    Args:
        projects_a: First list of projects
        projects_b: Second list of projects
        threshold: Minimum similarity score to consider a match (0.0-1.0)
    """
    matches = []
    used_b = set()

    for a in projects_a:
        name_a = normalize_project_name(a.get('project_name', ''))
        if not name_a:
            continue

        best_match = None
        best_score = 0.0

        for i, b in enumerate(projects_b):
            if i in used_b:
                continue

            name_b = normalize_project_name(b.get('project_name', ''))
            if not name_b:
                continue

            # Use fuzzy matching
            score = fuzzy_match_score(name_a, name_b)
            if score > best_score:
                best_match = (i, b)
                best_score = score

            # Early exit on exact match
            if score == 1.0:
                break

        if best_match and best_score >= threshold:
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

    Sources are scraped in parallel (conceptually) and cross-validated:
    - EdgeProp: Primary research-grade source
    - PropNex: Agency source for validation
    - ERA: Agency source for validation

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
    print(f"{'='*60}")

    if not PLAYWRIGHT_AVAILABLE:
        print("\n⚠️  Playwright not installed. JS-rendered content may not be captured.")
        print("   Install with: pip install playwright && playwright install chromium\n")

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
    # PHASE 3: Process each project with cross-validation
    # ==========================================================================
    for name, sources in master_projects.items():
        try:
            # Cross-validate to get consensus values
            validated = _cross_validate_sources(
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
    # PHASE 5: Last-seen tracking and change detection
    # ==========================================================================
    all_projects = edgeprop_projects + propnex_projects + era_projects
    if all_projects and not dry_run:
        last_seen = _load_last_seen()
        changes = _detect_changes(all_projects, last_seen)

        # Update last-seen data
        new_last_seen = {}
        for proj in all_projects:
            name = normalize_project_name(proj.get('project_name', ''))
            if name:
                new_last_seen[name] = {
                    'project_name': proj.get('project_name'),
                    'total_units': proj.get('total_units'),
                    'psf_low': proj.get('psf_low'),
                    'last_seen': datetime.utcnow().isoformat(),
                }
        _save_last_seen(new_last_seen)

        stats['new_projects'] = changes['new']
        stats['changed_projects'] = changes['changed']
        stats['removed_projects'] = changes['removed']

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

    # Show change detection results
    if stats.get('new_projects'):
        print(f"\n🆕 New projects detected: {len(stats['new_projects'])}")
        for name in stats['new_projects'][:5]:
            print(f"   - {name}")
        if len(stats['new_projects']) > 5:
            print(f"   ... and {len(stats['new_projects']) - 5} more")

    if stats.get('changed_projects'):
        print(f"\n📝 Changed projects: {len(stats['changed_projects'])}")
        for name in stats['changed_projects'][:5]:
            print(f"   - {name}")

    if stats.get('removed_projects'):
        print(f"\n❌ Removed projects: {len(stats['removed_projects'])}")
        for name in stats['removed_projects'][:5]:
            print(f"   - {name}")

    if stats['errors']:
        print(f"\n⚠️  Errors: {len(stats['errors'])}")

    return stats


def _cross_validate_sources(
    edgeprop_data: Optional[Dict] = None,
    propnex_data: Optional[Dict] = None,
    era_data: Optional[Dict] = None,
) -> Dict[str, Any]:
    """
    Cross-validate data from multiple sources and return consensus values.

    - total_units: If diff > 5 units, flag for review
    - indicative_psf: If diff > $50, use average
    - developer: Must match exactly or flag
    """
    validated = {
        'needs_review': False,
        'review_reason': None,
    }

    sources = [s for s in [edgeprop_data, propnex_data, era_data] if s]

    if not sources:
        return validated

    # Validate total_units
    units_values = [s.get('total_units') for s in sources if s.get('total_units')]
    if units_values:
        if len(units_values) > 1:
            max_diff = max(units_values) - min(units_values)
            if max_diff > TOLERANCE['total_units']:
                validated['needs_review'] = True
                validated['review_reason'] = f"Units discrepancy: {min(units_values)}-{max(units_values)}"
        validated['total_units'] = int(sum(units_values) / len(units_values))
        validated['total_units_source'] = 'consensus' if len(units_values) > 1 else 'single'

    # Validate PSF
    psf_lows = [s.get('psf_low') for s in sources if s.get('psf_low')]
    psf_highs = [s.get('psf_high') for s in sources if s.get('psf_high')]

    if psf_lows:
        if len(psf_lows) > 1:
            max_diff = max(psf_lows) - min(psf_lows)
            if max_diff > TOLERANCE['indicative_psf']:
                validated['needs_review'] = True
                reason = validated.get('review_reason', '')
                validated['review_reason'] = f"{reason}; PSF discrepancy" if reason else "PSF discrepancy"
        validated['indicative_psf_low'] = sum(psf_lows) / len(psf_lows)
        validated['indicative_psf_source'] = 'consensus' if len(psf_lows) > 1 else 'single'

    if psf_highs:
        validated['indicative_psf_high'] = sum(psf_highs) / len(psf_highs)

    # Validate developer
    developers = [s.get('developer') for s in sources if s.get('developer')]
    if developers:
        # Check if all developers match (case-insensitive)
        dev_lower = [d.lower().strip() for d in developers]
        if len(set(dev_lower)) > 1:
            validated['needs_review'] = True
            reason = validated.get('review_reason', '')
            validated['review_reason'] = f"{reason}; Developer mismatch" if reason else "Developer mismatch"
        validated['developer'] = developers[0]  # Use first (EdgeProp priority)

    return validated


def _merge_source_data(sources: Dict[str, Dict]) -> Dict[str, Any]:
    """Merge data from multiple sources, preferring EdgeProp."""
    merged = {}

    # Priority: EdgeProp > PropNex > ERA
    for source_name in ['edgeprop', 'propnex', 'era']:
        source = sources.get(source_name)
        if not source:
            continue

        for key in ['developer', 'district', 'tenure', 'address', 'launch_year', 'total_units', 'psf_low', 'psf_high']:
            if not merged.get(key) and source.get(key):
                merged[key] = source[key]

    return merged


def _update_new_launch(existing, validated: Dict, merged: Dict, source_urls: Dict):
    """Update an existing NewLaunch record with new data."""
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

    existing.needs_review = validated.get('needs_review', False)
    existing.review_reason = validated.get('review_reason')
    existing.source_urls = source_urls
    existing.last_scraped = datetime.utcnow()
    existing.updated_at = datetime.utcnow()


# =============================================================================
# GLS TENDER LINKING
# =============================================================================

def link_to_gls_tenders(db_session) -> Dict[str, int]:
    """Link NewLaunch records to GLS tender records."""
    from models.new_launch import NewLaunch
    from models.gls_tender import GLSTender

    stats = {'linked': 0, 'already_linked': 0, 'no_match': 0}

    unlinked = db_session.query(NewLaunch).filter(
        NewLaunch.gls_tender_id.is_(None)
    ).all()

    print(f"  Found {len(unlinked)} unlinked new launches")

    for launch in unlinked:
        gls_tender = _find_matching_gls_tender(launch, db_session)

        if gls_tender:
            launch.gls_tender_id = gls_tender.id
            launch.land_bid_psf = float(gls_tender.psf_ppr) if gls_tender.psf_ppr else None
            stats['linked'] += 1
            print(f"    Linked: {launch.project_name} → {gls_tender.location_raw}")
        else:
            stats['no_match'] += 1

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

    if launch.planning_area and launch.developer:
        tender = db_session.query(GLSTender).filter(
            GLSTender.status == 'awarded',
            GLSTender.planning_area == launch.planning_area,
            GLSTender.successful_tenderer.ilike(f'%{launch.developer.split()[0]}%')
        ).first()
        if tender:
            return tender

    if launch.district:
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
    """Bi-weekly validation job: re-scrape and compare against stored values."""
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

    for launch in launches:
        name = normalize_project_name(launch.project_name)
        current = current_data.get(name)

        if not current:
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

        if discrepancies:
            stats['discrepancies_found'] += 1
            stats['discrepancies'].append({
                'project_name': launch.project_name,
                'issues': discrepancies,
            })

            launch.needs_review = True
            launch.review_reason = f"Validation discrepancies: {', '.join(d['field'] for d in discrepancies)}"
            stats['flagged_for_review'] += 1

        launch.last_validated = datetime.utcnow()

    try:
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        print(f"Error committing validation: {e}")

    print(f"\n{'='*60}")
    print("Validation Complete")
    print(f"{'='*60}")
    print(f"Projects validated: {stats['total_validated']}")
    print(f"Discrepancies found: {stats['discrepancies_found']}")
    print(f"Flagged for review: {stats['flagged_for_review']}")

    return stats


# =============================================================================
# SEED DATA - Known 2026 New Launches (Fallback)
# =============================================================================

SEED_DATA_2026 = [
    {
        'project_name': 'AMO Residence',
        'developer': 'UOL Group',
        'district': 'D20',
        'planning_area': 'Ang Mo Kio',
        'market_segment': 'OCR',
        'total_units': 372,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2600,
        'tenure': '99-year',
    },
    {
        'project_name': 'Tembusu Grand',
        'developer': 'CDL & MCL Land',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 638,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2500,
        'tenure': '99-year',
    },
    {
        'project_name': 'Grand Dunman',
        'developer': 'SingHaiyi Group',
        'district': 'D15',
        'planning_area': 'Marine Parade',
        'market_segment': 'RCR',
        'total_units': 1008,
        'indicative_psf_low': 2400,
        'indicative_psf_high': 2500,
        'tenure': '99-year',
    },
    {
        'project_name': 'CanningHill Piers',
        'developer': 'CDL & CapitaLand',
        'district': 'D06',
        'planning_area': 'River Valley',
        'market_segment': 'CCR',
        'total_units': 696,
        'indicative_psf_low': 2800,
        'indicative_psf_high': 3500,
        'tenure': '99-year',
    },
    {
        'project_name': 'The Botany at Dairy Farm',
        'developer': 'Sim Lian Group',
        'district': 'D23',
        'planning_area': 'Bukit Panjang',
        'market_segment': 'OCR',
        'total_units': 386,
        'indicative_psf_low': 2000,
        'indicative_psf_high': 2100,
        'tenure': '99-year',
    },
    {
        'project_name': 'Blossoms By The Park',
        'developer': 'EL Development',
        'district': 'D05',
        'planning_area': 'Buona Vista',
        'market_segment': 'RCR',
        'total_units': 275,
        'indicative_psf_low': 2200,
        'indicative_psf_high': 2400,
        'tenure': '99-year',
    },
    {
        'project_name': 'Watten House',
        'developer': 'UOL Group & Singapore Land',
        'district': 'D11',
        'planning_area': 'Bukit Timah',
        'market_segment': 'CCR',
        'total_units': 180,
        'indicative_psf_low': 3000,
        'indicative_psf_high': 3500,
        'tenure': 'Freehold',
    },
]


def seed_new_launches(db_session=None, reset: bool = False) -> Dict[str, Any]:
    """Seed the database with known 2026 new launch projects."""
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
        deleted = db_session.query(NewLaunch).filter(NewLaunch.launch_year == 2026).delete()
        db_session.commit()
        print(f"Deleted {deleted} existing 2026 records")

    existing_names = {
        r[0].lower() for r in
        db_session.query(NewLaunch.project_name).filter(NewLaunch.launch_year == 2026).all()
    }
    stats['existing'] = len(existing_names)

    for project_data in SEED_DATA_2026:
        try:
            project_name = project_data['project_name']

            if project_name.lower() in existing_names:
                stats['skipped'] += 1
                print(f"  Skipped (exists): {project_name}")
                continue

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
                property_type='Condominium',
                source_urls={'seed': 'Manual seed data'},
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

    return stats
