"""
Scraping Orchestrator Package

Production-grade web scraping infrastructure with:
- Tiered source system (A/B/C)
- Field authority matrix
- Staging-to-promotion data model
- Config-driven rate limiting
"""

from .tier_system import SourceTier, get_tier_for_domain, get_tier_config
from .base import BaseScraper, ScrapeMode, ScrapeResult
from .orchestrator import ScrapingOrchestrator

__all__ = [
    "SourceTier",
    "get_tier_for_domain",
    "get_tier_config",
    "BaseScraper",
    "ScrapeMode",
    "ScrapeResult",
    "ScrapingOrchestrator",
]
