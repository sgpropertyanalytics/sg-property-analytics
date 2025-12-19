"""
GLS (Government Land Sales) Scraper

Scrapes URA Media Releases for GLS tender data.
Two-phase model:
- 'launched': Government intent signal (SIGNAL)
- 'awarded': Capital committed (FACT)

Pipeline: Location -> Geocode (OneMap API) -> Planning Area -> Region
"""
import re
import requests
from datetime import datetime
from typing import Optional, Dict, List, Tuple, Any
from decimal import Decimal
from bs4 import BeautifulSoup
import time
import functools

# =============================================================================
# PLANNING AREA TO REGION MAPPING (AUTHORITATIVE)
# =============================================================================

PLANNING_AREA_TO_REGION = {
    # CCR (Core Central Region) - Districts 9, 10, 11
    'Bukit Timah': 'CCR', 'Downtown Core': 'CCR', 'Marina East': 'CCR',
    'Marina South': 'CCR', 'Novena': 'CCR', 'Orchard': 'CCR',
    'Outram': 'CCR', 'Rochor': 'CCR', 'Singapore River': 'CCR',
    'Southern Islands': 'CCR', 'Straits View': 'CCR', 'Tanglin': 'CCR',
    'Museum': 'CCR', 'Newton': 'CCR', 'River Valley': 'CCR',

    # RCR (Rest of Central Region)
    'Bishan': 'RCR', 'Bukit Merah': 'RCR', 'Geylang': 'RCR',
    'Kallang': 'RCR', 'Marine Parade': 'RCR', 'Queenstown': 'RCR',
    'Toa Payoh': 'RCR', 'Central Area': 'RCR',

    # OCR (Outside Central Region) - all others
    'Ang Mo Kio': 'OCR', 'Bedok': 'OCR', 'Bukit Batok': 'OCR',
    'Bukit Panjang': 'OCR', 'Choa Chu Kang': 'OCR', 'Clementi': 'OCR',
    'Hougang': 'OCR', 'Jurong East': 'OCR', 'Jurong West': 'OCR',
    'Pasir Ris': 'OCR', 'Punggol': 'OCR', 'Sembawang': 'OCR',
    'Sengkang': 'OCR', 'Serangoon': 'OCR', 'Tampines': 'OCR',
    'Tengah': 'OCR', 'Woodlands': 'OCR', 'Yishun': 'OCR',
    'Lim Chu Kang': 'OCR', 'Mandai': 'OCR', 'Pioneer': 'OCR',
    'Tuas': 'OCR', 'Western Islands': 'OCR', 'Changi': 'OCR',
    'Changi Bay': 'OCR', 'Paya Lebar': 'OCR', 'Seletar': 'OCR',
    'Simpang': 'OCR', 'Sungei Kadut': 'OCR', 'Western Water Catchment': 'OCR',
}

# Common subzone to Planning Area mappings
# IMPORTANT: Bukit Timah Road classification depends on specific location
# - D10/D11 (near Orchard/Novena) = CCR
# - D21 (Upper Bukit Timah) = OCR
SUBZONE_TO_PLANNING_AREA = {
    # Bukit Merah subzones (RCR)
    'telok blangah': 'Bukit Merah',
    'telok blangah way': 'Bukit Merah',
    'telok blangah road': 'Bukit Merah',

    # Queenstown subzones (RCR)
    'alexandra': 'Queenstown',
    'alexandra road': 'Queenstown',
    'one-north': 'Queenstown',
    'buona vista': 'Queenstown',
    'pasir panjang': 'Queenstown',
    'dover': 'Queenstown',
    'dover drive': 'Queenstown',

    # Bedok subzones (OCR)
    'bedok rise': 'Bedok',
    'bedok north': 'Bedok',
    'bayshore': 'Bedok',

    # Novena subzones (CCR)
    'balestier': 'Novena',
    'newton': 'Newton',
    'dunearn': 'Novena',
    'dunearn road': 'Novena',

    # Serangoon (OCR)
    'upper serangoon': 'Serangoon',

    # Bukit Timah proper (CCR - D10/D11)
    'holland': 'Bukit Timah',
    'holland road': 'Bukit Timah',
    'media circle': 'Bukit Timah',
    'mt sinai': 'Bukit Timah',
    'beauty world': 'Bukit Timah',

    # Upper Bukit Timah area (OCR - D21)
    'dairy farm': 'Bukit Panjang',
    'dairy farm walk': 'Bukit Panjang',
    'hillview': 'Bukit Panjang',
    'cashew': 'Bukit Panjang',
    'upper bukit timah': 'Bukit Panjang',

    # Clementi (OCR)
    'clementi woods': 'Clementi',
    'pine grove': 'Clementi',

    # Tengah (OCR)
    'tengah': 'Tengah',
    'garden walk': 'Tengah',
    'plantation close': 'Tengah',

    # Singapore River (CCR)
    'zion road': 'Singapore River',
    'kim seng': 'Singapore River',

    # Kallang (RCR)
    'tanjong rhu': 'Kallang',
    'tanjong rhu road': 'Kallang',
    'kallang close': 'Kallang',

    # Ang Mo Kio (OCR)
    'mayflower': 'Ang Mo Kio',
    'lentor': 'Ang Mo Kio',
    'lentor central': 'Ang Mo Kio',

    # Bishan (RCR)
    'upper thomson': 'Bishan',

    # Sembawang (OCR)
    'springleaf': 'Sembawang',
    'canberra': 'Sembawang',

    # Geylang (RCR)
    'jalan tembusu': 'Geylang',

    # Toa Payoh (RCR)
    'lorong 1 toa payoh': 'Toa Payoh',

    # Downtown Core (CCR)
    'orchard boulevard': 'Orchard',
    'marina bay': 'Downtown Core',
    'raffles place': 'Downtown Core',
    'shenton way': 'Downtown Core',
}

