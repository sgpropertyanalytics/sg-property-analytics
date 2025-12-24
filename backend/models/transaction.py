"""
Transaction Model - Maps to CSV columns and master_transactions table

CSV Column Mapping (URA REALIS format):
  CSV Column              → DB Column           Notes
  ─────────────────────────────────────────────────────────────
  Project Name            → project_name        Required
  Street Name             → street_name         NEW: Address info
  Property Type           → property_type       e.g., "Condominium", "Apartment"
  Postal District         → district            Parsed to "D01", "D02", etc.
  Market Segment          → market_segment      NEW: URA's CCR/RCR/OCR
  Tenure                  → tenure              Original tenure text
  Type of Sale            → sale_type           "New Sale", "Resale", "Sub Sale"
  No. of Units            → num_units           NEW: Multi-unit transactions
  Nett Price ($)          → nett_price          NEW: Alternative price metric
  Transacted Price ($)    → price               Required
  Area (SQFT)             → area_sqft           Required
  Type of Area            → type_of_area        NEW: "Strata" or "Land"
  Unit Price ($ PSF)      → psf                 Required
  Sale Date               → transaction_date    Required, parsed to Date
  Floor Range             → floor_range         NEW: e.g., "01 to 05"
  (computed)              → floor_level         NEW: Classified from floor_range
  (computed)              → bedroom_count       Classified from area_sqft
  (computed)              → lease_start_year    Parsed from tenure
  (computed)              → remaining_lease     Calculated from tenure
"""
from models.database import db
from datetime import datetime
from sqlalchemy import or_


