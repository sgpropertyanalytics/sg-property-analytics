"""
Admin, Health, and Debug Endpoints

Endpoints:
- /health - Health check
- /debug/data-status - Data integrity diagnostics
- /admin/update-metadata - Manual metadata update
- /admin/filter-outliers - Outlier management
- /dashboard/cache - Cache management
"""

import time
from datetime import timedelta
from flask import request, jsonify
from routes.analytics import analytics_bp, reader
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE


@analytics_bp.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, text
    from db.sql import exclude_outliers

    try:
        # Total records in database
        total_count = db.session.query(Transaction).count()

        # Active records (non-outliers) - this is what analytics use
        active_count = db.session.query(Transaction).filter(
            exclude_outliers(Transaction)
        ).count()

        # Outlier count - directly from database, always accurate
        outlier_count = db.session.query(Transaction).filter(
            Transaction.is_outlier == True
        ).count()

        metadata = reader.get_metadata()

        # Get min and max transaction dates from non-outlier records
        min_date_result = db.session.query(func.min(Transaction.transaction_date)).filter(
            exclude_outliers(Transaction)
        ).scalar()
        max_date_result = db.session.query(func.max(Transaction.transaction_date)).filter(
            exclude_outliers(Transaction)
        ).scalar()

        # If transaction_date is None, try contract_date
        if min_date_result is None:
            min_date_result = db.session.query(func.min(Transaction.contract_date)).scalar()
        if max_date_result is None:
            max_date_result = db.session.query(func.max(Transaction.contract_date)).scalar()

        # Get last successful ETL batch info
        last_batch_date = None
        last_batch_rows = None
        try:
            batch_result = db.session.execute(text("""
                SELECT completed_at, rows_promoted
                FROM etl_batches
                WHERE status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
            """)).fetchone()
            if batch_result:
                last_batch_date = batch_result[0].isoformat() if batch_result[0] else None
                last_batch_rows = batch_result[1]
        except Exception:
            # etl_batches table may not exist yet - use metadata fallback
            pass

        return jsonify({
            "status": "healthy",
            "data_loaded": active_count > 0,
            "row_count": active_count,  # Non-outlier records (used by analytics)
            "total_records": total_count,  # All records in database
            "outliers_excluded": outlier_count,  # Direct count from is_outlier=true
            "total_records_removed": outlier_count,  # For backward compatibility
            "stats_computed": metadata.get("last_updated") is not None,
            "last_updated": metadata.get("last_updated"),
            "min_date": min_date_result.isoformat() if min_date_result else None,
            "max_date": max_date_result.isoformat() if max_date_result else None,
            # ETL batch info for "Last updated" display
            "last_batch_date": last_batch_date,
            "last_batch_rows": last_batch_rows,
        })
    except Exception as e:
        return jsonify({
            "status": "error",
            "error": str(e)
        }), 500


@analytics_bp.route("/debug/data-status", methods=["GET"])
def debug_data_status():
    """
    Diagnostic endpoint to check data integrity after migration.
    Shows actual counts and date ranges to debug KPI issues.
    """
    from models.transaction import Transaction
    from models.precomputed_stats import PreComputedStats
    from models.database import db
    from sqlalchemy import func
    from datetime import datetime, timedelta

    try:
        # Basic counts
        total_count = db.session.query(Transaction).count()

        # Date range from actual data
        date_stats = db.session.query(
            func.min(Transaction.transaction_date),
            func.max(Transaction.transaction_date),
            func.count(Transaction.id).filter(Transaction.transaction_date.isnot(None)),
            func.count(Transaction.id).filter(Transaction.transaction_date.is_(None))
        ).first()

        min_date, max_date, with_dates, without_dates = date_stats

        # Last 30 days check (from today)
        today = datetime.now().date()
        thirty_days_ago = today - timedelta(days=30)
        # Use < next_day instead of <= today to include all transactions on today
        tomorrow = today + timedelta(days=1)

        last_30_days = db.session.query(func.count(Transaction.id)).filter(
            Transaction.transaction_date >= thirty_days_ago,
            Transaction.transaction_date < tomorrow
        ).scalar()

        # Last 30 days by sale type
        new_sales_30d = db.session.query(func.count(Transaction.id)).filter(
            Transaction.transaction_date >= thirty_days_ago,
            Transaction.transaction_date < tomorrow,
            Transaction.sale_type == SALE_TYPE_NEW
        ).scalar()

        resales_30d = db.session.query(func.count(Transaction.id)).filter(
            Transaction.transaction_date >= thirty_days_ago,
            Transaction.transaction_date < tomorrow,
            Transaction.sale_type == SALE_TYPE_RESALE
        ).scalar()

        # Check sale_type values
        sale_types = db.session.query(
            Transaction.sale_type,
            func.count(Transaction.id)
        ).group_by(Transaction.sale_type).all()

        # Check precomputed_stats metadata
        metadata_record = PreComputedStats.query.filter_by(stat_key='_metadata').first()
        metadata = None
        if metadata_record:
            import json
            try:
                metadata = json.loads(metadata_record.stat_value) if isinstance(metadata_record.stat_value, str) else metadata_record.stat_value
            except:
                metadata = {"error": "could not parse"}

        return jsonify({
            "status": "ok",
            "total_transactions": total_count,
            "date_range": {
                "min_date": min_date.isoformat() if min_date else None,
                "max_date": max_date.isoformat() if max_date else None,
                "records_with_date": with_dates,
                "records_without_date": without_dates
            },
            "last_30_days": {
                "query_range": f"{thirty_days_ago.isoformat()} to {today.isoformat()}",
                "total_count": last_30_days,
                "new_sales": new_sales_30d,
                "resales": resales_30d
            },
            "sale_type_breakdown": {st[0] if st[0] else "NULL": st[1] for st in sale_types},
            "precomputed_metadata": metadata
        })
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log server-side only
        return jsonify({
            "status": "error",
            "error": "Internal server error"
        }), 500


