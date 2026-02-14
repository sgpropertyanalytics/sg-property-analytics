"""
Shared manifest.json updater for AI context snapshot services.

Used by demographics_service, economic_indicators_service, and sora_service
to update docs/ai-context/manifest.json timestamps after refreshing data.
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict

logger = logging.getLogger(__name__)

MANIFEST_FILE = Path(__file__).parent.parent.parent / "docs" / "ai-context" / "manifest.json"


def update_manifest(
    file_key: str,
    new_entry: Optional[Dict] = None,
) -> None:
    """
    Update manifest.json timestamp for the given file key.

    If the key doesn't exist and new_entry is provided, creates it.
    If the key exists, updates updated_at and last_verified_at.

    Args:
        file_key: The manifest key, e.g. "snapshot/demographics.md"
        new_entry: Optional dict for creating a new entry if key is missing.
    """
    try:
        if not MANIFEST_FILE.exists():
            return

        with open(MANIFEST_FILE, "r") as f:
            manifest = json.load(f)

        today = datetime.now().strftime("%Y-%m-%d")

        if file_key not in manifest.get("files", {}):
            if new_entry:
                new_entry["updated_at"] = today
                new_entry["last_verified_at"] = today
                manifest.setdefault("files", {})[file_key] = new_entry
        else:
            manifest["files"][file_key]["updated_at"] = today
            manifest["files"][file_key]["last_verified_at"] = today

        with open(MANIFEST_FILE, "w") as f:
            json.dump(manifest, f, indent=2)
            f.write("\n")

        logger.info(f"Updated manifest.json timestamp for {file_key}")
    except Exception as e:
        logger.warning(f"Failed to update manifest: {e}")
