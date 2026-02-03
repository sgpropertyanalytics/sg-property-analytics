"""
Lightweight accessors for the transactions_primary view.

We avoid registering a SQLAlchemy model to prevent db.create_all()
from attempting to create the view as a table.
"""
from sqlalchemy import Table, MetaData


def get_transactions_primary_table(db):
    """
    Return a SQLAlchemy Table mapped to the transactions_primary view.
    Uses autoload to reflect columns from the database.
    """
    engine = db.engine
    cache_attr = "_transactions_primary_table"
    cached = getattr(engine, cache_attr, None)
    if cached is not None:
        return cached
    metadata = MetaData()
    table = Table(
        'transactions_primary',
        metadata,
        autoload_with=engine
    )
    setattr(engine, cache_attr, table)
    return table