@analytics_bp.route("/dashboard/cache", methods=["GET", "DELETE"])
def dashboard_cache():
    """
    Dashboard cache management endpoint.

    GET: Return cache statistics
    DELETE: Clear cache
    """
    from services.dashboard_service import get_cache_stats, clear_dashboard_cache

    if request.method == 'DELETE':
        clear_dashboard_cache()
        return jsonify({"status": "cache cleared"})

    return jsonify(get_cache_stats())


@analytics_bp.route("/metadata", methods=["GET"])
def get_metadata():
    """
    Public metadata endpoint for frontend consumption.
    Returns database stats including ingestion info.
    """
    from models.precomputed_stats import PreComputedStats
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import text

    try:
        # Get stored metadata
        stored_metadata = PreComputedStats.get_stat('_metadata') or {}

        # Get live counts from database
        total_count = db.session.query(Transaction).count()
        outlier_count = db.session.query(Transaction).filter(
            Transaction.is_outlier == True
        ).count()
        active_count = total_count - outlier_count

        # Get last successful ETL batch info (most reliable source for "new records")
        last_batch_date = None
        last_batch_rows = 0
        try:
            batch_result = db.session.execute(text("""
                SELECT completed_at, rows_promoted
                FROM etl_batches
                WHERE status = 'completed'
                ORDER BY completed_at DESC
                LIMIT 1
            """)).fetchone()
            if batch_result:
                last_batch_date = batch_result[0].isoformat() if batch_result[0] else None
                last_batch_rows = batch_result[1] or 0
        except Exception:
            # etl_batches table may not exist yet
            pass

        # Use ETL batch info if available, fall back to stored metadata
        records_added = last_batch_rows if last_batch_rows > 0 else stored_metadata.get('records_added_last_ingestion', 0)
        last_updated = last_batch_date or stored_metadata.get('last_updated')

        return jsonify({
            "last_updated": last_updated,
            "records_added_last_ingestion": records_added,
            "total_records": total_count,
            "active_records": active_count,
            "outliers_excluded": outlier_count,
        })
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


@analytics_bp.route("/admin/update-metadata", methods=["POST"])
def admin_update_metadata():
    """
    Manually update the precomputed metadata with outlier/validation counts.
    Called by ETL pipeline after ingestion.
    """
    from models.precomputed_stats import PreComputedStats
    from models.transaction import Transaction
    from models.database import db
    from datetime import datetime

    try:
        data = request.get_json() or {}

        # Get existing metadata or create new
        existing = PreComputedStats.get_stat('_metadata') or {}

        # Get current transaction count
        total_count = db.session.query(Transaction).count()

        # Update with provided values
        invalid_removed = data.get('invalid_removed', existing.get('invalid_removed', 0))
        duplicates_removed = data.get('duplicates_removed', existing.get('duplicates_removed', 0))
        outliers_excluded = data.get('outliers_excluded', existing.get('outliers_excluded', 0))
        total_records_removed = invalid_removed + duplicates_removed + outliers_excluded

        # Track ingestion stats (set by ETL pipeline)
        records_added_last_ingestion = data.get('records_added_last_ingestion', existing.get('records_added_last_ingestion', 0))

        # Build updated metadata
        updated_metadata = {
            'last_updated': data.get('last_updated', datetime.utcnow().isoformat()),
            'row_count': total_count,
            'invalid_removed': invalid_removed,
            'duplicates_removed': duplicates_removed,
            'outliers_excluded': outliers_excluded,
            'total_records_removed': total_records_removed,
            'records_added_last_ingestion': records_added_last_ingestion,
            'computed_at': existing.get('computed_at', datetime.utcnow().isoformat()),
            'manually_updated_at': datetime.utcnow().isoformat()
        }

        # Save to database
        PreComputedStats.set_stat('_metadata', updated_metadata, total_count)

        return jsonify({
            "status": "ok",
            "message": "Metadata updated successfully",
            "metadata": updated_metadata
        })
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log server-side only
        return jsonify({
            "status": "error",
            "error": "Internal server error"
        }), 500


@analytics_bp.route("/admin/filter-outliers", methods=["GET", "POST"])
def filter_outliers_endpoint():
    """
    Filter outliers from the database using IQR method.

    GET: Preview outliers (dry run) - shows what would be removed
    POST: Actually mark outliers in database
    """
    from services.data_validation import filter_price_outliers_iqr
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func

    try:
        # Get current outlier count
        current_outlier_count = db.session.query(Transaction).filter(
            Transaction.is_outlier == True
        ).count()

        if request.method == 'GET':
            # Dry run - show what would be filtered
            preview = filter_price_outliers_iqr(dry_run=True)
            return jsonify({
                "status": "preview",
                "current_outliers": current_outlier_count,
                "would_mark_additional": preview.get('count', 0),
                "preview": preview
            })
        else:
            # Actually filter
            result = filter_price_outliers_iqr(dry_run=False)

            # Get new outlier count
            new_outlier_count = db.session.query(Transaction).filter(
                Transaction.is_outlier == True
            ).count()

            return jsonify({
                "status": "completed",
                "previous_outliers": current_outlier_count,
                "new_outliers": new_outlier_count,
                "newly_marked": new_outlier_count - current_outlier_count,
                "result": result
            })
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log server-side only
        return jsonify({
            "status": "error",
            "error": "Internal server error"
        }), 500