# OneMap API cache
_onemap_cache: Dict[str, Dict] = {}


def get_region_from_planning_area(planning_area: str) -> str:
    """Get region (CCR/RCR/OCR) from planning area name."""
    if not planning_area:
        return 'OCR'  # Default to OCR if unknown

    # Try exact match first
    region = PLANNING_AREA_TO_REGION.get(planning_area)
    if region:
        return region

    # Try case-insensitive match
    for area, reg in PLANNING_AREA_TO_REGION.items():
        if area.lower() == planning_area.lower():
            return reg

    # Default to OCR for unknown areas
    return 'OCR'


def lookup_planning_area_from_subzone(location: str) -> Optional[str]:
    """Look up planning area from common subzone names."""
    if not location:
        return None

    location_lower = location.lower().strip()

    # Direct lookup
    if location_lower in SUBZONE_TO_PLANNING_AREA:
        return SUBZONE_TO_PLANNING_AREA[location_lower]

    # Partial match - check if any subzone is in location
    for subzone, planning_area in SUBZONE_TO_PLANNING_AREA.items():
        if subzone in location_lower:
            return planning_area

    return None


def geocode_location(location: str) -> Dict[str, Any]:
    """
    Geocode a location using OneMap API.
    Returns lat, lon, and planning area.
    Uses caching to avoid repeated API calls.
    """
    if not location:
        return {'latitude': None, 'longitude': None, 'planning_area': None}

    # Check cache first
    cache_key = location.lower().strip()
    if cache_key in _onemap_cache:
        return _onemap_cache[cache_key]

    # Try subzone lookup first (faster and more accurate for GLS)
    planning_area = lookup_planning_area_from_subzone(location)
    if planning_area:
        result = {
            'latitude': None,
            'longitude': None,
            'planning_area': planning_area
        }
        _onemap_cache[cache_key] = result
        return result

    # Call OneMap API
    try:
        # OneMap Search API
        url = "https://www.onemap.gov.sg/api/common/elastic/search"
        params = {
            'searchVal': location,
            'returnGeom': 'Y',
            'getAddrDetails': 'Y',
            'pageNum': 1
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get('found', 0) > 0 and data.get('results'):
            result = data['results'][0]
            geocoded = {
                'latitude': float(result.get('LATITUDE')) if result.get('LATITUDE') else None,
                'longitude': float(result.get('LONGITUDE')) if result.get('LONGITUDE') else None,
                'planning_area': result.get('BUILDING'),
            }

            # Try to get planning area from address components
            if not geocoded['planning_area'] and geocoded['latitude'] and geocoded['longitude']:
                planning_area = reverse_geocode_to_planning_area(
                    geocoded['latitude'],
                    geocoded['longitude']
                )
                geocoded['planning_area'] = planning_area

            _onemap_cache[cache_key] = geocoded
            return geocoded

    except Exception as e:
        print(f"OneMap geocoding failed for '{location}': {e}")

    # Return empty result
    result = {'latitude': None, 'longitude': None, 'planning_area': None}
    _onemap_cache[cache_key] = result
    return result


def reverse_geocode_to_planning_area(lat: float, lon: float) -> Optional[str]:
    """
    Reverse geocode coordinates to get planning area using OneMap.
    """
    try:
        url = "https://www.onemap.gov.sg/api/public/revgeocode"
        params = {
            'location': f"{lat},{lon}",
            'buffer': 100,
            'addressType': 'All',
            'otherFeatures': 'Y'
        }

        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        if data.get('GeocodeInfo'):
            for info in data['GeocodeInfo']:
                if info.get('PLANDIVISION'):
                    return info['PLANDIVISION']

    except Exception as e:
        print(f"Reverse geocoding failed: {e}")

    return None


# =============================================================================
# STATUS CLASSIFICATION
# =============================================================================

LAUNCHED_PATTERNS = [
    r'launch(?:ed|es|ing)?',
    r'invite(?:s|d)?\s+(?:tender|bid)',
    r'available\s+for\s+(?:application|tender)',
    r'open(?:s|ed)?\s+for\s+(?:tender|application)',
    r'call(?:s|ed)?\s+(?:for\s+)?tender',
    r'release(?:s|d)?\s+(?:site|land)',
    r'offer(?:s|ed)?\s+(?:site|land)',
    r'for\s+sale\s+today',  # "released for sale today"
    r'gls\s+programme',  # "Government Land Sales Programme"
]

AWARDED_PATTERNS = [
    r'award(?:s|ed)?',
    r'successful\s+tenderer',
    r'highest\s+bid',
    r'winning\s+bid',
    r'tender(?:ed)?\s+(?:at|for)\s+\$',
    r'won\s+(?:by|the)',
    r'land\s+parcel\s+(?:sold|awarded)',
]


def classify_status(title: str, content: str = "") -> str:
    """
    Classify a media release as 'launched' or 'awarded'.
    Uses semantic pattern matching.
    """
    text = f"{title} {content}".lower()

    # Check awarded patterns first (they're more specific)
    for pattern in AWARDED_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return 'awarded'

    # Check launched patterns
    for pattern in LAUNCHED_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return 'launched'

    # Default to launched if contains 'tender' but no award language
    if 'tender' in text.lower():
        return 'launched'

    return 'launched'  # Safe default


# =============================================================================
# SCRAPING FUNCTIONS
# =============================================================================

URA_MEDIA_BASE = "https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases"
URA_MEDIA_RELEASE_URL = "https://www.ura.gov.sg/Corporate/Media-Room/Media-Releases/{release_id}"


def get_media_release_links(year: int = 2025) -> List[Dict[str, str]]:
    """
    Get list of GLS-related media releases from URA.
    Returns list of {release_id, title, url}.
    """
    releases = []

    try:
        # URA media releases page
        url = f"{URA_MEDIA_BASE}?year={year}"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, timeout=30, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Find all media release links
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            text = link.get_text(strip=True).lower()

            # Filter for residential tender-related releases
            if '/Media-Releases/' in href and 'pr' in href.lower():
                title = link.get_text(strip=True)
                title_lower = title.lower()

                # Must contain tender-related keywords
                has_tender = any(k in title_lower for k in ['tender', 'gls', 'land sale', 'land parcel', 'residential site'])

                # Must be residential (or not specifically industrial/commercial)
                is_residential = 'residential' in title_lower or not any(
                    k in title_lower for k in ['industrial', 'commercial only', 'office only', 'retail only', 'hotel only']
                )

                if has_tender and is_residential:
                    # Extract release ID from URL
                    match = re.search(r'(pr\d+-\d+)', href, re.IGNORECASE)
                    if match:
                        release_id = match.group(1).lower()
                        full_url = f"https://www.ura.gov.sg{href}" if href.startswith('/') else href

                        releases.append({
                            'release_id': release_id,
                            'title': title,
                            'url': full_url
                        })

    except Exception as e:
        print(f"Error fetching media releases for {year}: {e}")

    # Deduplicate by release_id
    seen = set()
    unique_releases = []
    for r in releases:
        if r['release_id'] not in seen:
            seen.add(r['release_id'])
            unique_releases.append(r)

    return unique_releases


def parse_media_release(url: str, release_id: str) -> List[Dict[str, Any]]:
    """
    Parse a single URA media release page.
    Returns a LIST of tender dicts (one per site) since releases can have multiple sites.
    """
    tenders = []

    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, timeout=30, headers=headers)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, 'html.parser')

        # Get release date
        release_date = None
        date_elem = soup.find('span', class_='date') or soup.find(class_='release-date')
        if date_elem:
            date_text = date_elem.get_text(strip=True)
            release_date = parse_date(date_text)

        # If no date found, try to extract from content
        if not release_date:
            content = soup.get_text()
            date_match = re.search(r'(\d{1,2}\s+\w+\s+\d{4})', content)
            if date_match:
                release_date = parse_date(date_match.group(1))

        # Get full content for classification
        content = soup.get_text()
        title = soup.find('h1')
        title_text = title.get_text(strip=True) if title else ""

        # Classify status
        status = classify_status(title_text, content)

        # Extract unit counts from text FIRST (before table parsing)
        # Pattern: "sites at X, Y and Z can potentially yield about 480, 525, and 625 residential units"
        location_units_map = extract_location_units_from_text(content)

        # Extract data from tables - get ALL rows, not just first
        tables = soup.find_all('table')
        table_data_list = extract_all_table_data(tables, status)

        if table_data_list:
            for idx, data in enumerate(table_data_list):
                location = data.get('location_raw', '')

                # Try to match units from text extraction
                if not data.get('estimated_units') and location_units_map:
                    for loc_key, units in location_units_map.items():
                        if loc_key.lower() in location.lower() or location.lower() in loc_key.lower():
                            data['estimated_units'] = units
                            data['estimated_units_source'] = 'ura_stated'
                            break

                # Generate unique release_id per location
                location_slug = re.sub(r'[^a-z0-9]+', '-', location.lower().strip())[:30]
                unique_id = f"{release_id}-{location_slug}" if len(table_data_list) > 1 else release_id

                data['release_id'] = unique_id
                data['release_url'] = url
                data['release_date'] = release_date
                data['status'] = status
                tenders.append(data)
        else:
            # Try extracting from text if no table found
            text_data_list = extract_all_from_text(content, status)

            if text_data_list:
                for idx, data in enumerate(text_data_list):
                    location = data.get('location_raw', '')

                    # Try to match units from text extraction
                    if not data.get('estimated_units') and location_units_map:
                        for loc_key, units in location_units_map.items():
                            if loc_key.lower() in location.lower() or location.lower() in loc_key.lower():
                                data['estimated_units'] = units
                                data['estimated_units_source'] = 'ura_stated'
                                break

                    location_slug = re.sub(r'[^a-z0-9]+', '-', location.lower().strip())[:30]
                    unique_id = f"{release_id}-{location_slug}" if len(text_data_list) > 1 else release_id

                    data['release_id'] = unique_id
                    data['release_url'] = url
                    data['release_date'] = release_date
                    data['status'] = status
                    tenders.append(data)

    except Exception as e:
        print(f"Error parsing {url}: {e}")
        import traceback
        traceback.print_exc()

    return tenders


