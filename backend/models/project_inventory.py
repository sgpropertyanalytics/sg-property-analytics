"""
Project Inventory Model - Stores total units per project for unsold inventory calculation

Data Sources:
  - URA Developer Sales API (primary, automated)
  - Manual entry from PropertyGuru/EdgeProp (fallback)

Usage:
  Unsold = total_units - cumulative_new_sales (from transactions)
"""
from models.database import db
from datetime import datetime, timedelta


class ProjectInventory(db.Model):
    __tablename__ = 'project_inventory'

    # Primary Key
    id = db.Column(db.Integer, primary_key=True)

    # Project identifier (matches transactions.project_name)
    project_name = db.Column(db.String(255), unique=True, nullable=False, index=True)

    # Core inventory data
    total_units = db.Column(db.Integer)  # Total units in the development
    units_launched = db.Column(db.Integer)  # From URA: launchedToDate
    units_sold_ura = db.Column(db.Integer)  # From URA: soldToDate
    units_available = db.Column(db.Integer)  # From URA: unitsAvail

    # Data source tracking
    data_source = db.Column(db.String(50), default='PENDING')  # URA_API, MANUAL, PENDING
    ura_project_id = db.Column(db.String(100))  # URA's internal project identifier
    last_synced = db.Column(db.DateTime)  # When we last fetched from URA
    refresh_after = db.Column(db.DateTime, index=True)  # When to re-sync

    # For manual fallback
    manual_source_url = db.Column(db.Text)  # PropertyGuru/EdgeProp link
    manual_verified_by = db.Column(db.String(100))  # Who verified the manual entry

    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @classmethod
    def get_or_create(cls, project_name):
        """Get existing inventory record or create a new PENDING one."""
        record = cls.query.filter_by(project_name=project_name).first()
        if not record:
            record = cls(
                project_name=project_name,
                data_source='PENDING',
                created_at=datetime.utcnow()
            )
            db.session.add(record)
            db.session.commit()
        return record

    @classmethod
    def upsert_from_ura(cls, project_name, ura_data):
        """
        Insert or update inventory from URA API data.

        Args:
            project_name: The project name (matched to our transactions)
            ura_data: Dict with keys: launchedToDate, soldToDate, unitsAvail, projectId
        """
        record = cls.query.filter_by(project_name=project_name).first()
        if not record:
            record = cls(project_name=project_name)
            db.session.add(record)

        record.total_units = ura_data.get('launchedToDate')
        record.units_launched = ura_data.get('launchedToDate')
        record.units_sold_ura = ura_data.get('soldToDate')
        record.units_available = ura_data.get('unitsAvail')
        record.ura_project_id = ura_data.get('projectId')
        record.data_source = 'URA_API'
        record.last_synced = datetime.utcnow()
        record.refresh_after = datetime.utcnow() + timedelta(days=30)
        record.updated_at = datetime.utcnow()

        db.session.commit()
        return record

    @classmethod
    def upsert_manual(cls, project_name, total_units, source_url=None, verified_by=None):
        """
        Insert or update inventory from manual entry.

        Args:
            project_name: The project name
            total_units: Total units in the development
            source_url: URL to PropertyGuru/EdgeProp page
            verified_by: Who verified this data
        """
        record = cls.query.filter_by(project_name=project_name).first()
        if not record:
            record = cls(project_name=project_name)
            db.session.add(record)

        record.total_units = total_units
        record.data_source = 'MANUAL'
        record.manual_source_url = source_url
        record.manual_verified_by = verified_by
        record.last_synced = datetime.utcnow()
        record.refresh_after = None  # Manual entries don't auto-refresh
        record.updated_at = datetime.utcnow()

        db.session.commit()
        return record

    @classmethod
    def get_stale_records(cls):
        """Get records that need to be re-synced from URA."""
        return cls.query.filter(
            cls.data_source == 'URA_API',
            cls.refresh_after < datetime.utcnow()
        ).all()

    @classmethod
    def get_pending_records(cls):
        """Get records that haven't been looked up yet."""
        return cls.query.filter(cls.data_source == 'PENDING').all()

    def to_dict(self):
        """Convert to dictionary for JSON serialization."""
        return {
            'id': self.id,
            'project_name': self.project_name,
            'total_units': self.total_units,
            'units_launched': self.units_launched,
            'units_sold_ura': self.units_sold_ura,
            'units_available': self.units_available,
            'data_source': self.data_source,
            'last_synced': self.last_synced.isoformat() if self.last_synced else None,
            'manual_source_url': self.manual_source_url,
            'confidence': 'high' if self.data_source == 'URA_API' else 'medium' if self.data_source == 'MANUAL' else 'none',
        }
