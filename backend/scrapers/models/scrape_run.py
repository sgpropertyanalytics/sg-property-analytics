"""
DEPRECATED: Use ingestion_run.py instead.

This module is kept for backwards compatibility.
ScrapeRun is now an alias for IngestionRun.
"""
from .ingestion_run import IngestionRun, ScrapeRun, SourceType

__all__ = ["ScrapeRun", "IngestionRun", "SourceType"]
