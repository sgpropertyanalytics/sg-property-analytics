"""
99.co Verification Adapter - Extracts project data for cross-validation.

99.co is a Tier B source with new launch listings:
- Total units
- Developer
- Tenure
- District
- Availability status
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


class NinetyNineVerificationAdapter(BaseVerificationAdapter):
    """
    Verification adapter for 99.co property data.
    """

    SOURCE_DOMAIN = "99.co"
    SOURCE_NAME = "99.co"
    SOURCE_TIER = SourceTier.B

    SUPPORTED_FIELDS = [
        "total_units",
        "developer",
        "tenure",
        "district",
        "address",
    ]

    SEARCH_URL = "https://www.99.co/singapore/new-launches?query={query}"
    PROJECT_URL = "https://www.99.co/singapore/new-launches/{slug}"

    def verify_project(self, project_name: str) -> VerificationResult:
        """Verify data for a single project."""
        try:
            search_results = self.search_project(project_name)

            if not search_results:
                return VerificationResult.not_found(
                    project_name=project_name,
                    source_domain=self.SOURCE_DOMAIN,
                )

            best_match, match_score = search_results[0]

            if match_score < 0.6:
                return VerificationResult.not_found(
                    project_name=project_name,
                    source_domain=self.SOURCE_DOMAIN,
                )

            project_url = self._get_project_url(best_match)
            html = self.fetch_page(project_url)
            data = self._parse_project_page(html)

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
        """Search for a project."""
        try:
            import urllib.parse
            query = urllib.parse.quote(project_name)
            search_url = self.SEARCH_URL.format(query=query)

            html = self.fetch_page(search_url)
            soup = BeautifulSoup(html, "html.parser")

            matches = []
            project_cards = soup.select(".listing-card, .project-item, [data-listing]")

            for card in project_cards:
                name_elem = card.select_one(".listing-title, h3, .project-name")
                if name_elem:
                    found_name = name_elem.get_text(strip=True)
                    score = self.compute_match_score(project_name, found_name)
                    if score > 0.5:
                        matches.append((found_name, score))

            matches.sort(key=lambda x: x[1], reverse=True)
            return matches[:5]

        except Exception:
            return []

    def _get_project_url(self, project_name: str) -> str:
        """Get project URL."""
        slug = re.sub(r"[^a-z0-9]+", "-", project_name.lower()).strip("-")
        return self.PROJECT_URL.format(slug=slug)

    def _parse_project_page(self, html: str) -> dict:
        """Parse project page."""
        soup = BeautifulSoup(html, "html.parser")
        data = {}

        # Total units
        units_elem = soup.select_one(".total-units, .units-info")
        if units_elem:
            text = units_elem.get_text(strip=True)
            match = re.search(r"(\d[\d,]*)", text)
            if match:
                data["total_units"] = int(match.group(1).replace(",", ""))

        # Developer
        dev_elem = soup.select_one(".developer, .by-developer")
        if dev_elem:
            text = dev_elem.get_text(strip=True)
            text = re.sub(r"^(by|developed by)\s+", "", text, flags=re.IGNORECASE)
            data["developer"] = text

        # Tenure
        tenure_elem = soup.select_one(".tenure, .tenure-info")
        if tenure_elem:
            text = tenure_elem.get_text(strip=True).lower()
            if "freehold" in text:
                data["tenure"] = "Freehold"
            elif "999" in text:
                data["tenure"] = "999-year"
            elif "99" in text:
                data["tenure"] = "99-year"

        # District
        location_elem = soup.select_one(".location, .district-info")
        if location_elem:
            text = location_elem.get_text()
            match = re.search(r"D(\d{1,2})", text, re.IGNORECASE)
            if match:
                data["district"] = f"D{match.group(1).zfill(2)}"

        # Address
        address_elem = soup.select_one(".address")
        if address_elem:
            data["address"] = address_elem.get_text(strip=True)

        return data
