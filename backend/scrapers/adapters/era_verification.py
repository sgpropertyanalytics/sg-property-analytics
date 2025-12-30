"""
ERA Verification Adapter - Extracts project data for cross-validation.

ERA is a Tier B real estate agency source:
- Total units
- Developer
- Launch status
- Pricing range
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


class ERAVerificationAdapter(BaseVerificationAdapter):
    """
    Verification adapter for ERA Singapore property data.
    """

    SOURCE_DOMAIN = "era.com.sg"
    SOURCE_NAME = "ERA Singapore"
    SOURCE_TIER = SourceTier.B

    SUPPORTED_FIELDS = [
        "total_units",
        "developer",
        "tenure",
        "district",
    ]

    SEARCH_URL = "https://www.era.com.sg/new-launches/?search={query}"
    PROJECT_URL = "https://www.era.com.sg/new-launches/{slug}"

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
            project_cards = soup.select(".project-card, .listing-item, article")

            for card in project_cards:
                name_elem = card.select_one("h2, h3, .project-title, .listing-title")
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
        units_elem = soup.select_one(".total-units, .units, .unit-count")
        if units_elem:
            text = units_elem.get_text(strip=True)
            match = re.search(r"(\d[\d,]*)", text)
            if match:
                data["total_units"] = int(match.group(1).replace(",", ""))

        # Developer
        dev_elem = soup.select_one(".developer, .developed-by")
        if dev_elem:
            text = dev_elem.get_text(strip=True)
            text = re.sub(r"^(by|developed by|developer:?)\s*", "", text, flags=re.IGNORECASE)
            if text:
                data["developer"] = text

        # Tenure
        tenure_elem = soup.select_one(".tenure, .lease-info")
        if tenure_elem:
            text = tenure_elem.get_text(strip=True).lower()
            if "freehold" in text:
                data["tenure"] = "Freehold"
            elif "999" in text:
                data["tenure"] = "999-year"
            elif "99" in text:
                data["tenure"] = "99-year"

        # District from location
        loc_elem = soup.select_one(".location, .address, .district")
        if loc_elem:
            text = loc_elem.get_text()
            match = re.search(r"D(\d{1,2})", text, re.IGNORECASE)
            if match:
                data["district"] = f"D{match.group(1).zfill(2)}"

        return data
