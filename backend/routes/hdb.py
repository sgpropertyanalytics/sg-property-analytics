"""
HDB Resale Routes

Proxies data.gov.sg public HDB resale dataset.
No authentication required - public data.

Endpoints:
- GET /api/hdb/million-dollar-trend  - Monthly count + quantum of $1M+ transactions

Cold-cache behaviour:
  First request triggers a background fetch (returns 202 + "loading" status).
  Subsequent requests poll until data is ready, then return 200 + data.
  With DATA_GOV_SG_API_KEY set: ~15-20s cold fetch (generous rate limit).
  Without key: ~2-3 min cold fetch (anonymous ~10 req/min limit).
  Once cached, all responses for the next 6 hours are instant cache hits.
"""

import os
import time
import threading
import requests
from flask import Blueprint, jsonify

hdb_bp = Blueprint('hdb', __name__)

# ============================================================
# In-memory TTL cache + background-fetch state
# ============================================================
_CACHE = {
    'data': None,
    'timestamp': 0.0,
    'fetching': False,   # True while background thread is running
    'error': None,       # Last error message from background fetch
}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours

_DATA_GOV_URL = 'https://data.gov.sg/api/action/datastore_search'
_DATASET_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc'
_MILLION = 1_000_000
_PAGE_LIMIT = 100
_REQUEST_TIMEOUT = 15   # seconds per page request
_MAX_PAGES = 300        # safety cap (~30,000 records max)
_RETRY_WAIT = 20        # seconds to wait after 429 before retrying
_MAX_RETRIES = 3        # retries per page on 429

# API key from environment — unlocks higher rate limits on data.gov.sg
# Set DATA_GOV_SG_API_KEY in your .env / Render dashboard.
# With key:    ~0.1s delay between pages → cold fetch ~15-20s
# Without key: ~1.2s delay between pages → cold fetch ~2-3 min
_API_KEY = os.environ.get('DATA_GOV_SG_API_KEY', '')
_PAGE_DELAY = 0.1 if _API_KEY else 1.2


def _fetch_page(offset):
    """Fetch one page with 429 retry/backoff. Returns list of records."""
    headers = {'Authorization': _API_KEY} if _API_KEY else {}
    for attempt in range(_MAX_RETRIES):
        resp = requests.get(
            _DATA_GOV_URL,
            params={
                'resource_id': _DATASET_ID,
                'limit': _PAGE_LIMIT,
                'offset': offset,
                'sort': 'resale_price desc',
            },
            headers=headers,
            timeout=_REQUEST_TIMEOUT,
        )
        if resp.status_code == 429:
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_RETRY_WAIT)
                continue
        resp.raise_for_status()
        return resp.json().get('result', {}).get('records', [])
    return []


def _build_series(monthly):
    return sorted(
        [
            {'month': k, 'count': v['count'], 'total_quantum': v['total_quantum']}
            for k, v in monthly.items()
        ],
        key=lambda x: x['month'],
    )


def _background_fetch():
    """
    Run in a background thread. Paginates data.gov.sg until price < $1M.
    Writes result into _CACHE on completion.
    """
    monthly = {}
    offset = 0

    try:
        for _ in range(_MAX_PAGES):
            records = _fetch_page(offset)
            if not records:
                break

            done = False
            for r in records:
                price = float(r['resale_price'])
                if price < _MILLION:
                    done = True
                    break
                month = r['month']
                if month not in monthly:
                    monthly[month] = {'count': 0, 'total_quantum': 0.0}
                monthly[month]['count'] += 1
                monthly[month]['total_quantum'] += price

            if done:
                break

            offset += _PAGE_LIMIT
            time.sleep(_PAGE_DELAY)

        data = _build_series(monthly)
        with _CACHE_LOCK:
            _CACHE['data'] = data
            _CACHE['timestamp'] = time.time()
            _CACHE['fetching'] = False
            _CACHE['error'] = None

    except Exception as e:
        with _CACHE_LOCK:
            _CACHE['fetching'] = False
            _CACHE['error'] = str(e)


@hdb_bp.route('/million-dollar-trend', methods=['GET'])
def get_million_dollar_trend():
    """
    Monthly count and total quantum of HDB resale transactions >= $1M.

    Returns 200 + data when cache is warm.
    Returns 202 + {loading: true} on first call (triggers background fetch).
    Returns 200 + data once background fetch completes on subsequent polls.

    Response (200):
        data: [{month: "YYYY-MM", count: int, total_quantum: float}]
        meta: {total_transactions, cache_hit, source, loading}
    """
    now = time.time()

    with _CACHE_LOCK:
        # Cache hit
        if _CACHE['data'] is not None and (now - _CACHE['timestamp']) < _CACHE_TTL_SECONDS:
            data = _CACHE['data']
            return jsonify({
                'data': data,
                'meta': {
                    'total_transactions': sum(d['count'] for d in data),
                    'cache_hit': True,
                    'loading': False,
                    'source': 'data.gov.sg — HDB Resale Flat Prices',
                },
            })

        # Background fetch already running — tell frontend to poll
        if _CACHE['fetching']:
            return jsonify({
                'data': [],
                'meta': {
                    'total_transactions': 0,
                    'cache_hit': False,
                    'loading': True,
                    'source': 'data.gov.sg — HDB Resale Flat Prices',
                },
            }), 202

        # Last fetch errored — surface it
        if _CACHE['error']:
            err = _CACHE['error']
            _CACHE['error'] = None  # clear so next request retries
            return jsonify({'error': f'HDB data fetch failed: {err}'}), 502

        # Cold cache — kick off background fetch
        _CACHE['fetching'] = True
        _CACHE['error'] = None

    thread = threading.Thread(target=_background_fetch, daemon=True)
    thread.start()

    return jsonify({
        'data': [],
        'meta': {
            'total_transactions': 0,
            'cache_hit': False,
            'loading': True,
            'source': 'data.gov.sg — HDB Resale Flat Prices',
        },
    }), 202
