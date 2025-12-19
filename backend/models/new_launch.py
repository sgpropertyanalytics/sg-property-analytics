"""
New Launch Model - 2026 Private Condo Launches

Stores data from multiple sources (EdgeProp, PropNex, ERA) with cross-validation.
Links to GLS tender data for land bid prices.

Field naming conventions follow existing models:
- project_name, district, tenure (from Transaction)
- market_segment, planning_area, needs_review (from GLSTender)
"""
from models.database import db
from datetime import datetime
from typing import Optional, Dict, Any


class NewLaunch(db.Model):
    __tablename__ = 'new_launches'

    id = db.Column(db.Integer, primary_key=True)

    # ==========================================================================
    # PROJECT IDENTIFICATION (aligned with Transaction/GLSTender patterns)
    # ==========================================================================
    project_name = db.Column(db.String(255), unique=True, nullable=False, index=True)
    developer = db.Column(db.String(255), index=True)  # Like successful_tenderer in GLSTender

    # Location (aligned with existing patterns)
    district = db.Column(db.String(10), index=True)  # D01-D28, like Transaction
    planning_area = db.Column(db.String(100), index=True)  # Like GLSTender
    market_segment = db.Column(db.String(10), index=True)  # CCR/RCR/OCR, like GLSTender
    address = db.Column(db.Text)  # Full street address if available

    # ==========================================================================
    # SUPPLY DATA
    # ==========================================================================
    total_units = db.Column(db.Integer)  # Analogous to estimated_units in GLSTender
    total_units_source = db.Column(db.String(50))  # 'edgeprop', 'propnex', 'era', 'average'

    # Unit breakdown by bedroom (if available)
    units_1br = db.Column(db.Integer)
    units_2br = db.Column(db.Integer)
    units_3br = db.Column(db.Integer)
    units_4br = db.Column(db.Integer)
    units_5br_plus = db.Column(db.Integer)

    # ==========================================================================
    # PRICING DATA (similar to implied_launch_psf in GLSTender)
    # ==========================================================================
    indicative_psf_low = db.Column(db.Numeric(12, 2))  # Indicative $/sqft range low
    indicative_psf_high = db.Column(db.Numeric(12, 2))  # Indicative $/sqft range high
    indicative_psf_source = db.Column(db.String(50))  # 'edgeprop', 'propnex', 'era', 'average'

    # Pricing from individual sources (for cross-validation)
    edgeprop_psf_low = db.Column(db.Numeric(12, 2))
    edgeprop_psf_high = db.Column(db.Numeric(12, 2))
    propnex_psf_low = db.Column(db.Numeric(12, 2))
    propnex_psf_high = db.Column(db.Numeric(12, 2))
    era_psf_low = db.Column(db.Numeric(12, 2))
    era_psf_high = db.Column(db.Numeric(12, 2))

    # ==========================================================================
    # PROJECT DETAILS
    # ==========================================================================
    tenure = db.Column(db.String(50))  # 'Freehold', '99-year', '999-year', like Transaction
    expected_launch_date = db.Column(db.Date)  # When expected to launch
    expected_top_date = db.Column(db.Date)  # Expected TOP date
    launch_year = db.Column(db.Integer, index=True)  # 2026, for filtering

    property_type = db.Column(db.String(50), default='Condominium')  # Like Transaction
    site_area_sqft = db.Column(db.Numeric(12, 2))

    # ==========================================================================
    # GLS TENDER LINKING (for land bid prices)
    # ==========================================================================
    gls_tender_id = db.Column(db.Integer, db.ForeignKey('gls_tenders.id'), nullable=True)
    gls_tender = db.relationship('GLSTender', backref='new_launches')

    # Derived from linked GLS tender
    land_bid_psf = db.Column(db.Numeric(12, 2))  # psf_ppr from GLS tender

    # ==========================================================================
    # SOURCE TRACKING & VALIDATION
    # ==========================================================================
    # JSON field storing URLs from each source
    # Format: {"edgeprop": "url", "propnex": "url", "era": "url"}
    source_urls = db.Column(db.JSON, default=dict)

    # Cross-validation status
    needs_review = db.Column(db.Boolean, default=False, index=True)
    review_reason = db.Column(db.Text)

    # Validation timestamps
    last_scraped = db.Column(db.DateTime, default=datetime.utcnow)
    last_validated = db.Column(db.DateTime)  # For bi-weekly validation job

    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ==========================================================================
    # INDEXES
    # ==========================================================================
    __table_args__ = (
        db.Index('ix_new_launches_segment_year', 'market_segment', 'launch_year'),
        db.Index('ix_new_launches_district_year', 'district', 'launch_year'),
        db.Index('ix_new_launches_review', 'needs_review'),
    )

    def to_dict(self, include_sources: bool = True) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        result = {
            'id': self.id,
            'project_name': self.project_name,
            'developer': self.developer,
            'district': self.district,
            'planning_area': self.planning_area,
            'market_segment': self.market_segment,
            'address': self.address,
            'total_units': self.total_units,
            'total_units_source': self.total_units_source,
            'units_breakdown': {
                '1br': self.units_1br,
                '2br': self.units_2br,
                '3br': self.units_3br,
                '4br': self.units_4br,
                '5br_plus': self.units_5br_plus,
            } if any([self.units_1br, self.units_2br, self.units_3br,
                      self.units_4br, self.units_5br_plus]) else None,
            'indicative_psf_low': float(self.indicative_psf_low) if self.indicative_psf_low else None,
            'indicative_psf_high': float(self.indicative_psf_high) if self.indicative_psf_high else None,
            'indicative_psf_source': self.indicative_psf_source,
            'tenure': self.tenure,
            'expected_launch_date': self.expected_launch_date.isoformat() if self.expected_launch_date else None,
            'expected_top_date': self.expected_top_date.isoformat() if self.expected_top_date else None,
            'launch_year': self.launch_year,
            'property_type': self.property_type,
            'site_area_sqft': float(self.site_area_sqft) if self.site_area_sqft else None,
            'gls_tender_id': self.gls_tender_id,
            'land_bid_psf': float(self.land_bid_psf) if self.land_bid_psf else None,
            'needs_review': self.needs_review,
            'review_reason': self.review_reason,
            'last_validated': self.last_validated.isoformat() if self.last_validated else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

        if include_sources:
            result['source_urls'] = self.source_urls or {}
            result['source_prices'] = {
                'edgeprop': {
                    'psf_low': float(self.edgeprop_psf_low) if self.edgeprop_psf_low else None,
                    'psf_high': float(self.edgeprop_psf_high) if self.edgeprop_psf_high else None,
                },
                'propnex': {
                    'psf_low': float(self.propnex_psf_low) if self.propnex_psf_low else None,
                    'psf_high': float(self.propnex_psf_high) if self.propnex_psf_high else None,
                },
                'era': {
                    'psf_low': float(self.era_psf_low) if self.era_psf_low else None,
                    'psf_high': float(self.era_psf_high) if self.era_psf_high else None,
                },
            }

        return result

    @staticmethod
    def cross_validate_sources(
        edgeprop_data: Optional[Dict] = None,
        propnex_data: Optional[Dict] = None,
        era_data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Cross-validate data from multiple sources.

        Returns dict with:
        - consensus values (if 2/3 agree)
        - needs_review flag
        - review_reason

        Tolerance levels:
        - total_units: +/- 5 units
        - indicative_psf: +/- $50
        - developer: Exact match required
        """
        result = {
            'total_units': None,
            'total_units_source': None,
            'indicative_psf_low': None,
            'indicative_psf_high': None,
            'indicative_psf_source': None,
            'developer': None,
            'needs_review': False,
            'review_reason': None,
        }

        sources = []
        if edgeprop_data:
            sources.append(('edgeprop', edgeprop_data))
        if propnex_data:
            sources.append(('propnex', propnex_data))
        if era_data:
            sources.append(('era', era_data))

        if len(sources) == 0:
            result['needs_review'] = True
            result['review_reason'] = 'No source data available'
            return result

        if len(sources) == 1:
            # Single source - use it but flag for review
            source_name, data = sources[0]
            result['total_units'] = data.get('total_units')
            result['total_units_source'] = source_name
            result['indicative_psf_low'] = data.get('psf_low')
            result['indicative_psf_high'] = data.get('psf_high')
            result['indicative_psf_source'] = source_name
            result['developer'] = data.get('developer')
            result['needs_review'] = True
            result['review_reason'] = f'Only single source ({source_name}) available'
            return result

        review_reasons = []

        # =======================================================================
        # VALIDATE TOTAL UNITS (+/- 5 tolerance)
        # =======================================================================
        units_values = [(name, data.get('total_units'))
                        for name, data in sources if data.get('total_units')]

        if len(units_values) >= 2:
            # Check if values are within tolerance
            values = [v for _, v in units_values]
            if max(values) - min(values) <= 5:
                # Consensus - use average
                result['total_units'] = int(sum(values) / len(values))
                result['total_units_source'] = 'consensus'
            else:
                # Discrepancy - flag for review, use most trusted source (EdgeProp first)
                for source_priority in ['edgeprop', 'propnex', 'era']:
                    for name, val in units_values:
                        if name == source_priority:
                            result['total_units'] = val
                            result['total_units_source'] = name
                            break
                    if result['total_units']:
                        break
                review_reasons.append(
                    f"Unit count discrepancy: {', '.join(f'{n}={v}' for n, v in units_values)}"
                )
        elif len(units_values) == 1:
            result['total_units'] = units_values[0][1]
            result['total_units_source'] = units_values[0][0]

        # =======================================================================
        # VALIDATE PSF (+/- $50 tolerance)
        # =======================================================================
        psf_values = []
        for name, data in sources:
            if data.get('psf_low') or data.get('psf_high'):
                psf_values.append((
                    name,
                    data.get('psf_low'),
                    data.get('psf_high')
                ))

        if len(psf_values) >= 2:
            # Check low values
            low_vals = [v[1] for v in psf_values if v[1]]
            high_vals = [v[2] for v in psf_values if v[2]]

            low_within_tolerance = max(low_vals) - min(low_vals) <= 50 if low_vals else True
            high_within_tolerance = max(high_vals) - min(high_vals) <= 50 if high_vals else True

            if low_within_tolerance and high_within_tolerance:
                # Consensus - use average
                result['indicative_psf_low'] = sum(low_vals) / len(low_vals) if low_vals else None
                result['indicative_psf_high'] = sum(high_vals) / len(high_vals) if high_vals else None
                result['indicative_psf_source'] = 'consensus'
            else:
                # Discrepancy - use average but note range
                result['indicative_psf_low'] = sum(low_vals) / len(low_vals) if low_vals else None
                result['indicative_psf_high'] = sum(high_vals) / len(high_vals) if high_vals else None
                result['indicative_psf_source'] = 'average'
                review_reasons.append(
                    f"PSF discrepancy: {', '.join(f'{n}=${l}-${h}' for n, l, h in psf_values)}"
                )
        elif len(psf_values) == 1:
            result['indicative_psf_low'] = psf_values[0][1]
            result['indicative_psf_high'] = psf_values[0][2]
            result['indicative_psf_source'] = psf_values[0][0]

        # =======================================================================
        # VALIDATE DEVELOPER (exact match required)
        # =======================================================================
        developer_values = [(name, data.get('developer'))
                            for name, data in sources if data.get('developer')]

        if developer_values:
            # Normalize for comparison
            normalized = [(name, dev.lower().strip()) for name, dev in developer_values]
            unique_devs = set(d for _, d in normalized)

            if len(unique_devs) == 1:
                # Consensus
                result['developer'] = developer_values[0][1]
            else:
                # Discrepancy - flag immediately, use EdgeProp
                for source_priority in ['edgeprop', 'propnex', 'era']:
                    for name, dev in developer_values:
                        if name == source_priority:
                            result['developer'] = dev
                            break
                    if result['developer']:
                        break
                review_reasons.append(
                    f"Developer mismatch: {', '.join(f'{n}={d}' for n, d in developer_values)}"
                )

        # =======================================================================
        # SET REVIEW FLAG
        # =======================================================================
        if review_reasons:
            result['needs_review'] = True
            result['review_reason'] = '; '.join(review_reasons)

        return result

    @staticmethod
    def link_to_gls_tender(project_name: str, developer: str, planning_area: str,
                           db_session) -> Optional[int]:
        """
        Find matching GLS tender by location + developer.

        Returns gls_tender_id if found, None otherwise.
        """
        from models.gls_tender import GLSTender

        if not planning_area and not developer:
            return None

        # Try to find matching GLS tender
        query = db_session.query(GLSTender).filter(
            GLSTender.status == 'awarded'
        )

        if planning_area:
            query = query.filter(GLSTender.planning_area == planning_area)

        if developer:
            # Fuzzy match on developer name
            query = query.filter(
                GLSTender.successful_tenderer.ilike(f'%{developer.split()[0]}%')
            )

        tender = query.first()
        return tender.id if tender else None

    def __repr__(self):
        return f"<NewLaunch {self.project_name} ({self.launch_year})>"