def extract_location_units_from_text(content: str) -> Dict[str, int]:
    """
    Extract location->units mapping from text like:
    "The sites at Lentor Central, Kallang Close and Dunearn Road can potentially yield about 560, 470 and 330 residential units"
    "The sites at Dairy Farm Walk, Tanjong Rhu Road, and Dover Drive can potentially yield about 480, 525, and 625 residential units, respectively"
    """
    location_units = {}

    # Pattern for multiple sites with units
    patterns = [
        # "sites at X, Y and Z can potentially yield about 480, 525, and 625 units"
        r'sites?\s+at\s+([^\.]+?)\s+can\s+(?:potentially\s+)?yield\s+(?:about\s+)?([0-9,\s]+(?:and\s+)?[0-9,]+)\s+(?:residential\s+)?units?',
        # Alternative pattern
        r'([A-Z][a-zA-Z\s,]+(?:Road|Drive|Walk|Close|Central|Way|Avenue|Lane|Rise|Park|View)(?:,\s+[A-Z][a-zA-Z\s]+(?:Road|Drive|Walk|Close|Central|Way|Avenue|Lane|Rise|Park|View))*(?:\s+and\s+[A-Z][a-zA-Z\s]+(?:Road|Drive|Walk|Close|Central|Way|Avenue|Lane|Rise|Park|View))?)\s+can\s+(?:potentially\s+)?yield\s+(?:about\s+)?([0-9,\s]+(?:and\s+)?[0-9,]+)\s+(?:residential\s+)?units?',
    ]

    for pattern in patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            locations_str = match.group(1)
            units_str = match.group(2)

            # Parse locations: "Lentor Central, Kallang Close and Dunearn Road"
            # Split on comma and "and"
            locations = re.split(r',\s*|\s+and\s+', locations_str)
            locations = [loc.strip() for loc in locations if loc.strip()]

            # Parse units: "560, 470 and 330" or "480, 525, and 625"
            units = re.findall(r'(\d+)', units_str)
            units = [int(u) for u in units]

            # Match locations to units (in order)
            if len(locations) == len(units):
                for loc, unit in zip(locations, units):
                    location_units[loc] = unit

            break

    return location_units


