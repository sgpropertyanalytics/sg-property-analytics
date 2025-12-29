"""
GLS Tender Promoter - Projects canonical GLS entities to gls_tenders table.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

from .base import BasePromoter

logger = logging.getLogger(__name__)


class GLSTenderPromoter(BasePromoter):
    """Projects canonical_entities(gls_tender) -> gls_tenders"""

    ENTITY_TYPE = "gls_tender"
    TARGET_TABLE = "gls_tenders"

    def project_to_domain(self, canonical) -> Optional[Any]:
        """Project canonical to gls_tenders table."""
        from models.gls_tender import GLSTender

        if canonical.entity_type != self.ENTITY_TYPE:
            logger.warning(
                f"Wrong entity type: {canonical.entity_type} != {self.ENTITY_TYPE}"
            )
            return None

        # Map fields
        mapped = self.map_fields(canonical.canonical)

        # Check if exists
        existing = self.db_session.query(GLSTender).filter_by(
            release_id=canonical.entity_key
        ).first()

        if existing:
            # Update existing
            for field, value in mapped.items():
                if value is not None:
                    setattr(existing, field, value)

            # Compute derived fields
            self._compute_derived_fields(existing)
            logger.debug(f"Updated GLS tender: {canonical.entity_key}")
            return existing
        else:
            # Create new
            tender = GLSTender(**mapped)
            self._compute_derived_fields(tender)
            self.db_session.add(tender)
            logger.debug(f"Created GLS tender: {canonical.entity_key}")
            return tender

    def map_fields(self, canonical_data: Dict[str, Any]) -> Dict[str, Any]:
        """Map canonical fields to GLSTender fields."""
        return {
            "release_id": canonical_data.get("release_id"),
            "status": canonical_data.get("status", "launched"),
            "release_url": canonical_data.get("release_url") or canonical_data.get("source_url"),
            "release_date": self._parse_date(canonical_data.get("release_date")),
            "tender_close_date": self._parse_date(canonical_data.get("tender_close_date")),
            "location_raw": canonical_data.get("location_raw"),
            "latitude": self._to_decimal(canonical_data.get("latitude")),
            "longitude": self._to_decimal(canonical_data.get("longitude")),
            "postal_code": canonical_data.get("postal_code"),
            "postal_district": canonical_data.get("postal_district"),
            "planning_area": canonical_data.get("planning_area"),
            "market_segment": canonical_data.get("market_segment"),
            "site_area_sqm": self._to_decimal(canonical_data.get("site_area_sqm")),
            "max_gfa_sqm": self._to_decimal(canonical_data.get("max_gfa_sqm")),
            "estimated_units": canonical_data.get("estimated_units"),
            "estimated_units_source": canonical_data.get("estimated_units_source"),
            "successful_tenderer": canonical_data.get("successful_tenderer"),
            "tendered_price_sgd": self._to_decimal(canonical_data.get("tendered_price_sgd")),
            "num_tenderers": canonical_data.get("num_tenderers"),
            "needs_review": canonical_data.get("needs_review", False),
            "review_reason": canonical_data.get("review_reason"),
        }

    def _parse_date(self, value) -> Optional[datetime]:
        """Parse date from various formats."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value).date()
            except ValueError:
                try:
                    return datetime.strptime(value, "%Y-%m-%d").date()
                except ValueError:
                    return None
        return None

    def _to_decimal(self, value) -> Optional[Decimal]:
        """Convert value to Decimal."""
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (ValueError, TypeError):
            return None

    def _compute_derived_fields(self, tender):
        """Compute derived fields on the tender."""
        SQM_TO_SQFT = Decimal("10.7639")

        # Site area sqft
        if tender.site_area_sqm:
            tender.site_area_sqft = tender.site_area_sqm * SQM_TO_SQFT

        # Max GFA sqft
        if tender.max_gfa_sqm:
            tender.max_gfa_sqft = tender.max_gfa_sqm * SQM_TO_SQFT

        # Plot ratio
        if tender.site_area_sqm and tender.max_gfa_sqm and tender.site_area_sqm > 0:
            tender.plot_ratio = tender.max_gfa_sqm / tender.site_area_sqm

        # Price metrics (if awarded)
        if tender.tendered_price_sgd:
            if tender.max_gfa_sqm and tender.max_gfa_sqm > 0:
                tender.psm_gfa = tender.tendered_price_sgd / tender.max_gfa_sqm
                if tender.max_gfa_sqft and tender.max_gfa_sqft > 0:
                    tender.psf_ppr = tender.tendered_price_sgd / tender.max_gfa_sqft

            if tender.site_area_sqm and tender.site_area_sqm > 0:
                tender.psm_land = tender.tendered_price_sgd / tender.site_area_sqm
                if tender.site_area_sqft and tender.site_area_sqft > 0:
                    tender.psf_land = tender.tendered_price_sgd / tender.site_area_sqft

            # Implied launch pricing
            if tender.psf_ppr:
                tender.implied_launch_psf_low = tender.psf_ppr * Decimal("2.5")
                tender.implied_launch_psf_high = tender.psf_ppr * Decimal("3.0")
