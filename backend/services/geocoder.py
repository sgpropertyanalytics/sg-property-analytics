"""
Geocoder Service - OneMap API wrapper for geocoding Singapore addresses

OneMap API: https://www.onemap.gov.sg/apidocs/

Endpoint: GET https://www.onemap.gov.sg/api/common/elastic/search
Rate limit: 250 calls/min (0.24s between calls minimum)
We use 0.3s delay to be safe.

Usage:
    from services.geocoder import OneMapGeocoder

    geocoder = OneMapGeocoder()
    result = geocoder.geocode("The Continuum")
    if result:
        print(f"Lat: {result['latitude']}, Lng: {result['longitude']}")
"""
import requests
import time
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass


@dataclass
class GeocodingResult:
    """Result from geocoding operation"""
    latitude: float
    longitude: float
    address: str
    postal_code: Optional[str]
    source: str  # 'onemap_project', 'onemap_address', etc.
    raw_response: Dict[str, Any]


class OneMapGeocoder:
    """OneMap API geocoder for Singapore addresses and projects"""

    BASE_URL = "https://www.onemap.gov.sg/api/common/elastic/search"
    RATE_LIMIT_DELAY = 0.3  # 300ms between calls (250 calls/min = 240ms, we use 300ms for safety)

    def __init__(self):
        self.last_request_time = 0
        self.session = requests.Session()
        # Set a reasonable timeout
        self.timeout = 10

    def _wait_for_rate_limit(self):
        """Ensure we don't exceed rate limits"""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.RATE_LIMIT_DELAY:
            time.sleep(self.RATE_LIMIT_DELAY - elapsed)
        self.last_request_time = time.time()

    def _search(self, query: str) -> Optional[Dict[str, Any]]:
        """
        Execute a search against OneMap API.

        Args:
            query: Search string (project name, address, postal code, etc.)

        Returns:
            First matching result or None
        """
        if not query or not query.strip():
            return None

        self._wait_for_rate_limit()

        params = {
            'searchVal': query.strip(),
            'returnGeom': 'Y',
            'getAddrDetails': 'Y',
            'pageNum': 1
        }

        try:
            response = self.session.get(
                self.BASE_URL,
                params=params,
                timeout=self.timeout
            )
            response.raise_for_status()

            data = response.json()

            # Check if we have results
            if data.get('found', 0) > 0 and data.get('results'):
                return data['results'][0]

            return None

        except requests.exceptions.RequestException as e:
            print(f"  OneMap API error for '{query}': {e}")
            return None
        except ValueError as e:
            print(f"  OneMap JSON parse error for '{query}': {e}")
            return None

    def geocode(self, search_query: str, fallback_query: Optional[str] = None) -> Optional[GeocodingResult]:
        """
        Geocode a location using OneMap API.

        Tries the primary query first, then fallback if provided.

        Args:
            search_query: Primary search string (e.g., project name)
            fallback_query: Fallback search string (e.g., address)

        Returns:
            GeocodingResult if successful, None otherwise
        """
        # Try primary query
        result = self._search(search_query)
        source = 'onemap_project'

        # If no result, try fallback
        if not result and fallback_query:
            result = self._search(fallback_query)
            source = 'onemap_address'

        if not result:
            return None

        # Extract coordinates
        try:
            latitude = float(result.get('LATITUDE', 0))
            longitude = float(result.get('LONGITUDE', 0))

            # Validate coordinates are in Singapore (rough bounds)
            # Singapore bounds: lat 1.15-1.47, lng 103.6-104.1
            if not (1.15 <= latitude <= 1.47 and 103.6 <= longitude <= 104.1):
                print(f"  Warning: Coordinates outside Singapore bounds for '{search_query}'")
                return None

            return GeocodingResult(
                latitude=latitude,
                longitude=longitude,
                address=result.get('ADDRESS', ''),
                postal_code=result.get('POSTAL', ''),
                source=source,
                raw_response=result
            )

        except (ValueError, TypeError) as e:
            print(f"  Error parsing coordinates for '{search_query}': {e}")
            return None

    def geocode_project(self, project_name: str, district: Optional[str] = None) -> Optional[GeocodingResult]:
        """
        Geocode a property project by name.

        Tries several strategies:
        1. Project name as-is
        2. Project name + "Singapore"
        3. Project name + district (if provided)

        Args:
            project_name: Property project name (e.g., "The Continuum")
            district: Optional district code (e.g., "D15")

        Returns:
            GeocodingResult if successful, None otherwise
        """
        if not project_name or not project_name.strip():
            return None

        # Clean project name
        clean_name = project_name.strip()

        # Strategy 1: Project name as-is
        result = self.geocode(clean_name)
        if result:
            return result

        # Strategy 2: Project name + "Singapore" (helps with disambiguation)
        result = self.geocode(f"{clean_name} Singapore")
        if result:
            return result

        # Strategy 3: Project name + district
        if district:
            district_name = self._get_district_name(district)
            if district_name:
                result = self.geocode(f"{clean_name} {district_name}")
                if result:
                    return result

        return None

    def geocode_postal_code(self, postal_code: str) -> Optional[GeocodingResult]:
        """
        Geocode a postal code.

        Args:
            postal_code: Singapore postal code (6 digits)

        Returns:
            GeocodingResult if successful, None otherwise
        """
        if not postal_code or not postal_code.strip():
            return None

        # Clean postal code
        clean_postal = postal_code.strip().replace(' ', '')

        result = self.geocode(clean_postal)
        if result:
            result.source = 'onemap_postal'
            return result

        return None

    def _get_district_name(self, district: str) -> Optional[str]:
        """Convert district code to area name for search refinement"""
        district_names = {
            'D01': 'Raffles Place Cecil',
            'D02': 'Anson Tanjong Pagar',
            'D03': 'Queenstown Tiong Bahru',
            'D04': 'Telok Blangah',
            'D05': 'Pasir Panjang Clementi',
            'D06': 'High Street Beach Road',
            'D07': 'Middle Road Golden Mile',
            'D08': 'Little India',
            'D09': 'Orchard',
            'D10': 'Ardmore Holland',
            'D11': 'Watten Novena',
            'D12': 'Balestier Toa Payoh',
            'D13': 'Macpherson Braddell',
            'D14': 'Geylang Eunos',
            'D15': 'Katong Joo Chiat Marine Parade',
            'D16': 'Bedok Upper East Coast',
            'D17': 'Changi Loyang',
            'D18': 'Tampines Pasir Ris',
            'D19': 'Serangoon Hougang Punggol',
            'D20': 'Bishan Ang Mo Kio',
            'D21': 'Upper Bukit Timah Clementi Park',
            'D22': 'Jurong',
            'D23': 'Hillview Dairy Farm Bukit Panjang',
            'D24': 'Lim Chu Kang Tengah',
            'D25': 'Kranji Woodlands',
            'D26': 'Upper Thomson',
            'D27': 'Yishun Sembawang',
            'D28': 'Seletar',
        }
        d = str(district).strip().upper()
        if not d.startswith("D"):
            d = f"D{d.zfill(2)}"
        return district_names.get(d)

    def test_connection(self) -> bool:
        """Test if OneMap API is accessible"""
        try:
            result = self._search("Raffles Place")
            return result is not None
        except Exception as e:
            print(f"OneMap API connection test failed: {e}")
            return False


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the haversine distance between two points on Earth.

    Args:
        lat1, lng1: Coordinates of first point
        lat2, lng2: Coordinates of second point

    Returns:
        Distance in meters
    """
    from math import radians, sin, cos, sqrt, atan2

    R = 6371000  # Earth's radius in meters

    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c