def is_valid_location(location: str) -> bool:
    """
    Validate that a string is a valid location name.
    Filters out common parsing artifacts like 'and', 'the', etc.
    """
    if not location:
        return False

    location = location.strip()

    # Too short to be a real location
    if len(location) < 5:
        return False

    # Common words that aren't locations
    invalid_words = {
        'and', 'the', 'for', 'with', 'from', 'that', 'this', 'which',
        'residential', 'commercial', 'industrial', 'site', 'land',
        'parcel', 'tender', 'award', 'sale', 'gls', 'ura',
        'while', 'about', 'units', 'sqm', 'sq m'
    }

    if location.lower() in invalid_words:
        return False

    # Must contain at least one letter
    if not any(c.isalpha() for c in location):
        return False

    # Should have a road suffix or be a known place name
    road_suffixes = ['road', 'street', 'avenue', 'drive', 'lane', 'way',
                     'close', 'rise', 'park', 'view', 'central', 'walk',
                     'crescent', 'place', 'terrace', 'grove', 'hill', 'heights']

    location_lower = location.lower()

    # Check if it ends with a road suffix
    has_road_suffix = any(location_lower.endswith(suffix) for suffix in road_suffixes)

    # Or contains a road suffix somewhere
    has_road_word = any(suffix in location_lower for suffix in road_suffixes)

    # Known place names without road suffixes
    known_places = ['bedok', 'tampines', 'clementi', 'jurong', 'woodlands',
                    'sembawang', 'punggol', 'sengkang', 'hougang', 'bishan',
                    'toa payoh', 'ang mo kio', 'bukit', 'kallang', 'geylang',
                    'queenstown', 'novena', 'orchard', 'newton', 'tanglin']

    is_known_place = any(place in location_lower for place in known_places)

    return has_road_suffix or has_road_word or is_known_place


