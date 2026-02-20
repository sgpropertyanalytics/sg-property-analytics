"""
One-time script to generate HDB $1M+ seed data with region breakdown.
Self-contained — no pip dependencies, no imports from backend.

Usage: cd backend && python3 -m scripts.generate_hdb_seed
"""
import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error

# HDB town → CCR/RCR/OCR region mapping
# Source: constants.py PLANNING_AREA_TO_DISTRICT + get_region_for_district
HDB_TOWN_TO_REGION = {
    'ANG MO KIO': 'RCR',       # D20
    'BEDOK': 'OCR',             # D16
    'BISHAN': 'RCR',            # D20
    'BUKIT BATOK': 'OCR',       # D23
    'BUKIT MERAH': 'RCR',       # D03/D04
    'BUKIT PANJANG': 'OCR',     # D23
    'BUKIT TIMAH': 'OCR',       # D21
    'CENTRAL AREA': 'CCR',      # D01/D02
    'CHOA CHU KANG': 'OCR',     # D23
    'CLEMENTI': 'RCR',          # D05
    'GEYLANG': 'RCR',           # D14
    'HOUGANG': 'OCR',           # D19
    'JURONG EAST': 'OCR',       # D22
    'JURONG WEST': 'OCR',       # D22
    'KALLANG/WHAMPOA': 'RCR',   # D08
    'LIM CHU KANG': 'OCR',      # D24
    'MARINE PARADE': 'RCR',     # D15
    'PASIR RIS': 'OCR',         # D18
    'PUNGGOL': 'OCR',           # D19
    'QUEENSTOWN': 'RCR',        # D03
    'SEMBAWANG': 'OCR',         # D27
    'SENGKANG': 'OCR',          # D19
    'SERANGOON': 'RCR',         # D13
    'TAMPINES': 'OCR',          # D18
    'TENGAH': 'OCR',            # D24
    'TOA PAYOH': 'RCR',         # D12
    'WOODLANDS': 'OCR',         # D25
    'YISHUN': 'OCR',            # D27
}

API_URL = 'https://data.gov.sg/api/action/datastore_search'
DATASET_ID = 'd_8b84c4ee58e3cfc0ece0d773c8ca6abc'
API_KEY = os.environ.get('DATA_GOV_SG_API_KEY', '')
PAGE_LIMIT = 1000
MILLION = 1_000_000


def fetch_page(offset):
    params = urllib.parse.urlencode({
        'resource_id': DATASET_ID,
        'limit': PAGE_LIMIT,
        'offset': offset,
        'sort': 'resale_price desc',
    })
    url = f"{API_URL}?{params}"
    req = urllib.request.Request(url)
    if API_KEY:
        req.add_header('Authorization', API_KEY)

    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                return data.get('result', {}).get('records', [])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 15 * (2 ** attempt)
                print(f"  429 rate limited - waiting {wait}s (attempt {attempt+1}/5)")
                time.sleep(wait)
                continue
            raise
    raise Exception("Rate limited after 5 attempts")


def main():
    print("Generating HDB $1M+ seed data with region breakdown...")
    monthly = {}  # key: (month, region)
    offset = 0
    total = 0
    delay = 0.5 if API_KEY else 10.0

    for page in range(100):
        print(f"  Page {page+1} (offset {offset})...")
        records = fetch_page(offset)
        if not records:
            break

        done = False
        for r in records:
            price = float(r['resale_price'])
            if price < MILLION:
                done = True
                break
            month = r['month']
            town = r.get('town', 'UNKNOWN')
            region = HDB_TOWN_TO_REGION.get(town, 'OCR')
            if town not in HDB_TOWN_TO_REGION:
                print(f"  WARNING: Unknown town '{town}', defaulting to OCR")
            key = (month, region)
            if key not in monthly:
                monthly[key] = {'count': 0, 'total_quantum': 0.0}
            monthly[key]['count'] += 1
            monthly[key]['total_quantum'] += price
            total += 1

        if done:
            print(f"  Reached prices < $1M. Done.")
            break
        offset += PAGE_LIMIT
        time.sleep(delay)

    data = sorted(
        [{'month': k[0], 'region': k[1], 'count': v['count'], 'total_quantum': v['total_quantum']}
         for k, v in monthly.items()],
        key=lambda x: (x['month'], x['region']),
    )

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'hdb_million_dollar_seed.json')
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"\nDone! {total} transactions → {len(data)} month-region buckets.")
    print(f"Saved to {out_path}")


if __name__ == '__main__':
    main()
