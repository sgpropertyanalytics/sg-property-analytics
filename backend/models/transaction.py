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
    floor_range = db.Column(db.String(20))  # Raw floor range, e.g., "01 to 05"
    floor_level = db.Column(db.String(20), index=True)  # Classified: Low, Mid, High, etc.
    num_units = db.Column(db.Integer)  # "No. of Units" - for new sale bulk transactions
    nett_price = db.Column(db.Float)  # "Nett Price ($)" - alternative price metric
    type_of_area = db.Column(db.String(20))  # "Type of Area" - Strata or Land
    market_segment = db.Column(db.String(10))  # URA's CCR/RCR/OCR classification

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
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
        }

