"""
Analytics Reader Service - Lightweight read-only service for metadata

This service reads from PreComputedStats table for metadata only.
All other precomputed stats methods have been removed as they were
replaced by the real-time /aggregate endpoint.
"""

from typing import Dict, Any
from models.precomputed_stats import PreComputedStats


class AnalyticsReader:
    """Read-only service for analytics metadata"""

    def get_metadata(self) -> Dict[str, Any]:
        """Get metadata about the pre-computed stats"""
        metadata = PreComputedStats.get_stat('_metadata')
        if metadata is None:
            return {"last_updated": None, "row_count": 0}
        return metadata


# Singleton instance
_reader = None

def get_reader() -> AnalyticsReader:
    """Get singleton AnalyticsReader instance"""
    global _reader
    if _reader is None:
        _reader = AnalyticsReader()
    return _reader
