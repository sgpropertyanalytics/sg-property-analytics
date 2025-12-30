"""
EdgeProp Verification Adapter - Extracts project data for cross-validation.

EdgeProp is a Tier B source with detailed property analytics:
- Total units
- Developer
- Tenure
- District
- Transaction count
- PSF data

EdgeProp provides good historical transaction data alongside new launch info.
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


class EdgePropVerificationAdapter(BaseVerificationAdapter):
    """
    Verification adapter for EdgeProp property data.

    EdgeProp provides comprehensive property information including
    transaction history and project details.
    """

    SOURCE_DOMAIN = "edgeprop.sg"
    SOURCE_NAME = "EdgeProp"
    SOURCE_TIER = SourceTier.B

    SUPPORTED_FIELDS = [
        "total_units",
        "developer",
        "tenure",
        "district",
        "address",
        "transaction_count",
    ]

    # Base URLs
    SEARCH_URL = "https://www.edgeprop.sg/search?q={query}&type=project"
    PROJECT_URL = "https://www.edgeprop.sg/project/{slug}"

    def verify_project(self, project_name: str) -> VerificationResult:
        """
        Verify data for a single project.

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

            if match_score < 0.6:
                return VerificationResult.not_found(
                    project_name=project_name,
                    source_domain=self.SOURCE_DOMAIN,
                )

            # Fetch project details
            project_url = self._get_project_url(best_match)
            html = self.fetch_page(project_url)
            data = self._parse_project_page(html)

            # Determine confidence
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
            import urllib.parse
            query = urllib.parse.quote(project_name)
            search_url = self.SEARCH_URL.format(query=query)

            html = self.fetch_page(search_url)
            soup = BeautifulSoup(html, "html.parser")

            matches = []

            # Find project results
            project_links = soup.select(
                ".search-result-item, .project-card, [data-project-name]"
            )

            for item in project_links:
                name_elem = item.select_one(
                    ".project-name, h3, .title, [data-project-name]"
                )
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
        """Get the project detail page URL."""
        slug = re.sub(r"[^a-z0-9]+", "-", project_name.lower()).strip("-")
        return self.PROJECT_URL.format(slug=slug)

    def _parse_project_page(self, html: str) -> dict:
        """Parse project page and extract verification data."""
        soup = BeautifulSoup(html, "html.parser")
        data = {}

        # Extract total units
        units_elem = soup.select_one(
            ".total-units, [data-stat='units'], .project-units"
        )
        if units_elem:
            text = units_elem.get_text(strip=True)
            match = re.search(r"(\d[\d,]*)", text)
            if match:
                data["total_units"] = int(match.group(1).replace(",", ""))

        # Extract developer
        dev_elem = soup.select_one(".developer, .developer-name")
        if dev_elem:
            data["developer"] = dev_elem.get_text(strip=True)

        # Extract tenure
        tenure_elem = soup.select_one(".tenure, .lease-type")
        if tenure_elem:
            text = tenure_elem.get_text(strip=True).lower()
            if "freehold" in text:
                data["tenure"] = "Freehold"
            elif "999" in text:
                data["tenure"] = "999-year"
            elif "99" in text:
                data["tenure"] = "99-year"

        # Extract district
        district_elem = soup.select_one(".district, .location")
        if district_elem:
            text = district_elem.get_text()
            match = re.search(r"D(\d{1,2})", text, re.IGNORECASE)
            if match:
                data["district"] = f"D{match.group(1).zfill(2)}"

        # Extract address
        address_elem = soup.select_one(".address, .project-address")
        if address_elem:
            data["address"] = address_elem.get_text(strip=True)

        return data
