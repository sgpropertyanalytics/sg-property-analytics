#!/usr/bin/env python3
"""
Discover XHR/Fetch endpoints used by property listing sites.

This script uses Playwright to load each page and log all XHR/fetch requests,
helping identify the JSON API endpoints that return listing data.

Usage:
    pip install playwright
    playwright install chromium
    python scripts/discover_endpoints.py

Output will show all XHR endpoints - look for ones returning JSON with listing data.
"""
import asyncio
from playwright.async_api import async_playwright

# URLs to analyze
URLS = [
    # EdgeProp - listing page (not marketing page)
    "https://www.edgeprop.sg/new-launches/all-new-property-launches",
    # ERA - property portal (JS-driven)
    "https://propertyportal.era.com.sg/new-launches",
    # PropNex
    "https://www.propnex.com/new-launches",
]


async def main():
    print("=" * 60)
    print("XHR/Fetch Endpoint Discovery")
    print("=" * 60)
    print("\nThis will load each page and capture all XHR/fetch requests.")
    print("Look for JSON endpoints that contain listing/project data.\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        # Track requests
        xhr_requests = []

        def on_request(req):
            if req.resource_type in ("xhr", "fetch"):
                xhr_requests.append({
                    'method': req.method,
                    'url': req.url,
                })
                print(f"  {req.method} {req.url[:100]}...")

        def on_response(res):
            content_type = res.headers.get("content-type", "")
            if "application/json" in content_type:
                print(f"  📦 JSON Response: {res.url[:80]}...")

        page.on("request", on_request)
        page.on("response", on_response)

        for url in URLS:
            print(f"\n{'='*60}")
            print(f"Loading: {url}")
            print("=" * 60)
            xhr_requests.clear()

            try:
                await page.goto(url, wait_until="networkidle", timeout=60000)
                await page.wait_for_timeout(5000)  # Wait for lazy-loaded content

                print(f"\nTotal XHR/Fetch requests: {len(xhr_requests)}")

                # Categorize requests
                json_endpoints = [r for r in xhr_requests if 'api' in r['url'].lower() or 'json' in r['url'].lower()]
                if json_endpoints:
                    print("\n🎯 Potential API endpoints:")
                    for req in json_endpoints:
                        print(f"   {req['method']} {req['url']}")

            except Exception as e:
                print(f"Error loading {url}: {e}")

        await browser.close()

    print("\n" + "=" * 60)
    print("Discovery complete!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Identify which endpoints return listing JSON data")
    print("2. Test calling them directly with requests")
    print("3. Update new_launch_scraper.py to use those endpoints")


if __name__ == "__main__":
    asyncio.run(main())
