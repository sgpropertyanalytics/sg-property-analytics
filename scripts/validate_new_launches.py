#!/usr/bin/env python3
"""
Bi-weekly validation job for new launches.

Re-scrapes data from all sources and compares against stored values.
Flags any discrepancies for manual review.

Run this as a cron job every 2 weeks:
    0 0 1,15 * * cd /path/to/project && python scripts/validate_new_launches.py

Discrepancy tolerance:
- total_units: +/- 5 units → Flag for review
- indicative_psf: +/- $50 → Use average, note range
- developer: Exact match → Flag immediately

Usage:
    python scripts/validate_new_launches.py
    python scripts/validate_new_launches.py --json    # Output as JSON
    python scripts/validate_new_launches.py --notify  # Send notification on discrepancies
"""
import argparse
import sys
import os
import json

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from app import create_app
from models.database import db
from services.new_launch_scraper import validate_new_launches


def main():
    parser = argparse.ArgumentParser(
        description='Validate new launches data against fresh scrapes'
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output results as JSON'
    )
    parser.add_argument(
        '--notify',
        action='store_true',
        help='Send notification if discrepancies found (requires WEBHOOK_URL env)'
    )
    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose output'
    )

    args = parser.parse_args()

    # Create Flask app context
    app = create_app()

    with app.app_context():
        if not args.json:
            print(f"\n{'='*60}")
            print("New Launches Validation Job")
            print(f"{'='*60}")
            print(f"Running bi-weekly data validation...\n")

        # Run validation
        stats = validate_new_launches(db_session=db.session)

        if args.json:
            # Output as JSON for automation
            print(json.dumps(stats, indent=2, default=str))
        else:
            # Human-readable output
            print(f"\n{'='*60}")
            print("Validation Summary")
            print(f"{'='*60}")
            print(f"Projects validated: {stats.get('total_validated', 0)}")
            print(f"Discrepancies found: {stats.get('discrepancies_found', 0)}")
            print(f"Flagged for review: {stats.get('flagged_for_review', 0)}")

            if stats.get('discrepancies'):
                print(f"\nDiscrepancy Details:")
                for d in stats['discrepancies'][:10]:
                    print(f"\n  {d['project_name']}:")
                    for issue in d['issues']:
                        if issue.get('diff'):
                            print(f"    - {issue['field']}: {issue['source']} reports {issue['current']} (stored: {issue['stored']}, diff: {issue['diff']})")
                        else:
                            print(f"    - {issue['field']}: {issue['source']} reports '{issue['current']}' vs stored '{issue['stored']}'")

                if len(stats['discrepancies']) > 10:
                    print(f"\n  ... and {len(stats['discrepancies']) - 10} more projects with discrepancies")

            print(f"\n{'='*60}")
            print("Validation Complete")
            print(f"{'='*60}\n")

        # Send notification if requested
        if args.notify and stats.get('discrepancies_found', 0) > 0:
            _send_notification(stats)

        # Exit with error code if discrepancies found (for CI/CD)
        if stats.get('discrepancies_found', 0) > 0:
            sys.exit(1)


def _send_notification(stats):
    """Send notification about discrepancies (e.g., to Slack/Discord webhook)."""
    import requests

    webhook_url = os.environ.get('WEBHOOK_URL')
    if not webhook_url:
        print("Warning: WEBHOOK_URL not set, skipping notification")
        return

    message = {
        "text": f"🚨 New Launches Validation Alert",
        "blocks": [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*New Launches Validation Alert*\n\n"
                            f"• Projects validated: {stats.get('total_validated', 0)}\n"
                            f"• Discrepancies found: {stats.get('discrepancies_found', 0)}\n"
                            f"• Flagged for review: {stats.get('flagged_for_review', 0)}\n\n"
                            f"Please review flagged projects."
                }
            }
        ]
    }

    try:
        response = requests.post(webhook_url, json=message, timeout=10)
        response.raise_for_status()
        print("Notification sent successfully")
    except Exception as e:
        print(f"Failed to send notification: {e}")


if __name__ == '__main__':
    main()