class Transaction(db.Model):
    __tablename__ = 'transactions'

    # === Primary Key ===
    id = db.Column(db.Integer, primary_key=True)

    # === Core Required Fields (existing) ===
    project_name = db.Column(db.String(255), index=True, nullable=False)
    transaction_date = db.Column(db.Date, index=True, nullable=False)
    contract_date = db.Column(db.String(10))  # MMYY format (derived)
    price = db.Column(db.Float, nullable=False)
    area_sqft = db.Column(db.Float, nullable=False)
    psf = db.Column(db.Float, nullable=False)
    district = db.Column(db.String(10), index=True, nullable=False)
    bedroom_count = db.Column(db.Integer, index=True, nullable=False)
    property_type = db.Column(db.String(100), default='Condominium')
    sale_type = db.Column(db.String(50))  # 'New Sale' or 'Resale'
    tenure = db.Column(db.Text)  # Original Tenure text for lease calculations
    lease_start_year = db.Column(db.Integer)  # Parsed from Tenure
    remaining_lease = db.Column(db.Integer)  # Calculated remaining lease years
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # === NEW: Previously Dropped CSV Columns (all nullable for backward compat) ===
    street_name = db.Column(db.Text)  # Full address from "Street Name" column
    floor_range = db.Column(db.Text)  # Raw floor range, e.g., "01 to 05"
    floor_level = db.Column(db.Text, index=True)  # Classified: Low, Mid, High, etc.
    num_units = db.Column(db.Integer)  # "No. of Units" - for new sale bulk transactions
    nett_price = db.Column(db.Float)  # "Nett Price ($)" - alternative price metric
    type_of_area = db.Column(db.Text)  # "Type of Area" - Strata or Land
    market_segment = db.Column(db.Text)  # URA's CCR/RCR/OCR - e.g., "Core Central Region"

    # Outlier flag - soft-delete approach instead of hard-deleting outliers
    # Records marked as outliers are excluded from analytics but kept for audit
    is_outlier = db.Column(db.Boolean, default=False, index=True)

    @classmethod
    def active_query(cls):
        """
        Return a base query that excludes outliers.

        Use this instead of db.session.query(Transaction) for all analytics queries.
        This ensures outliers (is_outlier=true) are never included in results.

        Example:
            query = Transaction.active_query()
            query = query.filter(Transaction.district == 'D09')
            results = query.all()
        """
        return db.session.query(cls).filter(
            or_(cls.is_outlier == False, cls.is_outlier.is_(None))
        )

    @classmethod
    def outlier_filter(cls):
        """
        Return the filter condition to exclude outliers.

        Use this when building filter lists for complex queries:
            filter_conditions = [Transaction.outlier_filter()]
            filter_conditions.append(Transaction.district == 'D09')
        """
        return or_(cls.is_outlier == False, cls.is_outlier.is_(None))

    def to_dict(self):
        """Convert to dictionary for JSON serialization - FULL data for premium users"""
        return {
            # Core fields (existing - do not change keys for frontend compat)
            'id': self.id,
            'project_name': self.project_name,
            'transaction_date': self.transaction_date.isoformat() if self.transaction_date else None,
            'contract_date': self.contract_date,
            'price': self.price,
            'area_sqft': self.area_sqft,
            'psf': self.psf,
            'district': self.district,
            'bedroom_count': self.bedroom_count,
            'property_type': self.property_type,
            'sale_type': self.sale_type,
            'tenure': self.tenure,
            'lease_start_year': self.lease_start_year,
            'remaining_lease': self.remaining_lease,
            # New fields (added for full CSV parity)
            'street_name': self.street_name,
            'floor_range': self.floor_range,
            'floor_level': self.floor_level,
            'num_units': self.num_units,
            'nett_price': self.nett_price,
            'type_of_area': self.type_of_area,
            'market_segment': self.market_segment,
            'is_outlier': self.is_outlier,
        }

    def to_teaser_dict(self):
        """
        Convert to dictionary for TEASER mode - masks sensitive fields for free users.

        SECURITY PRINCIPLE: Server returns masked values, NOT real values that get blurred.
        Frontend receives pre-masked data - no CSS-based hiding of real values.

        RESPONSE FORMAT (for each premium field):
        - field_name → null (real value withheld)
        - field_name_masked → masked display value
        - field_name_bucket_min/max → numeric buckets for charts

        PREMIUM FIELDS (null for free users, masked value provided):
        - project_name → null, project_name_masked → "D09 Condo A"
        - price → null, price_masked → "$2.5M - $3.0M"
        - psf → null, psf_masked → "$2,000 - $2,500"
        - area_sqft → null, area_sqft_masked → "~1,200 sqft"
        - street_name → null (no masked version)

        VISIBLE FIELDS (shown to all users):
        - district, bedroom_count, sale_type, tenure
        - transaction_date (month only)
        - floor_level, market_segment
        """
        # Generate consistent masked project name (deterministic based on first char)
        # This creates "D09 Condo A", "D09 Condo B" etc.
        if self.project_name:
            first_char = self.project_name[0].upper()
            letter_index = ord(first_char) % 26
            suffix = chr(65 + letter_index)  # A-Z
            masked_project = f"{self.district} Condo {suffix}" if self.district else f"Condo {suffix}"
        else:
            masked_project = f"{self.district} Condo" if self.district else "Condo"

        # Mask price to range (e.g., "$2.5M - $3.0M")
        price_bucket_min = None
        price_bucket_max = None
        masked_price = None
        if self.price:
            millions = self.price / 1000000
            if millions < 1:
                price_bucket_min = int(self.price // 100000) * 100000
                price_bucket_max = price_bucket_min + 100000
                masked_price = f"${price_bucket_min // 1000}K - ${price_bucket_max // 1000}K"
            elif millions < 5:
                price_bucket_min = int(millions * 2) / 2 * 1000000
                price_bucket_max = price_bucket_min + 500000
                masked_price = f"${price_bucket_min/1000000:.1f}M - ${price_bucket_max/1000000:.1f}M"
            else:
                price_bucket_min = int(millions) * 1000000
                price_bucket_max = price_bucket_min + 1000000
                masked_price = f"${int(price_bucket_min/1000000)}M - ${int(price_bucket_max/1000000)}M"

        # Mask PSF to range (e.g., "$2,000 - $2,500")
        psf_bucket_min = None
        psf_bucket_max = None
        masked_psf = None
        if self.psf:
            psf_bucket_min = int(self.psf // 500) * 500
            psf_bucket_max = psf_bucket_min + 500
            masked_psf = f"${psf_bucket_min:,} - ${psf_bucket_max:,}"

        # Mask area to rounded value (e.g., "~1,200 sqft")
        area_rounded = None
        masked_area = None
        if self.area_sqft:
            area_rounded = round(self.area_sqft / 100) * 100
            masked_area = f"~{area_rounded:,} sqft"

        return {
            'id': self.id,

            # PREMIUM FIELDS - null for free, masked value provided separately
            # Frontend uses: value={txn.project_name} masked={txn.project_name_masked}
            'project_name': None,  # Real value withheld
            'project_name_masked': masked_project,  # Display this instead

            'price': None,  # Real value withheld
            'price_masked': masked_price,  # Display string (e.g., "$2.5M - $3.0M")
            'price_bucket_min': price_bucket_min,  # For chart sorting/filtering
            'price_bucket_max': price_bucket_max,

            'psf': None,  # Real value withheld
            'psf_masked': masked_psf,  # Display string (e.g., "$2,000 - $2,500")
            'psf_bucket_min': psf_bucket_min,  # For chart sorting/filtering
            'psf_bucket_max': psf_bucket_max,

            'area_sqft': None,  # Real value withheld
            'area_sqft_masked': masked_area,  # Display string (e.g., "~1,200 sqft")
            'area_sqft_rounded': area_rounded,  # For chart sorting/filtering

            # VISIBLE FIELDS - shown as-is to all users
            'transaction_date': self.transaction_date.strftime('%Y-%m') if self.transaction_date else None,
            'district': self.district,
            'bedroom_count': self.bedroom_count,
            'sale_type': self.sale_type,
            'tenure': self.tenure,
            'floor_level': self.floor_level,
            'market_segment': self.market_segment,

            # Explicitly NULL fields - never exposed to free users (no masked version)
            'street_name': None,
            'floor_range': None,
            'contract_date': None,
            'nett_price': None,

            # Flag to indicate this is teaser data
            '_is_teaser': True,
        }

