#!/usr/bin/env python3
"""
AI Context Refresh Script - Entry point for cron jobs

Refreshes all AI context data from external sources:
- Economic indicators (CPI, GDP, unemployment, HDB index, income)
- Demographics (population, buyer profiles)
- Interest rates (SORA)

Usage:
    python -m backend.scripts.refresh_ai_context
    python backend/scripts/refresh_ai_context.py
    python backend/scripts/refresh_ai_context.py --only sora
    python backend/scripts/refresh_ai_context.py --only economic
    python backend/scripts/refresh_ai_context.py --only demographics

Schedule recommendations:
    - SORA: Weekly (rates are relatively stable)
    - Economic: Weekly (catches monthly/quarterly updates)
    - Demographics: Monthly (annual data, infrequent updates)

Exit Codes:
    0: All refreshes successful
    1: One or more refreshes failed
"""

import argparse
import logging
import sys
import os
from datetime import datetime

# Add backend to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def refresh_economic_indicators() -> bool:
    """Refresh CPI, GDP, unemployment, HDB index, income data."""
    try:
        from services.economic_indicators_service import refresh_economic_indicators as refresh
        logger.info("Refreshing economic indicators...")
        success = refresh()
        logger.info(f"Economic indicators: {'SUCCESS' if success else 'FAILED'}")
        return success
    except Exception as e:
        logger.error(f"Economic indicators refresh error: {e}")
        return False


def refresh_demographics() -> bool:
    """Refresh population and demographics data."""
    try:
        from services.demographics_service import refresh_demographics as refresh
        logger.info("Refreshing demographics...")
        success = refresh()
        logger.info(f"Demographics: {'SUCCESS' if success else 'FAILED'}")
        return success
    except Exception as e:
        logger.error(f"Demographics refresh error: {e}")
        return False


def refresh_sora() -> bool:
    """Refresh SORA interest rates."""
    try:
        from services.sora_service import refresh_sora_rates as refresh
        logger.info("Refreshing SORA rates...")
        success = refresh()
        logger.info(f"SORA rates: {'SUCCESS' if success else 'FAILED'}")
        return success
    except Exception as e:
        logger.error(f"SORA refresh error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Refresh AI context data from external sources"
    )
    parser.add_argument(
        "--only",
        choices=["economic", "demographics", "sora", "all"],
        default="all",
        help="Which data source to refresh (default: all)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be refreshed without actually doing it"
    )
    args = parser.parse_args()

    logger.info(f"=== AI Context Refresh Started at {datetime.now().isoformat()} ===")
    logger.info(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    logger.info(f"Target: {args.only}")

    if args.dry_run:
        if args.only in ("all", "economic"):
            logger.info("[DRY RUN] Would refresh: Economic indicators (CPI, GDP, unemployment, HDB, income)")
        if args.only in ("all", "demographics"):
            logger.info("[DRY RUN] Would refresh: Demographics (population)")
        if args.only in ("all", "sora"):
            logger.info("[DRY RUN] Would refresh: SORA interest rates")
        logger.info("=== Dry run complete ===")
        return 0

    results = {}

    if args.only in ("all", "economic"):
        results["economic"] = refresh_economic_indicators()

    if args.only in ("all", "demographics"):
        results["demographics"] = refresh_demographics()

    if args.only in ("all", "sora"):
        results["sora"] = refresh_sora()

    # Summary
    logger.info("=== Refresh Summary ===")
    all_success = True
    for name, success in results.items():
        status = "✓ SUCCESS" if success else "✗ FAILED"
        logger.info(f"  {name}: {status}")
        if not success:
            all_success = False

    if all_success:
        logger.info("=== All refreshes completed successfully ===")
        return 0
    else:
        logger.error("=== Some refreshes failed ===")
        return 1


if __name__ == "__main__":
    sys.exit(main())
