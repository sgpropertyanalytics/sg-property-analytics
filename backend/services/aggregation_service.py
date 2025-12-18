"""
Aggregation Service - Pre-computes analytics using existing business logic

This service uses the existing functions from data_processor.py to calculate
all analytics once, then stores the results in PreComputedStats table.

SQL-only architecture: All data_processor functions query the database directly.
No DataFrame loading needed - saves memory on 512MB Render limit.
"""

from datetime import datetime
from typing import Optional
from models.database import db
from models.precomputed_stats import PreComputedStats
from models.transaction import Transaction
from services.json_serializer import serialize_for_json

# Import existing business logic - these all use SQL-only queries
from services.data_processor import (
    get_resale_stats,
    get_price_trends,
    get_total_volume_by_district,
    get_avg_psf_by_district,
    get_project_aggregation_by_district,
    get_price_project_stats_by_district,
    get_market_stats,
    get_market_stats_by_district,
    get_sale_type_trends,
    get_price_trends_by_sale_type,
    get_price_trends_by_region,
    get_psf_trends_by_region,
    get_price_trends_by_district,
    get_comparable_value_analysis,
    get_available_districts,
    get_transaction_details
)


def recompute_all_stats(outliers_excluded: int = 0):
    """
    Recompute all analytics and store in PreComputedStats.

    This function calls all the existing analytics functions and saves
    their results to the database.

    Args:
        outliers_excluded: Number of outlier records filtered out during data loading
    """
    print("=" * 60)
    print("Starting aggregation service - computing all analytics...")
    print("=" * 60)
    
    # Get total transaction count
    total_count = db.session.query(Transaction).count()
    print(f"Total transactions in database: {total_count:,}")
    
    if total_count == 0:
        print("⚠️  No transactions found. Please run upload.py first.")
        return

    # SQL-only architecture: data_processor functions query database directly
    # No DataFrame loading needed - saves memory on 512MB Render limit

    print("\n📊 Computing analytics...")
    
    # 1. Resale Stats (all combinations)
    print("  Computing resale_stats...")
    try:
        stats = get_resale_stats()
        PreComputedStats.set_stat('resale_stats_all', stats, total_count)
        print("    ✓ resale_stats_all")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 2. Price Trends (all)
    print("  Computing price_trends...")
    try:
        trends = get_price_trends()
        # Serialize timestamps to strings for JSON
        trends = serialize_for_json(trends)
        PreComputedStats.set_stat('price_trends_all', trends, total_count)
        print("    ✓ price_trends_all")
    except Exception as e:
        print(f"    ✗ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # 3. Total Volume by District
    print("  Computing total_volume_by_district...")
    try:
        volume = get_total_volume_by_district([2, 3, 4])
        PreComputedStats.set_stat('total_volume_by_district', volume, total_count)
        print("    ✓ total_volume_by_district")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 4. Average PSF by District
    print("  Computing avg_psf_by_district...")
    try:
        psf = get_avg_psf_by_district([2, 3, 4])
        PreComputedStats.set_stat('avg_psf_by_district', psf, total_count)
        print("    ✓ avg_psf_by_district")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 5. Market Stats
    print("  Computing market_stats...")
    try:
        market = get_market_stats()
        # Serialize timestamps to strings for JSON
        market = serialize_for_json(market)
        PreComputedStats.set_stat('market_stats_all', market, total_count)
        print("    ✓ market_stats_all")
    except Exception as e:
        print(f"    ✗ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # 6. Market Stats by District
    print("  Computing market_stats_by_district...")
    try:
        market_dist = get_market_stats_by_district([2, 3, 4])
        PreComputedStats.set_stat('market_stats_by_district', market_dist, total_count)
        print("    ✓ market_stats_by_district")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 7. Sale Type Trends
    print("  Computing sale_type_trends...")
    try:
        sale_trends = get_sale_type_trends()
        PreComputedStats.set_stat('sale_type_trends_all', sale_trends, total_count)
        print("    ✓ sale_type_trends_all")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 8. Price Trends by Sale Type
    print("  Computing price_trends_by_sale_type...")
    try:
        price_sale = get_price_trends_by_sale_type([2, 3, 4])
        PreComputedStats.set_stat('price_trends_by_sale_type', price_sale, total_count)
        print("    ✓ price_trends_by_sale_type")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 9. Price Trends by Region
    print("  Computing price_trends_by_region...")
    try:
        price_region = get_price_trends_by_region([2, 3, 4])
        PreComputedStats.set_stat('price_trends_by_region', price_region, total_count)
        print("    ✓ price_trends_by_region")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 10. PSF Trends by Region
    print("  Computing psf_trends_by_region...")
    try:
        psf_region = get_psf_trends_by_region([2, 3, 4])
        PreComputedStats.set_stat('psf_trends_by_region', psf_region, total_count)
        print("    ✓ psf_trends_by_region")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 11. Price Trends by District (Top N)
    print("  Computing price_trends_by_district...")
    try:
        price_dist = get_price_trends_by_district([2, 3, 4], top_n_districts=10)
        PreComputedStats.set_stat('price_trends_by_district', price_dist, total_count)
        print("    ✓ price_trends_by_district")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 12. Available Districts
    print("  Computing available_districts...")
    try:
        districts = get_available_districts()
        PreComputedStats.set_stat('available_districts', {'districts': districts}, total_count)
        print("    ✓ available_districts")
    except Exception as e:
        print(f"    ✗ Error: {e}")
    
    # 13. Metadata
    print("  Saving metadata...")
    metadata = {
        'last_updated': datetime.utcnow().isoformat(),
        'row_count': total_count,
        'outliers_excluded': outliers_excluded,
        'computed_at': datetime.utcnow().isoformat()
    }
    PreComputedStats.set_stat('_metadata', metadata, total_count)
    print(f"    ✓ _metadata (outliers_excluded: {outliers_excluded:,})")
    
    print("\n" + "=" * 60)
    print("✓ Aggregation complete! All stats pre-computed and saved.")
    print("=" * 60)


def recompute_stat_for_filters(districts: Optional[list] = None, segment: Optional[str] = None):
    """
    Recompute stats for specific filters (for on-demand computation if needed).
    This allows dynamic filtering while still using pre-computed base stats.
    """
    # This can be extended later for filtered pre-computation
    # For now, we compute all stats once
    recompute_all_stats()

