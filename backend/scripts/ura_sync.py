#!/usr/bin/env python3
"""
URA Sync Script - Entry point for cron jobs

Usage:
    python -m scripts.ura_sync
    python scripts/ura_sync.py

Environment:
    URA_ACCESS_KEY: Required - URA API access key
    URA_SYNC_ENABLED: Optional - 'true' (default) or 'false' to disable
    URA_SYNC_MODE: Optional - 'shadow' (default), 'production', or 'dry_run'
    DATABASE_URL: Required - PostgreSQL connection string

Exit Codes:
    0: Success
    1: Failure (thresholds exceeded or error)
    2: Disabled via kill switch
"""

import sys
import os

# Add backend to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.ura_sync_engine import main

if __name__ == '__main__':
    main()
