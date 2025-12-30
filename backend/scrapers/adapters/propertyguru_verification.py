"""
PropertyGuru Verification Adapter - Extracts project data for cross-validation.

PropertyGuru is a Tier B source with comprehensive new launch data:
- Total units
- Developer
- Tenure
- District
- Launch status
- Indicative PSF range

Search endpoint: https://www.propertyguru.com.sg/new-property-launch
Project detail pages contain structured data.
"""
import re
from typing import List, Optional, Tuple
from bs4 import BeautifulSoup

from .verification_base import (
    BaseVerificationAdapter,
    VerificationResult,
    VerificationConfidence,
)
from ..tier_system import SourceTier


class PropertyGuruVerificationAdapter(BaseVerificationAdapter):
    """
    Verification adapter for PropertyGuru new launch data.

    PropertyGuru provides comprehensive new launch condo information
    including unit counts, pricing, and developer details.
    """

    SOURCE_DOMAIN = "propertyguru.com.sg"
    SOURCE_NAME = "PropertyGuru"
    SOURCE_TIER = SourceTier.B

    SUPPORTED_FIELDS = [
        "total_units",
        "developer",
        "tenure",
        "district",
        "indicative_psf_low",
        "indicative_psf_high",
        "launch_status",
        "address",
    ]

    # Base URLs
    SEARCH_URL = "https://www.propertyguru.com.sg/property-for-sale?market=residential&newProject=true&search=true&freetext={query}"
    NEW_LAUNCH_URL = "https://www.propertyguru.com.sg/new-property-launch"

    def verify_project(self, project_name: str) -> VerificationResult:
        """
        Verify data for a single project.

        Strategy:
        1. Search for the project name
        2. Find best matching result
        3. Extract details from project page

        Args:
            project_name: Project name to look up

        Returns:
            VerificationResult with extracted data
        """
        try:
            # Search for the project
            search_results = self.search_project(project_name)

            if not search_results:
                return VerificationResult.not_found(
                    project_name=project_name,
                    source_domain=self.SOURCE_DOMAIN,
                )

            # Get best match
            best_match, match_score = search_results[0]

            # If match score is too low, treat as not found
            if match_score < 0.6:
                return VerificationResult.not_found(
                    project_name=project_name,
                    source_domain=self.SOURCE_DOMAIN,
                )

            # Fetch project details
            project_url = self._get_project_url(best_match)
            if not project_url:
                return VerificationResult.not_found(
                    project_name=project_name,
                    source_domain=self.SOURCE_DOMAIN,
                )

            html = self.fetch_page(project_url)
            data = self._parse_project_page(html, project_name)

            # Determine confidence based on match score
            if match_score >= 0.95:
                confidence = VerificationConfidence.HIGH
            elif match_score >= 0.8:
                confidence = VerificationConfidence.MEDIUM
            else:
                confidence = VerificationConfidence.LOW

            return VerificationResult(
                project_name=project_name,
                source_domain=self.SOURCE_DOMAIN,
                source_url=project_url,
                found=bool(data),
                data=data,
                confidence=confidence,
                match_score=match_score,
            )

        except Exception as e:
            return VerificationResult.error_result(
                project_name=project_name,
                source_domain=self.SOURCE_DOMAIN,
                error=str(e),
            )

    def search_project(self, project_name: str) -> List[Tuple[str, float]]:
        """
        Search for a project and return potential matches.

        Args:
            project_name: Project name to search for

        Returns:
            List of (matched_name, match_score) tuples
        """
        try:
            # URL encode the query
            import urllib.parse
            query = urllib.parse.quote(project_name)
            search_url = self.SEARCH_URL.format(query=query)

            html = self.fetch_page(search_url)
            soup = BeautifulSoup(html, "html.parser")

            matches = []

            # Find project cards in search results
            # PropertyGuru uses various listing card formats
            project_cards = soup.select(
                "[data-listing-id], .listing-card, .project-card"
            )

            for card in project_cards:
                # Try to extract project name from card
                name_elem = card.select_one(
                    "h3, .listing-title, .project-name, [itemprop='name']"
                )
                if name_elem:
                    found_name = name_elem.get_text(strip=True)
                    score = self.compute_match_score(project_name, found_name)
                    if score > 0.5:
                        matches.append((found_name, score))

            # Sort by match score descending
            matches.sort(key=lambda x: x[1], reverse=True)
            return matches[:5]  # Return top 5 matches

        except Exception:
            return []

    def _get_project_url(self, project_name: str) -> Optional[str]:
        """
        Get the project detail page URL.

        Args:
            project_name: Project name

        Returns:
            URL string or None
        """
        # Construct slug from project name
        slug = re.sub(r"[^a-z0-9]+", "-", project_name.lower()).strip("-")
        return f"https://www.propertyguru.com.sg/new-project/{slug}"

    def _parse_project_page(self, html: str, project_name: str) -> dict:
        """
        Parse a project detail page and extract verification data.

        Args:
            html: Raw HTML content
            project_name: Project name for context

        Returns:
            Dict of extracted field values
        """
        soup = BeautifulSoup(html, "html.parser")
        data = {}

        # Extract total units
        units = self._extract_units(soup)
        if units:
            data["total_units"] = units

        # Extract developer
        developer = self._extract_developer(soup)
        if developer:
            data["developer"] = developer

        # Extract tenure
        tenure = self._extract_tenure(soup)
        if tenure:
            data["tenure"] = tenure

        # Extract district
        district = self._extract_district(soup)
        if district:
            data["district"] = district

        # Extract pricing
        psf_low, psf_high = self._extract_pricing(soup)
        if psf_low:
            data["indicative_psf_low"] = psf_low
        if psf_high:
            data["indicative_psf_high"] = psf_high

        # Extract address
        address = self._extract_address(soup)
        if address:
            data["address"] = address

        return data

    def _extract_units(self, soup: BeautifulSoup) -> Optional[int]:
        """Extract total units from page."""
        # Try various selectors
        selectors = [
            "[data-automation='project-total-units']",
            ".project-total-units",
            ".units-count",
        ]

        for selector in selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True)
                # Extract number from text like "1,040 units"
                match = re.search(r"(\d[\d,]*)", text)
                if match:
                    return int(match.group(1).replace(",", ""))

        # Try finding in structured data
        script_tags = soup.select("script[type='application/ld+json']")
        for script in script_tags:
            try:
                import json
                data = json.loads(script.string)
                if isinstance(data, dict):
                    units = data.get("numberOfUnits") or data.get("totalUnits")
                    if units:
                        return int(units)
            except (json.JSONDecodeError, ValueError):
                pass

        # Try finding in description text
        desc = soup.select_one(".project-description, .description")
        if desc:
            text = desc.get_text()
            match = re.search(r"(\d[\d,]*)\s*units", text, re.IGNORECASE)
            if match:
                return int(match.group(1).replace(",", ""))

        return None

    def _extract_developer(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract developer name from page."""
        selectors = [
            "[data-automation='project-developer']",
            ".developer-name",
            "[itemprop='developer']",
            ".project-developer",
        ]

        for selector in selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True)
                # Clean up "By Developer Name" format
                text = re.sub(r"^(by|developed by)\s+", "", text, flags=re.IGNORECASE)
                if text:
                    return text

        return None

    def _extract_tenure(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract tenure from page."""
        selectors = [
            "[data-automation='project-tenure']",
            ".tenure",
            ".leasehold-info",
        ]

        for selector in selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True).lower()
                if "freehold" in text:
                    return "Freehold"
                elif "999" in text:
                    return "999-year"
                elif "99" in text:
                    return "99-year"
                elif "lease" in text:
                    return "Leasehold"

        return None

    def _extract_district(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract district from page."""
        selectors = [
            "[data-automation='project-district']",
            ".district",
            ".location-district",
        ]

        for selector in selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True)
                # Extract D## format
                match = re.search(r"D(\d{1,2})", text, re.IGNORECASE)
                if match:
                    return f"D{match.group(1).zfill(2)}"

        # Try finding in address
        address_elem = soup.select_one(".address, [itemprop='address']")
        if address_elem:
            text = address_elem.get_text()
            match = re.search(r"District\s*(\d{1,2})", text, re.IGNORECASE)
            if match:
                return f"D{match.group(1).zfill(2)}"

        return None

    def _extract_pricing(self, soup: BeautifulSoup) -> Tuple[Optional[float], Optional[float]]:
        """Extract PSF pricing range from page."""
        psf_low = None
        psf_high = None

        # Look for PSF range
        psf_elem = soup.select_one(
            "[data-automation='project-psf'], .psf-range, .price-psf"
        )
        if psf_elem:
            text = psf_elem.get_text(strip=True)
            # Parse "$X,XXX - $Y,YYY psf" format
            matches = re.findall(r"\$?([\d,]+)", text)
            if len(matches) >= 2:
                psf_low = float(matches[0].replace(",", ""))
                psf_high = float(matches[1].replace(",", ""))
            elif len(matches) == 1:
                psf_low = psf_high = float(matches[0].replace(",", ""))

        return psf_low, psf_high

    def _extract_address(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract address from page."""
        selectors = [
            "[itemprop='address']",
            ".project-address",
            ".address",
            "[data-automation='project-address']",
        ]

        for selector in selectors:
            elem = soup.select_one(selector)
            if elem:
                text = elem.get_text(strip=True)
                if text:
                    return text

        return None
