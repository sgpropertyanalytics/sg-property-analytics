"""
HDB Resale Routes

Proxies data.gov.sg public HDB resale dataset.
No authentication required - public data.

Endpoints:
- GET /api/hdb/million-dollar-trend  - Monthly count + quantum of $1M+ transactions by region

Architecture:
  Seed data (hdb_million_dollar_seed.json) is loaded on startup so the chart
  always renders immediately. A background refresh attempts to fetch live data
  from data.gov.sg, but the chart is never blank — seed data is the fallback.

  With DATA_GOV_SG_API_KEY set: background refresh ~5-10s (generous rate limit).
  Without key: background refresh may fail due to strict rate limits (~1 req/15s).
  Seed data is always available regardless of API key or rate limits.
"""

import json
import os
import time
import threading
import requests
from flask import Blueprint, jsonify

hdb_bp = Blueprint('hdb', __name__)

# ============================================================
# Seed data — loaded once at import time (always available)
# ============================================================
_SEED_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'hdb_million_dollar_seed.json')

def _load_seed():
    """Load pre-aggregated seed data from JSON file."""
    try:
        with open(_SEED_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[HDB] Warning: Could not load seed data: {e}")
        return []

_SEED_DATA = _load_seed()

# ============================================================
# In-memory TTL cache + background-fetch state
# ============================================================
_CACHE = {
    'data': None,       # Live data from API (overrides seed when available)
    'timestamp': 0.0,
    'fetching': False,   # True while background thread is running
    'error': None,       # Last error message from background fetch
}
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours

_DATA_GOV_URL = 'https://data.gov.sg/api/action/datastore_search'
_DATASET_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc'
_MILLION = 1_000_000
_PAGE_LIMIT = 1000      # Large pages to minimize total API calls
_REQUEST_TIMEOUT = 30   # seconds per page request
_MAX_PAGES = 30         # safety cap (~30,000 records max)
_RETRY_WAIT = 15        # seconds to wait after 429 before retrying
_MAX_RETRIES = 3        # retries per page on 429

# API key from environment — unlocks higher rate limits on data.gov.sg
# Set DATA_GOV_SG_API_KEY in your .env / Render dashboard.
_API_KEY = os.environ.get('DATA_GOV_SG_API_KEY', '')
_PAGE_DELAY = 0.5 if _API_KEY else 7.0

# HDB town → CCR/RCR/OCR region mapping
# Derived from constants.py PLANNING_AREA_TO_DISTRICT + get_region_for_district.
# Inlined here to avoid importing constants.py (heavy deps) in this lightweight module.
_HDB_TOWN_TO_REGION = {
    'ANG MO KIO': 'RCR', 'BEDOK': 'OCR', 'BISHAN': 'RCR',
    'BUKIT BATOK': 'OCR', 'BUKIT MERAH': 'RCR', 'BUKIT PANJANG': 'OCR',
    'BUKIT TIMAH': 'OCR', 'CENTRAL AREA': 'CCR', 'CHOA CHU KANG': 'OCR',
    'CLEMENTI': 'RCR', 'GEYLANG': 'RCR', 'HOUGANG': 'OCR',
    'JURONG EAST': 'OCR', 'JURONG WEST': 'OCR', 'KALLANG/WHAMPOA': 'RCR',
    'LIM CHU KANG': 'OCR', 'MARINE PARADE': 'RCR', 'PASIR RIS': 'OCR',
    'PUNGGOL': 'OCR', 'QUEENSTOWN': 'RCR', 'SEMBAWANG': 'OCR',
    'SENGKANG': 'OCR', 'SERANGOON': 'RCR', 'TAMPINES': 'OCR',
    'TENGAH': 'OCR', 'TOA PAYOH': 'RCR', 'WOODLANDS': 'OCR',
    'YISHUN': 'OCR',
}


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
            {'month': k[0], 'region': k[1], 'count': v['count'], 'total_quantum': v['total_quantum']}
            for k, v in monthly.items()
        ],
        key=lambda x: (x['month'], x['region']),
    )


def _background_fetch():
    """
    Run in a background thread. Paginates data.gov.sg until price < $1M.
    Writes result into _CACHE on completion. Failure is non-fatal — seed data
    remains available as fallback.
    """
    monthly = {}  # key: (month, region)
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
                town = r.get('town', 'UNKNOWN')
                region = _HDB_TOWN_TO_REGION.get(town, 'OCR')
                key = (month, region)
                if key not in monthly:
                    monthly[key] = {'count': 0, 'total_quantum': 0.0}
                monthly[key]['count'] += 1
                monthly[key]['total_quantum'] += price

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
        print(f"[HDB] Live data refreshed: {len(data)} months, {sum(d['count'] for d in data)} transactions")

    except Exception as e:
        with _CACHE_LOCK:
            _CACHE['fetching'] = False
            _CACHE['error'] = str(e)
        print(f"[HDB] Background refresh failed (seed data still served): {e}")


@hdb_bp.route('/million-dollar-trend', methods=['GET'])
def get_million_dollar_trend():
    """
    Monthly count and total quantum of HDB resale transactions >= $1M.

    Always returns 200 with data (seed or live).
    Triggers background refresh if cache is cold/expired.

    Response (200):
        data: [{month: "YYYY-MM", region: "CCR"|"RCR"|"OCR", count: int, total_quantum: float}]
        meta: {total_transactions, cache_hit, source, loading}
    """
    now = time.time()

    with _CACHE_LOCK:
        # Cache hit — serve live data
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

        # Kick off background refresh if not already running
        should_start_fetch = False
        if not _CACHE['fetching']:
            _CACHE['fetching'] = True
            _CACHE['error'] = None
            should_start_fetch = True

    # Start background fetch outside the lock
    if should_start_fetch:
        thread = threading.Thread(target=_background_fetch, daemon=True)
        thread.start()

    # ALWAYS return seed data immediately — chart is never blank
    data = _SEED_DATA
    return jsonify({
        'data': data,
        'meta': {
            'total_transactions': sum(d['count'] for d in data),
            'cache_hit': False,
            'loading': False,  # False because we have data to show
            'source': 'data.gov.sg — HDB Resale Flat Prices (seed)',
        },
    })
