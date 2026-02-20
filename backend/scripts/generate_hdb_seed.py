"""
One-time script to generate HDB $1M+ seed data with district breakdown.
Self-contained — no pip dependencies, no imports from backend.

Usage: cd backend && python3 -m scripts.generate_hdb_seed
"""
import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error

# HDB town → URA district mapping
# Source: constants.py PLANNING_AREA_TO_DISTRICT
HDB_TOWN_TO_DISTRICT = {
    'ANG MO KIO': 'D20',
    'BEDOK': 'D16',
    'BISHAN': 'D20',
    'BUKIT BATOK': 'D23',
    'BUKIT MERAH': 'D03',
    'BUKIT PANJANG': 'D23',
    'BUKIT TIMAH': 'D21',
    'CENTRAL AREA': 'D01',
    'CHOA CHU KANG': 'D23',
    'CLEMENTI': 'D05',
    'GEYLANG': 'D14',
    'HOUGANG': 'D19',
    'JURONG EAST': 'D22',
    'JURONG WEST': 'D22',
    'KALLANG/WHAMPOA': 'D08',
    'LIM CHU KANG': 'D24',
    'MARINE PARADE': 'D15',
    'PASIR RIS': 'D18',
    'PUNGGOL': 'D19',
    'QUEENSTOWN': 'D03',
    'SEMBAWANG': 'D27',
    'SENGKANG': 'D19',
    'SERANGOON': 'D19',
    'TAMPINES': 'D18',
    'TENGAH': 'D24',
    'TOA PAYOH': 'D12',
    'WOODLANDS': 'D25',
    'YISHUN': 'D27',
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
    print("Generating HDB $1M+ seed data with district breakdown...")
    monthly = {}  # key: (month, district)
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
            district = HDB_TOWN_TO_DISTRICT.get(town)
            if not district:
                print(f"  WARNING: Unknown town '{town}', skipping")
                continue
            key = (month, district)
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
        [{'month': k[0], 'district': k[1], 'count': v['count'], 'total_quantum': v['total_quantum']}
         for k, v in monthly.items()],
        key=lambda x: (x['month'], x['district']),
    )

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'hdb_million_dollar_seed.json')
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)

    # Print summary
    district_totals = {}
    for row in data:
        d = row['district']
        district_totals[d] = district_totals.get(d, 0) + row['count']
    print(f"\nDone! {total} transactions → {len(data)} month-district buckets.")
    print(f"Saved to {out_path}")
    print(f"\nDistrict breakdown:")
    for d, count in sorted(district_totals.items(), key=lambda x: -x[1]):
        print(f"  {d}: {count} txns")


if __name__ == '__main__':
    main()
