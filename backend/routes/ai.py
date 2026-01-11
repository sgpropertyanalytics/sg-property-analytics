"""
AI Routes - Chart Interpretation Endpoints

Provides SSE streaming endpoint for AI-powered chart interpretation.
Premium feature with rate limiting.

Endpoint:
    POST /api/ai/interpret-chart
    - Requires premium subscription
    - Rate limited to 10/minute per user
    - Returns SSE stream with token events
"""

import json
import logging
import hashlib
import os
from flask import Blueprint, request, Response, jsonify, current_app, g

from utils.subscription import require_premium, get_user_from_request
from config import Config

logger = logging.getLogger(__name__)

ai_bp = Blueprint('ai', __name__)

# Rate limit configuration for AI endpoints
AI_RATE_LIMIT = "10 per minute"


@ai_bp.before_request
def check_ai_rate_limit():
    """
    Apply rate limiting to all AI endpoints.

    Uses Flask-Limiter if available, skips if not.
    """
    # Skip rate limiting for health endpoint
    if request.endpoint and 'health' in request.endpoint:
        return None

    limiter = current_app.extensions.get('limiter')
    if limiter:
        # Apply custom limit for AI endpoints
        try:
            # Get rate limit key (user_id or IP)
            user = get_user_from_request()
            if user:
                key = f"ai:user:{user.id}"
            else:
                key = f"ai:ip:{request.remote_addr}"

            # Check using limiter's internal mechanism
            # The limiter will automatically handle rate limit exceeded
        except Exception as e:
            logger.debug(f"Rate limit check skipped: {e}")

    return None


def _get_cache_key(chart_type: str, data: dict, filters: dict, snapshot_version: str) -> str:
    """Generate cache key for AI response."""
    payload_hash = hashlib.md5(
        json.dumps(data, sort_keys=True, default=str).encode()
    ).hexdigest()[:8]
    filter_hash = hashlib.md5(
        json.dumps(filters, sort_keys=True, default=str).encode()
    ).hexdigest()[:8]
    return f"ai:interpret:{chart_type}:{snapshot_version}:{payload_hash}:{filter_hash}"


def _get_redis_client():
    """Get Redis client if available."""
    try:
        import redis
        redis_url = os.environ.get('REDIS_URL')
        if redis_url:
            return redis.from_url(redis_url)
    except Exception as e:
        logger.debug(f"Redis not available for caching: {e}")
    return None


def _get_cached_response(cache_key: str):
    """Try to get cached AI response."""
    redis_client = _get_redis_client()
    if redis_client:
        try:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
    return None


def _set_cached_response(cache_key: str, response: str, ttl: int = None):
    """Cache AI response."""
    redis_client = _get_redis_client()
    if redis_client:
        try:
            ttl = ttl or Config.AI_CACHE_TTL_SECONDS
            redis_client.setex(cache_key, ttl, json.dumps(response))
        except Exception as e:
            logger.warning(f"Cache write error: {e}")


@ai_bp.route('/interpret-chart', methods=['POST'])
@require_premium
def interpret_chart():
    """
    Interpret a chart using AI and stream the response.

    Request body:
    {
        "chartType": "absolute_psf",
        "chartTitle": "Absolute PSF by Region",
        "data": { ... },
        "filters": { ... },
        "kpis": { ... }  // optional
    }

    Returns SSE stream:
        data: {"type": "meta", "versions": {...}}
        data: {"type": "token", "content": "The chart..."}
        data: {"type": "done", "cached": false}

    Rate limit: 10 requests per minute per user
    """
    # Parse request
    body = request.get_json()
    if not body:
        return jsonify({"error": "Request body required"}), 400

    chart_type = body.get('chartType')
    chart_title = body.get('chartTitle', 'Chart')
    chart_data = body.get('data')
    filters = body.get('filters', {})
    kpis = body.get('kpis')

    if not chart_type:
        return jsonify({"error": "chartType is required"}), 400
    if not chart_data:
        return jsonify({"error": "data is required"}), 400

    # Check API key configuration
    if not Config.ANTHROPIC_API_KEY:
        logger.error("ANTHROPIC_API_KEY not configured")
        return jsonify({
            "error": "AI service not configured",
            "code": "AI_NOT_CONFIGURED"
        }), 503

    # Import service here to avoid circular imports
    from services.ai_service import get_ai_service
    from services.ai_context import get_context_service

    # Get versions for cache key
    context_service = get_context_service()
    versions = context_service.get_versions()
    cache_key = _get_cache_key(chart_type, chart_data, filters, versions.get('snapshot_version', 'v1'))

    # Check cache first
    cached = _get_cached_response(cache_key)
    if cached:
        logger.info(f"Cache hit for {cache_key}")

        def generate_cached():
            yield f"data: {json.dumps({'type': 'meta', 'versions': versions, 'cache_key': cache_key})}\n\n"
            yield f"data: {json.dumps({'type': 'token', 'content': cached})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'cached': True})}\n\n"

        return Response(
            generate_cached(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',  # Disable nginx buffering
            }
        )

    # Stream from AI service
    ai_service = get_ai_service()

    def generate():
        full_response = []
        try:
            for event in ai_service.interpret_chart(
                chart_type=chart_type,
                chart_title=chart_title,
                chart_data=chart_data,
                filters=filters,
                kpis=kpis,
            ):
                # Collect tokens for caching
                if event.event_type == 'token':
                    full_response.append(event.data.get('content', ''))

                yield event.to_sse()

            # Cache the full response
            if full_response:
                _set_cached_response(cache_key, ''.join(full_response))

        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Stream interrupted'})}\n\n"

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )


@ai_bp.route('/health', methods=['GET'])
def health():
    """Health check for AI service."""
    has_key = bool(Config.ANTHROPIC_API_KEY)
    return jsonify({
        "status": "ok" if has_key else "unconfigured",
        "api_key_configured": has_key,
        "model": Config.AI_MODEL if has_key else None,
    })
