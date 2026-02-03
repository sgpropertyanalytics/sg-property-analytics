"""
Source policy for transaction data.

Centralizes source labels and grouping to keep logic consistent
across ingestion, comparison, and analytics.
"""

# Primary source (authoritative)
PRIMARY_SOURCE = "ura_api"

# CSV sources (legacy + offline uploads)
CSV_SOURCES = ("csv", "csv_offline")

# All sources we consider for analytics
ANALYTICS_SOURCES = (PRIMARY_SOURCE,) + CSV_SOURCES


def sql_in_list(values):
    """
    Return a SQL-safe IN list for static, trusted literals.
    Intended for building static SQL (not user input).
    """
    return "(" + ",".join(f"'{v}'" for v in values) + ")"