def extract_all_table_data(tables: List, status: str) -> List[Dict[str, Any]]:
    """
    Extract tender data from ALL rows of HTML tables.
    Returns a list of dicts, one per site.
    """
    results = []

    if not tables:
        return results

    for table in tables:
        rows = table.find_all('tr')
        if len(rows) < 2:
            continue

        # Get headers from first row
        headers = []
        header_row = rows[0]
        for cell in header_row.find_all(['th', 'td']):
            headers.append(cell.get_text(strip=True).lower())

        if not headers:
            continue

        # Find relevant column indices using fuzzy matching
        col_map = map_table_columns(headers)

        # Parse ALL data rows
        for row in rows[1:]:
            cells = row.find_all(['th', 'td'])
            if len(cells) < 2:
                continue

            data = {}

            # Extract based on column mapping
            if col_map.get('location') is not None and col_map['location'] < len(cells):
                data['location_raw'] = cells[col_map['location']].get_text(strip=True)

            if col_map.get('site_area') is not None and col_map['site_area'] < len(cells):
                data['site_area_sqm'] = parse_area(cells[col_map['site_area']].get_text(strip=True))

            if col_map.get('max_gfa') is not None and col_map['max_gfa'] < len(cells):
                data['max_gfa_sqm'] = parse_area(cells[col_map['max_gfa']].get_text(strip=True))

            if col_map.get('units') is not None and col_map['units'] < len(cells):
                units_text = cells[col_map['units']].get_text(strip=True)
                # Only parse if it looks like a reasonable unit count (< 10000)
                parsed_units = parse_number(units_text)
                if parsed_units and parsed_units < 10000:
                    data['estimated_units'] = parsed_units
                    data['estimated_units_source'] = 'ura_stated'

            if col_map.get('tenderer') is not None and col_map['tenderer'] < len(cells):
                data['successful_tenderer'] = cells[col_map['tenderer']].get_text(strip=True)

            if col_map.get('price') is not None and col_map['price'] < len(cells):
                data['tendered_price_sgd'] = parse_price(cells[col_map['price']].get_text(strip=True))

            if col_map.get('num_tenderers') is not None and col_map['num_tenderers'] < len(cells):
                data['num_tenderers'] = parse_number(cells[col_map['num_tenderers']].get_text(strip=True))

            if col_map.get('close_date') is not None and col_map['close_date'] < len(cells):
                data['tender_close_date'] = parse_date(cells[col_map['close_date']].get_text(strip=True))

            # Only add if we have a valid location
            if data.get('location_raw') and is_valid_location(data['location_raw']):
                results.append(data)

    return results


