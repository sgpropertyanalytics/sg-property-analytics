"""
HDB Resale Routes

Proxies data.gov.sg public HDB resale dataset.
No authentication required - public data.

Endpoints:
- GET /api/hdb/million-dollar-trend  - Monthly count + quantum of $1M+ transactions

Cold-cache behaviour:
  First request triggers a background fetch (returns 202 + "loading" status).
  Subsequent requests poll until data is ready, then return 200 + data.
  With DATA_GOV_SG_API_KEY set: ~5-10s cold fetch (generous rate limit).
  Without key: ~35-45s cold fetch (1000/page, 7s delay, ~5 pages).
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
_PAGE_LIMIT = 1000      # Large pages to minimize total API calls (~5 pages for ~4200 txns)
_REQUEST_TIMEOUT = 30   # seconds per page request (larger pages need more time)
_MAX_PAGES = 30         # safety cap (~30,000 records max)
_RETRY_WAIT = 15        # seconds to wait after 429 before retrying
_MAX_RETRIES = 3        # retries per page on 429

# API key from environment — unlocks higher rate limits on data.gov.sg
# Set DATA_GOV_SG_API_KEY in your .env / Render dashboard.
# With key:    ~0.5s delay between pages → cold fetch ~5-10s
# Without key: ~7s delay between pages   → ~8.5 req/min, under 10 req/min limit
#              With ~5 pages needed, cold fetch ~35-45s
_API_KEY = os.environ.get('DATA_GOV_SG_API_KEY', '')
_PAGE_DELAY = 0.5 if _API_KEY else 7.0


def _fetch_page(offset):
    """Fetch one page with 429 retry/exponential backoff. Raises exception if fails after retries."""
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
                # Defense-in-depth: exponential backoff if 429 occurs despite rate-safe pacing
                # Primary fix is _PAGE_LIMIT=1000 + _PAGE_DELAY=7s keeping us under 10 req/min
                backoff_time = _RETRY_WAIT * (2 ** attempt)  # 15s, 30s, 60s
                print(f"[HDB Fetch] Rate limited (429). Retrying in {backoff_time}s... (Attempt {attempt + 1}/{_MAX_RETRIES})")
                time.sleep(backoff_time)
                continue
        
        # If any other error (or 429 still happening after all retries), this will raise it
        resp.raise_for_status()
        
        # Return records
        return resp.json().get('result', {}).get('records', [])
        
    # If we get here it means all retries failed and somehow didn't raise
    raise Exception(f"Failed to fetch data from data.gov.sg after {_MAX_RETRIES} attempts.")


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
