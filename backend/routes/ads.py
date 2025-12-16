"""
Ad Serving Routes - Serve ads and track impressions/clicks
"""
from flask import Blueprint, request, jsonify
from models.database import db
from models.ad_placement import AdPlacement
from datetime import datetime

ads_bp = Blueprint('ads', __name__)


@ads_bp.route("/serve", methods=["GET"])
def serve_ad():
    """Serve an ad for a specific slot"""
    try:
        ad_slot = request.args.get('slot', 'header')  # Default to 'header'
        
        # Find active ads for this slot, ordered by priority
        ads = AdPlacement.query.filter_by(
            ad_slot=ad_slot,
            is_active=True
        ).filter(
            AdPlacement.start_date <= datetime.utcnow(),
            AdPlacement.end_date >= datetime.utcnow()
        ).order_by(
            AdPlacement.priority.desc()
        ).all()
        
        # Filter to only valid ads
        valid_ads = [ad for ad in ads if ad.is_valid()]
        
        if not valid_ads:
            return jsonify({
                "ad": None,
                "message": "No ads available for this slot"
            }), 200
        
        # Return the highest priority ad
        ad = valid_ads[0]
        
        # Record impression
        ad.record_impression()
        
        return jsonify({
            "ad": ad.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ads_bp.route("/click/<int:ad_id>", methods=["POST"])
def record_click(ad_id):
    """Record an ad click"""
    try:
        ad = AdPlacement.query.get(ad_id)
        
        if not ad:
            return jsonify({"error": "Ad not found"}), 404
        
        ad.record_click()
        
        return jsonify({
            "message": "Click recorded",
            "ad_id": ad_id
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ads_bp.route("/impression/<int:ad_id>", methods=["POST"])
def record_impression(ad_id):
    """Record an ad impression (alternative endpoint)"""
    try:
        ad = AdPlacement.query.get(ad_id)
        
        if not ad:
            return jsonify({"error": "Ad not found"}), 404
        
        ad.record_impression()
        
        return jsonify({
            "message": "Impression recorded",
            "ad_id": ad_id
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@ads_bp.route("/stats/<int:ad_id>", methods=["GET"])
def get_ad_stats(ad_id):
    """Get statistics for a specific ad"""
    try:
        ad = AdPlacement.query.get(ad_id)
        
        if not ad:
            return jsonify({"error": "Ad not found"}), 404
        
        # Calculate CTR (Click-Through Rate)
        ctr = (ad.clicks / ad.impressions * 100) if ad.impressions > 0 else 0
        
        return jsonify({
            "ad_id": ad_id,
            "impressions": ad.impressions,
            "clicks": ad.clicks,
            "ctr": round(ctr, 2),
            "ad": ad.to_dict()
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