def extract_all_from_text(content: str, status: str) -> List[Dict[str, Any]]:
    """
    Extract tender data from plain text when no table is available.
    Returns a list for consistency, even if usually just one item.
    """
    results = []

    # First try to find all locations mentioned
    loc_patterns = [
        r'(?:site|land\s+parcel)s?\s+at\s+([A-Z][a-zA-Z\s,]+(?:Road|Street|Avenue|Drive|Lane|Way|Close|Rise|Park|View|Central|Walk)(?:,\s+[A-Z][a-zA-Z\s]+(?:Road|Street|Avenue|Drive|Lane|Way|Close|Rise|Park|View|Central|Walk))*)',
        r'(?:at|in|near|along)\s+([A-Z][a-zA-Z\s]+(?:Road|Street|Avenue|Drive|Lane|Way|Close|Rise|Park|View|Central|Walk))',
    ]

    locations = []
    for pattern in loc_patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            # Split on comma and "and" for multiple locations
            locs = re.split(r',\s*|\s+and\s+', match)
            for loc in locs:
                loc = loc.strip()
                # Validate the location
                if is_valid_location(loc):
                    locations.append(loc)

    # Deduplicate while preserving order
    seen = set()
    unique_locations = []
    for loc in locations:
        loc_lower = loc.lower()
        if loc_lower not in seen:
            seen.add(loc_lower)
            unique_locations.append(loc)

    # For each location, create a data dict
    for location in unique_locations[:5]:  # Limit to 5 to avoid false positives
        data = {'location_raw': location}

        # For awarded tenders, try to find price and tenderer
        if status == 'awarded':
            price_match = re.search(r'\$([0-9,]+(?:\.[0-9]+)?)\s*(?:million)?', content, re.IGNORECASE)
            if price_match:
                price_val = parse_price(price_match.group(0))
                if price_val:
                    data['tendered_price_sgd'] = price_val

            # Try to find successful tenderer
            tenderer_patterns = [
                r'(?:successful\s+tenderer|winning\s+bid(?:der)?|awarded\s+to)\s*[:\-]?\s*([A-Z][A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?|Limited|Inc|Corporation|Development))',
                r'([A-Z][A-Za-z\s&]+(?:Pte\.?\s*Ltd\.?|Limited))\s+(?:submitted|won|secured)',
            ]

            for pattern in tenderer_patterns:
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    data['successful_tenderer'] = match.group(1).strip()
                    break

        results.append(data)

    return results if results else []


