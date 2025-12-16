"""
Transaction Model - Maps to CSV columns and master_transactions table
"""
from models.database import db
from datetime import datetime

class Transaction(db.Model):
    __tablename__ = 'transactions'
    
    id = db.Column(db.Integer, primary_key=True)
    project_name = db.Column(db.String(255), index=True, nullable=False)
    transaction_date = db.Column(db.Date, index=True, nullable=False)
    contract_date = db.Column(db.String(10))  # MMYY format
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
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
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
            'remaining_lease': self.remaining_lease
        }

