"""
Analytics Reader Service - Lightweight read-only service for pre-computed stats

This service ONLY reads from PreComputedStats table. No calculations, no Pandas.
Fast and lightweight for API responses.
"""

from typing import Optional, Dict, Any
from models.precomputed_stats import PreComputedStats


class AnalyticsReader:
    """Read-only service for pre-computed analytics"""
    
    def get_resale_stats(self, districts: Optional[list] = None, segment: Optional[str] = None) -> Dict[str, Any]:
        """
        Get resale statistics. Returns pre-computed stats.
        For filtered results, returns base stats (filtering can be added later).
        """
        stats = PreComputedStats.get_stat('resale_stats_all')
        if stats is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return stats
    
    def get_price_trends(self, districts: Optional[list] = None, segment: Optional[str] = None) -> Dict[str, Any]:
        """Get price trends from pre-computed stats"""
        trends = PreComputedStats.get_stat('price_trends_all')
        if trends is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return trends
    
    def get_total_volume_by_district(self) -> Dict[str, Any]:
        """Get total volume by district from pre-computed stats"""
        volume = PreComputedStats.get_stat('total_volume_by_district')
        if volume is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return volume
    
    def get_avg_psf_by_district(self) -> Dict[str, Any]:
        """Get average PSF by district from pre-computed stats"""
        psf = PreComputedStats.get_stat('avg_psf_by_district')
        if psf is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return psf
    
    def get_market_stats(self) -> Dict[str, Any]:
        """Get market stats from pre-computed stats"""
        stats = PreComputedStats.get_stat('market_stats_all')
        if stats is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return stats
    
    def get_market_stats_by_district(self) -> Dict[str, Any]:
        """Get market stats by district from pre-computed stats"""
        stats = PreComputedStats.get_stat('market_stats_by_district')
        if stats is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return stats
    
    def get_sale_type_trends(self) -> Dict[str, Any]:
        """Get sale type trends from pre-computed stats"""
        trends = PreComputedStats.get_stat('sale_type_trends_all')
        if trends is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return trends
    
    def get_price_trends_by_sale_type(self) -> Dict[str, Any]:
        """Get price trends by sale type from pre-computed stats"""
        trends = PreComputedStats.get_stat('price_trends_by_sale_type')
        if trends is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return trends
    
    def get_price_trends_by_region(self) -> Dict[str, Any]:
        """Get price trends by region from pre-computed stats"""
        trends = PreComputedStats.get_stat('price_trends_by_region')
        if trends is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return trends
    
    def get_psf_trends_by_region(self) -> Dict[str, Any]:
        """Get PSF trends by region from pre-computed stats"""
        trends = PreComputedStats.get_stat('psf_trends_by_region')
        if trends is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return trends
    
    def get_price_trends_by_district(self) -> Dict[str, Any]:
        """Get price trends by district from pre-computed stats"""
        trends = PreComputedStats.get_stat('price_trends_by_district')
        if trends is None:
            return {"error": "Stats not computed. Please run aggregation service."}
        return trends
    
    def get_available_districts(self) -> Dict[str, Any]:
        """Get available districts from pre-computed stats"""
        districts_data = PreComputedStats.get_stat('available_districts')
        if districts_data is None:
            return {"districts": []}
        return districts_data
    
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