def map_table_columns(headers: List[str]) -> Dict[str, int]:
    """
    Map table headers to field names using fuzzy matching.
    Returns dict of field_name -> column_index.
    """
    col_map = {}

    for idx, header in enumerate(headers):
        h = header.lower()

        # Location
        if any(k in h for k in ['location', 'address', 'street']):
            if 'area' not in h:  # Avoid 'site area'
                col_map['location'] = idx
        elif 'site' in h and 'area' not in h:
            col_map['location'] = idx

        # Site area
        if any(k in h for k in ['site area', 'land area']):
            col_map['site_area'] = idx

        # Max GFA
        if any(k in h for k in ['gfa', 'gross floor', 'max floor', 'maximum gfa']):
            col_map['max_gfa'] = idx

        # Estimated units
        if any(k in h for k in ['unit', 'dwelling']):
            if 'price' not in h:
                col_map['units'] = idx

        # Tenderer
        if any(k in h for k in ['tenderer', 'bidder', 'developer', 'winner', 'successful']):
            col_map['tenderer'] = idx

        # Price
        if any(k in h for k in ['price', 'bid', 'amount']):
            if 'unit' not in h:  # Avoid 'unit price'
                col_map['price'] = idx

        # Number of tenderers
        if any(k in h for k in ['no. of tender', 'number of tender', 'bids received']):
            col_map['num_tenderers'] = idx

        # Close date
        if any(k in h for k in ['close', 'closing', 'deadline']):
            col_map['close_date'] = idx

    return col_map


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse date string to datetime object."""
    if not date_str:
        return None

    # Common date formats
    formats = [
        '%d %B %Y',  # 15 January 2025
        '%d %b %Y',  # 15 Jan 2025
        '%B %d, %Y',  # January 15, 2025
        '%d/%m/%Y',  # 15/01/2025
        '%Y-%m-%d',  # 2025-01-15
    ]

    date_str = date_str.strip()

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue

    return None


def parse_number(text: str) -> Optional[int]:
    """Parse numeric text to integer."""
    if not text:
        return None

    # Remove commas and spaces
    cleaned = re.sub(r'[,\s]', '', text)

    # Extract digits
    match = re.search(r'(\d+)', cleaned)
    if match:
        return int(match.group(1))

    return None


def parse_area(text: str) -> Optional[Decimal]:
    """Parse area text to Decimal value in sqm."""
    if not text:
        return None

    text = text.strip()

    # Remove commas and spaces
    cleaned = re.sub(r'[,\s]', '', text)

    # Extract number (including decimal)
    match = re.search(r'([0-9]+(?:\.[0-9]+)?)', cleaned)
    if match:
        return Decimal(match.group(1))

    return None


def parse_price(text: str) -> Optional[Decimal]:
    """Parse price text to Decimal value in SGD."""
    if not text:
        return None

    text = text.strip()

    # Remove currency symbol
    text = text.replace('$', '').replace('S$', '').replace('SGD', '').strip()

    # Check for 'million' multiplier
    multiplier = 1
    if 'million' in text.lower():
        multiplier = 1_000_000
        text = re.sub(r'million', '', text, flags=re.IGNORECASE).strip()
    elif 'billion' in text.lower():
        multiplier = 1_000_000_000
        text = re.sub(r'billion', '', text, flags=re.IGNORECASE).strip()

    # Remove commas and spaces
    cleaned = re.sub(r'[,\s]', '', text)

    # Extract number
    match = re.search(r'([0-9]+(?:\.[0-9]+)?)', cleaned)
    if match:
        value = Decimal(match.group(1)) * multiplier
        return value

    return None


# =============================================================================
# MAIN SCRAPER FUNCTION
# =============================================================================

def scrape_gls_tenders(
    year: int = 2025,
    db_session=None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Main function to scrape GLS tenders from URA.

    Args:
        year: Year to scrape (default 2025)
        db_session: SQLAlchemy session (optional, will create if not provided)
        dry_run: If True, don't save to database

    Returns:
        Dict with statistics and any errors
    """
    from models.gls_tender import GLSTender
    from models.database import db

    if db_session is None:
        db_session = db.session

    stats = {
        'releases_found': 0,
        'tenders_parsed': 0,
        'tenders_saved': 0,
        'tenders_updated': 0,
        'tenders_skipped': 0,
        'errors': [],
        'needs_review': []
    }

    # Get media release links
    print(f"Fetching GLS media releases for {year}...")
    releases = get_media_release_links(year)
    stats['releases_found'] = len(releases)
    print(f"Found {len(releases)} potential GLS releases")

    for release in releases:
        base_release_id = release['release_id']
        url = release['url']
        title = release['title']

        print(f"Processing {base_release_id}: {title[:50]}...")

        # Parse the release - now returns a LIST of tenders
        tender_data_list = parse_media_release(url, base_release_id)

        if not tender_data_list:
            stats['errors'].append(f"{base_release_id}: Could not parse")
            print(f"  Could not parse")
            continue

        for data in tender_data_list:
            release_id = data['release_id']

            # Check if already exists
            existing = db_session.query(GLSTender).filter_by(release_id=release_id).first()
            if existing:
                print(f"  Already exists: {release_id}")
                stats['tenders_skipped'] += 1
                continue

            stats['tenders_parsed'] += 1

            # Geocode location
            location = data.get('location_raw', '')
            geo_data = geocode_location(location)
            data['latitude'] = geo_data.get('latitude')
            data['longitude'] = geo_data.get('longitude')
            data['planning_area'] = geo_data.get('planning_area')

            # Determine region from planning area
            if data['planning_area']:
                data['market_segment'] = get_region_from_planning_area(data['planning_area'])
            else:
                # Try to infer from location text
                planning_area = lookup_planning_area_from_subzone(location)
                if planning_area:
                    data['planning_area'] = planning_area
                    data['market_segment'] = get_region_from_planning_area(planning_area)
                else:
                    data['market_segment'] = None
                    data['needs_review'] = True
                    data['review_reason'] = f"Could not determine region for: {location}"
                    stats['needs_review'].append(release_id)

            # Create tender object
            tender = GLSTender(
                status=data.get('status', 'launched'),
                release_id=release_id,
                release_url=url,
                release_date=data.get('release_date'),
                tender_close_date=data.get('tender_close_date'),
                location_raw=data.get('location_raw'),
                latitude=data.get('latitude'),
                longitude=data.get('longitude'),
                planning_area=data.get('planning_area'),
                market_segment=data.get('market_segment'),
                site_area_sqm=data.get('site_area_sqm'),
                max_gfa_sqm=data.get('max_gfa_sqm'),
                estimated_units=data.get('estimated_units'),
                estimated_units_source=data.get('estimated_units_source'),
                successful_tenderer=data.get('successful_tenderer'),
                tendered_price_sgd=data.get('tendered_price_sgd'),
                num_tenderers=data.get('num_tenderers'),
                needs_review=data.get('needs_review', False),
                review_reason=data.get('review_reason'),
            )

            # Compute derived fields
            GLSTender.compute_derived_fields(tender)

            if dry_run:
                print(f"  Would save: {tender.status} | {tender.location_raw} | {tender.market_segment} | {tender.estimated_units} units")
            else:
                try:
                    db_session.add(tender)
                    db_session.commit()
                    stats['tenders_saved'] += 1
                    print(f"  Saved: {tender.status} | {tender.location_raw} | {tender.market_segment} | {tender.estimated_units} units")
                except Exception as e:
                    db_session.rollback()
                    stats['errors'].append(f"{release_id}: {str(e)}")
                    print(f"  Error saving: {e}")

        # Rate limiting
        time.sleep(0.5)

    return stats


