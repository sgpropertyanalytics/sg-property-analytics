"""
GLS Tender Model - Government Land Sales data

Two-phase model:
- 'launched': Government intent signal (SIGNAL - leading indicator)
- 'awarded': Capital committed (FACT - confirmed supply)

Region is derived from Planning Area via geocoding, NOT from postal district.
"""
from models.database import db
from datetime import datetime


class GLSTender(db.Model):
    __tablename__ = 'gls_tenders'

    id = db.Column(db.Integer, primary_key=True)
    status = db.Column(db.String(20), nullable=False, index=True)  # 'launched' or 'awarded'
    release_id = db.Column(db.String(100), unique=True, nullable=False)  # e.g., 'pr25-66-dairy-farm-walk'
    release_url = db.Column(db.Text, nullable=False)
    release_date = db.Column(db.Date, nullable=True, index=True)  # Allow null for releases without clear dates
    tender_close_date = db.Column(db.Date)

    # Location (raw) - use Text for long location names
    location_raw = db.Column(db.Text, nullable=False)

    # Location (derived via geocoding)
    latitude = db.Column(db.Numeric(10, 7))
    longitude = db.Column(db.Numeric(10, 7))
    planning_area = db.Column(db.String(100))
    market_segment = db.Column(db.String(10), index=True)  # CCR/RCR/OCR

    # Site metrics
    site_area_sqm = db.Column(db.Numeric(12, 2))
    site_area_sqft = db.Column(db.Numeric(12, 2))  # Computed: sqm * 10.7639
    max_gfa_sqm = db.Column(db.Numeric(12, 2))
    max_gfa_sqft = db.Column(db.Numeric(12, 2))  # Computed
    plot_ratio = db.Column(db.Numeric(8, 2))  # Computed: max_gfa_sqm / site_area_sqm (increased precision)

    # Supply estimate
    estimated_units = db.Column(db.Integer)
    estimated_units_source = db.Column(db.String(50))  # 'ura_stated', 'computed'

    # Award data (null if launched)
    successful_tenderer = db.Column(db.String(255))
    tendered_price_sgd = db.Column(db.Numeric(15, 2))
    num_tenderers = db.Column(db.Integer)

    # Price metrics (PRIMARY: psf_ppr - price per sqft of GFA)
    psf_ppr = db.Column(db.Numeric(12, 2))  # Price per sqft of GFA (PRIMARY)
    psm_gfa = db.Column(db.Numeric(12, 2))  # Price per sqm of GFA
    psf_land = db.Column(db.Numeric(12, 2))  # Price per sqft of land (secondary)
    psm_land = db.Column(db.Numeric(12, 2))  # Price per sqm of land

    # Implied launch pricing (for awarded tenders)
    implied_launch_psf_low = db.Column(db.Numeric(12, 2))  # psf_ppr * 2.5
    implied_launch_psf_high = db.Column(db.Numeric(12, 2))  # psf_ppr * 3.0

    # Validation
    secondary_source_url = db.Column(db.Text)
    price_validated = db.Column(db.Boolean, default=False)
    needs_review = db.Column(db.Boolean, default=False)
    review_reason = db.Column(db.Text)

    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Add indexes for common query patterns
    __table_args__ = (
        db.Index('ix_gls_status_segment', 'status', 'market_segment'),
        db.Index('ix_gls_release_date', 'release_date'),
    )

    def to_dict(self, include_status_label=True):
        """Convert to dictionary for JSON serialization"""
        result = {
            'id': self.id,
            'status': self.status,
            'release_id': self.release_id,
            'release_url': self.release_url,
            'release_date': self.release_date.isoformat() if self.release_date else None,
            'tender_close_date': self.tender_close_date.isoformat() if self.tender_close_date else None,
            'location_raw': self.location_raw,
            'latitude': float(self.latitude) if self.latitude else None,
            'longitude': float(self.longitude) if self.longitude else None,
            'planning_area': self.planning_area,
            'market_segment': self.market_segment,
            'site_area_sqm': float(self.site_area_sqm) if self.site_area_sqm else None,
            'site_area_sqft': float(self.site_area_sqft) if self.site_area_sqft else None,
            'max_gfa_sqm': float(self.max_gfa_sqm) if self.max_gfa_sqm else None,
            'max_gfa_sqft': float(self.max_gfa_sqft) if self.max_gfa_sqft else None,
            'plot_ratio': float(self.plot_ratio) if self.plot_ratio else None,
            'estimated_units': self.estimated_units,
            'estimated_units_source': self.estimated_units_source,
            'successful_tenderer': self.successful_tenderer,
            'tendered_price_sgd': float(self.tendered_price_sgd) if self.tendered_price_sgd else None,
            'num_tenderers': self.num_tenderers,
            'psf_ppr': float(self.psf_ppr) if self.psf_ppr else None,
            'psm_gfa': float(self.psm_gfa) if self.psm_gfa else None,
            'psf_land': float(self.psf_land) if self.psf_land else None,
            'psm_land': float(self.psm_land) if self.psm_land else None,
            'implied_launch_psf_low': float(self.implied_launch_psf_low) if self.implied_launch_psf_low else None,
            'implied_launch_psf_high': float(self.implied_launch_psf_high) if self.implied_launch_psf_high else None,
            'secondary_source_url': self.secondary_source_url,
            'price_validated': self.price_validated,
            'needs_review': self.needs_review,
            'review_reason': self.review_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

        if include_status_label:
            # Add human-readable status labels
            if self.status == 'launched':
                result['status_label'] = 'SIGNAL'
                result['status_description'] = 'Upcoming tender - not confirmed supply'
            elif self.status == 'awarded':
                result['status_label'] = 'FACT'
                result['status_description'] = 'Confirmed supply - capital committed'

        return result

    @staticmethod
    def compute_derived_fields(tender):
        """Compute derived fields from raw data"""
        SQM_TO_SQFT = 10.7639

        # Compute sqft from sqm
        if tender.site_area_sqm:
            tender.site_area_sqft = float(tender.site_area_sqm) * SQM_TO_SQFT

        if tender.max_gfa_sqm:
            tender.max_gfa_sqft = float(tender.max_gfa_sqm) * SQM_TO_SQFT

        # Compute plot ratio
        if tender.site_area_sqm and tender.max_gfa_sqm and float(tender.site_area_sqm) > 0:
            tender.plot_ratio = float(tender.max_gfa_sqm) / float(tender.site_area_sqm)

        # =============================================================================
        # PSF (PPR) COMPUTATION - Priority-based (no mutation of raw fields)
        # =============================================================================
        # Priority order:
        # 1. PRIMARY: Use psm_gfa directly (URA published $/sqm of GFA)
        # 2. FALLBACK: Compute from tendered_price / max_gfa
        #
        # URA tables show: "$294,889,000 ($9,729.42)"
        # The $9,729.42 is $/sqm of GFA - the cleanest PSF input
        # PSF = psm_gfa / 10.7639
        #
        # IMPORTANT: Never mutate raw scraped fields (tendered_price_sgd, psm_gfa)
        # Raw = scraped, Derived = computed (psf_ppr, psf_land, etc.)

        tender.psf_ppr = None  # Reset before computing

        try:
            # =============================================
            # 1️⃣ PRIMARY: URA's published $/sqm of GFA
            # =============================================
            if tender.psm_gfa:
                psf = float(tender.psm_gfa) / SQM_TO_SQFT

                if 500 <= psf <= 3500:
                    tender.psf_ppr = round(psf, 2)
                else:
                    tender.needs_review = True
                    tender.review_reason = f"PSF ${psf:.0f} from psm_gfa outside valid range (500-3500)"

            # =============================================
            # 2️⃣ FALLBACK: Compute from lump sum ÷ max GFA
            # =============================================
            # Only if: price exists, GFA exists, price > $1M (real lump sum, not per-sqm)
            elif tender.tendered_price_sgd and tender.max_gfa_sqm:
                price = float(tender.tendered_price_sgd)
                max_gfa_sqft = float(tender.max_gfa_sqm) * SQM_TO_SQFT

                # Sanity: GLS lump sums are always > $1M
                if price >= 1_000_000 and max_gfa_sqft > 0:
                    psf = price / max_gfa_sqft

                    if 500 <= psf <= 3500:
                        tender.psf_ppr = round(psf, 2)
                    else:
                        tender.needs_review = True
                        tender.review_reason = f"Computed PSF ${psf:.0f} outside valid range (500-3500)"
                elif price < 1_000_000:
                    # Price looks like per-sqm, not lump sum - flag for review
                    tender.needs_review = True
                    tender.review_reason = f"Price ${price:,.0f} looks like per-sqm (expected lump sum > $1M)"

        except Exception as e:
            tender.psf_ppr = None
            tender.needs_review = True
            tender.review_reason = f"PSF computation error: {e}"

        # Implied launch pricing (for awarded) - only if PSF is valid
        if tender.psf_ppr and 500 <= float(tender.psf_ppr) <= 3500:
            tender.implied_launch_psf_low = float(tender.psf_ppr) * 2.5
            tender.implied_launch_psf_high = float(tender.psf_ppr) * 3.0

        if tender.tendered_price_sgd and tender.site_area_sqm:
            site_area_sqft = float(tender.site_area_sqm) * SQM_TO_SQFT
            if site_area_sqft > 0:
                tender.psf_land = float(tender.tendered_price_sgd) / site_area_sqft
                tender.psm_land = float(tender.tendered_price_sgd) / float(tender.site_area_sqm)

        # Compute estimated units if not stated
        if not tender.estimated_units and tender.max_gfa_sqm:
            # Average 100 sqm per unit
            computed_units = int(float(tender.max_gfa_sqm) / 100)
            # SANITY CHECK: Cap at 5000 units (largest SG condo is ~3000 units)
            # If computed units > 5000, the GFA was likely parsed incorrectly
            if computed_units <= 5000:
                tender.estimated_units = computed_units
                tender.estimated_units_source = 'computed'
            else:
                # Don't set estimated_units if it's unreasonable
                tender.estimated_units = None
                tender.estimated_units_source = None

        # Additional sanity check: if estimated_units is set but too high, clear it
        if tender.estimated_units and tender.estimated_units > 5000:
            tender.estimated_units = None
            tender.estimated_units_source = None

        return tender