def get_supply_pipeline(market_segment: Optional[str] = None, db_session=None) -> Dict[str, Any]:
    """
    Get aggregate upcoming supply pipeline.

    Returns:
        Dict with total units and breakdown by region
    """
    from models.gls_tender import GLSTender
    from models.database import db
    from sqlalchemy import func

    if db_session is None:
        db_session = db.session

    query = db_session.query(
        GLSTender.market_segment,
        func.sum(GLSTender.estimated_units).label('total_units'),
        func.count(GLSTender.id).label('tender_count')
    ).filter(
        GLSTender.status == 'launched'
    )

    if market_segment:
        query = query.filter(GLSTender.market_segment == market_segment.upper())

    query = query.group_by(GLSTender.market_segment)
    results = query.all()

    pipeline = {
        'status': 'SIGNAL',
        'disclaimer': 'Upcoming tenders - not confirmed supply',
        'by_region': {},
        'total_units': 0,
        'tender_count': 0
    }

    for row in results:
        region = row.market_segment or 'Unknown'
        units = int(row.total_units) if row.total_units else 0
        count = int(row.tender_count)

        pipeline['by_region'][region] = {
            'units': units,
            'tender_count': count
        }
        pipeline['total_units'] += units
        pipeline['tender_count'] += count

    return pipeline


def get_price_floor(market_segment: Optional[str] = None, db_session=None) -> Dict[str, Any]:
    """
    Get aggregate awarded price floor data.

    Returns:
        Dict with median psf_ppr and breakdown by region
    """
    from models.gls_tender import GLSTender
    from models.database import db
    from sqlalchemy import func

    if db_session is None:
        db_session = db.session

    query = db_session.query(
        GLSTender.market_segment,
        func.avg(GLSTender.psf_ppr).label('avg_psf_ppr'),
        func.min(GLSTender.psf_ppr).label('min_psf_ppr'),
        func.max(GLSTender.psf_ppr).label('max_psf_ppr'),
        func.count(GLSTender.id).label('tender_count'),
        func.sum(GLSTender.estimated_units).label('total_units')
    ).filter(
        GLSTender.status == 'awarded',
        GLSTender.psf_ppr.isnot(None)
    )

    if market_segment:
        query = query.filter(GLSTender.market_segment == market_segment.upper())

    query = query.group_by(GLSTender.market_segment)
    results = query.all()

    price_floor = {
        'status': 'FACT',
        'disclaimer': 'Based on awarded government land sales',
        'by_region': {}
    }

    for row in results:
        region = row.market_segment or 'Unknown'
        price_floor['by_region'][region] = {
            'avg_psf_ppr': round(float(row.avg_psf_ppr), 2) if row.avg_psf_ppr else None,
            'min_psf_ppr': round(float(row.min_psf_ppr), 2) if row.min_psf_ppr else None,
            'max_psf_ppr': round(float(row.max_psf_ppr), 2) if row.max_psf_ppr else None,
            'tender_count': int(row.tender_count),
            'total_units': int(row.total_units) if row.total_units else 0
        }

    return price_floor
